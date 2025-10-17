// ==================== Generator.tsx ====================
// frontend/src/components/Generator.tsx

import React, { useState } from 'react';
import { Card, Button, Space, Upload, message, Table, InputNumber, Input, Select, Row, Col, Divider } from 'antd';
import { UploadOutlined, SaveOutlined, PlusOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';

interface Parameter {
  key: string;
  name: string;
  value: number;
  unit: string;
  min?: number;
  max?: number;
  description: string;
  type: 'input' | 'material' | 'boundary' | 'mesh';
}

const Generator: React.FC = () => {
  const [parameters, setParameters] = useState<Parameter[]>([
    { key: '1', name: 'Length', value: 10.5, unit: 'm', min: 0, max: 100, description: '梁的长度', type: 'input' },
    { key: '2', name: 'Width', value: 0.5, unit: 'm', min: 0, max: 10, description: '梁的宽度', type: 'input' },
    { key: '3', name: 'E_Modulus', value: 200, unit: 'GPa', min: 0, max: 500, description: '弹性模量', type: 'material' },
    { key: '4', name: 'Density', value: 7850, unit: 'kg/m³', min: 0, max: 10000, description: '材料密度', type: 'material' },
    { key: '5', name: 'Poisson_Ratio', value: 0.3, unit: '-', min: 0, max: 0.5, description: '泊松比', type: 'material' },
    { key: '6', name: 'Force', value: 1000, unit: 'N', min: 0, max: 100000, description: '施加力', type: 'boundary' },
    { key: '7', name: 'Temperature', value: 25, unit: '°C', min: -50, max: 500, description: '环境温度', type: 'boundary' },
    { key: '8', name: 'Mesh_Size', value: 0.1, unit: 'm', min: 0.01, max: 1, description: '网格尺寸', type: 'mesh' },
  ]);

  const [filterType, setFilterType] = useState<string>('all');

  const columns = [
    {
      title: '参数名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      render: (text: string, record: Parameter) => (
        <Input 
          value={text} 
          onChange={(e) => updateParameter(record.key, 'name', e.target.value)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '数值',
      dataIndex: 'value',
      key: 'value',
      width: 120,
      render: (value: number, record: Parameter) => (
        <InputNumber 
          value={value} 
          onChange={(val) => updateParameter(record.key, 'value', val || 0)}
          min={record.min}
          max={record.max}
          step={0.1}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
      width: 100,
      render: (text: string, record: Parameter) => (
        <Input 
          value={text} 
          onChange={(e) => updateParameter(record.key, 'unit', e.target.value)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '范围',
      key: 'range',
      width: 150,
      render: (record: Parameter) => (
        <Space.Compact style={{ width: '100%' }}>
          <InputNumber 
            value={record.min} 
            placeholder="最小"
            onChange={(val) => updateParameter(record.key, 'min', val)}
            style={{ width: '50%' }}
            size="small"
          />
          <InputNumber 
            value={record.max} 
            placeholder="最大"
            onChange={(val) => updateParameter(record.key, 'max', val)}
            style={{ width: '50%' }}
            size="small"
          />
        </Space.Compact>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string, record: Parameter) => (
        <Select
          value={type}
          onChange={(val) => updateParameter(record.key, 'type', val)}
          style={{ width: '100%' }}
          options={[
            { value: 'input', label: '输入参数' },
            { value: 'material', label: '材料属性' },
            { value: 'boundary', label: '边界条件' },
            { value: 'mesh', label: '网格参数' },
          ]}
        />
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      render: (text: string, record: Parameter) => (
        <Input 
          value={text} 
          onChange={(e) => updateParameter(record.key, 'description', e.target.value)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (record: Parameter) => (
        <Button 
          type="text" 
          danger 
          icon={<DeleteOutlined />}
          onClick={() => deleteParameter(record.key)}
        />
      ),
    },
  ];

  const updateParameter = (key: string, field: string, value: any) => {
    setParameters(params => 
      params.map(p => p.key === key ? { ...p, [field]: value } : p)
    );
  };

  const deleteParameter = (key: string) => {
    setParameters(params => params.filter(p => p.key !== key));
    message.success('参数已删除');
  };

  const addParameter = () => {
    const newKey = String(Date.now());
    setParameters([...parameters, {
      key: newKey,
      name: `Param_${parameters.length + 1}`,
      value: 0,
      unit: '-',
      min: 0,
      max: 100,
      description: '新参数',
      type: 'input',
    }]);
    message.success('已添加新参数');
  };

  const uploadProps: UploadProps = {
    accept: '.csv',
    beforeUpload: (file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const lines = text.split('\n');
        const newParams: Parameter[] = [];
        lines.slice(1).forEach((line, index) => {
          const [name, value, unit, min, max, description, type] = line.split(',');
          if (name && value) {
            newParams.push({
              key: String(Date.now() + index),
              name: name.trim(),
              value: parseFloat(value) || 0,
              unit: unit?.trim() || '-',
              min: parseFloat(min) || undefined,
              max: parseFloat(max) || undefined,
              description: description?.trim() || '',
              type: (type?.trim() as any) || 'input',
            });
          }
        });
        setParameters(newParams);
        message.success(`已导入 ${newParams.length} 个参数`);
      };
      reader.readAsText(file);
      return false;
    },
  };

  const exportToCSV = () => {
    const headers = ['name', 'value', 'unit', 'min', 'max', 'description', 'type'];
    const csvContent = [
      headers.join(','),
      ...parameters.map(p => 
        `${p.name},${p.value},${p.unit},${p.min || ''},${p.max || ''},${p.description},${p.type}`
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `parameters_${Date.now()}.csv`;
    link.click();
    message.success('参数已导出');
  };

  const filteredParameters = filterType === 'all' 
    ? parameters 
    : parameters.filter(p => p.type === filterType);

  const stats = {
    total: parameters.length,
    input: parameters.filter(p => p.type === 'input').length,
    material: parameters.filter(p => p.type === 'material').length,
    boundary: parameters.filter(p => p.type === 'boundary').length,
    mesh: parameters.filter(p => p.type === 'mesh').length,
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff' }}>{stats.total}</div>
              <div style={{ color: '#999' }}>总参数数</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a' }}>{stats.input}</div>
              <div style={{ color: '#999' }}>输入参数</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#faad14' }}>{stats.material}</div>
              <div style={{ color: '#999' }}>材料属性</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#f5222d' }}>{stats.boundary}</div>
              <div style={{ color: '#999' }}>边界条件</div>
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="控制面板">
        <Space wrap>
          <Upload {...uploadProps}>
            <Button icon={<UploadOutlined />}>导入 CSV</Button>
          </Upload>
          <Button icon={<DownloadOutlined />} onClick={exportToCSV}>导出 CSV</Button>
          <Button icon={<SaveOutlined />} type="primary">保存配置</Button>
          <Button icon={<PlusOutlined />} onClick={addParameter}>添加参数</Button>
          <Divider type="vertical" />
          <Select
            value={filterType}
            onChange={setFilterType}
            style={{ width: 120 }}
            options={[
              { value: 'all', label: '全部类型' },
              { value: 'input', label: '输入参数' },
              { value: 'material', label: '材料属性' },
              { value: 'boundary', label: '边界条件' },
              { value: 'mesh', label: '网格参数' },
            ]}
          />
        </Space>
      </Card>

      <Card title={`参数列表 (${filteredParameters.length} 项)`}>
        <Table 
          columns={columns} 
          dataSource={filteredParameters}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1000 }}
          size="small"
        />
      </Card>
    </Space>
  );
};

export default Generator;