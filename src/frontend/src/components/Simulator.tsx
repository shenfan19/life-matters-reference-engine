// frontend/src/components/Simulator.tsx

import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Space, Progress, Statistic, Row, Col, InputNumber, message, Alert, Table, Tabs } from 'antd';
import { 
  PlayCircleOutlined, 
  PauseOutlined, 
  StopOutlined,
  DownloadOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';

interface SimulatorProps {
  subPage: string;
  selectedModel: any;
}

interface SimulationData {
  step: number;
  time: number;
  [key: string]: number;
}

const Simulator: React.FC<SimulatorProps> = ({ subPage, selectedModel }) => {
  const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle');
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(1440);
  const [simulationData, setSimulationData] = useState<SimulationData[]>([]);
  const [inputParams, setInputParams] = useState<Record<string, number>>({});
  const [stateVariables, setStateVariables] = useState<Record<string, number>>({});
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 初始化参数
  useEffect(() => {
    if (selectedModel?.variables) {
      const inputs: Record<string, number> = {};
      const states: Record<string, number> = {};
      
      Object.entries(selectedModel.variables).forEach(([name, data]: [string, any]) => {
        if (data.type === 'input') {
          inputs[name] = data.value;
        } else if (data.type === 'state') {
          states[name] = data.value;
        }
      });
      
      setInputParams(inputs);
      setStateVariables(states);
    }
    
    if (selectedModel?.simulator) {
      setTotalSteps(selectedModel.simulator.total_time / (selectedModel.simulator.step_size || 1));
    }
  }, [selectedModel]);

  // 开始仿真
  const startSimulation = () => {
    if (!selectedModel) {
      message.error('请先在 Loader 中选择一个模型');
      return;
    }

    if (status === 'idle' || status === 'completed') {
      setProgress(0);
      setCurrentStep(0);
      setSimulationData([]);
      // 重置状态变量
      if (selectedModel?.variables) {
        const states: Record<string, number> = {};
        Object.entries(selectedModel.variables).forEach(([name, data]: [string, any]) => {
          if (data.type === 'state') {
            states[name] = data.value;
          }
        });
        setStateVariables(states);
      }
    }
    setStatus('running');
    
    const stepSize = selectedModel?.simulator?.step_size || 1;
    const outputVars = selectedModel?.simulator?.output_variables || Object.keys(stateVariables);
    
    intervalRef.current = setInterval(() => {
      setCurrentStep(prev => {
        const next = prev + 1;
        if (next >= totalSteps) {
          stopSimulation();
          setStatus('completed');
          message.success('仿真完成！');
          return totalSteps;
        }
        
        // 模拟状态变量更新（实际应调用公式计算）
        const newStates = { ...stateVariables };
        Object.keys(newStates).forEach(key => {
          // 简单的模拟：添加随机波动
          newStates[key] = newStates[key] + (Math.random() - 0.5) * 0.01;
        });
        setStateVariables(newStates);
        
        // 记录输出数据
        const dataPoint: SimulationData = {
          step: next,
          time: next * stepSize,
        };
        outputVars.forEach((varName: string) => {
          dataPoint[varName] = newStates[varName] || 0;
        });
        
        setSimulationData(prev => [...prev, dataPoint]);
        setProgress(Math.round((next / totalSteps) * 100));
        
        return next;
      });
    }, 100); // 每100ms一步
  };

  // 暂停仿真
  const pauseSimulation = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setStatus('paused');
    message.info('仿真已暂停');
  };

  // 停止仿真
  const stopSimulation = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // 重置仿真
  const resetSimulation = () => {
    stopSimulation();
    setStatus('idle');
    setProgress(0);
    setCurrentStep(0);
    setSimulationData([]);
    message.success('仿真已重置');
  };

  // 导出CSV
  const exportCSV = () => {
    if (simulationData.length === 0) {
      message.warning('暂无数据可导出');
      return;
    }

    const headers = Object.keys(simulationData[0]);
    const csvContent = [
      headers.join(','),
      ...simulationData.map(row => headers.map(h => row[h]).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulation_${Date.now()}.csv`;
    a.click();
    
    message.success('CSV 文件已导出');
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
    const outputVars = selectedModel?.simulator?.output_variables || Object.keys(stateVariables).slice(0, 3);
    const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1'];
    
    // 绘制每个变量的曲线
    outputVars.forEach((varName: string, idx: number) => {
      const values = simulationData.map(d => d[varName] || 0);
      const maxVal = Math.max(...values.map(Math.abs), 1);
      
      ctx.strokeStyle = colors[idx % colors.length];
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      const xScale = (canvas.width - 50) / simulationData.length;
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
    if (!selectedModel?.variables) {
      return <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>请先选择模型</div>;
    }

    const inputVars = Object.entries(selectedModel.variables)
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
    const outputVars = selectedModel?.simulator?.output_variables || Object.keys(stateVariables);
    
    return (
      <Row gutter={[16, 16]}>
        {outputVars.map((varName: string, idx: number) => {
          const varData = selectedModel?.variables?.[varName] || {};
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