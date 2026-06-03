// sim_gui/src/components/Simulator.tsx
// State, effects, and business logic. UI split into sub-components.

import React, { useState, useEffect, useRef } from 'react';
import { Button, Input, message, Modal, Select, Tooltip } from 'antd';
import { BuildOutlined, CloseOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import type { SimulatorProps, SimulationState, StepUnit, DataNode, ModelFile, InputEvent, SimPlan, ModelSession } from '../types';
import FileEditor from './FileEditor';
import { useI18n } from '../core/i18n';
import { getC } from '../core/theme';
import SimModelTree from './sim_tab/SimModelTree';
import SimSetupTab from './sim_tab/SimSetupTab';
import OptSetupTab from './opt_tab/OptSetupTab';
import SimIntroTab from './sim_tab/SimIntroTab';
import SimPlotTab from './sim_tab/SimPlotTab';
import SimOptTab from './sim_tab/SimOptTab';
import SimReportTab from './sim_tab/SimReportTab';
import { PLAN_COLORS, xToInputEvents, useResize, API_BASE, readSP, writeSP } from './sim_tab/simUtils';
import { useSession, readMS } from './sim_tab/useSession';
import { WorkspacePage, ProgressStrip } from './sim_tab/WorkspacePage';
import { SimControlBar } from './sim_tab/SimControlBar';
import { OptControlBar } from './opt_tab/OptControlBar';
import { useOptimizer } from './opt_tab/useOptimizer';
import { useSimulation } from './sim_tab/useSimulation';

type CenterTab = 'intro' | 'simulation' | 'optimization' | 'report' | 'builder';

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
    inputParams, stateVariables, sessionId,
    simStartDate, simEndDate, stepValue, stepUnit, batchSize, updateInterval,
    simRuns, mcSeed, sessionSeed,
  } = state;
  const isSimulating = status === 'running';

  // ── SCS mode ─────────────────────────────────────────────────────────────────
  const [scsMode, setScsMode] = useState(false);
  useEffect(() => {
    fetch(`${API_BASE}/config`).then(r => r.json()).then(d => setScsMode(!!d.scs_mode)).catch(() => {});
  }, []);

  // ── session imports (localStorage-persisted) ─────────────────────────────────
  const SESSION_KEY = 'lm_session_imports';
  const [sessionModels, setSessionModels] = useState<ModelFile[]>(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || '[]'); } catch { return []; }
  });
  const saveSession = (models: ModelFile[]) => {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(models)); } catch {}
  };

  // ── loader state ─────────────────────────────────────────────────────────────
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => readSP()?.selectedKey || null);
  const [runningModelKey, setRunningModelKey] = useState<string | null>(null);

  // ── center tab ───────────────────────────────────────────────────────────────
  const [centerTab, setCenterTab] = useState<CenterTab>('intro');
  const prevTabRef = useRef<CenterTab>('intro');

  // ── builder mode ─────────────────────────────────────────────────────────────
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderCheckedFiles, setBuilderCheckedFiles] = useState<string[]>([]);
  const [builderSessionMetas, setBuilderSessionMetas] = useState<Record<string, any>>({});
  const [builderAutoEditKey, setBuilderAutoEditKey] = useState<string | undefined>();
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeOutPath, setMergeOutPath] = useState('models/scenarios/merged.yaml');
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [merging, setMerging] = useState(false);
  const [creatingFile, setCreatingFile] = useState(false);

  const openBuilder = () => {
    prevTabRef.current = centerTab === 'builder' ? 'intro' : centerTab as CenterTab;
    setBuilderOpen(true);
    setCenterTab('builder');
  };

  const closeBuilder = () => {
    setBuilderOpen(false);
    setBuilderCheckedFiles([]);
    setCenterTab(prevTabRef.current);
    loadFileTree(); // reload tree after edits
  };

  const handleBuilderSessionUpdate = (key: string, content: any) => {
    const filename = key.replace(/^session\//, '');
    const modelName = content?.metadata?.name || filename.replace(/\.ya?ml$/i, '');
    const model: ModelFile = {
      key, title: modelName, path: key,
      type: content.type, category: content.category,
      content, rawContent: content,
      metadata: content.metadata, variables: content.variables,
      formulas: content.formulas, simulator: content.simulator,
      optimizer: content.optimizer, imports: content.imports,
      folder: 'session', validated: undefined, validationErrors: [],
    };
    setBuilderSessionMetas(p => ({ ...p, [key]: content }));
    setBuilderCheckedFiles(prev => prev.includes(key) ? prev : [...prev, key]);
    setBuilderAutoEditKey(key);
    setSessionModels(prev => {
      const next = [model, ...prev.filter(m => m.key !== key)].slice(0, 10);
      saveSession(next);
      return next;
    });
  };

  const toggleBuilderFile = (key: string) => {
    setBuilderCheckedFiles(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      // For session keys, ensure content is in builderSessionMetas
      if (key.startsWith('session/')) {
        const sm = sessionModels.find(m => m.key === key);
        if (sm) setBuilderSessionMetas(p => ({ ...p, [key]: sm.rawContent || sm.content }));
      }
      return [...prev, key];
    });
  };

  const handleMerge = async () => {
    setMerging(true);
    try {
      const r = await fetch('/api/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: builderCheckedFiles, output_path: mergeOutPath }),
      });
      const d = await r.json();
      if (!d.success) { message.error('合并失败: ' + (d.detail || d.error || '')); return; }

      if (d.scs_mode && d.raw) {
        // SCS mode: load merged content as a session model
        const raw = d.raw;
        const baseName = (mergeOutPath.trim() || 'merged').replace(/\.ya?ml$/i, '').replace(/[^a-zA-Z0-9_\-.]/g, '_');
        const filename = `${baseName}.yaml`;
        const modelKey = `session/${filename}`;
        const modelName = raw?.metadata?.name || filename.replace(/\.ya?ml$/i, '');
        const model: ModelFile = {
          key: modelKey, title: modelName, path: modelKey,
          type: raw.type, category: raw.category,
          content: raw, rawContent: raw,
          metadata: raw.metadata, variables: raw.variables,
          formulas: raw.formulas, simulator: raw.simulator,
          optimizer: raw.optimizer, imports: raw.imports,
          folder: 'session', validated: undefined, validationErrors: [],
        };
        setSelectedKey(modelKey);
        setBuilderSessionMetas(p => ({ ...p, [modelKey]: d.raw }));
        setBuilderCheckedFiles(prev => prev.includes(modelKey) ? prev : [...prev, modelKey]);
        setBuilderAutoEditKey(modelKey);
        openBuilder();
        setSessionModels(prev => {
          const next = [model, ...prev.filter(m => m.key !== modelKey)].slice(0, 10);
          saveSession(next);
          return next;
        });
        message.success('合并完成，已在编辑器中打开');
      } else {
        message.success('合并成功');
        loadFileTree();
      }
      setMergeDialogOpen(false);
    } catch (e: any) { message.error(String(e)); }
    finally { setMerging(false); }
  };

  const handleCreateFile = async () => {
    if (!newFilePath.trim()) { message.warning('请填写名称'); return; }
    const rawName = newFilePath.trim();
    if (scsMode) {
      const safeName = rawName.replace(/[^a-zA-Z0-9_\-.]/g, '_').replace(/\.ya?ml$/i, '');
      const key = `session/${safeName}.yaml`;
      const template = {
        metadata: { name: safeName, version: '1.0', description: '', tags: [] },
        variables: {}, formulas: {},
        simulation: { start_date: '', end_date: '' },
      };
      handleBuilderSessionUpdate(key, template);
      setBuilderAutoEditKey(key);
      openBuilder();
      setNewFileDialogOpen(false);
      setNewFilePath('');
      message.success('已在 Session 中创建新模型');
      return;
    }
    let path = rawName;
    if (!path.endsWith('.yaml') && !path.endsWith('.yml')) path += '.yaml';
    setCreatingFile(true);
    try {
      const r = await fetch('/api/file-new', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, template: 'model' }),
      });
      const d = await r.json();
      if (d.success) {
        message.success('文件已创建');
        setNewFileDialogOpen(false);
        setNewFilePath('');
        loadFileTree();
      } else message.error('创建失败: ' + (d.detail || ''));
    } catch (e: any) { message.error(String(e)); }
    finally { setCreatingFile(false); }
  };

  // ── report tab ───────────────────────────────────────────────────────────────
  const [reportSections, setReportSections] = useState<Set<string>>(
    new Set(['intro', 'overview', 'formulas', 'variables', 'simcfg', 'plots', 'refs'])
  );
  const [openReportPreviews, setOpenReportPreviews] = useState<Set<string>>(
    new Set(['intro', 'overview', 'formulas', 'variables', 'simcfg'])
  );
  const [reportGenerating, setReportGenerating] = useState(false);
  const [runOutputVars, setRunOutputVars] = useState<string[]>([]);
  const [outputWarnings, setOutputWarnings] = useState<string[]>([]);
  const [simLogs, setSimLogs] = useState<Array<{ t: number; msg: string }>>([]);

  // ── left panel sections ───────────────────────────────────────────────────────
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(readSP()?.openSections || ['inputs', 'opt']));
  const [introOpen, setIntroOpen] = useState<Set<string>>(new Set(['meta', 'variables', 'formulas', 'refs']));
  const [sectionWeights, setSectionWeights] = useState<Record<string, number>>(() => readSP()?.sectionWeights || { scene: 2, inputs: 1, vars: 1, formulas: 1, opt: 1 });

  // ── opt mode state ───────────────────────────────────────────────────────────
  const [optRanges, setOptRanges] = useState<Record<string, { min: number; max: number; locked: boolean }>>({});
  const [objectives, setObjectives] = useState<Array<{ variable: string; direction: 'minimize' | 'maximize' }>>([]);
  const [constraints, setConstraints] = useState<Array<{ variable: string; op: '≤' | '≥'; value: number }>>([]);
  const [optAlgo, setOptAlgo] = useState<'NSGA-II' | 'MOEA/D' | 'l-bfgs-b' | 'nelder-mead'>('NSGA-II');
  const [optPop, setOptPop] = useState(50);
  const [optGen, setOptGen] = useState(80);
  const switchCenterTab = (tab: string) => {
    if (builderOpen) return; // locked while builder is open
    if (tab === 'plot' || tab === 'setup' || tab === 'simulation') {
      setCenterTab('simulation');
    } else if (tab === 'opt' || tab === 'optimization') {
      setCenterTab('optimization');
    } else if (tab === 'report') {
      setCenterTab('report');
    } else {
      setCenterTab('intro');
    }
  };

  // ── inputEvents state ────────────────────────────────────────────────────────
  const [inputEvents, setInputEvents] = useState<InputEvent[]>(() => {
    const saved = readSP();
    if (saved?.inputEvents) return saved.inputEvents;
    if (saved?.regimens) {
      const events: InputEvent[] = [];
      for (const r of (saved.regimens || [])) {
        for (const ev of (r.events || [])) {
          const opt = saved?.regimenOpts?.[r.id];
          events.push({
            id: `${r.id}-${ev.id}`,
            variable: r.variable,
            time: ev.time,
            timeEnabled: true,
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

  const { modelSessionsRef, sessionReadyRef, persistSession, clearSession } = useSession();
  const sessionEditedRef = useRef(false);

  const STEP_UNITS: Record<StepUnit, number> = { day: 86400, hour: 3600, minute: 60 };

  const dateToHours = (start: string, end: string) =>
    Math.max(0, (new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 3_600_000);

  const totalSecondsToEndDate = (startDate: string, totalSec: number): string => {
    const d = new Date(startDate + 'T00:00:00');
    d.setSeconds(d.getSeconds() + Math.round(totalSec));
    return d.toISOString().slice(0, 10);
  };

  const set = <K extends keyof SimulationState>(key: K, val: SimulationState[K]) =>
    setState(prev => ({ ...prev, [key]: val }));

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
    downloadModelYAML, saveResultsToFile, importParetoFromCSV,
  } = useOptimizer({
    selectedModel, selectedKey,
    inputEvents, inputVars,
    objectives, constraints,
    optAlgo, optPop, optGen,
    simStartDate, simEndDate, stepValue, stepUnit,
    simRuns, mcSeed,
    modelSessionsRef,
    setRunningModelKey,
    setCenterTab,
    t,
  });

  // ── simulation hook (owns isRunningRef, comparedPlans, all sim handlers) ─────
  const {
    comparedPlans, setComparedPlans,
    isRunningRef,
    invalidateSim,
    startSimulation, runBatch,
    runSingleStep, pauseSimulation, resumeSimulation, resetSimulation,
    handleRunCompared, runAllPlans,
    exportSimCSV, downloadRawModel,
  } = useSimulation({
    state, setState,
    selectedModel, selectedKey,
    inputEvents, inputVars, plans, activePlanId,
    simStartDate, simEndDate, stepValue, stepUnit,
    simRuns, mcSeed,
    setRunOutputVars, setOutputWarnings, setRunningModelKey, setSimLogs,
    setInputEvents, setMode, switchCenterTab,
    stopOptJobs,
    t,
  });

  // Combined stop (sim + opt)
  const stopAllJobs = () => { isRunningRef.current = false; stopOptJobs(); };

  // ── init on model load ───────────────────────────────────────────────────────
  useEffect(() => {
    setRunOutputVars([]);
    setOutputWarnings([]);
    setSimLogs([]);
    if (!selectedModel?.content?.variables) return;

    // ── 1. Always: derive structural state (inputParams, stateVariables, optRanges) ──
    const inputs: Record<string, number> = {};
    const states: Record<string, number> = {};
    Object.entries(selectedModel.content.variables).forEach(([name, data]: [string, any]) => {
      if (data.type === 'input') inputs[name] = data.value;
      else if (data.type === 'state') states[name] = data.value;
    });
    set('inputParams', inputs);
    set('stateVariables', states);
    const ranges: typeof optRanges = {};
    Object.entries(inputs).forEach(([name, val]) => {
      ranges[name] = { min: 0, max: (val as number) * 2 || 1, locked: true };
    });
    setOptRanges(ranges);

    // ── 2. Always: pre-load opt results from YAML for Pareto chart display ──
    const optBlock: any = selectedModel?.content?.optimizer;
    const rawResults = optBlock?.results ?? selectedModel?.rawContent?.optimizer?.results;
    let yamlOptResult: any = null;
    if (rawResults?.pareto_front?.length > 0) {
      const labels: string[] = [];
      if (optBlock.inputs) {
        for (const conf of Object.values(optBlock.inputs as Record<string, any>))
          for (const ev of ((conf as any).events || [])) labels.push(ev.label || ev.time || '');
      } else if (optBlock.regimen?.events) {
        for (const ev of optBlock.regimen.events) labels.push(ev.label || ev.time || '');
      }
      const parseDir2 = (d: string) => d === 'maximize' ? 'maximize' : 'minimize' as const;
      const preloadObjs: Array<{variable: string; direction: 'minimize' | 'maximize'}> = [];
      if (optBlock.objective) preloadObjs.push({ variable: optBlock.objective.variable || '', direction: parseDir2(optBlock.objective.direction || '') });
      if (Array.isArray(optBlock.objectives)) optBlock.objectives.forEach((o: any) => preloadObjs.push({ variable: o.variable || '', direction: parseDir2(o.direction || '') }));
      yamlOptResult = {
        pareto_front: rawResults.pareto_front,
        best_x: rawResults.reference?.x ?? [],
        best_f: rawResults.reference?.f ?? [],
        objectives: preloadObjs,
        n_solutions: rawResults.n_solutions ?? rawResults.pareto_front.length,
        method: rawResults.method ?? 'nsga2',
        regimen_event_labels: labels.length > 0 ? labels : undefined,
      };
      setStoredOptResult(yamlOptResult);
    } else {
      setStoredOptResult(null);
    }

    // ── 3. Session exists → restore user state, skip YAML defaults ──
    const session = modelSessionsRef.current[selectedModel.key];
    if (session) {
      setInputEvents(session.inputEvents);
      setPlans(session.plans);
      setActivePlanId(session.activePlanId);
      set('simStartDate', session.simStartDate);
      set('simEndDate', session.simEndDate);
      set('stepValue', session.stepValue);
      set('stepUnit', session.stepUnit);
      setObjectives(session.objectives);
      setConstraints(session.constraints);
      setOptAlgo(session.optAlgo as any);
      setOptPop(session.optPop);
      setOptGen(session.optGen);
      setOptResult(session.optResult ?? yamlOptResult ?? null);
      setWarmStartEnabled(!!(yamlOptResult?.pareto_front?.length) || !!(session.optResult?.pareto_front?.length));
      // simRuns / mcSeed 存在 session 中（用户可自定义），若 session 没有则回退 YAML 默认值
      set('simRuns', session.simRuns ?? (optBlock?.mc?.enabled && optBlock?.mc?.sim_runs ? Math.max(1, Math.min(50, Number(optBlock.mc.sim_runs))) : 1));
      set('mcSeed', 'mcSeed' in session ? session.mcSeed : (optBlock?.mc?.seed != null ? Number(optBlock.mc.seed) : null));
      // Re-apply YAML optimizer.schedules opt fields to any session events that never had them set
      // (handles stale sessions created before the schedules bridge, or plan-switched events)
      if (Array.isArray(optBlock?.schedules)) {
        const withOpt = (optBlock.schedules as any[]).filter((e: any) => e.variable && e.optimize);
        if (withOpt.length > 0) {
          setInputEvents(prev => {
            const updated = prev.map(ev => ({ ...ev }));
            for (const inp of withOpt) {
              const opt = inp.optimize ?? {};
              const idx = updated.findIndex(ev =>
                ev.variable === inp.variable && (!inp.time || ev.time === inp.time)
              );
              if (idx >= 0 && updated[idx].optimizeValue === undefined) {
                const patch: Partial<typeof updated[0]> = { optimizeValue: true };
                if (Array.isArray(opt.value) && opt.value.length >= 2)
                  patch.valueBounds = [opt.value[0], opt.value[1]];
                if (Array.isArray(opt.time) && opt.time.length === 2) {
                  patch.optimizeTime = true; patch.timeWindowStart = opt.time[0]; patch.timeWindowEnd = opt.time[1];
                  if (opt.time_step) patch.timeStep = opt.time_step;
                }
                if (opt.days_pool) {
                  patch.optimizeDays = true; patch.daysPool = opt.days_pool;
                  if (opt.days_n) { patch.daysNMin = opt.days_n[0]; patch.daysNMax = opt.days_n[1]; }
                }
                if (Array.isArray(opt.date_range) && opt.date_range.length === 2) {
                  patch.optimizeDateRange = true;
                  patch.dateStartLo = opt.date_range[0][0]; patch.dateStartHi = opt.date_range[0][1];
                  patch.dateEndLo = opt.date_range[1][0];   patch.dateEndHi = opt.date_range[1][1];
                }
                updated[idx] = { ...updated[idx], ...patch };
              }
            }
            return updated;
          });
        }
      }
      sessionEditedRef.current = !!(session as any).userEdited;
      sessionReadyRef.current = true;
      return;
    }

    // ── 4. No session: initialize from YAML (first-ever load of this model) ──
    const DAY_STR_MAP: Record<string, number> = { mon:0, tue:1, wed:2, thu:3, fri:4, sat:5, sun:6 };
    const parseDaysMask = (days?: string[]): boolean[] => {
      if (!days?.length) return [true,true,true,true,true,true,true];
      const m = [false,false,false,false,false,false,false];
      days.forEach(d => { const i = DAY_STR_MAP[d.toLowerCase().slice(0,3)]; if (i !== undefined) m[i] = true; });
      return m;
    };
    const rawSchedules = selectedModel.content?.simulation?.schedules;
    const schedList: any[] = Array.isArray(rawSchedules) ? rawSchedules : [];
    const schedDict: Record<string, any> = (!Array.isArray(rawSchedules) && rawSchedules) ? rawSchedules : {};

    const newInputEvents: InputEvent[] = [];
    Object.entries(selectedModel.content.variables).forEach(([name, data]: [string, any]) => {
      if (data.type !== 'input') return;
      const flatEntries = schedList.filter(s => s.variable === name);
      if (flatEntries.length > 0) {
        flatEntries.forEach((s, i) => {
          const daysList: string[] = Array.isArray(s.days) ? s.days : [];
          const hasDays = daysList.length > 0 && daysList.length < 7;
          let validStart: string = s.valid_start ?? '';
          let validEnd: string   = s.valid_end   ?? '';
          if (!validStart && !validEnd && Array.isArray(s.date_range) && s.date_range.length === 2) {
            validStart = String(s.date_range[0]); validEnd = String(s.date_range[1]);
          }
          newInputEvents.push({
            id: `${name}-sched${i}`, variable: name,
            time: s.time ?? '08:00', timeEnabled: !!s.time,
            value: s.value ?? data.value ?? 0, label: s.label ?? '',
            daysEnabled: hasDays,
            days: hasDays ? parseDaysMask(daysList) : [true,true,true,true,true,true,true],
            validRangeEnabled: !!(validStart || validEnd), validStart, validEnd,
          });
        });
      } else if (schedDict[name]?.points?.length) {
        const seen = new Set<string>();
        const secsToHHMM = (sec: number) => {
          const s2 = sec % 86400;
          return `${String(Math.floor(s2/3600)).padStart(2,'0')}:${String(Math.floor((s2%3600)/60)).padStart(2,'0')}`;
        };
        (schedDict[name].points as any[]).forEach((pt: any, idx: number) => {
          const t2 = secsToHHMM(pt.time ?? 0);
          if (seen.has(t2)) return;
          seen.add(t2);
          newInputEvents.push({
            id: `${name}-ev${idx}`, variable: name, time: t2, timeEnabled: true,
            value: pt.value ?? 0, label: '',
            daysEnabled: false, days: [true,true,true,true,true,true,true],
            validRangeEnabled: false, validStart: '', validEnd: '',
          });
        });
      } else {
        newInputEvents.push({
          id: `${name}-ev0`, variable: name, time: '08:00', timeEnabled: false,
          value: data.value ?? 0, label: '',
          daysEnabled: false, days: [true,true,true,true,true,true,true],
          validRangeEnabled: false, validStart: '', validEnd: '',
        });
      }
    });

    const yamlPlans: any[] = selectedModel.content?.simulation?.plans ?? [];
    if (yamlPlans.length > 0) {
      const loadedPlans: SimPlan[] = yamlPlans.map((plan: any, i: number) => {
        const planSchedList: any[] = Array.isArray(plan.schedules) ? plan.schedules : [];
        const planEvents: InputEvent[] = [];
        Object.entries(selectedModel.content.variables).forEach(([name, vdata]: [string, any]) => {
          if (vdata.type !== 'input') return;
          const entries = planSchedList.filter((s: any) => s.variable === name);
          if (entries.length > 0) {
            entries.forEach((s: any, j: number) => {
              const dl: string[] = Array.isArray(s.days) ? s.days : [];
              const hasDays = dl.length > 0 && dl.length < 7;
              let vs = s.valid_start ?? '';
              let ve = s.valid_end ?? '';
              if (!vs && !ve && Array.isArray(s.date_range) && s.date_range.length === 2) {
                vs = String(s.date_range[0]); ve = String(s.date_range[1]);
              }
              planEvents.push({
                id: `${plan.id ?? `plan${i}`}-${name}-${j}`, variable: name,
                time: s.time ?? '08:00', timeEnabled: !!s.time,
                value: s.value ?? vdata.value ?? 0, label: s.label ?? '',
                daysEnabled: hasDays,
                days: hasDays ? parseDaysMask(dl) : [true,true,true,true,true,true,true],
                validRangeEnabled: !!(vs || ve), validStart: vs, validEnd: ve,
              });
            });
          } else {
            planEvents.push({
              id: `${plan.id ?? `plan${i}`}-${name}-ev0`, variable: name,
              time: '08:00', timeEnabled: false, value: vdata.value ?? 0, label: '',
              daysEnabled: false, days: [true,true,true,true,true,true,true],
              validRangeEnabled: false, validStart: '', validEnd: '',
            });
          }
        });
        return { id: plan.id ?? `plan-${i + 1}`, label: plan.label ?? `${t('sim.plan.label_prefix')} ${i + 1}`, color: PLAN_COLORS[i % PLAN_COLORS.length], inputEvents: planEvents };
      });
      setPlans(loadedPlans);
      setActivePlanId(loadedPlans[0].id);
      setInputEvents(loadedPlans[0].inputEvents);
    } else {
      setInputEvents(newInputEvents);
      setPlans([{ id: 'plan-1', label: t('sim.plan.default_label'), color: PLAN_COLORS[0], inputEvents: newInputEvents }]);
      setActivePlanId('plan-1');
    }

    // Dates and step from YAML
    const sim = selectedModel?.content?.simulation ?? selectedModel?.content?.simulator;
    const DEFAULT_START = '2026-01-01';
    const DEFAULT_END   = '2026-12-31';
    const toStepUnit = (u: string): StepUnit => {
      if (u === 'day') return 'day'; if (u === 'hour') return 'hour';
      if (u === 'minute') return 'minute';
      return 'day';
    };
    if (sim) {
      if (sim.start_date && sim.end_date) {
        set('simStartDate', String(sim.start_date));
        set('simEndDate',   String(sim.end_date));
        const metaStep = selectedModel?.content?.metadata?.step_size;
        if (metaStep?.unit) { set('stepValue', metaStep.value ?? 1); set('stepUnit', toStepUnit(String(metaStep.unit))); }
        else { set('stepValue', sim.step ?? 1); set('stepUnit', toStepUnit(String(sim.step_unit || 'minute'))); }
      } else {
        const UNIT_SEC: Record<string, number> = { minute:60, hour:3600, day:86400, week:604800, month:2592000, year:31536000 };
        const timeUnit = String(sim.time_unit || 'hour').toLowerCase();
        const rawStep  = sim.step_size ?? 1;
        const totalSec = (sim.total_time ?? 365) * rawStep * (UNIT_SEC[timeUnit] ?? 3600);
        set('stepValue', rawStep); set('stepUnit', toStepUnit(timeUnit));
        set('simStartDate', DEFAULT_START); set('simEndDate', totalSecondsToEndDate(DEFAULT_START, totalSec));
      }
    } else {
      set('stepValue', 1); set('stepUnit', 'hour');
      set('simStartDate', DEFAULT_START); set('simEndDate', DEFAULT_END);
    }

    // mcSeed 来自模型 YAML，无论是否有 optimizer 块都需要重置
    set('mcSeed', optBlock?.mc?.seed != null ? Number(optBlock.mc.seed) : null);

    // Opt config from YAML
    if (optBlock && optBlock.enabled !== false) {
      const parseDir = (d: string): 'minimize' | 'maximize' => d === 'maximize' ? 'maximize' : 'minimize';
      const rawObjs: Array<{ variable: string; direction: 'minimize' | 'maximize' }> = [];
      if (optBlock.objective) rawObjs.push({ variable: optBlock.objective.variable || '', direction: parseDir(optBlock.objective.direction || 'minimize') });
      if (Array.isArray(optBlock.objectives)) optBlock.objectives.forEach((o: any) => rawObjs.push({ variable: o.variable || '', direction: parseDir(o.direction || 'minimize') }));
      if (rawObjs.length > 0) setObjectives(rawObjs);

      const parseCondition = (cond: string): { op: '≤' | '≥'; value: number } | null => {
        const m = cond.trim().match(/^([<>]=?)\s*(-?\d+(?:\.\d+)?)/);
        if (!m) return null;
        return { op: m[1] === '>=' || m[1] === '>' ? '≥' : '≤', value: parseFloat(m[2]) };
      };
      if (Array.isArray(optBlock.constraints)) {
        const parsedCons: Array<{ variable: string; op: '≤' | '≥'; value: number }> = [];
        optBlock.constraints.forEach((con: any) => { const p = parseCondition(String(con.condition || '')); if (p && con.variable) parsedCons.push({ variable: con.variable, ...p }); });
        if (parsedCons.length > 0) setConstraints(parsedCons);
      }
      const methodMap: Record<string, string> = { 'nsga2':'NSGA-II','nsga-2':'NSGA-II','nsga_2':'NSGA-II','moead':'MOEA/D','moea/d':'MOEA/D','l-bfgs-b':'l-bfgs-b','lbfgsb':'l-bfgs-b','nelder-mead':'nelder-mead','nelder_mead':'nelder-mead' };
      const mappedMethod = methodMap[String(optBlock.method || '').toLowerCase()];
      if (mappedMethod) setOptAlgo(mappedMethod as any);
      const algoBlock = optBlock.algorithm || {};
      if (algoBlock.population_size) setOptPop(Number(algoBlock.population_size));
      if (algoBlock.n_generations)   setOptGen(Number(algoBlock.n_generations));
      if (optBlock.mc?.enabled && optBlock.mc?.sim_runs) set('simRuns', Math.max(1, Math.min(50, Number(optBlock.mc.sim_runs))));
      setWarmStartEnabled(!!(yamlOptResult?.pareto_front?.length));

      // Apply optimizer.schedules decision entries to inputEvents
      if (Array.isArray(optBlock.schedules)) {
        const withOpt = (optBlock.schedules as any[]).filter((e: any) => e.variable && e.optimize);
        if (withOpt.length > 0) {
          setInputEvents(prev => {
            const updated = prev.map(ev => ({ ...ev }));
            for (const inp of withOpt) {
              const opt = inp.optimize ?? {};
              const idx = updated.findIndex(ev =>
                ev.variable === inp.variable && (!inp.time || ev.time === inp.time)
              );
              if (idx >= 0) {
                const patch: Partial<typeof updated[0]> = { optimizeValue: true };
                if (Array.isArray(opt.value) && opt.value.length >= 2)
                  patch.valueBounds = [opt.value[0], opt.value[1]];
                // T2
                if (Array.isArray(opt.time) && opt.time.length === 2) {
                  patch.optimizeTime = true;
                  patch.timeWindowStart = opt.time[0];
                  patch.timeWindowEnd = opt.time[1];
                  if (opt.time_step) patch.timeStep = opt.time_step;
                }
                // T3
                if (opt.days_pool) {
                  patch.optimizeDays = true;
                  patch.daysPool = opt.days_pool;
                  if (opt.days_n) { patch.daysNMin = opt.days_n[0]; patch.daysNMax = opt.days_n[1]; }
                }
                // T4
                if (Array.isArray(opt.date_range) && opt.date_range.length === 2) {
                  patch.optimizeDateRange = true;
                  patch.dateStartLo = opt.date_range[0][0]; patch.dateStartHi = opt.date_range[0][1];
                  patch.dateEndLo = opt.date_range[1][0];   patch.dateEndHi = opt.date_range[1][1];
                }
                updated[idx] = { ...updated[idx], ...patch };
              }
            }
            return updated;
          });
        }
      }
    }

    setWarmStartEnabled(!!(yamlOptResult?.pareto_front?.length));
    setOptResult(yamlOptResult);
    sessionReadyRef.current = true;

    // Warm-start modal: only on first-ever load (no session existed)
    if (rawResults?.reference?.x?.length > 0) {
      const bestX: number[] = rawResults.reference.x;
      Modal.confirm({
        title: t('sim.opt.ref_detected_title'),
        content: `模型包含推荐解（${bestX.length} 个决策变量），是否将其预填为当前输入方案？`,
        okText: t('sim.opt.load_reference'), cancelText: t('sim.opt.use_default_schedule'),
        onOk: () => setInputEvents(prev => xToInputEvents(bestX, optBlock ?? selectedModel?.rawContent?.optimizer, prev)),
      });
    }
  }, [selectedModel]);

  // ── sync inputEvents → inputParams ──────────────────────────────────────────
  useEffect(() => {
    const params: Record<string, number> = {};
    inputEvents.forEach(ev => {
      params[ev.variable] = (params[ev.variable] ?? 0) + ev.value;
    });
    set('inputParams', params);
  }, [inputEvents]);

  // ── load tree on mount + restore selected model ──────────────────────────────
  useEffect(() => {
    if (storyTree.length === 0) loadFileTree();
  }, []);

  const initialSelectedKey = useRef<string | null>(readSP()?.selectedKey ?? null);
  useEffect(() => {
    if (storyTree.length === 0) return;
    // Restore previously selected model
    const key = initialSelectedKey.current;
    if (key) { initialSelectedKey.current = null; loadFileContent(key, { preserveTab: true }); }
    // Remove stale expandedKeys that no longer exist in the current tree
    const collectFolderKeys = (nodes: DataNode[], acc: Set<React.Key>) => {
      nodes.forEach(n => { if (!n.isLeaf) { acc.add(n.key); if (n.children) collectFolderKeys(n.children, acc); } });
    };
    const validKeys = new Set<React.Key>();
    collectFolderKeys(storyTree, validKeys);
    setExpandedKeys(prev => prev.filter(k => validKeys.has(k)));
  }, [storyTree]);

  // ── restore SimulationState from localStorage on mount ───────────────────────
  useEffect(() => {
    const saved = readSP();
    if (!saved) return;
    setState(prev => ({
      ...prev,
      simulationData: saved.simulationData || [],
      dataPerRun: saved.dataPerRun || [],
      sessionId: saved.sessionId || '',
      status: saved.status === 'running' ? 'paused' : (saved.status || 'idle'),
      currentStep: saved.currentStep ?? 0,
      progress: saved.progress ?? 0,
      totalSteps: saved.totalSteps ?? prev.totalSteps,
      sessionSeed: saved.sessionSeed ?? 0,
    }));
    // Lock state is intentionally not restored: model must be re-validated each session.
    if (saved.sessionId) {
      fetch(`${API_BASE}/simulation/session/${encodeURIComponent(saved.sessionId)}`)
        .then(r => r.json())
        .then(result => {
          if (!result?.success || !result.data) return;
          const data = result.data;
          setState(prev => ({
            ...prev,
            sessionId: data.session_id,
            simulationData: data.outputs || [],
            dataPerRun: data.outputs_per_run || [],
            status: data.completed ? 'completed' : (data.running ? 'paused' : 'paused'),
            currentStep: data.current_step ?? 0,
            totalSteps: data.total_steps ?? prev.totalSteps,
            progress: data.progress ?? 0,
            sessionSeed: data.session_seed ?? prev.sessionSeed,
          }));
          if (Array.isArray(data.output_variables)) setRunOutputVars(data.output_variables);
          if (Array.isArray(data.warnings)) setOutputWarnings(data.warnings);
        })
        .catch(() => {});
    }
  }, []);

  // ── reset session-ready flag on selection change ─────────────────────────────
  useEffect(() => {
    sessionReadyRef.current = false;
    sessionEditedRef.current = false;
  }, [selectedKey]);

  // ── persist per-model session (inputEvents, dates, opt config) ───────────────
  // sessionReadyRef guards against overwriting the persisted session with stale
  // initial state values before the model has loaded and restored its session.
  useEffect(() => {
    if (!selectedKey || !sessionReadyRef.current) return;
    const session: ModelSession = {
      inputEvents, plans, activePlanId,
      simStartDate, simEndDate, stepValue, stepUnit, simRuns, mcSeed,
      objectives, constraints, optAlgo, optPop, optGen,
      optResult,
      userEdited: sessionEditedRef.current,
    };
    persistSession(selectedKey, session);
  }, [selectedKey, inputEvents, plans, activePlanId, simStartDate, simEndDate, stepValue, stepUnit, simRuns, mcSeed, objectives, constraints, optAlgo, optPop, optGen, optResult]);

  // ── persist global UI state (selection, mode, layout) ────────────────────────
  useEffect(() => {
    const current = readSP() || {};
    writeSP({ ...current, selectedKey, mode, openSections: [...openSections], sectionWeights, expandedKeys });
  }, [selectedKey, mode, openSections, sectionWeights, expandedKeys]);

  // ── persist simulation results on status settle ───────────────────────────────
  useEffect(() => {
    const current = readSP() || {};
    if (status === 'running') {
      writeSP({ ...current, status, currentStep, progress, totalSteps, sessionId, sessionSeed });
      return;
    }
    writeSP({ ...current, simulationData, dataPerRun, status, currentStep, progress, totalSteps, sessionId, sessionSeed });
  }, [status, sessionId]);

  // ── auto-switch center tab to simulation when sim is running/completed ───────
  useEffect(() => {
    if (status === 'running' || status === 'completed') setCenterTab('simulation');
  }, [status]);

  // opt poll cleanup on unmount → handled by useOptimizer hook

  // ── loader helpers ────────────────────────────────────────────────────────────
  const loadFileTree = async () => {
    setTreeLoading(true);
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
                icon: <React.Fragment />,
                title: item.title, titleStr: item.title,
              };
            }
          }
          return {
            title: item.type === 'file' ? titleStr : item.title,
            key: item.key,
            icon: undefined,
            isLeaf: item.type === 'file',
            children: item.children ? convert(item.children) : undefined,
            titleStr,
          };
        });
        const modelsNode = result.data.find((n: any) => n.key === 'models');
        if (modelsNode?.children) {
          setStoryTree(convert(modelsNode.children));
        }
      }
    } catch (e: any) {
      message.error(`${t('sim.msg.load_failed')}: ${e.message}`);
    } finally {
      setTreeLoading(false);
    }
  };

  const loadFileContent = async (filePath: string, opts: { preserveTab?: boolean } = {}): Promise<ModelFile | null> => {
    setTreeLoading(true);
    try {
      const cleanPath = filePath.replace(/^models\//, '');
      const fileResult = await fetch(`${API_BASE}/file/${cleanPath}`).then(r => r.json());
      if (!fileResult.success) { message.error(`${t('sim.msg.read_failed')}: ${fileResult.error}`); return null; }
      const { content, path } = fileResult.data;
      const folder = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : undefined;
      const modelName = path.split('/').pop()?.replace(/\.ya?ml$/i, '') || content.metadata?.name || 'unknown';
      let resolvedContent = content;
      try {
        const qs = folder ? `?folder=${encodeURIComponent(folder)}` : '';
        const res = await fetch(`${API_BASE}/models/${encodeURIComponent(modelName)}${qs}`);
        const resolved = await res.json();
        if (resolved?.success && resolved.data) {
          resolvedContent = {
            ...content,
            ...resolved.data,
            metadata: { ...content.metadata, ...resolved.data.metadata },
          };
        } else if (!res.ok) {
          console.warn('Model resolution failed:', resolved?.detail || 'unknown error');
        }
      } catch (e) {
        console.warn('Resolved model load failed, using raw YAML', e);
      }
      const model: ModelFile = {
        key: filePath, title: resolvedContent.metadata?.name || modelName,
        path: filePath, type: resolvedContent.type, category: resolvedContent.category,
        content: resolvedContent, rawContent: content, metadata: resolvedContent.metadata, variables: resolvedContent.variables,
        formulas: resolvedContent.formulas, simulator: resolvedContent.simulator,
        optimizer: resolvedContent.optimizer, imports: resolvedContent.imports,
        provenance: resolvedContent.provenance,
        folder,
        validated: undefined, validationErrors: [],
      };
      setLoadedModels(prev => ({ ...prev, [filePath]: model }));
      setConfirmedModel(model);
      onModelSelect(model);
      if (!opts.preserveTab) setCenterTab('intro');
      return model;
    } catch (e: any) {
      message.error(`${t('sim.msg.load_failed')}: ${e.message}`);
      return null;
    } finally {
      setTreeLoading(false);
    }
  };

  const handleSelect = (keys: React.Key[]) => {
    if (!keys.length) return;
    const key = keys[0] as string;
    if (!key.endsWith('.yaml') && !key.endsWith('.yml')) return;
    if (key === selectedKey) return;
    setSelectedKey(key);
    loadFileContent(key, { preserveTab: true });
  };

  const toggleTreeNode = (key: React.Key) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return [...next];
    });
  };

  const handleTreeNodeClick = (_event: React.MouseEvent, node: DataNode) => {
    if (!node.isLeaf) toggleTreeNode(node.key);
  };

  // sim execution (startSimulation, runBatch, runSingleStep, pause/resume/reset,
  // runAllPlans, handleRunCompared, exportSimCSV, downloadRawModel) → useSimulation hook

  // ── plan management ───────────────────────────────────────────────────────────
  const selectPlan = (id: string) => {
    // Save current inputEvents snapshot into current plan before switching
    setPlans(prev => prev.map(p => p.id === activePlanId ? { ...p, inputEvents } : p));
    setActivePlanId(id);
    const target = plans.find(p => p.id === id);
    if (target) setInputEvents(target.inputEvents);
  };

  const addPlan = () => {
    const id = `plan-${Date.now()}`;
    const newPlan: SimPlan = {
      id, label: `${t('sim.plan.label_prefix')} ${plans.length + 1}`,
      color: PLAN_COLORS[plans.length % PLAN_COLORS.length],
      inputEvents: [...inputEvents], // copy current
    };
    setPlans(prev => prev.map(p => p.id === activePlanId ? { ...p, inputEvents } : p).concat(newPlan));
    setActivePlanId(id);
  };

  const removePlan = (id: string) => {
    if (plans.length <= 1) return;
    const remaining = plans.filter(p => p.id !== id);
    setPlans(remaining);
    if (activePlanId === id) {
      const next = remaining[0];
      setActivePlanId(next.id);
      setInputEvents(next.inputEvents);
    }
  };

  const addPlansFromOpt = (rows: Array<{ x: number[]; f: number[]; rank: number }>) => {
    const optimizer = selectedModel?.content?.optimizer;
    if (!optimizer || rows.length === 0) return;
    const newPlans: SimPlan[] = rows.map((row, i) => ({
      id: `pareto-${row.rank}-${Date.now()}-${i}`,
      label: `Pareto #${row.rank}`,
      color: PLAN_COLORS[(plans.length + i) % PLAN_COLORS.length],
      inputEvents: xToInputEvents(row.x, optimizer, inputEvents),
    }));
    setPlans(prev =>
      prev.map(p => p.id === activePlanId ? { ...p, inputEvents } : p).concat(newPlans)
    );
    // Reset sim status so Run button is enabled; switch mode to sim
    set('status', 'idle');
    set('progress', 0);
    set('currentStep', 0);
    setMode('sim');
    setComparedPlans([]);
    switchCenterTab('simulation');
  };

  // ── apply opt best solution to sim ───────────────────────────────────────────
  // (stays here: needs setInputEvents + setComparedPlans from useSimulation)
  const applyBestToSim = () => {
    const optimizer = selectedModel?.content?.optimizer;
    const bestX = optimizer?.results?.reference?.x;
    if (!optimizer || !Array.isArray(bestX) || bestX.length === 0) {
      message.warning('无推荐解可用'); return;
    }
    setInputEvents(prev => xToInputEvents(bestX, optimizer, prev));
    set('status', 'idle'); set('progress', 0); set('currentStep', 0);
    setComparedPlans([]);
    setMode('sim');
    switchCenterTab('simulation');
  };

  // exportSimCSV / downloadRawModel / pauseSimulation / resumeSimulation /
  // resetSimulation → useSimulation hook (see above)
  // downloadModelYAML / saveResultsToFile → useOptimizer hook (see above)
  // startOptimization / cancelOptimization → useOptimizer hook (see above)

  const reloadFromYAML = () => {
    if (!selectedKey) return;
    clearSession(selectedKey);
    sessionReadyRef.current = false;
    sessionEditedRef.current = false;
    if (selectedKey.startsWith('session/')) {
      const sessModel = sessionModels.find(m => m.key === selectedKey);
      if (sessModel) { setConfirmedModel({ ...sessModel }); onModelSelect({ ...sessModel }); }
    } else {
      loadFileContent(selectedKey, { preserveTab: true });
    }
  };

  // ── import local YAML file ────────────────────────────────────────────────────
  const importFileRef = useRef<HTMLInputElement>(null);
  const builderUploadRef = useRef<HTMLInputElement>(null);

  const handleBuilderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!builderUploadRef.current) return;
    builderUploadRef.current.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const resp = await fetch(`${API_BASE}/model/upload-temp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, filename: file.name }),
      });
      const data = await resp.json();
      if (!data.success) { message.error(data.error || '上传失败'); return; }
      const content = { ...data.raw, ...data.resolved };
      const key = `session/${data.filename}`;
      handleBuilderSessionUpdate(key, content);
      setBuilderAutoEditKey(key);
      openBuilder();
      message.success(`已上传到 Session: ${data.filename}`);
    } catch (err: any) { message.error(err.message || '读取文件失败'); }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!importFileRef.current) return;
    importFileRef.current.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const resp = await fetch(`${API_BASE}/model/upload-temp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, filename: file.name }),
      });
      const data = await resp.json();
      if (!data.success) { message.error(data.error || '导入失败'); return; }

      // Backend resolved imports inline and deleted the temp file.
      // Build ModelFile directly from response — no second server call needed.
      const raw = data.raw || {};
      const resolved = data.resolved || {};
      const content = { ...raw, ...resolved };
      const modelKey = `session/${data.filename}`;
      const modelName = content.metadata?.name || data.filename.replace(/\.ya?ml$/i, '');

      const model: ModelFile = {
        key: modelKey, title: modelName, path: modelKey,
        type: content.type, category: content.category,
        content, rawContent: raw,
        metadata: content.metadata, variables: content.variables,
        formulas: content.formulas, simulator: content.simulator,
        optimizer: content.optimizer, imports: content.imports,
        provenance: content.provenance,
        folder: 'session',
        validated: undefined, validationErrors: [],
      };

      const rawImports = raw?.imports;
      if (!resolved?.resolved && Array.isArray(rawImports) && rawImports.length > 0) {
        message.warning('模型已导入，但 imports 无法解析。路径从 models/ 根出发，如 papers/paper2/my_model');
      }

      setSelectedKey(modelKey);
      setConfirmedModel(model);
      onModelSelect(model);
      setCenterTab('intro');
      setSessionModels(prev => {
        const next = [model, ...prev.filter(m => m.key !== modelKey)].slice(0, 10);
        saveSession(next);
        return next;
      });
      message.success(`已导入 ${data.filename}`);
    } catch (err: any) { message.error(err.message || '读取文件失败'); }
  };

  // ── input event CRUD ──────────────────────────────────────────────────────────
  const addInputEvent = () => {
    const firstInputVar = inputVars[0];
    if (!firstInputVar) return;
    const id = `ev-${Date.now()}`;
    sessionEditedRef.current = true;
    invalidateSim();
    setInputEvents(prev => [...prev, {
      id, variable: firstInputVar.name, time: '08:00', timeEnabled: false,
      value: firstInputVar.value ?? 0, label: '',
      daysEnabled: false, days: [true,true,true,true,true,true,true],
      validRangeEnabled: false, validStart: '', validEnd: '',
    }]);
  };

  const updateInputEvent = (id: string, patch: Partial<InputEvent>) => {
    sessionEditedRef.current = true;
    invalidateSim();
    setInputEvents(prev => prev.map(ev => ev.id === id ? { ...ev, ...patch } : ev));
  };

  const removeInputEvent = (id: string) => {
    sessionEditedRef.current = true;
    invalidateSim();
    setInputEvents(prev => prev.filter(ev => ev.id !== id));
  };

  // ── update opt-only fields (no sim invalidation) ─────────────────────────────
  const updateInputEventOpt = (id: string, patch: Partial<InputEvent>) =>
    setInputEvents(prev => prev.map(ev => ev.id === id ? { ...ev, ...patch } : ev));

  // ── derived data ──────────────────────────────────────────────────────────────
  // inputVars / stateVars declared above (before hook calls)
  const formulas: Record<string, any> = selectedModel?.content?.formulas || {};
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

  const countLeaves = (nodes: DataNode[]): number => {
    let n = 0;
    nodes.forEach(node => { if (node.isLeaf) n++; else if (node.children) n += countLeaves(node.children); });
    return n;
  };
  const total = countLeaves(storyTree);

  const runningModelTitle = runningModelKey
    ? (sessionModels.find(m => m.key === runningModelKey)?.title
      || loadedModels[runningModelKey]?.title
      || runningModelKey.split('/').pop()?.replace(/\.ya?ml$/i, '') || runningModelKey)
    : null;

  const sessionKeys = new Set(
    Object.entries(readMS())
      .filter(([, s]) => !!(s as any)?.userEdited)
      .map(([k]) => k)
  );

  const navigateToRunning = () => {
    if (!runningModelKey) return;
    const sessModel = sessionModels.find(m => m.key === runningModelKey);
    if (sessModel) {
      setSelectedKey(sessModel.key);
      setConfirmedModel(sessModel);
      onModelSelect(sessModel);
      setCenterTab('intro');
    } else {
      setSelectedKey(runningModelKey);
      loadFileContent(runningModelKey, { preserveTab: true });
    }
  };

  const blockIfRunning = (): boolean => {
    if (!scsMode || !runningModelKey || runningModelKey === selectedKey) return false;
    Modal.confirm({
      title: t('sim.run.blocked_title'),
      content: t('sim.run.blocked_content'),
      okText: t('sim.run.goto_running'),
      cancelText: t('sim.control.cancel') || '取消',
      onOk: navigateToRunning,
    });
    return true;
  };

  const isOtherRunning = scsMode && !!runningModelKey && runningModelKey !== selectedKey;
  const otherRunningTip = isOtherRunning ? `请先前往「${runningModelTitle || ''}」停止运行后再启动` : undefined;

  const SimControls = (
    <SimControlBar
      status={status} sessionId={sessionId} sessionSeed={sessionSeed}
      plans={plans} simStartDate={simStartDate} simEndDate={simEndDate}
      stepValue={stepValue} stepUnit={stepUnit} simRuns={simRuns} mcSeed={mcSeed}
      selectedModel={selectedModel} isOtherRunning={isOtherRunning} otherRunningTip={otherRunningTip ?? ''}
      onStart={() => { sessionEditedRef.current = true; startSimulation(); }} onPause={pauseSimulation} onResume={resumeSimulation}
      onStep={runSingleStep} onReset={resetSimulation} onRunAllPlans={runAllPlans}
      onDownload={downloadRawModel}
      onSimStartDateChange={v => set('simStartDate', v)}
      onSimEndDateChange={v => set('simEndDate', v)}
      onStepValueChange={v => set('stepValue', v)}
      onStepUnitChange={v => set('stepUnit', v)}
      onSimRunsChange={v => set('simRuns', v)}
      onMcSeedChange={v => set('mcSeed', v)}
      t={t} c={c as any}
    />
  );

  const existingResults = selectedModel?.rawContent?.optimizer?.results
    ?? selectedModel?.content?.optimizer?.results;
  const hasExistingResults = !!(existingResults?.pareto_front?.length) || !!(optResult?.pareto_front?.length);
  const currentFront = optResult?.pareto_front ?? existingResults?.pareto_front;
  const OptControls = (
    <OptControlBar
      optRunning={optRunning} optCurGen={optCurGen} optTotalGen={optTotalGen}
      warmStartEnabled={warmStartEnabled} warmStartDirty={warmStartDirty} hasExistingResults={hasExistingResults}
      currentFrontCount={currentFront?.length ?? 0}
      optResult={optResult} storedOptResult={storedOptResult}
      simStartDate={simStartDate} simEndDate={simEndDate}
      stepValue={stepValue} stepUnit={stepUnit} simRuns={simRuns} mcSeed={mcSeed}
      selectedModel={selectedModel} isOtherRunning={isOtherRunning} otherRunningTip={otherRunningTip ?? ''}
      onStart={() => { sessionEditedRef.current = true; startOptimization(); }} onCancel={cancelOptimization}
      onWarmStartChange={setWarmStartEnabled}
      onSimStartDateChange={v => set('simStartDate', v)}
      onSimEndDateChange={v => set('simEndDate', v)}
      onStepValueChange={v => set('stepValue', v)}
      onStepUnitChange={v => set('stepUnit', v)}
      onSimRunsChange={v => set('simRuns', v)}
      onMcSeedChange={v => set('mcSeed', v)}
      onDownload={() => optResult ? downloadModelYAML(false) : downloadRawModel()}
      onReload={reloadFromYAML}
      onSaveResults={scsMode
        ? () => { message.success('结果已保存到 Session'); }
        : saveResultsToFile}
      onImportCSV={importParetoFromCSV}
      scsMode={scsMode}
      setOptResult={setOptResult}
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
          onImportFile={() => importFileRef.current?.click()}
          onBuilderUpload={() => builderUploadRef.current?.click()}
          scsMode={scsMode}
          sessionKeys={sessionKeys}
          onReloadModel={reloadFromYAML}
          sessionModels={sessionModels}
          onSelectSessionModel={model => {
            if (builderOpen) {
              const content = model.rawContent || model.content;
              setBuilderSessionMetas(p => ({ ...p, [model.key]: content }));
              setBuilderCheckedFiles(prev => prev.includes(model.key) ? prev : [...prev, model.key]);
              setBuilderAutoEditKey(model.key);
            } else {
              setSelectedKey(model.key);
              setConfirmedModel(model);
              onModelSelect(model);
              setCenterTab('intro');
            }
          }}
          onClearSessionModel={key => {
            setSessionModels(prev => {
              const next = prev.filter(m => m.key !== key);
              saveSession(next);
              return next;
            });
            if (selectedKey === key) { setSelectedKey(null); setConfirmedModel(null); onModelSelect(null); }
          }}
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
            <Tooltip title={leftCollapsed ? '展开模型库' : '折叠模型库'}>
              <button
                onClick={() => setLeftCollapsed(v => !v)}
                style={{ padding: '5px 8px', border: 'none', cursor: 'pointer', background: 'transparent', color: c.textMute, outline: 'none', display: 'flex', alignItems: 'center', flexShrink: 0, borderBottom: '2px solid transparent', marginBottom: -1 }}
              >
                {leftCollapsed ? <RightOutlined style={{ fontSize: 11 }} /> : <LeftOutlined style={{ fontSize: 11 }} />}
              </button>
            </Tooltip>
            {([
              { key: 'intro',        label: 'Overview' },
              { key: 'simulation',   label: 'Simulation' },
              { key: 'optimization', label: 'Optimization' },
              { key: 'report',       label: t('sim.tab.report') || '报告' },
            ] as { key: CenterTab; label: string }[]).map(tab => {
              const isActive = centerTab === tab.key;
              const locked = builderOpen;
              const color = locked ? c.textMute : (isActive ? c.primary : c.textMute);
              const underline = (!locked && isActive) ? `2px solid ${c.primary}` : '2px solid transparent';
              return (
                <Tooltip key={tab.key} title={locked ? '请先关闭模型库编辑' : undefined}>
                  <button
                    onClick={() => {
                      if (locked) return;
                      setCenterTab(tab.key);
                      if (tab.key === 'simulation') setMode('sim');
                      if (tab.key === 'optimization') setMode('opt');
                    }}
                    style={{ padding: '6px 16px', border: 'none', cursor: locked ? 'not-allowed' : 'pointer', background: 'transparent', color, fontWeight: (!locked && isActive) ? 600 : 400, borderBottom: underline, marginBottom: -1, outline: 'none', transition: 'all 0.12s', opacity: locked ? 0.4 : 1 }}
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
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px 6px 16px', border: 'none', cursor: 'pointer', background: 'transparent', color: c.primary, fontWeight: 600, borderBottom: `2px solid ${c.primary}`, marginBottom: -1, outline: 'none' }}
                >
                  <BuildOutlined style={{ fontSize: 12 }} />
                  模型库
                </button>
                <Tooltip title="关闭编辑（完成）">
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
              <SimIntroTab
                selectedModel={selectedModel} outputVars={outputVars}
                formulas={formulas} provenance={provenance}
                introOpen={introOpen} setIntroOpen={setIntroOpen}
                isDarkMode={isDarkMode} c={c} t={t}
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
                  comparedPlans={comparedPlans}
                  onExportCSV={exportSimCSV}
                  simLogs={simLogs}
                />
              }
              progress={<ProgressStrip label="Simulation" percent={progress} detail={`step ${currentStep}/${totalSteps || '-'} · ${status}`} active={status === 'running'} c={c} isDarkMode={isDarkMode} />}
            />
          )}

          {centerTab === 'optimization' && (
            <WorkspacePage
              controls={OptControls}
              setup={
                <OptSetupTab
                  inputEvents={inputEvents}
                  addInputEvent={addInputEvent}
                  removeInputEvent={removeInputEvent}
                  plans={plans}
                  onImportFromPlan={(events) => setInputEvents(events)}
                  updateInputEvent={updateInputEvent}
                  updateInputEventOpt={updateInputEventOpt}
                  inputVars={inputVars}
                  allVarNames={allVarNames}
                  openSections={openSections} setOpenSections={setOpenSections}
                  simStartDate={simStartDate} simEndDate={simEndDate}
                  objectives={objectives} setObjectives={setObjectives}
                  constraints={constraints} setConstraints={setConstraints}
                  optAlgo={optAlgo} setOptAlgo={setOptAlgo}
                  optPop={optPop} setOptPop={setOptPop}
                  optGen={optGen} setOptGen={setOptGen}
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
              progress={<ProgressStrip label="Optimization" percent={optTotalGen ? (optCurGen / optTotalGen) * 100 : (optResult ? 100 : 0)} detail={`gen ${optCurGen}/${optTotalGen || '-'} · ${optRunning ? 'running' : optResult ? 'completed' : 'idle'}`} active={optRunning} c={c} isDarkMode={isDarkMode} />}
            />
          )}

          {centerTab === 'report' && (
            <SimReportTab
              selectedModel={selectedModel}
              simulationData={simulationData} dataPerRun={dataPerRun}
              outputVars={outputVars} stateVars={stateVars} inputVars={inputVars}
              formulas={formulas} inputParams={inputParams}
              simStartDate={simStartDate} simEndDate={simEndDate}
              stepValue={stepValue} stepUnit={stepUnit} batchSize={batchSize}
              objectives={objectives} constraints={constraints}
              optAlgo={optAlgo} optPop={optPop} optGen={optGen}
              mode={mode}
              reportSections={reportSections} setReportSections={setReportSections}
              openReportPreviews={openReportPreviews} setOpenReportPreviews={setOpenReportPreviews}
              reportGenerating={reportGenerating} setReportGenerating={setReportGenerating}
              isDarkMode={isDarkMode} c={c} t={t} fontSize={fontSize}
            />
          )}

          {centerTab === 'builder' && (
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <FileEditor
                isDarkMode={isDarkMode} c={c}
                scsMode={scsMode}
                controlledFiles={builderCheckedFiles}
                onReloadTree={loadFileTree}
                onUncheckedFile={(key: string) => setBuilderCheckedFiles(prev => prev.filter(k => k !== key))}
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
        title="合并模型文件"
        okText="合并"
        cancelText="取消"
        confirmLoading={merging}
        onOk={handleMerge}
        onCancel={() => setMergeDialogOpen(false)}
      >
        <div style={{ marginBottom: 12, color: c.textSec }}>
          选中的 {builderCheckedFiles.length} 个文件将合并：
          {builderCheckedFiles.map(f => (
            <div key={f} style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 2, color: c.textMute }}>• {f}</div>
          ))}
        </div>
        {scsMode ? (
          <>
            <div style={{ marginBottom: 4, color: c.textSec, fontSize: 12 }}>文件名（保存到 Session）：</div>
            <Input
              value={mergeOutPath.replace(/^.*\//, '').replace(/\.ya?ml$/i, '')}
              onChange={e => setMergeOutPath(e.target.value)}
              placeholder="merged"
              style={{ fontFamily: 'monospace' }}
            />
          </>
        ) : (
          <>
            <div style={{ marginBottom: 4, color: c.textSec, fontSize: 12 }}>输出路径（相对 models/）：</div>
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
        title={scsMode ? '新建 Session 模型' : '新建模型文件'}
        okText="创建"
        cancelText="取消"
        confirmLoading={creatingFile}
        onOk={handleCreateFile}
        onCancel={() => { setNewFileDialogOpen(false); setNewFilePath(''); }}
      >
        <div style={{ marginBottom: 4, color: c.textSec, fontSize: 12 }}>
          {scsMode ? '模型名称：' : '文件路径（相对 models/）：'}
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
