import { MAIN_SET_KINDS, RARITY_KEYS, RELEASE_SET_KINDS, rarityLabel } from "../constants";
import type { Country } from "../country";
import { MARKETS } from "../country";
import { getCardPage, getIndexSeries, getMarketOverview, getMarketRecords, getSealedPage, getSetIndex, getSetHighlights, getSiteStats, getCatalogStats } from "../data";
import type { SetLite } from "../data";
import type { PostContext, RarityRow, SetBoard } from "./types";

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

/** The bounded views every post draws from. One request, a few dozen in-memory queries and published files; never the whole catalogue. */
export async function postContext(country: Country): Promise<PostContext> {
  const [stats, site, index, setIndex, overview, top, topFoil, boxes, rarities, recs] = await Promise.all([
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
  ]);
  const totals = new Map(overview.sets.map((s) => [s.setId, { n: s.n, total: s.totalCents }] as const));
  const [newest, boards] = await Promise.all([newestSet(setIndex.sets, totals), valueBoards(setIndex.sets, totals)]);
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
    country,
  };
}
