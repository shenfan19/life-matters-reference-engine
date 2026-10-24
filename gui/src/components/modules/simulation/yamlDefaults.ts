// What a model's file says about the window of a simulation: dates and step. Used where a module starts a model
// for the first time, and by the optimization module, whose step defaults to the simulation's.

import type { StepUnit } from '../../../types';

export const DEFAULT_START = '2026-01-01';
export const DEFAULT_END = '2026-12-31';

const totalSecondsToEndDate = (startDate: string, totalSec: number): string => {
  const d = new Date(startDate + 'T00:00:00');
  d.setSeconds(d.getSeconds() + Math.round(totalSec));
  return d.toISOString().slice(0, 10);
};

export const toStepUnit = (u: string): StepUnit => {
  if (u === 'day') return 'day';
  if (u === 'hour') return 'hour';
  if (u === 'minute') return 'minute';
  return 'day';
};

export interface SimWindow {
  simStartDate: string;
  simEndDate: string;
  stepValue: number;
  stepUnit: StepUnit;
}

// `sim` is the model's simulation block, or undefined when it has none.
export function resolveSimWindow(sim: any): SimWindow {
  if (!sim) return { simStartDate: DEFAULT_START, simEndDate: DEFAULT_END, stepValue: 1, stepUnit: 'hour' };
  if (sim.start_date && sim.end_date) {
    // simulation.step_size: {value, unit} is the current YAML format (see model.md).
    // Legacy flat sim.step / sim.step_unit kept as fallback for older files.
    const stepSize = sim.step_size;
    const stepValue = stepSize?.unit ? (stepSize.value ?? 1) : (sim.step ?? 1);
    const stepUnit = stepSize?.unit ? toStepUnit(String(stepSize.unit)) : toStepUnit(String(sim.step_unit || 'hour'));
    return { simStartDate: String(sim.start_date), simEndDate: String(sim.end_date), stepValue, stepUnit };
  }
  const UNIT_SEC: Record<string, number> = { minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
  const timeUnit = String(sim.time_unit || 'hour').toLowerCase();
  const rawStep = sim.step_size ?? 1;
  const totalSec = (sim.total_time ?? 365) * rawStep * (UNIT_SEC[timeUnit] ?? 3600);
  return {
    simStartDate: DEFAULT_START, simEndDate: totalSecondsToEndDate(DEFAULT_START, totalSec),
    stepValue: rawStep, stepUnit: toStepUnit(timeUnit),
  };
}
