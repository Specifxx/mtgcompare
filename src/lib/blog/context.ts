import { MAIN_SET_KINDS, RARITY_KEYS, RELEASE_SET_KINDS, fold, rarityLabel } from "../constants";
import type { Country } from "../country";
import { MARKETS } from "../country";
import { getCardPage, getIndexSeries, getKeywordIndex, getMarketOverview, getMarketRecords, getMovers, getSealedBySet, getSealedPage, getSetIndex, getSetHighlights, getSiteStats, getCatalogStats, namePrintings, resolveOracles } from "../data";
import type { CardLite, CardQuery, NameHit, SealedLite, SetIndex, SetLite } from "../data";
import { memoByRef, memoKey, planeSource } from "../data/plane/runtime";
import { PREORDER_RELEASES, STAR_TREK, isOut, orderProducts, releaseDateOf, releaseSets, type PreorderRelease } from "../preorders";
import { BLING_TREATMENTS, COLOUR_GROUPS, COMMANDER_STAPLES, MONTH_MOVER_ROWS, MOVER_FLOOR_CENTS, MOVER_ROWS, MYTHIC_ROWS, TREATED_ROWS, cheapestPerCard, newestExpansions, stapleRows, type StapleRow } from "./select";
import { NAMED_CARDS, SHOCK_LANDS, STAR_TREK_KEYWORDS } from "./star-trek";
import type { MoversView, MythicBoards, PostContext, RarityRow, ReleaseView, SetBoard, StarTrekView } from "./types";

const dearest = (sort: "value" = "value") => ({ sort, page: 1, per: 100 as const });

/** Listed printings of one rarity at or above a market price: the total of an in-memory query, no rows read. */
async function rarityRow(rarity: (typeof RARITY_KEYS)[number]): Promise<RarityRow> {
  const count = async (minCents?: number) => (await getCardPage({ rarities: [rarity], minCents, sort: "value", page: 1, per: 24 })).total;
  const [total, over1, over10, over100] = await Promise.all([count(), count(100), count(1000), count(10000)]);
  return { rarity, label: rarityLabel(rarity), total, over1, over10, over100 };
}

/** The newest set of the release kinds that already has priced cards: its dearest five boards cards and its priced total. */
async function newestSet(sets: readonly SetLite[], totals: Map<number, { n: number; total: number }>): Promise<PostContext["newest"]> {
  const today = new Date().toISOString().slice(0, 10);
  const pick = sets
    .filter((s) => RELEASE_SET_KINDS.includes(s.kind) && s.releasedOn && s.releasedOn <= today && (totals.get(s.id)?.n ?? 0) >= 40)
    .sort((a, b) => (b.releasedOn! < a.releasedOn! ? -1 : b.releasedOn! > a.releasedOn! ? 1 : b.id - a.id))[0];
  if (!pick) return null;
  const page = await getCardPage({ setIds: [pick.id], sort: "value", page: 1, per: 24 });
  const t = totals.get(pick.id)!;
  return { set: pick, cards: page.items, total: t.total, priced: t.n };
}

/** The most valuable sets of the main kinds, each with its five dearest cards (one bounded board read per set). */
async function valueBoards(sets: readonly SetLite[], totals: Map<number, { n: number; total: number }>): Promise<SetBoard[]> {
  const today = new Date().toISOString().slice(0, 10);
  const pick = sets
    .filter((s) => MAIN_SET_KINDS.includes(s.kind) && s.releasedOn && s.releasedOn <= today && (totals.get(s.id)?.n ?? 0) >= 100)
    .sort((a, b) => totals.get(b.id)!.total - totals.get(a.id)!.total)
    .slice(0, 16);
  return Promise.all(pick.map(async (set) => ({ set, n: totals.get(set.id)!.n, total: totals.get(set.id)!.total, top: await getSetHighlights(set.id, 5) })));
}

