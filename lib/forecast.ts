// Monthly usage forecast.
//
// Method chosen by backtesting on the real Glucose history (hide a fiscal
// year, forecast it, compare): "seasonal index × level of the last 12
// months" missed by ~3% per month in both FY2568 and FY2569. A straight
// trend line did worse (4-8%) — Glucose usage is essentially flat, so
// extrapolating a slope mostly adds noise.
//
//   ≥ 24 months: value = (mean of last 12 months) × seasonal index of that
//                calendar month (estimated from all whole years available)
//   < 24 months: value = mean of the last 6 months (flat). With one year of
//                data a seasonal swing can't be told apart from growth, so
//                no pattern is projected.
//
// Band = ±1.28 × the standard deviation of one-step-ahead errors on the
// history (≈ 80% range). It only knows what is in the series: a new ward,
// a ward closing or a device swap will not be anticipated.

export type MonthPoint = { year: number; month: number; value: number };
export type ForecastPoint = { year: number; month: number; value: number; low: number; high: number };
export type Forecast = {
  points: ForecastPoint[];
  method: "seasonal" | "flat";
  /** Backtest: mean absolute % error forecasting the last 12 known months
   * from the data before them. null when history is too short to test. */
  backtestMape: number | null;
};

const idx = (p: { year: number; month: number }) => p.year * 12 + (p.month - 1);
const fromIdx = (i: number) => ({ year: Math.floor(i / 12), month: (i % 12) + 1 });
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

/** Fills gaps so index arithmetic is by calendar month (missing → null). */
function toSeries(history: MonthPoint[]) {
  const h = [...history].sort((a, b) => idx(a) - idx(b));
  const start = idx(h[0]);
  const vals: (number | null)[] = new Array(idx(h[h.length - 1]) - start + 1).fill(null);
  for (const p of h) vals[idx(p) - start] = p.value;
  return { start, vals };
}

function seasonalIndex(start: number, vals: (number | null)[]): number[] {
  const n = Math.floor(vals.length / 12) * 12;          // whole years, most recent
  const window = vals.slice(vals.length - n);
  const wStart = start + vals.length - n;
  const level = mean(window.filter((v): v is number => v != null));
  const sums = new Array(12).fill(0), counts = new Array(12).fill(0);
  window.forEach((v, i) => { if (v != null) { const m = (wStart + i) % 12; sums[m] += v / level; counts[m]++; } });
  const idxs = sums.map((s, m) => (counts[m] ? s / counts[m] : 1));
  const norm = mean(idxs);
  return idxs.map((s) => s / norm);
}

/** Predict months [from, from+horizon) using only vals before `from`. */
function predict(start: number, vals: (number | null)[], horizon: number) {
  const known = vals.filter((v): v is number => v != null);
  if (known.length >= 24) {
    const season = seasonalIndex(start, vals);
    const recent = vals.slice(-12).filter((v): v is number => v != null);
    const recentIdx = vals.slice(-12).map((v, i) => (v != null ? (start + vals.length - 12 + i) % 12 : -1)).filter((m) => m >= 0);
    // Level = last 12 months with the seasonal swing taken out.
    const level = mean(recent.map((v, i) => v / season[recentIdx[i]]));
    return { method: "seasonal" as const, values: Array.from({ length: horizon }, (_, k) => level * season[(start + vals.length + k) % 12]) };
  }
  const level = mean(known.slice(-6));
  return { method: "flat" as const, values: new Array(horizon).fill(level) };
}

export function forecastMonthly(history: MonthPoint[], horizon = 12): Forecast | null {
  if (history.length < 6) return null;
  const { start, vals } = toSeries(history);

  // One-step-ahead errors over the history → band width.
  const errs: number[] = [];
  for (let t = 6; t < vals.length; t++) {
    const actual = vals[t];
    if (actual == null) continue;
    errs.push(actual - predict(start, vals.slice(0, t), 1).values[0]);
  }
  const sd = errs.length > 2 ? Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length) : mean(vals.filter((v): v is number => v != null)) * 0.1;

  // Backtest the last 12 months (needs ≥ 12 months before them).
  let backtestMape: number | null = null;
  if (vals.length >= 24) {
    const train = vals.slice(0, -12), test = vals.slice(-12);
    const pred = predict(start, train, 12).values;
    const apes = test.map((a, i) => (a ? Math.abs(pred[i] - a) / a : null)).filter((x): x is number => x != null);
    backtestMape = apes.length ? mean(apes) * 100 : null;
  }

  const { method, values } = predict(start, vals, horizon);
  const lastIdx = start + vals.length - 1;
  const points = values.map((v, k) => ({
    ...fromIdx(lastIdx + 1 + k),
    value: Math.round(Math.max(0, v)),
    low: Math.round(Math.max(0, v - 1.28 * sd)),
    high: Math.round(v + 1.28 * sd),
  }));
  return { points, method, backtestMape };
}

/** Least-squares slope as % of the series mean, per month — "how fast is
 * this ward drifting", independent of its size. */
export function trendPctPerMonth(values: (number | null)[]): number | null {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 4) return null;
  const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
  let num = 0, den = 0;
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  return den && my ? (num / den / my) * 100 : null;
}
