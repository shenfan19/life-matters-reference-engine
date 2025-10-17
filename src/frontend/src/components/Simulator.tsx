// frontend/src/components/Simulator.tsx

import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Space, Progress, Statistic, Row, Col, Slider, Tabs, Alert, InputNumber } from 'antd';
import { 
  PlayCircleOutlined, 
  PauseOutlined, 
  StopOutlined,
  DownloadOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';

interface SimulatorProps {
  onStatusChange?: (status: 'idle' | 'running' | 'paused' | 'completed') => void;
}

interface SimulationData {
  time: number;
  displacement: number;
  stress: number;
  temperature: number;
  energy: number;
}

const Simulator: React.FC<SimulatorProps> = ({ onStatusChange }) => {
  const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle');
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps] = useState(100);
  const [simulationData, setSimulationData] = useState<SimulationData[]>([]);
  const [realTimeParams, setRealTimeParams] = useState({
    force: 1000,
    temperature: 25,
    damping: 0.05,
  });
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(status);
    }
  }, [status, onStatusChange]);

  const startSimulation = () => {
    if (status === 'idle' || status === 'completed') {
      setProgress(0);
      setCurrentStep(0);
      setSimulationData([]);
    }
    setStatus('running');
    
    intervalRef.current = setInterval(() => {
      setCurrentStep(prev => {
        const next = prev + 1;
        if (next >= totalSteps) {
          stopSimulation();
          setStatus('completed');
          return totalSteps;
        }
        
        const time = next * 0.1;
        const displacement = Math.sin(time * realTimeParams.force / 1000) * Math.exp(-realTimeParams.damping * time);
        const stress = displacement * 200 + Math.random() * 10;
        const temperature = realTimeParams.temperature + Math.random() * 5;
        const energy = displacement ** 2 * 100;
        
        setSimulationData(prev => [...prev, { time, displacement, stress, temperature, energy }]);
        setProgress(Math.round((next / totalSteps) * 100));
        
        return next;
      });
    }, 100);
  };

  const pauseSimulation = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setStatus('paused');
  };

  const stopSimulation = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const resetSimulation = () => {
    stopSimulation();
    setStatus('idle');
    setProgress(0);
    setCurrentStep(0);
    setSimulationData([]);
  };

  useEffect(() => {
    if (!canvasRef.current || simulationData.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = '#d9d9d9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 10);
    ctx.lineTo(40, canvas.height - 30);
    ctx.lineTo(canvas.width - 10, canvas.height - 30);
    ctx.stroke();
    
    ctx.strokeStyle = '#1890ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const maxDisplacement = Math.max(...simulationData.map(d => Math.abs(d.displacement)), 1);
    const xScale = (canvas.width - 50) / simulationData.length;
    const yScale = (canvas.height - 40) / (2 * maxDisplacement);
    
    simulationData.forEach((data, index) => {
      const x = 40 + index * xScale;
      const y = canvas.height / 2 - data.displacement * yScale;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.fillText('位移', 10, 15);
    ctx.fillText('时间', canvas.width - 30, canvas.height - 10);
    
  }, [simulationData]);

  const latestData = simulationData[simulationData.length - 1] || {
    time: 0,
    displacement: 0,
    stress: 0,
    temperature: 0,
    energy: 0,
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {status === 'idle' && (
        <Alert message="系统待命" description="请点击开始按钮启动仿真" type="info" showIcon />
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
              disabled={simulationData.length === 0}
            >
              导出结果
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
                value={latestData.time.toFixed(2)} 
                suffix="s"
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="计算速度" 
                value={status === 'running' ? 10 : 0} 
                suffix="步/秒"
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

      <Card title="实时参数调整">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Row gutter={16} align="middle">
            <Col span={4}>施加力 (N):</Col>
            <Col span={16}>
              <Slider 
                min={0}
                max={5000}
                value={realTimeParams.force}
                onChange={(val) => setRealTimeParams(prev => ({ ...prev, force: val }))}
                disabled={status !== 'running'}
              />
            </Col>
            <Col span={4}>
              <InputNumber 
                value={realTimeParams.force}
                onChange={(val) => setRealTimeParams(prev => ({ ...prev, force: val || 0 }))}
                disabled={status !== 'running'}
                style={{ width: '100%' }}
              />
            </Col>
          </Row>
          
          <Row gutter={16} align="middle">
            <Col span={4}>温度 (°C):</Col>
            <Col span={16}>
              <Slider 
                min={-50}
                max={500}
                value={realTimeParams.temperature}
                onChange={(val) => setRealTimeParams(prev => ({ ...prev, temperature: val }))}
                disabled={status !== 'running'}
              />
            </Col>
            <Col span={4}>
              <InputNumber 
                value={realTimeParams.temperature}
                onChange={(val) => setRealTimeParams(prev => ({ ...prev, temperature: val || 0 }))}
                disabled={status !== 'running'}
                style={{ width: '100%' }}
              />
            </Col>
          </Row>
          
          <Row gutter={16} align="middle">
            <Col span={4}>阻尼系数:</Col>
            <Col span={16}>
              <Slider 
                min={0}
                max={0.5}
                step={0.01}
                value={realTimeParams.damping}
                onChange={(val) => setRealTimeParams(prev => ({ ...prev, damping: val }))}
                disabled={status !== 'running'}
              />
            </Col>
            <Col span={4}>
              <InputNumber 
                value={realTimeParams.damping}
                onChange={(val) => setRealTimeParams(prev => ({ ...prev, damping: val || 0 }))}
                disabled={status !== 'running'}
                step={0.01}
                style={{ width: '100%' }}
              />
            </Col>
          </Row>
        </Space>
      </Card>

      <Card title="实时监控">
        <Tabs
          items={[
            {
              key: 'chart',
              label: '实时曲线',
              children: (
                <div style={{ textAlign: 'center' }}>
                  <canvas 
                    ref={canvasRef}
                    width={800}
                    height={300}
                    style={{ border: '1px solid #d9d9d9', borderRadius: 4 }}
                  />
                </div>
              ),
            },
            {
              key: 'data',
              label: '变量状态',
              children: (
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Card size="small">
                      <Statistic
                        title="位移"
                        value={latestData.displacement.toFixed(4)}
                        suffix="m"
                        precision={4}
                        valueStyle={{ color: '#1890ff' }}
                      />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small">
                      <Statistic
                        title="应力"
                        value={latestData.stress.toFixed(2)}
                        suffix="MPa"
                        precision={2}
                        valueStyle={{ color: '#52c41a' }}
                      />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small">
                      <Statistic
                        title="温度"
                        value={latestData.temperature.toFixed(1)}
                        suffix="°C"
                        precision={1}
                        valueStyle={{ color: '#faad14' }}
                      />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small">
                      <Statistic
                        title="能量"
                        value={latestData.energy.toFixed(2)}
                        suffix="J"
                        precision={2}
                        valueStyle={{ color: '#f5222d' }}
                      />
                    </Card>
                  </Col>
                </Row>
              ),
            },
          ]}
        />
      </Card>
    </Space>
  );
};

export default Simulator;