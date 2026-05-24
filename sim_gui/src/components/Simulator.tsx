// sim_gui/src/components/Simulator.tsx
// State, effects, and business logic. UI split into sub-components.

import React, { useState, useEffect, useRef } from 'react';
import { Button, Input, InputNumber, message, Modal, Select, Tooltip } from 'antd';
import { BuildOutlined, CloseOutlined, DownloadOutlined, LeftOutlined, PauseOutlined, PlayCircleOutlined, RightOutlined, StepForwardOutlined, StopOutlined } from '@ant-design/icons';
import type { SimulatorProps, SimulationDataPoint, SimulationState, StepUnit, DataNode, ModelFile, InputEvent, OptInput, PlanResult, SimPlan, ModelSession } from '../types';
import { dump as yamlDump } from 'js-yaml';

const PLAN_COLORS = ['#e53935', '#1e88e5', '#ff7043', '#7b1fa2', '#0097a7', '#558b2f'];

// Expand "HH:MM~HH:MM" + opt_step to discrete time slot list.
function expandTimeWindow(window: string, optStep = '1h'): string[] {
  const [s, e] = window.split('~').map(p => p.trim());
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  const step = optStep === '15min' ? 15 : 60;
  const slots: string[] = [];
  for (let t = sh * 60 + sm; t <= eh * 60 + em; t += step)
    slots.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  return slots;
}

// Converts a Pareto solution x-vector back to inputEvents.
// Handles list-format inputs (T1–T4) and legacy regimen: format.
// x vector layout per entry: [value?, time_slot_idx?, pattern_idx?, day_offset?]
function xToInputEvents(x: number[], optimizerConfig: any, baseEvents: InputEvent[]): InputEvent[] {
  const result = baseEvents.map(ev => ({ ...ev }));
  const DAY_MAP: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

  if (Array.isArray(optimizerConfig?.inputs)) {
    let xi = 0;
    for (const inp of optimizerConfig.inputs as any[]) {
      if (!inp.optimize) continue;
      let idx = result.findIndex(ev =>
        ev.variable === inp.variable &&
        (inp.time_window ? true : ev.time === (inp.time ?? ev.time))
      );
      // If no matching sim event exists, create one for this plan
      if (idx === -1) {
        result.push({
          id: `opt-gen-${inp.variable}-${inp.time ?? 'any'}`,
          variable: inp.variable, label: inp.label || inp.variable,
          time: inp.time ?? '08:00', timeEnabled: !!inp.time,
          value: 0, daysEnabled: false, days: [true,true,true,true,true,true,true],
          validRangeEnabled: false, validStart: '', validEnd: '',
        });
        idx = result.length - 1;
      }
      // T1: value
      if (Array.isArray(inp.optimize.value)) {
        if (idx >= 0 && xi < x.length) result[idx] = { ...result[idx], value: x[xi] };
        xi++;
      }
      // T2: time slot
      if (inp.optimize.time && inp.time_window) {
        const slots = expandTimeWindow(inp.time_window, inp.opt_step ?? '1h');
        const si = Math.max(0, Math.min(slots.length - 1, Math.round(x[xi] ?? 0)));
        if (idx >= 0) result[idx] = { ...result[idx], time: slots[si] };
        xi++;
      }
      // T3: day pattern
      if (inp.optimize.days && Array.isArray(inp.days_options)) {
        const pi = Math.max(0, Math.min(inp.days_options.length - 1, Math.round(x[xi] ?? 0)));
        if (idx >= 0) {
          const daysArr = Array(7).fill(false);
          for (const d of (inp.days_options[pi] as string[])) if (DAY_MAP[d] !== undefined) daysArr[DAY_MAP[d]] = true;
          result[idx] = { ...result[idx], days: daysArr, daysEnabled: true };
        }
        xi++;
      }
      // T4a: date start offset
      if (inp.optimize.date_start && inp.date_start_window) {
        const wStart = inp.date_start_window.split('~')[0].trim();
        const offset = Math.max(0, Math.round(x[xi] ?? 0));
        if (idx >= 0) {
          const d = new Date(wStart); d.setDate(d.getDate() + offset);
          result[idx] = { ...result[idx], validStart: d.toISOString().slice(0, 10), validRangeEnabled: true };
        }
        xi++;
      }
      // T4b: date end offset
      if (inp.optimize.date_end && inp.date_end_window) {
        const wStart = inp.date_end_window.split('~')[0].trim();
        const offset = Math.max(0, Math.round(x[xi] ?? 0));
        if (idx >= 0) {
          const d = new Date(wStart); d.setDate(d.getDate() + offset);
          result[idx] = { ...result[idx], validEnd: d.toISOString().slice(0, 10), validRangeEnabled: true };
        }
        xi++;
      }
    }
  } else if (optimizerConfig?.regimen) {
    // Legacy regimen: format
    const varName = optimizerConfig.regimen.variable || '';
    (optimizerConfig.regimen.events || []).forEach((ev: any, i: number) => {
      if (i >= x.length) return;
      const idx = result.findIndex(r => r.variable === varName && r.time === ev.time);
      if (idx >= 0) result[idx] = { ...result[idx], value: x[i] };
    });
  }
  return result;
}
import FileEditor from './FileEditor';
import { validateModelFile } from '../core/validate';
import { useI18n } from '../core/i18n';
import { getC } from '../core/theme';
import SimModelTree from './SimModelTree';
import SimSetupTab from './SimSetupTab';
import OptSetupTab from './OptSetupTab';
import SimIntroTab from './SimIntroTab';
import SimPlotTab from './SimPlotTab';
import SimOptTab from './SimOptTab';
import SimReportTab from './SimReportTab';

