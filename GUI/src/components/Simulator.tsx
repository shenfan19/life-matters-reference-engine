// frontend/src/components/Simulator.tsx
// 创建日期: 2025-01-XX
// 功能: 仿真器组件 - 支持实时仿真、批量运行、实时曲线、CSV 导出
// 修改记录:
// 1. API_BASE 使用 '/api' (由 Vite 代理转发到 Flask)
// 2. 导入类型从 types.ts
// 3. 实现三个子页面: 运行仿真、实时监控、历史记录

import React, { useEffect, useRef } from 'react';
import {
  Card, Button, Space, Progress, Statistic, Row, Col, InputNumber,
  message, Alert, Table, Select, Divider
} from 'antd';
import {
  PlayCircleOutlined,
  PauseOutlined,
  StopOutlined,
  DownloadOutlined,
  ClockCircleOutlined,
  SyncOutlined
} from '@ant-design/icons';
import type { SimulatorProps, SimulationDataPoint, ModelFile, SimulationState, DurationUnit, StepUnit } from '../types';

const API_BASE = '/api';  // 相对路径，由 Vite 代理处理

const Simulator: React.FC<SimulatorProps> = ({ subPage, selectedModel, state, setState }) => {
  const {
    status, progress, currentStep, totalSteps, simulationData,
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
  const setUpdateInterval = (val: number) => setState(prev => ({ ...prev, updateInterval: val }));

  const isRunningRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 单位换算常量
  const TIME_UNITS: Record<DurationUnit, number> = { year: 8760, month: 720, day: 24, hour: 1 };
  const STEP_UNITS: Record<StepUnit, number> = { day: 86400, hour: 3600, minute: 60, second: 1 };

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

      // 自动设置较好的显示单位
      setStepValue(defaultStep);
      setStepUnit('second');

      setTimeValue(defaultTotal / 3600);
      setTimeUnit('day'); // 默认显示为天，后续单位换算处理
    }
  }, [selectedModel]);

  // 处理单位切换 - 自动换算数值
  const handleTimeUnitChange = (newUnit: 'year' | 'month' | 'day' | 'hour') => {
    let hours = timeValue * (TIME_UNITS[timeUnit] || 1);
    let newValue = hours / (TIME_UNITS[newUnit] || 1);
    setState((prev: SimulationState) => ({ ...prev, timeUnit: newUnit, timeValue: Number(newValue.toFixed(2)) }));
  };

  const handleStepUnitChange = (newUnit: 'day' | 'hour' | 'minute' | 'second') => {
    let seconds = stepValue * (STEP_UNITS[stepUnit] || 1);
    let newValue = seconds / (STEP_UNITS[newUnit] || 1);
    setState((prev: SimulationState) => ({ ...prev, stepUnit: newUnit, stepValue: Number(newValue.toFixed(2)) }));
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
      setSimulationData([]);
      isRunningRef.current = true;

      // 单位换算
      const finalTimeHours = timeValue * TIME_UNITS[timeUnit];
      const finalStepSeconds = stepValue * STEP_UNITS[stepUnit];

      // 调用后端启动仿真
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

        // 更新初始状态
        const initialStates: Record<string, number> = {};
        Object.entries(data.initial_state).forEach(([name, info]: [string, any]) => {
          if (info.type === 'state' || info.type === 'parameter') {
            initialStates[name] = info.value;
          }
        });
        setStateVariables(initialStates);

        message.success('仿真已启动');

        // 开始批量执行循环
        runSimulationBatch(data.session_id);
      } else {
        message.error(result.error || '启动仿真失败');
        setStatus('idle');
        isRunningRef.current = false;
      }
    } catch (error: any) {
      message.error(`启动仿真失败: ${error.message}`);
      setStatus('idle');
      isRunningRef.current = false;
    }
  };

  // 批量执行仿真循环
  const runSimulationBatch = async (sid: string) => {
    const loop = async () => {
      if (!isRunningRef.current) return;

      try {
        const response = await fetch(`${API_BASE}/simulation/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sid,
            steps: batchSize,
            input_changes: {}
          })
        });

        const result = await response.json();

        if (result.success && result.data) {
          const data = result.data;

          setCurrentStep(data.current_step);
          setProgress(data.progress);

          // 更新状态变量
          const newStates: Record<string, number> = {};
          Object.entries(data.final_state).forEach(([name, info]: [string, any]) => {
            if (info.type === 'state' || info.type === 'parameter') {
              newStates[name] = info.value;
            }
          });
          setStateVariables(newStates);

          // 批量添加数据点
          setSimulationData(prev => [...prev, ...data.outputs]);

          // 检查是否完成
          if (data.completed) {
            setStatus('completed');
            isRunningRef.current = false;
            message.success('仿真已完成');
          } else {
            // 继续下一步
            setTimeout(loop, updateInterval);
          }
        } else {
          setStatus('idle');
          isRunningRef.current = false;
          message.error(result.error || '仿真执行失败');
        }
      } catch (error: any) {
        setStatus('idle');
        isRunningRef.current = false;
        message.error(`执行错误: ${error.message}`);
      }
    };

    loop();
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

  // 停止仿真
  const stopSimulation = () => {
    isRunningRef.current = false;
  };

  // 重置仿真
  const resetSimulation = async () => {
    stopSimulation();

    if (sessionId) {
      try {
        const response = await fetch(`${API_BASE}/simulation/reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId })
        });

        const result = await response.json();

        if (result.success && result.data) {
          // 更新状态
          const initialStates: Record<string, number> = {};
          Object.entries(result.data.initial_state).forEach(([name, info]: [string, any]) => {
            if (info.type === 'state') {
              initialStates[name] = info.value;
            }
          });
          setStateVariables(initialStates);
        }
      } catch (error: any) {
        message.error(`重置失败: ${error.message}`);
      }
    }

    setStatus('idle');
    setProgress(0);
    setCurrentStep(0);
    setSimulationData([]);
    message.success('仿真已重置');
  };

  // 导出CSV
  const exportCSV = async () => {
    if (!sessionId || simulationData.length === 0) {
      message.warning('暂无数据可导出');
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
        message.success(`CSV 文件已保存到: ${result.data.csv_path}`);
      } else {
        message.error('导出失败');
      }
    } catch (error: any) {
      message.error(`导出失败: ${error.message}`);
    }
  };

  // 绘制实时曲线
  useEffect(() => {
    if (!canvasRef.current || simulationData.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制坐标轴
    ctx.strokeStyle = '#d9d9d9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 10);
    ctx.lineTo(40, canvas.height - 30);
    ctx.lineTo(canvas.width - 10, canvas.height - 30);
    ctx.stroke();

    // 获取输出变量
    const outputVars = selectedModel?.content?.simulator?.output_variables ||
      Object.keys(stateVariables).slice(0, 3);
    const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1'];

    // 绘制每个变量的曲线
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

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // 绘制图例
      ctx.fillStyle = colors[idx % colors.length];
      ctx.fillRect(canvas.width - 120, 20 + idx * 20, 15, 10);
      ctx.fillStyle = '#666';
      ctx.font = '12px Arial';
      ctx.fillText(varName, canvas.width - 100, 28 + idx * 20);
    });

    // 绘制标签
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.fillText('时间 (s)', canvas.width - 50, canvas.height - 10);

  }, [simulationData, selectedModel, stateVariables]);

  // 获取最新数据
  const latestData = simulationData[simulationData.length - 1] || { step: 0, time: 0 };

  // 渲染输入参数面板
  const renderInputPanel = () => {
    if (!selectedModel?.content?.variables) {
      return <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>请先选择模型</div>;
    }

    const inputVars = Object.entries(selectedModel.content.variables)
      .filter(([_, data]: [string, any]) => data.type === 'input')
      .map(([name, data]: [string, any]) => ({ name, ...data }));

    if (inputVars.length === 0) {
      return <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>该模型无输入变量</div>;
    }

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        {inputVars.map((v: any) => (
          <Row key={v.name} gutter={8} align="middle">
            <Col span={8}>
              <div style={{ fontWeight: 'bold' }}>{v.name}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{v.description}</div>
            </Col>
            <Col span={12}>
              <InputNumber
                value={inputParams[v.name] || v.value}
                onChange={(val) => setInputParams({ ...inputParams, [v.name]: val || 0 })}
                min={v.bounds?.[0]}
                max={v.bounds?.[1]}
                step={0.1}
                style={{ width: '100%' }}
                disabled={status === 'running'}
                addonAfter={v.unit}
              />
            </Col>
            <Col span={4}>
              <div style={{ fontSize: 12, color: '#999' }}>
                [{v.bounds?.[0]}, {v.bounds?.[1]}]
              </div>
            </Col>
          </Row>
        ))}
      </Space>
    );
  };

  // 渲染状态变量面板
  const renderStatePanel = () => {
    const outputVars = selectedModel?.content?.simulator?.output_variables ||
      Object.keys(stateVariables);

    return (
      <Row gutter={[16, 16]}>
        {outputVars.map((varName: string, idx: number) => {
          const varData = selectedModel?.content?.variables?.[varName] || {};
          return (
            <Col span={8} key={idx}>
              <Card size="small" style={{ background: '#f0f7ff' }}>
                <Statistic
                  title={varData.description || varName}
                  value={latestData[varName] || stateVariables[varName] || 0}
                  precision={4}
                  suffix={varData.unit}
                  valueStyle={{ color: ['#1890ff', '#52c41a', '#faad14', '#f5222d'][idx % 4] }}
                />
              </Card>
            </Col>
          );
        })}
      </Row>
    );
  };

  // 渲染数据表格
  const renderDataTable = () => {
    const columns = simulationData.length > 0 ? Object.keys(simulationData[0]).map(key => ({
      title: key,
      dataIndex: key,
      key,
      render: (val: number) => typeof val === 'number' ? val.toFixed(4) : val,
    })) : [];

    return (
      <Table
        columns={columns}
        dataSource={simulationData.slice(-100)} // 只显示最后100行
        pagination={{ pageSize: 10 }}
        size="small"
        scroll={{ y: 300 }}
        rowKey={(record) => `${record.step}`}
      />
    );
  };

  // 根据子页面渲染内容
  const renderSubPage = () => {
    if (!selectedModel) {
      return (
        <Alert
          message="未选择模型"
          description="请先在 Loader 模块中选择一个模型文件"
          type="info"
          showIcon
        />
      );
    }

    switch (subPage) {
      case '3-1': // 运行仿真
        return renderRunSimulation();
      case '3-2': // 实时监控
        return renderRealTimeMonitor();
      case '3-3': // 历史记录
        return renderHistory();
      default:
        return renderRunSimulation();
    }
  };

  // 运行仿真页面
  const renderRunSimulation = () => (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* 状态提示 */}
      {status === 'idle' && (
        <Alert message="系统待命" description="配置参数后点击开始按钮启动仿真" type="info" showIcon />
      )}
      {status === 'running' && (
        <Alert message="仿真运行中" description={`当前进度: ${currentStep}/${totalSteps} 步`} type="success" showIcon />
      )}
      {status === 'paused' && (
        <Alert message="仿真已暂停" description="点击继续按钮恢复仿真" type="warning" showIcon />
      )}
      {status === 'completed' && (
        <Alert message="仿真已完成" description="可以查看结果或重新开始" type="success" showIcon />
      )}

      {/* 控制面板 */}
      <Card title="仿真控制">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* 仿真参数配置 */}
          <Row gutter={16} align="bottom">
            <Col span={8}>
              <div style={{ marginBottom: 8, fontWeight: 'bold' }}>仿真总时长</div>
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
              <div style={{ marginBottom: 8, fontWeight: 'bold' }}>时间步长 (dt)</div>
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
              <div style={{ marginBottom: 8, fontWeight: 'bold' }}>总步数</div>
              <InputNumber
                value={totalSteps || Math.floor((timeValue * TIME_UNITS[timeUnit] * 3600) / (stepValue * STEP_UNITS[stepUnit]))}
                disabled
                style={{ width: '100%', background: '#f5f5f5' }}
              />
            </Col>
            <Col span={5}>
              <div style={{ marginBottom: 8, fontWeight: 'bold' }}>性能选项</div>
              <Space wrap>
                <span>批处理</span>
                <InputNumber
                  value={batchSize}
                  onChange={v => setBatchSize(v || 1)}
                  min={1} max={100} size="small"
                  disabled={status === 'running'}
                />
              </Space>
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }} />

          {/* 控制按钮 */}
          <Space wrap>
            {(status === 'idle' || status === 'paused' || status === 'completed') && (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={startSimulation}
                size="large"
              >
                {status === 'idle' ? '开始仿真' : status === 'completed' ? '重新开始' : '继续仿真'}
              </Button>
            )}
            {status === 'running' && (
              <Button
                icon={<PauseOutlined />}
                onClick={pauseSimulation}
                size="large"
              >
                暂停仿真
              </Button>
            )}
            <Button
              danger
              icon={<StopOutlined />}
              onClick={resetSimulation}
              disabled={status === 'idle'}
              size="large"
            >
              终止/重置
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={exportCSV}
              disabled={simulationData.length === 0}
            >
              导出 CSV
            </Button>
          </Space>

          <Progress
            percent={progress}
            status={status === 'running' ? 'active' : status === 'completed' ? 'success' : undefined}
            strokeColor={{ from: '#108ee9', to: '#87d068' }}
          />

          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title="当前步数"
                value={currentStep}
                suffix={`/ ${totalSteps}`}
                prefix={<ClockCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="仿真时间"
                value={latestData.time?.toFixed(2) || 0}
                suffix="s"
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="数据点数"
                value={simulationData.length}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="状态"
                value={
                  status === 'idle' ? '待命' :
                    status === 'running' ? '运行' :
                      status === 'paused' ? '暂停' :
                        '完成'
                }
                valueStyle={{
                  color: status === 'running' ? '#3f8600' :
                    status === 'paused' ? '#faad14' :
                      status === 'completed' ? '#1890ff' : '#666'
                }}
              />
            </Col>
          </Row>
        </Space>
      </Card>

      {/* 输入参数 */}
      <Card title="输入参数配置">
        {renderInputPanel()}
      </Card>

      {/* 状态变量实时显示 */}
      <Card title="状态变量 (实时)">
        {renderStatePanel()}
      </Card>
    </Space>
  );

  // 实时监控页面
  const renderRealTimeMonitor = () => (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card title="实时曲线监控">
        <div style={{ textAlign: 'center' }}>
          <canvas
            ref={canvasRef}
            width={1000}
            height={400}
            style={{ border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff' }}
          />
        </div>
      </Card>

      <Card title="变量状态">
        {renderStatePanel()}
      </Card>

      <Card title="数据表格 (最近100行)">
        {renderDataTable()}
      </Card>
    </Space>
  );

  // 历史记录页面
  const renderHistory = () => (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card title="仿真历史记录">
        <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
          历史记录功能开发中...
          <div style={{ marginTop: 16 }}>
            将显示过往的仿真运行记录、参数配置和结果对比
          </div>
        </div>
      </Card>
    </Space>
  );

  return renderSubPage();
};

export default Simulator;