/** A release with a pre-order page as the data holds it: its sets, its sealed rows (two in-memory reads of the memoised list) and up to 100 listed singles per set (one browse-index query each). */
async function releaseView(release: PreorderRelease, index: SetIndex): Promise<ReleaseView> {
  const sets = releaseSets(release, index.byTok), releasedOn = releaseDateOf(release, sets), today = new Date().toISOString().slice(0, 10);
  const [sealed, cards] = await Promise.all([
    Promise.all(sets.map((s) => getSealedBySet(s.id))).then((lists) => orderProducts(release, lists.flat(), sets)),
    Promise.all(sets.map(async (set) => { const page = await getCardPage({ setIds: [set.id], sort: "number", page: 1, per: 100 }); return { set, items: page.items, total: page.total }; })),
  ]);
  return { release, sets, releasedOn, out: isOut(releasedOn, today), sealed, cards };
}

// ── the optional sections of the data-driven posts (movers, cheapest mythics by colour, Commander staples, cheapest boxes, Star Trek) ──────────
// Each is built ONCE per instance and data commit (memoByRef, the data layer's memo of derived shapes, keyed by the pointer: never
// unstable_cache, and no loader runs inside a cache callback), because postContext runs for every post render, for /blog (every post's hero)
// and for every blog share image. What one build costs is in DECISIONS.md ("Four data-driven posts", 2026-10-14); a request after the first
// pays a map lookup. A build that fails is not kept (memoByRef drops a rejected promise, the next request builds again) and THIS request gets
// null for the section: the post says the data could not be read, so a bad read degrades one post, never /blog or the other posts. The loaders
// are exported for tests/blog-posts.test.ts; pages reach them only through postContext.
export async function perCommit<T>(name: string, build: () => Promise<T>): Promise<T | null> {
  try {
    const { ptr } = await planeSource();
    return await memoByRef(`blog:${name}`, memoKey(ptr), build);
  } catch (err) {
    console.warn(`[blog] the ${name} section could not be read: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** The four published movers feeds (mv/<dir>-<7|30>-a.json: headline units, one per card), at the floor of the movers post. 4 small files and one hydration of at most 70 ids. */
export async function loadMovers(): Promise<MoversView> {
  const feed = (dir: "up" | "down", window: 7 | 30, n: number) => getMovers({ dir, window, minCents: MOVER_FLOOR_CENTS, n });
  const [up7, down7, up30, down30] = await Promise.all([feed("up", 7, MOVER_ROWS + 5), feed("down", 7, MOVER_ROWS + 5), feed("up", 30, MONTH_MOVER_ROWS + 5), feed("down", 30, MONTH_MOVER_ROWS + 5)]);
  return { up7, down7, up30, down30 };
}

/** The newest expansions' cheapest mythic rares: one engine query per colour group and one over the special frames (8 in-memory queries, 48 rows each, no file beyond the browse index). */
export async function loadMythics(): Promise<MythicBoards> {
  const { sets } = await getSetIndex();
  const picks = newestExpansions(sets, new Date().toISOString().slice(0, 10));
  if (!picks.length) return { sets: [], groups: [], treated: [] };
  const page = (extra: Partial<CardQuery>) => getCardPage({ setIds: picks.map((s) => s.id), rarities: ["M"], sort: "price-asc", page: 1, per: 48, ...extra });
  const [groups, treated] = await Promise.all([
    Promise.all(COLOUR_GROUPS.map(async (g) => ({ key: g.key, cards: cheapestPerCard((await page({ colors: g.colors })).items, MYTHIC_ROWS) }))),
    page({ treats: [...BLING_TREATMENTS] }).then((p) => cheapestPerCard(p.items, TREATED_ROWS)),
  ]);
  return { sets: picks, groups, treated };
}

/**
 * COMMANDER_STAPLES by name: resolveOracles (the name table, then the Oracle shards of the matched cards: at most one small file per staple)
 * and namePrintings (ONE pass over the browse index for every staple), which prices each card at its ORDINARY printing: the cheapest plain
 * printing of a main or Commander set by MARKET price, the printing the site's search opens for the name (search.ts ordinaryPrinting).
 */
export async function loadStaples(): Promise<StapleRow[]> {
  const oracles = await resolveOracles(COMMANDER_STAPLES.map((s) => fold(s.name)));
  const hits = [...oracles.values()].map((o): NameHit => ({ oracleNo: o.no, name: o.name, oracleSlug: o.slug, topSlug: "", nPrint: o.nPrint, topCents: null }));
  const printings = hits.length ? await namePrintings(hits) : new Map<number, CardLite>();
  return stapleRows(COMMANDER_STAPLES, oracles, printings, fold);
}

/** Every released Booster Box product, cheapest TCGplayer market first (in-memory pages over the sealed list the booster-box post already reads; at most 5 pages). */
export async function loadCheapBoxes(): Promise<SealedLite[]> {
  const out: SealedLite[] = [];
  for (let page = 1; page <= 5; page++) {
    const r = await getSealedPage({ kind: "Booster Box", presale: false, sort: "price-asc", page, per: 100 });
    out.push(...r.items);
    if (page >= r.pages) break;
  }
  return out;
}

/**
 * The Star Trek posts' lookups (blog/star-trek.ts): NAMED_CARDS and the ten shock lands by name through resolveOracles (the name table, then
 * one small Oracle shard per matched name), the main set's printings of the shock lands (one engine query, 10 Oracle numbers), and the keyword
 * index (the memoised keyword table /keywords reads) filtered to the set's mechanics. A name the catalogue lacks is simply absent: the post
 * names the card without a link.
 */
export async function loadStarTrek(): Promise<StarTrekView> {
  const [{ byTok }, keywords, oracles] = await Promise.all([getSetIndex(), getKeywordIndex(), resolveOracles([...NAMED_CARDS, ...SHOCK_LANDS])]);
  const main = byTok.get(STAR_TREK.toks[0]!);
  const shockNos = SHOCK_LANDS.map((n) => oracles.get(fold(n))?.no).filter((n): n is number => n != null);
  const shocks = main && shockNos.length ? (await getCardPage({ setIds: [main.id], oracleNos: shockNos, sort: "number", page: 1, per: 48 })).items : [];
  const named = new Map(NAMED_CARDS.map((n) => fold(n)).flatMap((k) => { const o = oracles.get(k); return o ? [[k, o] as const] : []; }));
  const want = new Set<string>(STAR_TREK_KEYWORDS);
  return { oracles: named, shocks, keywords: keywords.filter((k) => want.has(k.slug)) };
}

/** The bounded views every post draws from. One request, a few dozen in-memory queries and published files; never the whole catalogue. */
export async function postContext(country: Country): Promise<PostContext> {
  const [stats, site, index, setIndex, overview, top, topFoil, boxes, rarities, recs, movers, mythics, staples, cheapBoxes, starTrek] = await Promise.all([
    getCatalogStats(),
    getSiteStats(),
    getIndexSeries(),
    getSetIndex(),
    getMarketOverview(),
    getCardPage(dearest()),
    getCardPage({ finish: "F", sort: "value", page: 1, per: 24 }),
    getSealedPage({ kind: "Booster Box", presale: false, sort: "value", page: 1, per: 48 }),
    Promise.all(RARITY_KEYS.filter((r) => r === "M" || r === "R" || r === "U" || r === "C").map(rarityRow)),
    Promise.all(MARKETS.map((m) => getMarketRecords(m))),
    perCommit("movers", loadMovers),
    perCommit("mythics", loadMythics),
    perCommit("staples", loadStaples),
    perCommit("boxes", loadCheapBoxes),
    perCommit("star-trek", loadStarTrek),
  ]);
  const totals = new Map(overview.sets.map((s) => [s.setId, { n: s.n, total: s.totalCents }] as const));
  const [newest, boards, releases] = await Promise.all([newestSet(setIndex.sets, totals), valueBoards(setIndex.sets, totals), Promise.all(PREORDER_RELEASES.map((r) => releaseView(r, setIndex)))]);
  const records = Object.fromEntries(MARKETS.map((m, i) => [m, recs[i]])) as PostContext["records"];
  return {
    cat: { pricesAt: stats.pricesAt },
    stats,
    site,
    index,
    sets: setIndex.sets,
    setById: setIndex.byId,
    overview,
    records,
    top: top.items,
    topFoil: topFoil.items,
    rarities,
    newest,
    boards,
    boxes: boxes.items,
    releases,
    movers,
    mythics,
    staples,
    cheapBoxes,
    starTrek,
    country,
  };
}
