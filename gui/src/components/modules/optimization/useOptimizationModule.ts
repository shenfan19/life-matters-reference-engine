// gui/src/components/modules/optimization/useOptimizationModule.ts
// The optimization view's state and logic (ADR 0163): what is asked of the optimizer (objectives, constraints,
// algorithm, the events whose values and times are searched), the run and its result, and what is kept for it per
// model. It reads the core, which holds the dates and steps a run shares with the simulation. Where it needs the
// plans of the simulation it asks the simulation module, and only from its view.

import { useState, useEffect } from 'react';
import { Modal } from 'antd';
import type { InputEvent, SimPlan } from '../../../types';
import type { Core } from '../../Simulator/useCore';
import { useSessionSlice } from '../../views/moduleHooks';
import { PLAN_COLORS, migrateInputEvents, xToInputEvents } from '../../sim_tab/simUtils';
import { buildOptInputEventsFromYAML, buildOptRegimens } from '../../sim_tab/optUtils';
import { useOptimizer } from '../../opt_tab/useOptimizer';
import { resolveSimWindow, toStepUnit } from '../simulation/yamlDefaults';
import type { SimulationModule } from '../simulation/useSimulationModule';

type Objective = { variable: string; direction: 'minimize' | 'maximize' };
type Constraint = { variable: string; op: '≤' | '≥'; value: number };
type OptAlgo = 'NSGA-II' | 'MOEA/D' | 'l-bfgs-b' | 'nelder-mead';

const blankEvent = (firstInputVar: { name: string; value?: number }, id: string): InputEvent => ({
  id, variable: firstInputVar.name, timeStart: '08:00', timeEnd: '08:00',
  value: 0, label: '',
  daysEnabled: false, days: [true, true, true, true, true, true, true],
  validRangeEnabled: false, validStart: '', validEnd: '',
});

