// frontend/src/components/Simulator.tsx
// 优化版本 - 支持连续运行直到完成或暂停
// frontend/src/components/Simulator.tsx
// 优化版本 - 支持连续运行直到完成或暂停

import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Space, Progress, Statistic, Row, Col, InputNumber, message, Alert, Table, Slider } from 'antd';
import { 
  PlayCircleOutlined, 
  PauseOutlined, 
  StopOutlined,
  DownloadOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import type { SimulatorProps, SimulationDataPoint, ModelFile } from '../types';

const API_BASE = '/api';

const Simulator: React.FC<SimulatorProps> = ({ subPage, selectedModel }) => {
  const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle');
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(1440);
  const [simulationData, setSimulationData] = useState<SimulationDataPoint[]>([]);
  const [inputParams, setInputParams] = useState<Record<string, number>>({});
  const [stateVariables, setStateVariables] = useState<Record<string, number>>({});
  const [sessionId, setSessionId] = useState<string>('');
  const [timeHours, setTimeHours] = useState(8760);
  const [stepSize, setStepSize] = useState(3600);
  
  // 新增：批量执行参数
  const [batchSize, setBatchSize] = useState(10); // 每次执行10步
  const [updateInterval, setUpdateInterval] = useState(100); // 每100ms更新一次
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isRunningRef = useRef(false); // 用于控制循环

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
      setStepSize(sim.step_size || 3600);
      const totalTime = sim.total_time || 31536000;
      setTotalSteps(Math.floor(totalTime / (sim.step_size || 3600)));
      setTimeHours(totalTime / 3600);
    }
  }, [selectedModel]);

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

      // 调用后端启动仿真
      const response = await fetch(`${API_BASE}/simulation/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: selectedModel.content!.metadata.name,
          folder: selectedModel.folder,
          time_hours: timeHours,
          step_size: stepSize,
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
          if (info.type === 'state') {
            initialStates[name] = info.value;
          }
        });
        setStateVariables(initialStates);
        
        message.success('仿真已启动');
        
        // ✅ 新方案：使用批量执行
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
          setSimulationData(prev => [...prev, ...data.outputs]);
          
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

  // 重置仿真
  const resetSimulation = async () => {
    stopSimulation();
    
    if (sessionId) {
      try {
        await fetch(`${API_BASE}/simulation/reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId })
        });
        
        setStatus('idle');
        setProgress(0);
        setCurrentStep(0);
        setSimulationData([]);
        message.success('仿真已重置');
      } catch (error: any) {
        message.error(`重置失败: ${error.message}`);
      }
    } else {
      setStatus('idle');
      setProgress(0);
      setCurrentStep(0);
      setSimulationData([]);
    }
  };

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
      <Card title="⚙️ 仿真参数" size="small">
        <Row gutter={16}>
          <Col span={8}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>仿真时长（小时）</div>
              <InputNumber
                min={1}
                max={87600}
                value={timeHours}
                onChange={v => setTimeHours(v || 8760)}
                disabled={status === 'running'}
                style={{ width: '100%' }}
              />
            </div>
          </Col>
          <Col span={8}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>时间步长（秒）</div>
              <InputNumber
                min={1}
                max={86400}
                value={stepSize}
                onChange={v => setStepSize(v || 3600)}
                disabled={status === 'running'}
                style={{ width: '100%' }}
              />
            </div>
          </Col>
          <Col span={8}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>总步数</div>
              <InputNumber
                value={totalSteps}
                disabled
                style={{ width: '100%' }}
              />
            </div>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>批量大小（每次执行步数）</div>
              <Slider
                min={1}
                max={100}
                value={batchSize}
                onChange={setBatchSize}
                disabled={status === 'running'}
                marks={{ 1: '1', 10: '10', 50: '50', 100: '100' }}
              />
            </div>
          </Col>
          <Col span={12}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>更新间隔（毫秒）</div>
              <Slider
                min={50}
                max={1000}
                value={updateInterval}
                onChange={setUpdateInterval}
                disabled={status === 'running'}
                marks={{ 50: '50ms', 100: '100ms', 500: '500ms', 1000: '1s' }}
              />
            </div>
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
                  onChange={v => setInputParams({ ...inputParams, [name]: v || 0 })}
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
            onClick={resetSimulation}
            disabled={status === 'idle'}
            danger
          >
            重置
          </Button>
          
          <Button
            size="large"
            icon={<DownloadOutlined />}
            onClick={exportData}
            disabled={simulationData.length === 0}
          >
            导出 CSV
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
      {Object.keys(stateVariables).length > 0 && (
        <Card title="📈 状态变量（实时）" size="small">
          <Row gutter={[16, 16]}>
            {Object.entries(stateVariables).map(([name, value]) => (
              <Col span={6} key={name}>
                <Statistic
                  title={name}
                  value={value}
                  precision={2}
                  valueStyle={{ fontSize: 20 }}
                />
              </Col>
            ))}
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

export default Simulator;
