import React, { useState } from 'react';
import { Button, Empty, Input, Spin, Tooltip, Tree } from 'antd';
import {
  CaretRightFilled, ClusterOutlined, FilterOutlined,
  FolderOutlined, LoadingOutlined, ReloadOutlined,
  UnorderedListOutlined, EditOutlined, PlusOutlined, MergeCellsOutlined, UploadOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import type { DataNode, ModelFile, SimulationState } from '../../types';
import { getC } from '../../core/theme';

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
  treeLoading: boolean;
  total: number;
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  t: (key: string) => string;
  loadFileContent: (path: string, opts?: { preserveTab?: boolean }) => Promise<ModelFile | null>;
  handleSelect: (keys: React.Key[]) => void;
  handleTreeNodeClick: (e: React.MouseEvent, node: DataNode) => void;
  // Running state
  runningModelKey: string | null;
  runningModelTitle?: string | null;
  onNavigateToRunning?: () => void;
  // Builder mode
  builderMode?: boolean;
  builderCheckedFiles?: string[];
  onToggleBuilderFile?: (key: string) => void;
  onOpenBuilder?: () => void;
  onNewFile?: () => void;
  onMergeFiles?: () => void;
  onImportFile?: () => void;
  onBuilderUpload?: () => void;
  sessionModels?: ModelFile[];
  onSelectSessionModel?: (model: ModelFile) => void;
  onClearSessionModel?: (key: string) => void;
  scsMode?: boolean;
  sessionKeys?: Set<string>;
  onReloadModel?: () => void;
}

