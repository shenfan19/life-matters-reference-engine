// frontend/src/components/Loader.tsx

import React, { useState, useEffect } from 'react';
import { Card, Tree, Row, Col, Descriptions, Tag, Button, Space, Input, message, Divider, Tabs } from 'antd';
import { 
  FolderOutlined,
  FileOutlined,
  ReloadOutlined,
  MergeOutlined,
  SearchOutlined
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';

interface LoaderProps {
  subPage: string;
  onModelSelect?: (model: any) => void;
}

interface ModelFile {
  key: string;
  title: string;
  path: string;
  folder?: string;
  metadata?: any;
  variables?: Record<string, any>;
  formulas?: Record<string, any>;
  simulator?: any;
  optimizer?: any;
}

const Loader: React.FC<LoaderProps> = ({ subPage, onModelSelect }) => {
  const [searchText, setSearchText] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelFile | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<React.Key[]>([]);
  
  // 模拟文件树数据（实际应从后端API获取）
  const [treeData] = useState<DataNode[]>([
    {
      title: 'mods',
      key: 'mods',
      icon: <FolderOutlined />,
      children: [
        {
          title: 'physiology',
          key: 'physiology',
          icon: <FolderOutlined />,
          children: [
            { title: 'physiology.yaml', key: 'physiology/physiology.yaml', icon: <FileOutlined />, isLeaf: true },
            { title: 'insulin_system.yaml', key: 'physiology/insulin_system.yaml', icon: <FileOutlined />, isLeaf: true },
            { title: 'glucose_regulation.yaml', key: 'physiology/glucose_regulation.yaml', icon: <FileOutlined />, isLeaf: true },
          ]
        },
        {
          title: 'diseases',
          key: 'diseases',
          icon: <FolderOutlined />,
          children: [
            { title: 'diabetes.yaml', key: 'diseases/diabetes.yaml', icon: <FileOutlined />, isLeaf: true },
            { title: 'obesity.yaml', key: 'diseases/obesity.yaml', icon: <FileOutlined />, isLeaf: true },
          ]
        },
        {
          title: 'social',
          key: 'social',
          icon: <FolderOutlined />,
          children: [
            { title: 'policy_impact.yaml', key: 'social/policy_impact.yaml', icon: <FileOutlined />, isLeaf: true },
          ]
        },
      ]
    }
  ]);

  // 模拟模型数据库
  const [modelDatabase] = useState<Record<string, ModelFile>>({
    'physiology/physiology.yaml': {
      key: 'physiology/physiology.yaml',
      title: 'physiology',
      path: 'physiology/physiology.yaml',
      folder: 'physiology',
      metadata: {
        name: 'physiology',
        version: '2.1.0',
        author: 'Minghui Wu',
        description: '肝、胰腺、胃、小肠等器官功能系数及恢复机制',
        tags: ['organs', 'function'],
      },
      variables: {
        liver_function: { description: '肝功能系数', value: 1.0, unit: '系数', type: 'parameters', bounds: [0.1, 1.0] },
        pancreatic_function: { description: '胰腺功能系数', value: 1.0, unit: '系数', type: 'parameters', bounds: [0.1, 1.0] },
        water: { description: '喝水', value: 1.0, unit: 'L', type: 'input', bounds: [0.0, 1.0] },
        gastric_function: { description: '胃功能效率', value: 0.9, unit: '系数', type: 'state', bounds: [0.0, 1.0] },
        intestinal_function: { description: '小肠功能效率', value: 0.85, unit: '系数', type: 'state', bounds: [0.0, 1.0] },
        kidney_function: { description: '肾功能系数', value: 0.8, unit: '系数', type: 'state', bounds: [0.0, 1.0] },
      },
      formulas: {
        organ_function_recovery: {
          description: '休息状态下器官功能逐渐恢复',
          condition: 'blood_glucose < 120 and plasma_insulin < 20 and physical_activity == 0',
          dynamics: {
            gastric_function: 'min(1.0, gastric_function + 0.0001)',
            pancreatic_function: 'min(1.0, pancreatic_function + 0.00005)',
            liver_function: 'min(1.0, liver_function + 0.0001)',
            intestinal_function: 'min(1.0, intestinal_function + 0.0001)',
            kidney_function: 'min(1.0, kidney_function + 0.0001)',
          },
          priority: 2,
        },
      },
      simulator: {
        step_size: 1,
        total_time: 1440,
        output_format: 'csv',
        output_variables: ['liver_function', 'pancreatic_function', 'gastric_function', 'intestinal_function', 'kidney_function'],
      },
      optimizer: {
        method: 'grid',
        duration: 60.0,
        targets_of_optimization: ['energy_expenditure'],
        variables_to_optimize: ['insulin_sensitivity'],
      },
    },
  });

  // 选择模型时的处理
  const handleSelect = (selectedKeys: React.Key[]) => {
    setSelectedKeys(selectedKeys);
    if (selectedKeys.length > 0) {
      const key = selectedKeys[0] as string;
      if (key.endsWith('.yaml')) {
        const model = modelDatabase[key];
        if (model) {
          setSelectedModel(model);
          if (onModelSelect) {
            onModelSelect(model);
          }
          message.success(`已选择模型: ${model.metadata?.name || key}`);
        }
      }
    }
  };

  // 刷新模型列表
  const refreshModels = () => {
    message.loading('正在刷新模型列表...', 1).then(() => {
      message.success('模型列表已刷新');
    });
  };

  // 合并选中的模型
  const mergeModels = () => {
    if (checkedKeys.length < 2) {
      message.warning('请至少选择 2 个模型进行合并');
      return;
    }
    message.success(`正在合并 ${checkedKeys.length} 个模型...`);
  };

  // 渲染变量列表
  const renderVariables = () => {
    if (!selectedModel?.variables) return <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>无变量数据</div>;
    
    const varsByType = {
      input: [] as any[],
      parameters: [] as any[],
      state: [] as any[],
    };

    Object.entries(selectedModel.variables).forEach(([name, data]: [string, any]) => {
      const type = data.type || 'state';
      if (varsByType[type as keyof typeof varsByType]) {
        varsByType[type as keyof typeof varsByType].push({ name, ...data });
      }
    });

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        {Object.entries(varsByType).map(([type, vars]) => (
          vars.length > 0 && (
            <Card key={type} size="small" title={
              <span>
                <Tag color={type === 'input' ? 'blue' : type === 'parameters' ? 'green' : 'orange'}>
                  {type.toUpperCase()}
                </Tag>
                {vars.length} 个变量
              </span>
            }>
              {vars.map((v: any, idx: number) => (
                <div key={idx} style={{ marginBottom: 8, padding: 8, background: '#fafafa', borderRadius: 4 }}>
                  <div style={{ fontWeight: 'bold' }}>{v.name}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    {v.description} | 初值: {v.value} {v.unit} | 范围: [{v.bounds?.[0]}, {v.bounds?.[1]}]
                  </div>
                </div>
              ))}
            </Card>
          )
        ))}
      </Space>
    );
  };

  // 渲染公式列表
  const renderFormulas = () => {
    if (!selectedModel?.formulas) return <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>无公式数据</div>;
    
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        {Object.entries(selectedModel.formulas).map(([name, formula]: [string, any], idx) => (
          <Card key={idx} size="small" style={{ background: '#f0f7ff' }}>
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{name}</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>{formula.description}</div>
            {formula.condition && (
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                <Tag color="orange">条件</Tag> {formula.condition}
              </div>
            )}
            <div style={{ fontSize: 12 }}>
              <Tag color="blue">优先级</Tag> {formula.priority || 100}
            </div>
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ fontSize: 12 }}>
              <strong>动力学方程:</strong>
              {Object.entries(formula.dynamics || {}).map(([varName, expr]: [string, any], i) => (
                <div key={i} style={{ marginLeft: 16, marginTop: 4, fontFamily: 'monospace', background: '#fff', padding: 4, borderRadius: 2 }}>
                  {varName} = {expr}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </Space>
    );
  };

  // 根据子页面渲染内容
  const renderSubPage = () => {
    switch (subPage) {
      case '2-1': // 浏览模型
        return renderBrowseModels();
      case '2-2': // 合并模型
        return renderMergeModels();
      case '2-3': // 依赖分析
        return renderDependencyAnalysis();
      default:
        return renderBrowseModels();
    }
  };

  // 浏览模型页面
  const renderBrowseModels = () => (
    <Row gutter={16} style={{ height: 'calc(100vh - 200px)' }}>
      <Col span={8}>
        <Card 
          title="模型文件树" 
          extra={
            <Space>
              <Button size="small" icon={<ReloadOutlined />} onClick={refreshModels}>刷新</Button>
            </Space>
          }
          style={{ height: '100%', overflow: 'auto' }}
        >
          <Input 
            prefix={<SearchOutlined />}
            placeholder="搜索模型..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <Tree
            showIcon
            defaultExpandAll
            selectedKeys={selectedKeys}
            onSelect={handleSelect}
            treeData={treeData}
          />
        </Card>
      </Col>
      
      <Col span={16}>
        {selectedModel ? (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {/* 元数据 */}
            <Card title="模型信息">
              <Descriptions bordered column={2} size="small">
                <Descriptions.Item label="名称">{selectedModel.metadata?.name}</Descriptions.Item>
                <Descriptions.Item label="版本">
                  <Tag color="blue">{selectedModel.metadata?.version}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="作者">{selectedModel.metadata?.author}</Descriptions.Item>
                <Descriptions.Item label="文件路径">{selectedModel.path}</Descriptions.Item>
                <Descriptions.Item label="描述" span={2}>{selectedModel.metadata?.description}</Descriptions.Item>
                <Descriptions.Item label="标签" span={2}>
                  {selectedModel.metadata?.tags?.map((tag: string, idx: number) => (
                    <Tag key={idx} color="purple">{tag}</Tag>
                  ))}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {/* 详细内容标签页 */}
            <Card>
              <Tabs
                items={[
                  {
                    key: 'variables',
                    label: `变量 (${Object.keys(selectedModel.variables || {}).length})`,
                    children: renderVariables(),
                  },
                  {
                    key: 'formulas',
                    label: `公式 (${Object.keys(selectedModel.formulas || {}).length})`,
                    children: renderFormulas(),
                  },
                  {
                    key: 'simulator',
                    label: '仿真配置',
                    children: selectedModel.simulator ? (
                      <Descriptions bordered column={2} size="small">
                        <Descriptions.Item label="步长">{selectedModel.simulator.step_size}</Descriptions.Item>
                        <Descriptions.Item label="总时间">{selectedModel.simulator.total_time}</Descriptions.Item>
                        <Descriptions.Item label="输出格式">{selectedModel.simulator.output_format}</Descriptions.Item>
                        <Descriptions.Item label="输出变量">
                          {selectedModel.simulator.output_variables?.join(', ')}
                        </Descriptions.Item>
                      </Descriptions>
                    ) : <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>无仿真配置</div>,
                  },
                  {
                    key: 'optimizer',
                    label: '优化配置',
                    children: selectedModel.optimizer ? (
                      <Descriptions bordered column={2} size="small">
                        <Descriptions.Item label="方法">{selectedModel.optimizer.method}</Descriptions.Item>
                        <Descriptions.Item label="持续时间">{selectedModel.optimizer.duration}s</Descriptions.Item>
                        <Descriptions.Item label="优化目标">
                          {selectedModel.optimizer.targets_of_optimization?.join(', ')}
                        </Descriptions.Item>
                        <Descriptions.Item label="优化变量">
                          {selectedModel.optimizer.variables_to_optimize?.join(', ')}
                        </Descriptions.Item>
                      </Descriptions>
                    ) : <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>无优化配置</div>,
                  },
                ]}
              />
            </Card>
          </Space>
        ) : (
          <Card style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: '#999' }}>
              <FileOutlined style={{ fontSize: 48, marginBottom: 16 }} />
              <div>请从左侧选择一个模型文件</div>
            </div>
          </Card>
        )}
      </Col>
    </Row>
  );

  // 合并模型页面
  const renderMergeModels = () => (
    <Card title="合并多个模型">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <div style={{ marginBottom: 8, fontWeight: 'bold' }}>选择要合并的模型:</div>
          <Tree
            checkable
            showIcon
            defaultExpandAll
            checkedKeys={checkedKeys}
            onCheck={(keys) => setCheckedKeys(keys as React.Key[])}
            treeData={treeData}
          />
        </div>
        <div>
          <Tag color="blue">{checkedKeys.length} 个模型已选中</Tag>
        </div>
        <Button type="primary" icon={<MergeOutlined />} onClick={mergeModels}>
          合并模型
        </Button>
      </Space>
    </Card>
  );

  // 依赖分析页面
  const renderDependencyAnalysis = () => (
    <Card title="模型依赖关系分析">
      <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
        依赖分析功能开发中...
        <div style={{ marginTop: 16 }}>
          将显示模型间的 imports 关系、循环依赖检测等
        </div>
      </div>
    </Card>
  );

  return renderSubPage();
};

export default Loader;