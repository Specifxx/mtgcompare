// Card prices, every card (DECISIONS.md "Card prices: every card"): reads TCGplayer's public Magic price files as TCGCSV mirrors
// them each day (category 1: the groups list, then products + prices per group, a quarter of a second apart, no key) and writes
// data/cards/: sets.json, sets/<set>.json, search.json and top.json (lib/cards.ts). Every card keeps the URL it had; today's
// release to Google (lib/cards.ts releaseForIndexing) adds CARD_INDEX_GROWTH (default 500) cards. Run by card-prices.yml in
// GitHub Actions, never by a page. No key, no database, no eBay. A group that fails keeps yesterday's cards; a run that cannot read
// the groups list keeps every file as it was.
import fs from "node:fs";
import path from "node:path";
import {
  CARDS_DIR,
  HISTORY_DIR,
  HISTORY_KEEP_DAYS,
  cardMovers,
  compareDays,
  snapshotOf,
  type MoversFile,
  type PriceSnapshot,
  INDEX_GROWTH,
  LEGACY_FILE,
  cardValue,
  cardIndexable,
  cardsOfGroup,
  mergeSet,
  releaseForIndexing,
  freshSets,
  skipGroup,
  slugify,
  type CardLite,
  type CardRow,
  type CardSet,
  type SearchRow,
  type SetFile,
  type SetsFile,
  type TcgcsvCardPrice,
  type TcgcsvCardProduct,
  type TcgcsvGroup,
  type TopFile,
} from "../src/lib/cards";
import { SETS, SET_BY_CODE } from "../src/lib/sets";

