// frontend/src/components/Generator.tsx

import React, { useState } from 'react';
import { Card, Form, Input, Select, Button, Space, message, Row, Col, Divider, InputNumber, Tabs } from 'antd';
import { SaveOutlined, PlusOutlined, DeleteOutlined, FileAddOutlined } from '@ant-design/icons';
import { useI18n } from '../core/i18n';

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
  const { t } = useI18n();
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
    message.success(t('gen.msg.var_deleted'));
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
    
    message.success(t('gen.msg.yaml_generated'));
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
    <Card title={t('gen.template.title')}>
      <Form layout="vertical">
        <Form.Item label={t('gen.template.type_label')}>
          <Select
            placeholder={t('gen.template.type_placeholder')}
            options={[
              { value: 'glucose_regulation', label: t('gen.template.glucose') },
              { value: 'insulin_system', label: t('gen.template.insulin') },
              { value: 'disease_progression', label: t('gen.template.disease') },
              { value: 'organ_function', label: t('gen.template.organ') },
            ]}
          />
        </Form.Item>
        <Form.Item label={t('gen.template.name_label')}>
          <Input placeholder={t('gen.template.name_placeholder')} />
        </Form.Item>
        <Form.Item label={t('gen.template.desc_label')}>
          <TextArea rows={4} placeholder={t('gen.template.desc_placeholder')} />
        </Form.Item>
        <Button type="primary" icon={<FileAddOutlined />}>
          {t('gen.template.generate')}
        </Button>
      </Form>
    </Card>
  );

  // 从论文生成页面
  const renderPaperGeneration = () => (
    <Card title={t('gen.paper.title')}>
      <Form layout="vertical">
        <Form.Item label={t('gen.paper.title_label')}>
          <Input placeholder={t('gen.paper.title_placeholder')} />
        </Form.Item>
        <Form.Item label={t('gen.paper.abstract_label')}>
          <TextArea rows={8} placeholder={t('gen.paper.abstract_placeholder')} />
        </Form.Item>
        <Form.Item label={t('gen.paper.vars_label')}>
          <Input placeholder={t('gen.paper.vars_placeholder')} />
        </Form.Item>
        <Form.Item label={t('gen.paper.relations_label')}>
          <TextArea rows={4} placeholder={t('gen.paper.relations_placeholder')} />
        </Form.Item>
        <Space>
          <Button icon={<FileAddOutlined />}>
            {t('gen.paper.draft')}
          </Button>
        </Space>
      </Form>
    </Card>
  );

  // 手动编辑页面
  const renderManualEdit = () => (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card title={t('gen.edit.meta_title')}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('gen.edit.name_label')}>
                <Input
                  value={metadata.name}
                  onChange={(e) => setMetadata({ ...metadata, name: e.target.value })}
                  placeholder={t('gen.edit.name_placeholder')}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('gen.edit.version_label')}>
                <Input
                  value={metadata.version}
                  onChange={(e) => setMetadata({ ...metadata, version: e.target.value })}
                  placeholder="1.0.0"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('gen.edit.author_label')}>
                <Input
                  value={metadata.author}
                  onChange={(e) => setMetadata({ ...metadata, author: e.target.value })}
                  placeholder="Your Name"
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={t('gen.edit.desc_label')}>
            <TextArea
              value={metadata.description}
              onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
              rows={2}
              placeholder={t('gen.edit.desc_placeholder')}
            />
          </Form.Item>
          <Form.Item label={t('gen.edit.tags_label')}>
            <Input
              placeholder="e.g. organs, function, metabolism"
              onChange={(e) => setMetadata({ ...metadata, tags: e.target.value.split(',').map(tg => tg.trim()) })}
            />
          </Form.Item>
        </Form>
      </Card>

      <Card
        title={`${t('gen.edit.vars_title')} (${variables.length})`}
        extra={
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={addVariable}>
            {t('gen.edit.add_var')}
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
                    placeholder={t('gen.edit.var_name_placeholder')}
                    size="small"
                  />
                </Col>
                <Col span={6}>
                  <Input
                    value={v.description}
                    onChange={(e) => updateVariable(v.key, 'description', e.target.value)}
                    placeholder={t('gen.edit.var_desc_placeholder')}
                    size="small"
                  />
                </Col>
                <Col span={3}>
                  <InputNumber
                    value={v.value}
                    onChange={(val) => updateVariable(v.key, 'value', val || 0)}
                    placeholder={t('gen.edit.var_init_placeholder')}
                    size="small"
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={2}>
                  <Input
                    value={v.unit}
                    onChange={(e) => updateVariable(v.key, 'unit', e.target.value)}
                    placeholder={t('gen.edit.var_unit_placeholder')}
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
                      { value: 'input', label: 'input' },
                      { value: 'parameters', label: 'parameter' },
                      { value: 'state', label: 'state' },
                    ]}
                  />
                </Col>
                <Col span={4}>
                  <Input.Group compact>
                    <InputNumber
                      value={v.bounds[0]}
                      onChange={(val) => updateVariable(v.key, 'bounds', [val || 0, v.bounds[1]])}
                      placeholder={t('gen.edit.var_min_placeholder')}
                      size="small"
                      style={{ width: '50%' }}
                    />
                    <InputNumber
                      value={v.bounds[1]}
                      onChange={(val) => updateVariable(v.key, 'bounds', [v.bounds[0], val || 100])}
                      placeholder={t('gen.edit.var_max_placeholder')}
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
              {t('gen.edit.no_vars')}
            </div>
          )}
        </Space>
      </Card>

      <Card
        title={`${t('gen.edit.formulas_title')} (${formulas.length})`}
        extra={
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={addFormula}>
            {t('gen.edit.add_formula')}
          </Button>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {formulas.map((f) => (
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
                    placeholder={t('gen.edit.formula_name_placeholder')}
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
                    placeholder={t('gen.edit.formula_desc_placeholder')}
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
                    placeholder={t('gen.edit.formula_cond_placeholder')}
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
                      message.success(t('gen.msg.formula_deleted'));
                    }}
                  />
                </Col>
              </Row>
              <div style={{ marginTop: 8, color: '#666' }}>
                {t('gen.edit.dynamics_hint')}
              </div>
            </Card>
          ))}
          {formulas.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
              {t('gen.edit.no_formulas')}
            </div>
          )}
        </Space>
      </Card>

      <Card>
        <Space>
          <Button type="primary" size="large" icon={<SaveOutlined />} onClick={generateYAML}>
            {t('gen.edit.generate_download')}
          </Button>
          <Button onClick={() => {
            setVariables([]);
            setFormulas([]);
            setMetadata({ name: '', version: '1.0.0', author: '', description: '', tags: [] });
            message.success(t('gen.msg.cleared'));
          }}>
            {t('gen.edit.clear')}
          </Button>
        </Space>
      </Card>
    </Space>
  );

  return renderSubPage();
};

export default Generator;