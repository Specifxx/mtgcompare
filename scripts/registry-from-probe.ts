// Merge one or more probe result files into src/data/stores.json.
//
//   npx tsx scripts/registry-from-probe.ts probe-a.json probe-b.json [--min 3]
//
// Later files win for a store probed twice (a retry beats a rate-limited
// first attempt). Stores already in the registry keep their key, so URLs
// (/au/stores/<key>) never change.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StoreConfig } from "../src/lib/stores";

const args = process.argv.slice(2);
const minIdx = args.indexOf("--min");
const MIN = minIdx >= 0 ? Number(args[minIdx + 1]) : 3;
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--min");

interface ProbeResult {
  key: string;
  name: string;
  base: string;
  market: StoreConfig["market"];
  platform: StoreConfig["platform"] | null;
  country: string;
  collections: string[];
  sealedProducts: number;
  error: string | null;
}

const latest = new Map<string, ProbeResult>();
for (const f of files) for (const r of JSON.parse(readFileSync(f, "utf8")) as ProbeResult[]) latest.set(r.base, r);

const path = join(__dirname, "..", "src", "data", "stores.json");
const registry: StoreConfig[] = JSON.parse(readFileSync(path, "utf8"));
const byBase = new Map(registry.map((s) => [s.base, s]));
const keys = new Set(registry.map((s) => s.key));
let added = 0;
let updated = 0;
for (const r of latest.values()) {
  if (r.error || !r.platform || r.sealedProducts < MIN || !r.collections.length) continue;
  const prev = byBase.get(r.base);
  let key = prev?.key ?? r.key;
  if (!prev) {
    for (let n = 2; keys.has(key); n++) key = `${r.key}${n}`;
    keys.add(key);
    added++;
  } else updated++;
  byBase.set(r.base, { key, name: prev?.name ?? r.name, base: r.base, market: r.market, platform: r.platform, country: r.country, collections: r.collections });
}
const out = [...byBase.values()].sort((a, b) => a.market.localeCompare(b.market) || a.key.localeCompare(b.key));
writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
const by: Record<string, number> = {};
for (const s of out) by[s.market] = (by[s.market] ?? 0) + 1;
console.log(`registry: ${out.length} stores (${added} added, ${updated} refreshed)`, by);
