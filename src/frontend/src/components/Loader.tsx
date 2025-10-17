// frontend/src/components/Loader.tsx

import React, { useState, useEffect } from 'react';
import { Card, Tree, Tabs, Row, Col, Button, Space, Tag, Descriptions, Switch, message, Upload, Modal } from 'antd';
import { 
  CheckOutlined, 
  CloseOutlined, 
  UploadOutlined, 
  ReloadOutlined,
  FileTextOutlined,
  FunctionOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';

interface ModuleDetail {
  name: string;
  version: string;
  author: string;
  description: string;
  yaml: string;
  formula: string;
  dependencies: string[];
  parameters: string[];
  enabled: boolean;
}

interface LoaderProps {
  onModulesChange?: (count: number) => void;
}

const Loader: React.FC<LoaderProps> = ({ onModulesChange }) => {
  const [checkedKeys, setCheckedKeys] = useState<React.Key[]>(['0-0-0', '0-0-1', '0-1-0']);
  const [selectedMod, setSelectedMod] = useState<string>('0-0-0');
  const [moduleDetails, setModuleDetails] = useState<Record<string, ModuleDetail>>({});
  const [uploadModalVisible, setUploadModalVisible] = useState(false);

  useEffect(() => {
    setModuleDetails({
      '0-0-0': {
        name: 'StructureAnalysisMod',
        version: '2.1.0',
        author: 'FEM Team',
        description: '线弹性结构分析模块，支持静力学和动力学分析',
        yaml: `name: StructureAnalysisMod
version: 2.1.0
author: FEM Team
parameters:
  - Length
  - E_Modulus
  - Poisson_Ratio
dependencies:
  - MaterialLibrary
  - MeshGenerator`,
        formula: `刚度矩阵: K = E * I / L³
应力计算: σ = M * y / I
变形计算: δ = F * L³ / (3 * E * I)`,
        dependencies: ['MaterialLibrary', 'MeshGenerator'],
        parameters: ['Length', 'E_Modulus', 'Poisson_Ratio'],
        enabled: true,
      },
      '0-0-1': {
        name: 'ThermalAnalysisMod',
        version: '1.8.5',
        author: 'Thermal Group',
        description: '热传导和热应力分析模块',
        yaml: `name: ThermalAnalysisMod
version: 1.8.5
author: Thermal Group
parameters:
  - Temperature
  - Thermal_Conductivity
  - Heat_Capacity
dependencies:
  - MaterialLibrary`,
        formula: `热传导: Q = -k * A * dT/dx
热应力: σ_thermal = E * α * ΔT / (1 - ν)
稳态热传导: ∇·(k∇T) = 0`,
        dependencies: ['MaterialLibrary'],
        parameters: ['Temperature', 'Thermal_Conductivity', 'Heat_Capacity'],
        enabled: true,
      },
      '0-0-2': {
        name: 'NonlinearMaterialMod',
        version: '3.0.2',
        author: 'Advanced Materials Lab',
        description: '非线性材料本构关系库',
        yaml: `name: NonlinearMaterialMod
version: 3.0.2
author: Advanced Materials Lab
material_models:
  - Elastoplastic
  - Hyperelastic
  - Viscoelastic
dependencies: []`,
        formula: `弹塑性: σ = f(ε, ε_plastic)
超弹性: W = C10(I1-3) + C01(I2-3)
粘弹性: σ(t) = ∫ E(t-τ) dε(τ)/dτ dτ`,
        dependencies: [],
        parameters: ['Yield_Stress', 'Hardening_Parameter'],
        enabled: false,
      },
      '0-1-0': {
        name: 'CustomFormulaMod',
        version: '1.0.0',
        author: 'User',
        description: '用户自定义计算公式模块',
        yaml: `name: CustomFormulaMod
version: 1.0.0
author: User
custom_functions:
  - myFunction1
  - myFunction2`,
        formula: `自定义函数1: result = a * x² + b * x + c
自定义函数2: output = sin(ωt) * exp(-ζt)`,
        dependencies: [],
        parameters: ['a', 'b', 'c', 'ω', 'ζ'],
        enabled: true,
      },
      '0-1-1': {
        name: 'LegacyMod_v05',
        version: '0.5.0',
        author: 'Legacy System',
        description: '旧版本兼容模块（建议升级）',
        yaml: `name: LegacyMod_v05
version: 0.5.0
deprecated: true
compatibility: v1.x`,
        formula: `旧版计算方法
已不推荐使用`,
        dependencies: [],
        parameters: [],
        enabled: false,
      },
    });
  }, []);

  const treeData: DataNode[] = [
    {
      title: '核心 MOD 包',
      key: '0-0',
      children: [
        { title: '结构分析 MOD', key: '0-0-0' },
        { title: '热力学分析 MOD', key: '0-0-1' },
        { title: '非线性材料库 MOD', key: '0-0-2' },
      ],
    },
    {
      title: '用户自定义 MOD',
      key: '0-1',
      children: [
        { title: '我的自定义公式', key: '0-1-0' },
        { title: '旧版本 MOD (v0.5)', key: '0-1-1' },
      ],
    },
  ];

  useEffect(() => {
    if (onModulesChange) {
      onModulesChange(checkedKeys.length);
    }
  }, [checkedKeys, onModulesChange]);

  const getModuleDetail = (key: string): ModuleDetail => {
    return moduleDetails[key] || {
      name: 'Unknown',
      version: '0.0.0',
      author: 'Unknown',
      description: '未知模块',
      yaml: '无数据',
      formula: '-',
      dependencies: [],
      parameters: [],
      enabled: false,
    };
  };

  const currentDetail = getModuleDetail(selectedMod);

  const toggleModuleEnabled = (key: string) => {
    setModuleDetails(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        enabled: !prev[key]?.enabled,
      },
    }));
    message.success(`模块已${!currentDetail.enabled ? '启用' : '禁用'}`);
  };

  const toggleAllModules = (enabled: boolean) => {
    const allKeys = Object.keys(moduleDetails);
    setModuleDetails(prev => {
      const updated = { ...prev };
      allKeys.forEach(key => {
        updated[key] = { ...updated[key], enabled };
      });
      return updated;
    });
    if (enabled) {
      setCheckedKeys(allKeys);
    } else {
      setCheckedKeys([]);
    }
    message.success(`已${enabled ? '启用' : '禁用'}所有模块`);
  };

  const reloadModules = () => {
    message.loading('正在重新加载模块...', 1).then(() => {
      message.success('模块已重新加载');
    });
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card>
        <Space wrap>
          <Button 
            type="primary" 
            icon={<CheckOutlined />}
            onClick={() => toggleAllModules(true)}
          >
            启用全部
          </Button>
          <Button 
            danger 
            icon={<CloseOutlined />}
            onClick={() => toggleAllModules(false)}
          >
            禁用全部
          </Button>
          <Button 
            icon={<ReloadOutlined />}
            onClick={reloadModules}
          >
            重新加载
          </Button>
          <Button 
            icon={<UploadOutlined />}
            onClick={() => setUploadModalVisible(true)}
          >
            上传新模块
          </Button>
          <Tag color="blue">已启用: {checkedKeys.length} / {Object.keys(moduleDetails).length}</Tag>
        </Space>
      </Card>

      <Card title="MOD 模块管理">
        <Tabs 
          defaultActiveKey="manager" 
          items={[
            { 
              key: 'manager', 
              label: '模块选择与配置', 
              children: (
                <Row gutter={16}>
                  <Col span={8}>
                    <Card 
                      title="可用模块树" 
                      extra={<Tag color="green">{checkedKeys.length} 已选</Tag>}
                    >
                      <Tree
                        checkable
                        checkedKeys={checkedKeys}
                        onCheck={(checkedKeys) => setCheckedKeys(checkedKeys as React.Key[])}
                        onSelect={(selectedKeys) => {
                          if (selectedKeys.length > 0) {
                            setSelectedMod(selectedKeys[0] as string);
                          }
                        }}
                        treeData={treeData}
                        defaultExpandAll
                      />
                    </Card>
                  </Col>
                  
                  <Col span={16}>
                    <Card 
                      title={
                        <Space>
                          <span>模块详情: {currentDetail.name}</span>
                          <Tag color={currentDetail.enabled ? 'success' : 'default'}>
                            {currentDetail.enabled ? '已启用' : '已禁用'}
                          </Tag>
                        </Space>
                      }
                      extra={
                        <Switch 
                          checked={currentDetail.enabled}
                          onChange={() => toggleModuleEnabled(selectedMod)}
                          checkedChildren="启用"
                          unCheckedChildren="禁用"
                        />
                      }
                    >
                      <Tabs 
                        defaultActiveKey="info" 
                        items={[
                          { 
                            key: 'info', 
                            label: <span><InfoCircleOutlined /> 基本信息</span>,
                            children: (
                              <Descriptions column={2} bordered size="small">
                                <Descriptions.Item label="模块名称" span={2}>
                                  {currentDetail.name}
                                </Descriptions.Item>
                                <Descriptions.Item label="版本">
                                  <Tag color="blue">{currentDetail.version}</Tag>
                                </Descriptions.Item>
                                <Descriptions.Item label="作者">
                                  {currentDetail.author}
                                </Descriptions.Item>
                                <Descriptions.Item label="描述" span={2}>
                                  {currentDetail.description}
                                </Descriptions.Item>
                                <Descriptions.Item label="依赖模块" span={2}>
                                  {currentDetail.dependencies.length > 0 ? (
                                    <Space>
                                      {currentDetail.dependencies.map(dep => (
                                        <Tag key={dep}>{dep}</Tag>
                                      ))}
                                    </Space>
                                  ) : (
                                    <Tag color="default">无依赖</Tag>
                                  )}
                                </Descriptions.Item>
                                <Descriptions.Item label="所需参数" span={2}>
                                  {currentDetail.parameters.length > 0 ? (
                                    <Space wrap>
                                      {currentDetail.parameters.map(param => (
                                        <Tag color="purple" key={param}>{param}</Tag>
                                      ))}
                                    </Space>
                                  ) : (
                                    <Tag color="default">无参数</Tag>
                                  )}
                                </Descriptions.Item>
                              </Descriptions>
                            )
                          },
                          { 
                            key: 'yaml', 
                            label: <span><FileTextOutlined /> YAML 配置</span>,
                            children: (
                              <pre style={{ 
                                backgroundColor: '#f5f5f5', 
                                padding: 16, 
                                borderRadius: 4,
                                maxHeight: 400,
                                overflow: 'auto',
                                fontFamily: 'monospace',
                                fontSize: 13
                              }}>
                                {currentDetail.yaml}
                              </pre>
                            )
                          },
                          { 
                            key: 'formula', 
                            label: <span><FunctionOutlined /> 核心公式</span>,
                            children: (
                              <div style={{ 
                                padding: 16, 
                                backgroundColor: '#fafafa',
                                borderRadius: 4,
                                minHeight: 200
                              }}>
                                <pre style={{ 
                                  fontFamily: 'monospace',
                                  fontSize: 14,
                                  lineHeight: 1.8,
                                  whiteSpace: 'pre-wrap'
                                }}>
                                  {currentDetail.formula}
                                </pre>
                              </div>
                            )
                          },
                        ]} 
                      />
                    </Card>
                  </Col>
                </Row>
              )
            },
            { 
              key: 'status', 
              label: '模块状态总览', 
              children: (
                <Row gutter={[16, 16]}>
                  {Object.entries(moduleDetails).map(([key, detail]) => (
                    <Col span={12} key={key}>
                      <Card 
                        size="small"
                        title={detail.name}
                        extra={
                          <Switch 
                            size="small"
                            checked={detail.enabled}
                            onChange={() => toggleModuleEnabled(key)}
                          />
                        }
                      >
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <div>
                            <Tag color="blue">v{detail.version}</Tag>
                            <Tag color={detail.enabled ? 'success' : 'default'}>
                              {detail.enabled ? '运行中' : '未启用'}
                            </Tag>
                          </div>
                          <div style={{ fontSize: 12, color: '#666' }}>
                            {detail.description}
                          </div>
                          {detail.dependencies.length > 0 && (
                            <div style={{ fontSize: 12 }}>
                              依赖: {detail.dependencies.join(', ')}
                            </div>
                          )}
                        </Space>
                      </Card>
                    </Col>
                  ))}
                </Row>
              )
            }
          ]}
        />
      </Card>

      <Modal
        title="上传新模块"
        open={uploadModalVisible}
        onCancel={() => setUploadModalVisible(false)}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Upload.Dragger
            accept=".yaml,.yml,.json"
            beforeUpload={(file) => {
              message.success(`文件 ${file.name} 上传成功`);
              setUploadModalVisible(false);
              return false;
            }}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint">
              支持 YAML 或 JSON 格式的模块配置文件
            </p>
          </Upload.Dragger>
        </Space>
      </Modal>
    </Space>
  );
};

export default Loader;