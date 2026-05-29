import React, { useState, useRef } from 'react';
import type { InputEvent } from '../../types';

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

// Combinations helper for T3 days_pool
function getCombinations<T>(arr: T[], n: number): T[][] {
  if (n === 0) return [[]];
  if (n > arr.length) return [];
  const result: T[][] = [];
  const combine = (start: number, combo: T[]) => {
    if (combo.length === n) { result.push([...combo]); return; }
    for (let i = start; i < arr.length; i++) { combo.push(arr[i]); combine(i + 1, combo); combo.pop(); }
  };
  combine(0, []);
  return result;
}

// Converts a Pareto solution x-vector back to inputEvents.
// Handles new schedules-format (T1–T4) and legacy inputs/regimen formats.
// x vector layout per entry: [value?, time_slot_idx?, pattern_idx?, day_offset?]
export function xToInputEvents(x: number[], optimizerConfig: any, baseEvents: InputEvent[]): InputEvent[] {
  const result = baseEvents.map(ev => ({ ...ev }));
  const DAY_MAP: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

  // New schedules format: optimizer.schedules entries with optimize: sub-block
  const scheduleOptEntries = Array.isArray(optimizerConfig?.schedules)
    ? (optimizerConfig.schedules as any[]).filter((e: any) => e.optimize)
    : [];

  if (scheduleOptEntries.length > 0) {
    let xi = 0;
    for (const inp of scheduleOptEntries) {
      const opt = inp.optimize ?? {};
      let idx = result.findIndex(ev =>
        ev.variable === inp.variable && (!inp.time || ev.time === inp.time)
      );
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
      // T1: value bounds
      if (Array.isArray(opt.value)) {
        if (xi < x.length) result[idx] = { ...result[idx], value: x[xi] };
        xi++;
      }
      // T2: time slot
      if (Array.isArray(opt.time) && opt.time.length === 2) {
        const slots = expandTimeWindow(`${opt.time[0]}~${opt.time[1]}`, opt.time_step ?? '1h');
        const si = Math.max(0, Math.min(slots.length - 1, Math.round(x[xi] ?? 0)));
        result[idx] = { ...result[idx], time: slots[si] };
        xi++;
      }
      // T3: days combo
      if (opt.days_pool) {
        const n_range: [number, number] = opt.days_n ?? [1, opt.days_pool.length];
        const allPatterns: string[][] = [];
        for (let n = n_range[0]; n <= n_range[1]; n++) allPatterns.push(...getCombinations(opt.days_pool, n));
        const pi = Math.max(0, Math.min(allPatterns.length - 1, Math.round(x[xi] ?? 0)));
        if (allPatterns.length > 0) {
          const daysArr = Array(7).fill(false);
          for (const d of allPatterns[pi]) if (DAY_MAP[d] !== undefined) daysArr[DAY_MAP[d]] = true;
          result[idx] = { ...result[idx], days: daysArr, daysEnabled: true };
        }
        xi++;
      }
      // T4: date_range [[start_lo, start_hi], [end_lo, end_hi]]
      if (Array.isArray(opt.date_range) && opt.date_range.length === 2) {
        const sw = opt.date_range[0];
        const n_s = Math.round((new Date(sw[1]).getTime() - new Date(sw[0]).getTime()) / 86400000);
        const offset_s = Math.max(0, Math.min(n_s, Math.round(x[xi] ?? 0)));
        const ds = new Date(sw[0]); ds.setDate(ds.getDate() + offset_s);
        result[idx] = { ...result[idx], validStart: ds.toISOString().slice(0, 10), validRangeEnabled: true };
        xi++;
        const ew = opt.date_range[1];
        const n_e = Math.round((new Date(ew[1]).getTime() - new Date(ew[0]).getTime()) / 86400000);
        if (n_e > 0) {
          const offset_e = Math.max(0, Math.min(n_e, Math.round(x[xi] ?? 0)));
          const de = new Date(ew[0]); de.setDate(de.getDate() + offset_e);
          result[idx] = { ...result[idx], validEnd: de.toISOString().slice(0, 10) };
          xi++;
        }
      }
    }
  } else if (Array.isArray(optimizerConfig?.inputs)) {
    // Legacy inputs format
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

