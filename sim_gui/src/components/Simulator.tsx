// sim_gui/src/components/Simulator.tsx
// State, effects, and business logic. UI split into sub-components.

import React, { useState, useEffect, useRef } from 'react';
import { Button, Input, InputNumber, message, Select, Tooltip } from 'antd';
import { HistoryOutlined, PauseOutlined, PlayCircleOutlined, StepForwardOutlined, StopOutlined } from '@ant-design/icons';
import type { SimulatorProps, SimulationDataPoint, SimulationState, StepUnit, DataNode, ModelFile, InputEvent, RunRecord } from '../types';
import { validateModelFile } from '../core/validate';
import { useI18n } from '../core/i18n';
import { getC } from '../core/theme';
import SimModelTree from './SimModelTree';
import SimSetupTab from './SimSetupTab';
import SimIntroTab from './SimIntroTab';
import SimPlotTab from './SimPlotTab';
import SimOptTab from './SimOptTab';
import SimReportTab from './SimReportTab';
import SimRunHistory from './SimRunHistory';

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

type CenterTab = 'intro' | 'simulation' | 'optimization' | 'report';

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
  const lastOptimizerOverrideRef = useRef<any>(null);  // saved when opt starts, for history save

  // ── run history panel ─────────────────────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState(false);
  const [simSaved, setSimSaved] = useState(false);   // 显示"已保存"标记
  const [optSaved, setOptSaved] = useState(false);

  const switchCenterTab = (tab: string) => {
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
                title: item.title, titleStr: item.title, model_type: 'story',
              };
            }
          }
          const isModel = item.key?.startsWith('models/');
          return {
            title: item.type === 'file' ? titleStr : item.title,
            key: item.key,
            icon: undefined,
            isLeaf: item.type === 'file',
            children: item.children ? convert(item.children) : undefined,
            titleStr, model_type: item.model_type,
          };
        });
        const modelsNode = result.data.find((n: any) => n.key === 'models');
        if (modelsNode?.children) {
          const combined: DataNode[] = modelsNode.children
            .flatMap((child: any) => {
              const items = convert(child.children || []);
              if (!items.length) return [];
              return [{
                key: `__group_${child.key}`,
                title: child.key.toUpperCase(),
                isLeaf: false, selectable: false, icon: undefined, children: items,
              } as DataNode];
            });
          setStoryTree(combined);
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
      const isComponent = selectedModel?.content?.metadata?.standalone === false;
      if (isComponent) {
        message.warning(t('sim.msg.validation_ok') + ' — ' + t('sim.msg.component_model_hint'));
      } else {
        message.success(t('sim.msg.validation_ok'));
      }
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
            // 自动存档：读取最终 state 并保存
            setState(prev => {
              saveSimRun(prev.simulationData, prev.dataPerRun, runOutputVars);
              return prev;
            });
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

  const pauseSimulation = () => { isRunningRef.current = false; set('status', 'paused'); };
  const resumeSimulation = () => { if (!sessionId) return; isRunningRef.current = true; set('status', 'running'); runBatch(sessionId); };
  const resetSimulation = () => {
    isRunningRef.current = false;
    set('status', 'idle'); set('progress', 0); set('currentStep', 0); setSimData([]);
    setState(prev => ({ ...prev, dataPerRun: [], sessionSeed: 0, sessionId: '' }));
  };

  // ── run history: save & load ───────────────────────────────────────────────────

  const saveSimRun = async (finalData: SimulationDataPoint[], finalPerRun: SimulationDataPoint[][], finalOutputVars: string[]) => {
    if (!selectedModel) return;
    const modelName = selectedModel.content?.metadata?.name || selectedModel.key.split('/').pop()?.replace(/\.ya?ml$/i, '') || 'unknown';
    try {
      await fetch(`${API_BASE}/runs/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'sim',
          model_name: modelName,
          model_key: selectedModel.key,
          status: 'completed',
          sim_config: {
            start_date: simStartDate,
            end_date: simEndDate,
            step_value: stepValue,
            step_unit: stepUnit,
            sim_runs: simRuns,
            session_seed: sessionSeed,
            input_events: inputEvents,
          },
          sim_result: {
            data: finalData,
            data_per_run: finalPerRun,
            output_vars: finalOutputVars,
          },
          sim_result_summary: {
            n_points: finalData.length,
            n_runs: simRuns,
            output_vars: finalOutputVars,
          },
        }),
      });
      setSimSaved(true);
      setTimeout(() => setSimSaved(false), 4000);
    } catch {
      // 静默失败，不打断用户体验
    }
  };

  const saveOptRun = async (result: any, elapsed: number) => {
    if (!selectedModel) return;
    const modelName = selectedModel.content?.metadata?.name || selectedModel.key.split('/').pop()?.replace(/\.ya?ml$/i, '') || 'unknown';
    try {
      await fetch(`${API_BASE}/runs/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'opt',
          model_name: modelName,
          model_key: selectedModel.key,
          status: 'completed',
          opt_config: {
            input_events: inputEvents,
            objectives,
            constraints,
            optimizer_override: lastOptimizerOverrideRef.current,
          },
          opt_result: result,
          opt_result_summary: {
            n_solutions: result?.n_solutions ?? 0,
            method: result?.method ?? '',
            elapsed,
          },
        }),
      });
      setOptSaved(true);
      setTimeout(() => setOptSaved(false), 4000);
    } catch {
      // 静默失败
    }
  };

  const loadHistoryRun = (run: RunRecord) => {
    if (run.type === 'sim' && run.sim_result) {
      const r = run.sim_result;
      const cfg = run.sim_config;
      setState(prev => ({
        ...prev,
        simulationData: r.data || [],
        dataPerRun: r.data_per_run || [],
        status: 'completed',
        progress: 100,
        currentStep: r.data.length,
        totalSteps: r.data.length,
        sessionId: '',
        ...(cfg?.start_date && { simStartDate: cfg.start_date }),
        ...(cfg?.end_date   && { simEndDate:   cfg.end_date   }),
        ...(cfg?.step_value  != null && { stepValue: cfg.step_value }),
        ...(cfg?.step_unit   && { stepUnit:  cfg.step_unit  }),
        ...(cfg?.sim_runs    != null && { simRuns: cfg.sim_runs }),
        ...(cfg?.session_seed != null && { sessionSeed: cfg.session_seed }),
      }));
      if (r.output_vars?.length) setRunOutputVars(r.output_vars);
      setCenterTab('simulation');
      message.success(`已加载仿真历史：${run.model_name}`);
    } else if (run.type === 'opt' && run.opt_result) {
      setOptResult(run.opt_result);
      setOptHistory([]);
      setOptLogs([]);
      setOptCurGen(0);
      setOptTotalGen(0);
      setOptElapsed(run.opt_result_summary?.elapsed ?? 0);
      setOptMethod(run.opt_result?.method ?? '');
      setOptRunning(false);
      if (run.opt_config?.objectives?.length) setObjectives(run.opt_config.objectives);
      if (run.opt_config?.constraints?.length) setConstraints(run.opt_config.constraints);
      if (run.opt_config?.input_events?.length) setInputEvents(run.opt_config.input_events);
      setCenterTab('optimization');
      message.success(`已加载优化历史：${run.model_name}`);
    }
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
    lastOptimizerOverrideRef.current = null;  // reset, will be set below

    const firstVar = optimizeEvents[0].variable;
    const varEvents = optimizeEvents.filter(ev => ev.variable === firstVar);

    const optimizerOverride: any = {
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

    lastOptimizerOverrideRef.current = optimizerOverride;

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
            saveOptRun(sd.result, sd.elapsed ?? 0);
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

  const ProgressStrip = ({ label, percent, detail, active }: { label: string; percent: number; detail: string; active: boolean }) => (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderTop: `1px solid ${c.border}`, background: c.panel }}>
      <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', fontWeight: 700, textTransform: 'uppercase', minWidth: 82 }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: isDarkMode ? '#2a2a2a' : '#e0e0e0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, percent))}%`, height: '100%', background: active ? c.primary : c.textMute, transition: 'width 0.3s', borderRadius: 3 }} />
      </div>
      <span style={{ color: c.textMute, fontFamily: 'monospace', whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>{detail}</span>
    </div>
  );

  const SimControls = (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '6px 10px', borderBottom: `1px solid ${c.border}`, background: c.panel }}>
      <Button
        type="primary" size="small"
        icon={status === 'running' ? <PauseOutlined /> : <PlayCircleOutlined />}
        onClick={status === 'running' ? pauseSimulation : status === 'paused' ? resumeSimulation : startSimulation}
        disabled={!isLocked || status === 'completed'}
        style={{ whiteSpace: 'nowrap' }}
      >
        {status === 'running' ? t('sim.control.pause') : status === 'paused' ? t('sim.control.continue') : t('sim.control.run')}
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
      <div style={{ flex: 1 }} />
      {simSaved && (
        <span style={{ color: c.primary, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', whiteSpace: 'nowrap' }}>
          ✓ 已保存
        </span>
      )}
      <Button
        size="small" icon={<HistoryOutlined />}
        onClick={() => setHistoryOpen(true)}
        style={{ whiteSpace: 'nowrap', color: c.textSec }}
      >
        历史记录
      </Button>
    </div>
  );

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
      <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)' }}>
        {optRunning ? `Gen ${optCurGen}/${optTotalGen || '-'}` : optResult ? '优化已完成，可继续查看或传输解' : '设置目标、约束和范围后运行优化'}
      </span>
      <div style={{ flex: 1 }} />
      {optSaved && (
        <span style={{ color: c.primary, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', whiteSpace: 'nowrap' }}>
          ✓ 已保存
        </span>
      )}
      <Button
        size="small" icon={<HistoryOutlined />}
        onClick={() => setHistoryOpen(true)}
        style={{ whiteSpace: 'nowrap', color: c.textSec }}
      >
        历史记录
      </Button>
    </div>
  );

  const WorkspacePage = ({ controls, setup, result, progress }: { controls: React.ReactNode; setup: React.ReactNode; result: React.ReactNode; progress: React.ReactNode }) => (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {controls}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: '34%', minWidth: 260, maxWidth: 440, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: `1px solid ${c.border}` }}>
          {setup}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {result}
        </div>
      </div>
      {progress}
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
              { key: 'intro',  label: 'Overview' },
              { key: 'simulation', label: 'simulation' },
              { key: 'optimization', label: 'optimization' },
              { key: 'report', label: t('sim.tab.report')  || '报告' },
            ] as { key: CenterTab; label: string }[]).map(tab => {
              const isActive = centerTab === tab.key;
              const color = isActive ? c.primary : c.textMute;
              const underline = isActive ? `2px solid ${c.primary}` : '2px solid transparent';
              return (
                <button key={tab.key} onClick={() => { setCenterTab(tab.key); if (tab.key === 'simulation') setMode('sim'); if (tab.key === 'optimization') setMode('opt'); }} style={{ padding: '6px 16px', border: 'none', cursor: 'pointer', background: 'transparent', color, fontWeight: isActive ? 600 : 400, borderBottom: underline, marginBottom: -1, outline: 'none', transition: 'all 0.12s' }}>
                  {tab.label}
                </button>
              );
            })}
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
                />
              }
              progress={<ProgressStrip label="Simulation" percent={progress} detail={`step ${currentStep}/${totalSteps || '-'} · ${status}`} active={status === 'running'} />}
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
                  setInputEvents={setInputEvents}
                  setMode={setMode}
                  setCenterTab={switchCenterTab}
                />
              }
              progress={<ProgressStrip label="Optimization" percent={optTotalGen ? (optCurGen / optTotalGen) * 100 : (optResult ? 100 : 0)} detail={`gen ${optCurGen}/${optTotalGen || '-'} · ${optRunning ? 'running' : optResult ? 'completed' : 'idle'}`} active={optRunning} />}
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

        </div>
      </div>

      <SimRunHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        isDarkMode={isDarkMode}
        onLoadRun={loadHistoryRun}
      />
    </div>
  );
};

export default Simulator;
