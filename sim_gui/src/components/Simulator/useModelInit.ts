// useModelInit.ts — derive all UI state from a newly-selected model
//
// Owns: nothing (pure effect orchestration; mutates state via setters passed in)
// Receives: selectedModel + the full set of state setters whose initial values
//   depend on it (sim dates/step, opt config, plans, input events, opt result),
//   plus modelSessionsRef (session restore takes priority over YAML defaults)
// Returns: nothing — this hook is two effects, not a value
//
// This is the single largest piece of Simulator's logic: given a model that was
// just loaded, decide whether a saved session exists (restore it verbatim) or
// derive everything from the YAML's `variables`/`simulation`/`optimizer` blocks
// (first-ever load of this model in this browser).

import { useEffect } from 'react';
import { Modal } from 'antd';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { InputEvent, ModelFile, ModelSession, SimPlan, SimulationState, StepUnit } from '../../types';
import { PLAN_COLORS, normalizeTimeInterval, migrateInputEvents, xToInputEvents } from '../sim_tab/simUtils';
import { buildOptInputEventsFromYAML, parseDaysMask } from '../sim_tab/optUtils';

type OptRanges = Record<string, { min: number; max: number; locked: boolean }>;
type OptAlgo = 'NSGA-II' | 'MOEA/D' | 'l-bfgs-b' | 'nelder-mead';

interface UseModelInitParams {
  selectedModel: ModelFile | null;
  inputEvents: InputEvent[];
  set: <K extends keyof SimulationState>(key: K, val: SimulationState[K]) => void;
  setOptRanges: Dispatch<SetStateAction<OptRanges>>;
  setStoredOptResult: (result: any) => void;
  setOptResult: (result: any) => void;
  setWarmStartEnabled: (enabled: boolean) => void;
  modelSessionsRef: MutableRefObject<Record<string, ModelSession>>;
  setInputEvents: Dispatch<SetStateAction<InputEvent[]>>;
  setOptInputEvents: Dispatch<SetStateAction<InputEvent[]>>;
  setPlans: Dispatch<SetStateAction<SimPlan[]>>;
  setActivePlanId: (id: string) => void;
  setObjectives: Dispatch<SetStateAction<Array<{ variable: string; direction: 'minimize' | 'maximize' }>>>;
  setConstraints: Dispatch<SetStateAction<Array<{ variable: string; op: '≤' | '≥'; value: number }>>>;
  setOptAlgo: (algo: OptAlgo) => void;
  setOptPop: (n: number) => void;
  setOptGen: (n: number) => void;
  setOptSeed: (n: number) => void;
  sessionEditedRef: MutableRefObject<boolean>;
  sessionReadyRef: MutableRefObject<boolean>;
  setRunOutputVars: Dispatch<SetStateAction<string[]>>;
  setOutputWarnings: Dispatch<SetStateAction<string[]>>;
  setSimLogs: Dispatch<SetStateAction<Array<{ t: number; msg: string }>>>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const totalSecondsToEndDate = (startDate: string, totalSec: number): string => {
  const d = new Date(startDate + 'T00:00:00');
  d.setSeconds(d.getSeconds() + Math.round(totalSec));
  return d.toISOString().slice(0, 10);
};

export function useModelInit({
  selectedModel, inputEvents, set, setOptRanges, setStoredOptResult, setOptResult, setWarmStartEnabled,
  modelSessionsRef, setInputEvents, setOptInputEvents, setPlans, setActivePlanId,
  setObjectives, setConstraints, setOptAlgo, setOptPop, setOptGen, setOptSeed,
  sessionEditedRef, sessionReadyRef, setRunOutputVars, setOutputWarnings, setSimLogs, t,
}: UseModelInitParams) {
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
    const ranges: OptRanges = {};
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
          for (const ev of ((conf as any).events || [])) labels.push(ev.label || ev.time_start || ev.time || '');
      } else if (optBlock.regimen?.events) {
        for (const ev of optBlock.regimen.events) labels.push(ev.label || ev.time_start || ev.time || '');
      }
      const parseDir2 = (d: string) => d === 'maximize' ? 'maximize' : 'minimize' as const;
      const preloadObjs: Array<{variable: string; direction: 'minimize' | 'maximize'}> = [];
      if (optBlock.objective) preloadObjs.push({ variable: optBlock.objective.variable || '', direction: parseDir2(optBlock.objective.direction || '') });
      if (Array.isArray(optBlock.objectives)) optBlock.objectives.forEach((o: any) => preloadObjs.push({ variable: o.variable || '', direction: parseDir2(o.direction || '') }));
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

