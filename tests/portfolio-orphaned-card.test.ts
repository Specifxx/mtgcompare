import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SRC = "src/lib/collection-server.ts";

// ─────────────────────────────────────────────────────────────────────────────
// RiftCompare's tests/portfolio-orphaned-card.test.ts and
// portfolio-history-date-rehydrate.test.ts, ported in wave 2 (2026-10-03).
//
// A live RiftCompare /portfolio crash (2026-09-01): a collection row whose card
// no longer resolves made ONE bad row 500 the entire page. OP Compare reads the
// rows with no card join and resolves each against the cached catalogue, so a
// card TCGplayer withdrew (or a restore that did not carry every Card row)
// comes back as `card: null` — and must be dropped before use, everywhere.
//
// The history read is from JSON files, so days arrive as YYYYMMDD numbers, never
// Dates: priceMapFromPoints turns them into ms at the one place they are read,
// so no caller trusts a Date a cache could have turned into a string.
// ─────────────────────────────────────────────────────────────────────────────

test("getPortfolio filters out rows whose card didn't resolve, before using them", () => {
  const code = codeOnly(read(SRC));
  const fnStart = code.indexOf("export async function getPortfolio");
  assert.ok(fnStart >= 0, "expected to find getPortfolio");
  const fn = code.slice(fnStart, code.indexOf("\nexport ", fnStart + 1));

  assert.match(fn, /const validRows = rows\.filter\(\(r\) => r\.card != null\)/, "must filter rows with a missing card before use");
  assert.doesNotMatch(fn, /\brows\.map\(\(r\) => \{/, "the holdings map must not iterate the unfiltered rows");
  assert.match(fn, /validRows\s*\.map\(/, "the holdings map must iterate validRows");
  assert.match(fn, /portfolioPerformance\(\s*validRows\.map\(/, "the value series must be built from validRows");
});

test("every other binder read drops a row whose card is gone", () => {
  const lib = codeOnly(read(SRC));
  const items = lib.slice(lib.indexOf("export async function collectionItems"), lib.indexOf("// ── The free portfolio limit"));
  assert.match(items, /return card \? \{/, "the editor's list drops orphans");
  const exp = lib.slice(lib.indexOf("export async function exportRows"));
  assert.match(exp, /if \(!c\) continue;/, "the export drops orphans");
  const share = codeOnly(read("src/lib/collection-share.ts"));
  assert.match(share, /if \(!c\) continue;/, "the shared binder drops orphans");
});

test("history days are re-hydrated from numbers at the one place they are read", () => {
  const perf = codeOnly(read("src/lib/portfolio-performance.ts"));
  assert.match(perf, /const dayMsOf = \(n: number\) => Date\.parse\(`\$\{dayIso\(n\)\}T00:00:00Z`\)/);
  const data = codeOnly(read("src/lib/data.ts"));
  const block = data.slice(data.indexOf("export async function getRecentHistory"));
  assert.doesNotMatch(block.slice(0, block.indexOf("\n}\n")), /unstable_cache/, "the history read is fetch-cached, never an unstable_cache entry");
});
