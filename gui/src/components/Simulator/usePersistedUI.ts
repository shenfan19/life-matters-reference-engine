// usePersistedUI.ts — localStorage persistence effect cluster (sessionStorage-ish "SP" blob
// for global UI state, per-model "MS" sessions via persistSession, mount-time restore)
//
// Owns: initialSelectedKey ref (restore-once-on-tree-load bookkeeping)
// Receives: everything these effects read or write — SimulationState + setState,
//   file tree state, session refs/persistSession, and every per-model field that
//   gets snapshotted into a ModelSession (inputEvents/plans/opt config/etc.)
// Returns: nothing — pure effect orchestration, no derived value

import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type {
  DataNode, InputEvent, ModelFile, ModelSession, SimPlan, SimulationState,
} from '../../types';
import { API_BASE, readSP, writeSP } from '../sim_tab/simUtils';

type CenterTab = 'intro' | 'simulation' | 'optimization' | 'builder';

interface UsePersistedUIParams {
  state: SimulationState;
  setState: Dispatch<SetStateAction<SimulationState>>;
  storyTree: DataNode[];
  setExpandedKeys: Dispatch<SetStateAction<React.Key[]>>;
  expandedKeys: React.Key[];
  loadFileTree: () => Promise<void>;
  loadFileContent: (filePath: string, opts?: { preserveTab?: boolean }) => Promise<ModelFile | null>;
  selectedKey: string | null;
  sessionReadyRef: MutableRefObject<boolean>;
  sessionEditedRef: MutableRefObject<boolean>;
  persistSession: (key: string, session: ModelSession) => void;
  inputEvents: InputEvent[];
  optInputEvents: InputEvent[];
  plans: SimPlan[];
  activePlanId: string;
  objectives: Array<{ variable: string; direction: 'minimize' | 'maximize' }>;
  constraints: Array<{ variable: string; op: '≤' | '≥'; value: number }>;
  optAlgo: 'NSGA-II' | 'MOEA/D' | 'l-bfgs-b' | 'nelder-mead';
  optPop: number;
  optGen: number;
  optSeed: number;
  optResult: any;
  regroupXKey: string;
  regroupYKey: string;
  regroupGroupKey: string;
  mode: string;
  openSections: Set<string>;
  sectionWeights: Record<string, number>;
  setRunOutputVars: Dispatch<SetStateAction<string[]>>;
  setOutputWarnings: Dispatch<SetStateAction<string[]>>;
  setCenterTab: (tab: CenterTab) => void;
}

export function usePersistedUI({
  state, setState, storyTree, setExpandedKeys, expandedKeys, loadFileTree, loadFileContent,
  selectedKey, sessionReadyRef, sessionEditedRef, persistSession,
  inputEvents, optInputEvents, plans, activePlanId,
  objectives, constraints, optAlgo, optPop, optGen, optSeed, optResult,
  regroupXKey, regroupYKey, regroupGroupKey,
  mode, openSections, sectionWeights,
  setRunOutputVars, setOutputWarnings, setCenterTab,
}: UsePersistedUIParams) {
  const { status, currentStep, progress, totalSteps, sessionId, sessionSeed, simulationData, dataPerRun,
    simStartDate, simEndDate, stepValue, stepUnit, optStepValue, optStepUnit, simRuns, mcSeed,
    optMcRuns, optMcSeed } = state;

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
      inputEvents, optInputEvents, plans, activePlanId,
      simStartDate, simEndDate, stepValue, stepUnit, optStepValue, optStepUnit, simRuns, mcSeed,
      optMcRuns, optMcSeed,
      objectives, constraints, optAlgo, optPop, optGen, optSeed,
      optResult,
      regroupXKey, regroupYKey, regroupGroupKey,
      userEdited: sessionEditedRef.current,
    };
    persistSession(selectedKey, session);
  }, [selectedKey, inputEvents, optInputEvents, plans, activePlanId, simStartDate, simEndDate, stepValue, stepUnit, optStepValue, optStepUnit, simRuns, mcSeed, optMcRuns, optMcSeed, objectives, constraints, optAlgo, optPop, optGen, optSeed, optResult, regroupXKey, regroupYKey, regroupGroupKey]);

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
}
