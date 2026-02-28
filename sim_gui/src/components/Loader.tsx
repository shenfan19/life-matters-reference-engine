// frontend/src/components/Loader.tsx

import React, { useState, useEffect } from 'react';
import { Card, Tree, Descriptions, Tag, Button, Space, Input, message, Spin, Tabs, Empty, Modal, Form, Alert, Checkbox, Divider } from 'antd';
import {
  FolderOutlined,
  FileOutlined,
  MergeOutlined,
  LoadingOutlined,
  ScissorOutlined,
  InfoCircleOutlined,
  DatabaseOutlined,
  BookOutlined,
  UnorderedListOutlined,
  ClusterOutlined,
  SortAscendingOutlined,
  LockOutlined,
  UnlockOutlined,
  FileProtectOutlined,
  ClearOutlined,
  FilterOutlined
} from '@ant-design/icons';
import type { ModelFile, DataNode } from '../types';
import { useI18n } from '../core/i18n';

interface LoaderProps {
  subPage: string;
  onModelSelect?: (model: ModelFile | null) => void;
  confirmedModel: ModelFile | null;
  setConfirmedModel: (model: ModelFile | null) => void;
  modelTree: DataNode[];
  setModelTree: (tree: DataNode[]) => void;
  storyTree: DataNode[];
  setStoryTree: (tree: DataNode[]) => void;
  expandedKeys: React.Key[];
  setExpandedKeys: (keys: React.Key[]) => void;
  modelViewMode: 'tree' | 'list';
  setModelViewMode: (mode: 'tree' | 'list') => void;
  storyViewMode: 'tree' | 'list';
  setStoryViewMode: (mode: 'tree' | 'list') => void;
  modelFilter: string;
  setModelFilter: (filter: string) => void;
  storyFilter: string;
  setStoryFilter: (filter: string) => void;
  modelSort: 'name' | 'type';
  setModelSort: (sort: 'name' | 'type') => void;
  storySort: 'name' | 'type';
  setStorySort: (sort: 'name' | 'type') => void;
  checkedModelKeys: React.Key[];
  setCheckedModelKeys: (keys: React.Key[]) => void;
  manualCheckedModelKeys: React.Key[];
  setManualCheckedModelKeys: (keys: React.Key[] | ((prev: React.Key[]) => React.Key[])) => void;
  checkedStoryKeys: React.Key[];
  setCheckedStoryKeys: (keys: React.Key[]) => void;
  loadedMods: Record<string, ModelFile>;
  setLoadedMods: (mods: Record<string, ModelFile> | ((prev: Record<string, ModelFile>) => Record<string, ModelFile>)) => void;
  isSimulating?: boolean;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
  isDarkMode: boolean;
}

const API_BASE = '/api';

