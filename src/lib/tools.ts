// The tools' arithmetic (src/content/tools, src/components/tools): pure functions, so tests/tools.test.ts checks the numbers the pages
// print. Money is whole cents throughout; nothing here knows a price, a grading fee or a card: every input is the reader's own.

/** "12.50", "$12.50", "A$1,299", "12,50" → cents; empty or unreadable → null. */
export function parseMoney(input: string): number | null {
  const s = input.trim().replace(/[^\d.,-]/g, "");
  if (!s || /-/.test(s)) return null;
  // With both separators, the last one is the decimal point ("1.299,95", "1,299.95"); a comma alone followed by exactly two digits at
  // the end is a decimal comma ("12,50"); any other comma groups thousands.
  const decimalComma = s.includes(",") && (s.includes(".") ? s.lastIndexOf(",") > s.lastIndexOf(".") : /,\d{2}$/.test(s));
  const normal = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  if (!/^\d*(?:\.\d*)?$/.test(normal) || normal === ".") return null;
  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** A percentage the reader typed: "13.4", "13.4%" → 13.4; clamped to 0–100; unreadable → null. */
export function parsePct(input: string): number | null {
  const s = input.trim().replace(/%$/, "").trim();
  if (!s || !/^\d*(?:\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
}

// ─── Value checker ────────────────────────────────────────────────────────────

export type PricePosition = "below-cheapest" | "at-cheapest" | "below-median" | "around-median" | "above-median" | "above-cheapest";

/**
 * Where a price the reader was offered sits against today's store prices: under the cheapest in-stock store, at it (within 1%),
 * between it and the median, around the median (within 3%), or above it. Without a median (fewer than two stores in stock), only
 * against the cheapest.
 */
export function pricePosition(offerCents: number, cheapestCents: number, medianCents: number | null): PricePosition {
  const near = (a: number, b: number, pct: number) => Math.abs(a - b) <= (b * pct) / 100;
  if (near(offerCents, cheapestCents, 1)) return "at-cheapest";
  if (offerCents < cheapestCents) return "below-cheapest";
  if (medianCents == null || medianCents <= cheapestCents) return "above-cheapest";
  if (near(offerCents, medianCents, 3)) return "around-median";
  return offerCents < medianCents ? "below-median" : "above-median";
}
