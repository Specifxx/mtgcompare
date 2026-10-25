// Condense scripts/probe-shipping-rates.ts output files into src/data/shipping-rates.json, the snapshot the product page reads.
// A store measured in these files replaces its entry; one not measured this time keeps its previous measurement for up to 42 days
// (lib/shipping-probe.ts mergeSnapshots), then drops to "Shipping at checkout". Stores no longer in src/data/stores.json are removed.
//
//   npx tsx scripts/build-shipping-rates.ts /tmp/ship-au.json /tmp/ship-us.json [--out=src/data/shipping-rates.json] [--min-stores=N]
// --min-stores: refuse to write (exit 1) when fewer stores were measured this run (a blocked run must not overwrite good data).
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import raw from "../src/data/stores.json";
import { mergeSnapshots, validSnapshot, type StoreShipping } from "../src/lib/shipping-probe";

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
const opt = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const out = resolve(opt("out") ?? "src/data/shipping-rates.json");
const minStores = Number(opt("min-stores") ?? 1);
if (!files.length) {
  console.error("Usage: npx tsx scripts/build-shipping-rates.ts <probe output.json>… [--out=…] [--min-stores=N]");
  process.exit(2);
}

const fresh: Record<string, StoreShipping> = {};
for (const f of files) {
  const j = JSON.parse(readFileSync(f, "utf8")) as { results?: { key: string; shipping?: StoreShipping }[] };
  for (const r of j.results ?? []) if (r.shipping) fresh[r.key] = r.shipping;
}
// Only what validSnapshot accepts goes in: the same check the site applies when it reads the file.
const checked = validSnapshot({ version: 1, generatedAt: null, addresses: {}, stores: fresh }).stores;
const n = Object.keys(checked).length;
if (n < minStores) {
  console.error(`Only ${n} store(s) measured (need ${minStores}): not writing ${out}.`);
  process.exit(1);
}
let prev = validSnapshot(null);
try {
  prev = validSnapshot(JSON.parse(readFileSync(out, "utf8")));
} catch {
  // first run
}
const known = new Set((raw as { key: string }[]).map((s) => s.key));
const snap = mergeSnapshots(prev, checked, known, new Date());
writeFileSync(out, JSON.stringify(snap, null, 1) + "\n");
console.log(`Wrote ${out}: ${Object.keys(snap.stores).length} store(s) (${n} measured this run).`);
