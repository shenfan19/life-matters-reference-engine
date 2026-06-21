// optUtils.test.ts — "忠诚性测试" (faithfulness test, ADR 0112)
//
// buildOptInputEventsFromYAML / buildOptSchedules are an independent
// re-implementation (in TS) of the same optimizer.startpoint.schedules
// semantics that optimizer_engine.py parses in Python. If an unedited
// round-trip through these two functions does not reproduce the original
// YAML, the GUI silently sends a different search space to the optimizer
// than what the model file defines and what the CLI would use.
//
// This test replays that round-trip against real T1-T4 fixtures and
// compares the result to the YAML source with deepEqual (not string
// comparison, so JSON key order doesn't cause false positives).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { load as yamlLoad } from 'js-yaml';
import { buildOptInputEventsFromYAML, buildOptSchedules } from './optUtils';

const FIXTURES_DIR = resolve(__dirname, '../../../../models/test');

function loadStartpointSchedules(fileName: string): any[] {
  const text = readFileSync(resolve(FIXTURES_DIR, fileName), 'utf8');
  const data = yamlLoad(text) as any;
  return data.optimizer.startpoint.schedules;
}

function roundTrip(schedules: any[]): any[] {
  const activeVars = new Set(schedules.map((s: any) => s.variable));
  const events = buildOptInputEventsFromYAML(schedules);
  return buildOptSchedules(events, activeVars);
}

/**
 * Normalizes two known-harmless gaps before comparing, both confirmed via
 * optimizer_engine.py to be semantically inert (not bugs, but not guaranteed
 * either — see ADR 0112):
 *  - missing time_start/time_end defaults to "08:00" on both the frontend
 *    (normalizeTimeInterval) and the backend (_build_schedule_events), so
 *    omitted vs. explicit "08:00" decode identically.
 *  - a `days` list covering all 7 days is equivalent to omitting `days`
 *    entirely (apply_schedules treats both as "no day filter").
 * Anything else (e.g. optimize.date_range) is left untouched — a real
 * divergence there must still fail the test.
 */
function normalizeForComparison(schedules: any[]): any[] {
  return schedules.map(({ days, ...rest }: any) => {
    const out: any = { ...rest };
    out.time_start = out.time_start ?? '08:00';
    out.time_end = out.time_end ?? out.time_start;
    const isFullWeek = Array.isArray(days) && new Set(days).size === 7;
    if (days !== undefined && !isFullWeek) out.days = days;
    return out;
  });
}

describe('opt startpoint.schedules round-trip faithfulness (T1-T4)', () => {
  it.each([
    ['T1 — value bounds', 'test_opt_t1_single.yaml'],
    ['T2 — time window', 'test_opt_t2.yaml'],
    ['T3 — days pool', 'test_opt_t3.yaml'],
    ['T4 — date range', 'test_opt_t4.yaml'],
  ])('%s (%s) round-trips losslessly', (_label, fileName) => {
    const original = loadStartpointSchedules(fileName);
    const reconstructed = roundTrip(original);
    expect(normalizeForComparison(reconstructed)).toEqual(normalizeForComparison(original));
  });
});