function useResize(initial: number, min = 150, max = 700, direction: 'right' | 'left' = 'right') {
  const [width, setWidth] = useState(initial);
  const wRef = useRef(width);
  wRef.current = width;
  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = wRef.current;
    const onMove = (ev: MouseEvent) => {
      const delta = direction === 'right' ? ev.clientX - startX : startX - ev.clientX;
      setWidth(Math.max(min, Math.min(max, startW + delta)));
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
  return { width, startDrag };
}

const API_BASE = '/api';

const SIM_PERSIST_KEY = 'sim_persist';
const readSP = (): any => { try { return JSON.parse(localStorage.getItem(SIM_PERSIST_KEY) || 'null'); } catch { return null; } };
const writeSP = (data: object): void => { try { localStorage.setItem(SIM_PERSIST_KEY, JSON.stringify(data)); } catch {} };

// Per-model session storage
const MODEL_SESSION_KEY = 'lm_model_sessions';
const readMS = (): Record<string, ModelSession> => { try { return JSON.parse(localStorage.getItem(MODEL_SESSION_KEY) || '{}'); } catch { return {}; } };
const writeMS = (sessions: Record<string, ModelSession>): void => { try { localStorage.setItem(MODEL_SESSION_KEY, JSON.stringify(sessions)); } catch {} };

// Initialize session map from localStorage; migrate legacy global inputEvents on first run.
function initModelSessions(): Record<string, ModelSession> {
  const sessions = readMS();
  const sp = readSP();
  if (sp?.selectedKey && sp.inputEvents?.length && !sessions[sp.selectedKey]) {
    sessions[sp.selectedKey] = {
      inputEvents: sp.inputEvents,
      plans: [{ id: 'plan-1', label: '方案 1', color: PLAN_COLORS[0], inputEvents: sp.inputEvents }],
      activePlanId: 'plan-1',
      simStartDate: sp.simStartDate || '2026-01-01',
      simEndDate: sp.simEndDate || '2026-12-31',
      stepValue: sp.stepValue ?? 1,
      stepUnit: sp.stepUnit ?? 'hour',
      objectives: [], constraints: [],
      optAlgo: 'NSGA-II', optPop: 50, optGen: 80,
      optInputs: [], optBackgrounds: [],
    };
  }
  // Migrate existing sessions that lack the new fields
  for (const key of Object.keys(sessions)) {
    const s = sessions[key] as any;
    if (!('optInputs' in s)) s.optInputs = [];
    if (!('optBackgrounds' in s)) s.optBackgrounds = [];
  }
  return sessions;
}

type CenterTab = 'intro' | 'simulation' | 'optimization' | 'report' | 'builder';

const Simulator: React.FC<SimulatorProps> = ({
  selectedModel, state, setState,
  isLocked, setIsLocked, isDarkMode,
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
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[] } | null>(null);

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

  // ── left panel sections ───────────────────────────────────────────────────────
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(readSP()?.openSections || ['inputs', 'opt']));
  const [introOpen, setIntroOpen] = useState<Set<string>>(new Set(['meta', 'variables', 'formulas', 'refs']));
  const [sectionWeights, setSectionWeights] = useState<Record<string, number>>(() => readSP()?.sectionWeights || { scene: 2, inputs: 1, vars: 1, formulas: 1, opt: 1 });

  // ── opt inputs (decision vars) + backgrounds ─────────────────────────────────
  const [optInputs, setOptInputs] = useState<OptInput[]>([]);
  const [optBackgrounds, setOptBackgrounds] = useState<InputEvent[]>([]);

  // ── opt mode state ───────────────────────────────────────────────────────────
  const [optRanges, setOptRanges] = useState<Record<string, { min: number; max: number; locked: boolean }>>({});
  const [objectives, setObjectives] = useState<Array<{ variable: string; direction: 'minimize' | 'maximize' }>>([]);
  const [constraints, setConstraints] = useState<Array<{ variable: string; op: '≤' | '≥'; value: number }>>([]);
  const [optAlgo, setOptAlgo] = useState<'NSGA-II' | 'MOEA/D' | 'l-bfgs-b' | 'nelder-mead'>('NSGA-II');
  const [optPop, setOptPop] = useState(50);
  const [optGen, setOptGen] = useState(80);
  const [comparedPlans, setComparedPlans] = useState<PlanResult[]>([]);
  const [warmStartEnabled, setWarmStartEnabled] = useState(true);
  const [storedOptResult, setStoredOptResult] = useState<any>(null); // pre-loaded from YAML
  const [optResult, setOptResult] = useState<any>(null);
  const [optRunning, setOptRunning] = useState(false);
  const [optCurGen, setOptCurGen] = useState(0);
  const [optTotalGen, setOptTotalGen] = useState(0);
  const [optLogs, setOptLogs] = useState<Array<{t: number; msg: string}>>([]);
  const [optHistory, setOptHistory] = useState<any[]>([]);
  const [optElapsed, setOptElapsed] = useState(0);
  const [optJobId, setOptJobId] = useState<string | null>(null);
  const optPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [optMethod, setOptMethod] = useState('');
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

  const isRunningRef = useRef(false);
  const modelSessionsRef = useRef<Record<string, ModelSession>>(initModelSessions());
  // sessionReadyRef prevents the save-session effect from overwriting persisted session data
  // with stale initial state before the model has finished loading and restoring its session.
  const sessionReadyRef = useRef(false);

  const STEP_UNITS: Record<StepUnit, number> = { day: 86400, hour: 3600, minute: 60, second: 1 };

  const dateToHours = (start: string, end: string) =>
    Math.max(0, (new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 3_600_000);

  const totalSecondsToEndDate = (startDate: string, totalSec: number): string => {
    const d = new Date(startDate + 'T00:00:00');
    d.setSeconds(d.getSeconds() + Math.round(totalSec));
    return d.toISOString().slice(0, 10);
  };

  const set = <K extends keyof SimulationState>(key: K, val: SimulationState[K]) =>
    setState(prev => ({ ...prev, [key]: val }));
  const setSimData = (val: SimulationDataPoint[] | ((p: SimulationDataPoint[]) => SimulationDataPoint[])) =>
    setState(prev => ({ ...prev, simulationData: typeof val === 'function' ? val(prev.simulationData) : val }));

  // ── init on model load ───────────────────────────────────────────────────────
  useEffect(() => {
    setRunOutputVars([]);
    setOutputWarnings([]);
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
    const rawResults = optBlock?.results;
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
      setOptResult(session.optResult ?? null);
      setOptInputs(session.optInputs ?? []);
      setOptBackgrounds(session.optBackgrounds ?? []);
      setWarmStartEnabled(!!(optBlock?.results?.pareto_front?.length));
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
          if (!validStart && !validEnd && s.date_range) {
            const parts = String(s.date_range).split('~');
            if (parts.length === 2) { validStart = parts[0].trim(); validEnd = parts[1].trim(); }
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
              if (!vs && !ve && s.date_range) {
                const parts = String(s.date_range).split('~');
                if (parts.length === 2) { vs = parts[0].trim(); ve = parts[1].trim(); }
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
      if (u === 'minute') return 'minute'; if (u === 'second') return 'second';
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
        const UNIT_SEC: Record<string, number> = { second:1, minute:60, hour:3600, day:86400, week:604800, month:2592000, year:31536000 };
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
      if (optBlock.mc?.seed != null) set('mcSeed', Number(optBlock.mc.seed));
      else set('mcSeed', null);
      setWarmStartEnabled(!!(optBlock.results?.pareto_front?.length));

      // Build optInputs from YAML optimizer.inputs (decision variables only)
      if (Array.isArray(optBlock.inputs)) {
        const withOpt = (optBlock.inputs as any[]).filter((e: any) => e.variable && Array.isArray(e.optimize?.value) && e.optimize.value.length >= 2);
        if (withOpt.length > 0) {
          const newOptInputs: OptInput[] = withOpt.map((inp: any) => ({
            id: `opt-${inp.variable}-${inp.time ?? 'any'}`,
            variable: inp.variable,
            label: inp.label || inp.variable,
            valueBounds: [inp.optimize.value[0], inp.optimize.value[1]] as [number, number],
            time: inp.time ?? '08:00',
            timeEnabled: !!inp.time,
            timeWindow: inp.time_window,
            optStep: inp.opt_step ?? '1h',
            optimizeTime: !!inp.optimize?.time,
            daysEnabled: !!(inp.days || inp.days_options),
            days: parseDaysMask(Array.isArray(inp.days) ? inp.days : undefined),
            daysOptions: inp.days_options,
            optimizeDays: !!inp.optimize?.days,
            validRangeEnabled: !!(inp.valid_start || inp.valid_end || inp.date_start_window),
            validStart: inp.valid_start ?? '',
            validEnd: inp.valid_end ?? '',
            dateStartWindow: inp.date_start_window,
            optimizeDateStart: !!inp.optimize?.date_start,
            dateEndWindow: inp.date_end_window,
            optimizeDateEnd: !!inp.optimize?.date_end,
          }));
          setOptInputs(newOptInputs);
        }
        // Build optBackgrounds from fixed entries (no optimize block) in optimizer.inputs
        const fixedEntries = (optBlock.inputs as any[]).filter((e: any) => e.variable && !('optimize' in e));
        if (fixedEntries.length > 0) {
          setOptBackgrounds(fixedEntries.map((e: any, i: number) => ({
            id: `optbg-${i}-${e.variable}`,
            variable: e.variable, label: e.label || e.variable,
            time: e.time ?? '08:00', timeEnabled: !!e.time,
            value: typeof e.value === 'number' ? e.value : 0,
            daysEnabled: !!e.days, days: parseDaysMask(Array.isArray(e.days) ? e.days : undefined),
            validRangeEnabled: !!(e.valid_start || e.valid_end),
            validStart: e.valid_start ?? '', validEnd: e.valid_end ?? '',
          })));
        }
      }
      // Also load optimizer.schedules as optBackgrounds (preferred over fixed inputs in optimizer.inputs)
      if (Array.isArray(optBlock.schedules) && optBlock.schedules.length > 0) {
        setOptBackgrounds((optBlock.schedules as any[]).map((s: any, i: number) => ({
          id: `optbg-s-${i}-${s.variable}`,
          variable: s.variable, label: s.label || s.variable,
          time: s.time ?? '08:00', timeEnabled: !!s.time,
          value: typeof s.value === 'number' ? s.value : 0,
          daysEnabled: !!s.days, days: parseDaysMask(Array.isArray(s.days) ? s.days : undefined),
          validRangeEnabled: !!(s.valid_start || s.valid_end || s.date_range),
          validStart: s.valid_start ?? '', validEnd: s.valid_end ?? '',
        })));
      }
    }

    setOptResult(yamlOptResult);
    sessionReadyRef.current = true;

    // Warm-start modal: only on first-ever load (no session existed)
    if (optBlock?.results?.reference?.x?.length > 0) {
      const bestX: number[] = optBlock.results.reference.x;
      Modal.confirm({
        title: t('sim.opt.ref_detected_title'),
        content: `模型包含推荐解（${bestX.length} 个决策变量），是否将其预填为当前输入方案？`,
        okText: t('sim.opt.load_reference'), cancelText: t('sim.opt.use_default_schedule'),
        onOk: () => setInputEvents(prev => xToInputEvents(bestX, optBlock, prev)),
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

  // ── reset validation, lock, and session-ready flag on selection change ────────
  useEffect(() => {
    sessionReadyRef.current = false;
    setValidationResult(null);
    setIsLocked(false);
  }, [selectedKey]);

  // ── persist per-model session (inputEvents, dates, opt config) ───────────────
  // sessionReadyRef guards against overwriting the persisted session with stale
  // initial state values before the model has loaded and restored its session.
  useEffect(() => {
    if (!selectedKey || !sessionReadyRef.current) return;
    const session: ModelSession = {
      inputEvents, plans, activePlanId,
      simStartDate, simEndDate, stepValue, stepUnit,
      objectives, constraints, optAlgo, optPop, optGen,
      optResult, optInputs, optBackgrounds,
    };
    modelSessionsRef.current[selectedKey] = session;
    const all = readMS();
    all[selectedKey] = session;
    writeMS(all);
  }, [selectedKey, inputEvents, plans, activePlanId, simStartDate, simEndDate, stepValue, stepUnit, objectives, constraints, optAlgo, optPop, optGen, optResult, optInputs, optBackgrounds]);

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

  // ── cleanup opt poll on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => { if (optPollRef.current) clearInterval(optPollRef.current); };
  }, []);

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
    if (selectedKey && selectedKey !== filePath) stopAllJobs();
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
          resolvedContent = { ...content, ...resolved.data };
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
    setSelectedKey(key);
    setValidationResult(null);
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

  const handleValidateAndLock = async () => {
    if (!selectedKey) return;
    setValidating(true);
    setValidationResult(null);
    await loadFileContent(selectedKey, { preserveTab: true });
    const result = await validateModelFile(selectedKey);
    if (result.valid) {
      setValidationResult(null);
      setIsLocked(true);
      message.success(t('sim.msg.validation_ok'));
    } else {
      setValidationResult(result);
      setIsLocked(false);
      const firstErrors = (result.errors || []).slice(0, 3).join('；');
      message.error(`验证失败：${firstErrors}${result.errors.length > 3 ? `…（共 ${result.errors.length} 个错误）` : ''}`);
    }
    setValidating(false);
  };

  // ── sim control ───────────────────────────────────────────────────────────────
  const startSimulation = async () => {
    if (!selectedModel) return;
    try {
      set('status', 'running'); set('progress', 0); set('currentStep', 0);
      setSimData([]);
      setComparedPlans([]);
      setState(prev => ({ ...prev, dataPerRun: [], sessionSeed: 0, sessionId: '' }));
      isRunningRef.current = true;
      const regimenPayload = inputEvents
        .filter(ev => inputVars.some(v => v.name === ev.variable))
        .map(ev => ({
          variable: ev.variable,
          events: [{ id: ev.id, time: ev.time, value: ev.value }],
          days_enabled: ev.daysEnabled,
          days: ev.days,
          valid_range_enabled: ev.validRangeEnabled,
          valid_start: ev.validStart,
          valid_end: ev.validEnd,
        }));
      const resp = await fetch(`${API_BASE}/simulation/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: selectedModel.key.split('/').pop()?.replace(/\.ya?ml$/i, '') || selectedModel.content!.metadata.name,
          folder: selectedModel.folder,
          time_hours: dateToHours(simStartDate, simEndDate),
          step_size: stepValue * STEP_UNITS[stepUnit],
          input_params: inputParams,
          regimens: regimenPayload,
          sim_runs: simRuns,
          ...(mcSeed != null ? { seed: mcSeed } : {}),
        }),
      });
      const result = await resp.json();
      if (result.success && result.data) {
        set('sessionId', result.data.session_id);
        set('totalSteps', result.data.total_steps);
        if (Array.isArray(result.data.output_variables)) setRunOutputVars(result.data.output_variables);
        const warnings = Array.isArray(result.data.warnings) ? result.data.warnings : [];
        setOutputWarnings(warnings);
        if (warnings.length > 0) message.warning(warnings.join('；'));
        if (result.data.session_seed) set('sessionSeed', result.data.session_seed);
        runBatch(result.data.session_id);
      } else {
        message.error(result.error || t('sim.msg.start_failed'));
        set('status', 'idle'); isRunningRef.current = false;
      }
    } catch (e: any) { message.error(e.message); set('status', 'idle'); isRunningRef.current = false; }
  };

  const runBatch = async (sid: string) => {
    const loop = async () => {
      if (!isRunningRef.current) return;
      try {
        const r = await fetch(`${API_BASE}/simulation/batch`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sid, steps: batchSize, input_changes: inputParams }),
        });
        const res = await r.json();
        if (res.success && res.data) {
          set('currentStep', res.data.current_step);
          set('progress', res.data.progress);
          setSimData(prev => [...prev, ...res.data.outputs]);
          if (res.data.outputs_per_run && res.data.sim_runs > 1) {
            setState(prev => {
              const incoming: SimulationDataPoint[][] = res.data.outputs_per_run;
              const existing = prev.dataPerRun.length > 0 ? prev.dataPerRun : Array.from({ length: incoming.length }, () => []);
              const merged = existing.map((runArr, i) => [...runArr, ...(incoming[i] || [])]);
              return { ...prev, dataPerRun: merged };
            });
          }
          if (res.data.completed) {
            set('status', 'completed'); isRunningRef.current = false;
            message.success(t('sim.msg.sim_complete'));
          } else setTimeout(loop, updateInterval);
        } else {
          message.error(res.error || t('sim.msg.start_failed'));
          set('status', 'idle'); isRunningRef.current = false;
        }
      } catch { set('status', 'idle'); isRunningRef.current = false; }
    };
    loop();
  };

  const runSingleStep = async () => {
    if (!sessionId) return;
    try {
      const r = await fetch(`${API_BASE}/simulation/batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, steps: 1, input_changes: inputParams }),
      });
      const res = await r.json();
      if (res.success && res.data) {
        set('currentStep', res.data.current_step);
        set('progress', res.data.progress);
        setSimData(prev => [...prev, ...res.data.outputs]);
        set('status', res.data.completed ? 'completed' : 'paused');
        if (res.data.completed) message.success(t('sim.msg.sim_complete'));
      }
    } catch (e: any) { message.error(e.message); }
  };

  // ── multi-plan comparison ─────────────────────────────────────────────────────
  const handleRunCompared = async (selectedRows: Array<{ x: number[]; f: number[]; rank: number }>) => {
    if (!selectedModel || selectedRows.length === 0) return;
    const optimizer = selectedModel.content?.optimizer;
    if (!optimizer) { message.warning('无优化配置'); return; }

    const plans: PlanResult[] = selectedRows.map((row, i) => ({
      id: `pareto-${row.rank}`,
      label: `Pareto #${row.rank}`,
      color: PLAN_COLORS[i % PLAN_COLORS.length],
      data: [], runsData: [], running: true,
    }));
    setComparedPlans(plans);
    switchCenterTab('simulation');

    const modelName = selectedModel.key.split('/').pop()?.replace(/\.ya?ml$/i, '') || selectedModel.content?.metadata?.name || '';
    const timeHours = dateToHours(simStartDate, simEndDate);
    const stepSizeSec = stepValue * STEP_UNITS[stepUnit];
    const localInputVars = selectedModel.content?.variables
      ? Object.entries(selectedModel.content.variables).filter(([, d]: [string, any]) => d.type === 'input').map(([name]) => name)
      : [];

    await Promise.all(selectedRows.map(async (row, i) => {
      try {
        const planEvents = xToInputEvents(row.x, optimizer, inputEvents);
        const regimens = planEvents
          .filter(ev => localInputVars.includes(ev.variable))
          .map(ev => ({
            variable: ev.variable,
            events: [{ id: ev.id, time: ev.time, value: ev.value }],
            days_enabled: ev.daysEnabled, days: ev.days,
            valid_range_enabled: ev.validRangeEnabled,
            valid_start: ev.validStart, valid_end: ev.validEnd,
          }));
        const startResult = await fetch(`${API_BASE}/simulation/start`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_name: modelName, folder: selectedModel.folder, time_hours: timeHours, step_size: stepSizeSec, input_params: inputParams, regimens, sim_runs: simRuns, ...(mcSeed != null ? { seed: mcSeed } : {}) }),
        }).then(r => r.json());
        if (!startResult.success) throw new Error(startResult.error);
        const batchResult = await fetch(`${API_BASE}/simulation/batch`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: startResult.data.session_id, steps: startResult.data.total_steps, input_changes: inputParams }),
        }).then(r => r.json());
        if (!batchResult.success) throw new Error(batchResult.error);
        setComparedPlans(prev => prev.map((p, idx) => idx !== i ? p : {
          ...p,
          data: batchResult.data.outputs || [],
          runsData: (batchResult.data.outputs_per_run?.length > 1) ? batchResult.data.outputs_per_run : [],
          running: false,
        }));
      } catch (e: any) {
        console.error(`Plan ${i} failed:`, e);
        setComparedPlans(prev => prev.map((p, idx) => idx !== i ? p : { ...p, running: false }));
      }
    }));
  };

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

  // Run all plans in parallel with synchronized batch rounds.
  // Phase 1: start all N sessions simultaneously.
  // Phase 2: each round sends a batch for every incomplete plan in parallel →
  //          all curves grow together in sync. Chunk size 500 keeps backend load low.
  const runAllPlans = async () => {
    if (!selectedModel) return;
    const currentPlans = plans.map(p => p.id === activePlanId ? { ...p, inputEvents } : p);

    setComparedPlans(currentPlans.map(plan => ({
      id: plan.id, label: plan.label, color: plan.color, data: [], runsData: [], running: true,
    })));
    setSimData([]);
    set('status', 'running'); set('progress', 0); set('currentStep', 0);
    isRunningRef.current = true;

    const modelName = selectedModel.key.split('/').pop()?.replace(/\.ya?ml$/i, '') || selectedModel.content?.metadata?.name || '';
    const timeHours = dateToHours(simStartDate, simEndDate);
    const stepSizeSec = stepValue * STEP_UNITS[stepUnit];
    const localInputVarNames = new Set(inputVars.map((v: any) => v.name));
    const CHUNK = 500; // steps per batch — balances speed vs backend load

    type Session = { sid: string; total: number; done: boolean; failed: boolean; planIdx: number };

    // Phase 1: start all sessions in parallel
    const startResults = await Promise.allSettled(currentPlans.map(async (plan, i) => {
      const regimens = plan.inputEvents
        .filter(ev => localInputVarNames.has(ev.variable))
        .map(ev => ({ variable: ev.variable, events: [{ id: ev.id, time: ev.time, value: ev.value }], days_enabled: ev.daysEnabled, days: ev.days, valid_range_enabled: ev.validRangeEnabled, valid_start: ev.validStart, valid_end: ev.validEnd }));
      const r = await fetch(`${API_BASE}/simulation/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: modelName, folder: selectedModel.folder, time_hours: timeHours, step_size: stepSizeSec, input_params: inputParams, regimens, sim_runs: simRuns }),
      }).then(res => res.json());
      if (!r.success) throw new Error(r.error || '启动失败');
      return { sid: r.data.session_id, total: r.data.total_steps, planIdx: i, outputVars: r.data.output_variables };
    }));

    const sessions: Session[] = startResults.map((res, i) => {
      if (res.status === 'rejected') {
        message.error(`方案 "${currentPlans[i].label}" 启动失败`);
        setComparedPlans(prev => prev.map((r, idx) => idx !== i ? r : { ...r, running: false }));
        return { sid: '', total: 0, done: true, failed: true, planIdx: i };
      }
      return { ...res.value, done: false, failed: false };
    });
    const firstOV = (startResults as PromiseFulfilledResult<any>[])
      .find(r => r.status === 'fulfilled' && Array.isArray(r.value?.outputVars))?.value?.outputVars;
    if (firstOV) setRunOutputVars(firstOV);

    // Per-plan accumulated data (mutated in-place for performance)
    const planData: any[][] = currentPlans.map(() => []);
    const planRunsData: any[][][] = currentPlans.map(() => []);

    // Phase 2: synchronized batch loop — all plans advance together each round
    while (sessions.some(s => !s.done) && isRunningRef.current) {
      const active = sessions.filter(s => !s.done);
      const batchResults = await Promise.allSettled(active.map(s =>
        fetch(`${API_BASE}/simulation/batch`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: s.sid, steps: CHUNK, input_changes: inputParams }),
        }).then(res => res.json()).then(r => ({ s, r }))
      ));

      for (const res of batchResults) {
        if (res.status === 'rejected') continue;
        const { s, r } = res.value;
        if (!r.success) { s.done = true; s.failed = true; continue; }
        const idx = s.planIdx;
        planData[idx].push(...(r.data.outputs || []));
        if (r.data.outputs_per_run?.length > 1) {
          const inc: any[][] = r.data.outputs_per_run;
          if (planRunsData[idx].length === 0) planRunsData[idx] = inc.map(() => []);
          inc.forEach((run: any[], ri: number) => planRunsData[idx][ri].push(...run));
        }
        if (r.data.completed) s.done = true;
      }

      // Update all curves simultaneously
      const totalSteps = sessions.reduce((sum, s) => sum + s.total, 0) || 1;
      const doneSteps = planData.reduce((sum, pd) => sum + pd.length, 0);
      set('progress', Math.round((doneSteps / totalSteps) * 100));
      setComparedPlans(prev => prev.map((r, i) => {
        const s = sessions.find(s => s.planIdx === i);
        return { ...r, data: [...planData[i]], runsData: planRunsData[i].map(rd => [...rd]), running: s ? !s.done : false };
      }));
    }

    set('status', 'completed');
    isRunningRef.current = false;
    const failed = sessions.filter(s => s.failed).length;
    if (failed === 0) message.success(`${currentPlans.length} 个方案仿真完成`);
    else message.warning(`完成，${failed} 个方案失败`);
  };

  // ── apply opt best solution to sim ───────────────────────────────────────────
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

  // ── export CSV ────────────────────────────────────────────────────────────────
  const exportSimCSV = () => {
    if (!simulationData.length) return;
    const keys = Object.keys(simulationData[0]);
    const rows = simulationData.map(row => keys.map(k => (row as any)[k]).join(','));
    const csv = [keys.join(','), ...rows].join('\n');
    const modelName = selectedModel?.content?.metadata?.name || 'sim';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${modelName}_${simStartDate}_${simEndDate}.csv`;
    a.click();
  };

  const downloadRawModel = () => {
    if (!selectedModel) return;
    const content = selectedModel.rawContent ?? selectedModel.content;
    const yaml = yamlDump(content, { lineWidth: 120, noRefs: true });
    const name = (selectedModel.content?.metadata?.name || selectedModel.title || 'model').replace(/\s+/g, '_');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([yaml], { type: 'text/yaml' }));
    a.download = `${name}.yaml`;
    a.click();
  };

  const pauseSimulation = () => { isRunningRef.current = false; set('status', 'paused'); };
  const resumeSimulation = () => { if (!sessionId) return; isRunningRef.current = true; set('status', 'running'); runBatch(sessionId); };
  const resetSimulation = () => {
    isRunningRef.current = false;
    set('status', 'idle'); set('progress', 0); set('currentStep', 0); setSimData([]);
    setState(prev => ({ ...prev, dataPerRun: [], sessionSeed: 0, sessionId: '' }));
  };

  // ── download model YAML with opt results embedded (server does NOT write to disk) ──
  const downloadModelYAML = async (flattenImports = false) => {
    if (!selectedModel?.key || !optResult) return;
    const modelKey = selectedModel.key.replace(/^models\//, '');

    // Build optimizer.results block from current optResult state
    const regVar: string = optResult.regimen_variable || '';
    const labels: string[] = optResult.regimen_event_labels || [];
    const bestRegimen: Record<string, Record<string, number>> = {};
    if (regVar && labels.length && optResult.best_x) {
      bestRegimen[regVar] = {};
      labels.forEach((lbl: string, i: number) => {
        if (optResult.best_x[i] != null) bestRegimen[regVar][lbl] = Number(optResult.best_x[i].toFixed(4));
      });
    }
    const bestObjectives: Record<string, number> = {};
    (optResult.objectives || []).forEach((o: any, i: number) => {
      if (optResult.best_f?.[i] != null) bestObjectives[o.variable] = Number(optResult.best_f[i].toFixed(4));
    });
    const results = {
      generated_at: new Date().toISOString().slice(0, 10),
      method: optResult.method || 'nsga2',
      n_solutions: optResult.n_solutions || 0,
      elapsed_seconds: Math.round(optElapsed * 10) / 10,
      pareto_front: optResult.pareto_front || [],
      reference: {
        x: optResult.best_x,
        f: optResult.best_f,
        ...(Object.keys(bestRegimen).length > 0 && { regimen: bestRegimen }),
        ...(Object.keys(bestObjectives).length > 0 && { objectives: bestObjectives }),
      },
    };

    try {
      const r = await fetch(`${API_BASE}/optimizer/export-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_key: modelKey, results, flatten_imports: flattenImports }),
      });
      const d = await r.json();
      if (!d.success || !d.text) return;
      const name = selectedModel.content?.metadata?.name || modelKey.split('/').pop()?.replace(/\.ya?ml$/i, '') || 'model';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([d.text], { type: 'text/yaml' }));
      a.download = `${name}.yaml`;
      a.click();
    } catch {}
  };

  // Save optimizer results back to the model file on disk (uses export-model YAML + file-raw write)
  const saveResultsToFile = async () => {
    if (!selectedModel?.key || !optResult) { message.warning('无结果可保存'); return; }
    const modelKey = selectedModel.key.replace(/^models\//, '');
    const regVar: string = optResult.regimen_variable || '';
    const labels: string[] = optResult.regimen_event_labels || [];
    const bestRegimen: Record<string, Record<string, number>> = {};
    if (regVar && labels.length && optResult.best_x) {
      bestRegimen[regVar] = {};
      labels.forEach((lbl: string, i: number) => {
        if (optResult.best_x[i] != null) bestRegimen[regVar][lbl] = Number(optResult.best_x[i].toFixed(4));
      });
    }
    const bestObjectives: Record<string, number> = {};
    (optResult.objectives || []).forEach((o: any, i: number) => {
      if (optResult.best_f?.[i] != null) bestObjectives[o.variable] = Number(optResult.best_f[i].toFixed(4));
    });
    const results = {
      generated_at: new Date().toISOString().slice(0, 10),
      method: optResult.method || 'nsga2',
      n_solutions: optResult.n_solutions || 0,
      elapsed_seconds: Math.round(optElapsed * 10) / 10,
      pareto_front: optResult.pareto_front || [],
      reference: {
        x: optResult.best_x, f: optResult.best_f,
        ...(Object.keys(bestRegimen).length > 0 && { regimen: bestRegimen }),
        ...(Object.keys(bestObjectives).length > 0 && { objectives: bestObjectives }),
      },
    };
    try {
      const exportResp = await fetch(`${API_BASE}/optimizer/export-model`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_key: modelKey, results }),
      }).then(r => r.json());
      if (!exportResp.success || !exportResp.text) { message.error('生成 YAML 失败'); return; }
      const saveResp = await fetch(`${API_BASE}/file-raw/${modelKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: exportResp.text }),
      }).then(r => r.json());
      if (saveResp.success) {
        message.success('结果已保存到模型文件');
        setStoredOptResult(optResult); // update stored so 继续计算 reflects new save
      } else {
        message.error('保存失败：' + (saveResp.detail || ''));
      }
    } catch (e: any) { message.error(e.message); }
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

  const startOptimization = async () => {
    if (!selectedModel) return;
    setCenterTab('optimization');
    if (optPollRef.current) { clearInterval(optPollRef.current); optPollRef.current = null; }

    if (optInputs.length === 0) {
      message.warning(t('sim.opt.no_inputs_warning'));
      return;
    }

    const modelKey = selectedModel.key || selectedModel.content?.metadata?.name || '';
    const totalGen = (selectedModel.content?.optimizer?.algorithm?.n_generations) || optGen;

    setOptRunning(true); setOptResult(null); setOptLogs([]); setOptCurGen(0);
    setOptHistory([]); setOptElapsed(0); setOptMethod('');
    setOptTotalGen(totalGen); setOptJobId(null);

    const _DAY_STRS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Build inputs array from optInputs (decision variables)
    const inputs = optInputs.map(oi => {
      const opt: Record<string, any> = { value: oi.valueBounds };
      if (oi.optimizeTime) opt.time = true;
      if (oi.optimizeDays) opt.days = true;
      if (oi.optimizeDateStart) opt.date_start = true;
      if (oi.optimizeDateEnd) opt.date_end = true;
      const inp: Record<string, any> = {
        variable: oi.variable,
        label: oi.label || `${oi.variable} ${oi.time}`,
        optimize: opt,
      };
      if (oi.optimizeTime && oi.timeWindow) {
        inp.time_window = oi.timeWindow;
        if (oi.optStep) inp.opt_step = oi.optStep;
      } else if (oi.timeEnabled) {
        inp.time = oi.time;
      }
      if (oi.optimizeDays && oi.daysOptions?.length) inp.days_options = oi.daysOptions;
      if (!oi.optimizeDays && oi.daysEnabled)
        inp.days = oi.days.map((v, i) => v ? _DAY_STRS[i] : null).filter(Boolean);
      if (oi.optimizeDateStart && oi.dateStartWindow) inp.date_start_window = oi.dateStartWindow;
      if (oi.optimizeDateEnd && oi.dateEndWindow) inp.date_end_window = oi.dateEndWindow;
      if (!oi.optimizeDateStart && oi.validRangeEnabled) {
        inp.valid_start = oi.validStart;
        inp.valid_end = oi.validEnd;
      }
      return inp;
    });

    // Build schedules array from optBackgrounds (fixed background)
    const schedules = optBackgrounds.map(bg => {
      const s: Record<string, any> = { variable: bg.variable, value: bg.value };
      if (bg.timeEnabled) s.time = bg.time;
      if (bg.daysEnabled) s.days = bg.days.map((v, i) => v ? _DAY_STRS[i] : null).filter(Boolean);
      if (bg.validRangeEnabled) { s.valid_start = bg.validStart; s.valid_end = bg.validEnd; }
      return s;
    });

    const optimizerOverride: Record<string, any> = {
      inputs,
      ...(schedules.length > 0 && { schedules }),
      objectives: objectives.map(o => ({
        variable: o.variable,
        metric: 'final',
        direction: o.direction,
      })),
      constraints: constraints.map(con => ({
        variable: con.variable,
        condition: `${con.op === '≤' ? '<=' : '>='} ${con.value}`,
      })),
      algorithm: {
        population_size: optPop,
        n_generations: optGen,
        seed: 42,
      },
      start_date: simStartDate,
      end_date: simEndDate,
      step_size: { value: stepValue, unit: stepUnit },
    };

    // F-5-3: use explicit warm/cold start choice
    if (warmStartEnabled) {
      const existingFront = selectedModel.content?.optimizer?.results?.pareto_front;
      if (Array.isArray(existingFront) && existingFront.length > 0) {
        optimizerOverride.warm_start = existingFront;
      }
    }

    try {
      const resp = await fetch(`${API_BASE}/optimizer/run_yaml`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: modelKey,
          folder: null,
          optimizer_override: optimizerOverride,
        }),
      });
      const data = await resp.json();

      if (!resp.ok || !data.success || !data.job_id) {
        message.error(data.detail || data.error || '优化启动失败');
        setOptRunning(false); return;
      }

      const jobId: string = data.job_id;
      setOptJobId(jobId);

      optPollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`${API_BASE}/optimizer/status/${jobId}`);
          if (!sr.ok) return;
          const sd = await sr.json();
          setOptLogs(sd.logs || []);
          setOptHistory(sd.history || []);
          setOptCurGen(sd.iteration || 0);
          setOptElapsed(sd.elapsed || 0);
          if (sd.method) setOptMethod(sd.method);

          if (sd.status === 'completed') {
            clearInterval(optPollRef.current!); optPollRef.current = null;
            setOptRunning(false);
            setOptResult(sd.result);
            setCenterTab('optimization');
            message.success(`优化完成，${sd.result?.n_solutions ?? 0} 个 Pareto 解`);
          } else if (sd.status === 'failed') {
            clearInterval(optPollRef.current!); optPollRef.current = null;
            setOptRunning(false);
            message.error(sd.error || '优化失败');
          } else if (sd.status === 'cancelled') {
            clearInterval(optPollRef.current!); optPollRef.current = null;
            setOptRunning(false);
          }
        } catch { /* ignore transient poll errors */ }
      }, 1500);

    } catch (e: any) {
      setOptRunning(false);
      message.error(e.message);
    }
  };

  const cancelOptimization = async () => {
    if (optPollRef.current) { clearInterval(optPollRef.current); optPollRef.current = null; }
    if (optJobId) {
      try { await fetch(`${API_BASE}/optimizer/job/${optJobId}`, { method: 'DELETE' }); } catch {}
    }
    setOptRunning(false);
  };

  // ── input event CRUD ──────────────────────────────────────────────────────────
  const stopAllJobs = () => {
    isRunningRef.current = false;
    if (optPollRef.current) { clearInterval(optPollRef.current); optPollRef.current = null; }
    if (optJobId) { fetch(`${API_BASE}/optimizer/job/${optJobId}`, { method: 'DELETE' }).catch(() => {}); }
    setOptRunning(false);
    setOptJobId(null);
  };

  const invalidateSim = () => {
    if (status !== 'idle') {
      stopAllJobs();
      setState(prev => ({ ...prev, status: 'idle', progress: 0, currentStep: 0, simulationData: [], dataPerRun: [], sessionId: '' }));
      setComparedPlans([]);
    }
    setWarmStartEnabled(false);
  };

  const addInputEvent = () => {
    const firstInputVar = inputVars[0];
    if (!firstInputVar) return;
    const id = `ev-${Date.now()}`;
    invalidateSim();
    setInputEvents(prev => [...prev, {
      id, variable: firstInputVar.name, time: '08:00', timeEnabled: false,
      value: firstInputVar.value ?? 0, label: '',
      daysEnabled: false, days: [true,true,true,true,true,true,true],
      validRangeEnabled: false, validStart: '', validEnd: '',
    }]);
  };

  const updateInputEvent = (id: string, patch: Partial<InputEvent>) => {
    invalidateSim();
    setInputEvents(prev => prev.map(ev => ev.id === id ? { ...ev, ...patch } : ev));
  };

  const removeInputEvent = (id: string) => {
    invalidateSim();
    setInputEvents(prev => prev.filter(ev => ev.id !== id));
  };

  // ── opt input CRUD ────────────────────────────────────────────────────────────
  const addOptInput = () => {
    const firstInputVar = inputVars[0];
    if (!firstInputVar) return;
    const id = `oi-${Date.now()}`;
    const lo = firstInputVar.bounds?.[0] ?? 0;
    const hi = firstInputVar.bounds?.[1] ?? (((firstInputVar.value ?? 1) * 2) || 1);
    setOptInputs(prev => [...prev, {
      id, variable: firstInputVar.name, label: '',
      valueBounds: [lo, hi], time: '08:00', timeEnabled: false,
      optimizeTime: false, daysEnabled: false, days: [true,true,true,true,true,true,true],
      optimizeDays: false, validRangeEnabled: false, validStart: '', validEnd: '',
      optimizeDateStart: false, optimizeDateEnd: false,
    }]);
  };
  const updateOptInput = (id: string, patch: Partial<OptInput>) => setOptInputs(prev => prev.map(oi => oi.id === id ? { ...oi, ...patch } : oi));
  const removeOptInput = (id: string) => setOptInputs(prev => prev.filter(oi => oi.id !== id));

  // ── opt background CRUD ───────────────────────────────────────────────────────
  const addOptBackground = () => {
    const firstInputVar = inputVars[0];
    if (!firstInputVar) return;
    const id = `obg-${Date.now()}`;
    setOptBackgrounds(prev => [...prev, {
      id, variable: firstInputVar.name, time: '08:00', timeEnabled: false,
      value: firstInputVar.value ?? 0, label: '',
      daysEnabled: false, days: [true,true,true,true,true,true,true],
      validRangeEnabled: false, validStart: '', validEnd: '',
    }]);
  };
  const updateOptBackground = (id: string, patch: Partial<InputEvent>) => setOptBackgrounds(prev => prev.map(bg => bg.id === id ? { ...bg, ...patch } : bg));
  const removeOptBackground = (id: string) => setOptBackgrounds(prev => prev.filter(bg => bg.id !== id));

  // ── import from sim → opt inputs ─────────────────────────────────────────────
  const importFromSim = () => {
    if (inputEvents.length === 0) { message.warning(t('sim.opt.import_from_sim_empty')); return; }
    const newOptInputs: OptInput[] = inputEvents.map(ev => {
      const varDef = inputVars.find(v => v.name === ev.variable);
      const lo = varDef?.bounds?.[0] ?? 0;
      const hi = varDef?.bounds?.[1] ?? ((ev.value * 2) || 1);
      return {
        id: `oi-${ev.id}`, variable: ev.variable, label: ev.label,
        valueBounds: [lo, hi] as [number, number],
        time: ev.time, timeEnabled: ev.timeEnabled,
        optimizeTime: false, daysEnabled: ev.daysEnabled, days: ev.days,
        optimizeDays: false, validRangeEnabled: ev.validRangeEnabled,
        validStart: ev.validStart, validEnd: ev.validEnd,
        optimizeDateStart: false, optimizeDateEnd: false,
      };
    });
    setOptInputs(newOptInputs);
    message.success(t('sim.opt.import_from_sim_done').replace('{n}', String(newOptInputs.length)));
  };

  // ── derived data ──────────────────────────────────────────────────────────────
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


  const SimControls = (
    <div style={{ width: '100%', flexShrink: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '6px 10px', borderBottom: `1px solid ${c.border}`, background: c.panel }}>
      <Tooltip title={!isLocked ? '请先在左侧选中模型并点击模型前方的锁图标完成锁定' : undefined}>
        <span>
          <Button
            type="primary" size="small"
            icon={status === 'running' ? <PauseOutlined /> : <PlayCircleOutlined />}
            onClick={status === 'running' ? pauseSimulation : status === 'paused' ? resumeSimulation : plans.length > 1 ? runAllPlans : startSimulation}
            disabled={!isLocked || status === 'completed'}
            style={{ whiteSpace: 'nowrap' }}
          >
            {status === 'running' ? t('sim.control.pause') : status === 'paused' ? t('sim.control.continue') : plans.length > 1 ? `${t('sim.plan.run_all_pre')} ${plans.length} ${t('sim.plan.run_all_suf')}` : t('sim.control.run')}
          </Button>
        </span>
      </Tooltip>
      <Button size="small" icon={<StepForwardOutlined />}
        onClick={runSingleStep}
        disabled={!isLocked || !sessionId || status === 'running' || status === 'completed'}
        style={{ whiteSpace: 'nowrap' }}
      >{t('sim.control.step')}</Button>
      <Button size="small" icon={<StopOutlined />}
        onClick={resetSimulation}
        disabled={status === 'idle'}
        style={{ whiteSpace: 'nowrap' }}
      >{t('sim.control.reset')}</Button>
      <div style={{ width: 1, height: 16, background: c.border }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ color: c.textSec, whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{t('sim.duration.label')}</span>
        <Input size="small" value={simStartDate} placeholder="YYYY-MM-DD"
          onChange={e => set('simStartDate', e.target.value)}
          style={{ width: '12ch', minWidth: '12ch', fontFamily: 'monospace' }} />
        <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>~</span>
        <Input size="small" value={simEndDate} placeholder="YYYY-MM-DD"
          onChange={e => set('simEndDate', e.target.value)}
          style={{ width: '12ch', minWidth: '12ch', fontFamily: 'monospace' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: c.textSec, whiteSpace: 'nowrap' }}>{t('sim.step.label')}</span>
        <InputNumber size="small" value={stepValue} onChange={v => set('stepValue', v || 1)} style={{ width: '7ch', minWidth: '7ch' }} min={1} />
        <Select size="small" value={stepUnit} onChange={v => set('stepUnit', v)} style={{ minWidth: '9ch', width: 'max-content' }}
          options={[{ label: t('sim.step.second'), value: 'second' }, { label: t('sim.step.minute'), value: 'minute' }, { label: t('sim.step.hour'), value: 'hour' }, { label: t('sim.step.day'), value: 'day' }]} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <Tooltip title={simRuns > 1 ? `Monte Carlo: ${simRuns} 条，seed ${sessionSeed || '-'}` : 'Monte Carlo 运行条数（1=单条）'}>
          <span style={{ color: c.textSec, whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>MC×</span>
        </Tooltip>
        <InputNumber
          size="small" min={1} max={50} value={simRuns}
          onChange={v => set('simRuns', Math.max(1, Math.min(50, v || 1)))}
          style={{ width: 52 }}
          disabled={status === 'running'}
        />
        <Tooltip title={t('sim.mc.seed_tooltip')}>
          <InputNumber
            size="small" value={mcSeed ?? undefined} placeholder="rand"
            onChange={v => set('mcSeed', v != null ? Math.max(0, Math.floor(v)) : null)}
            style={{ width: '7ch', minWidth: '7ch', fontFamily: 'monospace' }}
            min={0} max={2147483647} controls={false}
            disabled={status === 'running'}
          />
        </Tooltip>
      </div>
      <Tooltip title={t('sim.control.download_model')}>
        <Button size="small" icon={<DownloadOutlined />}
          onClick={downloadRawModel}
          disabled={!selectedModel}
          style={{ whiteSpace: 'nowrap', color: c.textSec }}
        >YAML</Button>
      </Tooltip>
    </div>
  );

  const existingResults = selectedModel?.rawContent?.optimizer?.results
    ?? selectedModel?.content?.optimizer?.results;
  const hasExistingResults = !!(existingResults?.pareto_front?.length);
  const OptControls = (
    <div style={{ width: '100%', flexShrink: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '6px 10px', borderBottom: `1px solid ${c.border}`, background: c.panel }}>
      <Tooltip title={!isLocked ? '请先在左侧选中模型并点击模型前方的锁图标完成锁定' : undefined}>
        <span>
          <Button
            type="primary" size="small"
            icon={optRunning ? <StopOutlined /> : <PlayCircleOutlined />}
            onClick={optRunning ? cancelOptimization : startOptimization}
            disabled={!isLocked}
            style={{ whiteSpace: 'nowrap' }}
          >
            {optRunning ? '停止优化' : t('sim.control.run')}
          </Button>
        </span>
      </Tooltip>
      {hasExistingResults && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
          <input type="checkbox" checked={warmStartEnabled}
            onChange={e => {
              const v = e.target.checked;
              setWarmStartEnabled(v);
              // Toggle display: checked = show stored results, unchecked = clear display
              if (!optRunning) setOptResult(v ? storedOptResult : null);
            }}
            style={{ accentColor: c.primary }} />
          <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', color: warmStartEnabled ? c.primary : c.textSec }}>
            继续计算
          </span>
        </label>
      )}
      <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>
        {optRunning ? `Gen ${optCurGen}/${optTotalGen || '-'}` : optResult ? '优化已完成，可继续查看或传输解' : hasExistingResults ? `历史 ${existingResults.n_solutions ?? existingResults.pareto_front.length} 解 · ${existingResults.generated_at ?? ''}` : '设置目标、约束和范围后运行优化'}
      </span>
      <div style={{ width: 1, height: 16, background: c.border, flexShrink: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ color: c.textSec, whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>{t('sim.duration.label')}</span>
        <Input size="small" value={simStartDate} placeholder="YYYY-MM-DD"
          onChange={e => set('simStartDate', e.target.value)}
          style={{ width: '12ch', minWidth: '12ch', fontFamily: 'monospace' }} />
        <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>~</span>
        <Input size="small" value={simEndDate} placeholder="YYYY-MM-DD"
          onChange={e => set('simEndDate', e.target.value)}
          style={{ width: '12ch', minWidth: '12ch', fontFamily: 'monospace' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: c.textSec, whiteSpace: 'nowrap' }}>{t('sim.step.label')}</span>
        <InputNumber size="small" value={stepValue} onChange={v => set('stepValue', v || 1)} style={{ width: '7ch', minWidth: '7ch' }} min={1} />
        <Select size="small" value={stepUnit} onChange={v => set('stepUnit', v)} style={{ minWidth: '9ch', width: 'max-content' }}
          options={[{ label: t('sim.step.second'), value: 'second' }, { label: t('sim.step.minute'), value: 'minute' }, { label: t('sim.step.hour'), value: 'hour' }, { label: t('sim.step.day'), value: 'day' }]} />
      </div>
      {selectedModel?.content?.optimizer?.mc?.enabled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Tooltip title={`Monte Carlo: ${simRuns} ${t('sim.mc.runs_per_plan')}`}>
            <span style={{ color: c.textSec, whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>MC×</span>
          </Tooltip>
          <InputNumber size="small" min={1} max={50} value={simRuns}
            onChange={v => set('simRuns', Math.max(1, Math.min(50, v || 1)))}
            style={{ width: 52 }} disabled={optRunning} />
          <Tooltip title={t('sim.mc.seed_tooltip')}>
            <InputNumber
              size="small" value={mcSeed ?? undefined} placeholder="rand"
              onChange={v => set('mcSeed', v != null ? Math.max(0, Math.floor(v)) : null)}
              style={{ width: '7ch', minWidth: '7ch', fontFamily: 'monospace' }}
              min={0} max={2147483647} controls={false}
              disabled={optRunning}
            />
          </Tooltip>
        </div>
      )}
      <Tooltip title={optResult ? t('sim.opt.download_with_results') : t('sim.control.download_model')}>
        <Button size="small" icon={<DownloadOutlined />}
          onClick={() => optResult ? downloadModelYAML(false) : downloadRawModel()}
          disabled={!selectedModel}
          style={{ whiteSpace: 'nowrap', color: c.textSec }}
        >YAML</Button>
      </Tooltip>
    </div>
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
          selectedKey={selectedKey} isLocked={isLocked} isSimulating={isSimulating}
          treeLoading={treeLoading}
          validationResult={validationResult} setValidationResult={setValidationResult}
          validating={validating}
          total={total}
          isDarkMode={isDarkMode} c={c} t={t}
          loadFileContent={loadFileContent}
          handleSelect={handleSelect}
          handleTreeNodeClick={handleTreeNodeClick}
          handleValidateAndLock={handleValidateAndLock}
          setIsLocked={setIsLocked}
          onUnlock={() => {
            stopAllJobs();
            setIsLocked(false);
            setValidationResult(null);
            setState(prev => ({ ...prev, status: 'idle', progress: 0, currentStep: 0, simulationData: [], dataPerRun: [], sessionSeed: 0, sessionId: '' }));
            setComparedPlans([]);
            setWarmStartEnabled(false);
          }}
          builderMode={builderOpen}
          builderCheckedFiles={builderCheckedFiles}
          onToggleBuilderFile={toggleBuilderFile}
          onOpenBuilder={openBuilder}
          onNewFile={() => setNewFileDialogOpen(true)}
          onMergeFiles={() => setMergeDialogOpen(true)}
          onImportFile={() => importFileRef.current?.click()}
          onBuilderUpload={() => builderUploadRef.current?.click()}
          scsMode={scsMode}
          sessionModels={sessionModels}
          onSelectSessionModel={model => {
            if (builderOpen) {
              // Builder is open: show model as edit card
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
                  onResetToYaml={selectedKey ? () => { delete modelSessionsRef.current[selectedKey]; loadFileContent(selectedKey, { preserveTab: true }); } : undefined}
                />
              }
              result={
                <SimPlotTab
                  simulationData={simulationData} dataPerRun={dataPerRun}
                  outputVars={outputVars} outputWarnings={outputWarnings}
                  inputVars={inputVars}
                  selectedModel={selectedModel}
                  selectedKey={selectedKey} isLocked={isLocked} mode="sim" status={status}
                  simStartDate={simStartDate} simEndDate={simEndDate}
                  stepValue={stepValue} stepUnit={stepUnit}
                  simRuns={simRuns} sessionSeed={sessionSeed}
                  isDarkMode={isDarkMode} c={c} t={t} fontSize={fontSize}
                  comparedPlans={comparedPlans}
                  onExportCSV={exportSimCSV}
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
                  optInputs={optInputs}
                  addOptInput={addOptInput}
                  updateOptInput={updateOptInput}
                  removeOptInput={removeOptInput}
                  optBackgrounds={optBackgrounds}
                  addOptBackground={addOptBackground}
                  updateOptBackground={updateOptBackground}
                  removeOptBackground={removeOptBackground}
                  inputVars={inputVars}
                  allVarNames={allVarNames}
                  openSections={openSections} setOpenSections={setOpenSections}
                  simStartDate={simStartDate} simEndDate={simEndDate}
                  objectives={objectives} setObjectives={setObjectives}
                  constraints={constraints} setConstraints={setConstraints}
                  optAlgo={optAlgo} setOptAlgo={setOptAlgo}
                  optPop={optPop} setOptPop={setOptPop}
                  optGen={optGen} setOptGen={setOptGen}
                  onImportFromSim={importFromSim}
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

function WorkspacePage({ controls, setup, result, progress }: {
  controls: React.ReactNode; setup: React.ReactNode; result: React.ReactNode; progress: React.ReactNode;
}) {
  return (
    <div style={{ flex: 1, width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {controls}
      <div style={{ flex: 1, width: '100%', minHeight: 0, display: 'flex', overflow: 'hidden', gap: 8, padding: '6px 10px' }}>
        <div style={{ flex: '0 0 40%', minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {setup}
        </div>
        <div style={{ flex: '0 0 60%', minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {result}
        </div>
      </div>
      {progress}
    </div>
  );
}

function ProgressStrip({ label, percent, detail, active, c, isDarkMode }: { label: string; percent: number; detail: string; active: boolean; c: ReturnType<typeof getC>; isDarkMode: boolean }) {
  return (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderTop: `1px solid ${c.border}`, background: c.panel }}>
      <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', fontWeight: 700, textTransform: 'uppercase', minWidth: 82 }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: isDarkMode ? '#2a2a2a' : '#e0e0e0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, percent))}%`, height: '100%', background: active ? c.primary : c.textMute, transition: 'width 0.3s', borderRadius: 3 }} />
      </div>
      <span style={{ color: c.textMute, fontFamily: 'monospace', whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>{detail}</span>
    </div>
  );
}

export default Simulator;