const BASE = "https://tcgcsv.com/tcgplayer/1";
const HEADERS = { "User-Agent": "MTGCompare/1.0 (+https://mtgcompare.app)", Accept: "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ROOT = path.join(process.cwd(), CARDS_DIR);

async function getJson<T>(url: string): Promise<T> {
  let last: unknown;
  for (const wait of [0, 5_000, 20_000]) {
    if (wait) await sleep(wait);
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return (await res.json()) as T;
      last = new Error(`HTTP ${res.status}`);
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`${url}: ${(last as Error)?.message ?? last}`);
}

const readJson = <T>(file: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
};
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

function summary(lines: string[]): void {
  const text = ["### Card prices (TCGplayer via TCGCSV)", "", ...lines, ""].join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
  console.log(text);
}

/** The previous run's cards per group id (and set slugs), from the new files or the 2026-11-17 single file. */
function previousState(groupsBySealed: Map<string, number>): { slugByGroup: Map<number, string>; cardsByGroup: Map<number, CardRow[]> } {
  const slugByGroup = new Map<number, string>();
  const cardsByGroup = new Map<number, CardRow[]>();
  const sets = readJson<SetsFile | null>(path.join(ROOT, "sets.json"), null);
  if (sets) {
    for (const s of sets.sets) {
      slugByGroup.set(s.groupId, s.slug);
      cardsByGroup.set(s.groupId, readJson<SetFile>(path.join(ROOT, "sets", `${s.slug}.json`), { slug: s.slug, cards: [] }).cards);
    }
    return { slugByGroup, cardsByGroup };
  }
  // The first release's file: { cards: [{ id, slug, set (sets.ts code), since, ... }] }. Its 1,000 cards were in the sitemap.
  const legacy = readJson<{ cards?: { id: number; slug: string; set: string; since: string; name: string; number: string; rarity: string | null }[] }>(
    path.join(process.cwd(), LEGACY_FILE),
    {},
  );
  for (const c of legacy.cards ?? []) {
    const g = groupsBySealed.get(c.set);
    const s = SET_BY_CODE.get(c.set);
    if (g == null || !s) continue;
    slugByGroup.set(g, s.slug);
    const list = cardsByGroup.get(g) ?? cardsByGroup.set(g, []).get(g)!;
    list.push({ id: c.id, s: c.slug, n: c.name, no: c.number, r: c.rarity, p: [null, null, null], ix: 1, since: c.since });
  }
  return { slugByGroup, cardsByGroup };
}

async function main(): Promise<void> {
  const groups = (await getJson<{ results: TcgcsvGroup[] }>(`${BASE}/groups`)).results;
  if (!Array.isArray(groups) || groups.length < 100) throw new Error(`the groups list has ${groups?.length ?? 0} entries`);
  const day = new Date().toISOString().slice(0, 10);

  // Which group is which sealed set (lib/sets.ts): by TCGplayer's abbreviation = our code, else by name.
  const byAbbr = new Map(groups.filter((g) => g.abbreviation).map((g) => [g.abbreviation!.toLowerCase(), g]));
  const byName = new Map(groups.map((g) => [norm(g.name), g]));
  const sealedOfGroup = new Map<number, string>();
  const groupsBySealed = new Map<string, number>();
  for (const s of SETS) {
    const g = byAbbr.get(s.code) ?? byName.get(norm(s.name));
    if (g && !sealedOfGroup.has(g.groupId)) {
      sealedOfGroup.set(g.groupId, s.code);
      groupsBySealed.set(s.code, g.groupId);
    }
  }

  const { slugByGroup, cardsByGroup } = previousState(groupsBySealed);

  // Set slugs: kept once given; a sealed set takes its sealed page's slug; others their name's (a clash adds the abbreviation).
  const used = new Set([...slugByGroup.values(), "search", "movers"]); // /card-prices/search and /card-prices/movers are pages
  const ordered = [...groups].filter((g) => !skipGroup(g)).sort((a, b) => Number(sealedOfGroup.has(b.groupId)) - Number(sealedOfGroup.has(a.groupId)) || a.groupId - b.groupId);
  for (const g of ordered) {
    if (slugByGroup.has(g.groupId)) continue;
    const code = sealedOfGroup.get(g.groupId);
    let slug = code ? SET_BY_CODE.get(code)!.slug : slugify(g.name) || String(g.groupId);
    if (used.has(slug)) slug = `${slug}-${slugify(g.abbreviation ?? "") || g.groupId}`;
    if (used.has(slug)) slug = `${slug}-${g.groupId}`;
    used.add(slug);
    slugByGroup.set(g.groupId, slug);
  }

  const failed: string[] = [];
  const sets: CardSet[] = [];
  const all: { set: CardSet; cards: CardRow[] }[] = [];
  for (const g of ordered) {
    const slug = slugByGroup.get(g.groupId)!;
    const prev = cardsByGroup.get(g.groupId) ?? [];
    let cards: CardRow[];
    try {
      const [p, pr] = await Promise.all([
        getJson<{ results: TcgcsvCardProduct[] }>(`${BASE}/${g.groupId}/products`),
        getJson<{ results: TcgcsvCardPrice[] }>(`${BASE}/${g.groupId}/prices`),
      ]);
      cards = mergeSet(prev, cardsOfGroup(p.results ?? [], pr.results ?? []), day);
    } catch (e) {
      failed.push(`${g.name} (${(e as Error).message})`);
      cards = prev; // yesterday's cards and prices
    }
    await sleep(250);
    if (!cards.length) continue;
    const set: CardSet = {
      slug,
      name: g.name,
      abbr: g.abbreviation || null,
      groupId: g.groupId,
      released: g.publishedOn ? g.publishedOn.slice(0, 10) : null,
      sealed: sealedOfGroup.get(g.groupId) ?? null,
      cards: cards.length,
      indexed: 0,
    };
    sets.push(set);
    all.push({ set, cards });
  }
  if (failed.length > ordered.length / 4) throw new Error(`${failed.length} of ${ordered.length} groups failed: ${failed.slice(0, 5).join(", ")}`);

  // An unset repository variable arrives as "": the default. "0" pauses the release.
  const raw = (process.env.CARD_INDEX_GROWTH ?? "").trim();
  const growth = raw === "" || !Number.isFinite(Number(raw)) ? INDEX_GROWTH : Math.max(0, Math.floor(Number(raw)));
  const flat = all.flatMap((x) => x.cards);
  const fresh = freshSets(sets, day);
  const freshCards = new Set(all.filter((x) => fresh.has(x.set.slug)).flatMap((x) => x.cards));
  const releasedToday = releaseForIndexing(flat, growth, freshCards);
  for (const x of all) x.set.indexed = x.cards.filter(cardIndexable).length;

  // Write: a fresh directory, so a set that disappeared leaves no stale file.
  const tmp = `${ROOT}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(path.join(tmp, "sets"), { recursive: true });
  for (const { set, cards } of all) fs.writeFileSync(path.join(tmp, "sets", `${set.slug}.json`), JSON.stringify({ slug: set.slug, cards } satisfies SetFile));
  sets.sort((a, b) => (b.released ?? "").localeCompare(a.released ?? "") || a.name.localeCompare(b.name));
  fs.writeFileSync(path.join(tmp, "sets.json"), JSON.stringify({ generatedAt: new Date().toISOString(), source: "TCGplayer market prices via tcgcsv.com", sets } satisfies SetsFile));
  const search: SearchRow[] = all.flatMap(({ set, cards }) => cards.map((c): SearchRow => [set.slug, c.s, c.n, c.no, cardValue(c.p) ?? 0, cardIndexable(c) ? 1 : 0, c.id]));
  fs.writeFileSync(path.join(tmp, "search.json"), JSON.stringify(search));
  const lite = (set: string, c: CardRow): CardLite => ({ set, s: c.s, n: c.n, no: c.no, r: c.r, id: c.id, v: cardValue(c.p) ?? 0 });
  const indexed = all.flatMap(({ set, cards }) => cards.filter(cardIndexable).map((c) => lite(set.slug, c))).sort((a, b) => b.v - a.v || a.id - b.id);
  const top: TopFile = { hub: indexed.slice(0, 40), bySealed: {} };
  for (const { set, cards } of all) {
    if (!set.sealed) continue;
    const t = cards.filter(cardIndexable).map((c) => lite(set.slug, c)).sort((a, b) => b.v - a.v || a.id - b.id).slice(0, 5);
    if (t.length) top.bySealed[set.sealed] = t;
  }
  fs.writeFileSync(path.join(tmp, "top.json"), JSON.stringify(top));

  // Card movers (lib/cards.ts): today's snapshot, then today against yesterday's and last week's.
  const histDir = path.join(process.cwd(), HISTORY_DIR);
  fs.mkdirSync(histDir, { recursive: true });
  fs.writeFileSync(path.join(histDir, `${day}.json`), JSON.stringify(snapshotOf(flat)));
  const days = fs.readdirSync(histDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
  for (const d of days.slice(0, Math.max(0, days.length - HISTORY_KEEP_DAYS))) fs.rmSync(path.join(histDir, `${d}.json`));
  const since = compareDays(days, day);
  const snap = (d: string): PriceSnapshot | null => {
    if (!d) return null;
    try {
      return JSON.parse(fs.readFileSync(path.join(histDir, `${d}.json`), "utf8")) as PriceSnapshot;
    } catch {
      return null;
    }
  };
  const bySet = all.map(({ set, cards }) => ({ set: set.slug, cards }));
  const movers: MoversFile = { generatedAt: new Date().toISOString(), since, d1: cardMovers(bySet, snap(since.d1)), d7: cardMovers(bySet, snap(since.d7)) };
  fs.writeFileSync(path.join(tmp, "movers.json"), JSON.stringify(movers));
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.renameSync(tmp, ROOT);

  const priced = flat.filter((c) => cardValue(c.p) != null).length;
  summary([
    `Groups read: ${ordered.length - failed.length} of ${ordered.length} (failed: ${failed.slice(0, 10).join(", ") || "none"}).`,
    `Sets: ${sets.length}; cards: ${flat.length}; with a TCGplayer market price: ${priced}; new pages today: ${flat.filter((c) => c.since === day).length}.`,
    `Released to Google: ${flat.filter(cardIndexable).length} (today +${releasedToday}, growth ${growth}).`,
    `New sets first: ${[...fresh].join(", ") || "none"} (${[...freshCards].filter(cardIndexable).length} of ${freshCards.size} cards released).`,
  ]);
}

main().catch((e) => {
  summary([`Not updated: ${(e as Error).message}. data/cards/ kept as it was.`]);
  process.exit(0);
});