    // Needed in both session and no-session branches
    const sim = selectedModel?.content?.simulation ?? selectedModel?.content?.simulator;

    // ── 3. Session exists → restore user state, skip YAML defaults ──
    const session = modelSessionsRef.current[selectedModel.key];
    if (session) {
      setInputEvents(migrateInputEvents(session.inputEvents));
      setOptInputEvents(
        Array.isArray(session.optInputEvents) && session.optInputEvents.length > 0
          ? migrateInputEvents(session.optInputEvents)
          : Array.isArray(optBlock?.startpoint?.regimens)
            ? buildOptInputEventsFromYAML(optBlock.startpoint.regimens)
            : []
      );
      setPlans(session.plans.map(p => ({ ...p, inputEvents: migrateInputEvents(p.inputEvents) })));
      setActivePlanId(session.activePlanId);
      set('simStartDate', session.simStartDate);
      set('simEndDate', session.simEndDate);
      set('stepValue', session.stepValue);
      set('stepUnit', session.stepUnit);
      set('optStepValue', session.optStepValue ?? session.stepValue);
      set('optStepUnit', session.optStepUnit ?? session.stepUnit);
      setObjectives(session.objectives);
      setConstraints(session.constraints);
      setOptAlgo(session.optAlgo as any);
      setOptPop(session.optPop);
      setOptGen(session.optGen);
      setOptSeed(session.optSeed ?? 42);
      setOptResult(session.optResult ?? yamlOptResult ?? null);
      setWarmStartEnabled(!!(yamlOptResult?.pareto_front?.length) || !!(session.optResult?.pareto_front?.length));
      set('simRuns', session.simRuns ?? (sim?.mc?.runs != null ? Math.max(1, Math.min(50, Number(sim.mc.runs))) : 1));
      set('mcSeed', 'mcSeed' in session ? session.mcSeed : (sim?.mc?.seed != null ? Number(sim.mc.seed) : null));
      sessionEditedRef.current = !!(session as any).userEdited;
      sessionReadyRef.current = true;
      return;
    }

