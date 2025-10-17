// frontend/src/components/Optimizer.tsx

import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Form, 
  Select, 
  InputNumber, 
  Button, 
  Space, 
  Table, 
  Radio,
  Row,
  Col,
  Alert,
  Tag,
  Progress,
  Statistic,
  Descriptions,
  message,
  Divider,
  Tabs
} from 'antd';
import { 
  PlayCircleOutlined, 
  LineChartOutlined,
  SettingOutlined,
  ExperimentOutlined
} from '@ant-design/icons';

interface OptimizerProps {
  subPage: string;
  selectedModel: any;
}

interface OptimizationResult {
  iteration: number;
  objective: number;
  variables: Record<string, number>;
  feasible: boolean;
}

const Optimizer: React.FC<OptimizerProps> = ({ subPage, selectedModel }) => {
  const [form] = Form.useForm();
  const [optimizing, setOptimizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<OptimizationResult[]>([]);
  
  const [config, setConfig] = useState({
    objectiveType: 'minimize' as 'minimize' | 'maximize',
    objectiveFunction: '',
    algorithm: 'grid',
    maxIterations: 100,
    duration: 60.0,
    populationSize: 50,
  });

  const [variablesToOptimize, setVariablesToOptimize] = useState<string[]>([]);
  const [optimizationTargets, setOptimizationTargets] = useState<string[]>([]);

  // 初始化优化配置
  useEffect(() => {
    if (selectedModel?.optimizer) {
      setConfig({
        ...config,
        algorithm: selectedModel.optimizer.method || 'grid',
        duration: selectedModel.optimizer.duration || 60.0,
        populationSize: selectedModel.optimizer.pop_size || 50,
      });
      
      if (selectedModel.optimizer.variables_to_optimize) {
        setVariablesToOptimize(selectedModel.optimizer.variables_to_optimize);
      }
      
      if (selectedModel.optimizer.targets_of_optimization) {
        setOptimizationTargets(selectedModel.optimizer.targets_of_optimization);
        setConfig(prev => ({ ...prev, objectiveFunction: selectedModel.optimizer.targets_of_optimization[0] }));
      }
    }
  }, [selectedModel]);

  // 获取可优化的变量列表
  const getOptimizableVariables = () => {
    if (!selectedModel?.variables) return [];
    return Object.entries(selectedModel.variables)
      .filter(([_, data]: [string, any]) => data.type === 'parameters' || data.type === 'state')
      .map(([name]) => name);
  };

  // 获取可作为目标的变量列表
  const getTargetVariables = () => {
    if (!selectedModel?.variables) return [];
    return Object.entries(selectedModel.variables)
      .filter(([_, data]: [string, any]) => data.type === 'state')
      .map(([name]) => name);
  };

  // 开始优化
  const startOptimization = () => {
    if (!selectedModel) {
      message.error('请先在 Loader 中选择一个模型');
      return;
    }

    if (variablesToOptimize.length === 0) {
      message.error('请至少选择一个要优化的变量');
      return;
    }

    if (!config.objectiveFunction) {
      message.error('请选择优化目标函数');
      return;
    }

    setOptimizing(true);
    setProgress(0);
    setResults([]);

    let iteration = 0;
    const maxIter = config.maxIterations;
    
    // 模拟优化过程
    const interval = setInterval(() => {
      iteration++;
      
      // 生成模拟结果
      const objective = config.objectiveType === 'minimize' 
        ? 100 - iteration * 0.8 + Math.random() * 10
        : iteration * 0.8 + Math.random() * 10;
      
      const vars: Record<string, number> = {};
      variablesToOptimize.forEach(varName => {
        const varData = selectedModel?.variables?.[varName];
        if (varData?.bounds) {
          const [min, max] = varData.bounds;
          vars[varName] = min + Math.random() * (max - min);
        } else {
          vars[varName] = Math.random() * 100;
        }
      });
      
      setResults(prev => [...prev, {
        iteration,
        objective,
        variables: vars,
        feasible: Math.random() > 0.1,
      }]);
      
      setProgress(Math.round((iteration / maxIter) * 100));
      
      if (iteration >= maxIter) {
        clearInterval(interval);
        setOptimizing(false);
        message.success('优化完成！');
      }
    }, 100);
  };

  // 停止优化
  const stopOptimization = () => {
    setOptimizing(false);
    message.info('优化已停止');
  };

  // 最优结果
  const bestResult = results.reduce((best, current) => {
    if (!best) return current;
    if (config.objectiveType === 'minimize') {
      return current.objective < best.objective ? current : best;
    } else {
      return current.objective > best.objective ? current : best;
    }
  }, results[0]);

  // 结果表格列
  const resultColumns = [
    { title: '迭代次数', dataIndex: 'iteration', key: 'iteration', width: 100 },
    { 
      title: '目标函数值', 
      dataIndex: 'objective', 
      key: 'objective',
      render: (val: number) => val.toFixed(6),
      width: 150,
    },
    {
      title: '可行性',
      dataIndex: 'feasible',
      key: 'feasible',
      width: 100,
      render: (feasible: boolean) => (
        <Tag color={feasible ? 'success' : 'error'}>
          {feasible ? '可行' : '不可行'}
        </Tag>
      ),
    },
    ...variablesToOptimize.map(varName => ({
      title: varName,
      key: varName,
      render: (record: OptimizationResult) => record.variables[varName]?.toFixed(4) || '-',
    })),
  ];

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
      case '4-1': // 参数优化
        return renderParameterOptimization();
      case '4-2': // 多目标优化
        return renderMultiObjectiveOptimization();
      case '4-3': // 优化历史
        return renderOptimizationHistory();
      default:
        return renderParameterOptimization();
    }
  };

  // 参数优化页面
  const renderParameterOptimization = () => (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* 状态提示 */}
      {optimizing && (
        <Alert 
          message="优化进行中" 
          description={`当前迭代: ${results.length} / ${config.maxIterations}`}
          type="info" 
          showIcon 
        />
      )}

      {/* 优化配置 */}
      <Card title={<><SettingOutlined /> 优化配置</>}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="优化目标">
                <Radio.Group 
                  value={config.objectiveType}
                  onChange={(e) => setConfig({ ...config, objectiveType: e.target.value })}
                >
                  <Radio value="minimize">最小化</Radio>
                  <Radio value="maximize">最大化</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="目标函数">
                <Select
                  value={config.objectiveFunction}
                  onChange={(val) => setConfig({ ...config, objectiveFunction: val })}
                  options={getTargetVariables().map(v => ({ value: v, label: v }))}
                  placeholder="选择目标变量"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="优化算法">
                <Select
                  value={config.algorithm}
                  onChange={(val) => setConfig({ ...config, algorithm: val })}
                  options={[
                    { value: 'grid', label: '网格搜索 (Grid)' },
                    { value: 'genetic', label: '遗传算法 (GA)' },
                    { value: 'pso', label: '粒子群优化 (PSO)' },
                    { value: 'gradient', label: '梯度下降' },
                    { value: 'simulated', label: '模拟退火' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="最大迭代次数">
                <InputNumber 
                  value={config.maxIterations}
                  onChange={(val) => setConfig({ ...config, maxIterations: val || 100 })}
                  min={10}
                  max={1000}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="持续时间 (秒)">
                <InputNumber 
                  value={config.duration}
                  onChange={(val) => setConfig({ ...config, duration: val || 60 })}
                  min={10}
                  max={3600}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="种群大小">
                <InputNumber 
                  value={config.populationSize}
                  onChange={(val) => setConfig({ ...config, populationSize: val || 50 })}
                  min={10}
                  max={200}
                  style={{ width: '100%' }}
                  disabled={config.algorithm !== 'genetic' && config.algorithm !== 'pso'}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="选择要优化的变量">
            <Select
              mode="multiple"
              value={variablesToOptimize}
              onChange={setVariablesToOptimize}
              options={getOptimizableVariables().map(v => ({ value: v, label: v }))}
              placeholder="选择变量"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Card>

      {/* 变量范围 */}
      {variablesToOptimize.length > 0 && (
        <Card title="优化变量范围">
          <Space direction="vertical" style={{ width: '100%' }}>
            {variablesToOptimize.map(varName => {
              const varData = selectedModel?.variables?.[varName] || {};
              return (
                <Row key={varName} gutter={8} align="middle">
                  <Col span={6}>
                    <div style={{ fontWeight: 'bold' }}>{varName}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>{varData.description}</div>
                  </Col>
                  <Col span={6}>
                    <Tag color="blue">初值: {varData.value}</Tag>
                  </Col>
                  <Col span={12}>
                    <div style={{ fontSize: 12 }}>
                      范围: [{varData.bounds?.[0] || 0}, {varData.bounds?.[1] || 100}] {varData.unit}
                    </div>
                  </Col>
                </Row>
              );
            })}
          </Space>
        </Card>
      )}

      {/* 控制按钮 */}
      <Card>
        <Space>
          <Button 
            type="primary" 
            size="large"
            icon={<PlayCircleOutlined />}
            onClick={startOptimization}
            disabled={optimizing}
          >
            开始优化
          </Button>
          <Button 
            danger
            size="large"
            onClick={stopOptimization}
            disabled={!optimizing}
          >
            停止优化
          </Button>
        </Space>
        {optimizing && (
          <div style={{ marginTop: 16 }}>
            <Progress percent={progress} status="active" />
          </div>
        )}
      </Card>

      {/* 优化结果 */}
      {results.length > 0 && (
        <>
          <Row gutter={16}>
            <Col span={6}>
              <Card>
                <Statistic 
                  title="迭代次数" 
                  value={results.length}
                  prefix={<LineChartOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic 
                  title={config.objectiveType === 'minimize' ? '最小值' : '最大值'}
                  value={bestResult?.objective || 0}
                  precision={4}
                  valueStyle={{ color: '#3f8600' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic 
                  title="可行解数量" 
                  value={results.filter(r => r.feasible).length}
                  suffix={`/ ${results.length}`}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic 
                  title="收敛率" 
                  value={progress}
                  suffix="%"
                />
              </Card>
            </Col>
          </Row>

          {bestResult && (
            <Card title="最优解详情">
              <Descriptions bordered column={2}>
                <Descriptions.Item label="迭代次数" span={1}>
                  {bestResult.iteration}
                </Descriptions.Item>
                <Descriptions.Item label="目标函数值" span={1}>
                  <Tag color="green">{bestResult.objective?.toFixed(6)}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="可行性" span={2}>
                  <Tag color={bestResult.feasible ? 'success' : 'error'}>
                    {bestResult.feasible ? '可行解' : '不可行'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="优化变量" span={2}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {Object.entries(bestResult.variables || {}).map(([key, value]) => (
                      <div key={key}>
                        <Tag color="purple">{key}</Tag> = {value.toFixed(4)}
                      </div>
                    ))}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          )}

          <Card title="优化历史">
            <Table 
              columns={resultColumns}
              dataSource={results}
              pagination={{ pageSize: 10 }}
              size="small"
              scroll={{ x: 'max-content', y: 400 }}
            />
          </Card>
        </>
      )}
    </Space>
  );

  // 多目标优化页面
  const renderMultiObjectiveOptimization = () => (
    <Card title="多目标优化">
      <Alert
        message="多目标优化"
        description="此功能支持同时优化多个目标函数（如最小化成本的同时最大化性能），使用 NSGA-II 等算法"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
        多目标优化功能开发中...
        <div style={{ marginTop: 16 }}>
          将支持帕累托前沿分析、多目标权重配置等
        </div>
      </div>
    </Card>
  );

  // 优化历史页面
  const renderOptimizationHistory = () => (
    <Card title="优化历史记录">
      <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
        历史记录功能开发中...
        <div style={{ marginTop: 16 }}>
          将显示过往的优化任务、参数配置和结果对比
        </div>
      </div>
    </Card>
  );

  return renderSubPage();
};

export default Optimizer;