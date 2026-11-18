// The daily import: for every live game (site.config.ts), TCGplayer's public catalogue and price files as TCGCSV mirrors them
// (the groups list, then products + prices per group, a quarter of a second apart, no key) → data/cards/<game>/ (sets.json,
// sets/<set>.json, search.json, top.json), data/history/<game>/<set>.json and data/meta.json. Run by card-prices.yml in GitHub
// Actions, never by a page. No key, no database, no eBay. A group that fails keeps yesterday's cards; a game whose groups list
// cannot be read keeps every file as it was. IMPORT_GAMES (comma-separated slugs) narrows a run.
// DATA_DIR moves the output (tests).
import fs from "node:fs";
import path from "node:path";
import {
  INDEX_GROWTH,
  addHistory,
  cardIndexable,
  cardValue,
  cardsOfGroup,
  mergeSet,
  movers,
  releaseForIndexing,
  skipGroup,
  slugify,
  type CardLite,
  type CardRow,
  type CardSet,
  type HistoryFile,
  type Point,
  type SearchRow,
  type SetFile,
  type SetsFile,
  type TcgcsvGroup,
  type TcgcsvPrice,
  type TcgcsvProduct,
  type TopFile,
} from "../src/lib/cards";
import { LIVE_GAMES, SITE, type Game } from "../src/site.config";
import type { Meta } from "../src/lib/store";

const HEADERS = { "User-Agent": `TCGSinglesDB/1.0 (+${SITE.url})`, Accept: "application/json" };
const DATA = process.env.DATA_DIR || path.join(process.cwd(), "data");
/** Slugs a set may never take: pages that live beside the sets. */
const RESERVED = ["movers", "search", "sets"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** TCGCSV_FIXTURE_DIR (tests, local builds): read <dir>/<category>/groups.json and <dir>/<category>/<group>/{products,prices}.json instead. */
const FIXTURES = process.env.TCGCSV_FIXTURE_DIR;
async function getJson<T>(url: string): Promise<T> {
  if (FIXTURES) return JSON.parse(fs.readFileSync(path.join(FIXTURES, url.replace("https://tcgcsv.com/tcgplayer/", "") + ".json"), "utf8")) as T;
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
function summary(lines: string[]): void {
  const text = [...lines, ""].join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
  console.log(text);
}

async function importGame(game: Game, day: string, growth: number): Promise<Meta["games"][string]> {
  const base = `https://tcgcsv.com/tcgplayer/${game.category}`;
  const dir = path.join(DATA, "cards", game.slug);
  const histDir = path.join(DATA, "history", game.slug);
  const groups = (await getJson<{ results: TcgcsvGroup[] }>(`${base}/groups`)).results;
  if (!Array.isArray(groups) || groups.length < (FIXTURES ? 1 : 5)) throw new Error(`the groups list has ${groups?.length ?? 0} entries`);

  const slugByGroup = new Map<number, string>();
  const cardsByGroup = new Map<number, CardRow[]>();
  for (const s of readJson<SetsFile>(path.join(dir, "sets.json"), { generatedAt: "", source: "", sets: [] }).sets) {
    slugByGroup.set(s.groupId, s.slug);
    cardsByGroup.set(s.groupId, readJson<SetFile>(path.join(dir, "sets", `${s.slug}.json`), { slug: s.slug, cards: [] }).cards);
  }
  // Set slugs: kept once given; a new set takes its name's (a clash adds the abbreviation, then the id).
  const used = new Set([...slugByGroup.values(), ...RESERVED]);
  const ordered = groups.filter((g) => !skipGroup(g)).sort((a, b) => a.groupId - b.groupId);
  for (const g of ordered) {
    if (slugByGroup.has(g.groupId)) continue;
    let slug = slugify(g.name) || String(g.groupId);
    if (used.has(slug)) slug = `${slug}-${slugify(g.abbreviation ?? "") || g.groupId}`;
    if (used.has(slug)) slug = `${slug}-${g.groupId}`;
    used.add(slug);
    slugByGroup.set(g.groupId, slug);
  }

  const failed: string[] = [];
  const all: { set: CardSet; cards: CardRow[] }[] = [];
  for (const g of ordered) {
    const prev = cardsByGroup.get(g.groupId) ?? [];
    let cards: CardRow[];
    try {
      const [p, pr] = await Promise.all([
        getJson<{ results: TcgcsvProduct[] }>(`${base}/${g.groupId}/products`),
        getJson<{ results: TcgcsvPrice[] }>(`${base}/${g.groupId}/prices`),
      ]);
      cards = mergeSet(prev, cardsOfGroup(p.results ?? [], pr.results ?? []), day);
    } catch (e) {
      failed.push(`${g.name} (${(e as Error).message})`);
      cards = prev;
    }
    if (!FIXTURES) await sleep(250);
    if (!cards.length) continue;
    all.push({
      set: { slug: slugByGroup.get(g.groupId)!, name: g.name, abbr: g.abbreviation || null, groupId: g.groupId, released: g.publishedOn ? g.publishedOn.slice(0, 10) : null, cards: cards.length, indexed: 0 },
      cards,
    });
  }
  if (failed.length > ordered.length / 4) throw new Error(`${failed.length} of ${ordered.length} groups failed: ${failed.slice(0, 5).join(", ")}`);

  const flat = all.flatMap((x) => x.cards);
  const releasedToday = releaseForIndexing(flat, growth);
  for (const x of all) x.set.indexed = x.cards.filter(cardIndexable).length;

  // History: add today's points per set, and gather them for the movers.
  fs.mkdirSync(histDir, { recursive: true });
  const lite = (set: string, c: CardRow): CardLite => ({ set, s: c.s, n: c.n, no: c.no, r: c.r, id: c.id, v: cardValue(c.p) ?? 0 });
  const withPts: (CardLite & { pts: Point[] })[] = [];
  for (const { set, cards } of all) {
    const file = path.join(histDir, `${set.slug}.json`);
    const hist = addHistory(readJson<HistoryFile>(file, {}), cards, day);
    if (Object.keys(hist).length) fs.writeFileSync(file, JSON.stringify(hist));
    for (const c of cards) {
      const pts = hist[String(c.id)];
      if (pts) withPts.push({ ...lite(set.slug, c), pts });
    }
  }

  // Write the card files into a fresh directory, so a set that disappeared leaves no stale file.
  const tmp = `${dir}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(path.join(tmp, "sets"), { recursive: true });
  for (const { set, cards } of all) fs.writeFileSync(path.join(tmp, "sets", `${set.slug}.json`), JSON.stringify({ slug: set.slug, cards } satisfies SetFile));
  const sets = all.map((x) => x.set).sort((a, b) => (b.released ?? "").localeCompare(a.released ?? "") || a.name.localeCompare(b.name));
  const generatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(tmp, "sets.json"), JSON.stringify({ generatedAt, source: "TCGplayer market prices via tcgcsv.com", sets } satisfies SetsFile));
  const search: SearchRow[] = all.flatMap(({ set, cards }) => cards.map((c): SearchRow => [set.slug, c.s, c.n, c.no, cardValue(c.p) ?? 0, cardIndexable(c) ? 1 : 0, c.id]));
  fs.writeFileSync(path.join(tmp, "search.json"), JSON.stringify(search));
  const top = all.flatMap(({ set, cards }) => cards.filter(cardIndexable).map((c) => lite(set.slug, c))).sort((a, b) => b.v - a.v || a.id - b.id).slice(0, 60);
  fs.writeFileSync(path.join(tmp, "top.json"), JSON.stringify({ top, ...movers(withPts, day) } satisfies TopFile));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(tmp, dir);

  const priced = flat.filter((c) => cardValue(c.p) != null).length;
  const indexed = flat.filter(cardIndexable).length;
  summary([
    `### ${game.name}`,
    `Groups read: ${ordered.length - failed.length} of ${ordered.length} (failed: ${failed.slice(0, 10).join(", ") || "none"}).`,
    `Sets: ${sets.length}; cards: ${flat.length}; with a TCGplayer market price: ${priced}; at US$1 or more: ${flat.filter((c) => (cardValue(c.p) ?? 0) >= 100).length}; new pages today: ${flat.filter((c) => c.since === day).length}.`,
    `Released to Google: ${indexed} (today +${releasedToday}, growth ${growth}).`,
  ]);
  return { sets: sets.length, cards: flat.length, priced, indexed, generatedAt };
}

