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
import type { OptimizerProps, OptimizerState, StepUnit } from '../types';
import { Input } from 'antd';

const API_BASE = '/api';

const Optimizer: React.FC<OptimizerProps> = ({ selectedModel, state, setState, isLocked = false, isDarkMode }) => {
  const [internalSubPage, setInternalSubPage] = useState('4-1');
  const {
    status, progress, optimizationData,
    inputParams,
    simStartDate, simEndDate, stepValue, stepUnit, batchSize, updateInterval
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
  const setSimStartDate = (val: string) => setState(prev => ({ ...prev, simStartDate: val }));
  const setSimEndDate = (val: string) => setState(prev => ({ ...prev, simEndDate: val }));
  const setStepValue = (val: number) => setState(prev => ({ ...prev, stepValue: val }));
  const setStepUnit = (val: StepUnit) => setState(prev => ({ ...prev, stepUnit: val }));
  const setBatchSize = (val: number) => setState(prev => ({ ...prev, batchSize: val }));
  const isRunningRef = useRef(false);

  const STEP_UNITS: Record<string, number> = { day: 86400, hour: 3600, minute: 60, second: 1 };
  const dateToHours = (s: string, e: string) =>
    Math.max(0, (new Date(e + 'T00:00:00').getTime() - new Date(s + 'T00:00:00').getTime()) / 3_600_000);

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
      if (stepValue === 3600) {
        setStepValue(sim.step_size || 3600);
        setStepUnit('second');
        const base = '2000-01-01';
        const d = new Date(base + 'T00:00:00');
        d.setSeconds(d.getSeconds() + Math.round(sim.total_time || 86400));
        setSimStartDate(base);
        setSimEndDate(d.toISOString().slice(0, 10));
      }
    }
  }, [selectedModel]);

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
      const finalTimeHours = dateToHours(simStartDate, simEndDate);
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
      <Card title={<span style={{ fontWeight: 600, fontSize: '14px' }}>优化参数配置</span>} size="small" style={{ borderRadius: 4, border: `1px solid ${isDarkMode ? '#1e3824' : '#c8e6c9'}`, background: isDarkMode ? '#111f16' : '#ffffff' }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {!isLocked && <Alert message="模型未锁定" type="warning" showIcon />}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: '12px', marginBottom: 4 }}>时间范围</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Input size="small" value={simStartDate} placeholder="YYYY-MM-DD"
                  onChange={e => setSimStartDate(e.target.value)}
                  style={{ width: 105, fontFamily: 'monospace' }} />
                <span style={{ color: '#999', fontSize: 11 }}>~</span>
                <Input size="small" value={simEndDate} placeholder="YYYY-MM-DD"
                  onChange={e => setSimEndDate(e.target.value)}
                  style={{ width: 105, fontFamily: 'monospace' }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', marginBottom: 4 }}>步长</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <Select size="small" value={stepUnit} onChange={handleStepUnitChange} options={[{ label: '分', value: 'minute' }, { label: '秒', value: 'second' }]} style={{ width: 60 }} />
                <InputNumber size="small" value={stepValue} onChange={v => setStepValue(v || 1)} style={{ width: 70 }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', marginBottom: 4 }}>强度</div>
              <InputNumber size="small" value={batchSize} onChange={v => setBatchSize(v || 1)} style={{ width: 70 }} />
            </div>
          </div>
          <Space>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={startOptimization} disabled={!isLocked || status === 'running'}>开始优化</Button>
            <Button onClick={() => { isRunningRef.current = false; setStatus('paused'); }} disabled={status !== 'running'}>暂停</Button>
            <Button danger onClick={() => { isRunningRef.current = false; setStatus('idle'); setProgress(0); setOptimizationData([]); }}>重置</Button>
          </Space>
          <Progress percent={progress} strokeColor={isDarkMode ? '#52c41a' : '#007A33'} />
        </Space>
      </Card>

      {Object.keys(inputParams).length > 0 && (
        <Card title={<span style={{ fontWeight: 600, fontSize: '13px' }}>控制变量</span>} size="small" style={{ borderRadius: 4, border: `1px solid ${isDarkMode ? '#1e3824' : '#c8e6c9'}`, background: isDarkMode ? '#111f16' : '#ffffff' }}>
          <Row gutter={[16, 16]}>
            {Object.entries(inputParams).map(([name, value]) => (
              <Col span={8} key={name}>
                <div style={{ fontSize: '12px', marginBottom: 4, color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.45)' }}>{name}</div>
                <InputNumber value={value} onChange={v => setInputParams({ ...inputParams, [name]: Number(v) || 0 })} style={{ width: '100%' }} size="small" />
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {optimizationData.length > 0 && (
        <Card title={<span style={{ fontWeight: 600, fontSize: '13px' }}>迭代动态</span>} size="small" style={{ borderRadius: 4, border: `1px solid ${isDarkMode ? '#1e3824' : '#c8e6c9'}`, background: isDarkMode ? '#111f16' : '#ffffff' }}>
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
