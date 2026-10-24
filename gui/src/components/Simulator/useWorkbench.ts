// gui/src/components/Simulator/useWorkbench.ts
// All the state, effects and business logic of the Simulator workbench. The shell (index.tsx) and every
// registered view read it as one object, so a view is a plain component of `wb` and nothing else.

import { useState, useEffect, useRef } from 'react';
import type { SimulatorProps, SimulationState, InputEvent, SimPlan } from '../../types';
import { useI18n } from '../../core/i18n';
import { usePlugins } from '../plugins/usePlugins';
import { getC } from '../../core/theme';
import { PLAN_COLORS, useResize, API_BASE, readSP, migrateInputEvents } from '../sim_tab/simUtils';
import { useSession, readMS } from '../sim_tab/useSession';
import { useOptimizer } from '../opt_tab/useOptimizer';
import { useSimulation } from '../sim_tab/useSimulation';
import { useExportImport } from './useExportImport';
import { useInputEventsCRUD } from './useInputEventsCRUD';
import { usePlans } from './usePlans';
import { useFileTree } from './useFileTree';
import { useBuilderState } from './useBuilderState';
import { useModelInit } from './useModelInit';
import { usePersistedUI } from './usePersistedUI';
import { getInitialRoute, routeTabToCenterTab, type CenterTab } from '../../core/urlRoute';
import type { PlanResult, SimulationDataPoint } from '../../types';

