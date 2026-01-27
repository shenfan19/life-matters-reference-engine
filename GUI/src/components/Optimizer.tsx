// frontend/src/components/Simulator.tsx
// 优化版本 - 支持连续运行直到完成或暂停
// frontend/src/components/Simulator.tsx
// 优化版本 - 支持连续运行直到完成或暂停

import React, { useEffect, useRef } from 'react';
import {
  Card, Button, Space, Progress, Statistic, Row, Col, InputNumber,
  message, Alert, Select
} from 'antd';
import {
  PlayCircleOutlined,
  PauseOutlined,
  StopOutlined,
  DownloadOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import type { OptimizerProps, OptimizerState, DurationUnit, StepUnit } from '../types';

const API_BASE = '/api';

const Optimizer: React.FC<OptimizerProps> = ({ subPage, selectedModel, state, setState }) => {
  const {
    status, progress, currentStep, totalSteps, optimizationData,
    inputParams, stateVariables, sessionId,
    timeValue, timeUnit, stepValue, stepUnit, batchSize, updateInterval
  } = state;

  const setStatus = (val: OptimizerState['status']) => setState((prev: OptimizerState) => ({ ...prev, status: val }));
  const setProgress = (val: number) => setState((prev: OptimizerState) => ({ ...prev, progress: val }));
  const setCurrentStep = (val: number) => setState((prev: OptimizerState) => ({ ...prev, currentStep: val }));
  const setTotalSteps = (val: number) => setState((prev: OptimizerState) => ({ ...prev, totalSteps: val }));
  const setOptimizationData = (val: any[] | ((p: any[]) => any[])) =>
    setState((prev: OptimizerState) => ({ ...prev, optimizationData: typeof val === 'function' ? val(prev.optimizationData) : val }));
  const setInputParams = (val: Record<string, number>) => setState((prev: OptimizerState) => ({ ...prev, inputParams: val }));
  const setStateVariables = (val: Record<string, number>) => setState((prev: OptimizerState) => ({ ...prev, stateVariables: val }));
  const setSessionId = (val: string) => setState((prev: OptimizerState) => ({ ...prev, sessionId: val }));
  const setTimeValue = (val: number) => setState((prev: OptimizerState) => ({ ...prev, timeValue: val }));
  const setTimeUnit = (val: DurationUnit) => setState((prev: OptimizerState) => ({ ...prev, timeUnit: val }));
  const setStepValue = (val: number) => setState((prev: OptimizerState) => ({ ...prev, stepValue: val }));
  const setStepUnit = (val: StepUnit) => setState((prev: OptimizerState) => ({ ...prev, stepUnit: val }));
  const setBatchSize = (val: number) => setState((prev: OptimizerState) => ({ ...prev, batchSize: val }));

  const isRunningRef = useRef(false);
  const intervalRef = useRef<any>(null);

  // 单位换算常量
  const TIME_UNITS: Record<string, number> = { year: 8760, month: 720, day: 24, hour: 1 };
  const STEP_UNITS: Record<string, number> = { day: 86400, hour: 3600, minute: 60, second: 1 };

  // 初始化参数
  useEffect(() => {
    if (selectedModel?.content?.variables) {
      const inputs: Record<string, number> = {};
      const states: Record<string, number> = {};

      Object.entries(selectedModel.content.variables).forEach(([name, data]: [string, any]) => {
        if (data.type === 'input') {
          inputs[name] = data.value;
        } else if (data.type === 'state') {
          states[name] = data.value;
        }
      });

      setInputParams(inputs);
      setStateVariables(states);
    }

    if (selectedModel?.content?.simulator) {
      const sim = selectedModel.content.simulator;
      const defaultStep = sim.step_size || 3600;
      const defaultTotal = sim.total_time || 86400;

      // 如果尚未设置过值，则从模型同步
      if (timeValue === 30 && stepValue === 3600) {
        setStepValue(defaultStep);
        setStepUnit('second');
        setTimeValue(defaultTotal / 3600);
        setTimeUnit('day');
      }
    }
  }, [selectedModel]);

  // 处理单位切换 - 自动换算数值
  const handleTimeUnitChange = (newUnit: DurationUnit) => {
    let hours = timeValue * (TIME_UNITS[timeUnit] || 1);
    let newValue = hours / (TIME_UNITS[newUnit] || 1);
    setState((prev: OptimizerState) => ({ ...prev, timeUnit: newUnit, timeValue: Number(newValue.toFixed(2)) }));
  };

  const handleStepUnitChange = (newUnit: StepUnit) => {
    let seconds = stepValue * (STEP_UNITS[stepUnit] || 1);
    let newValue = seconds / (STEP_UNITS[newUnit] || 1);
    setState((prev: OptimizerState) => ({ ...prev, stepUnit: newUnit, stepValue: Number(newValue.toFixed(2)) }));
  };

  // 启动仿真
  const startSimulation = async () => {
    if (!selectedModel) {
      message.error('请先在 Loader 中选择一个模型');
      return;
    }

    try {
      setStatus('running');
      setProgress(0);
      setCurrentStep(0);
      setOptimizationData([]);
      isRunningRef.current = true;

      // 暂时调用 simulation/start 流程进行闭环优化演示
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
        const data = result.data;
        setSessionId(data.session_id);
        setTotalSteps(data.total_steps);
        message.success('优化进程已启动');
        runOptimizationBatch(data.session_id);
      } else {
        message.error(result.error || '启动优化失败');
        setStatus('idle');
        isRunningRef.current = false;
      }
    } catch (error: any) {
      message.error(`启动优化失败: ${error.message}`);
      setStatus('idle');
      isRunningRef.current = false;
    }
  };

  const runOptimizationBatch = async (sid: string) => {
    // 逻辑同 Simulation，但展示优化相关的中间结果
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
          const data = result.data;
          setCurrentStep(data.current_step);
          setProgress(data.progress);
          setOptimizationData(prev => [...prev, ...data.outputs]);
          if (data.completed) {
            setStatus('completed');
            isRunningRef.current = false;
            message.success('优化任务已完成');
          } else {
            setTimeout(loop, updateInterval);
          }
        } else {
          setStatus('idle');
          isRunningRef.current = false;
        }
      } catch (e) {
        setStatus('idle');
        isRunningRef.current = false;
      }
    };
    loop();
  };

  // ✅ 新方案：批量执行仿真
  const runSimulationBatch = async (sid: string) => {
    const executeBatch = async () => {
      if (!isRunningRef.current) {
        return; // 已暂停或停止
      }

      try {
        // 调用批量执行接口（一次执行多步）
        const response = await fetch(`${API_BASE}/simulation/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sid,
            steps: batchSize, // 一次执行N步
            input_changes: {}
          })
        });

        const result = await response.json();

        if (result.success && result.data) {
          const data = result.data;

          setCurrentStep(data.current_step);
          setProgress(data.progress);

          // 更新状态变量（使用最后一步的状态）
          const newStates: Record<string, number> = {};
          Object.entries(data.final_state).forEach(([name, info]: [string, any]) => {
            if (info.type === 'state') {
              newStates[name] = info.value;
            }
          });
          setStateVariables(newStates);

          // 添加所有数据点
          setOptimizationData(prev => [...prev, ...data.outputs]);

          // 检查是否完成
          if (data.completed) {
            stopSimulation();
            setStatus('completed');
            message.success(`仿真完成！共执行 ${data.current_step} 步`);
            return;
          }

          // 继续下一批
          if (isRunningRef.current) {
            setTimeout(executeBatch, updateInterval);
          }
        } else {
          stopSimulation();
          message.error(result.error || '仿真批量执行失败');
          setStatus('idle');
        }
      } catch (error: any) {
        stopSimulation();
        message.error(`仿真执行错误: ${error.message}`);
        setStatus('idle');
      }
    };

    // 开始执行
    executeBatch();
  };

  // 暂停仿真
  const pauseSimulation = async () => {
    isRunningRef.current = false;

    try {
      await fetch(`${API_BASE}/simulation/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
      setStatus('paused');
      message.info('仿真已暂停');
    } catch (error: any) {
      message.error(`暂停失败: ${error.message}`);
    }
  };

  // 继续仿真
  const resumeSimulation = () => {
    if (status === 'paused' && sessionId) {
      setStatus('running');
      isRunningRef.current = true;
      message.info('仿真继续');
      runSimulationBatch(sessionId);
    }
  };

  // 停止仿真
  const stopSimulation = () => {
    isRunningRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // 重置优化
  const resetOptimization = async () => {
    isRunningRef.current = false;
    setStatus('idle');
    setProgress(0);
    setCurrentStep(0);
    setOptimizationData([]);
    message.success('优化状态已重置');
  };

  // 导出数据

  // 导出数据
  const exportData = async () => {
    if (!sessionId) {
      message.error('没有可导出的数据');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/simulation/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });

      const result = await response.json();

      if (result.success && result.data) {
        message.success(`数据已导出到: ${result.data.csv_path}`);

        // 可选：触发下载
        // window.open(`${API_BASE}/download/${result.data.csv_path}`);
      } else {
        message.error('导出失败');
      }
    } catch (error: any) {
      message.error(`导出失败: ${error.message}`);
    }
  };

  // 渲染运行仿真页面
  const renderRunSimulation = () => (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* 模型信息 */}
      <Alert
        message={selectedModel ? `当前模型: ${selectedModel.name}` : '未选择模型'}
        description={selectedModel?.content?.metadata?.description || '请在 Loader 中选择模型'}
        type={selectedModel ? 'info' : 'warning'}
        showIcon
      />

      {/* 参数设置 */}
      <Card title="⚙️ 优化配置" size="small">
        <Row gutter={16} align="bottom">
          <Col span={8}>
            <div style={{ marginBottom: 8, fontWeight: 'bold' }}>优化周期</div>
            <Space.Compact style={{ width: '100%' }}>
              <InputNumber
                value={timeValue}
                onChange={(val) => setTimeValue(val || 1)}
                min={1}
                style={{ width: '60%' }}
                disabled={status === 'running'}
              />
              <Select
                value={timeUnit}
                onChange={handleTimeUnitChange}
                style={{ width: '40%' }}
                disabled={status === 'running'}
              >
                <Select.Option value="year">年</Select.Option>
                <Select.Option value="month">月</Select.Option>
                <Select.Option value="day">日</Select.Option>
              </Select>
            </Space.Compact>
          </Col>
          <Col span={6}>
            <div style={{ marginBottom: 8, fontWeight: 'bold' }}>采样间隔</div>
            <Space.Compact style={{ width: '100%' }}>
              <InputNumber
                value={stepValue}
                onChange={(val) => setStepValue(val || 1)}
                min={0.001}
                style={{ width: '60%' }}
                disabled={status === 'running'}
              />
              <Select
                value={stepUnit}
                onChange={handleStepUnitChange}
                style={{ width: '40%' }}
                disabled={status === 'running'}
              >
                <Select.Option value="day">日</Select.Option>
                <Select.Option value="hour">时</Select.Option>
                <Select.Option value="minute">分</Select.Option>
                <Select.Option value="second">秒</Select.Option>
              </Select>
            </Space.Compact>
          </Col>
          <Col span={5}>
            <div style={{ marginBottom: 8, fontWeight: 'bold' }}>迭代步数</div>
            <InputNumber
              value={totalSteps || Math.floor((timeValue * TIME_UNITS[timeUnit] * 3600) / (stepValue * STEP_UNITS[stepUnit]))}
              disabled
              style={{ width: '100%', background: '#f5f5f5' }}
            />
          </Col>
          <Col span={5}>
            <div style={{ marginBottom: 8, fontWeight: 'bold' }}>运行强度</div>
            <Space wrap>
              <InputNumber
                value={batchSize}
                onChange={v => setBatchSize(v || 1)}
                min={1} max={100} size="small"
                disabled={status === 'running'}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 输入参数 */}
      {Object.keys(inputParams).length > 0 && (
        <Card title="📥 输入参数" size="small">
          <Row gutter={[16, 16]}>
            {Object.entries(inputParams).map(([name, value]) => (
              <Col span={8} key={name}>
                <div style={{ marginBottom: 8 }}>{name}</div>
                <InputNumber
                  value={value}
                  onChange={v => setInputParams({ ...inputParams, [name]: Number(v) || 0 })}
                  disabled={status === 'running'}
                  style={{ width: '100%' }}
                />
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* 控制按钮 */}
      <Card title="🎮 控制面板" size="small">
        <Space size="large" style={{ width: '100%', justifyContent: 'center' }}>
          {status === 'idle' || status === 'completed' ? (
            <Button
              type="primary"
              size="large"
              icon={<PlayCircleOutlined />}
              onClick={startSimulation}
              disabled={!selectedModel}
            >
              开始仿真
            </Button>
          ) : status === 'running' ? (
            <Button
              size="large"
              icon={<PauseOutlined />}
              onClick={pauseSimulation}
            >
              暂停
            </Button>
          ) : (
            <Button
              type="primary"
              size="large"
              icon={<PlayCircleOutlined />}
              onClick={resumeSimulation}
            >
              继续
            </Button>
          )}

          <Button
            size="large"
            icon={<StopOutlined />}
            onClick={resetOptimization}
            disabled={status === 'idle'}
            danger
          >
            停止
          </Button>

          <Button
            size="large"
            icon={<DownloadOutlined />}
            onClick={exportData}
            disabled={optimizationData.length === 0}
          >
            优化报告
          </Button>
        </Space>
      </Card>

      {/* 进度和状态 */}
      {status !== 'idle' && (
        <Card title="📊 运行状态" size="small">
          <Row gutter={16}>
            <Col span={8}>
              <Statistic
                title="当前步数"
                value={currentStep}
                suffix={`/ ${totalSteps}`}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="完成进度"
                value={progress}
                suffix="%"
                precision={2}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="状态"
                value={status === 'running' ? '运行中' : status === 'paused' ? '已暂停' : '已完成'}
                prefix={status === 'running' ? <SyncOutlined spin /> : <ClockCircleOutlined />}
              />
            </Col>
          </Row>

          <div style={{ marginTop: 16 }}>
            <Progress
              percent={progress}
              status={status === 'running' ? 'active' : status === 'completed' ? 'success' : 'normal'}
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068',
              }}
            />
          </div>
        </Card>
      )}

      {/* 状态变量 */}
      {optimizationData.length > 0 && (
        <Card title="🎯 优化迭代结果" size="small">
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Statistic
                title="已探索解空间"
                value={optimizationData.length}
                prefix={<ThunderboltOutlined />}
              />
            </Col>
          </Row>
        </Card>
      )}
    </Space>
  );

  // 根据子页面渲染内容
  switch (subPage) {
    case '3-1':
      return renderRunSimulation();
    case '3-2':
      return <div>实时监控（开发中）</div>;
    case '3-3':
      return <div>历史记录（开发中）</div>;
    default:
      return renderRunSimulation();
  }
};

export default Optimizer;