    // ── 4. No session: initialize from YAML (first-ever load of this model) ──
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
          const { timeStart, timeEnd } = normalizeTimeInterval(s);
          newInputEvents.push({
            id: `${name}-sched${i}`, variable: name,
            timeStart, timeEnd,
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
            id: `${name}-ev${idx}`, variable: name, timeStart: t2, timeEnd: t2,
            value: pt.value ?? 0, label: '',
            daysEnabled: false, days: [true,true,true,true,true,true,true],
            validRangeEnabled: false, validStart: '', validEnd: '',
          });
        });
      } else {
        newInputEvents.push({
          id: `${name}-ev0`, variable: name, timeStart: '08:00', timeEnd: '08:00',
          value: data.value ?? 0, label: '',
          daysEnabled: false, days: [true,true,true,true,true,true,true],
          validRangeEnabled: false, validStart: '', validEnd: '',
        });
      }
    });

    // Plan id/label come from the raw YAML (display metadata only); the actual
    // schedule semantics (days/date-range/pulse-vs-sustained) come from
    // `selectedModel.content.plans`, which the backend already parsed via
    // ModelStructure._parse_schedule_entries() — the same code path the CLI
    // uses. The frontend must not re-derive that semantics independently, or
    // GUI and CLI runs of the same YAML can silently diverge.
    const backendPlans: Record<string, any[]> = selectedModel.content?.plans ?? {};
    const yamlPlans: any[] = selectedModel.content?.simulation?.plans ?? [];
    if (yamlPlans.length > 0) {
      const loadedPlans: SimPlan[] = yamlPlans.map((plan: any, i: number) => {
        const schedules: any[] = backendPlans[plan.id ?? `plan_${i}`] ?? [];
        const planEvents: InputEvent[] = [];
        Object.entries(selectedModel.content.variables).forEach(([name, vdata]: [string, any]) => {
          if (vdata.type !== 'input') return;
          const varSchedules = schedules.filter((r: any) => r.variable === name);
          if (varSchedules.length > 0) {
            let j = 0;
            varSchedules.forEach((r: any) => {
              (r.events ?? []).forEach((ev: any) => {
                const dl: string[] = Array.isArray(ev.days) ? ev.days : [];
                planEvents.push({
                  id: `${plan.id ?? `plan${i}`}-${name}-${j++}`, variable: name,
                  timeStart: ev.time_start ?? '08:00', timeEnd: ev.time_end ?? ev.time_start ?? '08:00',
                  value: ev.value ?? vdata.value ?? 0, label: ev.label ?? '',
                  daysEnabled: dl.length > 0 && dl.length < 7,
                  days: dl.length > 0 ? parseDaysMask(dl) : [true,true,true,true,true,true,true],
                  validRangeEnabled: !!(ev.valid_start || ev.valid_end),
                  validStart: ev.valid_start ?? '', validEnd: ev.valid_end ?? '',
                });
              });
            });
          } else {
            planEvents.push({
              id: `${plan.id ?? `plan${i}`}-${name}-ev0`, variable: name,
              timeStart: '08:00', timeEnd: '08:00', value: vdata.value ?? 0, label: '',
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
    const DEFAULT_START = '2026-01-01';
    const DEFAULT_END   = '2026-12-31';
    const toStepUnit = (u: string): StepUnit => {
      if (u === 'day') return 'day'; if (u === 'hour') return 'hour';
      if (u === 'minute') return 'minute';
      return 'day';
    };
    let resolvedStepValue = 1;
    let resolvedStepUnit: StepUnit = 'hour';
    if (sim) {
      if (sim.start_date && sim.end_date) {
        set('simStartDate', String(sim.start_date));
        set('simEndDate',   String(sim.end_date));
        // simulation.step_size: {value, unit} is the current YAML format (see model.md).
        // Legacy flat sim.step / sim.step_unit kept as fallback for older files.
        const stepSize = sim.step_size;
        if (stepSize?.unit) { resolvedStepValue = stepSize.value ?? 1; resolvedStepUnit = toStepUnit(String(stepSize.unit)); }
        else { resolvedStepValue = sim.step ?? 1; resolvedStepUnit = toStepUnit(String(sim.step_unit || 'hour')); }
        set('stepValue', resolvedStepValue); set('stepUnit', resolvedStepUnit);
      } else {
        const UNIT_SEC: Record<string, number> = { minute:60, hour:3600, day:86400, week:604800, month:2592000, year:31536000 };
        const timeUnit = String(sim.time_unit || 'hour').toLowerCase();
        const rawStep  = sim.step_size ?? 1;
        const totalSec = (sim.total_time ?? 365) * rawStep * (UNIT_SEC[timeUnit] ?? 3600);
        resolvedStepValue = rawStep; resolvedStepUnit = toStepUnit(timeUnit);
        set('stepValue', rawStep); set('stepUnit', toStepUnit(timeUnit));
        set('simStartDate', DEFAULT_START); set('simEndDate', totalSecondsToEndDate(DEFAULT_START, totalSec));
      }
    } else {
      set('stepValue', 1); set('stepUnit', 'hour');
      set('simStartDate', DEFAULT_START); set('simEndDate', DEFAULT_END);
    }

    // Opt step: optimizer.step_size, defaults to simulation's step_size when absent (model.md).
    const optStepSize = optBlock?.step_size;
    if (optStepSize?.unit) {
      set('optStepValue', optStepSize.value ?? 1);
      set('optStepUnit', toStepUnit(String(optStepSize.unit)));
    } else {
      set('optStepValue', resolvedStepValue);
      set('optStepUnit', resolvedStepUnit);
    }

    // mcSeed 来自 simulation.mc.seed，无论是否有 optimizer 块都需要重置
    set('mcSeed', sim?.mc?.seed != null ? Number(sim.mc.seed) : null);

    // Opt config from YAML
    if (optBlock && optBlock.enabled !== false) {
      const parseDir = (d: string): 'minimize' | 'maximize' => d === 'maximize' ? 'maximize' : 'minimize';
      const rawObjs: Array<{ variable: string; direction: 'minimize' | 'maximize' }> = [];
      if (optBlock.objective) rawObjs.push({ variable: optBlock.objective.variable || '', direction: parseDir(optBlock.objective.direction || 'minimize') });
      if (Array.isArray(optBlock.objectives)) optBlock.objectives.forEach((o: any) => rawObjs.push({ variable: o.variable || '', direction: parseDir(o.direction || 'minimize') }));
      setObjectives(rawObjs);

      const parseCondition = (cond: string): { op: '≤' | '≥'; value: number } | null => {
        const m = cond.trim().match(/^([<>]=?)\s*(-?\d+(?:\.\d+)?)/);
        if (!m) return null;
        return { op: m[1] === '>=' || m[1] === '>' ? '≥' : '≤', value: parseFloat(m[2]) };
      };
      const parsedCons: Array<{ variable: string; op: '≤' | '≥'; value: number }> = [];
      if (Array.isArray(optBlock.constraints)) {
        optBlock.constraints.forEach((con: any) => { const p = parseCondition(String(con.condition || '')); if (p && con.variable) parsedCons.push({ variable: con.variable, ...p }); });
      }
      setConstraints(parsedCons);
      const methodMap: Record<string, string> = { 'nsga2':'NSGA-II','nsga-2':'NSGA-II','nsga_2':'NSGA-II','moead':'MOEA/D','moea/d':'MOEA/D','l-bfgs-b':'l-bfgs-b','lbfgsb':'l-bfgs-b','nelder-mead':'nelder-mead','nelder_mead':'nelder-mead' };
      const mappedMethod = methodMap[String(optBlock.method || '').toLowerCase()];
      if (mappedMethod) setOptAlgo(mappedMethod as any);
      const algoBlock = optBlock.algorithm || {};
      if (algoBlock.population_size) setOptPop(Number(algoBlock.population_size));
      if (algoBlock.n_generations)   setOptGen(Number(algoBlock.n_generations));
      setOptSeed(algoBlock.seed != null ? Number(algoBlock.seed) : 42);
      if (sim?.mc?.runs != null && Number(sim.mc.runs) > 1) set('simRuns', Math.max(1, Math.min(50, Number(sim.mc.runs))));
      setWarmStartEnabled(!!(yamlOptResult?.pareto_front?.length));
      setOptInputEvents(
        Array.isArray(optBlock.startpoint?.regimens)
          ? buildOptInputEventsFromYAML(optBlock.startpoint.regimens)
          : []
      );
    } else {
      setObjectives([]);
      setConstraints([]);
      setOptInputEvents([]);
    }

    setWarmStartEnabled(!!(yamlOptResult?.pareto_front?.length));
    setOptResult(yamlOptResult);
    sessionReadyRef.current = true;

    // Warm-start modal: only on first-ever load (no session existed)
    if (rawResults?.recommended?.x?.length > 0) {
      const bestX: number[] = rawResults.recommended.x;
      Modal.confirm({
        title: t('sim.opt.ref_detected_title'),
        content: t('sim.opt.ref_detected_content', { n: bestX.length }),
        okText: t('sim.opt.load_reference'), cancelText: t('sim.opt.use_default_schedule'),
        onOk: () => setOptInputEvents(prev => xToInputEvents(bestX, optBlock ?? selectedModel?.rawContent?.optimizer, prev)),
      });
    }
  }, [selectedModel]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── sync inputEvents → inputParams ──────────────────────────────────────────
  useEffect(() => {
    const params: Record<string, number> = {};
    inputEvents.forEach(ev => {
      params[ev.variable] = (params[ev.variable] ?? 0) + ev.value;
    });
    set('inputParams', params);
  }, [inputEvents]); // eslint-disable-line react-hooks/exhaustive-deps
}
