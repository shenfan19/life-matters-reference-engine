// frontend/src/components/Loader.tsx
// Scenario (story) loader: single select, show info on select, validate+lock.

import React, { useState, useEffect } from 'react';
import { Tag, Button, Input, message, Spin, Descriptions, Empty, Alert, Tabs } from 'antd';
import {
  BookOutlined,
  FileOutlined,
  FolderOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  UnorderedListOutlined,
  ClusterOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  LockOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { Tree } from 'antd';
import type { ModelFile, DataNode } from '../types';
import { useI18n } from '../core/i18n';

interface LoaderProps {
  subPage: string;
  onModelSelect?: (model: ModelFile | null) => void;
  confirmedModel: ModelFile | null;
  setConfirmedModel: (model: ModelFile | null) => void;
  storyTree: DataNode[];
  setStoryTree: (tree: DataNode[]) => void;
  expandedKeys: React.Key[];
  setExpandedKeys: (keys: React.Key[]) => void;
  storyViewMode: 'tree' | 'list';
  setStoryViewMode: (mode: 'tree' | 'list') => void;
  storyFilter: string;
  setStoryFilter: (filter: string) => void;
  storySort: 'name' | 'type';
  setStorySort: (sort: 'name' | 'type') => void;
  checkedStoryKeys: React.Key[];
  setCheckedStoryKeys: (keys: React.Key[]) => void;
  loadedMods: Record<string, ModelFile>;
  setLoadedMods: (mods: Record<string, ModelFile> | ((prev: Record<string, ModelFile>) => Record<string, ModelFile>)) => void;
  isSimulating?: boolean;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
  isDarkMode: boolean;
  onPlayStory?: (storyId: string) => void;
}

const API_BASE = '/api';

const Loader: React.FC<LoaderProps> = ({
  onModelSelect,
  setConfirmedModel,
  storyTree,
  setStoryTree,
  expandedKeys,
  setExpandedKeys,
  storyViewMode,
  setStoryViewMode,
  storyFilter,
  setStoryFilter,
  storySort,
  setStorySort,
  loadedMods,
  setLoadedMods,
  isSimulating = false,
  isLocked,
  setIsLocked,
  isDarkMode,
}) => {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ success: boolean; errors?: string[] } | null>(null);

  const selectedStory = selectedKey ? loadedMods[selectedKey] ?? null : null;

  useEffect(() => {
    if (storyTree.length === 0) loadFileTree();
  }, []);

  // Reset validation when selection changes
  useEffect(() => {
    setValidationResult(null);
    setIsLocked(false);
  }, [selectedKey]);

  const countLeaves = (nodes: DataNode[]): number => {
    let count = 0;
    nodes.forEach(n => { if (n.isLeaf) count++; else if (n.children) count += countLeaves(n.children); });
    return count;
  };

  const loadFileTree = async () => {
    setLoading(true);
    try {
      const result = await fetch(`${API_BASE}/files`).then(r => r.json());
      if (result.success) {
        const convert = (items: any[]): DataNode[] => items.map(item => {
          const titleStr = item.type === 'file' ? item.title.replace(/\.ya?ml$/, '') : item.title;
          if (item.type === 'folder' && item.children?.length === 1) {
            const child = item.children[0];
            if (child.type === 'file' && (child.title === 'mod.yaml' || child.title === 'mod.yml')) {
              return {
                key: child.key, isLeaf: true, ...child,
                icon: <FolderOutlined style={{ color: '#007A33' }} />,
                title: <span>{item.title} <Tag color="blue" style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}>pkg</Tag></span>,
                titleStr: item.title, mod_type: 'story',
              };
            }
          }
          return {
            title: item.type === 'file'
              ? <span>{titleStr}{item.mod_type && <Tag color="blue" style={{ marginLeft: 8, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}>{item.mod_type}</Tag>}</span>
              : item.title,
            key: item.key,
            icon: item.type === 'folder' ? <FolderOutlined /> : <FileOutlined />,
            isLeaf: item.type === 'file',
            children: item.children ? convert(item.children) : undefined,
            titleStr, mod_type: item.mod_type,
          };
        });
        const modsNode = result.data.find((n: any) => n.key === 'models');
        if (modsNode?.children) {
          const sNode = modsNode.children.find((n: any) => n.key === 'scenarios');
          if (sNode) setStoryTree(convert(sNode.children || []));
        }
        message.success(t('common.success'));
      } else {
        message.error(`${t('common.error')}: ${result.error}`);
      }
    } catch (e: any) {
      message.error(`网络错误: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadFileContent = async (filePath: string) => {
    setLoading(true);
    try {
      const cleanPath = filePath.replace(/^mods\//, '');
      const fileResult = await fetch(`${API_BASE}/file/${cleanPath}`).then(r => r.json());
      if (!fileResult.success) { message.error(`读取失败: ${fileResult.error}`); return; }

      const { content, path } = fileResult.data;
      const model: ModelFile = {
        key: filePath,
        title: content.metadata?.name || path.split('/').pop()?.replace('.yaml', '') || 'unknown',
        path: filePath,
        type: content.type,
        category: content.category,
        content,
        metadata: content.metadata,
        variables: content.variables,
        formulas: content.formulas,
        simulator: content.simulator,
        optimizer: content.optimizer,
        imports: content.imports,
        folder: path.includes('/') ? path.split('/')[0] : undefined,
        validated: undefined,
        validationErrors: [],
      };

      setLoadedMods(prev => ({ ...prev, [filePath]: model }));
      setConfirmedModel(model);
      if (onModelSelect) onModelSelect(model);
    } catch (e: any) {
      message.error(`加载失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (keys: React.Key[]) => {
    if (keys.length === 0) return;
    const key = keys[0] as string;
    if (!key.endsWith('.yaml') && !key.endsWith('.yml')) return;
    setSelectedKey(key);
    loadFileContent(key);
  };

  const handleValidateAndLock = async () => {
    if (!selectedKey) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const cleanPath = selectedKey.replace(/^mods\//, '');
      const result = await fetch(`${API_BASE}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [cleanPath] }),
      }).then(r => r.json());

      if (result.success) {
        setValidationResult({ success: true });
        setIsLocked(true);
        message.success('✅ 验证通过，场景已锁定');
      } else {
        const errList: string[] =
          result.data?.errors ||
          (result.data?.error ? [result.data.error] : null) ||
          (result.error ? [result.error] : ['验证失败（未知原因）']);
        setValidationResult({ success: false, errors: errList });
        setIsLocked(false);
        message.error('❌ 验证失败，请查看详情');
      }
    } catch (e: any) {
      setValidationResult({ success: false, errors: [`网络错误: ${e.message}`] });
      message.error(`校验出错: ${e.message}`);
    } finally {
      setValidating(false);
    }
  };

  const flattenTree = (nodes: DataNode[]): any[] => {
    let flat: any[] = [];
    nodes.forEach(n => {
      if (n.isLeaf) flat.push({ ...n, displayTitle: n.titleStr || (typeof n.title === 'string' ? n.title : (n as any).titleStr) });
      if (n.children?.length) flat = [...flat, ...flattenTree(n.children)];
    });
    return flat;
  };

  const storyList = flattenTree(storyTree)
    .filter(n => !storyFilter || n.titleStr?.toLowerCase().includes(storyFilter.toLowerCase()))
    .sort((a, b) => (a.titleStr || '').localeCompare(b.titleStr || ''));

  const total = countLeaves(storyTree);

  const renderVariables = (vars: Record<string, any>) => {
    const entries = Object.entries(vars || {});
    if (entries.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无变量" />;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries.map(([name, detail]) => (
          <div key={name} style={{
            border: `1px solid ${isDarkMode ? '#1e3824' : '#c8e6c9'}`,
            borderRadius: 4, padding: '6px 10px',
            background: isDarkMode ? '#111f16' : '#f0f7f1',
          }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
              <strong style={{  }}>{name}</strong>
              {detail.unit && <Tag style={{  }}>{detail.unit}</Tag>}
              {detail.type && <Tag color="cyan" style={{  }}>{detail.type}</Tag>}
            </div>
            <div style={{ color: isDarkMode ? '#94a3b8' : '#666' }}>
              初值: {String(detail.value ?? 'N/A')}
              {detail.description ? `  |  ${detail.description}` : ''}
              {detail.bounds ? `  |  范围: [${detail.bounds[0]}, ${detail.bounds[1]}]` : ''}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderFormulas = (formulas: Record<string, any>) => {
    const entries = Object.entries(formulas || {});
    if (entries.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无公式" />;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries.map(([name, detail]) => (
          <div key={name} style={{
            border: `1px solid ${isDarkMode ? '#1e3824' : '#c8e6c9'}`,
            borderRadius: 4, padding: '6px 10px',
            background: isDarkMode ? '#111f16' : '#f0f7f1',
          }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <strong style={{  }}>{name}</strong>
              {detail.condition != null && detail.condition !== true && (
                <Tag color="orange" style={{  }}>when: {String(detail.condition)}</Tag>
              )}
            </div>
            <code style={{ whiteSpace: 'pre-wrap', display: 'block', color: isDarkMode ? '#86efac' : '#007A33' }}>
              {typeof detail.dynamics === 'object' && detail.dynamics
                ? Object.entries(detail.dynamics).map(([v, e]) => `${v} = ${e}`).join('\n')
                : String(detail.dynamics ?? '')}
            </code>
          </div>
        ))}
      </div>
    );
  };

  const varCount = Object.keys(selectedStory?.variables || {}).length;
  const formulaCount = Object.keys(selectedStory?.formulas || {}).length;

  const detailTabs = selectedStory ? [
    {
      key: 'meta', label: '基本信息',
      children: (
        <div style={{ padding: '12px 0' }}>
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="路径" span={2}>
              <code style={{ color: isDarkMode ? '#4ade80' : '#007A33' }}>{selectedStory.path}</code>
            </Descriptions.Item>
            <Descriptions.Item label="类型">
              <Tag>{(selectedStory.type || 'UNKNOWN').toUpperCase()}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="分类">{selectedStory.category || 'N/A'}</Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>
              <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{selectedStory.metadata?.description || 'No description'}</span>
            </Descriptions.Item>
            {selectedStory.imports && selectedStory.imports.length > 0 && (
              <Descriptions.Item label="导入模型" span={2}>
                {selectedStory.imports.map((imp: string, idx: number) => (
                  <Tag key={idx} color="cyan" style={{ marginBottom: 4 }}>{imp}</Tag>
                ))}
              </Descriptions.Item>
            )}
          </Descriptions>
        </div>
      ),
    },
    {
      key: 'vars', label: `变量 (${varCount})`,
      children: <div style={{ padding: '8px 0' }}>{renderVariables(selectedStory.variables || {})}</div>,
    },
    {
      key: 'formulas', label: `公式 (${formulaCount})`,
      children: <div style={{ padding: '8px 0' }}>{renderFormulas(selectedStory.formulas || {})}</div>,
    },
  ] : [];

  return (
    <Spin spinning={loading} indicator={<LoadingOutlined style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 1.7143)' }} />}>
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 500 }}>

        {/* 场景列表 */}
        <div style={{
          flex: '0 0 50%', minHeight: 260, display: 'flex', flexDirection: 'column',
          borderBottom: `1px solid ${isDarkMode ? '#1e3824' : '#c8e6c9'}`,
        }}>
          {/* 标题栏 */}
          <div style={{
            padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
            borderBottom: `1px solid ${isDarkMode ? '#1e3824' : '#c8e6c9'}`,
            background: isDarkMode ? '#111f16' : '#f0f7f1',
          }}>
            <BookOutlined style={{ color: '#007A33' }} />
            <strong style={{ whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.9286)', color: isDarkMode ? '#f8fafc' : '#0f172a' }}>
              {t('loader.story')} ({total})
            </strong>
            <Input
              size="small" placeholder="搜索..." value={storyFilter}
              onChange={e => setStoryFilter(e.target.value)}
              prefix={<FilterOutlined style={{ color: '#bfbfbf' }} />}
              style={{ width: 110 }} disabled={isSimulating}
            />
            <Button size="small" icon={<SortAscendingOutlined />}
              onClick={() => setStorySort(storySort === 'name' ? 'type' : 'name')}
              disabled={isSimulating}
            />
            <Button size="small"
              icon={storyViewMode === 'tree' ? <UnorderedListOutlined /> : <ClusterOutlined />}
              onClick={() => setStoryViewMode(storyViewMode === 'tree' ? 'list' : 'tree')}
              disabled={isSimulating}
            />
            <Button size="small" onClick={() => { setSelectedKey(null); setConfirmedModel(null); setValidationResult(null); setIsLocked(false); loadFileTree(); }}>
              刷新
            </Button>
          </div>

          {/* 树/列表 */}
          <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
            {storyViewMode === 'tree' ? (
              <Tree
                showIcon
                expandedKeys={expandedKeys}
                onExpand={setExpandedKeys}
                selectedKeys={selectedKey ? [selectedKey] : []}
                onSelect={handleSelect}
                treeData={storyTree}
                disabled={isSimulating}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {storyList.length === 0
                  ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.no_data')} />
                  : storyList.map(mod => (
                    <div
                      key={mod.key}
                      onClick={() => handleSelect([mod.key])}
                      style={{
                        display: 'flex', alignItems: 'center', padding: '5px 8px',
                        borderRadius: 4, cursor: 'pointer',
                        background: selectedKey === mod.key
                          ? (isDarkMode ? '#1a3a22' : '#e8f5e9')
                          : 'transparent',
                      }}
                    >
                      <BookOutlined style={{ marginRight: 8, color: isDarkMode ? '#94a3b8' : '#64748b' }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.9286)' }}>
                        {mod.displayTitle}
                      </span>
                      <Tag style={{  }}>STORY</Tag>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </div>

        {/* 详情面板 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px' }}>
          {!selectedStory ? (
            <Empty description="请在上方选择一个场景" style={{ marginTop: 40 }} />
          ) : (
            <>
              {/* 标题行 + 验证锁定按钮 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: isDarkMode ? '#f8fafc' : '#0f172a' }}>
                  {selectedStory.title}
                  {isLocked && <Tag color="green" style={{ marginLeft: 8 }} icon={<LockOutlined />}>已锁定</Tag>}
                </span>
                <Button
                  type="primary"
                  size="small"
                  icon={isLocked ? <LockOutlined /> : <CheckCircleOutlined />}
                  loading={validating}
                  onClick={isLocked ? () => { setIsLocked(false); setValidationResult(null); } : handleValidateAndLock}
                  disabled={isSimulating}
                  danger={isLocked}
                >
                  {isLocked ? '解锁' : '验证并锁定'}
                </Button>
              </div>

              {/* 验证结果内联显示 */}
              {validationResult && (
                <Alert
                  type={validationResult.success ? 'success' : 'error'}
                  message={validationResult.success ? '验证通过' : '验证失败'}
                  description={
                    validationResult.success ? '场景结构完整，已锁定可供模拟使用。' : (
                      <div style={{ maxHeight: 160, overflow: 'auto' }}>
                        {(validationResult.errors || []).map((err, i) => (
                          <div key={i} style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginBottom: 2 }}>
                            • {err}
                          </div>
                        ))}
                      </div>
                    )
                  }
                  showIcon
                  closable
                  onClose={() => setValidationResult(null)}
                  style={{ marginBottom: 10 }}
                />
              )}

              {/* Tabs: 基本信息 / 变量 / 公式 */}
              <Tabs
                size="small"
                items={detailTabs}
                tabBarStyle={{ marginBottom: 4 }}
              />
            </>
          )}
        </div>
      </div>
    </Spin>
  );
};

export default Loader;
