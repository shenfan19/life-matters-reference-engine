// frontend/src/components/Simulator.tsx

import React, { useState, useEffect, useRef } from 'react';
import {
  Card, Button, Space, Progress, Statistic, Row, Col, InputNumber,
  message, Alert, Table, Divider, Tabs, Select
} from 'antd';
import {
  PlayCircleOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import type { SimulatorProps, SimulationDataPoint, SimulationState, DurationUnit, StepUnit } from '../types';

const API_BASE = '/api';

const Simulator: React.FC<SimulatorProps> = ({ selectedModel, state, setState, isLocked = false, isDarkMode }) => {
  const [internalSubPage, setInternalSubPage] = useState('3-1');
  const {
    status, progress, currentStep, /* totalSteps, */ simulationData,
    inputParams, stateVariables, sessionId,
    timeValue, timeUnit, stepValue, stepUnit, batchSize, updateInterval
  } = state;

  const setStatus = (val: SimulationState['status']) => setState(prev => ({ ...prev, status: val }));
  const setProgress = (val: number) => setState(prev => ({ ...prev, progress: val }));
  const setCurrentStep = (val: number) => setState(prev => ({ ...prev, currentStep: val }));
  const setTotalSteps = (val: number) => setState(prev => ({ ...prev, totalSteps: val }));
  const setSimulationData = (val: SimulationDataPoint[] | ((prev: SimulationDataPoint[]) => SimulationDataPoint[])) =>
    setState(prev => ({ ...prev, simulationData: typeof val === 'function' ? val(prev.simulationData) : val }));
  const setInputParams = (val: Record<string, number>) => setState(prev => ({ ...prev, inputParams: val }));
  const setStateVariables = (val: Record<string, number>) => setState(prev => ({ ...prev, stateVariables: val }));
  const setSessionId = (val: string) => setState(prev => ({ ...prev, sessionId: val }));
  const setTimeValue = (val: number) => setState(prev => ({ ...prev, timeValue: val }));
  const setTimeUnit = (val: DurationUnit) => setState(prev => ({ ...prev, timeUnit: val }));
  const setStepValue = (val: number) => setState(prev => ({ ...prev, stepValue: val }));
  const setStepUnit = (val: StepUnit) => setState(prev => ({ ...prev, stepUnit: val }));
  const setBatchSize = (val: number) => setState(prev => ({ ...prev, batchSize: val }));
  const isRunningRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const TIME_UNITS: Record<DurationUnit, number> = { year: 8760, month: 720, day: 24, hour: 1 };
  const STEP_UNITS: Record<StepUnit, number> = { day: 86400, hour: 3600, minute: 60, second: 1 };

  useEffect(() => {
    if (selectedModel?.content?.variables) {
      const inputs: Record<string, number> = {};
      const states: Record<string, number> = {};
      Object.entries(selectedModel.content.variables).forEach(([name, data]: [string, any]) => {
        if (data.type === 'input') inputs[name] = data.value;
        else if (data.type === 'state') states[name] = data.value;
      });
      setInputParams(inputs);
      setStateVariables(states);
    }
    if (selectedModel?.content?.simulator) {
      const sim = selectedModel.content.simulator;
      setStepValue(sim.step_size || 3600);
      setStepUnit('second');
      setTimeValue((sim.total_time || 86400) / 3600);
      setTimeUnit('day');
    }
  }, [selectedModel]);

  const startSimulation = async () => {
    if (!selectedModel) return;
    try {
      setStatus('running');
      setProgress(0);
      setCurrentStep(0);
      setSimulationData([]);
      isRunningRef.current = true;
      const finalTimeHours = timeValue * TIME_UNITS[timeUnit];
      const finalStepSeconds = stepValue * STEP_UNITS[stepUnit];
      const response = await fetch(`${API_BASE}/simulation/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: selectedModel.content!.metadata.name,
          folder: selectedModel.folder,
          time_hours: finalTimeHours,
          step_size: finalStepSeconds,
          input_params: inputParams
        })
      });
      const result = await response.json();
      if (result.success && result.data) {
        setSessionId(result.data.session_id);
        setTotalSteps(result.data.total_steps);
        runSimulationBatch(result.data.session_id);
      } else {
        message.error(result.error || '启动失败');
        setStatus('idle');
        isRunningRef.current = false;
      }
    } catch (error: any) {
      message.error(`错误: ${error.message}`);
      setStatus('idle');
      isRunningRef.current = false;
    }
  };

  const runSimulationBatch = async (sid: string) => {
    const loop = async () => {
      if (!isRunningRef.current) return;
      try {
        const response = await fetch(`${API_BASE}/simulation/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sid, steps: batchSize, input_changes: {} })
        });
        const result = await response.json();
        if (result.success && result.data) {
          setCurrentStep(result.data.current_step);
          setProgress(result.data.progress);
          setSimulationData(prev => [...prev, ...result.data.outputs]);
          if (result.data.completed) {
            setStatus('completed');
            isRunningRef.current = false;
            message.success('已完成');
          } else {
            setTimeout(loop, updateInterval);
          }
        }
      } catch (error: any) {
        setStatus('idle');
        isRunningRef.current = false;
      }
    };
    loop();
  };

  const pauseSimulation = () => { isRunningRef.current = false; setStatus('paused'); };
  const resetSimulation = () => { isRunningRef.current = false; setStatus('idle'); setProgress(0); setCurrentStep(0); setSimulationData([]); };
  const exportCSV = async () => {
    if (!sessionId) return;
    try {
      const resp = await fetch(`${API_BASE}/simulation/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId }) });
      const res = await resp.json();
      if (res.success) message.success('已导出');
    } catch (e: any) { message.error(e.message); }
  };

  useEffect(() => {
    if (!canvasRef.current || simulationData.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const outputVars = selectedModel?.content?.simulator?.output_variables || Object.keys(stateVariables).slice(0, 3);
    const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1'];
    outputVars.forEach((varName: string, idx: number) => {
      const values = simulationData.map(d => d[varName] || 0);
      const maxVal = Math.max(...values.map(Math.abs), 1);
      ctx.strokeStyle = colors[idx % colors.length];
      ctx.lineWidth = 2;
      ctx.beginPath();
      const xScale = (canvas.width - 50) / Math.max(simulationData.length, 1);
      const yScale = (canvas.height - 40) / (2 * maxVal);
      simulationData.forEach((data, i) => {
        const x = 40 + i * xScale;
        const y = canvas.height / 2 - (data[varName] || 0) * yScale;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }, [simulationData, selectedModel, stateVariables]);

  const latestData = simulationData[simulationData.length - 1] || { step: 0, time: 0 };

  const renderInputPanel = () => {
    if (!selectedModel?.content?.variables) return null;
    const inputVars = Object.entries(selectedModel.content.variables)
      .filter(([_, data]: [string, any]) => data.type === 'input')
      .map(([name, data]: [string, any]) => ({ name, ...data }));
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        {inputVars.map((v: any) => (
          <Row key={v.name} gutter={8} align="middle">
            <Col span={8}><div style={{ fontWeight: 600, fontSize: '13px' }}>{v.name}</div></Col>
            <Col span={12}><InputNumber value={inputParams[v.name] || v.value} onChange={(val) => setInputParams({ ...inputParams, [v.name]: val || 0 })} style={{ width: '100%' }} size="small" /></Col>
            <Col span={4}><span style={{ fontSize: '12px', opacity: 0.6 }}>{v.unit}</span></Col>
          </Row>
        ))}
      </Space>
    );
  };

  const renderStatePanel = () => {
    const outputVars = selectedModel?.content?.simulator?.output_variables || Object.keys(stateVariables);
    return (
      <Row gutter={[8, 8]}>
        {outputVars.map((varName: string, idx: number) => (
          <Col span={8} key={idx}>
            <div style={{ padding: '8px', background: isDarkMode ? '#0f172a' : '#f8fafc', border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, borderRadius: 2 }}>
              <div style={{ fontSize: '11px', color: isDarkMode ? '#94a3b8' : '#64748b' }}>{varName}</div>
              <div style={{ fontSize: '16px', fontWeight: 600 }}>{(latestData[varName] || 0).toFixed(4)}</div>
            </div>
          </Col>
        ))}
      </Row>
    );
  };

  const renderDataTable = () => {
    const columns = simulationData.length > 0 ? Object.keys(simulationData[0]).map(key => ({ title: key, dataIndex: key, key, render: (val: any) => typeof val === 'number' ? val.toFixed(4) : val })) : [];
    return <Table columns={columns} dataSource={simulationData.slice(-50)} pagination={false} size="small" scroll={{ y: 200 }} rowKey="step" />;
  };

  const durationSelector = (
    <Select value={timeUnit} onChange={setTimeUnit} style={{ width: 80 }} options={[
      { label: 'Hour', value: 'hour' }, { label: 'Day', value: 'day' }, { label: 'Month', value: 'month' }, { label: 'Year', value: 'year' }
    ]} />
  );

  const stepSelector = (
    <Select value={stepUnit} onChange={setStepUnit} style={{ width: 80 }} options={[
      { label: 'Sec', value: 'second' }, { label: 'Min', value: 'minute' }, { label: 'Hour', value: 'hour' }, { label: 'Day', value: 'day' }
    ]} />
  );

  const renderRunSimulation = () => (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card title={<span style={{ fontWeight: 600, fontSize: '14px' }}>仿真控制中心</span>} size="small" style={{ borderRadius: 2, border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, background: isDarkMode ? '#1e293b' : '#ffffff' }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {!isLocked ? (
            <Alert message="模型未就绪：请先在 Loader 页面验证并锁定模型" type="warning" showIcon />
          ) : (
            <Alert message={status === 'running' ? "仿真运行中..." : "就绪 (Ready)"} type={status === 'running' ? "success" : "info"} showIcon />
          )}
          <Row gutter={16}>
            <Col span={8}><div style={{ fontSize: '12px', marginBottom: 4 }}>时长</div><InputNumber value={timeValue} onChange={v => setTimeValue(v || 1)} addonAfter={durationSelector} style={{ width: '100%' }} /></Col>
            <Col span={8}><div style={{ fontSize: '12px', marginBottom: 4 }}>步长</div><InputNumber value={stepValue} onChange={v => setStepValue(v || 1)} addonAfter={stepSelector} style={{ width: '100%' }} /></Col>
            <Col span={8}><div style={{ fontSize: '12px', marginBottom: 4 }}>批次</div><InputNumber value={batchSize} onChange={v => setBatchSize(v || 1)} style={{ width: '100%' }} /></Col>
          </Row>
          <Space>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={startSimulation} disabled={!isLocked || status === 'running'}>{status === 'running' ? '运行中' : '启动'}</Button>
            <Button onClick={pauseSimulation} disabled={status !== 'running'}>暂停</Button>
            <Button danger onClick={resetSimulation}>重置</Button>
            <Button icon={<DownloadOutlined />} onClick={exportCSV} disabled={simulationData.length === 0}>导出</Button>
          </Space>
          <Progress percent={progress} strokeColor={isDarkMode ? '#38bdf8' : '#0f172a'} />
          <Row gutter={8}>
            <Col span={12}><Statistic title="当前步" value={currentStep} valueStyle={{ fontSize: '14px' }} /></Col>
            <Col span={12}><Statistic title="状态" value={status.toUpperCase()} valueStyle={{ fontSize: '14px' }} /></Col>
          </Row>
        </Space>
      </Card>

      <Card title={<span style={{ fontWeight: 600, fontSize: '13px' }}>输入 / 输出 实时监控</span>} size="small" style={{ borderRadius: 2, border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, background: isDarkMode ? '#1e293b' : '#ffffff' }}>
        <Row gutter={24}>
          <Col span={12}>
            <Divider orientation="left" style={{ marginTop: 0 }}><span style={{ fontSize: '12px' }}>输入参数</span></Divider>
            {renderInputPanel()}
          </Col>
          <Col span={12}>
            <Divider orientation="left" style={{ marginTop: 0 }}><span style={{ fontSize: '12px' }}>实时输出</span></Divider>
            {renderStatePanel()}
          </Col>
        </Row>

        <Divider style={{ margin: '24px 0' }} />

        <div style={{ padding: '0 8px' }}>
          <div style={{ marginBottom: 12, fontWeight: 600, fontSize: '12px', color: isDarkMode ? '#94a3b8' : '#64748b' }}>趋势图表</div>
          <canvas ref={canvasRef} width={800} height={300} style={{ width: '100%', height: 'auto', background: isDarkMode ? '#0f172a' : '#fff', border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, borderRadius: 4 }} />

          <div style={{ margin: '24px 0 12px 0', fontWeight: 600, fontSize: '12px', color: isDarkMode ? '#94a3b8' : '#64748b' }}>数据详情 (最近50条)</div>
          {renderDataTable()}
        </div>
      </Card>
    </Space>
  );

  const renderRealTimeMonitor = () => (
    <div style={{ padding: '40px', textAlign: 'center', opacity: 0.5 }}>
      <h3>备用板块</h3>
      <p>此处内容已整合至"参数控制仿真"标签页下。</p>
    </div>
  );

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Tabs activeKey={internalSubPage} onChange={setInternalSubPage} items={[
          { key: '3-1', label: '参数控制仿真', children: renderRunSimulation() },
          { key: '3-2', label: '备用', children: renderRealTimeMonitor() }
        ]} />
      </Space>
    </div>
  );
};

export default Simulator;