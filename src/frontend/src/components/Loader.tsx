// frontend/src/components/Loader.tsx

import React, { useState, useEffect } from 'react';
import { Card, Tree, Row, Col, Descriptions, Tag, Button, Space, Input, message, Spin, Tabs } from 'antd';
import { 
  FolderOutlined,
  FileOutlined,
  ReloadOutlined,
  MergeOutlined,
  SearchOutlined,
  LoadingOutlined
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
  imports?: string[];
}

// API 基础地址
const API_BASE = 'http://localhost:3001/api';

const Loader: React.FC<LoaderProps> = ({ subPage, onModelSelect }) => {
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelFile | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<React.Key[]>([]);
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(['mods']);

  // 加载文件树
  const loadFileTree = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/files`);
      const result = await response.json();
      
      if (result.success) {
        // 转换数据格式以适配 Tree 组件
        const convertToTreeData = (items: any[]): DataNode[] => {
          return items.map(item => ({
            title: item.title,
            key: item.key,
            icon: item.type === 'folder' ? <FolderOutlined /> : <FileOutlined />,
            isLeaf: item.isLeaf || false,
            children: item.children ? convertToTreeData(item.children) : undefined,
          }));
        };
        
        const tree = convertToTreeData(result.data);
        setTreeData(tree);
        message.success(`已加载 ${countFiles(tree)} 个文件`);
      } else {
        message.error(`加载失败: ${result.error}`);
      }
    } catch (error: any) {
      message.error(`网络错误: ${error.message}`);
      console.error('Failed to load file tree:', error);
    } finally {
      setLoading(false);
    }
  };

  // 统计文件数量
  const countFiles = (nodes: DataNode[]): number => {
    let count = 0;
    nodes.forEach(node => {
      if (node.isLeaf) {
        count++;
      }
      if (node.children) {
        count += countFiles(node.children);
      }
    });
    return count;
  };

  // 加载文件内容
  const loadFileContent = async (filePath: string) => {
    setLoading(true);
    try {
      // 移除 'mods/' 前缀（如果有）
      const cleanPath = filePath.replace(/^mods\//, '');
      
      const response = await fetch(`${API_BASE}/file/${cleanPath}`);
      const result = await response.json();
      
      if (result.success) {
        const { content, path } = result.data;
        
        const model: ModelFile = {
          key: filePath,
          title: content.metadata?.name || path.split('/').pop()?.replace('.yaml', '') || 'unknown',
          path: filePath,
          metadata: content.metadata,
          variables: content.variables,
          formulas: content.formulas,
          simulator: content.simulator,
          optimizer: content.optimizer,
          imports: content.imports,
        };
        
        setSelectedModel(model);
        if (onModelSelect) {
          onModelSelect(model);
        }
        message.success(`已加载模型: ${model.title}`);
      } else {
        message.error(`加载失败: ${result.error}`);
      }
    } catch (error: any) {
      message.error(`网络错误: ${error.message}`);
      console.error('Failed to load file content:', error);
    } finally {
      setLoading(false);
    }
  };

  // 搜索文件
  const searchFiles = async (keyword: string) => {
    if (!keyword.trim()) {
      loadFileTree();
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(keyword)}`);
      const result = await response.json();
      
      if (result.success) {
        const searchResults: DataNode[] = result.data.map((item: any) => ({
          title: item.title,
          key: item.key,
          icon: <FileOutlined />,
          isLeaf: true,
        }));
        
        setTreeData([{
          title: `搜索结果 (${searchResults.length})`,
          key: 'search-results',
          icon: <SearchOutlined />,
          children: searchResults,
        }]);
        
        setExpandedKeys(['search-results']);
      }
    } catch (error: any) {
      message.error(`搜索失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadFileTree();
  }, []);

  // 选择文件时的处理
  const handleSelect = (selectedKeys: React.Key[]) => {
    setSelectedKeys(selectedKeys);
    if (selectedKeys.length > 0) {
      const key = selectedKeys[0] as string;
      // 只加载 .yaml 或 .yml 文件
      if (key.endsWith('.yaml') || key.endsWith('.yml')) {
        loadFileContent(key);
      }
    }
  };

  // 刷新模型列表
  const refreshModels = () => {
    setSearchText('');
    loadFileTree();
  };

  // 合并选中的模型
  const mergeModels = () => {
    if (checkedKeys.length < 2) {
      message.warning('请至少选择 2 个模型进行合并');
      return;
    }
    
    const yamlFiles = checkedKeys.filter(key => 
      String(key).endsWith('.yaml') || String(key).endsWith('.yml')
    );
    
    if (yamlFiles.length < 2) {
      message.warning('请至少选择 2 个 YAML 文件');
      return;
    }
    
    message.info(`正在合并 ${yamlFiles.length} 个模型...（功能开发中）`);
    // TODO: 实现合并逻辑，调用后端 API
  };

  // 渲染变量列表
  const renderVariables = () => {
    if (!selectedModel?.variables) {
      return <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>无变量数据</div>;
    }
    
    const varsByType = {
      input: [] as any[],
      parameters: [] as any[],
      state: [] as any[],
      other: [] as any[], // 兼容其他类型
    };

    Object.entries(selectedModel.variables).forEach(([name, data]: [string, any]) => {
      const type = (data.type || 'state').toLowerCase();
      const item = { name, ...data };
      
      if (varsByType[type as keyof typeof varsByType]) {
        varsByType[type as keyof typeof varsByType].push(item);
      } else {
        varsByType.other.push(item);
      }
    });

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        {Object.entries(varsByType).map(([type, vars]) => (
          vars.length > 0 && (
            <Card key={type} size="small" title={
              <span>
                <Tag color={
                  type === 'input' ? 'blue' : 
                  type === 'parameters' ? 'green' : 
                  type === 'state' ? 'orange' : 'default'
                }>
                  {type.toUpperCase()}
                </Tag>
                {vars.length} 个变量
              </span>
            }>
              {vars.map((v: any, idx: number) => (
                <div key={idx} style={{ 
                  marginBottom: 8, 
                  padding: 8, 
                  background: '#fafafa', 
                  borderRadius: 4,
                  border: '1px solid #f0f0f0'
                }}>
                  <div style={{ fontWeight: 'bold', color: '#1890ff' }}>{v.name}</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    {v.description || '无描述'}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    <Tag color="blue">初值: {v.value}</Tag>
                    <Tag>{v.unit || '无单位'}</Tag>
                    {v.bounds && (
                      <Tag color="orange">范围: [{v.bounds[0]}, {v.bounds[1]}]</Tag>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          )
        ))}
        {Object.values(varsByType).every(arr => arr.length === 0) && (
          <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
            该模型没有定义变量
          </div>
        )}
      </Space>
    );
  };

  // 渲染公式列表
  const renderFormulas = () => {
    if (!selectedModel?.formulas) {
      return <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>无公式数据</div>;
    }
    
    const formulaEntries = Object.entries(selectedModel.formulas);
    
    if (formulaEntries.length === 0) {
      return <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>该模型没有定义公式</div>;
    }

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        {formulaEntries.map(([name, formula]: [string, any], idx) => (
          <Card key={idx} size="small" style={{ background: '#f0f7ff', border: '1px solid #d6e4ff' }}>
            <div style={{ fontWeight: 'bold', marginBottom: 4, color: '#1890ff', fontSize: 14 }}>
              {name}
            </div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
              {formula.description || '无描述'}
            </div>
            {formula.condition && (
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                <Tag color="orange">触发条件</Tag> 
                <code style={{ background: '#fff', padding: '2px 6px', borderRadius: 2 }}>
                  {formula.condition}
                </code>
              </div>
            )}
            <div style={{ fontSize: 12, marginBottom: 4 }}>
              <Tag color="blue">优先级</Tag> {formula.priority || 100}
            </div>
            {formula.dynamics && Object.keys(formula.dynamics).length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 'bold', marginTop: 8, marginBottom: 4 }}>
                  动力学方程:
                </div>
                {Object.entries(formula.dynamics).map(([varName, expr]: [string, any], i) => (
                  <div key={i} style={{ 
                    marginLeft: 16, 
                    marginTop: 4, 
                    fontFamily: 'Consolas, Monaco, monospace', 
                    background: '#fff', 
                    padding: '4px 8px', 
                    borderRadius: 2,
                    border: '1px solid #e8e8e8',
                    fontSize: 12
                  }}>
                    <span style={{ color: '#cf1322', fontWeight: 'bold' }}>{varName}</span>
                    <span style={{ color: '#666' }}> = </span>
                    <span style={{ color: '#096dd9' }}>{expr}</span>
                  </div>
                ))}
              </>
            )}
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
    <Spin spinning={loading} indicator={<LoadingOutlined style={{ fontSize: 24 }} />}>
      <Row gutter={16} style={{ height: 'calc(100vh - 200px)' }}>
        <Col span={8}>
          <Card 
            title="模型文件树" 
            extra={
              <Space>
                <Button size="small" icon={<ReloadOutlined />} onClick={refreshModels}>
                  刷新
                </Button>
              </Space>
            }
            style={{ height: '100%', overflow: 'auto' }}
          >
            <Input 
              prefix={<SearchOutlined />}
              placeholder="搜索模型文件..."
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                if (e.target.value.trim()) {
                  searchFiles(e.target.value);
                } else {
                  loadFileTree();
                }
              }}
              style={{ marginBottom: 12 }}
              allowClear
            />
            <Tree
              showIcon
              expandedKeys={expandedKeys}
              onExpand={(keys) => setExpandedKeys(keys)}
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
                  <Descriptions.Item label="名称">{selectedModel.metadata?.name || '未命名'}</Descriptions.Item>
                  <Descriptions.Item label="版本">
                    <Tag color="blue">{selectedModel.metadata?.version || '未指定'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="作者">{selectedModel.metadata?.author || '未知'}</Descriptions.Item>
                  <Descriptions.Item label="文件路径">
                    <code style={{ fontSize: 11 }}>{selectedModel.path}</code>
                  </Descriptions.Item>
                  <Descriptions.Item label="描述" span={2}>
                    {selectedModel.metadata?.description || '无描述'}
                  </Descriptions.Item>
                  <Descriptions.Item label="标签" span={2}>
                    {selectedModel.metadata?.tags?.length > 0 ? (
                      selectedModel.metadata.tags.map((tag: string, idx: number) => (
                        <Tag key={idx} color="purple">{tag}</Tag>
                      ))
                    ) : (
                      <span style={{ color: '#999' }}>无标签</span>
                    )}
                  </Descriptions.Item>
                  {selectedModel.imports && selectedModel.imports.length > 0 && (
                    <Descriptions.Item label="导入模型" span={2}>
                      {selectedModel.imports.map((imp: string, idx: number) => (
                        <Tag key={idx} color="cyan">{imp}</Tag>
                      ))}
                    </Descriptions.Item>
                  )}
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
                          <Descriptions.Item label="输出格式">{selectedModel.simulator.output_format || 'csv'}</Descriptions.Item>
                          <Descriptions.Item label="输出变量" span={2}>
                            {selectedModel.simulator.output_variables?.map((v: string, idx: number) => (
                              <Tag key={idx} color="green">{v}</Tag>
                            )) || <span style={{ color: '#999' }}>无</span>}
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
                          <Descriptions.Item label="优化目标" span={2}>
                            {selectedModel.optimizer.targets_of_optimization?.map((t: string, idx: number) => (
                              <Tag key={idx} color="orange">{t}</Tag>
                            )) || <span style={{ color: '#999' }}>无</span>}
                          </Descriptions.Item>
                          <Descriptions.Item label="优化变量" span={2}>
                            {selectedModel.optimizer.variables_to_optimize?.map((v: string, idx: number) => (
                              <Tag key={idx} color="purple">{v}</Tag>
                            )) || <span style={{ color: '#999' }}>无</span>}
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
                <div>请从左侧选择一个 YAML 文件</div>
                <div style={{ fontSize: 12, marginTop: 8 }}>支持 .yaml 和 .yml 格式</div>
              </div>
            </Card>
          )}
        </Col>
      </Row>
    </Spin>
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
            expandedKeys={expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys)}
            checkedKeys={checkedKeys}
            onCheck={(keys) => setCheckedKeys(keys as React.Key[])}
            treeData={treeData}
          />
        </div>
        <div>
          <Tag color="blue">{checkedKeys.filter(k => String(k).endsWith('.yaml') || String(k).endsWith('.yml')).length} 个模型已选中</Tag>
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
      {selectedModel?.imports && selectedModel.imports.length > 0 ? (
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <strong>当前模型:</strong> {selectedModel.metadata?.name || selectedModel.title}
          </div>
          <div>
            <strong>导入的模型:</strong>
            <div style={{ marginTop: 8 }}>
              {selectedModel.imports.map((imp: string, idx: number) => (
                <Tag key={idx} color="cyan" style={{ marginBottom: 4 }}>{imp}</Tag>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 16, padding: 12, background: '#f0f7ff', borderRadius: 4 }}>
            <strong>提示:</strong> imports 字段用于引入其他模型的变量和公式，支持递归加载。
          </div>
        </Space>
      ) : (
        <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
          {selectedModel ? '当前模型没有导入其他模型' : '请先选择一个模型'}
        </div>
      )}
    </Card>
  );

  return renderSubPage();
};

export default Loader;