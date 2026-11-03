// Finds newly announced Magic sets (lib/set-discovery.ts) and writes data/sets/discovered.json. Run by the sealed import before
// it reads the stores, so a new set's pre-orders are filed under it the same morning. Scryfall's public API, no key: one request
// for the set list, then two small card searches per upcoming expansion (is it Universes Beyond?), 150 ms apart (Scryfall asks
// for 50-100 ms). Never fails the import: on any error it keeps the file as it is and says why in the job summary.
import fs from "node:fs";
import path from "node:path";
import { candidates, isUniversesBeyond, mergeDiscovered, type DiscoveredSet, type ScryfallSet } from "../src/lib/set-discovery";
import { HAND_SETS } from "../src/lib/sets";

const FILE = path.join(process.cwd(), "data/sets/discovered.json");
const API = "https://api.scryfall.com";
const HEADERS = { "User-Agent": "MTGCompare/1.0 (+https://mtgcompare.app)", Accept: "application/json" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
}

/** Cards in a set matching a Scryfall query (0 on Scryfall's 404 "no cards found"); null when the search failed. */
async function count(q: string): Promise<number | null> {
  await sleep(150);
  const { status, body } = await getJson(`${API}/cards/search?unique=cards&q=${encodeURIComponent(q)}`);
  if (status === 404) return 0;
  if (status !== 200) return null;
  const n = (body as { total_cards?: number }).total_cards;
  return typeof n === "number" ? n : null;
}

function summary(lines: string[]): void {
  const out = process.env.GITHUB_STEP_SUMMARY;
  const text = ["### New sets (Scryfall)", "", ...lines, ""].join("\n");
  if (out) fs.appendFileSync(out, text + "\n");
  console.log(text);
}

async function main(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const previous: DiscoveredSet[] = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : [];

  const res = await getJson(`${API}/sets`);
  const all = (res.body as { data?: ScryfallSet[] } | null)?.data;
  if (res.status !== 200 || !Array.isArray(all) || all.length < 100) {
    summary([`Scryfall's set list could not be read (HTTP ${res.status}); data/sets/discovered.json kept as it was.`]);
    return;
  }

  const { take, skipped } = candidates(all, HAND_SETS, today);
  const ub = new Map<string, boolean | null>();
  for (const { set } of take) {
    if (set.set_type !== "expansion" && set.set_type !== "core") continue;
    const total = await count(`e:${set.code} game:paper`);
    const triangle = total ? await count(`e:${set.code} game:paper stamp:triangle`) : 0;
    ub.set(set.code, total == null || triangle == null ? null : isUniversesBeyond(total, triangle));
  }

  const next = mergeDiscovered(
    previous,
    take,
    ub,
    new Set(all.map((s) => s.code.toLowerCase())),
    new Set(HAND_SETS.map((s) => s.code)),
    today,
  );
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2) + "\n");

  const added = next.filter((d) => !previous.some((p) => p.code === d.code));
  summary([
    `${next.length} discovered set(s) beside the ${HAND_SETS.length} in lib/sets.ts.`,
    ...next.map((d) => `- ${added.includes(d) ? "**new** " : ""}${d.code} ${d.name}: ${d.releaseDate}, ${d.series} (/sets/${d.slug})`),
    ...skipped.map((s) => `- skipped ${s.code} ${s.name}: ${s.why}`),
  ]);
}

main().catch((err) => {
  summary([`Set discovery failed (${err instanceof Error ? err.message : String(err)}); data/sets/discovered.json kept as it was.`]);
});
