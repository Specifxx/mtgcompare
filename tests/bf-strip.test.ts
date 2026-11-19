// The Black Friday strip's pure half (src/lib/bf-strip.ts): its dates, and the history cue's honesty rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bfStripOn, lowCue, lowCueText, MIN_CUE_DAYS, type HistoryDay } from "../src/lib/bf-strip";
import { BANNED_COPY } from "../src/lib/copy-rules";

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
function series(from: string, values: (number | null)[]): HistoryDay[] {
  const d0 = Date.parse(`${from}T00:00:00Z`);
  return values.map((cents, i) => ({ day: new Date(d0 + i * 86_400_000).toISOString().slice(0, 10), cents }));
}

test("the strip is up through 1 Dec 2026 (the day after Cyber Monday), then gone", () => {
  assert.equal(bfStripOn("2026-11-24"), true);
  assert.equal(bfStripOn("2026-11-27"), true);
  assert.equal(bfStripOn("2026-12-01"), true);
  assert.equal(bfStripOn("2026-12-02"), false);
});

test("no cue under MIN_CUE_DAYS priced days, or without a price today", () => {
  assert.equal(lowCue(series("2026-11-10", Array(MIN_CUE_DAYS - 1).fill(10000)), 9000, "2026-11-24"), null);
  const gaps = series("2026-10-01", [...Array(20).fill(null), ...Array(MIN_CUE_DAYS - 1).fill(10000)]);
  assert.equal(lowCue(gaps, 9000, "2026-11-24"), null);
  assert.equal(lowCue(series("2026-10-01", Array(40).fill(10000)), null, "2026-11-24"), null);
});

test("a short history names its first day, never '90 days'", () => {
  const cue = lowCue(series("2026-10-23", Array(30).fill(12000)), 11000, "2026-11-24")!;
  assert.equal(cue.kind, "lowest");
  assert.equal(cue.full, false);
  assert.equal(lowCueText(cue, fmt, "2026-11-24"), "Lowest price since 23 Oct");
});

test("90 days of history may say '90 days'", () => {
  const cue = lowCue(series("2026-08-01", Array(116).fill(12000)), 12000, "2026-11-24")!;
  assert.equal(cue.kind, "lowest");
  assert.equal(cue.full, true);
  assert.equal(lowCueText(cue, fmt, "2026-11-24"), "Lowest price in 90 days");
});

test("above the low: the low's real price and the newest day it held", () => {
  const cue = lowCue(series("2026-08-01", [...Array(100).fill(12000), 9999, 9999, ...Array(14).fill(12500)]), 12500, "2026-11-24")!;
  assert.equal(cue.kind, "low");
  assert.equal(cue.lowCents, 9999);
  assert.equal(lowCueText(cue, fmt, "2026-11-24"), "90-day low $99.99 on 10 Nov");
  const short = lowCue(series("2026-10-23", [...Array(20).fill(12000), 9999, ...Array(9).fill(12500)]), 12500, "2026-11-24")!;
  assert.equal(lowCueText(short, fmt, "2026-11-24"), "Low since 23 Oct: $99.99 on 12 Nov");
});

test("prices older than 90 days never count", () => {
  const cue = lowCue(series("2026-07-01", [500, ...Array(146).fill(12000)]), 12000, "2026-11-24")!;
  assert.equal(cue.kind, "lowest");
});

test("no cue text is a banned history or urgency claim", () => {
  const texts = [
    lowCueText(lowCue(series("2026-08-01", Array(116).fill(12000)), 12000, "2026-11-24")!, fmt, "2026-11-24"),
    lowCueText(lowCue(series("2026-10-23", Array(30).fill(12000)), 11000, "2026-11-24")!, fmt, "2026-11-24"),
    lowCueText(lowCue(series("2026-08-01", [...Array(100).fill(12000), 9999, ...Array(15).fill(12500)]), 12500, "2026-11-24")!, fmt, "2026-11-24"),
  ];
  for (const t of texts) assert.equal(BANNED_COPY.test(t), false, t);
});
