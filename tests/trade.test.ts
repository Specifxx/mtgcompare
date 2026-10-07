import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRoastBody, tradeGremlin, tradeRoast, TRADE_CURRENCIES } from "../src/lib/trade-gremlin";
import { COUNTRY_LIST } from "../src/lib/country";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("the gremlin: empty, even, robbed and winning, at RiftCompare's 7% and 20% bands", () => {
  assert.equal(tradeGremlin(0, 0, "USD"), null);
  assert.equal(tradeGremlin(1000, 0, "USD")!.tone, "donation");
  assert.equal(tradeGremlin(1000, 1050, "USD")!.tone, "fair");
  assert.match(tradeGremlin(1000, 1050, "USD")!.line, /US\$0\.50 apart/);
  assert.equal(tradeGremlin(1000, 850, "USD")!.tone, "robbed");
  assert.match(tradeGremlin(1000, 700, "AUD")!.line, /scam my boy.*A\$3\.00 in the hole/);
  assert.equal(tradeGremlin(800, 1000, "GBP")!.tone, "winning");
  assert.match(tradeGremlin(800, 1000, "GBP")!.line, /Highway robbery.*£2\.00 up/);
});

test("the roast is rules-only, deterministic, keeps the verdict's tone and names the gap", () => {
  for (const [give, get] of [[1000, 0], [1000, 1020], [1000, 700], [700, 1000]] as const) {
    const a = tradeRoast(give, get, "USD")!;
    assert.equal(a.tone, tradeGremlin(give, get, "USD")!.tone);
    assert.deepEqual(tradeRoast(give, get, "USD"), a, "same trade, same line");
  }
  assert.match(tradeRoast(1000, 700, "USD")!.line, /US\$3\.00/);
  assert.equal(tradeRoast(0, 0, "USD"), null);
  const route = read("src/app/api/trade-roast/route.ts");
  assert.match(route, /source: "rules"/);
  assert.match(route, /rateLimit\(`roast:\$\{ipKey\(req\)\}`, 6, 60_000\)/);
  assert.doesNotMatch(route, /llm|openai|anthropic|ai-insight/i, "no model call");
  assert.match(read("src/components/TradeCalculator.tsx"), /not written by AI/);
});

test("the roast body: whole cents in range and a currency from the list, nothing else", () => {
  assert.deepEqual(parseRoastBody({ giveCents: 100, getCents: 200, currency: "SGD" }), { giveCents: 100, getCents: 200, currency: "SGD" });
  assert.equal(parseRoastBody({ giveCents: 100, getCents: 200 })?.currency, "USD");
  assert.equal(parseRoastBody({ giveCents: 1.5, getCents: 200 }), null);
  assert.equal(parseRoastBody({ giveCents: -1, getCents: 200 }), null);
  assert.equal(parseRoastBody({ giveCents: 100, getCents: 200, currency: "<script>" }), null);
  assert.equal(parseRoastBody(null), null);
  for (const c of COUNTRY_LIST) assert.ok((TRADE_CURRENCIES as readonly string[]).includes(c.currency), c.code);
});

test("the calculator values each side from /api/search's per-market lows and picks store rows only", () => {
  const ui = read("src/components/TradeCalculator.tsx");
  assert.match(ui, /c\.low\?\.\[country\]/);
  assert.match(ui, /filter\(\(p\) => !p\.ebay\)/);
  assert.match(read("src/app/api/search/route.ts"), /low: c\.low/);
});
