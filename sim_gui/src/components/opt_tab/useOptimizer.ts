// useOptimizer.ts — custom hook owning all optimizer execution state + handlers
//
// Owns: optRunning, optResult, storedOptResult, warmStartEnabled, optCurGen,
//       optTotalGen, optLogs, optHistory, optElapsed, optJobId, optMethod,
//       optPollRef, optTargetKeyRef
//
// Receives as parameters: everything it needs from Simulator (model, events,
//   objectives, dates, step, setRunningModelKey, setCenterTab, modelSessionsRef)
//
// Returns: all state values + setters + startOptimization + cancelOptimization
//   + stopAllJobs + downloadModelYAML + exportOptCSV + importParetoFromCSV

import { useState, useRef, useEffect } from 'react';
import { message } from 'antd';
import type { InputEvent, ModelFile } from '../../types';
import { hasAnyOpt, buildOptSchedules } from '../sim_tab/optUtils';
import { API_BASE } from '../sim_tab/simUtils';
import { readMS, writeMS } from '../sim_tab/useSession';

function buildProblemSignature(
  objectives: Array<{ variable: string; direction: string }>,
  constraints: Array<{ variable: string; op: string; value: number }>,
  inputEvents: InputEvent[],
): string {
  const objs = objectives.map(o => `${o.variable}:${o.direction}`).join('|');
  const cons = constraints.map(c => `${c.variable}${c.op}${c.value}`).join('|');
  const evOpt = inputEvents
    .filter(ev => ev.optimizeValue || ev.optimizeTime || ev.optimizeDays || ev.optimizeDateRange)
    .map(ev => [
      ev.variable,
      ev.optimizeValue ? `v[${ev.valueBounds}]` : '',
      ev.optimizeTime ? `t[${ev.timeWindowStart}-${ev.timeWindowEnd},${ev.timeStep}]` : '',
      ev.optimizeDays ? `d[${(ev.daysPool || []).join(',')},${ev.daysNMin}-${ev.daysNMax}]` : '',
      ev.optimizeDateRange ? `dr[${ev.dateStartLo}-${ev.dateStartHi},${ev.dateEndLo}-${ev.dateEndHi}]` : '',
    ].filter(Boolean).join(':'))
    .join('||');
  return `${objs}||${cons}||${evOpt}`;
}

interface UseOptimizerParams {
  selectedModel: ModelFile | null;
  selectedKey: string | null;
  inputEvents: InputEvent[];
  inputVars: Array<{ name: string }>;
  objectives: Array<{ variable: string; direction: 'minimize' | 'maximize' }>;
  constraints: Array<{ variable: string; op: '≤' | '≥'; value: number }>;
  optAlgo: string;
  optPop: number;
  optGen: number;
  simStartDate: string;
  simEndDate: string;
  stepValue: number;
  stepUnit: string;
  simRuns: number;
  mcSeed: number | null;
  modelSessionsRef: React.MutableRefObject<Record<string, any>>;
  setRunningModelKey: (key: string | null) => void;
  setCenterTab: (tab: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function useOptimizer({
  selectedModel, selectedKey,
  inputEvents, inputVars,
  objectives, constraints,
  optAlgo, optPop, optGen,
  simStartDate, simEndDate, stepValue, stepUnit,
  simRuns, mcSeed,
  modelSessionsRef,
  setRunningModelKey, setCenterTab,
  t,
}: UseOptimizerParams) {
  const [optRunning,      setOptRunning]      = useState(false);
  const [optResult,       setOptResult]       = useState<any>(null);
  const [storedOptResult, setStoredOptResult] = useState<any>(null);
  const [warmStartEnabled, setWarmStartEnabled] = useState(true);
  const [lastRunSignature, setLastRunSignature] = useState<string | null>(null);
  const [optCurGen,       setOptCurGen]       = useState(0);
  const [optTotalGen,     setOptTotalGen]     = useState(0);
  const [optLogs,         setOptLogs]         = useState<Array<{ t: number; msg: string }>>([]);
  const [optHistory,      setOptHistory]      = useState<any[]>([]);
  const [optElapsed,      setOptElapsed]      = useState(0);
  const [optJobId,        setOptJobId]        = useState<string | null>(null);
  const [optMethod,       setOptMethod]       = useState('');

  const optPollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const optTargetKeyRef = useRef<string | null>(null);

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => { if (optPollRef.current) clearInterval(optPollRef.current); };
  }, []);

  // Reset signature when model changes
  useEffect(() => { setLastRunSignature(null); }, [selectedKey]);

  // ── start ────────────────────────────────────────────────────────────────────

