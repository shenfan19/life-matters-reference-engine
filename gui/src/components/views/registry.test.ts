import { describe, expect, it } from 'vitest';
import { getView, railViews } from './registry';

describe('view registry', () => {
  it('finds the built-in views in the folder and orders the rail buttons', () => {
    expect(railViews().map(v => v.id)).toEqual(['intro', 'simulation', 'optimization']);
  });

  it('registers the model editor without a rail button of its own', () => {
    const builder = getView('builder');
    expect(builder).toBeDefined();
    expect(builder?.icon).toBeUndefined();
  });

  it('answers undefined for an unknown view', () => {
    expect(getView('nope')).toBeUndefined();
  });
});
