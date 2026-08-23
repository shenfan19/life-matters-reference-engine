// useSession.ts — per-model localStorage session storage + refs
//
// Owns: MODEL_SESSION_KEY, readMS, writeMS, initModelSessions,
//       modelSessionsRef, sessionReadyRef
//
// Exposes: persistSession, clearSession, getSession

import { useRef } from 'react';
import type { ModelSession } from '../../types';
import { PLAN_COLORS } from './simUtils';

const MODEL_SESSION_KEY = 'lm_model_sessions';

export const readMS = (): Record<string, ModelSession> => {
  try { return JSON.parse(localStorage.getItem(MODEL_SESSION_KEY) || '{}'); } catch { return {}; }
};

export const writeMS = (sessions: Record<string, ModelSession>): void => {
  try { localStorage.setItem(MODEL_SESSION_KEY, JSON.stringify(sessions)); } catch {}
};

// Initialize session map from localStorage; migrate legacy global inputEvents on first run.
export function initModelSessions(): Record<string, ModelSession> {
  const sessions = readMS();

  // Migrate legacy sim_persist → per-model session
  try {
    const sp = JSON.parse(localStorage.getItem('sim_persist') || 'null');
    if (sp?.selectedKey && sp.inputEvents?.length && !sessions[sp.selectedKey]) {
      sessions[sp.selectedKey] = {
        inputEvents: sp.inputEvents,
        optInputEvents: [],
        plans: [{ id: 'plan-1', label: '方案 1', color: PLAN_COLORS[0], inputEvents: sp.inputEvents }],
        activePlanId: 'plan-1',
        simStartDate: sp.simStartDate || '2026-01-01',
        simEndDate: sp.simEndDate || '2026-12-31',
        stepValue: sp.stepValue ?? 1,
        stepUnit: sp.stepUnit ?? 'hour',
        optStepValue: sp.stepValue ?? 1,
        optStepUnit: sp.stepUnit ?? 'hour',
        simRuns: 1,
        mcSeed: null,
        optMcRuns: 1,
        optMcSeed: null,
        objectives: [], constraints: [],
        optAlgo: 'NSGA-II', optPop: 50, optGen: 80,
        optResult: null,
      };
    }
  } catch {}

  // Migrate existing sessions: ensure inputEvents carry opt field defaults
  for (const key of Object.keys(sessions)) {
    const s = sessions[key] as any;
    if (Array.isArray(s.inputEvents)) {
      s.inputEvents = s.inputEvents.map((ev: any) => ({
        optimizeValue: false, valueBounds: [0, 1],
        optimizeTime: false, optimizeDays: false, optimizeDateRange: false,
        ...ev,
      }));
    }
  }
  return sessions;
}

export function useSession() {
  const modelSessionsRef = useRef<Record<string, ModelSession>>(initModelSessions());
  // Guards against overwriting a restored session with stale initial-state values
  // before the model has finished loading.
  const sessionReadyRef = useRef(false);

  const persistSession = (key: string, session: ModelSession) => {
    modelSessionsRef.current[key] = session;
    const all = readMS();
    all[key] = session;
    writeMS(all);
  };

  const clearSession = (key: string) => {
    delete modelSessionsRef.current[key];
    const all = readMS();
    delete all[key];
    writeMS(all);
  };

  const getSession = (key: string): ModelSession | null =>
    modelSessionsRef.current[key] ?? null;

  return { modelSessionsRef, sessionReadyRef, persistSession, clearSession, getSession };
}
