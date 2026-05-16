import React, { useState } from 'react';
import { Button, Empty, Input, Popover, Spin, Tooltip, Tree } from 'antd';
import {
  BookOutlined, ClusterOutlined, FileOutlined, FilterOutlined,
  FolderOutlined, LoadingOutlined, LockOutlined, ReloadOutlined, UnlockOutlined,
  UnorderedListOutlined, EditOutlined, PlusOutlined, MergeCellsOutlined,
} from '@ant-design/icons';
import type { DataNode, ModelFile, SimulationState } from '../types';
import { getC } from '../core/theme';

interface SimModelTreeProps {
  width: number;
  SECTION_H: number;
  storyTree: DataNode[];
  storyFilter: string;
  setStoryFilter: (v: string) => void;
  storyViewMode: 'tree' | 'list';
  setStoryViewMode: (v: 'tree' | 'list') => void;
  expandedKeys: React.Key[];
  setExpandedKeys: React.Dispatch<React.SetStateAction<React.Key[]>>;
  selectedKey: string | null;
  isLocked: boolean;
  treeLoading: boolean;
  validationResult: { valid: boolean; errors: string[] } | null;
  setValidationResult: (v: { valid: boolean; errors: string[] } | null) => void;
  validating: boolean;
  total: number;
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  t: (key: string) => string;
  loadFileContent: (path: string, opts?: { preserveTab?: boolean }) => Promise<ModelFile | null>;
  handleSelect: (keys: React.Key[]) => void;
  handleTreeNodeClick: (e: React.MouseEvent, node: DataNode) => void;
  handleValidateAndLock: () => void;
  setIsLocked: (v: boolean) => void;
  onUnlock: () => void;
  // Builder mode
  builderMode?: boolean;
  builderCheckedFiles?: string[];
  onToggleBuilderFile?: (key: string) => void;
  onOpenBuilder?: () => void;
  onNewFile?: () => void;
  onMergeFiles?: () => void;
}

