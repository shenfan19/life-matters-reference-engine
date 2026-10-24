// gui/src/components/modules/simulation/useSimulationModule.ts
// The simulation view's state and logic (ADR 0163): the input events and plans, the results of the runs and what is
// imported to compare with them, the run itself, and what is kept in the browser for it. It reads the core, which
// holds the settings a run shares with the optimization, and answers to the core's events. It does not know the
// optimization module.

import { useState, useEffect, useRef } from 'react';
import type { InputEvent, SimPlan, SimulationState, PlanResult, SimulationDataPoint, StepUnit } from '../../../types';
import type { Core } from '../../Simulator/useCore';
import { useSessionSlice } from '../../views/moduleHooks';
import { PLAN_COLORS, API_BASE, readSP, writeSP, migrateInputEvents, normalizeTimeInterval } from '../../sim_tab/simUtils';
import { parseDaysMask } from '../../sim_tab/optUtils';
import { useSimulation } from '../../sim_tab/useSimulation';
import { useExportImport } from '../../Simulator/useExportImport';
import { getInitialRoute } from '../../../core/urlRoute';
import { resolveSimWindow } from './yamlDefaults';

type SimLog = { t: number; msg: string };

const blankEvent = (firstInputVar: { name: string; value?: number }, id: string): InputEvent => ({
  id, variable: firstInputVar.name, timeStart: '08:00', timeEnd: '08:00',
  value: firstInputVar.value ?? 0, label: '',
  daysEnabled: false, days: [true, true, true, true, true, true, true],
  validRangeEnabled: false, validStart: '', validEnd: '',
});

