// frontend/src/components/Loader.tsx
// Scenario (story) loader: single select, show info on select, validate+lock.

import React, { useState, useEffect } from 'react';
import { Tag, Button, Input, message, Spin, Descriptions, Empty, Alert, Tabs, Tooltip } from 'antd';
import {
  BookOutlined,
  FileOutlined,
  FolderOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  UnorderedListOutlined,
  ClusterOutlined,
  LoadingOutlined,
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
  setExpandedKeys: React.Dispatch<React.SetStateAction<React.Key[]>>;
  storyViewMode: 'tree' | 'list';
  setStoryViewMode: (mode: 'tree' | 'list') => void;
  storyFilter: string;
  setStoryFilter: (filter: string) => void;
  storySort: 'name' | 'type';
  setStorySort: (sort: 'name' | 'type') => void;
  checkedStoryKeys: React.Key[];
  setCheckedStoryKeys: (keys: React.Key[]) => void;
  loadedModels: Record<string, ModelFile>;
  setLoadedModels: (models: Record<string, ModelFile> | ((prev: Record<string, ModelFile>) => Record<string, ModelFile>)) => void;
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
  loadedModels,
  setLoadedModels,
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

  const selectedStory = selectedKey ? loadedModels[selectedKey] ?? null : null;

  const formatDescription = (description: any): string => {
    if (!description) return 'No description';
    if (typeof description === 'string') return description;
    if (typeof description !== 'object') return String(description);
    return Object.values(description)
      .filter(value => value != null && String(value).trim())
      .map(value => String(value).trim())
      .join('\n\n') || 'No description';
  };

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
            if (child.type === 'file' && (child.title === 'model.yaml' || child.title === 'model.yml')) {
              return {
                key: child.key, isLeaf: true, ...child,
                icon: <FolderOutlined style={{ color: '#007A33' }} />,
                title: item.title,
                titleStr: item.title,
              };
            }
          }
          return {
            title: item.type === 'file' ? titleStr : item.title,
            key: item.key,
            icon: item.type === 'folder' ? <FolderOutlined /> : <FileOutlined />,
            isLeaf: item.type === 'file',
            children: item.children ? convert(item.children) : undefined,
            titleStr,
          };
        });
        const modelsNode = result.data.find((n: any) => n.key === 'models');
        if (modelsNode?.children) {
          const sNode = modelsNode.children.find((n: any) => n.key === 'scenarios');
          if (sNode) setStoryTree(convert(sNode.children || []));
        }
        message.success(t('common.success'));
      } else {
        message.error(`${t('common.error')}: ${result.error}`);
      }
    } catch (e: any) {
      message.error(t('loader.validation_fail_network', { msg: e.message }));
    } finally {
      setLoading(false);
    }
  };

  const loadFileContent = async (filePath: string) => {
    setLoading(true);
    try {
      const cleanPath = filePath.replace(/^models\//, '');
      const fileResult = await fetch(`${API_BASE}/file/${cleanPath}`).then(r => r.json());
      if (!fileResult.success) { message.error(`${t('sim.msg.read_failed')}: ${fileResult.error}`); return; }

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
        equations: content.equations,
        simulator: content.simulator,
        optimization: content.optimization,
        imports: content.imports,
        folder: path.includes('/') ? path.split('/')[0] : undefined,
        validated: undefined,
        validationErrors: [],
      };

      setLoadedModels(prev => ({ ...prev, [filePath]: model }));
      setConfirmedModel(model);
      if (onModelSelect) onModelSelect(model);
    } catch (e: any) {
      message.error(`${t('sim.msg.load_failed')}: ${e.message}`);
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
      const cleanPath = selectedKey.replace(/^models\//, '');
      const result = await fetch(`${API_BASE}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [cleanPath] }),
      }).then(r => r.json());

      if (result.success) {
        setValidationResult({ success: true });
        setIsLocked(true);
        message.success(t('sim.msg.validation_ok'));
      } else {
        const errList: string[] =
          result.data?.errors ||
          (result.data?.error ? [result.data.error] : null) ||
          (result.error ? [result.error] : [t('loader.validation_fail_unknown')]);
        setValidationResult({ success: false, errors: errList });
        setIsLocked(false);
        message.error(t('loader.validation_fail_detail'));
      }
    } catch (e: any) {
      setValidationResult({ success: false, errors: [t('loader.validation_fail_network', { msg: e.message })] });
      message.error(t('loader.validation_fail_check', { msg: e.message }));
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
    if (entries.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('loader.no_vars')} />;
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
              {t('loader.var_init')}: {String(detail.value ?? 'N/A')}
              {detail.description ? `  |  ${detail.description}` : ''}
              {detail.bounds ? `  |  ${t('loader.var_bounds')}: [${detail.bounds[0]}, ${detail.bounds[1]}]` : ''}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderEquations = (equations: Record<string, any>) => {
    const entries = Object.entries(equations || {});
    if (entries.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('loader.no_equations')} />;
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
  const equationCount = Object.keys(selectedStory?.equations || {}).length;

  const detailTabs = selectedStory ? [
    {
      key: 'meta', label: t('loader.tab_info'),
      children: (
        <div style={{ padding: '12px 0' }}>
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label={t('loader.field_path')} span={2}>
              <code style={{ color: isDarkMode ? '#4ade80' : '#007A33' }}>{selectedStory.path}</code>
            </Descriptions.Item>
            <Descriptions.Item label={t('loader.field_type')}>
              <Tag>{(selectedStory.type || 'UNKNOWN').toUpperCase()}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('loader.field_category')}>{selectedStory.category || 'N/A'}</Descriptions.Item>
            <Descriptions.Item label={t('loader.field_description')} span={2}>
              <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', whiteSpace: 'pre-wrap' }}>
                {formatDescription(selectedStory.metadata?.description)}
              </span>
            </Descriptions.Item>
            {selectedStory.imports && selectedStory.imports.length > 0 && (
              <Descriptions.Item label={t('loader.field_imports')} span={2}>
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
      key: 'vars', label: `${t('loader.tab_vars')} (${varCount})`,
      children: <div style={{ padding: '8px 0' }}>{renderVariables(selectedStory.variables || {})}</div>,
    },
    {
      key: 'equations', label: `${t('loader.tab_equations')} (${equationCount})`,
      children: <div style={{ padding: '8px 0' }}>{renderEquations(selectedStory.equations || {})}</div>,
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
              size="small" placeholder={t('common.search')} value={storyFilter}
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
              {t('loader.refresh')}
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
                  : storyList.map(modelEntry => (
                    <div
                      key={modelEntry.key}
                      onClick={() => handleSelect([modelEntry.key])}
                      style={{
                        display: 'flex', alignItems: 'center', padding: '5px 8px',
                        borderRadius: 4, cursor: 'pointer',
                        background: selectedKey === modelEntry.key
                          ? (isDarkMode ? '#1a3a22' : '#e8f5e9')
                          : 'transparent',
                      }}
                    >
                      <BookOutlined style={{ marginRight: 8, color: isDarkMode ? '#94a3b8' : '#64748b' }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.9286)' }}>
                        {modelEntry.displayTitle}
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
            <Empty description={t('loader.select_scenario')} style={{ marginTop: 40 }} />
          ) : (
            <>
              {/* 标题行 + 验证锁定按钮 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: isDarkMode ? '#f8fafc' : '#0f172a' }}>
                  {selectedStory.title}
                </span>
                <Tooltip title={isLocked ? t('loader.locked_tooltip') : t('loader.unlock_tooltip')}>
                  <Button
                    type={isLocked ? 'primary' : 'default'}
                    size="small"
                    icon={isLocked ? <LockOutlined /> : <UnlockOutlined />}
                    loading={validating}
                    onClick={isLocked ? () => { setIsLocked(false); setValidationResult(null); } : handleValidateAndLock}
                    disabled={isSimulating}
                    danger={isLocked}
                  />
                </Tooltip>
              </div>

              {/* 验证结果内联显示 */}
              {validationResult && (
                <Alert
                  type={validationResult.success ? 'success' : 'error'}
                  message={validationResult.success ? t('loader.validation_ok_msg') : t('loader.validation_fail_msg')}
                  description={
                    validationResult.success ? t('loader.validation_ok_desc') : (
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

              {/* Tabs: 基本信息 / 变量 / 方程 */}
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
