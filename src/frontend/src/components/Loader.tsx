// frontend/src/components/Loader.tsx

import React, { useState, useEffect } from 'react';
import { Card, Tree, Row, Col, Descriptions, Tag, Button, Space, Input, message, Spin, Tabs, Empty, Modal, Select, Form, Alert } from 'antd';
import { 
  FolderOutlined,
  FileOutlined,
  ReloadOutlined,
  MergeOutlined,
  SearchOutlined,
  LoadingOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ScissorOutlined,
  SendOutlined,
  InfoCircleOutlined
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
  metadata?: any;
  variables?: Record<string, any>;
  formulas?: Record<string, any>;
  simulator?: any;
  optimizer?: any;
  imports?: string[];
  validated?: boolean;
  validationErrors?: string[];
  patchFile?: string;
}

const API_BASE = '/api';

const Loader: React.FC<LoaderProps> = ({ subPage, onModelSelect }) => {
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelFile | null>(null);
  const [confirmedModel, setConfirmedModel] = useState<ModelFile | null>(null); // 确认后的模型
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<React.Key[]>([]);
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(['mods']);
  const [mergeModalVisible, setMergeModalVisible] = useState(false);
  const [splitModalVisible, setSplitModalVisible] = useState(false);
  const [mergeForm] = Form.useForm();
  const [splitForm] = Form.useForm();

  // 加载文件树
  const loadFileTree = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/files`);
      const result = await response.json();
      
      if (result.success) {
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

  const countFiles = (nodes: DataNode[]): number => {
    let count = 0;
    nodes.forEach(node => {
      if (node.isLeaf) count++;
      if (node.children) count += countFiles(node.children);
    });
    return count;
  };

  // 加载文件内容（不自动确认）
  const loadFileContent = async (filePath: string) => {
    setLoading(true);
    try {
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
          validated: false,
        };
        
        setSelectedModel(model);
        message.info(`已选择模型: ${model.title}，点击"确认并验证"按钮加载到系统`);
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

  // 确认并验证模型
  const confirmAndValidateModel = async () => {
    if (!selectedModel) {
      message.warning('请先选择一个模型');
      return;
    }

    setLoading(true);
    try {
      // 调用验证 API
      const response = await fetch(`${API_BASE}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: selectedModel.path.replace(/^mods\//, ''),
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        const validatedModel = {
          ...selectedModel,
          validated: true,
          validationErrors: [],
          patchFile: result.data?.patch_file,
        };
        
        setConfirmedModel(validatedModel);
        if (onModelSelect) {
          onModelSelect(validatedModel);
        }
        
        if (result.data?.patch_file) {
          message.success(
            <span>
              ✅ 模型验证通过！已生成补丁文件<br/>
              <code style={{ fontSize: 11 }}>{result.data.patch_file}</code>
            </span>,
            5
          );
        } else {
          message.success('✅ 模型验证通过！可以进入 Simulator 运行仿真');
        }
      } else {
        const validatedModel = {
          ...selectedModel,
          validated: false,
          validationErrors: result.errors || [result.error],
          patchFile: result.data?.patch_file,
        };
        
        setConfirmedModel(validatedModel);
        
        Modal.error({
          title: '模型验证失败',
          width: 600,
          content: (
            <div>
              <div style={{ marginBottom: 12 }}>发现以下问题：</div>
              <div style={{ maxHeight: 300, overflow: 'auto', background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                {(result.errors || [result.error]).map((err: string, idx: number) => (
                  <div key={idx} style={{ marginBottom: 4, fontSize: 12 }}>
                    • {err}
                  </div>
                ))}
              </div>
              {result.data?.patch_file && (
                <Alert
                  message="已生成补丁文件"
                  description={
                    <div style={{ fontSize: 12 }}>
                      <div>补丁文件: <code>{result.data.patch_file}</code></div>
                      <div style={{ marginTop: 4 }}>请将补丁文件与原模型一起加载，或手动修复缺失的变量</div>
                    </div>
                  }
                  type="info"
                  style={{ marginTop: 12 }}
                  showIcon
                />
              )}
            </div>
          ),
        });
      }
    } catch (error: any) {
      message.error(`验证失败: ${error.message}`);
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

  useEffect(() => {
    loadFileTree();
  }, []);

  const handleSelect = (selectedKeys: React.Key[]) => {
    setSelectedKeys(selectedKeys);
    if (selectedKeys.length > 0) {
      const key = selectedKeys[0] as string;
      if (key.endsWith('.yaml') || key.endsWith('.yml')) {
        loadFileContent(key);
        // 清空已确认的模型（需要重新确认）
        setConfirmedModel(null);
      }
    }
  };

  const refreshModels = () => {
    setSearchText('');
    setSelectedModel(null);
    setConfirmedModel(null);
    loadFileTree();
  };

  // 合并模型
  const handleMerge = async () => {
    const yamlFiles = checkedKeys.filter(key => 
      String(key).endsWith('.yaml') || String(key).endsWith('.yml')
    );
    
    if (yamlFiles.length < 2) {
      message.warning('请至少选择 2 个模型文件进行合并');
      return;
    }

    setMergeModalVisible(true);
  };

  const confirmMerge = async () => {
    try {
      const values = await mergeForm.validateFields();
      setLoading(true);

      const yamlFiles = checkedKeys
        .filter(key => String(key).endsWith('.yaml') || String(key).endsWith('.yml'))
        .map(key => String(key).replace(/^mods\//, '').replace(/\.(yaml|yml)$/, ''));

      const response = await fetch(`${API_BASE}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_names: yamlFiles,
          output_name: values.output_name,
        }),
      });

      const result = await response.json();

      if (result.success) {
        message.success(
          <span>
            ✅ {result.data.message}<br/>
            输出文件: <code style={{ fontSize: 11 }}>{result.data.output_path}</code>
          </span>,
          5
        );
        setMergeModalVisible(false);
        mergeForm.resetFields();
        refreshModels();
      } else {
        Modal.error({
          title: '合并失败',
          content: result.error,
        });
      }
    } catch (error: any) {
      message.error(`合并失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 拆分模型
  const handleSplit = () => {
    if (!confirmedModel) {
      message.warning('请先选择并确认一个模型');
      return;
    }
    setSplitModalVisible(true);
    splitForm.setFieldsValue({
      model_name: confirmedModel.title,
    });
  };

  const confirmSplit = async () => {
    try {
      const values = await splitForm.validateFields();
      setLoading(true);

      const response = await fetch(`${API_BASE}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: confirmedModel!.path.replace(/^mods\//, ''),
          output_dir: values.output_dir,
        }),
      });

      const result = await response.json();

      if (result.success) {
        Modal.success({
          title: '拆分成功',
          width: 600,
          content: (
            <div>
              <div>已将模型拆分为多个文件：</div>
              <div style={{ marginTop: 12, background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                <div>📁 输出目录: <code>{result.data.output_dir}</code></div>
                <div style={{ marginTop: 8 }}>
                  <strong>生成的文件:</strong>
                  <ul style={{ marginTop: 4, marginBottom: 0, paddingLeft: 20 }}>
                    {result.data.files?.map((file: string, idx: number) => (
                      <li key={idx} style={{ fontSize: 12 }}><code>{file}</code></li>
                    ))}
                  </ul>
                </div>
                {result.data.patch_file && (
                  <Alert
                    message="补丁文件"
                    description={<code style={{ fontSize: 11 }}>{result.data.patch_file}</code>}
                    type="info"
                    style={{ marginTop: 8 }}
                    size="small"
                  />
                )}
              </div>
            </div>
          ),
        });
        setSplitModalVisible(false);
        splitForm.resetFields();
        refreshModels();
      } else {
        Modal.error({
          title: '拆分失败',
          content: result.error,
        });
      }
    } catch (error: any) {
      message.error(`拆分失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 渲染变量列表
  const renderVariables = () => {
    if (!selectedModel?.variables) {
      return <Empty description="无变量数据" />;
    }
    
    const varsByType = {
      input: [] as any[],
      parameters: [] as any[],
      state: [] as any[],
      other: [] as any[],
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
      </Space>
    );
  };

  // 渲染公式列表
  const renderFormulas = () => {
    if (!selectedModel?.formulas) {
      return <Empty description="无公式数据" />;
    }
    
    const formulaEntries = Object.entries(selectedModel.formulas);
    
    if (formulaEntries.length === 0) {
      return <Empty description="该模型没有定义公式" />;
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
            {formula.condition && formula.condition !== true && (
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                <Tag color="orange">触发条件</Tag> 
                <code style={{ background: '#fff', padding: '2px 6px', borderRadius: 2 }}>
                  {String(formula.condition)}
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
                    <span style={{ color: '#096dd9' }}>{String(expr)}</span>
                  </div>
                ))}
              </>
            )}
          </Card>
        ))}
      </Space>
    );
  };

  // 浏览模型页面
  const renderBrowseModels = () => (
    <Spin spinning={loading} indicator={<LoadingOutlined style={{ fontSize: 24 }} />}>
      <Row gutter={16} style={{ height: 'calc(100vh - 200px)' }}>
        <Col span={8}>
          <Card 
            title="模型文件树" 
            extra={
              <Button size="small" icon={<ReloadOutlined />} onClick={refreshModels}>
                刷新
              </Button>
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
              {/* 操作按钮区 */}
              <Card>
                <Space wrap>
                  <Button 
                    type="primary" 
                    icon={<CheckCircleOutlined />}
                    onClick={confirmAndValidateModel}
                    loading={loading}
                    size="large"
                  >
                    确认并验证模型
                  </Button>
                  
                  {confirmedModel && confirmedModel.validated && (
                    <Tag icon={<CheckCircleOutlined />} color="success" style={{ marginLeft: 8, fontSize: 14, padding: '4px 12px' }}>
                      ✅ 已验证，可进入 Simulator
                    </Tag>
                  )}
                  
                  {confirmedModel && !confirmedModel.validated && (
                    <Tag icon={<ExclamationCircleOutlined />} color="error" style={{ marginLeft: 8, fontSize: 14, padding: '4px 12px' }}>
                      ❌ 验证失败
                    </Tag>
                  )}
                  
                  <Button 
                    icon={<ScissorOutlined />}
                    onClick={handleSplit}
                    disabled={!confirmedModel}
                  >
                    拆分模型
                  </Button>
                </Space>
                
                {confirmedModel?.patchFile && (
                  <Alert
                    message="补丁文件"
                    description={<code style={{ fontSize: 11 }}>{confirmedModel.patchFile}</code>}
                    type="info"
                    style={{ marginTop: 12 }}
                    showIcon
                    closable
                  />
                )}
              </Card>

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
                      ) : <Empty description="无仿真配置" />,
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
                      ) : <Empty description="无优化配置" />,
                    },
                  ]}
                />
              </Card>
            </Space>
          ) : (
            <Card style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Empty 
                description={
                  <div>
                    <FileTextOutlined style={{ fontSize: 48, marginBottom: 16, color: '#d9d9d9' }} />
                    <div>请从左侧选择一个 YAML 文件</div>
                    <div style={{ fontSize: 12, marginTop: 8, color: '#999' }}>
                      选择后点击"确认并验证模型"按钮
                    </div>
                  </div>
                }
              />
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
        <Alert
          message="操作说明"
          description="勾选要合并的模型文件，然后点击合并按钮。合并过程会自动验证模型并生成补丁文件（如果需要）。"
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
        />
        
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
          <Tag color="blue">
            {checkedKeys.filter(k => String(k).endsWith('.yaml') || String(k).endsWith('.yml')).length} 个模型已选中
          </Tag>
        </div>
        
        <Button 
          type="primary" 
          icon={<MergeOutlined />} 
          onClick={handleMerge}
          disabled={checkedKeys.filter(k => String(k).endsWith('.yaml') || String(k).endsWith('.yml')).length < 2}
          size="large"
        >
          合并选中的模型
        </Button>
      </Space>
    </Card>
  );

  // 依赖分析页面
  const renderDependencyAnalysis = () => (
    <Card title="模型依赖关系分析">
      {confirmedModel?.imports && confirmedModel.imports.length > 0 ? (
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <strong>当前模型:</strong> {confirmedModel.metadata?.name || confirmedModel.title}
          </div>
          <div>
            <strong>导入的模型:</strong>
            <div style={{ marginTop: 8 }}>
              {confirmedModel.imports.map((imp: string, idx: number) => (
                <Tag key={idx} color="cyan" style={{ marginBottom: 4 }}>{imp}</Tag>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 16, padding: 12, background: '#f0f7ff', borderRadius: 4 }}>
            <strong>提示:</strong> imports 字段用于引入其他模型的变量和公式，支持递归加载。
          </div>
        </Space>
      ) : (
        <Empty description={confirmedModel ? '当前模型没有导入其他模型' : '请先选择并确认一个模型'} />
      )}
    </Card>
  );

  // 根据子页面渲染内容
  const renderSubPage = () => {
    switch (subPage) {
      case '2-1':
        return renderBrowseModels();
      case '2-2':
        return renderMergeModels();
      case '2-3':
        return renderDependencyAnalysis();
      default:
        return renderBrowseModels();
    }
  };

  return (
    <>
      {renderSubPage()}
      
      {/* 合并模态框 */}
      <Modal
        title="合并模型"
        open={mergeModalVisible}
        onOk={confirmMerge}
        onCancel={() => setMergeModalVisible(false)}
        confirmLoading={loading}
        width={600}
      >
        <Form form={mergeForm} layout="vertical">
          <Alert
            message="合并信息"
            description={`将合并 ${checkedKeys.filter(k => String(k).endsWith('.yaml') || String(k).endsWith('.yml')).length} 个模型文件`}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          
          <Form.Item
            label="输出文件名"
            name="output_name"
            rules={[{ required: true, message: '请输入输出文件名' }]}
            initialValue="merged_model"
          >
            <Input 
              placeholder="merged_model" 
              addonBefore="mods/merged/"
              addonAfter=".yaml"
            />
          </Form.Item>
          
          <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, fontSize: 12 }}>
            <div style={{ marginBottom: 4 }}><strong>选中的模型:</strong></div>
            {checkedKeys
              .filter(k => String(k).endsWith('.yaml') || String(k).endsWith('.yml'))
              .map((key, idx) => (
                <div key={idx} style={{ marginLeft: 12 }}>• {String(key)}</div>
              ))
            }
          </div>
          
          <Alert
            message="注意"
            description="合并过程会自动验证模型，如果发现缺失变量会生成补丁文件"
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
          />
        </Form>
      </Modal>

      {/* 拆分模态框 */}
      <Modal
        title="拆分模型"
        open={splitModalVisible}
        onOk={confirmSplit}
        onCancel={() => setSplitModalVisible(false)}
        confirmLoading={loading}
        width={600}
      >
        <Form form={splitForm} layout="vertical">
          <Alert
            message="拆分说明"
            description="将模型拆分为多个独立的公式文件和一个共享变量文件"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          
          <Form.Item label="模型名称">
            <Input value={confirmedModel?.title} disabled />
          </Form.Item>
          
          <Form.Item
            label="输出目录名"
            name="output_dir"
            rules={[{ required: true, message: '请输入输出目录名' }]}
            initialValue={confirmedModel?.title || 'split_output'}
          >
            <Input 
              placeholder="split_output" 
              addonBefore="mods/splited/"
            />
          </Form.Item>
          
          <Alert
            message="拆分结果"
            description={
              <div style={{ fontSize: 12 }}>
                <div>• 每个独立公式生成一个文件</div>
                <div>• 共享的变量和公式保存在 _remaining.yaml</div>
                <div>• 如果有缺失变量，会生成补丁文件</div>
              </div>
            }
            type="info"
            showIcon
            style={{ marginTop: 12 }}
          />
        </Form>
      </Modal>
    </>
  );
};

export default Loader;