export function useSimulationModule(core: Core) {
  const {
    t, selectedModel, selectedKey, state, setState, set, inputVars,
    session, runtime, events, autoSaveLocal, scsMode, setMode, switchCenterTab, setCenterTab,
  } = core;
  const {
    status, progress, currentStep, totalSteps, simulationData, dataPerRun,
    simStartDate, simEndDate, stepValue, stepUnit, simRuns, mcSeed, sessionSeed,
  } = state;

  // ── what a run leaves behind besides the curves ──────────────────────────────
  const [runOutputVars, setRunOutputVars] = useState<string[]>([]);
  const [outputWarnings, setOutputWarnings] = useState<string[]>([]);
  const [simLogs, setSimLogs] = useState<SimLog[]>([]);

  // ── input events and plans ───────────────────────────────────────────────────
  const [inputEvents, setInputEvents] = useState<InputEvent[]>(() => {
    const saved = readSP();
    if (saved?.inputEvents) return migrateInputEvents(saved.inputEvents);
    if (saved?.regimens) {
      const out: InputEvent[] = [];
      for (const r of (saved.regimens || [])) {
        for (const ev of (r.events || [])) {
          out.push({
            id: `${r.id}-${ev.id}`,
            variable: r.variable,
            timeStart: ev.time,
            timeEnd: ev.time,
            value: ev.value,
            label: ev.time,
            daysEnabled: r.daysEnabled ?? false,
            days: r.days ?? [true, true, true, true, true, true, true],
            validRangeEnabled: r.validRangeEnabled ?? false,
            validStart: r.validStart ?? '',
            validEnd: r.validEnd ?? '',
          });
        }
      }
      return out;
    }
    return [];
  });
  // Plans are session-only. inputEvents stays as the live editing state of the active plan, and the plans array
  // holds a snapshot of each plan.
  const [plans, setPlans] = useState<SimPlan[]>([{
    id: 'plan-1', label: t('sim.plan.default_label'), color: PLAN_COLORS[0], inputEvents: [],
  }]);
  const [activePlanId, setActivePlanId] = useState('plan-1');

  // ── the run ──────────────────────────────────────────────────────────────────
  const {
    comparedPlans, setComparedPlans, isRunningRef, invalidateSim,
    startSimulation, pauseSimulation, resumeSimulation, resetSimulation, runAllPlans,
  } = useSimulation({
    state, setState,
    selectedModel, selectedKey,
    inputEvents, inputVars, plans, activePlanId,
    simStartDate, simEndDate, stepValue, stepUnit,
    simRuns, mcSeed,
    setRunOutputVars, setOutputWarnings, setRunningModelKey: runtime.setRunningModelKey, setSimLogs,
    setInputEvents, setMode, switchCenterTab,
    stopOptJobs: () => runtime.stopOthers('simulation'),
    autoSaveLocal: autoSaveLocal && !scsMode,
    t,
  });

  const {
    importedSimRuns, setImportedSimRuns, simRunCounterRef,
    importSimCSV, removeImportedRun, handleExportSimCSV,
  } = useExportImport({
    selectedModel, simStartDate, simEndDate, simulationData, dataPerRun, comparedPlans, t,
  });

  // ── events of the core ───────────────────────────────────────────────────────
  const onSessionReset = useRef(() => {});
  onSessionReset.current = () => { setImportedSimRuns([]); simRunCounterRef.current = 0; };
  const onModelReload = useRef(() => {});
  onModelReload.current = () => { resetSimulation(); setComparedPlans([]); };
  useEffect(() => {
    const offs = [
      events.on('session:reset', () => onSessionReset.current()),
      events.on('model:reload', () => onModelReload.current()),
    ];
    return () => offs.forEach(off => off());
  }, [events]);

  // ── results of the model that was left are kept in memory, those of the model that is opened come back ──
  // Not persisted like the session: curve data can be large and does not need to survive a page reload, but it is
  // restored when switching back to a model within the same browser session.
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
    simLogs: SimLog[];
  }>>({});
  const prevSelectedKeyRef = useRef<string | null>(null);
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

  // ── editing: events and plans ────────────────────────────────────────────────
  const addInputEvent = () => {
    const first = inputVars[0];
    if (!first) return;
    session.markEdited();
    invalidateSim();
    setInputEvents(prev => [...prev, blankEvent(first, `ev-${Date.now()}`)]);
  };
  const updateInputEvent = (id: string, patch: Partial<InputEvent>) => {
    session.markEdited();
    invalidateSim();
    setInputEvents(prev => prev.map(ev => ev.id === id ? { ...ev, ...patch } : ev));
  };
  const removeInputEvent = (id: string) => {
    session.markEdited();
    invalidateSim();
    setInputEvents(prev => prev.filter(ev => ev.id !== id));
  };

  const selectPlan = (id: string) => {
    // Save the current inputEvents snapshot into the current plan before switching
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
    session.markEdited();
    setPlans(prev => prev.map(p => p.id === activePlanId ? { ...p, inputEvents } : p).concat(newPlan));
    setActivePlanId(id);
  };
  const removePlan = (id: string) => {
    if (plans.length <= 1) return;
    const remaining = plans.filter(p => p.id !== id);
    session.markEdited();
    setPlans(remaining);
    if (activePlanId === id) {
      const next = remaining[0];
      setActivePlanId(next.id);
      setInputEvents(next.inputEvents);
    }
  };

  // Plans made elsewhere, for example the solutions of an optimization, join the plans of the simulation and the
  // simulation view opens with a fresh run button.
  const addPlans = (newPlans: SimPlan[]) => {
    if (newPlans.length === 0) return;
    session.markEdited();
    setPlans(prev => prev.map(p => p.id === activePlanId ? { ...p, inputEvents } : p).concat(newPlans));
    set('status', 'idle');
    set('progress', 0);
    set('currentStep', 0);
    setMode('sim');
    setComparedPlans([]);
    switchCenterTab('simulation');
  };

  // ── the model's inputs, summed, are the input parameters of the run ──────────
  useEffect(() => {
    const params: Record<string, number> = {};
    inputEvents.forEach(ev => {
      params[ev.variable] = (params[ev.variable] ?? 0) + ev.value;
    });
    set('inputParams', params);
  }, [inputEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── a model is selected: nothing of the last run is shown ────────────────────
  useEffect(() => {
    setRunOutputVars([]);
    setOutputWarnings([]);
    setSimLogs([]);
  }, [selectedModel]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── per-model session: restore it, or take the starting point from the file ──
  useSessionSlice(core, 'simulation', {
    init: (saved) => {
      const model = selectedModel!;
      const sim = model.content?.simulation;
      const clampRuns = (n: unknown) => Math.max(1, Math.min(50, Number(n)));
      if (saved) {
        setInputEvents(migrateInputEvents(saved.inputEvents));
        setPlans(saved.plans.map(p => ({ ...p, inputEvents: migrateInputEvents(p.inputEvents) })));
        setActivePlanId(saved.activePlanId);
        set('simStartDate', saved.simStartDate);
        set('simEndDate', saved.simEndDate);
        set('stepValue', saved.stepValue);
        set('stepUnit', saved.stepUnit);
        set('simRuns', saved.simRuns ?? (sim?.mc?.runs != null ? clampRuns(sim.mc.runs) : 1));
        set('mcSeed', 'mcSeed' in saved ? saved.mcSeed : (sim?.mc?.seed != null ? Number(sim.mc.seed) : null));
        session.editedRef.current = !!(saved as any).userEdited;
        return;
      }

      // First visit: the starting point is what the file says.
      const rawSchedules = sim?.schedules;
      const schedList: any[] = Array.isArray(rawSchedules) ? rawSchedules : [];
      const schedDict: Record<string, any> = (!Array.isArray(rawSchedules) && rawSchedules) ? rawSchedules : {};
      const variables: Record<string, any> = model.content.variables;

      const newInputEvents: InputEvent[] = [];
      Object.entries(variables).forEach(([name, data]) => {
        if (data.type !== 'input') return;
        const flatEntries = schedList.filter(s => s.variable === name);
        if (flatEntries.length > 0) {
          flatEntries.forEach((s, i) => {
            const daysList: string[] = Array.isArray(s.days) ? s.days : [];
            const hasDays = daysList.length > 0 && daysList.length < 7;
            let validStart: string = s.valid_start ?? '';
            let validEnd: string = s.valid_end ?? '';
            if (!validStart && !validEnd && Array.isArray(s.date_range) && s.date_range.length === 2) {
              validStart = String(s.date_range[0]); validEnd = String(s.date_range[1]);
            }
            const { timeStart, timeEnd } = normalizeTimeInterval(s);
            newInputEvents.push({
              id: `${name}-sched${i}`, variable: name,
              timeStart, timeEnd,
              value: s.value ?? data.value ?? 0, label: s.label ?? '',
              daysEnabled: hasDays,
              days: hasDays ? parseDaysMask(daysList) : [true, true, true, true, true, true, true],
              validRangeEnabled: !!(validStart || validEnd), validStart, validEnd,
            });
          });
        } else if (schedDict[name]?.points?.length) {
          const seen = new Set<string>();
          const secsToHHMM = (sec: number) => {
            const s2 = sec % 86400;
            return `${String(Math.floor(s2 / 3600)).padStart(2, '0')}:${String(Math.floor((s2 % 3600) / 60)).padStart(2, '0')}`;
          };
          (schedDict[name].points as any[]).forEach((pt: any, idx: number) => {
            const t2 = secsToHHMM(pt.time ?? 0);
            if (seen.has(t2)) return;
            seen.add(t2);
            newInputEvents.push({
              id: `${name}-ev${idx}`, variable: name, timeStart: t2, timeEnd: t2,
              value: pt.value ?? 0, label: '',
              daysEnabled: false, days: [true, true, true, true, true, true, true],
              validRangeEnabled: false, validStart: '', validEnd: '',
            });
          });
        } else {
          newInputEvents.push({
            id: `${name}-ev0`, variable: name, timeStart: '08:00', timeEnd: '08:00',
            value: data.value ?? 0, label: '',
            daysEnabled: false, days: [true, true, true, true, true, true, true],
            validRangeEnabled: false, validStart: '', validEnd: '',
          });
        }
      });

      // Plan id and label come from the raw YAML (display metadata only); the schedule semantics (days, date range,
      // pulse or sustained) come from `content.plans`, which the backend parsed with the code the CLI uses. The
      // frontend must not derive those again, or GUI and CLI runs of one file can silently diverge.
      const backendPlans: Record<string, any[]> = model.content?.plans ?? {};
      const yamlPlans: any[] = sim?.plans ?? [];
      if (yamlPlans.length > 0) {
        const loadedPlans: SimPlan[] = yamlPlans.map((plan: any, i: number) => {
          const schedules: any[] = backendPlans[plan.id ?? `plan_${i}`] ?? [];
          const planEvents: InputEvent[] = [];
          Object.entries(variables).forEach(([name, vdata]) => {
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
                    days: dl.length > 0 ? parseDaysMask(dl) : [true, true, true, true, true, true, true],
                    validRangeEnabled: !!(ev.valid_start || ev.valid_end),
                    validStart: ev.valid_start ?? '', validEnd: ev.valid_end ?? '',
                  });
                });
              });
            } else {
              planEvents.push({
                id: `${plan.id ?? `plan${i}`}-${name}-ev0`, variable: name,
                timeStart: '08:00', timeEnd: '08:00', value: vdata.value ?? 0, label: '',
                daysEnabled: false, days: [true, true, true, true, true, true, true],
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

      const w = resolveSimWindow(sim);
      set('simStartDate', w.simStartDate);
      set('simEndDate', w.simEndDate);
      set('stepValue', w.stepValue);
      set('stepUnit', w.stepUnit as StepUnit);
      set('mcSeed', sim?.mc?.seed != null ? Number(sim.mc.seed) : null);
      if (sim?.mc?.runs != null && Number(sim.mc.runs) > 1) set('simRuns', clampRuns(sim.mc.runs));
    },
    slice: () => ({
      inputEvents, plans, activePlanId,
      simStartDate, simEndDate, stepValue, stepUnit, simRuns, mcSeed,
    }),
    deps: [inputEvents, plans, activePlanId, simStartDate, simEndDate, stepValue, stepUnit, simRuns, mcSeed],
  });

  // ── what is kept in the browser for the simulation ───────────────────────────
  // The curves of the last run come back after a reload, and the run is looked up on the backend by its session.
  useEffect(() => {
    const saved = readSP();
    if (!saved) return;
    // The saved results belong to the model that was open last, not to the one a link points to.
    const linked = getInitialRoute();
    if (linked?.key && linked.key !== saved.selectedKey) return;
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
    // Lock state is intentionally not restored: the model must be re-validated each session.
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
            status: data.completed ? 'completed' : 'paused',
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const current = readSP() || {};
    if (status === 'running') {
      writeSP({ ...current, status, currentStep, progress, totalSteps, sessionId: state.sessionId, sessionSeed });
      return;
    }
    writeSP({ ...current, simulationData, dataPerRun, status, currentStep, progress, totalSteps, sessionId: state.sessionId, sessionSeed });
  }, [status, state.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // A run that starts or ends opens the simulation view. A link names its own view, so a status restored from the
  // last visit does not override it; a run started on this page does.
  const skipAutoSwitch = useRef(getInitialRoute() !== null);
  useEffect(() => {
    if (skipAutoSwitch.current) {
      if (status !== 'running') return;
      skipAutoSwitch.current = false;
    }
    if (status === 'running' || status === 'completed') setCenterTab('simulation');
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── derived ──────────────────────────────────────────────────────────────────
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
  const simRunningOrPaused = status === 'running' || status === 'paused';

  // Prefer the current run, then the last archived run, then the first compared plan
  const effectiveSimData = simulationData.length > 0
    ? simulationData
    : importedSimRuns.length > 0 ? importedSimRuns[importedSimRuns.length - 1].data
    : comparedPlans.find(p => p.data.length > 0)?.data ?? [];

  // All plan datasets, for the charts and the report (what the plot of the simulation view also assembles)
  const planDatasets: PlanResult[] = [
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
  const activePlanDatasets = planDatasets.filter(p => p.data.length > 0);

  return {
    // events and plans
    inputEvents, setInputEvents, addInputEvent, updateInputEvent, removeInputEvent,
    plans, activePlanId, selectPlan, addPlan, removePlan, addPlans,
    // the run
    comparedPlans, setComparedPlans, isRunningRef, invalidateSim,
    startSimulation, pauseSimulation, resumeSimulation, resetSimulation, runAllPlans,
    simRunningOrPaused,
    // what it left behind
    runOutputVars, outputWarnings, simLogs, outputVars,
    importedSimRuns, setImportedSimRuns, simRunCounterRef, importSimCSV, removeImportedRun, handleExportSimCSV,
    effectiveSimData, planDatasets, activePlanDatasets, isMultiPlan: activePlanDatasets.length > 1,
  };
}

export type SimulationModule = ReturnType<typeof useSimulationModule>;
export const simulationOf = (core: Core) => core.modules.simulation as SimulationModule;
