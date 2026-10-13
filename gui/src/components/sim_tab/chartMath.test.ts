import { describe, expect, it } from 'vitest';
import { maxOf, minOf, valueRange } from './chartMath';

describe('valueRange', () => {
  it('finds the smallest and largest value', () => {
    expect(valueRange([3, -1, 7, 2])).toEqual({ min: -1, max: 7 });
  });

  it('handles a list far beyond the argument limit of Math.min', () => {
    const values = Array.from({ length: 600_000 }, (_, i) => i % 1000);
    expect(() => Math.min(...values)).toThrow(RangeError);
    expect(valueRange(values)).toEqual({ min: 0, max: 999 });
  });

  it('falls back to a unit range when there is nothing finite to measure', () => {
    expect(valueRange([])).toEqual({ min: 0, max: 1 });
    expect(valueRange([NaN, NaN])).toEqual({ min: 0, max: 1 });
  });
});

describe('minOf and maxOf', () => {
  it('agree with Math.min and Math.max on ordinary lists', () => {
    const values = [4, -2.5, 9, 0, 3];
    expect(minOf(values)).toBe(Math.min(...values));
    expect(maxOf(values)).toBe(Math.max(...values));
  });

  it('give Infinity and -Infinity for an empty list, as Math.min and Math.max do', () => {
    expect(minOf([])).toBe(Infinity);
    expect(maxOf([])).toBe(-Infinity);
  });

  it('handle a list far beyond the argument limit', () => {
    const values = Array.from({ length: 600_000 }, (_, i) => (i % 1000) - 500);
    expect(minOf(values)).toBe(-500);
    expect(maxOf(values)).toBe(499);
  });

  it('skip NaN entries instead of poisoning the result', () => {
    expect(minOf([3, NaN, 1])).toBe(1);
    expect(maxOf([3, NaN, 1])).toBe(3);
  });
});
