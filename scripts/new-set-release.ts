// Does this sealed import's export list a new set's first pre-orders (lib/new-set-release.ts)? Compares data/public/ as just
// exported with the same files at HEAD (main before this run's commit) and writes `release=release` to $GITHUB_OUTPUT when it does,
// so sealed-import.yml makes this run's data commit a release even when it is the morning run. Never fails the job: on any error it
// says why in the summary and asks for no release.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { newlyListedSets, type Snapshot } from "../src/lib/new-set-release";
import { SETS } from "../src/lib/sets";

function summary(lines: string[]): void {
  const text = ["### New sets listed this run", "", ...lines, ""].join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
  console.log(text);
}

function output(release: boolean): void {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `release=${release ? "release" : ""}\n`);
}

function atHead(file: string): unknown {
  try {
    return JSON.parse(execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 }));
  } catch {
    return null; // not on main yet: nothing was listed before
  }
}

function snapshot(products: unknown, offers: unknown): Snapshot {
  return {
    products: Array.isArray(products) ? products.map((p) => ({ id: String(p.id), setCode: p.setCode ?? null })) : [],
    offers: Array.isArray(offers) ? offers.map((o) => ({ productId: String(o.productId), store: String(o.store) })) : [],
  };
}

function main(): void {
  const read = (f: string) => JSON.parse(fs.readFileSync(f, "utf8"));
  const after = snapshot(read("data/public/products.json"), read("data/public/offers.json"));
  if (!after.offers.length) {
    summary(["The export holds no offers; no release asked for."]);
    output(false);
    return;
  }
  const before = snapshot(atHead("data/public/products.json"), atHead("data/public/offers.json"));
  const today = new Date().toISOString().slice(0, 10);
  const fresh = newlyListedSets(before, after, SETS, today);
  if (!fresh.length) {
    summary(["No upcoming set got its first listing this run."]);
    output(false);
    return;
  }
  summary([
    "First pre-orders read this run; this data commit is a release (the 12-hour build gate still applies):",
    ...fresh.map((s) => `- **${s.name}** (${s.code}, out ${s.releaseDate}): ${s.products} product(s) from ${s.stores.length} source(s): ${s.stores.slice(0, 12).join(", ")}`),
  ]);
  output(true);
}

try {
  main();
} catch (err) {
  summary([`Could not compare the snapshots (${err instanceof Error ? err.message : String(err)}); no release asked for.`]);
  output(false);
}
