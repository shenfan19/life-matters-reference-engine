// optUtils.ts — Optimizer schedule building utilities (T1–T4)
//
// Pure functions that convert InputEvent arrays into the optimizer.schedules
// format consumed by the backend. No React state; safe to unit-test in isolation.

import type { InputEvent } from '../../types';

export const DAY_STRS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** True if any optimizer tier (T1–T4) is active for this event. */
export function hasAnyOpt(ev: InputEvent, activeInputVarNames: Set<string>): boolean {
  return (
    (ev.optimizeValue || ev.optimizeTime || ev.optimizeDays || ev.optimizeDateRange) === true
    && activeInputVarNames.has(ev.variable)
  );
}

/**
 * Build the optimizer.schedules list from the current inputEvents.
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
