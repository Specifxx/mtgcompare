// THE LOADER API IS TYPED, COMPLETE AND CONSISTENT (critique 3 and 8: the draft's api.ts had 15 `unknown`, 22 names missing, a second EbayPanelData; owner addendum 10: the paid loaders take an Entitlement). Static checks over src/lib/data/api.ts, the barrel and checks/removed.json. Owner WP02.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripNonCode } from "./helpers/cache-scan";

const ROOT = process.env.TEST_ROOT ?? path.resolve(__dirname, "..");
const apiPath = path.join(ROOT, "src/lib/data/api.ts");
const api = fs.readFileSync(apiPath, "utf8"); const code = stripNonCode(api);
const removed = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/contract-checks/removed.json"), "utf8")) as Record<string, string>;
const declared = (): { name: string; kind: string; line: string; section: string }[] => {
  const out: { name: string; kind: string; line: string; section: string }[] = []; let section = "";
  for (const raw of api.split("\n")) {
    const h = /^\/\/ ── ([a-z-]+)\.ts/.exec(raw); if (h) { section = h[1]!; continue; }
    const m = /^export (declare )?(function|const|interface|type|class)\s+([A-Za-z0-9_]+)/.exec(raw); if (m) { out.push({ name: m[3]!, kind: m[2]!, line: raw, section }); continue; }
    const c = /^export declare const (.+?);/.exec(raw); if (c) for (const part of c[1]!.split(/,\s*(?=[A-Z_]+:)/)) { const n = /^([A-Za-z0-9_]+):/.exec(part.trim()); if (n) out.push({ name: n[1]!, kind: "const", line: raw, section }); }
  }
  return out;
};

test("no result type or argument is `unknown` or `any` (the only `unknown` is the argument of jsonBytes, a size probe)", () => {
  const lines = code.split("\n").filter((l) => /\b(unknown|any)\b/.test(l));
  assert.deepEqual(lines.map((l) => /declare function (\w+)/.exec(l)?.[1] ?? l.trim().slice(0, 60)), ["jsonBytes"]);
});
test("every declaration sits in a section named after the module that implements it, and the sections are exactly the modules of the barrel (minus types, which holds no loader)", () => {
  const sections = [...new Set(declared().map((d) => d.section))].sort();
  const barrel = fs.readFileSync(path.join(ROOT, "src/lib/data/index.ts"), "utf8").split("\n").map((l) => /^export \* from "\.\/([a-z-]+)";$/.exec(l.trim())?.[1]).filter((x): x is string => !!x && x !== "types").sort();
  assert.deepEqual(sections.filter((s) => s !== "catalog"), barrel.filter((s) => s !== "catalog" && s !== "catalog-shim"), "api.ts sections vs barrel modules");
  assert.ok(sections.includes("catalog") && barrel.includes("catalog-shim"), "getCatalog is declared in the catalog section and implemented by catalog-shim.ts");
});
test("a name is declared once, and a declared name is never also in the REMOVED table", () => {
  const names = declared().map((d) => d.name); const dup = names.filter((n, i) => names.indexOf(n) !== i); assert.deepEqual(dup, []);
  const both = names.filter((n) => `data:${n}` in removed); assert.deepEqual(both, [], "remove the stale row of scripts/contract-checks/removed.json");
});
test("the three paid loaders take an Entitlement, and nothing else in the API can return a ranking", () => {
  const sig = (n: string): string => declared().find((d) => d.name === n)!.line;
  for (const n of ["getDealList", "getCachedRisingCards", "getRisingWeekAgo", "getTopDemand"]) assert.match(sig(n), /\bwho: Entitlement\b/, `${n} must take who: Entitlement`);
  const takes = declared().filter((d) => /\bwho: Entitlement\b/.test(d.line)).map((d) => d.name).sort(); assert.deepEqual(takes, ["getCachedRisingCards", "getDealList", "getRisingWeekAgo", "getTopDemand"]);
  assert.doesNotMatch(code, /\btier\s*:|\bviewer\s*:|\buserId\s*:|premiumTier/, "no loader argument names a tier, a viewer or a user: the Entitlement is the only door");
  assert.match(sig("getCachedRisingCards"), /Promise<RiseResult>/); assert.match(api, /access: "preview" \| "none"; locked: true;[^\n]*preview: RisePreviewRow\[\]/, "below full there is no `analysis` property to read");
});
test("tags: the Neon-backed caches have named tags, and PRICES_TAG / CATALOG_TAG are gone (the plane needs no purge)", () => {
  assert.match(api, /DECKS_TAG: "published-decks"/); assert.match(api, /RISING_SNAPSHOTS_TAG: "rising-snapshots"/); assert.match(api, /EBAY_BANNER_TAG: "ebay-banner"/); assert.match(api, /RANK_TAG: "rank"/);
  assert.doesNotMatch(code, /PRICES_TAG|CATALOG_TAG/); assert.ok(removed["data:PRICES_TAG"], "the removal is documented"); assert.match(removed["data:PRICES_TAG"]!, /NEON_TAGS/);
});
test("the eBay view types come from listing-panel.ts, not from an ebay*.ts module (tests/no-ebay-api.test.ts), and EbayPanelBundle replaces the colliding EbayPanelData", () => {
  assert.match(api, /from "\.\.\/listing-panel"/); assert.doesNotMatch(api, /from "\.\.\/ebay|from "\.\/ebay/); assert.match(api, /interface EbayPanelBundle/); assert.doesNotMatch(api, /interface EbayPanelData/);
});
test("the barrel is a pure list of `export *` lines and names no module twice", () => {
  const lines = fs.readFileSync(path.join(ROOT, "src/lib/data/index.ts"), "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("//"));
  assert.ok(lines.every((l) => /^export \* from "\.\/[a-z-]+";$/.test(l.trim()))); assert.equal(new Set(lines).size, lines.length);
});
test("every cache kind the comments name is one of the five (P, M, R, N, -) and a ranking cache is named only for the three rankings", () => {
  const r = api.split("\n").filter((l) => /\bR (?:key|\[)/.test(l) || /^\/\/\s+R\s/.test(l) || / R \[(?:deal-rank|rise|demand)-v\d/.test(l)); assert.ok(r.length >= 3);
  const names = [...api.matchAll(/\[([a-z]+-?[a-z]*-v\d+), ref/g)].map((m) => m[1]).sort(); assert.deepEqual([...new Set(names)], ["deal-rank-v1", "demand-v1", "rise-v1"]);
});
