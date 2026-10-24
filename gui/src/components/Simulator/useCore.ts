// gui/src/components/Simulator/useCore.ts
// The core of the simulator workbench: what every view needs and none should own alone (ADR 0163).
//
//   model library    the file tree, the selected model, the model editor's files and dialogs
//   ui               theme, language, font size, the layout of the left panel
//   run settings     the settings of a run that simulation and optimization share (dates, steps, Monte Carlo)
//   session          the saved session of a model, written as one record from the slices the modules report
//   runtime          the lock that lets one job run at a time, and the way to stop the others
//   nav              which view is open and how to switch
//   events           a small bus, so a module can react to something without knowing who caused it
//   modules          the exports of the modules, by view id (filled by useModules in the order of the views)
//
// State and logic that belong to one view are not here: they are in that view's module.

import { useState, useEffect, useRef, useMemo } from 'react';
import type { SimulatorProps, SimulationState, ModelSession } from '../../types';
import { useI18n } from '../../core/i18n';
import { usePlugins } from '../plugins/usePlugins';
import { getC } from '../../core/theme';
import { useResize, API_BASE, readSP } from '../sim_tab/simUtils';
import { useSession, readMS } from '../sim_tab/useSession';
import { useFileTree } from './useFileTree';
import { useBuilderState } from './useBuilderState';
import { useCorePersistedUI } from './useCorePersistedUI';
import { getInitialRoute, routeTabToCenterTab, type CenterTab } from '../../core/urlRoute';

type Handler = (payload?: any) => void;

