// frontend/src/components/Optimizer.tsx

import React, { useState, useEffect, useRef } from 'react';
import {
  Card, Button, Space, Progress, Statistic, Row, Col, InputNumber,
  message, Alert, Select, Tabs
} from 'antd';
import {
  PlayCircleOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import type { OptimizerProps, OptimizerState, DurationUnit, StepUnit } from '../types';

const API_BASE = '/api';

const Optimizer: React.FC<OptimizerProps> = ({ selectedModel, state, setState, isLocked = false, isDarkMode }) => {
  const [internalSubPage, setInternalSubPage] = useState('4-1');
  const {
    status, progress, optimizationData,
    inputParams,
    timeValue, timeUnit, stepValue, stepUnit, batchSize, updateInterval
  } = state;

  const setStatus = (val: OptimizerState['status']) => setState(prev => ({ ...prev, status: val }));
  const setProgress = (val: number) => setState(prev => ({ ...prev, progress: val }));
  const setCurrentStep = (val: number) => setState(prev => ({ ...prev, currentStep: val }));
  const setTotalSteps = (val: number) => setState(prev => ({ ...prev, totalSteps: val }));
  const setOptimizationData = (val: any[] | ((prev: any[]) => any[])) =>
    setState(prev => ({ ...prev, optimizationData: typeof val === 'function' ? val(prev.optimizationData) : val }));
  const setInputParams = (val: Record<string, number>) => setState(prev => ({ ...prev, inputParams: val }));
  const setStateVariables = (val: Record<string, number>) => setState(prev => ({ ...prev, stateVariables: val }));
  const setSessionId = (val: string) => setState(prev => ({ ...prev, sessionId: val }));
  const setTimeValue = (val: number) => setState(prev => ({ ...prev, timeValue: val }));
  const setTimeUnit = (val: DurationUnit) => setState(prev => ({ ...prev, timeUnit: val }));
  const setStepValue = (val: number) => setState(prev => ({ ...prev, stepValue: val }));
  const setStepUnit = (val: StepUnit) => setState(prev => ({ ...prev, stepUnit: val }));
  const setBatchSize = (val: number) => setState(prev => ({ ...prev, batchSize: val }));
  const isRunningRef = useRef(false);

  const TIME_UNITS: Record<string, number> = { year: 8760, month: 720, day: 24, hour: 1 };
  const STEP_UNITS: Record<string, number> = { day: 86400, hour: 3600, minute: 60, second: 1 };

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
      if (timeValue === 30 && stepValue === 3600) {
        setStepValue(sim.step_size || 3600);
        setStepUnit('second');
        setTimeValue((sim.total_time || 86400) / 3600);
        setTimeUnit('day');
      }
    }
  }, [selectedModel]);

  const handleTimeUnitChange = (newUnit: DurationUnit) => {
    let hours = timeValue * (TIME_UNITS[timeUnit] || 1);
    let newValue = hours / (TIME_UNITS[newUnit] || 1);
    setTimeValue(Number(newValue.toFixed(2)));
    setTimeUnit(newUnit);
  };

  const handleStepUnitChange = (newUnit: StepUnit) => {
    let seconds = stepValue * (STEP_UNITS[stepUnit] || 1);
    let newValue = seconds / (STEP_UNITS[newUnit] || 1);
    setStepValue(Number(newValue.toFixed(2)));
    setStepUnit(newUnit);
  };

  const startOptimization = async () => {
    if (!selectedModel) return;
    try {
      setStatus('running');
      setProgress(0);
      setCurrentStep(0);
      setOptimizationData([]);
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
        runOptimizationBatch(result.data.session_id);
      } else {
        message.error(result.error || '失败');
        setStatus('idle');
        isRunningRef.current = false;
      }
    } catch (e: any) {
      message.error(e.message);
      setStatus('idle');
      isRunningRef.current = false;
    }
  };

  const runOptimizationBatch = async (sid: string) => {
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
          setOptimizationData(prev => [...prev, ...result.data.outputs]);
          if (result.data.completed) {
            setStatus('completed');
            isRunningRef.current = false;
            message.success('优化完成');
          } else {
            setTimeout(loop, updateInterval);
          }
        }
      } catch (e) {
        setStatus('idle');
        isRunningRef.current = false;
      }
    };
    loop();
  };

  const renderRunOptimization = () => (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card title={<span style={{ fontWeight: 600, fontSize: '14px' }}>优化参数配置</span>} size="small" style={{ borderRadius: 4, border: `1px solid ${isDarkMode ? '#135200' : '#d9f7be'}`, background: isDarkMode ? '#092b1a' : '#ffffff' }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {!isLocked && <Alert message="模型未锁定" type="warning" showIcon />}
          <Row gutter={16}>
            <Col span={8}><div style={{ fontSize: '12px', marginBottom: 4 }}>周期</div><Select value={timeUnit} onChange={handleTimeUnitChange} options={[{ label: '年', value: 'year' }, { label: '月', value: 'month' }, { label: '日', value: 'day' }]} /><InputNumber value={timeValue} onChange={v => setTimeValue(v || 1)} style={{ width: '100%' }} /></Col>
            <Col span={8}><div style={{ fontSize: '12px', marginBottom: 4 }}>间隔</div><Select value={stepUnit} onChange={handleStepUnitChange} options={[{ label: '分', value: 'minute' }, { label: '秒', value: 'second' }]} /><InputNumber value={stepValue} onChange={v => setStepValue(v || 1)} style={{ width: '100%' }} /></Col>
            <Col span={8}><div style={{ fontSize: '12px', marginBottom: 4 }}>强度</div><InputNumber value={batchSize} onChange={v => setBatchSize(v || 1)} style={{ width: '100%' }} /></Col>
          </Row>
          <Space>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={startOptimization} disabled={!isLocked || status === 'running'}>开始优化</Button>
            <Button onClick={() => { isRunningRef.current = false; setStatus('paused'); }} disabled={status !== 'running'}>暂停</Button>
            <Button danger onClick={() => { isRunningRef.current = false; setStatus('idle'); setProgress(0); setOptimizationData([]); }}>重置</Button>
          </Space>
          <Progress percent={progress} strokeColor={isDarkMode ? '#73d13d' : '#135200'} />
        </Space>
      </Card>

      {Object.keys(inputParams).length > 0 && (
        <Card title={<span style={{ fontWeight: 600, fontSize: '13px' }}>控制变量</span>} size="small" style={{ borderRadius: 4, border: `1px solid ${isDarkMode ? '#135200' : '#d9f7be'}`, background: isDarkMode ? '#092b1a' : '#ffffff' }}>
          <Row gutter={[16, 16]}>
            {Object.entries(inputParams).map(([name, value]) => (
              <Col span={8} key={name}>
                <div style={{ fontSize: '12px', marginBottom: 4, color: isDarkMode ? '#b7eb8f' : '#237804' }}>{name}</div>
                <InputNumber value={value} onChange={v => setInputParams({ ...inputParams, [name]: Number(v) || 0 })} style={{ width: '100%' }} size="small" />
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {optimizationData.length > 0 && (
        <Card title={<span style={{ fontWeight: 600, fontSize: '13px' }}>迭代动态</span>} size="small" style={{ borderRadius: 4, border: `1px solid ${isDarkMode ? '#135200' : '#d9f7be'}`, background: isDarkMode ? '#092b1a' : '#ffffff' }}>
          <Statistic title="已探索解空间" value={optimizationData.length} prefix={<ThunderboltOutlined />} valueStyle={{ fontSize: '20px' }} />
        </Card>
      )}
    </Space>
  );

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Tabs activeKey={internalSubPage} onChange={setInternalSubPage} items={[
          { key: '4-1', label: '运行优化', children: renderRunOptimization() },
          { key: '4-2', label: '收敛分析', children: <div style={{ padding: 24, textAlign: 'center' }}>收敛图像开发中...</div> }
        ]} />
      </Space>
    </div>
  );
};

export default Optimizer;