const SimModelTree: React.FC<SimModelTreeProps> = ({
  width, SECTION_H, storyTree, storyFilter, setStoryFilter,
  storyViewMode, setStoryViewMode, expandedKeys, setExpandedKeys,
  selectedKey, isLocked, treeLoading, validationResult, setValidationResult,
  validating, total, isDarkMode, c, t,
  loadFileContent, handleSelect, handleTreeNodeClick, handleValidateAndLock,
  setIsLocked, onUnlock,
  builderMode = false,
  builderCheckedFiles = [],
  onToggleBuilderFile,
  onOpenBuilder,
  onNewFile,
  onMergeFiles,
}) => {
  const flattenTree = (nodes: DataNode[]): any[] => {
    let flat: any[] = [];
    nodes.forEach(n => {
      if (n.isLeaf) flat.push({ ...n, displayTitle: (n as any).titleStr || (typeof n.title === 'string' ? n.title : '') });
      if (n.children?.length) flat = [...flat, ...flattenTree(n.children)];
    });
    return flat;
  };

  const storyList = flattenTree(storyTree)
    .filter(n => !storyFilter || n.titleStr?.toLowerCase().includes(storyFilter.toLowerCase()));

  // Builder mode: custom title renderer with checkbox for leaf nodes
  const builderTitleRender = (node: any) => {
    if (!node.isLeaf) {
      return <span style={{ color: c.textSec }}>{node.titleStr || node.title}</span>;
    }
    const checked = builderCheckedFiles.includes(node.key);
    return (
      <span
        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
        onClick={e => { e.stopPropagation(); onToggleBuilderFile?.(node.key); }}
      >
        <input
          type="checkbox"
          readOnly
          checked={checked}
          onClick={e => { e.stopPropagation(); onToggleBuilderFile?.(node.key); }}
          style={{ width: 12, height: 12, cursor: 'pointer', accentColor: c.primary, flexShrink: 0 }}
        />
        <span style={{ color: checked ? c.primary : c.text }}>
          {node.titleStr || node.title}
        </span>
      </span>
    );
  };

  return (
    <div style={{
      width, flexShrink: 0,
      background: c.panel,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      borderRight: `1px solid ${c.border}`,
    }}>
      {/* Header */}
      <div style={{
        height: SECTION_H, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 10px',
        background: c.sectionHd,
        borderBottom: `1px solid ${c.border}`,
      }}>
        <span style={{ flex: 1, fontWeight: 600, color: c.text }}>
          {t('sim.scene.header')} ({total})
        </span>

        {builderMode ? (
          // Builder mode: New + Merge buttons
          <>
            <Tooltip title="新建模型文件">
              <Button size="small" type="text" icon={<PlusOutlined />}
                onClick={onNewFile}
                style={{ color: c.primary, padding: '0 4px' }}
              />
            </Tooltip>
            <Tooltip title={builderCheckedFiles.length >= 2 ? '合并选中文件' : '请先选择 2 个以上文件'}>
              <Button size="small" type="text" icon={<MergeCellsOutlined />}
                onClick={onMergeFiles}
                disabled={builderCheckedFiles.length < 2}
                style={{ color: builderCheckedFiles.length >= 2 ? c.primary : c.textMute, padding: '0 4px' }}
              />
            </Tooltip>
          </>
        ) : (
          // Normal mode: Reload + Lock + Edit Library entry
          <>
            {selectedKey && (
              <Tooltip title="重新读取当前 YAML">
                <Button
                  size="small" type="text" icon={<ReloadOutlined />}
                  disabled={isLocked || treeLoading}
                  onClick={e => { e.stopPropagation(); loadFileContent(selectedKey, { preserveTab: true }); }}
                  style={{ color: c.textMute, padding: '0 3px' }}
                />
              </Tooltip>
            )}
            {selectedKey && (
              <Popover
                open={validationResult !== null && !validationResult.valid}
                placement="rightTop"
                onOpenChange={open => { if (!open) setValidationResult(null); }}
                content={
                  <div style={{ maxWidth: 300, maxHeight: 200, overflow: 'auto' }}>
                    <div style={{ fontWeight: 600, color: '#ff4d4f', marginBottom: 6 }}>{t('sim.msg.validation_fail')}</div>
                    {validationResult?.errors.map((err, i) => (
                      <div key={i} style={{ fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', marginBottom: 3 }}>• {err}</div>
                    ))}
                  </div>
                }
              >
                <Button
                  size="small"
                  type={isLocked ? 'default' : 'dashed'}
                  icon={isLocked ? <LockOutlined /> : <UnlockOutlined />}
                  loading={validating}
                  style={isLocked ? { color: '#52c41a', borderColor: '#52c41a' } : { color: '#faad14', borderColor: '#faad14' }}
                  onClick={e => { e.stopPropagation(); if (isLocked) onUnlock(); else handleValidateAndLock(); }}
                >
                  {isLocked ? t('sim.scene.locked') : t('sim.control.pending')}
                </Button>
              </Popover>
            )}
            <Tooltip title="编辑模型库">
              <Button size="small" type="text" icon={<EditOutlined />}
                onClick={onOpenBuilder}
                style={{ color: c.textMute, padding: '0 3px' }}
              />
            </Tooltip>
          </>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <Input size="small" placeholder={t('sim.scene.search')} value={storyFilter}
            onChange={e => setStoryFilter(e.target.value)}
            prefix={<FilterOutlined style={{ color: c.textMute }} />}
            style={{ flex: 1 }} disabled={isLocked && !builderMode} />
          {!builderMode && (
            <Tooltip title={storyViewMode === 'tree' ? t('sim.scene.toggle_list') : t('sim.scene.toggle_tree')}>
              <Button size="small" type="text"
                icon={storyViewMode === 'tree' ? <UnorderedListOutlined /> : <ClusterOutlined />}
                onClick={() => setStoryViewMode(storyViewMode === 'tree' ? 'list' : 'tree')}
                style={{ color: c.textMute, padding: '0 3px' }} disabled={isLocked} />
            </Tooltip>
          )}
        </div>

        <div style={{ opacity: (isLocked && !builderMode) ? 0.4 : 1, pointerEvents: (isLocked && !builderMode) ? 'none' : 'auto' }}>
          <Spin spinning={treeLoading} indicator={<LoadingOutlined />}>
            {builderMode ? (
              // Builder mode: always show tree with checkboxes
              <Tree
                showIcon
                expandedKeys={expandedKeys}
                onExpand={setExpandedKeys}
                selectedKeys={[]}
                onClick={handleTreeNodeClick}
                treeData={storyTree}
                titleRender={builderTitleRender}
              />
            ) : storyViewMode === 'tree' ? (
              <Tree showIcon expandedKeys={expandedKeys} onExpand={setExpandedKeys}
                selectedKeys={selectedKey ? [selectedKey] : []}
                onSelect={handleSelect}
                onClick={handleTreeNodeClick}
                treeData={storyTree} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {storyList.length === 0
                  ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('sim.scene.no_scenarios')} style={{ marginTop: 16 }} />
                  : storyList.map((m: any) => (
                      <div key={m.key} onClick={() => handleSelect([m.key])}
                        style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', background: selectedKey === m.key ? c.rowHover : 'transparent', color: c.text }}>
                        <BookOutlined style={{ marginRight: 6, color: c.textMute }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.displayTitle}</span>
                      </div>
                    ))
                }
              </div>
            )}
          </Spin>
        </div>
      </div>
    </div>
  );
};

export default SimModelTree;