export function useCore({
  selectedModel, state, setState,
  isDarkMode,
  storyTree, setStoryTree,
  expandedKeys, setExpandedKeys,
  storyViewMode, setStoryViewMode,
  storyFilter, setStoryFilter,
  loadedModels, setLoadedModels,
  setConfirmedModel, onModelSelect,
  simMode: mode, onSimModeChange: setMode,
  fontSize,
}: SimulatorProps) {
  const { t, language } = useI18n();
  const c = getC(isDarkMode);
  const bundlePlugins = usePlugins();
  const [pluginViewId, setPluginViewId] = useState<string | null>(getInitialRoute()?.plugin ?? null);
  const pluginView = bundlePlugins.find(p => p.id === pluginViewId) ?? null;
  const { width: leftW, startDrag: startLeftDrag } = useResize(280, 160, 400);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const SECTION_H = 26;

  // ── events ──────────────────────────────────────────────────────────────────
  // 'session:reset'  the saved session of the selected model was thrown away (the model was reloaded from its file)
  // 'model:reload'   the user asked for the model as the file has it, no results
  const listeners = useRef(new Map<string, Set<Handler>>());
  const events = useMemo(() => ({
    on(name: string, fn: Handler) {
      if (!listeners.current.has(name)) listeners.current.set(name, new Set());
      listeners.current.get(name)!.add(fn);
      return () => { listeners.current.get(name)?.delete(fn); };
    },
    emit(name: string, payload?: any) {
      listeners.current.get(name)?.forEach(fn => fn(payload));
    },
  }), []);

  // ── SCS mode ─────────────────────────────────────────────────────────────────
  const [scsMode, setScsMode] = useState(false);
  useEffect(() => {
    fetch(`${API_BASE}/config`).then(r => r.json()).then(d => setScsMode(!!d.scs_mode)).catch(() => {});
  }, []);

  // ── auto-save results to local output/ (non-SCS only; mirrors CLI default behavior) ──
  const AUTO_SAVE_LOCAL_KEY = 'lm_sim_auto_save_local';
  const [autoSaveLocal, setAutoSaveLocal] = useState(
    () => localStorage.getItem(AUTO_SAVE_LOCAL_KEY) === 'true'
  );
  useEffect(() => {
    localStorage.setItem(AUTO_SAVE_LOCAL_KEY, String(autoSaveLocal));
  }, [autoSaveLocal]);

  // ── navigation ───────────────────────────────────────────────────────────────
  const initialLink = getInitialRoute();
  const [centerTab, setCenterTab] = useState<CenterTab>(initialLink ? routeTabToCenterTab(initialLink.tab) : 'intro');
  const prevTabRef = useRef<CenterTab>(centerTab);
  // builderOpen stays here (not in useBuilderState) because switchCenterTab below
  // needs to read it before the session is available, which useBuilderState depends on.
  const [builderOpen, setBuilderOpen] = useState(false);
  // Editing the model library takes over the main area, so an open plugin view is closed.
  useEffect(() => {
    if (builderOpen) setPluginViewId(null);
  }, [builderOpen]);
  const switchCenterTab = (tab: string) => {
    if (builderOpen) return; // locked while the model editor is open
    if (tab === 'plot' || tab === 'setup' || tab === 'simulation') {
      setCenterTab('simulation');
    } else if (tab === 'opt' || tab === 'optimization') {
      setCenterTab('optimization');
    } else {
      setCenterTab('intro');
    }
  };

  // ── model library ────────────────────────────────────────────────────────────
  const {
    treeLoading, selectedKey, setSelectedKey, runningModelKey, setRunningModelKey,
    loadFileTree, loadFileContent, handleSelect, handleTreeNodeClick,
    total,
  } = useFileTree({
    storyTree, setStoryTree, setExpandedKeys, setLoadedModels,
    setConfirmedModel, onModelSelect, setCenterTab, t,
  });

  // ── left panel sections, shared by the setup columns of simulation and optimization ──
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(readSP()?.openSections || ['inputs', 'opt']));
  const [introOpen, setIntroOpen] = useState<Set<string>>(new Set(['meta', 'variables', 'equations', 'refs']));
  const [sectionWeights] = useState<Record<string, number>>(() => readSP()?.sectionWeights || { scene: 2, inputs: 1, vars: 1, equations: 1, opt: 1 });

  // ── session ──────────────────────────────────────────────────────────────────
  const { modelSessionsRef, sessionReadyRef, persistSession, clearSession } = useSession();
  const sessionEditedRef = useRef(false);
  // Each module that keeps something per model registers a getter for its slice. A save asks every getter,
  // so the record in storage is always complete, whichever module changed.
  const sliceGetters = useRef(new Map<string, () => Partial<ModelSession>>());
  const session = {
    modelSessionsRef,
    readyRef: sessionReadyRef,
    editedRef: sessionEditedRef,
    markEdited: () => { sessionEditedRef.current = true; },
    clear: clearSession,
    register: (id: string, getter: () => Partial<ModelSession>) => { sliceGetters.current.set(id, getter); },
    save: () => {
      if (!selectedKey || !sessionReadyRef.current) return;
      const merged: Partial<ModelSession> = {};
      sliceGetters.current.forEach(get => Object.assign(merged, get()));
      persistSession(selectedKey, { ...merged, userEdited: sessionEditedRef.current } as ModelSession);
    },
  };

  // ── run settings shared by simulation and optimization ───────────────────────
  const set = <K extends keyof SimulationState>(key: K, val: SimulationState[K]) =>
    setState(prev => ({ ...prev, [key]: val }));
  // Same as `set`, but also marks the session dirty: for user-driven changes, not for a restore on load.
  const setEdited = <K extends keyof SimulationState>(key: K, val: SimulationState[K]) => {
    sessionEditedRef.current = true;
    set(key, val);
  };

  // A model is selected: its input and state variables are the starting point of the run settings.
  useEffect(() => {
    if (!selectedModel?.content?.variables) return;
    const inputs: Record<string, number> = {};
    const states: Record<string, number> = {};
    Object.entries(selectedModel.content.variables).forEach(([name, data]: [string, any]) => {
      if (data.type === 'input') inputs[name] = data.value;
      else if (data.type === 'state') states[name] = data.value;
    });
    set('inputParams', inputs);
    set('stateVariables', states);
  }, [selectedModel]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── facts about the selected model ───────────────────────────────────────────
  const variablesOf = (type: string) => selectedModel?.content?.variables
    ? Object.entries(selectedModel.content.variables)
        .filter(([, d]: [string, any]) => d.type === type)
        .map(([name, d]: [string, any]) => ({ name, ...d }))
    : [];
  const inputVars = variablesOf('input');
  const stateVars = variablesOf('state');
  const allVarNames = [...inputVars.map(v => v.name), ...stateVars.map(v => v.name)];
  const equations: Record<string, any> = selectedModel?.content?.equations || {};
  const provenance = selectedModel?.content?.provenance || selectedModel?.provenance || {};
  const sessionKeys = new Set(
    Object.entries(readMS())
      .filter(([, s]) => !!(s as any)?.userEdited)
      .map(([k]) => k)
  );

  // ── model editor (dialogs, session models, reload) ───────────────────────────
  const importFileRef = useRef<HTMLInputElement>(null);
  const builderUploadRef = useRef<HTMLInputElement>(null);
  const {
    sessionModels,
    builderCheckedFiles, builderSessionMetas, builderAutoEditKey,
    mergeDialogOpen, setMergeDialogOpen, mergeOutPath, setMergeOutPath,
    newFileDialogOpen, setNewFileDialogOpen, newFilePath, setNewFilePath,
    merging, creatingFile, splitting,
    openBuilder, closeBuilder, handleBuilderSessionUpdate, toggleBuilderFile, uncheckBuilderFile,
    handleMerge, handleSplit, handleCreateFile, handleBuilderUpload, handleImportFile,
    reloadFromYAML, navigateToRunning, runningModelTitle,
    selectSessionModel, clearSessionModel,
  } = useBuilderState({
    scsMode, centerTab, setCenterTab, prevTabRef, builderOpen, setBuilderOpen,
    selectedKey, setSelectedKey, runningModelKey, loadedModels,
    setConfirmedModel, onModelSelect, loadFileTree, loadFileContent,
    clearSession, sessionReadyRef, sessionEditedRef,
    onSessionReset: () => events.emit('session:reset'),
    importFileRef, builderUploadRef, t,
  });
  // Reload means the model as the file has it and no results, so the modules clear their results first.
  const reloadModel = () => { events.emit('model:reload'); reloadFromYAML(); };

  // ── runtime: one job at a time ───────────────────────────────────────────────
  const stoppers = useRef(new Map<string, () => void>());
  const isOtherRunning = scsMode && !!runningModelKey && runningModelKey !== selectedKey;
  const otherRunningTip = isOtherRunning ? t('sim.msg.other_running_tip', { name: runningModelTitle || '' }) : undefined;
  const runtime = {
    runningModelKey,
    setRunningModelKey,
    isOtherRunning,
    otherRunningTip,
    // a module says how its job is stopped; starting a job stops the ones the other modules registered
    onStop: (id: string, fn: () => void) => { stoppers.current.set(id, fn); },
    stopOthers: (selfId: string) => { stoppers.current.forEach((fn, id) => { if (id !== selfId) fn(); }); },
  };

  // ── persisted UI of the core: tree, selected model, layout ───────────────────
  useCorePersistedUI({
    storyTree, setExpandedKeys, expandedKeys, loadFileTree, loadFileContent,
    selectedKey, sessionReadyRef, sessionEditedRef,
    mode, openSections, sectionWeights,
  });

  // filled by useModules, one entry per view that has a module, in the order of the views
  const modules: Record<string, any> = {};

  return {
    // identity and ui
    selectedModel, isDarkMode, fontSize, t, language, c, scsMode, SECTION_H,
    autoSaveLocal, setAutoSaveLocal,
    openSections, setOpenSections, introOpen, setIntroOpen,
    // run settings
    state, setState, set, setEdited,
    // facts about the model
    inputVars, stateVars, allVarNames, equations, provenance, sessionKeys,
    // session, runtime, events, modules
    session, runtime, events, modules,
    // navigation
    mode, setMode, centerTab, setCenterTab, switchCenterTab,
    pluginViewId, setPluginViewId, pluginView, bundlePlugins,
    // layout
    leftW, startLeftDrag, leftCollapsed, setLeftCollapsed,
    // model library
    storyTree, setStoryTree, expandedKeys, setExpandedKeys, storyViewMode, setStoryViewMode,
    storyFilter, setStoryFilter, loadedModels, setLoadedModels, setConfirmedModel, onModelSelect,
    treeLoading, selectedKey, setSelectedKey, loadFileTree, loadFileContent,
    handleSelect, handleTreeNodeClick, total,
    runningModelKey, runningModelTitle, navigateToRunning,
    // model editor
    builderOpen, setBuilderOpen, importFileRef, builderUploadRef, sessionModels,
    builderCheckedFiles, builderSessionMetas, builderAutoEditKey,
    mergeDialogOpen, setMergeDialogOpen, mergeOutPath, setMergeOutPath,
    newFileDialogOpen, setNewFileDialogOpen, newFilePath, setNewFilePath,
    merging, creatingFile, splitting,
    openBuilder, closeBuilder, handleBuilderSessionUpdate, toggleBuilderFile, uncheckBuilderFile,
    handleMerge, handleSplit, handleCreateFile, handleBuilderUpload, handleImportFile,
    reloadFromYAML, reloadModel, selectSessionModel, clearSessionModel,
  };
}

export type Core = ReturnType<typeof useCore>;
