// useSimulation.ts — custom hook for simulation execution handlers
//
// Owns: isRunningRef, comparedPlans
// Receives: state/setState from App (via Simulator props), all relevant
//   model + date + input state, and callback setters.
//
// Returns: sim execution handlers + comparedPlans state

import { useState, useRef } from 'react';
import { message, Modal } from 'antd';
import type { InputEvent, ModelFile, PlanResult, SimPlan, SimulationDataPoint, SimulationState, StepUnit } from '../../types';
import { API_BASE, PLAN_COLORS, xToInputEvents } from './simUtils';
import { dump as yamlDump } from 'js-yaml';

const STEP_UNITS: Record<StepUnit, number> = { day: 86400, hour: 3600, minute: 60 };

const dateToHours = (start: string, end: string) =>
  Math.max(0, (new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 3_600_000);

interface UseSimulationParams {
  state: SimulationState;
  setState: React.Dispatch<React.SetStateAction<SimulationState>>;
  selectedModel: ModelFile | null;
  selectedKey: string | null;
  inputEvents: InputEvent[];
  inputVars: Array<{ name: string; value?: number }>;
  plans: SimPlan[];
  activePlanId: string;
  simStartDate: string;
  simEndDate: string;
  stepValue: number;
  stepUnit: StepUnit;
  simRuns: number;
  mcSeed: number | null;
  setRunOutputVars: (vars: string[]) => void;
  setOutputWarnings: (w: string[]) => void;
  setRunningModelKey: (key: string | null) => void;
  setSimLogs: (logs: Array<{ t: number; msg: string }>) => void;
  setInputEvents: React.Dispatch<React.SetStateAction<InputEvent[]>>;
  setMode: (mode: string) => void;
  switchCenterTab: (tab: string) => void;
  stopOptJobs: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function useSimulation({
  state, setState,
  selectedModel, selectedKey,
  inputEvents, inputVars, plans, activePlanId,
  simStartDate, simEndDate, stepValue, stepUnit,
  simRuns, mcSeed,
  setRunOutputVars, setOutputWarnings, setRunningModelKey, setSimLogs,
  setInputEvents, setMode, switchCenterTab, stopOptJobs,
  t,
}: UseSimulationParams) {
  const [comparedPlans, setComparedPlans] = useState<PlanResult[]>([]);
  const isRunningRef = useRef(false);

  const { sessionId, batchSize, updateInterval, inputParams } = state;

  const set = <K extends keyof SimulationState>(key: K, val: SimulationState[K]) =>
    setState(prev => ({ ...prev, [key]: val }));

  const setSimData = (val: SimulationDataPoint[] | ((p: SimulationDataPoint[]) => SimulationDataPoint[])) =>
    setState(prev => ({ ...prev, simulationData: typeof val === 'function' ? val(prev.simulationData) : val }));

  // ── invalidate sim when inputs change ─────────────────────────────────────────

  const invalidateSim = () => {
    if (state.status !== 'idle') {
      stopOptJobs();
      isRunningRef.current = false;
      setState(prev => ({ ...prev, status: 'idle', progress: 0, currentStep: 0, simulationData: [], dataPerRun: [], sessionId: '' }));
      setComparedPlans([]);
    }
  };

  // ── build regimen payload from inputEvents ────────────────────────────────────

  const buildRegimenPayload = (events: InputEvent[]) => {
    const inputVarNames = new Set(inputVars.map(v => v.name));
    return events
      .filter(ev => inputVarNames.has(ev.variable))
      .map(ev => ({
        variable: ev.variable,
        events: [{
          id: ev.id, value: ev.value,
          time_start: ev.timeStart, time_end: ev.timeEnd,
        }],
        days_enabled: ev.daysEnabled,
        days: ev.days,
        valid_range_enabled: ev.validRangeEnabled,
        valid_start: ev.validStart,
        valid_end: ev.validEnd,
      }));
  };

  // ── start simulation ──────────────────────────────────────────────────────────

  const startSimulation = async () => {
    if (!selectedModel) return;
    try {
      set('status', 'running'); set('progress', 0); set('currentStep', 0);
      setSimData([]); setComparedPlans([]);
      setState(prev => ({ ...prev, dataPerRun: [], sessionSeed: 0, sessionId: '' }));
      setSimLogs([]);
      isRunningRef.current = true;
      setRunningModelKey(selectedKey);

      const modelName = selectedModel.key.split('/').pop()?.replace(/\.ya?ml$/i, '') || selectedModel.content!.metadata.name;
      const resp = await fetch(`${API_BASE}/simulation/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: modelName,
          folder: selectedModel.folder,
          time_hours: dateToHours(simStartDate, simEndDate),
          step_size: stepValue * STEP_UNITS[stepUnit],
          input_params: inputParams,
          regimens: buildRegimenPayload(inputEvents),
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
        if (Array.isArray(result.data.logs)) setSimLogs(result.data.logs);
        runBatch(result.data.session_id);
      } else {
        message.error(result.error || t('sim.msg.start_failed'));
        set('status', 'idle'); isRunningRef.current = false; setRunningModelKey(null);
      }
    } catch (e: any) {
      message.error(e.message);
      set('status', 'idle'); isRunningRef.current = false; setRunningModelKey(null);
    }
  };

  // ── batch loop ────────────────────────────────────────────────────────────────

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
              return { ...prev, dataPerRun: existing.map((run, i) => [...run, ...(incoming[i] || [])]) };
            });
          }
          if (Array.isArray(res.data.logs)) setSimLogs(res.data.logs);
          if (res.data.completed) {
            set('status', 'completed'); isRunningRef.current = false; setRunningModelKey(null);
            message.success(t('sim.msg.sim_complete'));
          } else {
            setTimeout(loop, updateInterval);
          }
        } else {
          message.error(res.error || t('sim.msg.start_failed'));
          set('status', 'idle'); isRunningRef.current = false; setRunningModelKey(null);
        }
      } catch {
        set('status', 'idle'); isRunningRef.current = false; setRunningModelKey(null);
      }
    };
    loop();
  };

  // ── pause / resume / reset ────────────────────────────────────────────────────

  const pauseSimulation  = () => { isRunningRef.current = false; set('status', 'paused'); };
  const resumeSimulation = () => {
    if (!sessionId) return;
    isRunningRef.current = true; set('status', 'running'); runBatch(sessionId);
  };
  const resetSimulation  = () => {
    isRunningRef.current = false;
    set('status', 'idle'); set('progress', 0); set('currentStep', 0); setSimData([]);
    setState(prev => ({ ...prev, dataPerRun: [], sessionSeed: 0, sessionId: '' }));
    setSimLogs([]);
  };

  // ── run Pareto solutions as compared plans ────────────────────────────────────

  const handleRunCompared = async (selectedRows: Array<{ x: number[]; f: number[]; rank: number }>) => {
    if (!selectedModel || selectedRows.length === 0) return;
    const optimizer = selectedModel.content?.optimizer;
    if (!optimizer) { message.warning(t('sim.msg.no_opt_config')); return; }

    const initPlans: PlanResult[] = selectedRows.map((row, i) => ({
      id: `pareto-${row.rank}`, label: `Pareto #${row.rank}`,
      color: PLAN_COLORS[i % PLAN_COLORS.length],
      data: [], runsData: [], running: true,
    }));
    setComparedPlans(initPlans);
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
            events: [{ id: ev.id, value: ev.value, time_start: ev.timeStart, time_end: ev.timeEnd }],
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
          runsData: batchResult.data.outputs_per_run?.length > 1 ? batchResult.data.outputs_per_run : [],
          running: false,
        }));
      } catch (e: any) {
        setComparedPlans(prev => prev.map((p, idx) => idx !== i ? p : { ...p, running: false }));
      }
    }));
  };

  // ── run all plans in parallel (F-MPLAN) ──────────────────────────────────────
  // Phase 1: start all N sessions simultaneously.
  // Phase 2: synchronized batch loop — all plans advance each round.

  const runAllPlans = async () => {
    if (!selectedModel) return;
    const currentPlans = plans.map(p => p.id === activePlanId ? { ...p, inputEvents } : p);

    setComparedPlans(currentPlans.map(plan => ({
      id: plan.id, label: plan.label, color: plan.color, data: [], runsData: [], running: true,
    })));
    setSimData([]);
    set('status', 'running'); set('progress', 0); set('currentStep', 0);
    isRunningRef.current = true;
    setRunningModelKey(selectedKey);

    const modelName = selectedModel.key.split('/').pop()?.replace(/\.ya?ml$/i, '') || selectedModel.content?.metadata?.name || '';
    const timeHours = dateToHours(simStartDate, simEndDate);
    const stepSizeSec = stepValue * STEP_UNITS[stepUnit];
    const localInputVarNames = new Set(inputVars.map((v: any) => v.name));
    const CHUNK = 500;

    type Session = { sid: string; total: number; done: boolean; failed: boolean; planIdx: number };

    const startResults = await Promise.allSettled(currentPlans.map(async (plan, i) => {
      const regimens = plan.inputEvents
        .filter(ev => localInputVarNames.has(ev.variable))
        .map(ev => ({
          variable: ev.variable,
          events: [{
            id: ev.id, value: ev.value,
            time_start: ev.timeStart, time_end: ev.timeEnd,
          }],
          days_enabled: ev.daysEnabled, days: ev.days,
          valid_range_enabled: ev.validRangeEnabled,
          valid_start: ev.validStart, valid_end: ev.validEnd,
        }));
      const r = await fetch(`${API_BASE}/simulation/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: modelName, folder: selectedModel.folder, time_hours: timeHours, step_size: stepSizeSec, input_params: inputParams, regimens, sim_runs: simRuns }),
      }).then(res => res.json());
      if (!r.success) throw new Error(r.error || '启动失败');
      return { sid: r.data.session_id, total: r.data.total_steps, planIdx: i, outputVars: r.data.output_variables };
    }));

    const sessions: Session[] = startResults.map((res, i) => {
      if (res.status === 'rejected') {
        message.error(t('sim.msg.plan_start_failed', { label: currentPlans[i].label }));
        setComparedPlans(prev => prev.map((r, idx) => idx !== i ? r : { ...r, running: false }));
        return { sid: '', total: 0, done: true, failed: true, planIdx: i };
      }
      return { ...res.value, done: false, failed: false };
    });

    const firstOV = (startResults as PromiseFulfilledResult<any>[])
      .find(r => r.status === 'fulfilled' && Array.isArray(r.value?.outputVars))?.value?.outputVars;
    if (firstOV) setRunOutputVars(firstOV);

    const planData: any[][] = currentPlans.map(() => []);
    const planRunsData: any[][][] = currentPlans.map(() => []);

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
    setRunningModelKey(null);
    const failed = sessions.filter(s => s.failed).length;
    if (failed === 0) message.success(t('sim.msg.plans_done', { n: currentPlans.length }));
    else message.warning(t('sim.msg.plans_partial_fail', { n: failed }));
  };

  // ── apply best opt solution to sim ────────────────────────────────────────────

  const applyBestToSim = (optResult: any) => {
    const optimizer = selectedModel?.content?.optimizer;
    const bestX = optimizer?.results?.reference?.x;
    if (!optimizer || !Array.isArray(bestX) || bestX.length === 0) {
      message.warning(t('sim.msg.no_best_solution')); return;
    }
    setInputEvents(prev => xToInputEvents(bestX, optimizer, prev));
    set('status', 'idle'); set('progress', 0); set('currentStep', 0);
    setComparedPlans([]);
    setMode('sim');
    switchCenterTab('simulation');
  };

  // ── add Pareto solutions as new plans ─────────────────────────────────────────

  const addPlansFromOpt = (rows: Array<{ x: number[]; f: number[]; rank: number }>, optResult: any) => {
    const optimizer = selectedModel?.content?.optimizer ?? optResult?.optimizer_config;
    if (!optimizer || rows.length === 0) return;
    const newPlans: SimPlan[] = rows.map((row, i) => ({
      id: `pareto-${row.rank}-${Date.now()}-${i}`,
      label: `Pareto #${row.rank}`,
      color: PLAN_COLORS[(plans.length + i) % PLAN_COLORS.length],
      inputEvents: xToInputEvents(row.x, optimizer, inputEvents),
    }));
    // (caller must update plans state — hook returns the newPlans for them to merge)
    set('status', 'idle'); set('progress', 0); set('currentStep', 0);
    setComparedPlans([]);
    setMode('sim');
    switchCenterTab('simulation');
    return newPlans;
  };

  // ── CSV export ────────────────────────────────────────────────────────────────

  const exportSimCSV = () => {
    const { simulationData } = state;
    if (!simulationData.length) return;
    const keys = Object.keys(simulationData[0]);
    const rows = simulationData.map(row => keys.map(k => (row as any)[k]).join(','));
    const csv = [keys.join(','), ...rows].join('\n');
    const modelName = selectedModel?.content?.metadata?.name || 'sim';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${modelName}_${simStartDate}_${simEndDate}.csv`;
    a.click();
    message.success(t('sim.msg.dl_sim_done', { n: simulationData.length }));
  };

  // ── raw YAML download ─────────────────────────────────────────────────────────

  const downloadRawModel = () => {
    if (!selectedModel) return;
    const content = selectedModel.rawContent ?? selectedModel.content;
    const yaml = yamlDump(content, { lineWidth: 120, noRefs: true });
    const name = (selectedModel.content?.metadata?.name || selectedModel.title || 'model').replace(/\s+/g, '_');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([yaml], { type: 'text/yaml' }));
    a.download = `${name}.yaml`;
    a.click();
    message.success(t('sim.msg.dl_model_no_opt'));
  };

  return {
    comparedPlans, setComparedPlans,
    isRunningRef,
    invalidateSim,
    startSimulation,
    runBatch,
    pauseSimulation,
    resumeSimulation,
    resetSimulation,
    handleRunCompared,
    runAllPlans,
    applyBestToSim,
    addPlansFromOpt,
    exportSimCSV,
    downloadRawModel,
  };
}
