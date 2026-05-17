// sim_gui/src/components/Simulator.tsx
// State, effects, and business logic. UI split into sub-components.

import React, { useState, useEffect, useRef } from 'react';
import { Button, Input, InputNumber, message, Modal, Select, Tooltip } from 'antd';
import { BuildOutlined, CloseOutlined, DownloadOutlined, PauseOutlined, PlayCircleOutlined, StepForwardOutlined, StopOutlined } from '@ant-design/icons';
import type { SimulatorProps, SimulationDataPoint, SimulationState, StepUnit, DataNode, ModelFile, InputEvent, PlanResult, SimPlan } from '../types';

const PLAN_COLORS = ['#e53935', '#1e88e5', '#ff7043', '#7b1fa2', '#0097a7', '#558b2f'];

// Converts a Pareto solution x-vector to inputEvents using optimizer.inputs/regimen structure.
// Ordering matches the Python backend: variables in Object.entries order, events in list order.
function xToInputEvents(x: number[], optimizerConfig: any, baseEvents: InputEvent[]): InputEvent[] {
  const mapping: Array<{ variable: string; time: string }> = [];
  if (optimizerConfig?.inputs) {
    for (const [varName, conf] of Object.entries(optimizerConfig.inputs as Record<string, any>)) {
      for (const ev of ((conf as any).events || [])) mapping.push({ variable: varName, time: ev.time });
    }
  } else if (optimizerConfig?.regimen) {
    const varName = optimizerConfig.regimen.variable || '';
    for (const ev of (optimizerConfig.regimen.events || [])) mapping.push({ variable: varName, time: ev.time });
  }
  const result = baseEvents.map(ev => ({ ...ev }));
  mapping.forEach(({ variable, time }, i) => {
    if (i >= x.length) return;
    const idx = result.findIndex(ev => ev.variable === variable && ev.time === time && ev.optimizeValue);
    if (idx >= 0) result[idx] = { ...result[idx], value: x[i] };
  });
  return result;
}
import ModelBuilder from './ModelBuilder';
import { validateModelFile } from '../core/validate';
import { useI18n } from '../core/i18n';
import { getC } from '../core/theme';
import SimModelTree from './SimModelTree';
import SimSetupTab from './SimSetupTab';
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
  const SECTION_H = 26;

  const {
    status, progress, currentStep, totalSteps, simulationData, dataPerRun,
    inputParams, stateVariables, sessionId,
    simStartDate, simEndDate, stepValue, stepUnit, batchSize, updateInterval,
    simRuns, sessionSeed,
  } = state;

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

  const toggleBuilderFile = (key: string) => {
    setBuilderCheckedFiles(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleMerge = async () => {
    setMerging(true);
    try {
      const r = await fetch('/api/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: builderCheckedFiles, output_path: mergeOutPath }),
      });
      const d = await r.json();
      if (d.success || d.message) {
        message.success('合并成功');
        setMergeDialogOpen(false);
        loadFileTree();
      } else {
        message.error('合并失败: ' + (d.detail || d.error || ''));
      }
    } catch (e: any) { message.error(String(e)); }
    finally { setMerging(false); }
  };

  const handleCreateFile = async () => {
    if (!newFilePath.trim()) { message.warning('请填写文件路径'); return; }
    let path = newFilePath.trim();
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
            optimizeValue: !(opt?.valueLocked ?? true),
            valueBounds: [opt?.valueMin ?? 0, opt?.valueMax ?? 1],
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
    id: 'plan-1', label: '方案 1', color: PLAN_COLORS[0], inputEvents: [],
  }]);
  const [activePlanId, setActivePlanId] = useState('plan-1');

  const isRunningRef = useRef(false);
  const pendingRestoreKey = useRef<string | null>(readSP()?.selectedKey || null);
  const isInitialMount = useRef(true);
  const savedKeyForRestore = readSP()?.selectedKey || null;

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
    let freshInputInit = false;
    if (selectedModel?.content?.variables) {
      const inputs: Record<string, number> = {};
      const states: Record<string, number> = {};
      const newInputEvents: InputEvent[] = [];
      const rawSchedules = selectedModel.content?.simulation?.schedules;

      const DAY_STR_MAP: Record<string, number> = { mon:0, tue:1, wed:2, thu:3, fri:4, sat:5, sun:6 };
      const parseDaysMask = (days?: string[]): boolean[] => {
        if (!days?.length) return [true,true,true,true,true,true,true];
        const m = [false,false,false,false,false,false,false];
        days.forEach(d => { const i = DAY_STR_MAP[d.toLowerCase().slice(0,3)]; if (i !== undefined) m[i] = true; });
        return m;
      };

      const schedList: any[] = Array.isArray(rawSchedules) ? rawSchedules : [];
      const schedDict: Record<string, any> = (!Array.isArray(rawSchedules) && rawSchedules) ? rawSchedules : {};

      const varBounds = (data: any): [number, number] => [
        (data.bounds as any)?.[0] ?? 0,
        (data.bounds as any)?.[1] ?? (((data.value ?? 0) * 2) || 1),
      ];

      Object.entries(selectedModel.content.variables).forEach(([name, data]: [string, any]) => {
        if (data.type === 'input') {
          inputs[name] = data.value;
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
                id: `${name}-sched${i}`,
                variable: name,
                time: s.time ?? '08:00',
                timeEnabled: !!s.time,
                value: s.value ?? data.value ?? 0,
                label: s.label ?? '',
                daysEnabled: hasDays,
                days: hasDays ? parseDaysMask(daysList) : [true,true,true,true,true,true,true],
                validRangeEnabled: !!(validStart || validEnd),
                validStart,
                validEnd,
                optimizeValue: false,
                valueBounds: varBounds(data),
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
                id: `${name}-ev${idx}`,
                variable: name, time: t2, timeEnabled: true,
                value: pt.value ?? 0, label: '',
                daysEnabled: false, days: [true,true,true,true,true,true,true],
                validRangeEnabled: false, validStart: '', validEnd: '',
                optimizeValue: false, valueBounds: varBounds(data),
              });
            });
          } else {
            newInputEvents.push({
              id: `${name}-ev0`,
              variable: name, time: '08:00', timeEnabled: false,
              value: data.value ?? 0, label: '',
              daysEnabled: false, days: [true,true,true,true,true,true,true],
              validRangeEnabled: false, validStart: '', validEnd: '',
              optimizeValue: false, valueBounds: varBounds(data),
            });
          }
        } else if (data.type === 'state') states[name] = data.value;
      });
      set('inputParams', inputs);
      set('stateVariables', states);
      const restoreFromSaved = isInitialMount.current &&
        selectedModel.key === savedKeyForRestore &&
        (readSP()?.inputEvents?.length ?? 0) > 0;
      isInitialMount.current = false;

      if (restoreFromSaved) {
        // Keep saved inputEvents
      } else {
        setInputEvents(newInputEvents);
        // Reset to single plan on new model load
        setPlans([{ id: 'plan-1', label: '方案 1', color: PLAN_COLORS[0], inputEvents: newInputEvents }]);
        setActivePlanId('plan-1');
        freshInputInit = true;
      }
      const ranges: typeof optRanges = {};
      Object.entries(inputs).forEach(([name, val]) => {
        ranges[name] = { min: 0, max: (val as number) * 2 || 1, locked: true };
      });
      setOptRanges(ranges);
    }
    const sim = selectedModel?.content?.simulation ?? selectedModel?.content?.simulator;
    const DEFAULT_START = '2026-01-01';
    const DEFAULT_END   = '2026-12-31';
    const toStepUnit = (u: string): StepUnit => {
      if (u === 'day') return 'day';
      if (u === 'hour') return 'hour';
      if (u === 'minute') return 'minute';
      if (u === 'second') return 'second';
      return 'day';
    };
    if (sim) {
      if (sim.start_date && sim.end_date) {
        set('simStartDate', String(sim.start_date));
        set('simEndDate',   String(sim.end_date));
        const metaStep = selectedModel?.content?.metadata?.step_size;
        if (metaStep?.unit) {
          set('stepValue', metaStep.value ?? 1);
          set('stepUnit',  toStepUnit(String(metaStep.unit)));
        } else {
          set('stepValue', sim.step ?? 1);
          set('stepUnit',  toStepUnit(String(sim.step_unit || 'minute')));
        }
      } else {
        const UNIT_SEC: Record<string, number> = {
          second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000,
        };
        const timeUnit  = String(sim.time_unit || 'hour').toLowerCase();
        const rawStep   = sim.step_size ?? 1;
        const totalSec  = (sim.total_time ?? 365) * rawStep * (UNIT_SEC[timeUnit] ?? 3600);
        set('stepValue', rawStep);
        set('stepUnit', toStepUnit(timeUnit));
        set('simStartDate', DEFAULT_START);
        set('simEndDate', totalSecondsToEndDate(DEFAULT_START, totalSec));
      }
    } else {
      set('stepValue', 1);
      set('stepUnit', 'hour');
      set('simStartDate', DEFAULT_START);
      set('simEndDate', DEFAULT_END);
    }

    const optBlock: any = selectedModel?.content?.optimizer;
    if (optBlock && optBlock.enabled !== false) {
      const parseDir = (d: string): 'minimize' | 'maximize' =>
        d === 'maximize' ? 'maximize' : 'minimize';

      const rawObjs: Array<{ variable: string; direction: 'minimize' | 'maximize' }> = [];
      if (optBlock.objective) {
        rawObjs.push({ variable: optBlock.objective.variable || '', direction: parseDir(optBlock.objective.direction || 'minimize') });
      }
      if (Array.isArray(optBlock.objectives)) {
        optBlock.objectives.forEach((o: any) => {
          rawObjs.push({ variable: o.variable || '', direction: parseDir(o.direction || 'minimize') });
        });
      }
      if (rawObjs.length > 0) setObjectives(rawObjs);

      const parseCondition = (cond: string): { op: '≤' | '≥'; value: number } | null => {
        const m = cond.trim().match(/^([<>]=?)\s*(-?\d+(?:\.\d+)?)/);
        if (!m) return null;
        return { op: m[1] === '>=' || m[1] === '>' ? '≥' : '≤', value: parseFloat(m[2]) };
      };
      if (Array.isArray(optBlock.constraints)) {
        const parsedCons: Array<{ variable: string; op: '≤' | '≥'; value: number }> = [];
        optBlock.constraints.forEach((con: any) => {
          const parsed = parseCondition(String(con.condition || ''));
          if (parsed && con.variable) parsedCons.push({ variable: con.variable, ...parsed });
        });
        if (parsedCons.length > 0) setConstraints(parsedCons);
      }

      const methodMap: Record<string, string> = {
        'nsga2': 'NSGA-II', 'nsga-2': 'NSGA-II', 'nsga_2': 'NSGA-II',
        'moead': 'MOEA/D', 'moea/d': 'MOEA/D',
        'l-bfgs-b': 'l-bfgs-b', 'lbfgsb': 'l-bfgs-b',
        'nelder-mead': 'nelder-mead', 'nelder_mead': 'nelder-mead',
      };
      const rawMethod = String(optBlock.method || '').toLowerCase();
      const mappedMethod = methodMap[rawMethod];
      if (mappedMethod) setOptAlgo(mappedMethod as any);

      const algoBlock = optBlock.algorithm || {};
      if (algoBlock.population_size) setOptPop(Number(algoBlock.population_size));
      if (algoBlock.n_generations)   setOptGen(Number(algoBlock.n_generations));

      if (optBlock.mc?.enabled && optBlock.mc?.sim_runs) {
        set('simRuns', Math.max(1, Math.min(50, Number(optBlock.mc.sim_runs))));
      }

      // Reset warm-start preference on new model load; default to warm if results exist
      setWarmStartEnabled(!!(optBlock.results?.pareto_front?.length));

      if (Array.isArray(optBlock.inputs)) {
        const withOpt = (optBlock.inputs as any[]).filter((e: any) =>
          e.variable && Array.isArray(e.optimize?.value) && e.optimize.value.length >= 2
        );
        if (withOpt.length > 0) {
          setInputEvents(prev => prev.map(ev => {
            const inp = withOpt.find((e: any) => e.variable === ev.variable);
            if (!inp) return ev;
            return {
              ...ev,
              time: inp.time ?? ev.time,
              timeEnabled: inp.time ? true : ev.timeEnabled,
              label: inp.label ?? ev.label,
              optimizeValue: true,
              valueBounds: [inp.optimize.value[0], inp.optimize.value[1]],
            };
          }));
        }
      } else if (optBlock.regimen?.variable && Array.isArray(optBlock.regimen?.events)) {
        const regVar: string = optBlock.regimen.variable;
        const regEvs: any[] = optBlock.regimen.events;
        setInputEvents(prev => prev.map(ev => {
          if (ev.variable !== regVar) return ev;
          const regEv = regEvs.find((e: any) => e.time === ev.time) ?? regEvs[0];
          if (!regEv?.dose_bounds) return ev;
          return {
            ...ev,
            time: regEv.time ?? ev.time,
            timeEnabled: regEv.time ? true : ev.timeEnabled,
            label: regEv.label ?? ev.label,
            optimizeValue: true,
            valueBounds: [regEv.dose_bounds[0], regEv.dose_bounds[1]],
          };
        }));
      }
    }
    // Pre-load stored opt results so Pareto chart is visible immediately when model has results
    const rawResults = optBlock?.results;
    if (rawResults?.pareto_front?.length > 0) {
      const labels: string[] = [];
      if (optBlock.inputs) {
        for (const conf of Object.values(optBlock.inputs as Record<string, any>))
          for (const ev of ((conf as any).events || [])) labels.push(ev.label || ev.time || '');
      } else if (optBlock.regimen?.events) {
        for (const ev of optBlock.regimen.events) labels.push(ev.label || ev.time || '');
      }
      // Build objectives from optBlock directly (rawObjs is scoped inside the optBlock if block)
      const parseDir2 = (d: string) => d === 'maximize' ? 'maximize' : 'minimize' as const;
      const preloadObjs: Array<{variable: string; direction: 'minimize' | 'maximize'}> = [];
      if (optBlock.objective) preloadObjs.push({ variable: optBlock.objective.variable || '', direction: parseDir2(optBlock.objective.direction || '') });
      if (Array.isArray(optBlock.objectives)) optBlock.objectives.forEach((o: any) => preloadObjs.push({ variable: o.variable || '', direction: parseDir2(o.direction || '') }));
      const preloaded = {
        pareto_front: rawResults.pareto_front,
        best_x: rawResults.best?.x ?? [],
        best_f: rawResults.best?.f ?? [],
        objectives: preloadObjs,
        n_solutions: rawResults.n_solutions ?? rawResults.pareto_front.length,
        method: rawResults.method ?? 'nsga2',
        regimen_event_labels: labels.length > 0 ? labels : undefined,
      };
      setStoredOptResult(preloaded);
      setOptResult(preloaded); // always show on load; checkbox toggle can clear it
    } else {
      setStoredOptResult(null);
      setOptResult(null);
    }

    // F-5-2: offer to pre-fill inputEvents from optimizer.results.best.x
    if (freshInputInit && optBlock?.results?.best?.x?.length > 0) {
      const bestX: number[] = optBlock.results.best.x;
      Modal.confirm({
        title: '检测到优化结果',
        content: `模型包含推荐解（${bestX.length} 个决策变量），是否将其预填为当前输入方案？`,
        okText: '加载推荐解',
        cancelText: '使用默认调度',
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

  useEffect(() => {
    const key = pendingRestoreKey.current;
    if (!key || storyTree.length === 0) return;
    pendingRestoreKey.current = null;
    loadFileContent(key, { preserveTab: true });
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
      ...(saved.simStartDate && saved.simStartDate !== '2000-01-01' && { simStartDate: saved.simStartDate }),
      ...(saved.simEndDate && saved.simEndDate !== '2001-01-01' && { simEndDate: saved.simEndDate }),
      ...(saved.stepValue != null && { stepValue: saved.stepValue }),
      ...(saved.stepUnit && { stepUnit: saved.stepUnit }),
    }));
    if (saved.isLocked) setIsLocked(true);
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

  // ── reset validation on selection change ─────────────────────────────────────
  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return; }
    setValidationResult(null);
    setIsLocked(false);
  }, [selectedKey]);

  // ── persist config to localStorage ───────────────────────────────────────────
  useEffect(() => {
    const current = readSP() || {};
    writeSP({ ...current, selectedKey, mode, inputEvents, isLocked, openSections: [...openSections], sectionWeights, simStartDate, simEndDate, stepValue, stepUnit, expandedKeys });
  }, [selectedKey, mode, inputEvents, isLocked, openSections, sectionWeights, simStartDate, simEndDate, stepValue, stepUnit, expandedKeys]);

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
        const resolved = await fetch(`${API_BASE}/models/${encodeURIComponent(modelName)}${qs}`).then(r => r.json());
        if (resolved?.success && resolved.data) resolvedContent = { ...content, ...resolved.data };
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
    loadFileContent(key);
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
          body: JSON.stringify({ model_name: modelName, folder: selectedModel.folder, time_hours: timeHours, step_size: stepSizeSec, input_params: inputParams, regimens, sim_runs: simRuns }),
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
      id, label: `方案 ${plans.length + 1}`,
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
    const bestX = optimizer?.results?.best?.x;
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

  const pauseSimulation = () => { isRunningRef.current = false; set('status', 'paused'); };
  const resumeSimulation = () => { if (!sessionId) return; isRunningRef.current = true; set('status', 'running'); runBatch(sessionId); };
  const resetSimulation = () => {
    isRunningRef.current = false;
    set('status', 'idle'); set('progress', 0); set('currentStep', 0); setSimData([]);
    setState(prev => ({ ...prev, dataPerRun: [], sessionSeed: 0, sessionId: '' }));
  };

  // ── download model YAML with opt results embedded (server does NOT write to disk) ──
  const downloadModelYAML = async () => {
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
      best: {
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
        body: JSON.stringify({ model_key: modelKey, results }),
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
      best: {
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

  const startOptimization = async () => {
    if (!selectedModel) return;
    setCenterTab('optimization');
    if (optPollRef.current) { clearInterval(optPollRef.current); optPollRef.current = null; }

    const optimizeEvents = inputEvents.filter(ev => ev.optimizeValue);
    if (optimizeEvents.length === 0) {
      message.warning('请先勾选至少一个优化变量（☑ 优化）');
      return;
    }

    const modelKey = selectedModel.key || selectedModel.content?.metadata?.name || '';
    const totalGen = (selectedModel.content?.optimizer?.algorithm?.n_generations) || optGen;

    setOptRunning(true); setOptResult(null); setOptLogs([]); setOptCurGen(0);
    setOptHistory([]); setOptElapsed(0); setOptMethod('');
    setOptTotalGen(totalGen); setOptJobId(null);

    const firstVar = optimizeEvents[0].variable;
    const varEvents = optimizeEvents.filter(ev => ev.variable === firstVar);

    const optimizerOverride: Record<string, any> = {
      regimen: {
        variable: firstVar,
        events: varEvents.map(ev => ({
          time: ev.time,
          dose_bounds: ev.valueBounds,
          label: ev.label || `${ev.variable} ${ev.time}`,
          days_enabled: ev.daysEnabled,
          days: ev.days,
          valid_range_enabled: ev.validRangeEnabled,
          valid_start: ev.validStart,
          valid_end: ev.validEnd,
        })),
      },
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
  const addInputEvent = () => {
    const firstInputVar = inputVars[0];
    if (!firstInputVar) return;
    const id = `ev-${Date.now()}`;
    setInputEvents(prev => [...prev, {
      id, variable: firstInputVar.name, time: '08:00', timeEnabled: false,
      value: firstInputVar.value ?? 0, label: '',
      daysEnabled: false, days: [true,true,true,true,true,true,true],
      validRangeEnabled: false, validStart: '', validEnd: '',
      optimizeValue: false, valueBounds: [0, ((firstInputVar.value ?? 1) * 2) || 1],
    }]);
  };

  const updateInputEvent = (id: string, patch: Partial<InputEvent>) =>
    setInputEvents(prev => prev.map(ev => ev.id === id ? { ...ev, ...patch } : ev));

  const removeInputEvent = (id: string) =>
    setInputEvents(prev => prev.filter(ev => ev.id !== id));

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
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '6px 10px', borderBottom: `1px solid ${c.border}`, background: c.panel }}>
      <Button
        type="primary" size="small"
        icon={status === 'running' ? <PauseOutlined /> : <PlayCircleOutlined />}
        onClick={status === 'running' ? pauseSimulation : status === 'paused' ? resumeSimulation : plans.length > 1 ? runAllPlans : startSimulation}
        disabled={!isLocked || status === 'completed'}
        style={{ whiteSpace: 'nowrap' }}
      >
        {status === 'running' ? t('sim.control.pause') : status === 'paused' ? t('sim.control.continue') : plans.length > 1 ? `运行全部 ${plans.length} 方案` : t('sim.control.run')}
      </Button>
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
      <Tooltip title={simRuns > 1 ? `Monte Carlo: ${simRuns} 条，seed ${sessionSeed || '-'}` : 'Monte Carlo 运行条数（1=单条）'}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ color: c.textSec, whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>MC×</span>
          <InputNumber
            size="small" min={1} max={50} value={simRuns}
            onChange={v => set('simRuns', Math.max(1, Math.min(50, v || 1)))}
            style={{ width: 52 }}
            disabled={status === 'running'}
          />
        </div>
      </Tooltip>
      <Tooltip title="导出仿真结果为 CSV">
        <Button size="small" icon={<DownloadOutlined />}
          onClick={exportSimCSV}
          disabled={!simulationData.length}
          style={{ whiteSpace: 'nowrap', color: c.textSec }}
        >CSV</Button>
      </Tooltip>
    </div>
  );

  const existingResults = selectedModel?.content?.optimizer?.results;
  const hasExistingResults = !!(existingResults?.pareto_front?.length);
  const OptControls = (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '6px 10px', borderBottom: `1px solid ${c.border}`, background: c.panel }}>
      <Button
        type="primary" size="small"
        icon={optRunning ? <StopOutlined /> : <PlayCircleOutlined />}
        onClick={optRunning ? cancelOptimization : startOptimization}
        disabled={!isLocked}
        style={{ whiteSpace: 'nowrap' }}
      >
        {optRunning ? '停止优化' : t('sim.control.run')}
      </Button>
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
    </div>
  );


  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        <SimModelTree
          width={leftW} SECTION_H={SECTION_H}
          storyTree={storyTree} storyFilter={storyFilter} setStoryFilter={setStoryFilter}
          storyViewMode={storyViewMode} setStoryViewMode={setStoryViewMode}
          expandedKeys={expandedKeys} setExpandedKeys={setExpandedKeys}
          selectedKey={selectedKey} isLocked={isLocked}
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
            setIsLocked(false);
            setValidationResult(null);
            isRunningRef.current = false;
            set('status', 'idle');
            set('progress', 0);
            set('currentStep', 0);
            setSimData([]);
            setState(prev => ({ ...prev, dataPerRun: [], sessionSeed: 0, sessionId: '' }));
          }}
          builderMode={builderOpen}
          builderCheckedFiles={builderCheckedFiles}
          onToggleBuilderFile={toggleBuilderFile}
          onOpenBuilder={openBuilder}
          onNewFile={() => setNewFileDialogOpen(true)}
          onMergeFiles={() => setMergeDialogOpen(true)}
        />

        <div
          onMouseDown={startLeftDrag}
          style={{ width: 4, flexShrink: 0, cursor: 'col-resize', background: 'transparent', transition: 'background 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = `${c.primary}55`; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        />

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Center tab bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderBottom: `1px solid ${c.border}`, background: c.panel, flexShrink: 0, paddingLeft: 8 }}>
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
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
                  mode="sim"
                  selectedModel={selectedModel}
                  openSections={openSections} setOpenSections={setOpenSections}
                  sectionWeights={sectionWeights} setSectionWeights={setSectionWeights}
                  SECTION_H={SECTION_H}
                  objectives={objectives} setObjectives={setObjectives}
                  constraints={constraints} setConstraints={setConstraints}
                  optAlgo={optAlgo} setOptAlgo={setOptAlgo}
                  optPop={optPop} setOptPop={setOptPop}
                  optGen={optGen} setOptGen={setOptGen}
                  allVarNames={allVarNames}
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
                  selectedKey={selectedKey} isLocked={isLocked} mode="sim" status={status}
                  simStartDate={simStartDate} simEndDate={simEndDate}
                  stepValue={stepValue} stepUnit={stepUnit}
                  simRuns={simRuns} sessionSeed={sessionSeed}
                  isDarkMode={isDarkMode} c={c} t={t} fontSize={fontSize}
                  comparedPlans={comparedPlans}
                />
              }
              progress={<ProgressStrip label="Simulation" percent={progress} detail={`step ${currentStep}/${totalSteps || '-'} · ${status}`} active={status === 'running'} c={c} isDarkMode={isDarkMode} />}
            />
          )}

          {centerTab === 'optimization' && (
            <WorkspacePage
              controls={OptControls}
              setup={
                <SimSetupTab
                  inputEvents={inputEvents}
                  addInputEvent={addInputEvent}
                  updateInputEvent={updateInputEvent}
                  removeInputEvent={removeInputEvent}
                  inputVars={inputVars}
                  mode="opt"
                  selectedModel={selectedModel}
                  openSections={openSections} setOpenSections={setOpenSections}
                  sectionWeights={sectionWeights} setSectionWeights={setSectionWeights}
                  SECTION_H={SECTION_H}
                  objectives={objectives} setObjectives={setObjectives}
                  constraints={constraints} setConstraints={setConstraints}
                  optAlgo={optAlgo} setOptAlgo={setOptAlgo}
                  optPop={optPop} setOptPop={setOptPop}
                  optGen={optGen} setOptGen={setOptGen}
                  allVarNames={allVarNames}
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
                  onSaveResults={saveResultsToFile}
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
              <ModelBuilder
                isDarkMode={isDarkMode} c={c}
                embedded
                controlledFiles={builderCheckedFiles}
                onReloadTree={loadFileTree}
                onUncheckedFile={key => setBuilderCheckedFiles(prev => prev.filter(k => k !== key))}
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
          选中的 {builderCheckedFiles.length} 个文件将合并为一个 YAML 文件：
          {builderCheckedFiles.map(f => (
            <div key={f} style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 2, color: c.textMute }}>• {f}</div>
          ))}
        </div>
        <div style={{ marginBottom: 4, color: c.textSec, fontSize: 12 }}>输出路径（相对 models/）：</div>
        <Input
          value={mergeOutPath}
          onChange={e => setMergeOutPath(e.target.value)}
          placeholder="models/scenarios/merged.yaml"
          style={{ fontFamily: 'monospace' }}
        />
      </Modal>

      {/* ── New file dialog ── */}
      <Modal
        open={newFileDialogOpen}
        title="新建模型文件"
        okText="创建"
        cancelText="取消"
        confirmLoading={creatingFile}
        onOk={handleCreateFile}
        onCancel={() => { setNewFileDialogOpen(false); setNewFilePath(''); }}
      >
        <div style={{ marginBottom: 4, color: c.textSec, fontSize: 12 }}>文件路径（相对 models/）：</div>
        <Input
          value={newFilePath}
          onChange={e => setNewFilePath(e.target.value)}
          placeholder="models/temp/my_model.yaml"
          style={{ fontFamily: 'monospace' }}
          onPressEnter={handleCreateFile}
        />
      </Modal>

    </div>
  );
};

function WorkspacePage({ controls, setup, result, progress }: { controls: React.ReactNode; setup: React.ReactNode; result: React.ReactNode; progress: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {controls}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden', gap: 8, padding: '6px 8px' }}>
        <div style={{ width: '34%', minWidth: 260, maxWidth: 440, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {setup}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
