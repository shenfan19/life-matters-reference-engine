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
//   + stopAllJobs + downloadModelYAML + saveResultsToFile

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
  t: (key: string) => string;
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
        message.error(data.detail || data.error || '优化启动失败');
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
            message.success(`优化完成，${sd.result?.n_solutions ?? 0} 个 Pareto 解`);
          } else if (sd.status === 'failed') {
            clearInterval(optPollRef.current!); optPollRef.current = null;
            setOptRunning(false); setRunningModelKey(null);
            message.error(sd.error || '优化失败');
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

  const downloadModelYAML = async (flattenImports = false) => {
    if (!selectedModel?.key || !optResult) return;
    const modelKey = selectedModel.key.replace(/^models\//, '');
    try {
      const r = await fetch(`${API_BASE}/optimizer/export-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_key: modelKey, results: buildResults(optElapsed), flatten_imports: flattenImports }),
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

  const saveResultsToFile = async () => {
    if (!selectedModel?.key || !optResult) { message.warning('无结果可保存'); return; }
    const modelKey = selectedModel.key.replace(/^models\//, '');
    try {
      const exportResp = await fetch(`${API_BASE}/optimizer/export-model`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_key: modelKey, results: buildResults(optElapsed) }),
      }).then(r => r.json());
      if (!exportResp.success || !exportResp.text) { message.error('生成 YAML 失败'); return; }
      const saveResp = await fetch(`${API_BASE}/file-raw/${modelKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: exportResp.text }),
      }).then(r => r.json());
      if (saveResp.success) {
        message.success('结果已保存到模型文件');
        setStoredOptResult(optResult);
      } else {
        message.error('保存失败：' + (saveResp.detail || ''));
      }
    } catch (e: any) { message.error(e.message); }
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
    saveResultsToFile,
  };
}
