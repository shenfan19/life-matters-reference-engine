// frontend/src/components/Generator.tsx

import React, { useState } from 'react';
import { Card, Form, Input, Select, Button, Space, message, Row, Col, Divider, InputNumber, Tabs } from 'antd';
import { SaveOutlined, PlusOutlined, DeleteOutlined, FileAddOutlined } from '@ant-design/icons';

const { TextArea } = Input;

interface GeneratorProps {
  subPage: string;
}

interface Variable {
  key: string;
  name: string;
  description: string;
  value: number;
  unit: string;
  type: 'input' | 'parameters' | 'state';
  bounds: [number, number];
}

interface Formula {
  key: string;
  name: string;
  description: string;
  condition?: string;
  dynamics: Record<string, string>;
  priority?: number;
}

const Generator: React.FC<GeneratorProps> = ({ subPage }) => {
  const [form] = Form.useForm();
  const [variables, setVariables] = useState<Variable[]>([]);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [metadata, setMetadata] = useState({
    name: '',
    version: '1.0.0',
    author: '',
    description: '',
    tags: [] as string[],
  });

  // 添加变量
  const addVariable = () => {
    const newVar: Variable = {
      key: `var_${Date.now()}`,
      name: `new_variable_${variables.length + 1}`,
      description: '新变量',
      value: 0,
      unit: '',
      type: 'state',
      bounds: [0, 100],
    };
    setVariables([...variables, newVar]);
  };

  // 删除变量
  const deleteVariable = (key: string) => {
    setVariables(variables.filter(v => v.key !== key));
    message.success('变量已删除');
  };

  // 更新变量
  const updateVariable = (key: string, field: string, value: any) => {
    setVariables(variables.map(v => 
      v.key === key ? { ...v, [field]: value } : v
    ));
  };

  // 添加公式
  const addFormula = () => {
    const newFormula: Formula = {
      key: `formula_${Date.now()}`,
      name: `formula_${formulas.length + 1}`,
      description: '新公式',
      dynamics: {},
      priority: 100,
    };
    setFormulas([...formulas, newFormula]);
  };

  // 生成 YAML
  const generateYAML = () => {
    const yamlContent = {
      metadata: {
        ...metadata,
        conflicts: [],
      },
      imports: [],
      variables: variables.reduce((acc, v) => {
        acc[v.name] = {
          description: v.description,
          value: v.value,
          unit: v.unit,
          type: v.type,
          bounds: v.bounds,
        };
        return acc;
      }, {} as Record<string, any>),
      formulas: formulas.reduce((acc, f) => {
        acc[f.name] = {
          description: f.description,
          condition: f.condition,
          dynamics: f.dynamics,
          priority: f.priority,
        };
        return acc;
      }, {} as Record<string, any>),
      simulator: {
        step_size: 1,
        total_time: 1440,
        output_format: 'csv',
        output_variables: variables.filter(v => v.type === 'state').map(v => v.name),
      },
    };

    const yamlStr = JSON.stringify(yamlContent, null, 2);
    
    // 下载 YAML 文件
    const blob = new Blob([yamlStr], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metadata.name || 'model'}.yaml`;
    a.click();
    
    message.success('YAML 文件已生成并下载');
  };

  // 根据子页面渲染不同内容
  const renderSubPage = () => {
    switch (subPage) {
      case '1-1': // 模板生成
        return renderTemplateGeneration();
      case '1-2': // 手动编辑
        return renderManualEdit();
      case '1-3': // 从论文生成
        return renderPaperGeneration();
      default:
        return renderManualEdit();
    }
  };

  // 模板生成页面
  const renderTemplateGeneration = () => (
    <Card title="从模板生成模型">
      <Form layout="vertical">
        <Form.Item label="选择模板类型">
          <Select
            placeholder="选择预设模板"
            options={[
              { value: 'glucose_regulation', label: '血糖调节模型' },
              { value: 'insulin_system', label: '胰岛素系统' },
              { value: 'disease_progression', label: '疾病进展模型' },
              { value: 'organ_function', label: '器官功能模型' },
            ]}
          />
        </Form.Item>
        <Form.Item label="模型名称">
          <Input placeholder="输入模型名称" />
        </Form.Item>
        <Form.Item label="模型描述">
          <TextArea rows={4} placeholder="输入模型描述" />
        </Form.Item>
        <Button type="primary" icon={<FileAddOutlined />}>
          生成模型
        </Button>
      </Form>
    </Card>
  );

  // 从论文生成页面
  const renderPaperGeneration = () => (
    <Card title="从论文生成模型">
      <Form layout="vertical">
        <Form.Item label="论文标题">
          <Input placeholder="输入论文标题" />
        </Form.Item>
        <Form.Item label="论文摘要或关键内容">
          <TextArea rows={8} placeholder="粘贴论文摘要、方法或结果部分" />
        </Form.Item>
        <Form.Item label="提取的关键变量（逗号分隔）">
          <Input placeholder="例如: 血糖, 胰岛素, 体重" />
        </Form.Item>
        <Form.Item label="提取的关键关系">
          <TextArea rows={4} placeholder="例如: 血糖与胰岛素呈负相关" />
        </Form.Item>
        <Space>
          {/* <Button type="primary" icon={<ExperimentOutlined />}>
            AI 辅助提取
          </Button> */}
          <Button icon={<FileAddOutlined />}>
            生成模型草稿
          </Button>
        </Space>
      </Form>
    </Card>
  );

  // 手动编辑页面
  const renderManualEdit = () => (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* 元数据编辑 */}
      <Card title="模型元数据">
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="模型名称">
                <Input 
                  value={metadata.name}
                  onChange={(e) => setMetadata({ ...metadata, name: e.target.value })}
                  placeholder="例如: physiology"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="版本">
                <Input 
                  value={metadata.version}
                  onChange={(e) => setMetadata({ ...metadata, version: e.target.value })}
                  placeholder="1.0.0"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="作者">
                <Input 
                  value={metadata.author}
                  onChange={(e) => setMetadata({ ...metadata, author: e.target.value })}
                  placeholder="Your Name"
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="描述">
            <TextArea 
              value={metadata.description}
              onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
              rows={2}
              placeholder="模型功能描述"
            />
          </Form.Item>
          <Form.Item label="标签（逗号分隔）">
            <Input 
              placeholder="例如: organs, function, metabolism"
              onChange={(e) => setMetadata({ ...metadata, tags: e.target.value.split(',').map(t => t.trim()) })}
            />
          </Form.Item>
        </Form>
      </Card>

      {/* 变量定义 */}
      <Card 
        title={`变量定义 (${variables.length})`}
        extra={
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={addVariable}>
            添加变量
          </Button>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {variables.map((v) => (
            <Card key={v.key} size="small" style={{ background: '#fafafa' }}>
              <Row gutter={8} align="middle">
                <Col span={4}>
                  <Input 
                    value={v.name}
                    onChange={(e) => updateVariable(v.key, 'name', e.target.value)}
                    placeholder="变量名"
                    size="small"
                  />
                </Col>
                <Col span={6}>
                  <Input 
                    value={v.description}
                    onChange={(e) => updateVariable(v.key, 'description', e.target.value)}
                    placeholder="描述"
                    size="small"
                  />
                </Col>
                <Col span={3}>
                  <InputNumber 
                    value={v.value}
                    onChange={(val) => updateVariable(v.key, 'value', val || 0)}
                    placeholder="初值"
                    size="small"
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={2}>
                  <Input 
                    value={v.unit}
                    onChange={(e) => updateVariable(v.key, 'unit', e.target.value)}
                    placeholder="单位"
                    size="small"
                  />
                </Col>
                <Col span={3}>
                  <Select
                    value={v.type}
                    onChange={(val) => updateVariable(v.key, 'type', val)}
                    size="small"
                    style={{ width: '100%' }}
                    options={[
                      { value: 'input', label: 'INPUT' },
                      { value: 'parameters', label: 'PARAMETERS' },
                      { value: 'state', label: 'STATE' },
                    ]}
                  />
                </Col>
                <Col span={4}>
                  <Input.Group compact>
                    <InputNumber 
                      value={v.bounds[0]}
                      onChange={(val) => updateVariable(v.key, 'bounds', [val || 0, v.bounds[1]])}
                      placeholder="最小"
                      size="small"
                      style={{ width: '50%' }}
                    />
                    <InputNumber 
                      value={v.bounds[1]}
                      onChange={(val) => updateVariable(v.key, 'bounds', [v.bounds[0], val || 100])}
                      placeholder="最大"
                      size="small"
                      style={{ width: '50%' }}
                    />
                  </Input.Group>
                </Col>
                <Col span={2}>
                  <Button 
                    type="text" 
                    danger 
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => deleteVariable(v.key)}
                  />
                </Col>
              </Row>
            </Card>
          ))}
          {variables.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
              暂无变量，点击上方按钮添加
            </div>
          )}
        </Space>
      </Card>

      {/* 公式定义 */}
      <Card 
        title={`公式定义 (${formulas.length})`}
        extra={
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={addFormula}>
            添加公式
          </Button>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {formulas.map((f, index) => (
            <Card key={f.key} size="small" style={{ background: '#f0f7ff' }}>
              <Row gutter={8}>
                <Col span={6}>
                  <Input 
                    value={f.name}
                    onChange={(e) => {
                      setFormulas(formulas.map(formula => 
                        formula.key === f.key ? { ...formula, name: e.target.value } : formula
                      ));
                    }}
                    placeholder="公式名称"
                    size="small"
                  />
                </Col>
                <Col span={10}>
                  <Input 
                    value={f.description}
                    onChange={(e) => {
                      setFormulas(formulas.map(formula => 
                        formula.key === f.key ? { ...formula, description: e.target.value } : formula
                      ));
                    }}
                    placeholder="公式描述"
                    size="small"
                  />
                </Col>
                <Col span={6}>
                  <Input 
                    value={f.condition}
                    onChange={(e) => {
                      setFormulas(formulas.map(formula => 
                        formula.key === f.key ? { ...formula, condition: e.target.value } : formula
                      ));
                    }}
                    placeholder="触发条件（可选）"
                    size="small"
                  />
                </Col>
                <Col span={2}>
                  <Button 
                    type="text" 
                    danger 
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      setFormulas(formulas.filter(formula => formula.key !== f.key));
                      message.success('公式已删除');
                    }}
                  />
                </Col>
              </Row>
              <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                动力学方程 (dynamics): 在此处添加变量更新规则
              </div>
            </Card>
          ))}
          {formulas.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
              暂无公式，点击上方按钮添加
            </div>
          )}
        </Space>
      </Card>

      {/* 操作按钮 */}
      <Card>
        <Space>
          <Button type="primary" size="large" icon={<SaveOutlined />} onClick={generateYAML}>
            生成并下载 YAML
          </Button>
          <Button onClick={() => {
            setVariables([]);
            setFormulas([]);
            setMetadata({ name: '', version: '1.0.0', author: '', description: '', tags: [] });
            message.success('已清空所有内容');
          }}>
            清空
          </Button>
        </Space>
      </Card>
    </Space>
  );

  return renderSubPage();
};

export default Generator;