const Loader: React.FC<LoaderProps> = ({
  subPage,
  onModelSelect,
  confirmedModel,
  setConfirmedModel,
  modelTree,
  setModelTree,
  storyTree,
  setStoryTree,
  expandedKeys,
  setExpandedKeys,
  modelViewMode,
  setModelViewMode,
  storyViewMode,
  setStoryViewMode,
  modelFilter,
  setModelFilter,
  storyFilter,
  setStoryFilter,
  modelSort,
  setModelSort,
  storySort,
  setStorySort,
  checkedModelKeys,
  setCheckedModelKeys,
  manualCheckedModelKeys,
  setManualCheckedModelKeys,
  checkedStoryKeys,
  setCheckedStoryKeys,
  loadedMods,
  setLoadedMods,
  isSimulating = false,
  isLocked,
  setIsLocked,
  isDarkMode
}) => {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelFile | null>(null);
  const [mergeModalVisible, setMergeModalVisible] = useState(false);
  const [splitModalVisible, setSplitModalVisible] = useState(false);
  const [highlightPatch, setHighlightPatch] = useState(false);
  const [mergeForm] = Form.useForm();
  const [splitForm] = Form.useForm();

  // 统一计算选中的内容
  const allCheckedKeys = [...checkedModelKeys, ...checkedStoryKeys] as string[];
  const selectedMods = allCheckedKeys
    .map(k => loadedMods[k])
    .filter(Boolean);

  // 核心联动逻辑：响应式计算选中模型
  useEffect(() => {
    const requiredByStories = new Set<string>();

    checkedStoryKeys.forEach(sKey => {
      const story = loadedMods[String(sKey)];
      if (story && story.imports) {
        story.imports.forEach(imp => {
          let key = imp.replace(/\\/g, '/');
          if (!key.endsWith('.yaml') && !key.endsWith('.yml')) key += '.yaml';

          // 确保与 Tree Key 格式一致 (不带 mods/ 前缀，但确保有 models/ 前置)
          const normalizedKey = key.startsWith('models/') ? key : `models/${key}`;
          requiredByStories.add(normalizedKey);
        });
      }
    });

    const finalKeys = [...new Set([...manualCheckedModelKeys.map(String), ...Array.from(requiredByStories)])];

    // 仅在真实变化时更新，避免死循环
    if (JSON.stringify([...finalKeys].sort()) !== JSON.stringify([...checkedModelKeys].sort())) {
      setCheckedModelKeys(finalKeys);
    }
  }, [checkedStoryKeys, manualCheckedModelKeys, loadedMods]);

  const countLeaves = (nodes: DataNode[]): number => {
    let count = 0;
    nodes.forEach(node => {
      if (node.isLeaf) count++;
      else if (node.children) count += countLeaves(node.children);
    });
    return count;
  };

  useEffect(() => {
    if (modelTree.length === 0) {
      loadFileTree();
    }
  }, []);
  const loadFileTree = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/files`);
      const result = await response.json();

      if (result.success) {
        const convertToTreeData = (items: any[]): DataNode[] => {
          return items.map(item => {
            const titleStr = item.type === 'file' ? item.title.replace(/\.ya?ml$/, '') : item.title;

            // [New Logic] 如果文件夹内只有一个 mod.yaml, 则合并为一个节点
            if (item.type === 'folder' && item.children?.length === 1) {
              const onlyChild = item.children[0];
              if (onlyChild.type === 'file' && (onlyChild.title === 'mod.yaml' || onlyChild.title === 'mod.yml')) {
                return {
                  key: onlyChild.key, // 使用文件的 key 方便加载
                  icon: <FolderOutlined style={{ color: '#faad14' }} />,
                  isLeaf: true,
                  ...onlyChild,
                  title: (
                    <span>
                      {item.title} <Tag color="orange" style={{ fontSize: '10px' }}>pkg</Tag>
                    </span>
                  ),
                  titleStr: item.title, // [Crucial] 文件夹名作为 mod 名
                  mod_type: onlyChild.mod_type || (item.key === 'scenarios' || item.parent?.key === 'scenarios' ? 'story' : 'model')
                };
              }
            }

            const titleNode = item.type === 'file' ? (
              <span>
                {titleStr}
                {item.mod_type && (
                  <Tag color={item.mod_type === 'model' ? 'blue' : 'green'} style={{ marginLeft: 8, fontSize: '10px' }}>
                    {item.mod_type}
                  </Tag>
                )}
              </span>
            ) : item.title;

            return {
              title: titleNode,
              key: item.key,
              icon: item.type === 'folder' ? <FolderOutlined /> : <FileOutlined />,
              isLeaf: item.type === 'file',
              children: item.children ? convertToTreeData(item.children) : undefined,
              titleStr: titleStr,
              mod_type: item.mod_type
            };
          });
        };

        // 拆分模型和故事
        const modsNode = result.data.find((n: any) => n.key === 'mods');
        if (modsNode && modsNode.children) {
          const mNode = modsNode.children.find((n: any) => n.key === 'models');
          const sNode = modsNode.children.find((n: any) => n.key === 'scenarios');

          if (mNode) {
            setModelTree(convertToTreeData(mNode.children || []));
          }
          if (sNode) {
            setStoryTree(convertToTreeData(sNode.children || []));
          }
        }

        message.success(t('common.success'));
      } else {
        message.error(`${t('common.error')}: ${result.error}`);
      }
    } catch (error: any) {
      message.error(`网络错误: ${error.message}`);
      console.error('Failed to load file tree:', error);
    } finally {
      setLoading(false);
    }
  };


  // 修复后的 loadFileContent 函数
  // 替换 Loader.tsx 第 98-133 行
  // 加载文件内容并自动验证(与 CLI 保持一致)
  const loadFileContent = async (filePath: string) => {
    setLoading(true);
    try {
      const cleanPath = filePath.replace(/^mods\//, '');

      // 步骤1: 读取文件内容
      const fileResponse = await fetch(`${API_BASE}/file/${cleanPath}`);
      const fileResult = await fileResponse.json();

      if (!fileResult.success) {
        message.error(`读取文件失败: ${fileResult.error}`);
        setLoading(false);
        return;
      }

      const { content, path } = fileResult.data;

      // 步骤2: 立即调用验证 API (与 CLI 保持一致)
      const validateResponse = await fetch(`${API_BASE}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: cleanPath }),
      });

      const validateResult = await validateResponse.json();

      // 步骤3: 构建模型对象 (无论验证成功与否)
      const model: ModelFile = {
        key: filePath,
        title: content.metadata?.name || path.split('/').pop()?.replace('.yaml', '') || 'unknown',
        path: filePath,
        type: content.type,
        category: content.category,
        content: content,  // 📝 修复: 添加 content 属性供 Simulator 使用
        metadata: content.metadata,
        variables: content.variables,
        formulas: content.formulas,
        simulator: content.simulator,
        optimizer: content.optimizer,
        imports: content.imports,
        folder: path.includes('/') ? path.split('/')[0] : undefined,
        validated: validateResult.success,
        validationErrors: validateResult.success ? [] : (validateResult.errors || [validateResult.error]),
        patchFile: validateResult.data?.patch_file,
      };

      setSelectedModel(model);
      setConfirmedModel(model);
      setLoadedMods(prev => ({ ...prev, [filePath]: model }));

      // 如果加载的是故事，处理导入的模型 (内容加载)
      if (model.type === 'story' && model.imports) {
        const importedKeys = model.imports.map(imp => {
          let key = imp.replace(/\\/g, '/');
          if (!key.endsWith('.yaml') && !key.endsWith('.yml')) {
            key += '.yaml';
          }
          // 去掉 mods/ 前缀以匹配 Tree Key 和 loadedMods 索引标准
          const cleanKey = key.startsWith('mods/') ? key.replace(/^mods\//, '') : key;
          // 确保是 models/ 开头 (如果是相对路径模型)
          return cleanKey.startsWith('models/') || cleanKey.startsWith('scenarios/') ? cleanKey : `models/${cleanKey}`;
        });

        // 递归加载导入的模型内容
        importedKeys.forEach(k => {
          if (!loadedMods[k]) {
            loadFileContent(k);
          }
        });
      }

      // 步骤4: 显示验证结果
      if (validateResult.success) {
        if (onModelSelect) {
          onModelSelect(model);
        }

        if (validateResult.data?.patch_file) {
          message.success(
            <span>
              ✅ 模型验证通过!已生成补丁文件<br />
              <code style={{ fontSize: 11 }}>{validateResult.data.patch_file}</code>
            </span>,
            5
          );
        } else {
          message.success('✅ 模型验证通过!可以进入 Simulator 运行仿真');
        }
      } else {
        Modal.error({
          title: '模型验证失败',
          width: 600,
          content: (
            <div>
              <div style={{ marginBottom: 12 }}>发现以下问题:</div>
              <div style={{ maxHeight: 300, overflow: 'auto', background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                {(validateResult.errors || [validateResult.error]).map((err: string, idx: number) => (
                  <div key={idx} style={{ marginBottom: 4, fontSize: 12 }}>
                    • {err}
                  </div>
                ))}
              </div>
              {validateResult.data?.patch_file && (
                <Alert
                  message="已生成补丁文件"
                  description={
                    <div style={{ fontSize: 12 }}>
                      <div>补丁文件: <code>{validateResult.data.patch_file}</code></div>
                      <div style={{ marginTop: 4 }}>请将补丁文件与原模型一起加载,或手动修复缺失的变量</div>
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
      message.error(`加载失败: ${error.message}`);
      console.error('Failed to load file content:', error);
    } finally {
      setLoading(false);
    }
  };

  // 确认并验证模型
  const confirmAndValidateModel = async () => {
    if (selectedMods.length === 0) {
      message.warning('请先选择模型或故事');
      return;
    }

    if (isLocked) {
      setIsLocked(false);
      setConfirmedModel(null);
      return;
    }

    setLoading(true);
    setHighlightPatch(false);
    try {
      // 这里的逻辑可以保留之前的核心校验逻辑，但改为“锁定”语义
      // 收集所有选中的 YAML 文件路径
      const filesToValidate = selectedMods
        .map(m => m.path.replace(/^mods\//, ''))
        .filter(p => p.endsWith('.yaml') || p.endsWith('.yml'));

      // 发送多文件验证请求
      const response = await fetch(`${API_BASE}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filesToValidate }),
      });
      const result = await response.json();

      if (result.success) {
        // 成功时，依然以第一个模型为主要锁定对象（或者逻辑上锁定整个组合）
        const firstMod = selectedMods[0];
        setConfirmedModel(firstMod);
        setIsLocked(true);
        message.success('✅ 验证成功，模型已锁定。现在可以进行仿真或优化。');
      } else {
        setHighlightPatch(true);
        message.error('❌ 验证失败，请查看详情并尝试生成补丁。');

        // 显示错误详情 (复用之前的 Modal 逻辑)
        Modal.error({
          title: '模型验证失败',
          width: 600,
          content: (
            <div>
              <div style={{ marginBottom: 12 }}>发现以下问题，建议生成补丁：</div>
              <div style={{ maxHeight: 300, overflow: 'auto', background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                {(result.errors || [result.error]).map((err: string, idx: number) => (
                  <div key={idx} style={{ marginBottom: 4, fontSize: 12 }}>• {err}</div>
                ))}
              </div>
            </div>
          ),
        });
      }
    } catch (error: any) {
      message.error(`校验出错: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePatch = async () => {
    if (selectedMods.length === 0) return;
    const targetMod = selectedMods[0];
    message.loading('正在生成补丁...', 1);

    const fileName = targetMod.path.split('/').pop()?.replace('.yaml', '_patch.yaml');
    const patchPath = `models/_output/patch/${fileName}`;
    const patchKey = `mods/${patchPath}`;

    // 模拟生成与加载过程
    setHighlightPatch(false);

    // 自动勾选补丁模型
    setManualCheckedModelKeys(prev => [...new Set([...prev, patchKey])]);

    message.success(`✅ 补丁已生成至 ${patchPath} 并自动选中。请再次验证并锁定。`);
    refreshModels();
  };

  const handleSelect = (keys: React.Key[]) => {
    if (keys.length > 0) {
      const key = keys[0] as string;
      if ((key.endsWith('.yaml') || key.endsWith('.yml')) && !loadedMods[key]) {
        loadFileContent(key);
      }
      // 无论是否已加载，都设置为当前选中模型
      setSelectedModel(loadedMods[key] || null);
    } else {
      setSelectedModel(null);
    }
  };

  const handleCheck = async (keys: React.Key[], type: 'model' | 'story') => {
    if (type === 'model') {
      // 通过 Diff 确定用户的手动操作意图
      const added = keys.filter(k => !checkedModelKeys.includes(k));
      const removed = checkedModelKeys.filter(k => !keys.includes(k));

      setManualCheckedModelKeys(prev => {
        let next = [...prev];
        added.forEach(k => { if (!next.includes(k)) next.push(k); });
        removed.forEach(k => { next = next.filter(nk => nk !== k); });
        return next;
      });
    } else {
      setCheckedStoryKeys(keys);
    }

    // 加载刚勾选的文件内容
    for (const key of keys) {
      const k = String(key);
      if ((k.endsWith('.yaml') || k.endsWith('.yml')) && !loadedMods[k]) {
        await loadFileContent(k);
      }
    }
  };

  const refreshModels = () => {
    setSelectedModel(null);
    setConfirmedModel(null);
    loadFileTree();
  };

  // 合并模型
  const handleMerge = () => {
    const yamlFiles = checkedModelKeys.filter(key =>
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

      const yamlFiles = checkedModelKeys
        .filter(key => String(key).endsWith('.yaml') || String(key).endsWith('.yml'))
        .map(key => String(key).replace(/^mods\//, '').replace(/\.(yaml|yml)$/, ''));

      const response = await fetch(`${API_BASE}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_names: yamlFiles,
          output_path: `models/_output/merged/${values.output_name}.yaml`,
        }),
      });

      const result = await response.json();

      if (result.success) {
        message.success(
          <span>
            ✅ {result.data.message}<br />
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
          output_dir: `models/_output/splited/${values.output_dir}/`,
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
                    message="注意"
                    description="验证过程中会自动检查公式中的变量是否存在..."
                    type="info"
                    style={{ marginTop: 12 }}
                    showIcon
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

  // 整合渲染变量或公式
  const renderConsolidatedItems = (type: 'variables' | 'formulas', mods: ModelFile[]) => {
    const allItems: { name: string; detail: any; source: string; modTitle: string }[] = [];
    mods.forEach(mod => {
      const items = mod[type] || {};
      Object.entries(items).forEach(([name, detail]) => {
        allItems.push({ name, detail: detail as any, source: mod.key, modTitle: mod.title });
      });
    });

    if (allItems.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`没有${type === 'variables' ? '变量' : '公式'}`} />;

    allItems.sort((a, b) => a.name.localeCompare(b.name));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {allItems.map((item, idx) => (
          <div key={`${item.source}-${item.name}-${idx}`} style={{
            border: `1px solid ${isDarkMode ? '#334155' : '#f0f0f0'}`,
            borderRadius: 4,
            padding: '8px 12px',
            background: isDarkMode ? '#0f172a' : '#fff'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4, gap: 8 }}>
              <strong style={{ fontSize: 14 }}>{item.name}</strong>
              <Tag color="cyan" style={{ fontSize: 10 }}>{item.modTitle}</Tag>
              {type === 'variables' && item.detail.unit && (
                <Tag color="orange" style={{ fontSize: 10 }}>{item.detail.unit}</Tag>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>
              {type === 'variables' ? (
                <>
                  <span>值: {String(item.detail.value)}</span>
                  <Divider type="vertical" />
                  <span>描述: {item.detail.description || '无'}</span>
                </>
              ) : (
                <>
                  <div style={{ fontFamily: 'monospace', background: isDarkMode ? '#1e293b' : '#f9f9f9', padding: 8, borderRadius: 4, fontSize: 13, border: `1px solid ${isDarkMode ? '#334155' : '#eee'}` }}>
                    {typeof item.detail.dynamics === 'object' ? (
                      Object.entries(item.detail.dynamics).map(([v, expr]) => (
                        <div key={v} style={{ marginBottom: 2 }}>
                          <span style={{ color: '#cf1322' }}>{v}</span> = <span style={{ color: '#096dd9' }}>{String(expr)}</span>
                        </div>
                      ))
                    ) : (
                      String(item.detail.dynamics)
                    )}
                  </div>
                  <div style={{ marginTop: 4 }}>描述: {item.detail.description || '无'}</div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // 浏览模型页面 (上下分屏 + 多选)
  const renderBrowseModels = () => {
    // 扁平化列表用于列表视图 (递归查找所有叶子节点)
    const flattenTree = (nodes: DataNode[]): any[] => {
      let flat: any[] = [];
      nodes.forEach(node => {
        if (node.isLeaf) {
          flat.push({
            ...node,
            displayTitle: node.titleStr || (typeof node.title === 'string' ? node.title : (node as any).titleStr)
          });
        }
        if (node.children && node.children.length > 0) {
          flat = [...flat, ...flattenTree(node.children)];
        }
      });
      return flat;
    };

    const filterAndSortNodes = (nodes: any[], filter: string, sort: 'name' | 'type') => {
      let filtered = nodes;
      if (filter) {
        filtered = nodes.filter(n => n.titleStr?.toLowerCase().includes(filter.toLowerCase()));
      }
      return filtered.sort((a, b) => {
        if (sort === 'name') return (a.titleStr || '').localeCompare(b.titleStr || '');
        if (sort === 'type') return (a.mod_type || '').localeCompare(b.mod_type || '');
        return 0;
      });
    };

    const getDetailTitle = () => {
      if (selectedMods.length === 0) return t('loader.no_selection');
      if (selectedMods.length === 1) return selectedMods[0].title;
      const storiesCount = selectedMods.filter(m => m.type === 'story').length;
      const modelsCount = selectedMods.length - storiesCount;
      return `${t('loader.selected_collection')} (${modelsCount} ${t('table_variables')}, ${storiesCount} ${t('loader.story')})`;
    };

    const modelList = filterAndSortNodes(flattenTree(modelTree), modelFilter, modelSort);
    const storyList = filterAndSortNodes(flattenTree(storyTree), storyFilter, storySort);

    const isFile = (key: React.Key) => String(key).endsWith('.yaml') || String(key).endsWith('.yml');

    const modelCounts = {
      checked: checkedModelKeys.filter(isFile).length,
      total: countLeaves(modelTree)
    };
    const storyCounts = {
      checked: checkedStoryKeys.filter(isFile).length,
      total: countLeaves(storyTree)
    };

    const renderToolbar = (
      type: 'model' | 'story',
      filter: string,
      setFilter: (v: string) => void,
      sort: 'name' | 'type',
      setSort: (v: 'name' | 'type') => void,
      view: 'tree' | 'list',
      setView: (v: 'tree' | 'list') => void,
      clearChecked: () => void
    ) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '4px 0', opacity: isSimulating ? 0.6 : 1, pointerEvents: isSimulating ? 'none' : 'auto' }}>
        <Input
          size="small"
          placeholder="搜索..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          prefix={<FilterOutlined style={{ color: '#bfbfbf' }} />}
          style={{ width: 100 }}
          disabled={isSimulating}
        />
        <Button
          size="small"
          icon={<SortAscendingOutlined />}
          onClick={() => setSort(sort === 'name' ? 'type' : 'name')}
          title={`排序: ${sort === 'name' ? '按名称' : '按类型'}`}
          disabled={isSimulating}
        />
        <Button
          size="small"
          icon={view === 'tree' ? <UnorderedListOutlined /> : <ClusterOutlined />}
          onClick={() => setView(view === 'tree' ? 'list' : 'tree')}
          title={view === 'tree' ? '切换到列表视图' : '切换到树状视图'}
          disabled={isSimulating}
        />
        <Button
          size="small"
          icon={<ClearOutlined />}
          onClick={clearChecked}
          danger={type === 'model' ? checkedModelKeys.length > 0 : checkedStoryKeys.length > 0}
          disabled={isSimulating || isLocked}
        />
      </div>
    );

    return (
      <Spin spinning={loading} indicator={<LoadingOutlined style={{ fontSize: 24 }} />}>
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 600 }}>
          {/* 上半部分: 选择器 (严格限制高度) */}
          <div style={{ flex: '0 0 50%', height: '50%', minHeight: '300px', display: 'flex', borderBottom: `1px solid ${isDarkMode ? '#334155' : '#f0f0f0'}` }}>
            {/* 左侧: 模型库 */}
            <div style={{ flex: 1, borderRight: `1px solid ${isDarkMode ? '#334155' : '#f0f0f0'}`, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ padding: '8px 12px', borderBottom: `1px solid ${isDarkMode ? '#334155' : '#f0f0f0'}`, display: 'flex', alignItems: 'center', gap: 8, background: isDarkMode ? '#1e293b' : '#fafafa' }}>
                <DatabaseOutlined style={{ color: '#1890ff' }} />
                <strong style={{ whiteSpace: 'nowrap', fontSize: '13px', color: isDarkMode ? '#f8fafc' : '#0f172a' }}>{t('loader.library')} ({modelCounts.checked}/{modelCounts.total})</strong>
                {renderToolbar('model', modelFilter, setModelFilter, modelSort, setModelSort, modelViewMode, setModelViewMode, () => handleCheck([], 'model'))}
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
                {modelViewMode === 'tree' ? (
                  <Tree
                    checkable
                    showIcon
                    expandedKeys={expandedKeys}
                    onExpand={setExpandedKeys}
                    checkedKeys={checkedModelKeys}
                    onCheck={(keys) => handleCheck(keys as React.Key[], 'model')}
                    onSelect={handleSelect}
                    treeData={modelTree}
                    disabled={isSimulating || isLocked}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {modelList.map(mod => (
                      <div key={mod.key} style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', background: selectedModel?.key === mod.key ? '#e6f7ff' : 'transparent' }} onClick={() => handleSelect([mod.key])}>
                        <Checkbox
                          checked={checkedModelKeys.includes(mod.key)}
                          disabled={isSimulating || isLocked}
                          onChange={(e) => {
                            const newKeys = e.target.checked
                              ? [...checkedModelKeys, mod.key]
                              : checkedModelKeys.filter(k => k !== mod.key);
                            handleCheck(newKeys, 'model');
                          }}
                          style={{ marginRight: 8 }}
                        />
                        <FileOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mod.displayTitle}</span>
                        {mod.mod_type && <Tag color="blue" style={{ fontSize: 10 }}>{mod.mod_type}</Tag>}
                      </div>
                    ))}
                    {modelList.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无模型" />}
                  </div>
                )}
              </div>
            </div>

            {/* 右侧: 故事库 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ padding: '8px 12px', borderBottom: `1px solid ${isDarkMode ? '#334155' : '#f0f0f0'}`, display: 'flex', alignItems: 'center', gap: 8, background: isDarkMode ? '#1e293b' : '#fafafa' }}>
                <BookOutlined style={{ color: '#52c41a' }} />
                <strong style={{ whiteSpace: 'nowrap', fontSize: '13px', color: isDarkMode ? '#f8fafc' : '#0f172a' }}>{t('loader.story')} ({storyCounts.checked}/{storyCounts.total})</strong>
                {renderToolbar('story', storyFilter, setStoryFilter, storySort, setStorySort, storyViewMode, setStoryViewMode, () => handleCheck([], 'story'))}
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
                {storyViewMode === 'tree' ? (
                  <Tree
                    checkable
                    showIcon
                    expandedKeys={expandedKeys}
                    onExpand={setExpandedKeys}
                    checkedKeys={checkedStoryKeys}
                    onCheck={(keys) => handleCheck(keys as React.Key[], 'story')}
                    onSelect={handleSelect}
                    treeData={storyTree}
                    disabled={isSimulating || isLocked}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {storyList.map(mod => (
                      <div key={mod.key} style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', background: selectedModel?.key === mod.key ? '#e6f7ff' : 'transparent' }} onClick={() => handleSelect([mod.key])}>
                        <Checkbox
                          checked={checkedStoryKeys.includes(mod.key)}
                          disabled={isSimulating || isLocked}
                          onChange={(e) => {
                            const newKeys = e.target.checked
                              ? [...checkedStoryKeys, mod.key]
                              : checkedStoryKeys.filter(k => k !== mod.key);
                            handleCheck(newKeys, 'story');
                          }}
                          style={{ marginRight: 8 }}
                        />
                        <BookOutlined style={{ marginRight: 8, color: isDarkMode ? '#94a3b8' : '#64748b' }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>{mod.displayTitle}</span>
                        <Tag style={{ fontSize: 10, borderRadius: 2, background: isDarkMode ? '#1e293b' : '#f1f5f9', color: isDarkMode ? '#94a3b8' : '#64748b', border: 'none' }}>STORY</Tag>
                      </div>
                    ))}
                    {storyList.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.no_data')} />}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 下半部分: 详情 */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Card
              title={
                <Space>
                  <InfoCircleOutlined />
                  <span>{getDetailTitle()}</span>
                  <Tag color="blue">{selectedMods.length} 已选中</Tag>
                </Space>
              }
              size="small"
              style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
              bodyStyle={{ flex: 1, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' }}
              extra={selectedMods.length > 0 && (
                <Space>
                  <Button
                    type={isLocked ? 'default' : 'primary'}
                    size="small"
                    icon={isLocked ? <UnlockOutlined /> : <LockOutlined />}
                    onClick={confirmAndValidateModel}
                    disabled={isSimulating}
                    style={isLocked ? { color: '#52c41a', borderColor: '#52c41a' } : {}}
                  >
                    {isLocked ? t('loader.unlock') : t('loader.lock')}
                  </Button>
                  <Button size="small" icon={<MergeOutlined />} onClick={handleMerge} disabled={isSimulating || isLocked}>合并</Button>
                  <Button
                    size="small"
                    icon={<FileProtectOutlined />}
                    onClick={handlePatch}
                    disabled={isSimulating || isLocked || !highlightPatch}
                    type={highlightPatch ? 'primary' : 'default'}
                    danger={highlightPatch}
                  >
                    补丁
                  </Button>
                  <Button size="small" icon={<ScissorOutlined />} onClick={handleSplit} disabled={isSimulating || isLocked}>拆分</Button>
                </Space>
              )}
            >
              {selectedMods.length === 0 ? (
                <div style={{ padding: 24 }}><Empty description="请在上方勾选模型或故事" /></div>
              ) : (
                <Tabs
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
                  tabBarStyle={{ paddingLeft: 16, marginBottom: 0, background: isDarkMode ? '#1e293b' : '#f8fafc', borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, fontSize: '13px' }}
                  className="detail-tabs"
                  items={[
                    {
                      key: 'meta',
                      label: '基本信息',
                      children: (
                        <div style={{ padding: 16, overflow: 'auto', height: '100%', maxHeight: '400px' }}>
                          {selectedMods.map(mod => (
                            <Card key={mod.key} size="small" title={<span style={{ fontSize: '13px', fontWeight: 600 }}>{mod.title}</span>} style={{ marginBottom: 12, border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`, background: isDarkMode ? '#0f172a' : '#ffffff' }}>
                              <Descriptions bordered column={2} size="small">
                                <Descriptions.Item label="路径" span={2}><code style={{ fontSize: 11, color: isDarkMode ? '#38bdf8' : '#0369a1' }}>{mod.path}</code></Descriptions.Item>
                                <Descriptions.Item label="类型"><Tag style={{ borderRadius: 2, background: isDarkMode ? '#334155' : '#f1f5f9', color: isDarkMode ? '#f8fafc' : '#0f172a', border: 'none' }}>{(mod.type || 'UNKNOWN').toUpperCase()}</Tag></Descriptions.Item>
                                <Descriptions.Item label="分类">{mod.category || 'N/A'}</Descriptions.Item>
                                <Descriptions.Item label="描述" span={2}><span style={{ fontSize: '12px', opacity: 0.8 }}>{mod.metadata?.description || 'No description'}</span></Descriptions.Item>
                              </Descriptions>
                            </Card>
                          ))}
                        </div>
                      )
                    },
                    {
                      key: 'vars',
                      label: `变量集 (${selectedMods.reduce((acc, m) => acc + Object.keys(m.variables || {}).length, 0)})`,
                      children: (
                        <div style={{ padding: 16, overflow: 'auto', height: '100%', maxHeight: '400px' }}>
                          {renderConsolidatedItems('variables', selectedMods)}
                        </div>
                      )
                    },
                    {
                      key: 'forms',
                      label: `公式集 (${selectedMods.reduce((acc, m) => acc + Object.keys(m.formulas || {}).length, 0)})`,
                      children: (
                        <div style={{ padding: 16, overflow: 'auto', height: '100%', maxHeight: '400px' }}>
                          {renderConsolidatedItems('formulas', selectedMods)}
                        </div>
                      )
                    },
                  ]}
                />
              )}
            </Card>
          </div>
        </div>
      </Spin>
    );
  };

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
            onExpand={(keys) => setExpandedKeys(keys as React.Key[])}
            checkedKeys={checkedModelKeys}
            onCheck={(keys) => setCheckedModelKeys(keys as React.Key[])}
            treeData={modelTree}
          />
        </div>

        <div>
          <Tag color="blue">
            {checkedModelKeys.filter(k => String(k).endsWith('.yaml') || String(k).endsWith('.yml')).length} 个模型已选中
          </Tag>
        </div>

        <Button
          type="primary"
          icon={<MergeOutlined />}
          onClick={handleMerge}
          disabled={checkedModelKeys.filter(k => String(k).endsWith('.yaml') || String(k).endsWith('.yml')).length < 2}
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
          <div style={{ marginTop: 16, padding: 12, background: isDarkMode ? '#1e293b' : '#f0f7ff', borderRadius: 4 }}>
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
            description={`将合并 ${checkedModelKeys.filter(k => String(k).endsWith('.yaml') || String(k).endsWith('.yml')).length} 个模型文件`}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form.Item name="output_name" label="输出文件名" rules={[{ required: true }]}>
            <Input addonBefore="models/_output/merged/" addonAfter=".yaml" placeholder="combined_model" />
          </Form.Item>

          <div style={{ background: isDarkMode ? '#0f172a' : '#f5f5f5', padding: 12, borderRadius: 4, fontSize: 12 }}>
            <div style={{ marginBottom: 4 }}><strong>选中的模型:</strong></div>
            {checkedModelKeys
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
              addonBefore="models/_output/splited/"
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