export function useOptimizationModule(core: Core) {
  const {
    t, selectedModel, selectedKey, state, set, inputVars, session, runtime, autoSaveLocal, scsMode, setCenterTab,
  } = core;
  const { simStartDate, simEndDate, optStepValue, optStepUnit, optMcRuns, optMcSeed } = state;

  // ── what is asked of the optimizer ───────────────────────────────────────────
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [optAlgo, setOptAlgo] = useState<OptAlgo>('NSGA-II');
  const [optPop, setOptPop] = useState(50);
  const [optGen, setOptGen] = useState(80);
  const [optSeed, setOptSeed] = useState(42);
  const [optInputEvents, setOptInputEvents] = useState<InputEvent[]>([]);
  // Pareto regroup chart axis and group selection: a view preference per model, not an edit of the model
  const [regroupXKey, setRegroupXKey] = useState('');
  const [regroupYKey, setRegroupYKey] = useState('');
  const [regroupGroupKey, setRegroupGroupKey] = useState('');

  // Setters that also mark the session as edited by the user
  const edited = <T,>(setter: (v: T) => void) => (v: T) => { session.markEdited(); setter(v); };
  const setObjectivesEdited = edited(setObjectives);
  const setConstraintsEdited = edited(setConstraints);
  const setOptAlgoEdited = edited(setOptAlgo);
  const setOptPopEdited = edited(setOptPop);
  const setOptGenEdited = edited(setOptGen);

  // ── the run ──────────────────────────────────────────────────────────────────
  const {
    optRunning, optResult, setOptResult,
    storedOptResult, setStoredOptResult,
    warmStartEnabled, setWarmStartEnabled, warmStartDirty,
    optCurGen, optTotalGen, optLogs, optHistory, optElapsed, optMethod,
    startOptimization, cancelOptimization, stopOptJobs,
    downloadModelYAML, exportOptCSV, importParetoFromCSV,
  } = useOptimizer({
    selectedModel, selectedKey,
    inputEvents: optInputEvents, inputVars,
    objectives, constraints,
    optAlgo, optPop, optGen, optSeed,
    simStartDate, simEndDate, stepValue: optStepValue, stepUnit: optStepUnit,
    optMcRuns, optMcSeed,
    modelSessionsRef: session.modelSessionsRef,
    setRunningModelKey: runtime.setRunningModelKey,
    setCenterTab,
    autoSaveLocal: autoSaveLocal && !scsMode,
    t,
  });
  useEffect(() => { runtime.onStop('optimization', stopOptJobs); });

  // ── editing the events ───────────────────────────────────────────────────────
  const addOptInputEvent = () => {
    const first = inputVars[0];
    if (!first) return;
    session.markEdited();
    setOptInputEvents(prev => [...prev, blankEvent(first, `opt-ev-${Date.now()}`)]);
  };
  const removeOptInputEvent = (id: string) => {
    session.markEdited();
    setOptInputEvents(prev => prev.filter(ev => ev.id !== id));
  };
  const updateOptInputEvent = (id: string, patch: Partial<InputEvent>) => {
    session.markEdited();
    setOptInputEvents(prev => prev.map(ev => ev.id === id ? { ...ev, ...patch } : ev));
  };

  // Solutions of the optimization become plans of the simulation. The simulation module is asked only now, when
  // the user sends them, not while this module runs.
  const sendToSim = (rows: Array<{ x: number[]; f: number[]; rank: number }>) => {
    const sim = core.modules.simulation as SimulationModule | undefined;
    if (!sim || rows.length === 0) return;
    // Decode x with the optimizer setup as it is in the GUI (optInputEvents), not the YAML block: the user may have
    // edited the start point.
    const regimens = buildOptRegimens(optInputEvents, new Set(inputVars.map(v => v.name)));
    const virtualOptimizer = { startpoint: { regimens } };
    const newPlans: SimPlan[] = rows.map((row, i) => ({
      id: `pareto-${row.rank}-${Date.now()}-${i}`,
      label: `Pareto #${row.rank}`,
      color: PLAN_COLORS[(sim.plans.length + i) % PLAN_COLORS.length],
      // strip the opt flags so the events are plain simulation events
      inputEvents: xToInputEvents(row.x, virtualOptimizer, optInputEvents).map(ev => ({
        ...ev, optimizeValue: false, optimizeTime: false, optimizeDays: false, optimizeDateRange: false,
      })),
    }));
    sim.addPlans(newPlans);
  };

  // ── per-model session: restore it, or take the starting point from the file ──
  useSessionSlice(core, 'optimization', {
    init: (saved) => {
      const model = selectedModel!;
      const sim = model.content?.simulation;
      const optBlock: any = model.content?.optimization;
      const clampRuns = (n: unknown) => Math.max(1, Math.min(50, Number(n)));

      // The results the file carries are shown in the Pareto chart whatever the session says.
      const rawResults = optBlock?.results ?? model.rawContent?.optimization?.results;
      let yamlOptResult: any = null;
      if (rawResults?.pareto_front?.length > 0) {
        const labels: string[] = [];
        if (optBlock.inputs) {
          for (const conf of Object.values(optBlock.inputs as Record<string, any>))
            for (const ev of ((conf as any).events || [])) labels.push(ev.label || ev.time_start || ev.time || '');
        } else if (optBlock.regimen?.events) {
          for (const ev of optBlock.regimen.events) labels.push(ev.label || ev.time_start || ev.time || '');
        }
        const parseDir = (d: string) => d === 'maximize' ? 'maximize' : 'minimize' as const;
        const preloadObjs: Objective[] = [];
        if (optBlock.objective) preloadObjs.push({ variable: optBlock.objective.variable || '', direction: parseDir(optBlock.objective.direction || '') });
        if (Array.isArray(optBlock.objectives)) optBlock.objectives.forEach((o: any) => preloadObjs.push({ variable: o.variable || '', direction: parseDir(o.direction || '') }));
        yamlOptResult = {
          pareto_front: rawResults.pareto_front,
          best_x: rawResults.recommended?.x ?? [],
          best_f: rawResults.recommended?.f ?? [],
          objectives: preloadObjs,
          n_solutions: rawResults.n_solutions ?? rawResults.pareto_front.length,
          method: rawResults.method ?? 'nsga2',
          regimen_event_labels: labels.length > 0 ? labels : undefined,
        };
        setStoredOptResult(yamlOptResult);
      } else {
        setStoredOptResult(null);
      }

      if (saved) {
        setOptInputEvents(
          Array.isArray(saved.optInputEvents) && saved.optInputEvents.length > 0
            ? migrateInputEvents(saved.optInputEvents)
            : Array.isArray(optBlock?.startpoint?.regimens)
              ? buildOptInputEventsFromYAML(optBlock.startpoint.regimens)
              : []
        );
        set('optStepValue', saved.optStepValue ?? saved.stepValue);
        set('optStepUnit', saved.optStepUnit ?? saved.stepUnit);
        setObjectives(saved.objectives);
        setConstraints(saved.constraints);
        setOptAlgo(saved.optAlgo as OptAlgo);
        setOptPop(saved.optPop);
        setOptGen(saved.optGen);
        setOptSeed(saved.optSeed ?? 42);
        setOptResult(saved.optResult ?? yamlOptResult ?? null);
        setWarmStartEnabled(!!(yamlOptResult?.pareto_front?.length) || !!(saved.optResult?.pareto_front?.length));
        setRegroupXKey(saved.regroupXKey ?? '');
        setRegroupYKey(saved.regroupYKey ?? '');
        setRegroupGroupKey(saved.regroupGroupKey ?? '');
        set('optMcRuns', saved.optMcRuns ?? (optBlock?.mc?.runs != null ? clampRuns(optBlock.mc.runs) : 1));
        set('optMcSeed', 'optMcSeed' in saved ? saved.optMcSeed : (optBlock?.mc?.seed != null ? Number(optBlock.mc.seed) : null));
        return;
      }

      // First visit: the step defaults to the simulation's, an optimization block may set its own.
      const w = resolveSimWindow(sim);
      const optStepSize = optBlock?.step_size;
      if (optStepSize?.unit) {
        set('optStepValue', optStepSize.value ?? 1);
        set('optStepUnit', toStepUnit(String(optStepSize.unit)));
      } else {
        set('optStepValue', w.stepValue);
        set('optStepUnit', w.stepUnit);
      }
      // optimization.mc is the inner loop of a robust optimization (samples per candidate), independent of
      // simulation.mc (trajectories shown in the simulation view): reset whether or not a block exists, so the
      // value of the model before does not leak.
      set('optMcSeed', optBlock?.mc?.seed != null ? Number(optBlock.mc.seed) : null);

      if (optBlock && optBlock.enabled !== false) {
        const parseDir = (d: string): 'minimize' | 'maximize' => d === 'maximize' ? 'maximize' : 'minimize';
        const rawObjs: Objective[] = [];
        if (optBlock.objective) rawObjs.push({ variable: optBlock.objective.variable || '', direction: parseDir(optBlock.objective.direction || 'minimize') });
        if (Array.isArray(optBlock.objectives)) optBlock.objectives.forEach((o: any) => rawObjs.push({ variable: o.variable || '', direction: parseDir(o.direction || 'minimize') }));
        setObjectives(rawObjs);

        const parseCondition = (cond: string): { op: '≤' | '≥'; value: number } | null => {
          const m = cond.trim().match(/^([<>]=?)\s*(-?\d+(?:\.\d+)?)/);
          if (!m) return null;
          return { op: m[1] === '>=' || m[1] === '>' ? '≥' : '≤', value: parseFloat(m[2]) };
        };
        const parsedCons: Constraint[] = [];
        if (Array.isArray(optBlock.constraints)) {
          optBlock.constraints.forEach((con: any) => {
            const p = parseCondition(String(con.condition || ''));
            if (p && con.variable) parsedCons.push({ variable: con.variable, ...p });
          });
        }
        setConstraints(parsedCons);
        const methodMap: Record<string, string> = { 'nsga2': 'NSGA-II', 'nsga-2': 'NSGA-II', 'nsga_2': 'NSGA-II', 'moead': 'MOEA/D', 'moea/d': 'MOEA/D', 'l-bfgs-b': 'l-bfgs-b', 'lbfgsb': 'l-bfgs-b', 'nelder-mead': 'nelder-mead', 'nelder_mead': 'nelder-mead' };
        const mappedMethod = methodMap[String(optBlock.method || '').toLowerCase()];
        if (mappedMethod) setOptAlgo(mappedMethod as OptAlgo);
        const algoBlock = optBlock.algorithm || {};
        if (algoBlock.population_size) setOptPop(Number(algoBlock.population_size));
        if (algoBlock.n_generations) setOptGen(Number(algoBlock.n_generations));
        setOptSeed(algoBlock.seed != null ? Number(algoBlock.seed) : 42);
        set('optMcRuns', optBlock.mc?.runs != null ? clampRuns(optBlock.mc.runs) : 1);
        setOptInputEvents(
          Array.isArray(optBlock.startpoint?.regimens)
            ? buildOptInputEventsFromYAML(optBlock.startpoint.regimens)
            : []
        );
      } else {
        setObjectives([]);
        setConstraints([]);
        setOptInputEvents([]);
        set('optMcRuns', 1);
      }

      setWarmStartEnabled(!!(yamlOptResult?.pareto_front?.length));
      setOptResult(yamlOptResult);
      setRegroupXKey('');
      setRegroupYKey('');
      setRegroupGroupKey('');

      // Warm-start dialog: only on the first visit (no session existed)
      if (rawResults?.recommended?.x?.length > 0) {
        const bestX: number[] = rawResults.recommended.x;
        Modal.confirm({
          title: t('sim.opt.ref_detected_title'),
          content: t('sim.opt.ref_detected_content', { n: bestX.length }),
          okText: t('sim.opt.load_reference'), cancelText: t('sim.opt.use_default_schedule'),
          onOk: () => setOptInputEvents(prev => xToInputEvents(bestX, optBlock ?? model.rawContent?.optimization, prev)),
        });
      }
    },
    slice: () => ({
      optInputEvents, optStepValue, optStepUnit, optMcRuns, optMcSeed,
      objectives, constraints, optAlgo, optPop, optGen, optSeed, optResult,
      regroupXKey, regroupYKey, regroupGroupKey,
    }),
    deps: [optInputEvents, optStepValue, optStepUnit, optMcRuns, optMcSeed, objectives, constraints,
      optAlgo, optPop, optGen, optSeed, optResult, regroupXKey, regroupYKey, regroupGroupKey],
  });

  // ── derived ──────────────────────────────────────────────────────────────────
  const existingResults = selectedModel?.rawContent?.optimization?.results
    ?? selectedModel?.content?.optimization?.results;
  const hasExistingResults = !!(existingResults?.pareto_front?.length) || !!(optResult?.pareto_front?.length);
  const currentFront = optResult?.pareto_front ?? existingResults?.pareto_front;

  return {
    // what is asked
    objectives, constraints, optAlgo, optPop, optGen, optSeed,
    setObjectivesEdited, setConstraintsEdited, setOptAlgoEdited, setOptPopEdited, setOptGenEdited,
    optInputEvents, setOptInputEvents, addOptInputEvent, removeOptInputEvent, updateOptInputEvent,
    regroupXKey, regroupYKey, regroupGroupKey, setRegroupXKey, setRegroupYKey, setRegroupGroupKey,
    // the run
    optRunning, optResult, setOptResult, storedOptResult, warmStartEnabled, setWarmStartEnabled, warmStartDirty,
    optCurGen, optTotalGen, optLogs, optHistory, optElapsed, optMethod,
    startOptimization, cancelOptimization, downloadModelYAML, exportOptCSV, importParetoFromCSV, sendToSim,
    // derived
    existingResults, hasExistingResults, currentFront,
  };
}

export type OptimizationModule = ReturnType<typeof useOptimizationModule>;
export const optimizationOf = (core: Core) => core.modules.optimization as OptimizationModule;
