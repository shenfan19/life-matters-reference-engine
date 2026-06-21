// usePlans.ts — sim plan CRUD + opt-result-to-sim-plan bridging
//
// Owns: nothing (mutates plans/inputEvents/comparedPlans via setters passed in)
// Receives: plans/activePlanId state + setters, optInputEvents, inputVars,
//   selectedModel, sessionEditedRef, set (SimulationState field setter),
//   setMode, setComparedPlans, switchCenterTab, t
// Returns: selectPlan, addPlan, removePlan, addPlansFromOpt, applyBestToSim

import { message } from 'antd';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { InputEvent, ModelFile, PlanResult, SimPlan, SimulationState } from '../../types';
import { PLAN_COLORS, xToInputEvents } from '../sim_tab/simUtils';
import { buildOptRegimens } from '../sim_tab/optUtils';

interface UsePlansParams {
  plans: SimPlan[];
  setPlans: Dispatch<SetStateAction<SimPlan[]>>;
  activePlanId: string;
  setActivePlanId: (id: string) => void;
  inputEvents: InputEvent[];
  setInputEvents: Dispatch<SetStateAction<InputEvent[]>>;
  optInputEvents: InputEvent[];
  inputVars: Array<{ name: string }>;
  selectedModel: ModelFile | null;
  sessionEditedRef: MutableRefObject<boolean>;
  set: <K extends keyof SimulationState>(key: K, val: SimulationState[K]) => void;
  setMode: (mode: 'sim' | 'opt') => void;
  setComparedPlans: Dispatch<SetStateAction<PlanResult[]>>;
  switchCenterTab: (tab: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function usePlans({
  plans, setPlans, activePlanId, setActivePlanId,
  inputEvents, setInputEvents, optInputEvents, inputVars, selectedModel,
  sessionEditedRef, set, setMode, setComparedPlans, switchCenterTab, t,
}: UsePlansParams) {
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
    sessionEditedRef.current = true;
    setPlans(prev => prev.map(p => p.id === activePlanId ? { ...p, inputEvents } : p).concat(newPlan));
    setActivePlanId(id);
  };

  const removePlan = (id: string) => {
    if (plans.length <= 1) return;
    const remaining = plans.filter(p => p.id !== id);
    sessionEditedRef.current = true;
    setPlans(remaining);
    if (activePlanId === id) {
      const next = remaining[0];
      setActivePlanId(next.id);
      setInputEvents(next.inputEvents);
    }
  };

  const addPlansFromOpt = (rows: Array<{ x: number[]; f: number[]; rank: number }>) => {
    if (rows.length === 0) return;
    // Use the current GUI optimizer config (from optInputEvents) for decoding x,
    // not the YAML optimizer block — they may differ if the user edited the startpoint in the GUI.
    const activeInputVarNames = new Set(inputVars.map(v => v.name));
    const regimens = buildOptRegimens(optInputEvents, activeInputVarNames);
    const virtualOptimizer = { startpoint: { regimens } };
    const newPlans: SimPlan[] = rows.map((row, i) => ({
      id: `pareto-${row.rank}-${Date.now()}-${i}`,
      label: `Pareto #${row.rank}`,
      color: PLAN_COLORS[(plans.length + i) % PLAN_COLORS.length],
      // Decode Pareto x using optInputEvents as base; strip opt flags so events
      // are plain sim events suitable for the Simulation tab.
      inputEvents: xToInputEvents(row.x, virtualOptimizer, optInputEvents).map(ev => ({
        ...ev,
        optimizeValue: false,
        optimizeTime: false,
        optimizeDays: false,
        optimizeDateRange: false,
      })),
    }));
    sessionEditedRef.current = true;
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

  // ── apply opt best solution to sim ───────────────────────────────────────────
  // (stays here: needs setInputEvents + setComparedPlans)
  const applyBestToSim = () => {
    const optimizer = selectedModel?.content?.optimizer;
    const bestX = optimizer?.results?.recommended?.x;
    if (!optimizer || !Array.isArray(bestX) || bestX.length === 0) {
      message.warning(t('sim.msg.no_best_solution')); return;
    }
    setInputEvents(prev => xToInputEvents(bestX, optimizer, prev));
    set('status', 'idle'); set('progress', 0); set('currentStep', 0);
    setComparedPlans([]);
    setMode('sim');
    switchCenterTab('simulation');
  };

  return { selectPlan, addPlan, removePlan, addPlansFromOpt, applyBestToSim };
}