async function main(): Promise<void> {
  const day = /^\d{4}-\d\d-\d\d$/.test(process.env.IMPORT_DAY ?? "") ? process.env.IMPORT_DAY! : new Date().toISOString().slice(0, 10);
  const raw = (process.env.CARD_INDEX_GROWTH ?? "").trim();
  const growth = raw === "" || !Number.isFinite(Number(raw)) ? INDEX_GROWTH : Math.max(0, Math.floor(Number(raw)));
  const only = (process.env.IMPORT_GAMES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const games = LIVE_GAMES.filter((g) => !only.length || only.includes(g.slug));
  const metaFile = path.join(DATA, "meta.json");
  const meta = readJson<Meta>(metaFile, { generatedAt: "", games: {} });
  let bad = 0;
  for (const g of games) {
    try {
      meta.games[g.slug] = await importGame(g, day, growth);
    } catch (e) {
      bad++;
      summary([`### ${g.name}`, `Not updated: ${(e as Error).message}. Its files are kept as they were.`]);
    }
  }
  meta.generatedAt = new Date().toISOString();
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(metaFile, JSON.stringify(meta));
  // Every game failing is a red run (the ops monitor and GitHub's email catch it); one game failing is not.
  if (games.length && bad === games.length) process.exit(1);
}

main().catch((e) => {
  summary([`Import failed: ${(e as Error).message}`]);
  process.exit(1);
});
