// optUtils.ts — Optimizer schedule building utilities (T1–T4)
//
// Pure functions that convert InputEvent arrays into the optimizer.schedules
// format consumed by the backend, and back. No React state; safe to
// unit-test in isolation (see optUtils.test.ts).

import type { InputEvent } from '../../types';
import { normalizeTimeInterval } from './simUtils';

export const DAY_STRS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const DAY_STR_MAP: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

export function parseDaysMask(days?: string[]): boolean[] {
  if (!days?.length) return [true, true, true, true, true, true, true];
  const m = [false, false, false, false, false, false, false];
  days.forEach(d => { const i = DAY_STR_MAP[d.toLowerCase().slice(0, 3)]; if (i !== undefined) m[i] = true; });
  return m;
}

/**
 * Build editable InputEvents from a YAML optimizer.startpoint.schedules list.
 * Inverse of buildOptSchedules — round-tripping an unedited model through
 * both functions should reproduce the original schedules (see optUtils.test.ts).
 */
export function buildOptInputEventsFromYAML(schedules: any[]): InputEvent[] {
  return schedules.map((s: any, i: number) => {
    const { timeStart, timeEnd } = normalizeTimeInterval(s);
    const daysList: string[] = Array.isArray(s.days) ? s.days : [];
    const hasDays = daysList.length > 0 && daysList.length < 7;
    let validStart = s.valid_start ?? ''; let validEnd = s.valid_end ?? '';
    if (!validStart && !validEnd && Array.isArray(s.date_range) && s.date_range.length === 2) {
      validStart = String(s.date_range[0]); validEnd = String(s.date_range[1]);
    }
    // T4's own search range (optimize.date_range) also counts as "has a date
    // range" — without this, validRangeEnabled stays false and buildOptSchedules
    // silently drops the optimize.date_range block on the way back out.
    const hasT4Range = Array.isArray(s.optimize?.date_range) && s.optimize.date_range.length === 2;
    const ev: InputEvent = {
      id: `opt-yaml-${i}-${s.variable || 'v'}`, variable: s.variable || '',
      timeStart, timeEnd, value: s.value ?? 0, label: s.label || '',
      daysEnabled: hasDays, days: parseDaysMask(hasDays ? daysList : undefined),
      validRangeEnabled: !!(validStart || validEnd) || hasT4Range, validStart, validEnd,
    };
    const opt = s.optimize;
    if (opt) {
      if (Array.isArray(opt.value) && opt.value.length >= 2) { ev.optimizeValue = true; ev.valueBounds = [opt.value[0], opt.value[1]]; }
      const t2win = opt.time_start;
      if (Array.isArray(t2win) && t2win.length === 2) {
        ev.optimizeTime = true; ev.timeWindowStart = t2win[0]; ev.timeWindowEnd = t2win[1];
        if (opt.time_step) ev.timeStep = opt.time_step;
        if (Array.isArray(opt.time_end) && opt.time_end.length === 2) { ev.optimizeTimeEnd = true; ev.timeEndWindowStart = opt.time_end[0]; ev.timeEndWindowEnd = opt.time_end[1]; }
      }
      if (opt.days_pool) { ev.optimizeDays = true; ev.daysPool = opt.days_pool; if (opt.days_n) { ev.daysNMin = opt.days_n[0]; ev.daysNMax = opt.days_n[1]; } }
      if (hasT4Range) {
        ev.optimizeDateRange = true;
        ev.dateStartLo = opt.date_range[0][0]; ev.dateStartHi = opt.date_range[0][1];
        ev.dateEndLo = opt.date_range[1][0]; ev.dateEndHi = opt.date_range[1][1];
      }
    }
    return ev;
  });
}

/** True if any optimizer tier (T1–T4) is active for this event. */
export function hasAnyOpt(ev: InputEvent, activeInputVarNames: Set<string>): boolean {
  return (
    (ev.optimizeValue || ev.optimizeTime || ev.optimizeDays || ev.optimizeDateRange) === true
    && activeInputVarNames.has(ev.variable)
  );
}

/**
 * Build the optimizer.startpoint.schedules list from the current inputEvents.
 *
 * Events with any active optimization tier get an `optimize:` sub-block;
 * events without are included as fixed background inputs.
 * Events for variables not in activeInputVarNames are excluded entirely.
 *
 * Tier mapping:
 *   T1 — optimize.value:      [lo, hi] value search bounds
 *   T2 — optimize.time_start / optimize.time_end: ["HH:MM", "HH:MM"] search
 *        windows for the start and end of the interval, searched independently
 *        (ADR 0100).
 *   T3 — optimize.days_pool:  candidate day set + days_n count range
 *   T4 — optimize.date_range: [[start_lo, start_hi], [end_lo, end_hi]]
 */
export function buildOptSchedules(
  inputEvents: InputEvent[],
  activeInputVarNames: Set<string>,
): Record<string, any>[] {
  return inputEvents
    .filter(ev => activeInputVarNames.has(ev.variable))
    .map(ev => {
      const entry: Record<string, any> = {
        variable: ev.variable,
        label: ev.label || `${ev.variable} ${ev.timeStart}`,
      };

      if (hasAnyOpt(ev, activeInputVarNames)) {
        const optBlock: Record<string, any> = {};
        // T1: value bounds (only when value itself is being optimized)
        if (ev.optimizeValue && ev.valueBounds) optBlock.value = ev.valueBounds;
        else entry.value = ev.value;
        // T2: time_start search window (1-dim; time_end follows at a fixed
        // offset = timeEnd - timeStart). entry.time_start/time_end carry the
        // current values as the width template for backend decoding (ADR 0100).
        entry.time_start = ev.timeStart;
        entry.time_end = ev.timeEnd;
        if (ev.optimizeTime && ev.timeWindowStart && ev.timeWindowEnd) {
          optBlock.time_start = [ev.timeWindowStart, ev.timeWindowEnd];
          if (ev.timeStep && ev.timeStep !== '1h') optBlock.time_step = ev.timeStep;
          // time_end is searched independently within its own window
          if (ev.timeEndWindowStart && ev.timeEndWindowEnd) {
            optBlock.time_end = [ev.timeEndWindowStart, ev.timeEndWindowEnd];
          }
        }
        // T3: days-pool search
        if (ev.optimizeDays && ev.daysPool?.length) {
          optBlock.days_pool = ev.daysPool;
          optBlock.days_n = [ev.daysNMin ?? 1, ev.daysNMax ?? ev.daysPool.length];
        } else if (ev.daysEnabled) {
          entry.days = ev.days.map((v, i) => v ? DAY_STRS[i] : null).filter(Boolean);
        }
        // T4: date-range search
        if (ev.validRangeEnabled) {
          if (ev.optimizeDateRange && ev.dateStartLo && ev.dateStartHi && ev.dateEndLo && ev.dateEndHi) {
            optBlock.date_range = [[ev.dateStartLo, ev.dateStartHi], [ev.dateEndLo, ev.dateEndHi]];
          } else {
            entry.date_range = [ev.validStart, ev.validEnd];
          }
        }
        entry.optimize = optBlock;
      } else {
        // Fixed background input: pass through as-is
        entry.value = ev.value;
        entry.time_start = ev.timeStart;
        entry.time_end = ev.timeEnd;
        if (ev.daysEnabled) entry.days = ev.days.map((v, i) => v ? DAY_STRS[i] : null).filter(Boolean);
        if (ev.validRangeEnabled) entry.date_range = [ev.validStart, ev.validEnd];
      }

      return entry;
    });
}