export function useWorkbench({
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

  const {
    status, progress, currentStep, totalSteps, simulationData, dataPerRun,
    inputParams,
    simStartDate, simEndDate, stepValue, stepUnit, optStepValue, optStepUnit, batchSize,
    simRuns, mcSeed, sessionSeed, optMcRuns, optMcSeed,
  } = state;

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

  // ── center tab ───────────────────────────────────────────────────────────────
  const initialLink = getInitialRoute();
  const [centerTab, setCenterTab] = useState<CenterTab>(initialLink ? routeTabToCenterTab(initialLink.tab) : 'intro');
  const prevTabRef = useRef<CenterTab>(centerTab);

  // ── file tree (loading + selection) ──────────────────────────────────────────
  const {
    treeLoading, selectedKey, setSelectedKey, runningModelKey, setRunningModelKey,
    loadFileTree, loadFileContent, handleSelect, handleTreeNodeClick,
    total,
  } = useFileTree({
    storyTree, setStoryTree, setExpandedKeys, setLoadedModels,
    setConfirmedModel, onModelSelect, setCenterTab, t,
  });

  // In-memory cache of each model's last Sim-tab results (curves), keyed by
  // model key. Not persisted to localStorage like ModelSession — curve data
  // can be large and doesn't need to survive a page reload — but restored
  // when switching back to a previously-run model within the same browser
  // session. Before this, results were unconditionally wiped on every model
  // switch with no way to get them back short of re-running (2026-07-15).
  const simResultsRef = useRef<Record<string, {
    simulationData: SimulationDataPoint[];
    dataPerRun: SimulationDataPoint[][];
    status: SimulationState['status'];
    currentStep: number;
    progress: number;
    totalSteps: number;
    sessionId: string;
    sessionSeed: number;
    comparedPlans: PlanResult[];
    runOutputVars: string[];
    outputWarnings: string[];
    simLogs: Array<{ t: number; msg: string }>;
  }>>({});
  const prevSelectedKeyRef = useRef<string | null>(null);

  // Snapshot the outgoing model's Sim results, then restore the incoming
  // model's cached results (if any) or reset to empty (first-ever visit).
  useEffect(() => {
    const prevKey = prevSelectedKeyRef.current;
    if (prevKey && prevKey !== selectedKey) {
      simResultsRef.current[prevKey] = {
        simulationData: state.simulationData, dataPerRun: state.dataPerRun,
        status: state.status, currentStep: state.currentStep, progress: state.progress,
        totalSteps: state.totalSteps, sessionId: state.sessionId, sessionSeed: state.sessionSeed,
        comparedPlans, runOutputVars, outputWarnings, simLogs,
      };
    }
    prevSelectedKeyRef.current = selectedKey;

    setImportedSimRuns([]);
    simRunCounterRef.current = 0;

    const cached = selectedKey ? simResultsRef.current[selectedKey] : undefined;
    if (cached) {
      setState(prev => ({
        ...prev,
        simulationData: cached.simulationData, dataPerRun: cached.dataPerRun,
        status: cached.status, currentStep: cached.currentStep, progress: cached.progress,
        totalSteps: cached.totalSteps, sessionId: cached.sessionId, sessionSeed: cached.sessionSeed,
      }));
      setComparedPlans(cached.comparedPlans);
      setRunOutputVars(cached.runOutputVars);
      setOutputWarnings(cached.outputWarnings);
      setSimLogs(cached.simLogs);
    } else {
      setState(prev => ({ ...prev, simulationData: [], dataPerRun: [], status: 'idle', progress: 0, currentStep: 0, sessionId: '' }));
      setComparedPlans([]);
    }
  }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── builder mode ─────────────────────────────────────────────────────────────
  // builderOpen stays here (not in useBuilderState) because switchCenterTab below
  // needs to read it before useSession()/useExportImport() are available, which
  // useBuilderState's other functions (reloadFromYAML etc.) depend on.
  const [builderOpen, setBuilderOpen] = useState(false);
  // Editing the model library takes over the main area, so an open plugin view is closed.
  useEffect(() => {
    if (builderOpen) setPluginViewId(null);
  }, [builderOpen]);

  const [runOutputVars, setRunOutputVars] = useState<string[]>([]);
  const [outputWarnings, setOutputWarnings] = useState<string[]>([]);
  const [simLogs, setSimLogs] = useState<Array<{ t: number; msg: string }>>([]);

  // ── left panel sections ───────────────────────────────────────────────────────
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(readSP()?.openSections || ['inputs', 'opt']));
  const [introOpen, setIntroOpen] = useState<Set<string>>(new Set(['meta', 'variables', 'equations', 'refs']));
  const [sectionWeights] = useState<Record<string, number>>(() => readSP()?.sectionWeights || { scene: 2, inputs: 1, vars: 1, equations: 1, opt: 1 });

  // ── opt mode state ───────────────────────────────────────────────────────────
  const [, setOptRanges] = useState<Record<string, { min: number; max: number; locked: boolean }>>({});
  const [objectives, setObjectives] = useState<Array<{ variable: string; direction: 'minimize' | 'maximize' }>>([]);
  const [constraints, setConstraints] = useState<Array<{ variable: string; op: '≤' | '≥'; value: number }>>([]);
  const [optAlgo, setOptAlgo] = useState<'NSGA-II' | 'MOEA/D' | 'l-bfgs-b' | 'nelder-mead'>('NSGA-II');
  const [optPop, setOptPop] = useState(50);
  const [optGen, setOptGen] = useState(80);
  const [optSeed, setOptSeed] = useState(42);

  // ── Pareto regroup chart axis/group selection (per-model, view preference not a model edit) ──
  const [regroupXKey, setRegroupXKey] = useState('');
  const [regroupYKey, setRegroupYKey] = useState('');
  const [regroupGroupKey, setRegroupGroupKey] = useState('');
  const switchCenterTab = (tab: string) => {
    if (builderOpen) return; // locked while builder is open
    if (tab === 'plot' || tab === 'setup' || tab === 'simulation') {
      setCenterTab('simulation');
    } else if (tab === 'opt' || tab === 'optimization') {
      setCenterTab('optimization');
    } else {
      setCenterTab('intro');
    }
  };

  // ── inputEvents state ────────────────────────────────────────────────────────
  const [inputEvents, setInputEvents] = useState<InputEvent[]>(() => {
    const saved = readSP();
    if (saved?.inputEvents) return migrateInputEvents(saved.inputEvents);
    if (saved?.regimens) {
      const events: InputEvent[] = [];
      for (const r of (saved.regimens || [])) {
        for (const ev of (r.events || [])) {
          events.push({
            id: `${r.id}-${ev.id}`,
            variable: r.variable,
            timeStart: ev.time,
            timeEnd: ev.time,
            value: ev.value,
            label: ev.time,
            daysEnabled: r.daysEnabled ?? false,
            days: r.days ?? [true,true,true,true,true,true,true],
            validRangeEnabled: r.validRangeEnabled ?? false,
            validStart: r.validStart ?? '',
            validEnd: r.validEnd ?? '',
          });
        }
      }
      return events;
    }
    return [];
  });

  // Multi-plan state: plans are session-only (not persisted). inputEvents stays as the live
  // editing state for the active plan; plans array stores snapshots per plan.
  const [plans, setPlans] = useState<SimPlan[]>([{
    id: 'plan-1', label: t('sim.plan.default_label'), color: PLAN_COLORS[0], inputEvents: [],
  }]);
  const [activePlanId, setActivePlanId] = useState('plan-1');
  const [optInputEvents, setOptInputEvents] = useState<InputEvent[]>([]);

  const { modelSessionsRef, sessionReadyRef, persistSession, clearSession } = useSession();
  const sessionEditedRef = useRef(false);

  const set = <K extends keyof SimulationState>(key: K, val: SimulationState[K]) =>
    setState(prev => ({ ...prev, [key]: val }));

  // Same as `set`, but also marks the session dirty — use for user-driven control
  // changes (date/step/MC fields), not for YAML/session restore on load.
  const setEdited = <K extends keyof SimulationState>(key: K, val: SimulationState[K]) => {
    sessionEditedRef.current = true;
    set(key, val);
  };

  // Dirty-marking wrappers for opt config setters passed down to OptSetupTab.
  const setObjectivesEdited: typeof setObjectives = v => { sessionEditedRef.current = true; setObjectives(v); };
  const setConstraintsEdited: typeof setConstraints = v => { sessionEditedRef.current = true; setConstraints(v); };
  const setOptAlgoEdited: typeof setOptAlgo = v => { sessionEditedRef.current = true; setOptAlgo(v); };
  const setOptPopEdited: typeof setOptPop = v => { sessionEditedRef.current = true; setOptPop(v); };
  const setOptGenEdited: typeof setOptGen = v => { sessionEditedRef.current = true; setOptGen(v); };

  // ── derived model state (must be above hook calls that consume inputVars) ────
  const inputVars = selectedModel?.content?.variables
    ? Object.entries(selectedModel.content.variables)
        .filter(([, d]: [string, any]) => d.type === 'input')
        .map(([name, d]: [string, any]) => ({ name, ...d }))
    : [];
  const stateVars = selectedModel?.content?.variables
    ? Object.entries(selectedModel.content.variables)
        .filter(([, d]: [string, any]) => d.type === 'state')
        .map(([name, d]: [string, any]) => ({ name, ...d }))
    : [];

  // ── optimizer hook (owns all opt execution state) ────────────────────────────
  const {
    optRunning, optResult, setOptResult,
    storedOptResult, setStoredOptResult,
    warmStartEnabled, setWarmStartEnabled,
    warmStartDirty,
    optCurGen, optTotalGen,
    optLogs, optHistory, optElapsed, optMethod,
    startOptimization, cancelOptimization, stopOptJobs,
    downloadModelYAML, exportOptCSV, importParetoFromCSV,
  } = useOptimizer({
    selectedModel, selectedKey,
    inputEvents: optInputEvents, inputVars,
    objectives, constraints,
    optAlgo, optPop, optGen, optSeed,
    simStartDate, simEndDate, stepValue: optStepValue, stepUnit: optStepUnit,
    optMcRuns, optMcSeed,
    modelSessionsRef,
    setRunningModelKey,
    setCenterTab,
    autoSaveLocal: autoSaveLocal && !scsMode,
    t,
  });

  // ── simulation hook (owns isRunningRef, comparedPlans, all sim handlers) ─────
  const {
    comparedPlans, setComparedPlans,
    isRunningRef,
    invalidateSim,
    startSimulation,
    pauseSimulation, resumeSimulation, resetSimulation,
    runAllPlans,
  } = useSimulation({
    state, setState,
    selectedModel, selectedKey,
    inputEvents, inputVars, plans, activePlanId,
    simStartDate, simEndDate, stepValue, stepUnit,
    simRuns, mcSeed,
    setRunOutputVars, setOutputWarnings, setRunningModelKey, setSimLogs,
    setInputEvents, setMode, switchCenterTab,
    stopOptJobs,
    autoSaveLocal: autoSaveLocal && !scsMode,
    t,
  });

  // Combined stop (sim + opt) — not yet wired to a UI control
  const stopAllJobs = () => { isRunningRef.current = false; stopOptJobs(); };
  void stopAllJobs;

  // ── export/import hook (owns importedSimRuns, simRunCounterRef) ─────────────
  const {
    importedSimRuns, setImportedSimRuns, simRunCounterRef,
    importSimCSV, removeImportedRun, handleExportSimCSV,
  } = useExportImport({
    selectedModel, simStartDate, simEndDate,
    simulationData, dataPerRun, comparedPlans,
    t,
  });

  // ── model init (derive UI state from selectedModel; session restore vs YAML defaults) ──
  useModelInit({
    selectedModel, inputEvents, set, setOptRanges, setStoredOptResult, setOptResult, setWarmStartEnabled,
    modelSessionsRef, setInputEvents, setOptInputEvents, setPlans, setActivePlanId,
    setObjectives, setConstraints, setOptAlgo, setOptPop, setOptGen, setOptSeed,
    setRegroupXKey, setRegroupYKey, setRegroupGroupKey,
    sessionEditedRef, sessionReadyRef, setRunOutputVars, setOutputWarnings, setSimLogs, t,
  });

  // ── persisted UI: localStorage restore on mount + per-model/global persistence ──
  usePersistedUI({
    state, setState, storyTree, setExpandedKeys, expandedKeys, loadFileTree, loadFileContent,
    selectedKey, sessionReadyRef, sessionEditedRef, persistSession,
    inputEvents, optInputEvents, plans, activePlanId,
    objectives, constraints, optAlgo, optPop, optGen, optSeed, optResult,
    regroupXKey, regroupYKey, regroupGroupKey,
    mode, openSections, sectionWeights,
    setRunOutputVars, setOutputWarnings, setCenterTab,
  });

  // opt poll cleanup on unmount → handled by useOptimizer hook

  // sim execution (startSimulation, runBatch, runSingleStep, pause/resume/reset,
  // runAllPlans, handleRunCompared, exportSimCSV, downloadRawModel) → useSimulation hook

  // ── plan management (CRUD + opt-result bridging) ─────────────────────────────
  const { selectPlan, addPlan, removePlan, addPlansFromOpt } = usePlans({
    plans, setPlans, activePlanId, setActivePlanId,
    inputEvents, setInputEvents, optInputEvents, inputVars, selectedModel,
    sessionEditedRef, set, setMode, setComparedPlans, switchCenterTab, t,
  });

  // exportSimCSV / downloadRawModel / pauseSimulation / resumeSimulation /
  // resetSimulation → useSimulation hook (see above)
  // downloadModelYAML / exportOptCSV / importParetoFromCSV → useOptimizer hook (see above)
  // startOptimization / cancelOptimization → useOptimizer hook (see above)

  // ── import local YAML file ────────────────────────────────────────────────────
  const importFileRef = useRef<HTMLInputElement>(null);
  const builderUploadRef = useRef<HTMLInputElement>(null);

  // ── builder state (dialogs, session models, reload/navigate-to-running) ─────
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
    setImportedSimRuns, simRunCounterRef, importFileRef, builderUploadRef, t,
  });

  // ── input event CRUD (sim + opt) ─────────────────────────────────────────────
  const {
    addInputEvent, updateInputEvent, removeInputEvent,
    addOptInputEvent, removeOptInputEvent, updateOptInputEvent,
  } = useInputEventsCRUD({
    inputVars, sessionEditedRef, invalidateSim, setInputEvents, setOptInputEvents,
  });

  // ── derived data ──────────────────────────────────────────────────────────────
  // inputVars / stateVars declared above (before hook calls)
  const equations: Record<string, any> = selectedModel?.content?.equations || {};
  const provenance = selectedModel?.content?.provenance || selectedModel?.provenance || {};
  const resolveOutputVars = (): string[] => {
    const variables: Record<string, any> = selectedModel?.content?.variables || {};
    const sim = selectedModel?.content?.simulation ?? {};
    const rawVars = Array.isArray(sim.output_variables) ? sim.output_variables.map(String) : [];
    const rawTypes = Array.isArray(sim.output_types) ? sim.output_types.map(String) : [];
    if (rawVars.length === 0 && rawTypes.length === 0) return Object.keys(variables);
    const next: string[] = [];
    rawVars.forEach((name: string) => { if (variables[name] && !next.includes(name)) next.push(name); });
    if (rawTypes.length > 0) {
      Object.entries(variables).forEach(([name, detail]: [string, any]) => {
        if (rawTypes.includes(String(detail.type)) && !next.includes(name)) next.push(name);
      });
    }
    return next;
  };
  const outputVars: string[] = runOutputVars.length > 0 ? runOutputVars : resolveOutputVars();
  const allVarNames = [...inputVars.map(v => v.name), ...stateVars.map(v => v.name)];

  const sessionKeys = new Set(
    Object.entries(readMS())
      .filter(([, s]) => !!(s as any)?.userEdited)
      .map(([k]) => k)
  );

  const isOtherRunning = scsMode && !!runningModelKey && runningModelKey !== selectedKey;
  const otherRunningTip = isOtherRunning ? t('sim.msg.other_running_tip', { name: runningModelTitle || '' }) : undefined;
  const simRunningOrPaused = status === 'running' || status === 'paused';

  // Prefer current run; fall back to last archived run; then first Pareto/compared plan
  const effectiveSimData = simulationData.length > 0
    ? simulationData
    : importedSimRuns.length > 0 ? importedSimRuns[importedSimRuns.length - 1].data
    : comparedPlans.find(p => p.data.length > 0)?.data ?? [];

  // All plan datasets for multi-plan chart exports (mirrors SimPlotTab comparedPlans assembly)
  const reportPlanDatasets: PlanResult[] = [
    ...(simulationData.length > 0 && importedSimRuns.length > 0 ? [{
      id: 'current-sim',
      label: t('sim.tab.current'),
      color: PLAN_COLORS[simRunCounterRef.current % PLAN_COLORS.length],
      data: simulationData as SimulationDataPoint[],
      runsData: dataPerRun,
    }] : []),
    ...comparedPlans,
    ...importedSimRuns.map(r => ({
      id: r.key, label: r.label, color: r.color,
      data: r.data as SimulationDataPoint[], runsData: [] as SimulationDataPoint[][],
    })),
  ];
  const reportActivePlans = reportPlanDatasets.filter(p => p.data.length > 0);
  const reportIsMultiPlan = reportActivePlans.length > 1;

  const existingResults = selectedModel?.rawContent?.optimization?.results
    ?? selectedModel?.content?.optimization?.results;
  const hasExistingResults = !!(existingResults?.pareto_front?.length) || !!(optResult?.pareto_front?.length);
  const currentFront = optResult?.pareto_front ?? existingResults?.pareto_front;
  // Reload means the model as the file has it and no results, so the simulation is cleared along with the session.
  const reloadModel = () => { resetSimulation(); setComparedPlans([]); reloadFromYAML(); };

  return {
    reloadModel,
    selectedModel,
    state,
    setState,
    isDarkMode,
    storyTree,
    setStoryTree,
    expandedKeys,
    setExpandedKeys,
    storyViewMode,
    setStoryViewMode,
    storyFilter,
    setStoryFilter,
    loadedModels,
    setLoadedModels,
    setConfirmedModel,
    onModelSelect,
    mode,
    setMode,
    fontSize,
    t,
    language,
    c,
    bundlePlugins,
    pluginViewId,
    setPluginViewId,
    pluginView,
    leftW,
    startLeftDrag,
    leftCollapsed,
    setLeftCollapsed,
    SECTION_H,
    status,
    progress,
    currentStep,
    totalSteps,
    simulationData,
    dataPerRun,
    inputParams,
    simStartDate,
    simEndDate,
    stepValue,
    stepUnit,
    optStepValue,
    optStepUnit,
    batchSize,
    simRuns,
    mcSeed,
    sessionSeed,
    optMcRuns,
    optMcSeed,
    scsMode,
    setScsMode,
    AUTO_SAVE_LOCAL_KEY,
    autoSaveLocal,
    setAutoSaveLocal,
    initialLink,
    centerTab,
    setCenterTab,
    prevTabRef,
    treeLoading,
    selectedKey,
    setSelectedKey,
    runningModelKey,
    setRunningModelKey,
    loadFileTree,
    loadFileContent,
    handleSelect,
    handleTreeNodeClick,
    total,
    simResultsRef,
    prevSelectedKeyRef,
    builderOpen,
    setBuilderOpen,
    runOutputVars,
    setRunOutputVars,
    outputWarnings,
    setOutputWarnings,
    simLogs,
    setSimLogs,
    openSections,
    setOpenSections,
    introOpen,
    setIntroOpen,
    sectionWeights,
    setOptRanges,
    objectives,
    setObjectives,
    constraints,
    setConstraints,
    optAlgo,
    setOptAlgo,
    optPop,
    setOptPop,
    optGen,
    setOptGen,
    optSeed,
    setOptSeed,
    regroupXKey,
    setRegroupXKey,
    regroupYKey,
    setRegroupYKey,
    regroupGroupKey,
    setRegroupGroupKey,
    switchCenterTab,
    inputEvents,
    setInputEvents,
    plans,
    setPlans,
    activePlanId,
    setActivePlanId,
    optInputEvents,
    setOptInputEvents,
    modelSessionsRef,
    sessionReadyRef,
    persistSession,
    clearSession,
    sessionEditedRef,
    set,
    setEdited,
    setObjectivesEdited,
    setConstraintsEdited,
    setOptAlgoEdited,
    setOptPopEdited,
    setOptGenEdited,
    inputVars,
    stateVars,
    optRunning,
    optResult,
    setOptResult,
    storedOptResult,
    setStoredOptResult,
    warmStartEnabled,
    setWarmStartEnabled,
    warmStartDirty,
    optCurGen,
    optTotalGen,
    optLogs,
    optHistory,
    optElapsed,
    optMethod,
    startOptimization,
    cancelOptimization,
    stopOptJobs,
    downloadModelYAML,
    exportOptCSV,
    importParetoFromCSV,
    comparedPlans,
    setComparedPlans,
    isRunningRef,
    invalidateSim,
    startSimulation,
    pauseSimulation,
    resumeSimulation,
    resetSimulation,
    runAllPlans,
    stopAllJobs,
    importedSimRuns,
    setImportedSimRuns,
    simRunCounterRef,
    importSimCSV,
    removeImportedRun,
    handleExportSimCSV,
    selectPlan,
    addPlan,
    removePlan,
    addPlansFromOpt,
    importFileRef,
    builderUploadRef,
    sessionModels,
    builderCheckedFiles,
    builderSessionMetas,
    builderAutoEditKey,
    mergeDialogOpen,
    setMergeDialogOpen,
    mergeOutPath,
    setMergeOutPath,
    newFileDialogOpen,
    setNewFileDialogOpen,
    newFilePath,
    setNewFilePath,
    merging,
    creatingFile,
    splitting,
    openBuilder,
    closeBuilder,
    handleBuilderSessionUpdate,
    toggleBuilderFile,
    uncheckBuilderFile,
    handleMerge,
    handleSplit,
    handleCreateFile,
    handleBuilderUpload,
    handleImportFile,
    reloadFromYAML,
    navigateToRunning,
    runningModelTitle,
    selectSessionModel,
    clearSessionModel,
    addInputEvent,
    updateInputEvent,
    removeInputEvent,
    addOptInputEvent,
    removeOptInputEvent,
    updateOptInputEvent,
    equations,
    provenance,
    resolveOutputVars,
    outputVars,
    allVarNames,
    sessionKeys,
    isOtherRunning,
    otherRunningTip,
    simRunningOrPaused,
    effectiveSimData,
    reportPlanDatasets,
    reportActivePlans,
    reportIsMultiPlan,
    existingResults,
    hasExistingResults,
    currentFront,
  };
}

export type Workbench = ReturnType<typeof useWorkbench>;