const SimModelTree: React.FC<SimModelTreeProps> = ({
  width, SECTION_H, storyTree, storyFilter, setStoryFilter,
  storyViewMode, setStoryViewMode, expandedKeys, setExpandedKeys,
  selectedKey, treeLoading,
  total, isDarkMode, c, t,
  loadFileContent, handleSelect, handleTreeNodeClick,
  runningModelKey, runningModelTitle, onNavigateToRunning,
  builderMode = false,
  builderCheckedFiles = [],
  onToggleBuilderFile,
  onOpenBuilder,
  onNewFile,
  onMergeFiles,
  onImportFile,
  onBuilderUpload,
  sessionModels = [],
  onSelectSessionModel,
  onClearSessionModel,
  scsMode = false,
  sessionKeys = new Set<string>(),
  onReloadModel,
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

  // Normal mode title render
  const normalTitleRender = (node: any) => {
    if (!node.isLeaf) {
      return (
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={() => setExpandedKeys(prev => {
            const next = new Set(prev);
            if (next.has(node.key)) next.delete(node.key); else next.add(node.key);
            return [...next];
          })}
        >
          <FolderOutlined style={{ fontSize: 12, color: isDarkMode ? '#6b9e6b' : '#4a7c4a', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, color: c.textSec, fontSize: 'calc(var(--lm-font-size, 14px) * 0.9286)' }}>
            {node.titleStr || node.title}
          </span>
        </span>
      );
    }
    const isSelected = node.key === selectedKey;
    const isRunning = node.key === runningModelKey;
    const hasSession = sessionKeys.has(node.key);
    return (
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ position: 'relative', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>
          {isRunning && (
            <Tooltip title={t('sim.tree.running_tip')}>
              <span
                onClick={e => { e.stopPropagation(); onNavigateToRunning?.(); }}
                style={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)',
                  paddingRight: 4, display: 'inline-flex', alignItems: 'center', gap: 1,
                  cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                <CaretRightFilled className="lm-running-arrow"  style={{ fontSize: '1em', color: c.primary }} />
                <CaretRightFilled className="lm-running-arrow2" style={{ fontSize: '1em', color: c.primary }} />
              </span>
            </Tooltip>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ color: isSelected ? c.text : c.textSec }}>
              {node.titleStr || node.title}
            </span>
            {hasSession && (
              <span style={{ color: c.primary, fontSize: '0.75em', fontStyle: 'italic', lineHeight: 1, flexShrink: 0 }}>(edited)</span>
            )}
          </span>
        </span>
      </span>
    );
  };

  return (
    <>
    <style>{`
      @keyframes lm-arrow-run {
        0%, 100% { transform: translateX(0); opacity: 1; }
        50% { transform: translateX(3px); opacity: 0.4; }
      }
      .lm-running-arrow  { animation: lm-arrow-run 0.8s ease-in-out infinite; }
      .lm-running-arrow2 { animation: lm-arrow-run 0.8s ease-in-out 0.25s infinite; }
    `}</style>
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
          <>
            <Tooltip title={t('sim.tree.new_file')}>
              <Button size="small" type="text" icon={<PlusOutlined />}
                onClick={onNewFile}
                style={{ color: c.primary, padding: '0 4px' }}
              />
            </Tooltip>
            <Tooltip title={t('sim.tree.upload_yaml')}>
              <Button size="small" type="text" icon={<UploadOutlined />}
                onClick={onBuilderUpload}
                style={{ color: c.primary, padding: '0 4px' }}
              />
            </Tooltip>
            <Tooltip title={builderCheckedFiles.length >= 2 ? t('sim.tree.merge_files') : t('sim.tree.select_files')}>
              <Button size="small" type="text" icon={<MergeCellsOutlined />}
                onClick={onMergeFiles}
                disabled={builderCheckedFiles.length < 2}
                style={{ color: builderCheckedFiles.length >= 2 ? c.primary : c.textMute, padding: '0 4px' }}
              />
            </Tooltip>
          </>
        ) : (
          <>
            <Tooltip title={t('sim.tree.import_yaml')}>
              <Button size="small" type="text" icon={<UploadOutlined />}
                onClick={onImportFile}
                style={{ color: c.textMute, padding: '0 3px' }}
              />
            </Tooltip>
            {selectedKey && (
              <Tooltip title={t('sim.tree.reload_yaml')}>
                <Button
                  size="small" type="text" icon={<ReloadOutlined />}
                  disabled={treeLoading}
                  onClick={e => { e.stopPropagation(); onReloadModel?.(); }}
                  style={{ color: c.textMute, padding: '0 3px' }}
                />
              </Tooltip>
            )}
            <Tooltip title={t('sim.tree.edit_library')}>
              <Button size="small" type="text" icon={<EditOutlined />}
                onClick={onOpenBuilder}
                style={{ color: c.textMute, padding: '0 3px' }}
              />
            </Tooltip>
          </>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {/* Session imports section */}
        {sessionModels.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '2px 4px 4px', gap: 4 }}>
              <span style={{ flex: 1, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', color: c.textMute, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Session
              </span>
              <Tooltip title={t('sim.tree.session_persist')}>
                <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', color: c.textMute, cursor: 'default' }}>💾</span>
              </Tooltip>
            </div>
            {sessionModels.map(m => {
              const isSel = selectedKey === m.key;
              const isRunning = m.key === runningModelKey;
              return (
              <div key={m.key}
                onClick={() => onSelectSessionModel?.(m)}
                style={{ display: 'flex', alignItems: 'center', padding: '3px 6px', borderRadius: 4,
                  cursor: 'pointer',
                  background: isSel ? (isDarkMode ? '#1a3a22' : '#f0faf0') : 'transparent' }}>
                {builderMode && (
                  <input type="checkbox" readOnly
                    checked={builderCheckedFiles.includes(m.key)}
                    onClick={e => { e.stopPropagation(); onToggleBuilderFile?.(m.key); }}
                    style={{ width: 12, height: 12, cursor: 'pointer', accentColor: c.primary, flexShrink: 0, marginRight: 4 }}
                  />
                )}
                <span style={{ flex: 1, position: 'relative', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', minWidth: 0 }}>
                  {!builderMode && isRunning && (
                    <Tooltip title={t('sim.tree.running_tip')}>
                      <span
                        onClick={e => { e.stopPropagation(); onNavigateToRunning?.(); }}
                        style={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)',
                          paddingRight: 4, display: 'inline-flex', alignItems: 'center', gap: 1,
                          cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        <CaretRightFilled className="lm-running-arrow"  style={{ fontSize: '1em', color: c.primary }} />
                        <CaretRightFilled className="lm-running-arrow2" style={{ fontSize: '1em', color: c.primary }} />
                      </span>
                    </Tooltip>
                  )}
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: isSel ? c.primary : c.text }}>
                    {m.title}
                  </span>
                </span>
              </div>
              );
            })}
            <div style={{ borderBottom: `1px solid ${c.border}`, margin: '6px 0' }} />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <Input size="small" placeholder={t('sim.scene.search')} value={storyFilter}
            onChange={e => setStoryFilter(e.target.value)}
            prefix={<FilterOutlined style={{ color: c.textMute }} />}
            style={{ flex: 1 }} />
          {!builderMode && (
            <Tooltip title={storyViewMode === 'tree' ? t('sim.scene.toggle_list') : t('sim.scene.toggle_tree')}>
              <Button size="small" type="text"
                icon={storyViewMode === 'tree' ? <UnorderedListOutlined /> : <ClusterOutlined />}
                onClick={() => setStoryViewMode(storyViewMode === 'tree' ? 'list' : 'tree')}
                style={{ color: c.textMute, padding: '0 3px' }} />
            </Tooltip>
          )}
        </div>

        <div>
          <Spin spinning={treeLoading} indicator={<LoadingOutlined />}>
            {builderMode ? (
              <Tree
                expandedKeys={expandedKeys}
                onExpand={setExpandedKeys}
                selectedKeys={[]}
                treeData={storyTree}
                titleRender={builderTitleRender}
                indent={12}
              />
            ) : storyViewMode === 'tree' ? (
              <Tree expandedKeys={expandedKeys} onExpand={setExpandedKeys}
                selectedKeys={selectedKey ? [selectedKey] : []}
                onSelect={handleSelect}
                treeData={storyTree}
                titleRender={normalTitleRender}
                indent={12}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {storyList.length === 0
                  ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('sim.scene.no_scenarios')} style={{ marginTop: 16 }} />
                  : storyList.map((m: any) => {
                      const isSelected = selectedKey === m.key;
                      const isRunning = m.key === runningModelKey;
                      return (
                      <div key={m.key}
                        onClick={() => handleSelect([m.key])}
                        style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: 4,
                          cursor: 'pointer',
                          background: isSelected ? c.rowHover : 'transparent', color: c.text }}>
                        <span style={{ flex: 1, position: 'relative', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', minWidth: 0 }}>
                          {isRunning && (
                            <Tooltip title={t('sim.tree.running_tip')}>
                              <span
                                onClick={e => { e.stopPropagation(); onNavigateToRunning?.(); }}
                                style={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)',
                                  paddingRight: 4, display: 'inline-flex', alignItems: 'center', gap: 1,
                                  cursor: 'pointer', whiteSpace: 'nowrap' }}
                              >
                                <CaretRightFilled className="lm-running-arrow"  style={{ fontSize: '1em', color: c.primary }} />
                                <CaretRightFilled className="lm-running-arrow2" style={{ fontSize: '1em', color: c.primary }} />
                              </span>
                            </Tooltip>
                          )}
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.displayTitle}</span>
                        </span>
                      </div>
                    );
                  })
                }
              </div>
            )}
          </Spin>
        </div>
      </div>
    </div>
    </>
  );
};

export default SimModelTree;
