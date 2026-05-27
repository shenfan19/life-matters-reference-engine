import React, { useState, useRef } from 'react';
import type { InputEvent, ModelSession } from '../../types';

export const PLAN_COLORS = ['#e53935', '#1e88e5', '#ff7043', '#7b1fa2', '#0097a7', '#558b2f'];

// Expand "HH:MM~HH:MM" + opt_step to discrete time slot list.
function expandTimeWindow(window: string, optStep = '1h'): string[] {
  const [s, e] = window.split('~').map(p => p.trim());
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  const step = optStep === '15min' ? 15 : 60;
  const slots: string[] = [];
  for (let t = sh * 60 + sm; t <= eh * 60 + em; t += step)
    slots.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  return slots;
}

// Converts a Pareto solution x-vector back to inputEvents.
// Handles list-format inputs (T1–T4) and legacy regimen: format.
// x vector layout per entry: [value?, time_slot_idx?, pattern_idx?, day_offset?]
export function xToInputEvents(x: number[], optimizerConfig: any, baseEvents: InputEvent[]): InputEvent[] {
  const result = baseEvents.map(ev => ({ ...ev }));
  const DAY_MAP: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

  if (Array.isArray(optimizerConfig?.inputs)) {
    let xi = 0;
    for (const inp of optimizerConfig.inputs as any[]) {
      if (!inp.optimize) continue;
      let idx = result.findIndex(ev =>
        ev.variable === inp.variable &&
        (inp.time_window ? true : ev.time === (inp.time ?? ev.time))
      );
      // If no matching sim event exists, create one for this plan
      if (idx === -1) {
        result.push({
          id: `opt-gen-${inp.variable}-${inp.time ?? 'any'}`,
          variable: inp.variable, label: inp.label || inp.variable,
          time: inp.time ?? '08:00', timeEnabled: !!inp.time,
          value: 0, daysEnabled: false, days: [true,true,true,true,true,true,true],
          validRangeEnabled: false, validStart: '', validEnd: '',
        });
        idx = result.length - 1;
      }
      // T1: value
      if (Array.isArray(inp.optimize.value)) {
        if (idx >= 0 && xi < x.length) result[idx] = { ...result[idx], value: x[xi] };
        xi++;
      }
      // T2: time slot
      if (inp.optimize.time && inp.time_window) {
        const slots = expandTimeWindow(inp.time_window, inp.opt_step ?? '1h');
        const si = Math.max(0, Math.min(slots.length - 1, Math.round(x[xi] ?? 0)));
        if (idx >= 0) result[idx] = { ...result[idx], time: slots[si] };
        xi++;
      }
      // T3: day pattern
      if (inp.optimize.days && Array.isArray(inp.days_options)) {
        const pi = Math.max(0, Math.min(inp.days_options.length - 1, Math.round(x[xi] ?? 0)));
        if (idx >= 0) {
          const daysArr = Array(7).fill(false);
          for (const d of (inp.days_options[pi] as string[])) if (DAY_MAP[d] !== undefined) daysArr[DAY_MAP[d]] = true;
          result[idx] = { ...result[idx], days: daysArr, daysEnabled: true };
        }
        xi++;
      }
      // T4a: date start offset
      if (inp.optimize.date_start && inp.date_start_window) {
        const wStart = inp.date_start_window.split('~')[0].trim();
        const offset = Math.max(0, Math.round(x[xi] ?? 0));
        if (idx >= 0) {
          const d = new Date(wStart); d.setDate(d.getDate() + offset);
          result[idx] = { ...result[idx], validStart: d.toISOString().slice(0, 10), validRangeEnabled: true };
        }
        xi++;
      }
      // T4b: date end offset
      if (inp.optimize.date_end && inp.date_end_window) {
        const wStart = inp.date_end_window.split('~')[0].trim();
        const offset = Math.max(0, Math.round(x[xi] ?? 0));
        if (idx >= 0) {
          const d = new Date(wStart); d.setDate(d.getDate() + offset);
          result[idx] = { ...result[idx], validEnd: d.toISOString().slice(0, 10), validRangeEnabled: true };
        }
        xi++;
      }
    }
  } else if (optimizerConfig?.regimen) {
    // Legacy regimen: format
    const varName = optimizerConfig.regimen.variable || '';
    (optimizerConfig.regimen.events || []).forEach((ev: any, i: number) => {
      if (i >= x.length) return;
      const idx = result.findIndex(r => r.variable === varName && r.time === ev.time);
      if (idx >= 0) result[idx] = { ...result[idx], value: x[i] };
    });
  }
  return result;
}

export function useResize(initial: number, min = 150, max = 700, direction: 'right' | 'left' = 'right') {
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

export const API_BASE = '/api';

const SIM_PERSIST_KEY = 'sim_persist';
export const readSP = (): any => { try { return JSON.parse(localStorage.getItem(SIM_PERSIST_KEY) || 'null'); } catch { return null; } };
export const writeSP = (data: object): void => { try { localStorage.setItem(SIM_PERSIST_KEY, JSON.stringify(data)); } catch {} };

const MODEL_SESSION_KEY = 'lm_model_sessions';
export const readMS = (): Record<string, ModelSession> => { try { return JSON.parse(localStorage.getItem(MODEL_SESSION_KEY) || '{}'); } catch { return {}; } };
export const writeMS = (sessions: Record<string, ModelSession>): void => { try { localStorage.setItem(MODEL_SESSION_KEY, JSON.stringify(sessions)); } catch {} };

// Initialize session map from localStorage; migrate legacy global inputEvents on first run.
export function initModelSessions(): Record<string, ModelSession> {
  const sessions = readMS();
  const sp = readSP();
  if (sp?.selectedKey && sp.inputEvents?.length && !sessions[sp.selectedKey]) {
    sessions[sp.selectedKey] = {
      inputEvents: sp.inputEvents,
      plans: [{ id: 'plan-1', label: '方案 1', color: PLAN_COLORS[0], inputEvents: sp.inputEvents }],
      activePlanId: 'plan-1',
      simStartDate: sp.simStartDate || '2026-01-01',
      simEndDate: sp.simEndDate || '2026-12-31',
      stepValue: sp.stepValue ?? 1,
      stepUnit: sp.stepUnit ?? 'hour',
      objectives: [], constraints: [],
      optAlgo: 'NSGA-II', optPop: 50, optGen: 80,
    };
  }
  // Migrate existing sessions: ensure inputEvents carry opt field defaults
  for (const key of Object.keys(sessions)) {
    const s = sessions[key] as any;
    if (Array.isArray(s.inputEvents)) {
      s.inputEvents = s.inputEvents.map((ev: any) => ({
        optimizeValue: false, valueBounds: [0, 1],
        optimizeTime: false, optimizeDays: false,
        optimizeDateStart: false, optimizeDateEnd: false,
        ...ev,
      }));
    }
  }
  return sessions;
}