  const startOptimization = async () => {
    if (!selectedModel) return;
    setCenterTab('optimization');
    if (optPollRef.current) { clearInterval(optPollRef.current); optPollRef.current = null; }

    setLastRunSignature(buildProblemSignature(objectives, constraints, inputEvents));

    const activeInputVarNames = new Set(inputVars.map(v => v.name));
    const decisionVars = inputEvents.filter(ev => hasAnyOpt(ev, activeInputVarNames));
    if (decisionVars.length === 0) {
      message.warning(t('sim.opt.no_inputs_warning'));
      return;
    }

    const totalGen = selectedModel.content?.optimizer?.algorithm?.n_generations || optGen;

    // Capture existing front BEFORE clearing (optResult is null after setOptResult(null))
    const previousFront = warmStartEnabled
      ? (optResult?.pareto_front ?? storedOptResult?.pareto_front)
      : null;

    setOptRunning(true); setOptResult(null); setOptLogs([]); setOptCurGen(0);
    setOptHistory([]); setOptElapsed(0); setOptMethod('');
    setOptTotalGen(totalGen); setOptJobId(null);
    setRunningModelKey(selectedKey);
    optTargetKeyRef.current = selectedKey;

    const optSchedules = buildOptSchedules(inputEvents, activeInputVarNames);
    const optimizerOverride: Record<string, any> = {
      schedules: optSchedules,
      objectives: objectives.map(o => ({ variable: o.variable, metric: 'final', direction: o.direction })),
      constraints: constraints.map(con => ({
        variable: con.variable,
        condition: `${con.op === '≤' ? '<=' : '>='} ${con.value}`,
      })),
      algorithm: { population_size: optPop, n_generations: optGen, seed: 42 },
      start_date: simStartDate,
      end_date:   simEndDate,
      step_size:  { value: stepValue, unit: stepUnit },
    };

    // F-5-3: always send warm_start to override backend's YAML read
    if (Array.isArray(previousFront) && previousFront.length > 0) {
      optimizerOverride.warm_start = previousFront;   // warm path
    } else {
      optimizerOverride.warm_start = [];              // cold: explicit empty overrides YAML
    }

    const modelKey = selectedModel.key || selectedModel.content?.metadata?.name || '';
    try {
      const resp = await fetch(`${API_BASE}/optimizer/run_yaml`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: modelKey, folder: null, optimizer_override: optimizerOverride }),
      });
      const data = await resp.json();

      if (!resp.ok || !data.success || !data.job_id) {
        message.error(data.detail || data.error || t('sim.msg.opt_start_failed'));
        setOptRunning(false); setRunningModelKey(null); return;
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
            setOptRunning(false); setRunningModelKey(null);
            setOptResult(sd.result);
            // Persist result to session even if user has navigated away
            const targetKey = optTargetKeyRef.current;
            if (targetKey && sd.result) {
              const existing = modelSessionsRef.current[targetKey] || {};
              const updated = { ...existing, optResult: sd.result };
              modelSessionsRef.current[targetKey] = updated;
              const all = readMS(); all[targetKey] = updated; writeMS(all);
            }
            setCenterTab('optimization');
            message.success(t('sim.msg.opt_done', { n: sd.result?.n_solutions ?? 0 }));
          } else if (sd.status === 'failed') {
            clearInterval(optPollRef.current!); optPollRef.current = null;
            setOptRunning(false); setRunningModelKey(null);
            message.error(sd.error || t('sim.msg.opt_failed'));
          } else if (sd.status === 'cancelled') {
            clearInterval(optPollRef.current!); optPollRef.current = null;
            setOptRunning(false); setRunningModelKey(null);
          }
        } catch { /* ignore transient poll errors */ }
      }, 1500);

    } catch (e: any) {
      setOptRunning(false);
      message.error(e.message);
    }
  };

  // ── cancel ───────────────────────────────────────────────────────────────────

  const cancelOptimization = async () => {
    if (optPollRef.current) { clearInterval(optPollRef.current); optPollRef.current = null; }

    // Save latest intermediate Pareto front so next run can warm-start
    const lastEntry = [...optHistory].reverse().find((h: any) => h.pareto_front?.length > 0);
    if (lastEntry?.pareto_front?.length > 0) {
      setOptResult({
        pareto_front: lastEntry.pareto_front,
        n_solutions: lastEntry.pareto_count || lastEntry.pareto_front.length,
        method: optMethod || 'nsga2',
        objectives: objectives.map(o => ({ variable: o.variable, direction: o.direction })),
      });
      setWarmStartEnabled(true);
    }

    if (optJobId) {
      try { await fetch(`${API_BASE}/optimizer/job/${optJobId}`, { method: 'DELETE' }); } catch {}
    }
    setOptRunning(false); setRunningModelKey(null);
  };

  // ── stop all (also stops sim polling) ────────────────────────────────────────

  const stopOptJobs = () => {
    if (optPollRef.current) { clearInterval(optPollRef.current); optPollRef.current = null; }
    if (optJobId) { fetch(`${API_BASE}/optimizer/job/${optJobId}`, { method: 'DELETE' }).catch(() => {}); }
    setOptRunning(false);
    setOptJobId(null);
    setRunningModelKey(null);
  };

  // ── download / save YAML with results ────────────────────────────────────────

  const buildResults = (elapsed: number) => ({
    generated_at: new Date().toISOString().slice(0, 10),
    method: optResult?.method || 'nsga2',
    n_solutions: optResult?.n_solutions || 0,
    elapsed_seconds: Math.round(elapsed * 10) / 10,
    pareto_front: optResult?.pareto_front || [],
    reference: {
      x: optResult?.best_x,
      f: optResult?.best_f,
    },
  });

  const downloadModelYAML = async (flattenImports = false, includeResults = true) => {
    if (!selectedModel?.key) return;
    const modelKey = selectedModel.key.replace(/^models\//, '');
    const results = includeResults && optResult ? buildResults(optElapsed) : undefined;
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
      const n = results?.pareto_front?.length ?? 0;
      message.success(n > 0 ? t('sim.msg.dl_model_with_pareto', { n }) : t('sim.msg.dl_model_no_opt'));
    } catch {}
  };

  const exportOptCSV = () => {
    const front: Array<{ x: number[]; f: number[] }> = optResult?.pareto_front ?? [];
    if (!front.length) { message.warning(t('sim.msg.no_pareto_to_export')); return; }
    const objNames = (objectives.length > 0 ? objectives : (optResult?.objectives ?? [])).map((o: any) => o.variable as string);
    const xLen = front[0].x.length;
    const xHeaders = Array.from({ length: xLen }, (_, i) => `x${i}`);
    const headers = [...xHeaders, ...objNames];
    const rows = front.map(sol => {
      const fVals = objNames.length > 0 ? objNames.map((_, i) => sol.f[i] ?? '') : sol.f;
      return [...sol.x, ...fVals].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const name = selectedModel?.content?.metadata?.name || 'opt';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${name}_opt.csv`;
    a.click();
    message.success(t('sim.msg.dl_opt_csv', { n: front.length }));
  };

  // ── import Pareto front from CSV text ────────────────────────────────────────

  const importParetoFromCSV = (csvText: string) => {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) { message.warning(t('sim.msg.csv_empty')); return; }

    const headers = lines[0].split(',').map(h => h.trim());
    const xIndices: number[] = [];
    const fIndices: number[] = [];
    headers.forEach((h, i) => {
      if (/^x\d+$/.test(h)) xIndices.push(i);
      else fIndices.push(i);
    });

    if (xIndices.length === 0) {
      message.warning(t('sim.msg.csv_no_x_cols'));
      return;
    }

    const imported: Array<{ x: number[]; f: number[] }> = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(v => v.trim());
      if (row.length < headers.length) continue;
      const x = xIndices.map(idx => parseFloat(row[idx]));
      const f = fIndices.map(idx => parseFloat(row[idx]));
      if (x.some(Number.isNaN) || f.some(Number.isNaN)) continue;
      imported.push({ x, f });
    }

    if (imported.length === 0) { message.warning(t('sim.msg.csv_no_valid')); return; }

    const existingFront: any[] = optResult?.pareto_front ?? storedOptResult?.pareto_front ?? [];
    const merged = [...existingFront, ...imported];
    const objectivesMeta = optResult?.objectives
      ?? objectives.map(o => ({ variable: o.variable, direction: o.direction }));

    setOptResult({
      ...(optResult || {}),
      pareto_front: merged,
      n_solutions: merged.length,
      objectives: objectivesMeta,
      method: optResult?.method || 'nsga2',
      best_x: merged[0]?.x,
      best_f: merged[0]?.f,
    });
    setWarmStartEnabled(true);
    message.success(t('sim.msg.import_pareto_done', { n: imported.length, total: merged.length }));
  };

  const warmStartDirty = lastRunSignature !== null
    && buildProblemSignature(objectives, constraints, inputEvents) !== lastRunSignature;

  return {
    // state
    optRunning, optResult,       setOptResult,
    storedOptResult,             setStoredOptResult,
    warmStartEnabled,            setWarmStartEnabled,
    warmStartDirty,
    optCurGen, optTotalGen,
    optLogs, optHistory,
    optElapsed, optMethod,
    // handlers
    startOptimization,
    cancelOptimization,
    stopOptJobs,
    downloadModelYAML,
    exportOptCSV,
    importParetoFromCSV,
  };
}
