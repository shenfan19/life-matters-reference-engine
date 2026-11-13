// A small system whose readouts are its whole state, shared by the lookup tests: two coupled states, one total handle and one level handle.
export const model = {
  metadata: { name: 'water_and_tiredness_toy', lm_format_version: '1.0' },
  variables: {
    water_deficit: { type: 'state', value: 0.3, bounds: [0, 1.5] },
    tiredness: { type: 'state', value: 0.1, bounds: [0, 1] },
    fluid_in: { type: 'input', value: 0 },
    effort: { type: 'input', value: 0, bounds: [0, 1] },
    k_loss: { type: 'parameter', value: 0.05 },
  },
  equations: {
    water: { step_unit: 'hour', priority: 2, dynamics: { water_deficit: 'water_deficit + k_loss * (1 + 2 * effort) * (0.5 + water_deficit / 1.5) * step - fluid_in * 0.3' } },
    tired: { step_unit: 'hour', priority: 1, dynamics: { tiredness: 'tiredness + (0.08 * effort * (1 - tiredness) - 0.03 * tiredness * (1 + water_deficit)) * step' } },
  },
  simulation: { step_size: { value: 15, unit: 'minute' }, start_date: '2026-01-01', end_date: '2026-01-04' },
};
export const bridge = {
  bridge_version: 1, system: 'water_and_tiredness_toy', vocabulary_version: 2, step_minutes: 15,
  readouts: { hydration_deficit: { combine: 'replace', sources: [{ var: 'water_deficit', lo: 0, hi: 1.5 }] }, fatigue: { combine: 'max', sources: [{ var: 'tiredness', lo: 0, hi: 1 }] } },
  handles: { fluid_intake: ['fluid_in'], activity_load: ['effort'] }, modes: { fluid_intake: 'total', activity_load: 'level' },
};
export const spec = { readout_points: 21, handles: { fluid_intake: [0, 0.5, 1, 2], activity_load: [0, 0.5, 1] }, validate: { rollouts: 20, steps: 200, seed: 3 } };

