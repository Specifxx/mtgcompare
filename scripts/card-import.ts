// Card prices (DECISIONS.md, 2026-11-17 "Card prices: the most valuable cards of each set"): reads TCGplayer's public Magic price
// files as TCGCSV mirrors them each day (category 1; one groups list, then two small files per set), keeps the cards of the sets
// this site sells sealed for, picks today's list (lib/cards.ts selectCards: every card that has a page keeps it, then the most
// valuable new cards at US$5 or more, up to the day's size) and writes data/cards/mtg-cards.json. Run by card-prices.yml in GitHub
// Actions, never by a page. No key, no database, no eBay call. On any failure it keeps yesterday's file and says why.
import fs from "node:fs";
import path from "node:path";
import { CARDS_FILE, cardIndexable, cardsOfGroup, selectCards, targetSize, type CardCandidate, type CardRow, type CardsFile, type TcgcsvCardPrice, type TcgcsvCardProduct } from "../src/lib/cards";
import { SETS } from "../src/lib/sets";

const BASE = "https://tcgcsv.com/tcgplayer/1";
const HEADERS = { "User-Agent": "MTGCompare/1.0 (+https://mtgcompare.app)", Accept: "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string): Promise<T> {
  let last: unknown;
  for (const wait of [0, 5_000, 20_000]) {
    if (wait) await sleep(wait);
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
      if (res.ok) return (await res.json()) as T;
      last = new Error(`HTTP ${res.status}`);
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`${url}: ${(last as Error)?.message ?? last}`);
}

interface Group {
  groupId: number;
  name: string;
  abbreviation?: string | null;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

function summary(lines: string[]): void {
  const text = ["### Card prices (TCGplayer via TCGCSV)", "", ...lines, ""].join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
  console.log(text);
}

async function main(): Promise<void> {
  const file = path.join(process.cwd(), CARDS_FILE);
  const previous: CardRow[] = fs.existsSync(file) ? ((JSON.parse(fs.readFileSync(file, "utf8")) as CardsFile).cards ?? []) : [];

  // Only the sets this site lists sealed product for: a card page links back to its set's sealed page.
  const products = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/public/products.json"), "utf8")) as { setCode: string | null }[];
  const listed = new Set(products.map((p) => p.setCode).filter((c): c is string => !!c));
  const sets = SETS.filter((s) => listed.has(s.code));

  const groups = (await getJson<{ results: Group[] }>(`${BASE}/groups`)).results;
  if (!Array.isArray(groups) || groups.length < 100) throw new Error(`the groups list has ${groups?.length ?? 0} entries`);
  const byAbbr = new Map(groups.filter((g) => g.abbreviation).map((g) => [g.abbreviation!.toLowerCase(), g]));
  const byName = new Map(groups.map((g) => [norm(g.name), g]));

  const candidates: CardCandidate[] = [];
  const missing: string[] = [];
  const failed: string[] = [];
  for (const s of sets) {
    const g = byAbbr.get(s.code) ?? byName.get(norm(s.name));
    if (!g) {
      missing.push(s.code);
      continue;
    }
    try {
      const [p, pr] = await Promise.all([
        getJson<{ results: TcgcsvCardProduct[] }>(`${BASE}/${g.groupId}/products`),
        getJson<{ results: TcgcsvCardPrice[] }>(`${BASE}/${g.groupId}/prices`),
      ]);
      candidates.push(...cardsOfGroup(s.code, p.results ?? [], pr.results ?? []));
    } catch (e) {
      failed.push(`${s.code} (${(e as Error).message})`);
    }
    await sleep(250);
  }
  if (failed.length > sets.length / 4) throw new Error(`${failed.length} of ${sets.length} sets failed: ${failed.slice(0, 5).join(", ")}`);

  // A set that failed today keeps its cards from yesterday, at yesterday's prices, so no page disappears for one bad read.
  const failedCodes = new Set(failed.map((f) => f.split(" ")[0]));
  const carried = previous.filter((c) => failedCodes.has(c.set) || missing.includes(c.set));
  const today = [...candidates, ...carried.map(({ slug: _s, since: _d, ...c }) => c)];

  const day = new Date().toISOString().slice(0, 10);
  const cards = selectCards(previous, today, day);
  const out: CardsFile = { generatedAt: new Date().toISOString(), source: "TCGplayer market prices via tcgcsv.com", cards };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 0) + "\n");

  const eligible = candidates.filter((c) => cardIndexable(c)).length;
  summary([
    `Sets read: ${sets.length - missing.length - failed.length} of ${sets.length} (no TCGplayer group: ${missing.join(", ") || "none"}; failed: ${failed.join(", ") || "none"}).`,
    `Cards read: ${candidates.length}; at US$5 or more: ${eligible}.`,
    `Pages: ${cards.length} (yesterday ${previous.length}, today's size ${targetSize(previous.length)}); new today: ${cards.filter((c) => c.since === day).length}; indexable: ${cards.filter(cardIndexable).length}.`,
  ]);
}

main().catch((e) => {
  summary([`Not updated: ${(e as Error).message}. data/cards/mtg-cards.json kept as it was.`]);
  process.exit(0);
});
