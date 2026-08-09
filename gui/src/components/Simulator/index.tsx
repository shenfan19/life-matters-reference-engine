// gui/src/components/Simulator/index.tsx
// State, effects, and business logic. UI split into sub-components.

import React, { useState, useEffect, useRef } from 'react';
import { Button, Input, Modal, Select, Tooltip } from 'antd';
import { BuildOutlined, CloseOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import type { SimulatorProps, SimulationState, StepUnit, InputEvent, SimPlan } from '../../types';
import FileEditor from '../FileEditor';
import { useI18n } from '../../core/i18n';
import { getC } from '../../core/theme';
import SimModelTree from '../sim_tab/SimModelTree';
import SimSetupTab from '../sim_tab/SimSetupTab';
import OptSetupTab from '../opt_tab/OptSetupTab';
import SimIntroTab from '../sim_tab/SimIntroTab';
import SimPlotTab from '../sim_tab/SimPlotTab';
import SimOptTab from '../sim_tab/SimOptTab';
import { PLAN_COLORS, useResize, API_BASE, readSP, migrateInputEvents } from '../sim_tab/simUtils';
import { useSession, readMS } from '../sim_tab/useSession';
import { WorkspacePage, ProgressStrip } from '../sim_tab/WorkspacePage';
import { SimControlBar } from '../sim_tab/SimControlBar';
import { OptControlBar } from '../opt_tab/OptControlBar';
import { GlobalModelToolbar } from '../sim_tab/GlobalModelToolbar';
import { useOptimizer } from '../opt_tab/useOptimizer';
import { useSimulation } from '../sim_tab/useSimulation';
import { useExportImport } from './useExportImport';
import { useInputEventsCRUD } from './useInputEventsCRUD';
import { usePlans } from './usePlans';
import { useFileTree } from './useFileTree';
import { useBuilderState } from './useBuilderState';
import { useModelInit } from './useModelInit';
import { usePersistedUI } from './usePersistedUI';
import { ReportButton } from '../sim_tab/ReportButton';
import type { PlanResult, SimulationDataPoint } from '../../types';

type CenterTab = 'intro' | 'simulation' | 'optimization' | 'builder';

const Simulator: React.FC<SimulatorProps> = ({
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
}) => {
  const { t } = useI18n();
  const c = getC(isDarkMode);
  const { width: leftW, startDrag: startLeftDrag } = useResize(280, 160, 400);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const SECTION_H = 26;

  const {
    status, progress, currentStep, totalSteps, simulationData, dataPerRun,
    inputParams, stateVariables,
    simStartDate, simEndDate, stepValue, stepUnit, optStepValue, optStepUnit, batchSize, updateInterval,
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
  const [centerTab, setCenterTab] = useState<CenterTab>('intro');
  const prevTabRef = useRef<CenterTab>('intro');

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

  const [runOutputVars, setRunOutputVars] = useState<string[]>([]);
  const [outputWarnings, setOutputWarnings] = useState<string[]>([]);
  const [simLogs, setSimLogs] = useState<Array<{ t: number; msg: string }>>([]);

  // ── left panel sections ───────────────────────────────────────────────────────
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(readSP()?.openSections || ['inputs', 'opt']));
  const [introOpen, setIntroOpen] = useState<Set<string>>(new Set(['meta', 'variables', 'equations', 'refs']));
  const [sectionWeights, setSectionWeights] = useState<Record<string, number>>(() => readSP()?.sectionWeights || { scene: 2, inputs: 1, vars: 1, equations: 1, opt: 1 });

  // ── opt mode state ───────────────────────────────────────────────────────────
  const [, setOptRanges] = useState<Record<string, { min: number; max: number; locked: boolean }>>({});
  const [objectives, setObjectives] = useState<Array<{ variable: string; direction: 'minimize' | 'maximize' }>>([]);
  const [constraints, setConstraints] = useState<Array<{ variable: string; op: '≤' | '≥'; value: number }>>([]);
  const [optAlgo, setOptAlgo] = useState<'NSGA-II' | 'MOEA/D' | 'l-bfgs-b' | 'nelder-mead'>('NSGA-II');
  const [optPop, setOptPop] = useState(50);
  const [optGen, setOptGen] = useState(80);
  const [optSeed, setOptSeed] = useState(42);
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
          const opt = saved?.regimenOpts?.[r.id];
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

  const STEP_UNITS: Record<StepUnit, number> = { day: 86400, hour: 3600, minute: 60 };

  // max(days, 1) * 24 not max(hours, 0): a same-day model (start === end)
  // represents one full calendar day, not zero duration — the old floor ran
  // zero steps and left any regimen event scheduled later in the day unreachable.
  const dateToHours = (start: string, end: string) => {
    const days = (new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 86_400_000;
    return Math.max(days, 1) * 24;
  };

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
    startSimulation, runBatch,
    pauseSimulation, resumeSimulation, resetSimulation,
    handleRunCompared, runAllPlans,
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

  // Combined stop (sim + opt)
  const stopAllJobs = () => { isRunningRef.current = false; stopOptJobs(); };

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
    sessionEditedRef, sessionReadyRef, setRunOutputVars, setOutputWarnings, setSimLogs, t,
  });

  // ── persisted UI: localStorage restore on mount + per-model/global persistence ──
  usePersistedUI({
    state, setState, storyTree, setExpandedKeys, expandedKeys, loadFileTree, loadFileContent,
    selectedKey, sessionReadyRef, sessionEditedRef, persistSession,
    inputEvents, optInputEvents, plans, activePlanId,
    objectives, constraints, optAlgo, optPop, optGen, optSeed, optResult,
    mode, openSections, sectionWeights,
    setRunOutputVars, setOutputWarnings, setCenterTab,
  });

  // opt poll cleanup on unmount → handled by useOptimizer hook

  // sim execution (startSimulation, runBatch, runSingleStep, pause/resume/reset,
  // runAllPlans, handleRunCompared, exportSimCSV, downloadRawModel) → useSimulation hook

  // ── plan management (CRUD + opt-result bridging) ─────────────────────────────
  const { selectPlan, addPlan, removePlan, addPlansFromOpt, applyBestToSim } = usePlans({
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
    reloadFromYAML, navigateToRunning, blockIfRunning, runningModelTitle,
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
    addInputEvent, updateInputEvent, removeInputEvent, updateInputEventOpt,
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
    const sim = selectedModel?.content?.simulation ?? selectedModel?.content?.simulator ?? {};
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

  const reportButton = selectedModel ? (
    <ReportButton
      selectedModel={selectedModel} outputVars={outputVars} equations={equations}
      simulationData={effectiveSimData} inputParams={inputParams}
      simStartDate={simStartDate} simEndDate={simEndDate}
      stepValue={stepValue} stepUnit={stepUnit} batchSize={batchSize}
      objectives={objectives} constraints={constraints}
      optAlgo={optAlgo} optPop={optPop} optGen={optGen}
      optResult={optResult} optElapsed={optElapsed} optMethod={optMethod}
      planDatasets={reportIsMultiPlan ? reportActivePlans : undefined}
      fontSize={fontSize} t={t} c={c as any}
    />
  ) : undefined;

  const ModelToolbar = (rightContent?: React.ReactNode) => (
    <GlobalModelToolbar
      selectedModel={selectedModel} isOtherRunning={isOtherRunning}
      simRunning={simRunningOrPaused} optRunning={optRunning} hasOptResult={!!optResult}
      onDownload={(opts) => downloadModelYAML(opts.flattenImports, opts.withResults)}
      onReload={reloadFromYAML}
      rightContent={rightContent}
      scsMode={scsMode} autoSaveLocal={autoSaveLocal} onAutoSaveLocalChange={setAutoSaveLocal}
      t={t} c={c as any}
    />
  );

  const SimControls = ModelToolbar(
    <SimControlBar
      status={status} sessionSeed={sessionSeed}
      plans={plans} simStartDate={simStartDate} simEndDate={simEndDate}
      stepValue={stepValue} stepUnit={stepUnit} simRuns={simRuns} mcSeed={mcSeed}
      selectedModel={selectedModel} isOtherRunning={isOtherRunning} otherRunningTip={otherRunningTip ?? ''}
      onStart={() => {
        // Snapshot current completed run before overwriting with new run
        if (simulationData.length > 0 && status === 'completed') {
          const color = PLAN_COLORS[simRunCounterRef.current % PLAN_COLORS.length];
          simRunCounterRef.current += 1;
          const label = `Sim ${simStartDate} · ${stepValue}${stepUnit[0]}`;
          setImportedSimRuns(prev => [...prev, { key: `run-${Date.now()}`, label, color, data: simulationData }]);
        }
        sessionEditedRef.current = true;
        startSimulation();
      }} onPause={pauseSimulation} onResume={resumeSimulation}
      onReset={resetSimulation} onRunAllPlans={runAllPlans}
      hasSimData={simulationData.length > 0 || comparedPlans.some(p => p.data.length > 0) || importedSimRuns.length > 0}
      onExportCSV={handleExportSimCSV}
      onImportCSV={importSimCSV}
      onSimStartDateChange={v => setEdited('simStartDate', v)}
      onSimEndDateChange={v => setEdited('simEndDate', v)}
      onStepValueChange={v => setEdited('stepValue', v)}
      onStepUnitChange={v => setEdited('stepUnit', v)}
      onSimRunsChange={v => setEdited('simRuns', v)}
      onMcSeedChange={v => setEdited('mcSeed', v)}
      reportButton={reportButton}
      t={t} c={c as any}
    />
  );

  const existingResults = selectedModel?.rawContent?.optimizer?.results
    ?? selectedModel?.content?.optimizer?.results;
  const hasExistingResults = !!(existingResults?.pareto_front?.length) || !!(optResult?.pareto_front?.length);
  const currentFront = optResult?.pareto_front ?? existingResults?.pareto_front;
  const OptControls = ModelToolbar(
    <OptControlBar
      optRunning={optRunning} optCurGen={optCurGen} optTotalGen={optTotalGen}
      warmStartEnabled={warmStartEnabled} warmStartDirty={warmStartDirty} hasExistingResults={hasExistingResults}
      currentFrontCount={currentFront?.length ?? 0}
      optResult={optResult} storedOptResult={storedOptResult}
      simStartDate={simStartDate} simEndDate={simEndDate}
      stepValue={optStepValue} stepUnit={optStepUnit} simRuns={optMcRuns} mcSeed={optMcSeed}
      selectedModel={selectedModel} isOtherRunning={isOtherRunning} otherRunningTip={otherRunningTip ?? ''}
      onStart={() => { sessionEditedRef.current = true; startOptimization(); }} onCancel={cancelOptimization}
      onWarmStartChange={setWarmStartEnabled}
      onSimStartDateChange={v => setEdited('simStartDate', v)}
      onSimEndDateChange={v => setEdited('simEndDate', v)}
      onStepValueChange={v => setEdited('optStepValue', v)}
      onStepUnitChange={v => setEdited('optStepUnit', v)}
      onSimRunsChange={v => setEdited('optMcRuns', v)}
      onMcSeedChange={v => setEdited('optMcSeed', v)}
      onExportCSV={exportOptCSV}
      onImportCSV={importParetoFromCSV}
      scsMode={scsMode}
      setOptResult={setOptResult}
      reportButton={reportButton}
      t={t} c={c as any}
    />
  );


  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Hidden file inputs */}
      <input ref={importFileRef} type="file" accept=".yaml,.yml" style={{ display: 'none' }} onChange={handleImportFile} />
      <input ref={builderUploadRef} type="file" accept=".yaml,.yml" style={{ display: 'none' }} onChange={handleBuilderUpload} />
      <div style={{ flex: 1, width: '100%', minWidth: 0, display: 'flex', overflow: 'hidden' }}>

        {!leftCollapsed && <SimModelTree
          width={leftW} SECTION_H={SECTION_H}
          storyTree={storyTree} storyFilter={storyFilter} setStoryFilter={setStoryFilter}
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
          onReloadModel={reloadFromYAML}
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

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Center tab bar */}
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 0, borderBottom: `1px solid ${c.border}`, background: c.panel, flexShrink: 0, paddingLeft: 4 }}>
            {/* Left panel collapse/expand toggle — always visible before Overview */}
            <Tooltip title={leftCollapsed ? t('sim.builder.expand_lib') : t('sim.builder.collapse_lib')}>
              <button
                onClick={() => setLeftCollapsed(v => !v)}
                style={{ padding: '5px 8px', border: 'none', cursor: 'pointer', background: 'transparent', color: c.textMute, outline: 'none', display: 'flex', alignItems: 'center', flexShrink: 0, borderBottom: '2px solid transparent', marginBottom: -1 }}
              >
                {leftCollapsed ? <RightOutlined style={{ fontSize: 11 }} /> : <LeftOutlined style={{ fontSize: 11 }} />}
              </button>
            </Tooltip>
            {([
              { key: 'intro',        label: t('sim.tab.overview') },
              { key: 'simulation',   label: t('sim.tab.simulation') },
              { key: 'optimization', label: t('sim.tab.optimization') },
            ] as { key: CenterTab; label: string }[]).map(tab => {
              const isActive = centerTab === tab.key;
              const locked = builderOpen;
              const color = locked ? c.textMute : (isActive ? c.primary : c.textMute);
              const underline = (!locked && isActive) ? `2px solid ${c.primary}` : '2px solid transparent';
              return (
                <Tooltip key={tab.key} title={locked ? t('sim.builder.tab_locked') : undefined}>
                  <button
                    onClick={() => {
                      if (locked) return;
                      setCenterTab(tab.key);
                      if (tab.key === 'simulation') setMode('sim');
                      if (tab.key === 'optimization') setMode('opt');
                    }}
                    data-testid={`center-tab-${tab.key}`}
                    style={{ padding: '6px 16px', border: 'none', cursor: locked ? 'not-allowed' : 'pointer', background: 'transparent', color, fontSize: 'var(--lm-font-size, 14px)', fontWeight: (!locked && isActive) ? 600 : 400, borderBottom: underline, marginBottom: -1, outline: 'none', transition: 'all 0.12s', opacity: locked ? 0.4 : 1 }}
                  >
                    {tab.label}
                  </button>
                </Tooltip>
              );
            })}
            {/* Dynamic Builder tab */}
            {builderOpen && (
              <div style={{ display: 'flex', alignItems: 'center', marginLeft: 4 }}>
                <button
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px 6px 16px', border: 'none', cursor: 'pointer', background: 'transparent', color: c.primary, fontSize: 'var(--lm-font-size, 14px)', fontWeight: 600, borderBottom: `2px solid ${c.primary}`, marginBottom: -1, outline: 'none' }}
                >
                  <BuildOutlined style={{ fontSize: 12 }} />
                  {t('sim.builder.label')}
                </button>
                <Tooltip title={t('sim.builder.close_edit')}>
                  <button
                    onClick={closeBuilder}
                    style={{ padding: '4px 6px', border: 'none', cursor: 'pointer', background: 'transparent', color: c.textMute, outline: 'none', borderRadius: 4, display: 'flex', alignItems: 'center' }}
                  >
                    <CloseOutlined style={{ fontSize: 11 }} />
                  </button>
                </Tooltip>
              </div>
            )}
          </div>

          {centerTab === 'intro' && (
            <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {ModelToolbar()}
              <SimIntroTab
                selectedModel={selectedModel} outputVars={outputVars}
                equations={equations} provenance={provenance}
                introOpen={introOpen} setIntroOpen={setIntroOpen}
                simulationData={effectiveSimData}
                inputParams={inputParams}
                simStartDate={simStartDate} simEndDate={simEndDate}
                stepValue={stepValue} stepUnit={stepUnit} batchSize={batchSize}
                objectives={objectives} constraints={constraints}
                optAlgo={optAlgo} optPop={optPop} optGen={optGen}
                optResult={optResult} optElapsed={optElapsed} optMethod={optMethod}
                isDarkMode={isDarkMode} c={c} t={t} fontSize={fontSize}
              />
            </div>
          )}

          {centerTab === 'simulation' && (
            <WorkspacePage
              controls={SimControls}
              setup={
                <SimSetupTab
                  inputEvents={inputEvents}
                  addInputEvent={addInputEvent}
                  updateInputEvent={updateInputEvent}
                  removeInputEvent={removeInputEvent}
                  inputVars={inputVars}
                  openSections={openSections} setOpenSections={setOpenSections}
                  SECTION_H={SECTION_H}
                  simStartDate={simStartDate} simEndDate={simEndDate}
                  isDarkMode={isDarkMode} c={c} t={t}
                  plans={plans} activePlanId={activePlanId}
                  onSelectPlan={selectPlan} onAddPlan={addPlan} onRemovePlan={removePlan}
                />
              }
              result={
                <SimPlotTab
                  simulationData={simulationData} dataPerRun={dataPerRun}
                  outputVars={outputVars} outputWarnings={outputWarnings}
                  inputVars={inputVars}
                  selectedModel={selectedModel}
                  selectedKey={selectedKey} mode="sim" status={status}
                  simStartDate={simStartDate} simEndDate={simEndDate}
                  stepValue={stepValue} stepUnit={stepUnit}
                  simRuns={simRuns} sessionSeed={sessionSeed}
                  isDarkMode={isDarkMode} c={c} t={t} fontSize={fontSize}
                  comparedPlans={[
                    // Include current run as a named plan when there are other runs to compare
                    ...(simulationData.length > 0 && importedSimRuns.length > 0 ? [{
                      id: 'current-sim',
                      label: (status === 'running' || status === 'paused') ? t('sim.tab.running') : t('sim.tab.current'),
                      color: PLAN_COLORS[simRunCounterRef.current % PLAN_COLORS.length],
                      data: simulationData, runsData: dataPerRun,
                      running: status === 'running', inputEvents: [] as any[],
                    }] : []),
                    ...comparedPlans,
                    ...importedSimRuns.map(r => ({
                      id: r.key, label: r.label, color: r.color,
                      data: r.data, runsData: [] as any[][], running: false, inputEvents: [] as any[],
                    })),
                  ]}
                  onRemovePlan={removeImportedRun}
                  simLogs={simLogs}
                />
              }
              progress={<ProgressStrip label="Simulation" percent={progress} detail={`step ${currentStep}/${totalSteps || '-'} · ${status}`} active={status === 'running'} c={c} />}
            />
          )}

          {centerTab === 'optimization' && (
            <WorkspacePage
              controls={OptControls}
              setup={
                <OptSetupTab
                  inputEvents={optInputEvents}
                  addInputEvent={addOptInputEvent}
                  removeInputEvent={removeOptInputEvent}
                  plans={plans.map(p => p.id === activePlanId ? { ...p, inputEvents } : p)}
                  onImportFromPlan={(events) => {
                    sessionEditedRef.current = true;
                    setOptInputEvents(
                      events.map(ev => ({
                        ...ev,
                        optimizeValue: false,
                        optimizeTime: false,
                        optimizeDays: false,
                        optimizeDateRange: false,
                      }))
                    );
                  }}
                  updateInputEvent={updateOptInputEvent}
                  updateInputEventOpt={updateOptInputEvent}
                  inputVars={inputVars}
                  allVarNames={allVarNames}
                  openSections={openSections} setOpenSections={setOpenSections}
                  simStartDate={simStartDate} simEndDate={simEndDate}
                  objectives={objectives} setObjectives={setObjectivesEdited}
                  constraints={constraints} setConstraints={setConstraintsEdited}
                  optAlgo={optAlgo} setOptAlgo={setOptAlgoEdited}
                  optPop={optPop} setOptPop={setOptPopEdited}
                  optGen={optGen} setOptGen={setOptGenEdited}
                  isDarkMode={isDarkMode} c={c} t={t}
                />
              }
              result={
                <SimOptTab
                  optResult={optResult} optRunning={optRunning}
                  optHistory={optHistory} optCurGen={optCurGen} optTotalGen={optTotalGen}
                  optElapsed={optElapsed} optMethod={optMethod} optLogs={optLogs}
                  objectives={objectives} constraints={constraints}
                  isDarkMode={isDarkMode} c={c} t={t} fontSize={fontSize}
                  onDownloadModel={downloadModelYAML}
                  hasExistingResults={hasExistingResults}
                  onSendToSim={addPlansFromOpt}
                  isActiveModel={!runningModelKey || runningModelKey === selectedKey}
                />
              }
              progress={<ProgressStrip label="Optimization" percent={optTotalGen ? (optCurGen / optTotalGen) * 100 : (optResult ? 100 : 0)} detail={`gen ${optCurGen}/${optTotalGen || '-'} · ${optRunning ? 'running' : optResult ? 'completed' : 'idle'}`} active={optRunning} c={c} />}
            />
          )}

          {centerTab === 'builder' && (
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <FileEditor
                isDarkMode={isDarkMode} c={c}
                scsMode={scsMode}
                controlledFiles={builderCheckedFiles}
                onReloadTree={loadFileTree}
                onUncheckedFile={uncheckBuilderFile}
                preloadedMetas={builderSessionMetas}
                onSessionModelUpdate={handleBuilderSessionUpdate}
                autoEditKey={builderAutoEditKey}
              />
            </div>
          )}

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
