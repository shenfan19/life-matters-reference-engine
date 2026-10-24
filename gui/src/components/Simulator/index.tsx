// gui/src/components/Simulator/index.tsx
// The shell of the simulator workbench: model tree, view rail, plugin host and the dialogs. The views
// themselves are registered in views/registry.ts and render from the workbench state in useWorkbench.ts.

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Input, Modal } from 'antd';
import type { SimulatorProps } from '../../types';
import ViewRail from '../plugins/ViewRail';
import PluginHost from '../plugins/PluginHost';
import SimModelTree from '../sim_tab/SimModelTree';
import { useUrlSync } from './useUrlSync';
import type { CenterTab } from '../../core/urlRoute';
import { useWorkbench } from './useWorkbench';
import { getView, railViews } from '../views/registry';

const Simulator: React.FC<SimulatorProps> = (props) => {
  const wb = useWorkbench(props);
  const {
    reloadModel, pluginView, builderOpen, storyTree, selectedKey, setSelectedKey, centerTab, setCenterTab,
    setMode, loadFileContent, pluginViewId, setPluginViewId, bundlePlugins, setExpandedKeys, expandedKeys,
    importFileRef, handleImportFile, builderUploadRef, handleBuilderUpload, leftCollapsed, leftW,
    SECTION_H, storyFilter, setStoryFilter, storyViewMode, setStoryViewMode, treeLoading, total,
    isDarkMode, c, t, handleSelect, handleTreeNodeClick, runningModelKey, runningModelTitle,
    navigateToRunning, builderCheckedFiles, toggleBuilderFile, openBuilder, setNewFileDialogOpen,
    setMergeDialogOpen, handleSplit, splitting, scsMode, sessionKeys, sessionModels, selectSessionModel,
    clearSessionModel, startLeftDrag, closeBuilder, setLeftCollapsed, selectedModel, language,
    mergeDialogOpen, merging, handleMerge, mergeOutPath, setMergeOutPath, newFileDialogOpen, creatingFile,
    handleCreateFile, setNewFilePath, newFilePath
  } = wb;
  const ActiveView = getView(centerTab)?.component;


  // ── render ────────────────────────────────────────────────────────────────────
  // ── multi-select for plugins that ask for it (ui.model_selection: multi) ──────
  const [multiChecked, setMultiChecked] = useState<string[]>([]);
  const multiSelectMode = pluginView?.modelSelection === 'multi' && !builderOpen;
  // every model leaf of the tree by key, for the plugin that asked for several models
  const modelLeaves = useMemo(() => {
    const leaves = new Map<string, { key: string; title: string; path: string }>();
    const walk = (nodes: any[]) => nodes.forEach(n => {
      if (n.isLeaf) leaves.set(String(n.key), { key: String(n.key), title: n.titleStr || String(n.title), path: String(n.key) });
      if (n.children?.length) walk(n.children);
    });
    walk(storyTree);
    return leaves;
  }, [storyTree]);
  const checkedModels = useMemo(() => {
    if (!multiSelectMode) return [];
    return multiChecked.map(k => modelLeaves.get(k)).filter((m): m is { key: string; title: string; path: string } => !!m);
  }, [multiSelectMode, multiChecked, modelLeaves]);
  // A multi-select plugin may ask for models by path, with or without the file suffix.
  const setCheckedByPaths = useCallback((paths: string[]) => {
    if (!multiSelectMode) return;
    const keys: string[] = [];
    paths.forEach(p => {
      const key = [p, `${p}.yaml`, `${p}.yml`].find(k => modelLeaves.has(k));
      if (key && !keys.includes(key)) keys.push(key);
    });
    setMultiChecked(keys);
  }, [multiSelectMode, modelLeaves]);
  const checkedPaths = useMemo(() => checkedModels.map(m => m.path), [checkedModels]);
  useUrlSync({
    selectedKey, setSelectedKey, centerTab, setCenterTab, setMode, loadFileContent,
    pluginViewId, setPluginViewId, knownPluginIds: bundlePlugins.map(p => p.id),
    checkedPaths, applyCheckedPaths: setCheckedByPaths,
    canApplyChecked: multiSelectMode && modelLeaves.size > 0,
    paused: builderOpen,
  });

  // A plugin may ask the tree to show only some models, for example the models found for an organ.
  const [pluginFilter, setPluginFilter] = useState<{ keys: Set<string>; label: string } | null>(null);
  const expandedBeforeFilter = useRef<React.Key[] | null>(null);
  const displayTree = useMemo(() => {
    if (!pluginFilter) return storyTree;
    const prune = (nodes: any[]): any[] => nodes.flatMap(n => {
      if (n.isLeaf) return pluginFilter.keys.has(String(n.key)) ? [n] : [];
      const kids = prune(n.children || []);
      return kids.length ? [{ ...n, children: kids }] : [];
    });
    return prune(storyTree);
  }, [storyTree, pluginFilter]);
  const clearPluginFilter = useCallback(() => {
    setPluginFilter(null);
    if (expandedBeforeFilter.current) setExpandedKeys(expandedBeforeFilter.current);
    expandedBeforeFilter.current = null;
  }, [setExpandedKeys]);
  const filterByPaths = useCallback((paths: string[] | null, label: string) => {
    if (!paths) { clearPluginFilter(); return; }
    const keys = new Set<string>();
    paths.forEach(p => { const key = [p, `${p}.yaml`, `${p}.yml`].find(k => modelLeaves.has(k)); if (key) keys.add(key); });
    // open every folder that still holds a model, and remember how the tree was before
    const folders: React.Key[] = [];
    const walk = (nodes: any[]): boolean => nodes.reduce((any, n) => {
      if (n.isLeaf) return any || keys.has(String(n.key));
      const has = walk(n.children || []);
      if (has) folders.push(n.key);
      return any || has;
    }, false);
    walk(storyTree);
    if (!expandedBeforeFilter.current) expandedBeforeFilter.current = expandedKeys;
    setExpandedKeys(folders);
    setPluginFilter({ keys, label });
  }, [clearPluginFilter, modelLeaves, storyTree, expandedKeys, setExpandedKeys]);
  const openPlugin = useCallback((id: string) => {
    if (bundlePlugins.some(p => p.id === id)) setPluginViewId(id);
  }, [bundlePlugins]);

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Hidden file inputs */}
      <input ref={importFileRef} type="file" accept=".yaml,.yml" style={{ display: 'none' }} onChange={handleImportFile} />
      <input ref={builderUploadRef} type="file" accept=".yaml,.yml" style={{ display: 'none' }} onChange={handleBuilderUpload} />
      <div style={{ flex: 1, width: '100%', minWidth: 0, display: 'flex', overflow: 'hidden' }}>

        {!leftCollapsed && <SimModelTree
          width={leftW} SECTION_H={SECTION_H}
          storyTree={displayTree} storyFilter={storyFilter} setStoryFilter={setStoryFilter}
          filterLabel={pluginFilter?.label ?? null} filterCount={pluginFilter?.keys.size ?? 0} onClearFilter={clearPluginFilter}
          storyViewMode={storyViewMode} setStoryViewMode={setStoryViewMode}
          expandedKeys={expandedKeys} setExpandedKeys={setExpandedKeys}
          selectedKey={selectedKey}
          treeLoading={treeLoading}
          total={total}
          isDarkMode={isDarkMode} c={c} t={t}
          loadFileContent={loadFileContent}
          handleSelect={handleSelect}
          handleTreeNodeClick={handleTreeNodeClick}
          runningModelKey={runningModelKey}
          runningModelTitle={runningModelTitle}
          onNavigateToRunning={navigateToRunning}
          builderMode={builderOpen}
          builderCheckedFiles={builderCheckedFiles}
          onToggleBuilderFile={toggleBuilderFile}
          onOpenBuilder={openBuilder}
          onNewFile={() => setNewFileDialogOpen(true)}
          onMergeFiles={() => setMergeDialogOpen(true)}
          onSplitFile={handleSplit}
          splitting={splitting}
          onImportFile={() => importFileRef.current?.click()}
          onBuilderUpload={() => builderUploadRef.current?.click()}
          scsMode={scsMode}
          sessionKeys={sessionKeys}
          onReloadModel={reloadModel}
          multiSelectMode={multiSelectMode}
          multiCheckedKeys={multiChecked}
          onToggleMultiChecked={key => setMultiChecked(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])}
          onClearMultiChecked={() => setMultiChecked([])}
          sessionModels={sessionModels}
          onSelectSessionModel={selectSessionModel}
          onClearSessionModel={clearSessionModel}
        />}

        {!leftCollapsed && (
          <div
            onMouseDown={startLeftDrag}
            style={{ width: 4, flexShrink: 0, cursor: 'col-resize', background: 'transparent', transition: 'background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = `${c.primary}55`; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          />
        )}

        <ViewRail
          builtins={railViews().map(v => ({ key: v.id, label: t(v.labelKey), icon: v.icon }))}
          plugins={bundlePlugins}
          activeId={pluginView?.id ?? (builderOpen ? 'builder' : centerTab)}
          onSelectBuiltin={key => {
            setPluginViewId(null);
            if (key === 'builder') { if (!builderOpen) openBuilder(); return; }
            setCenterTab(key as CenterTab);
            if (key === 'simulation') setMode('sim');
            if (key === 'optimization') setMode('opt');
          }}
          onSelectPlugin={setPluginViewId}
          builderOpen={builderOpen}
          builderCloseLabel={t('sim.builder.close_edit')}
          builderLockedTip={t('sim.builder.tab_locked')}
          onCloseBuilder={closeBuilder}
          treeCollapsed={leftCollapsed}
          onToggleTree={() => setLeftCollapsed(v => !v)}
          treeToggleLabel={leftCollapsed ? t('sim.builder.expand_lib') : t('sim.builder.collapse_lib')}
          menuTitle={t('sim.rail.menu_title')}
          menuResetLabel={t('sim.rail.reset')}
          c={c}
        />

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

          {/* A plugin view covers the whole main area; the workbench below stays mounted underneath */}
          {pluginView && (
            <PluginHost
              pluginId={pluginView.id}
              title={pluginView.title}
              selectedModel={selectedModel}
              checkedModels={checkedModels}
              onSetModels={setCheckedByPaths}
              onFilterModels={filterByPaths}
              onOpenPlugin={openPlugin}
              isDarkMode={isDarkMode}
              language={language}
              c={c}
            />
          )}

          
          {ActiveView && <ActiveView wb={wb} />}

          

          

          

        </div>
      </div>

      {/* ── Merge dialog ── */}
      <Modal
        open={mergeDialogOpen}
        title={t('sim.modal.merge_title')}
        okText={t('sim.modal.merge_ok')}
        cancelText={t('sim.control.cancel')}
        confirmLoading={merging}
        onOk={handleMerge}
        onCancel={() => setMergeDialogOpen(false)}
      >
        <div style={{ marginBottom: 12, color: c.textSec }}>
          {t('sim.modal.merge_n_files', { n: builderCheckedFiles.length })}
          {builderCheckedFiles.map(f => (
            <div key={f} style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 2, color: c.textMute }}>• {f}</div>
          ))}
        </div>
        {scsMode ? (
          <>
            <div style={{ marginBottom: 4, color: c.textSec, fontSize: 12 }}>{t('sim.modal.merge_path_scs')}</div>
            <Input
              value={mergeOutPath.replace(/^.*\//, '').replace(/\.ya?ml$/i, '')}
              onChange={e => setMergeOutPath(e.target.value)}
              placeholder="merged"
              style={{ fontFamily: 'monospace' }}
            />
          </>
        ) : (
          <>
            <div style={{ marginBottom: 4, color: c.textSec, fontSize: 12 }}>{t('sim.modal.merge_path')}</div>
            <Input
              value={mergeOutPath}
              onChange={e => setMergeOutPath(e.target.value)}
              placeholder="models/scenarios/merged.yaml"
              style={{ fontFamily: 'monospace' }}
            />
          </>
        )}
      </Modal>

      {/* ── New file dialog ── */}
      <Modal
        open={newFileDialogOpen}
        title={scsMode ? t('sim.modal.new_title_scs') : t('sim.modal.new_title')}
        okText={t('sim.modal.new_ok')}
        cancelText={t('sim.control.cancel')}
        confirmLoading={creatingFile}
        onOk={handleCreateFile}
        onCancel={() => { setNewFileDialogOpen(false); setNewFilePath(''); }}
      >
        <div style={{ marginBottom: 4, color: c.textSec, fontSize: 12 }}>
          {scsMode ? t('sim.modal.new_name_scs') : t('sim.modal.new_path')}
        </div>
        <Input
          value={newFilePath}
          onChange={e => setNewFilePath(e.target.value)}
          placeholder={scsMode ? 'my_model' : 'models/temp/my_model.yaml'}
          style={{ fontFamily: 'monospace' }}
          onPressEnter={handleCreateFile}
        />
      </Modal>

    </div>
  );
};

export default Simulator;
