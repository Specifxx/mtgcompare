// Small, dependency-free statistics primitives. The codebase has ad-hoc mean/
// median/stdev buried privately in a few places (e.g. lib/ebay); this centralises
// the ones the rise-predictor needs (z-scores, percentile rank, Spearman) as pure,
// unit-testable functions. All operate on plain number[]; NaN/empty inputs degrade
// to safe neutral values rather than throwing.

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Population standard deviation.
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

// Z-score of each value against the array's own mean/stdev. If stdev is 0 (all
// equal), every z is 0 — a flat feature contributes nothing to a weighted sum.
export function zScores(xs: number[]): number[] {
  const m = mean(xs);
  const sd = stdev(xs);
  if (sd === 0) return xs.map(() => 0);
  return xs.map((x) => (x - m) / sd);
}

// Percentile rank (0–100) of each value within the array — 100 = highest. Uses the
// "≤" definition (fraction of values at or below each), so ties share a rank.
export function percentileRanks(xs: number[]): number[] {
  const n = xs.length;
  if (n <= 1) return xs.map(() => 100);
  return xs.map((x) => {
    let le = 0;
    for (const y of xs) if (y <= x) le++;
    return Math.round((le / n) * 100);
  });
}

// Fractional ranks (1 = smallest … n = largest), average-tie-corrected — the input
// to Spearman. Returned in the SAME order as the input.
export function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avgRank = (i + j) / 2 + 1; // 1-based, averaged over the tie block
    for (let k = i; k <= j; k++) out[idx[k][1]] = avgRank;
    i = j + 1;
  }
  return out;
}

export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : clamp(num / den, -1, 1);
}

// Spearman rank correlation = Pearson on the ranks. Robust to the heavy-tailed,
// non-linear price/demand distributions here.
export function spearman(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  return pearson(ranks(xs.slice(0, n)), ranks(ys.slice(0, n)));
}
