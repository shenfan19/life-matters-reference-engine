// frontend/src/components/Optimizer.tsx

import React, { useState } from 'react';
import { 
  Card, 
  Form, 
  Input, 
  Select, 
  InputNumber, 
  Button, 
  Space, 
  Table, 
  Radio, 
  Checkbox,
  Row,
  Col,
  Divider,
  Alert,
  Tag,
  Progress,
  Statistic,
  Descriptions,
  message
} from 'antd';
import { 
  PlayCircleOutlined, 
  PlusOutlined, 
  DeleteOutlined,
  LineChartOutlined,
  SettingOutlined
} from '@ant-design/icons';

interface OptimizationVariable {
  key: string;
  name: string;
  min: number;
  max: number;
  initial: number;
}

interface Constraint {
  key: string;
  expression: string;
  type: 'equality' | 'inequality';
  value: number;
}

interface OptimizationResult {
  iteration: number;
  objective: number;
  variables: Record<string, number>;
  feasible: boolean;
}

const Optimizer: React.FC = () => {
  const [form] = Form.useForm();
  const [optimizing, setOptimizing] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const [variables, setVariables] = useState<OptimizationVariable[]>([
    { key: '1', name: 'Length', min: 5, max: 20, initial: 10 },
    { key: '2', name: 'Width', min: 0.1, max: 1, initial: 0.5 },
    { key: '3', name: 'Height', min: 0.1, max: 1, initial: 0.3 },
  ]);

  const [constraints, setConstraints] = useState<Constraint[]>([
    { key: '1', expression: 'Width * Height', type: 'inequality', value: 0.3 },
    { key: '2', expression: 'stress', type: 'inequality', value: 200 },
  ]);

  const [results, setResults] = useState<OptimizationResult[]>([]);
  
  const [config, setConfig] = useState({
    objectiveType: 'minimize' as 'minimize' | 'maximize',
    objectiveFunction: 'displacement',
    algorithm: 'genetic',
    maxIterations: 100,
    tolerance: 0.001,
    populationSize: 50,
  });

  const variableColumns = [
    {
      title: '变量名',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: OptimizationVariable) => (
        <Input 
          value={text}
          onChange={(e) => updateVariable(record.key, 'name', e.target.value)}
          size="small"
        />
      ),
    },
    {
      title: '最小值',
      dataIndex: 'min',
      key: 'min',
      render: (value: number, record: OptimizationVariable) => (
        <InputNumber 
          value={value}
          onChange={(val) => updateVariable(record.key, 'min', val || 0)}
          size="small"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '最大值',
      dataIndex: 'max',
      key: 'max',
      render: (value: number, record: OptimizationVariable) => (
        <InputNumber 
          value={value}
          onChange={(val) => updateVariable(record.key, 'max', val || 0)}
          size="small"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '初始值',
      dataIndex: 'initial',
      key: 'initial',
      render: (value: number, record: OptimizationVariable) => (
        <InputNumber 
          value={value}
          onChange={(val) => updateVariable(record.key, 'initial', val || 0)}
          size="small"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (record: OptimizationVariable) => (
        <Button 
          type="text" 
          danger 
          icon={<DeleteOutlined />}
          onClick={() => deleteVariable(record.key)}
          size="small"
        />
      ),
    },
  ];

  const constraintColumns = [
    {
      title: '约束表达式',
      dataIndex: 'expression',
      key: 'expression',
      render: (text: string, record: Constraint) => (
        <Input 
          value={text}
          onChange={(e) => updateConstraint(record.key, 'expression', e.target.value)}
          placeholder="例如: x1 + x2"
          size="small"
        />
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string, record: Constraint) => (
        <Select
          value={type}
          onChange={(val) => updateConstraint(record.key, 'type', val)}
          size="small"
          style={{ width: '100%' }}
          options={[
            { value: 'equality', label: '等式 (=)' },
            { value: 'inequality', label: '不等式 (≤)' },
          ]}
        />
      ),
    },
    {
      title: '值',
      dataIndex: 'value',
      key: 'value',
      render: (value: number, record: Constraint) => (
        <InputNumber 
          value={value}
          onChange={(val) => updateConstraint(record.key, 'value', val || 0)}
          size="small"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (record: Constraint) => (
        <Button 
          type="text" 
          danger 
          icon={<DeleteOutlined />}
          onClick={() => deleteConstraint(record.key)}
          size="small"
        />
      ),
    },
  ];

  const resultColumns = [
    { title: '迭代次数', dataIndex: 'iteration', key: 'iteration' },
    { 
      title: '目标函数值', 
      dataIndex: 'objective', 
      key: 'objective',
      render: (val: number) => val.toFixed(6),
    },
    {
      title: '可行性',
      dataIndex: 'feasible',
      key: 'feasible',
      render: (feasible: boolean) => (
        <Tag color={feasible ? 'success' : 'error'}>
          {feasible ? '可行' : '不可行'}
        </Tag>
      ),
    },
  ];

  const updateVariable = (key: string, field: string, value: any) => {
    setVariables(vars => 
      vars.map(v => v.key === key ? { ...v, [field]: value } : v)
    );
  };

  const deleteVariable = (key: string) => {
    setVariables(vars => vars.filter(v => v.key !== key));
    message.success('变量已删除');
  };

  const addVariable = () => {
    const newKey = String(Date.now());
    setVariables([...variables, {
      key: newKey,
      name: `Var_${variables.length + 1}`,
      min: 0,
      max: 100,
      initial: 50,
    }]);
    message.success('变量已添加');
  };

  const updateConstraint = (key: string, field: string, value: any) => {
    setConstraints(cons => 
      cons.map(c => c.key === key ? { ...c, [field]: value } : c)
    );
  };

  const deleteConstraint = (key: string) => {
    setConstraints(cons => cons.filter(c => c.key !== key));
    message.success('约束已删除');
  };

  const addConstraint = () => {
    const newKey = String(Date.now());
    setConstraints([...constraints, {
      key: newKey,
      expression: '',
      type: 'inequality',
      value: 0,
    }]);
    message.success('约束已添加');
  };

  const startOptimization = () => {
    if (variables.length === 0) {
      message.error('请至少添加一个优化变量');
      return;
    }

    setOptimizing(true);
    setProgress(0);
    setResults([]);

    let iteration = 0;
    const maxIter = config.maxIterations;
    
    const interval = setInterval(() => {
      iteration++;
      
      const objective = 100 - iteration * 0.8 + Math.random() * 10;
      const vars: Record<string, number> = {};
      variables.forEach(v => {
        vars[v.name] = v.min + Math.random() * (v.max - v.min);
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

  const stopOptimization = () => {
    setOptimizing(false);
    message.info('优化已停止');
  };

  const bestResult = results.reduce((best, current) => {
    if (!best) return current;
    if (config.objectiveType === 'minimize') {
      return current.objective < best.objective ? current : best;
    } else {
      return current.objective > best.objective ? current : best;
    }
  }, results[0]);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {optimizing && (
        <Alert 
          message="优化进行中" 
          description={`当前迭代: ${results.length} / ${config.maxIterations}`}
          type="info" 
          showIcon 
        />
      )}

      <Card title={<><SettingOutlined /> 优化系统配置</>}>
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
                  options={[
                    { value: 'displacement', label: '位移' },
                    { value: 'stress', label: '应力' },
                    { value: 'weight', label: '重量' },
                    { value: 'cost', label: '成本' },
                    { value: 'custom', label: '自定义公式' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="优化算法">
                <Select
                  value={config.algorithm}
                  onChange={(val) => setConfig({ ...config, algorithm: val })}
                  options={[
                    { value: 'genetic', label: '遗传算法 (GA)' },
                    { value: 'pso', label: '粒子群优化 (PSO)' },
                    { value: 'gradient', label: '梯度下降' },
                    { value: 'simplex', label: '单纯形法' },
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
              <Form.Item label="收敛容差">
                <InputNumber 
                  value={config.tolerance}
                  onChange={(val) => setConfig({ ...config, tolerance: val || 0.001 })}
                  min={0.0001}
                  max={0.1}
                  step={0.001}
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

          <Form.Item label="高级选项">
            <Checkbox.Group>
              <Checkbox value="parallel">并行计算</Checkbox>
              <Checkbox value="adaptive">自适应参数</Checkbox>
              <Checkbox value="constraint">约束惩罚</Checkbox>
              <Checkbox value="log">详细日志</Checkbox>
            </Checkbox.Group>
          </Form.Item>
        </Form>
      </Card>

      <Card 
        title="优化变量定义"
        extra={
          <Button 
            type="primary" 
            size="small" 
            icon={<PlusOutlined />}
            onClick={addVariable}
          >
            添加变量
          </Button>
        }
      >
        <Table 
          columns={variableColumns}
          dataSource={variables}
          pagination={false}
          size="small"
        />
      </Card>

      <Card 
        title="约束条件"
        extra={
          <Button 
            type="primary" 
            size="small" 
            icon={<PlusOutlined />}
            onClick={addConstraint}
          >
            添加约束
          </Button>
        }
      >
        <Table 
          columns={constraintColumns}
          dataSource={constraints}
          pagination={false}
          size="small"
        />
      </Card>

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
                {bestResult.variables && Object.entries(bestResult.variables).map(([key, value]) => (
                  <Descriptions.Item label={key} key={key}>
                    {value.toFixed(4)}
                  </Descriptions.Item>
                ))}
              </Descriptions>
            </Card>
          )}

          <Card title="优化历史">
            <Table 
              columns={resultColumns}
              dataSource={results}
              pagination={{ pageSize: 10 }}
              size="small"
              scroll={{ y: 300 }}
            />
          </Card>
        </>
      )}
    </Space>
  );
};

export default Optimizer;