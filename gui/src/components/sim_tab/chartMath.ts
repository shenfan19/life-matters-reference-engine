// Plain functions behind the charts, kept free of React so that they can be tested alone.

// Smallest and largest value of a list that may hold hundreds of thousands of points. Math.min(...values)
// passes every value as an argument and throws a RangeError once the list passes the engine's argument limit,
// which a year of hourly steps with several plans and Monte Carlo repeats does.
export function valueRange(values: number[]): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : { min: 0, max: 1 };
}

// Same result as Math.min(...values) and Math.max(...values) for ordinary numbers, without the argument limit.
// An empty list gives Infinity and -Infinity, as the Math versions do, and NaN entries are skipped.
export function minOf(values: number[]): number {
  let min = Infinity;
  for (const v of values) if (v < min) min = v;
  return min;
}

export function maxOf(values: number[]): number {
  let max = -Infinity;
  for (const v of values) if (v > max) max = v;
  return max;
}
