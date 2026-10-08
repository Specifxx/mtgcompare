// owner: WP11
// src/lib/data/commanders.ts: the section "commanders.ts" of api.ts (contract 7.12). The commander list and the commander page. Kind P/M: published files only (ix/o for the flags and identity, nm for the names, or/ for the rules text),
// memoised by data ref, no unstable_cache. The decks of a commander page are the one allowed Neon read (getLibraryDecks, 7.13), caught here so an outage shows no decks and nothing else. The names, arguments and result types are FROZEN.
import { ORACLE_FLAGS, fold } from "../constants";
import type { LibraryDeckRow } from "./decks";
import { getLibraryDecks } from "./decks";
import { getOracleBySlug, getOraclePrintings } from "./catalog";
import { oracleFromRow, oracleMiniOf } from "./lite";
import type { IxO, IxOdict, NameFile, OracleShard } from "./plane/formats";
import { memoByRef, memoKey, optionalOf, planeSource } from "./plane/runtime";
import { nameChunkPath, oraclePath } from "./plane/shards";
import type { CardMini, OracleDetail, OracleMini } from "./types";

const ORACLE_IX_CHUNK = 16_384;
const NAME_CHUNK_MAX = 64;                                                   // nm/ holds the whole oracle list in a few files; a runaway chain never loops forever
interface CommanderRow { no: number; name: string; slug: string; nameKey: string; colors: number; identity: number; legal: string; flags: number; nPrint: number; rank: number }

/** Every commander-eligible oracle (ORACLE_FLAGS.COMMANDER), sorted by EDHREC rank (unranked last) then name. About 3,500 rows; held once per data ref. */
function commanderList(): Promise<CommanderRow[]> {
  return planeSource().then(({ src, ptr }) => memoByRef("commanders", memoKey(ptr), async () => {
    const odict = await src.json<IxOdict>("ix/odict.json"), picked = new Map<number, Omit<CommanderRow, "name" | "slug" | "nameKey" | "nPrint">>();
    for (let c = 0; ; c++) {
      const f = await optionalOf<IxO>(src, `ix/o-${c}.json`); if (!f) break;
      f.no.forEach((no, r) => { if ((f.fl[r]! & ORACLE_FLAGS.COMMANDER) !== 0) picked.set(no, { no, colors: f.co[r]!, identity: f.idn[r]!, legal: odict.legal[f.lg[r]!] ?? "", flags: f.fl[r]!, rank: f.ed[r]! > 0 ? f.ed[r]! : 1e9 }); });
      if (f.no.length < ORACLE_IX_CHUNK) break;
    }
    const out: CommanderRow[] = [];
    for (let n = 0; n < NAME_CHUNK_MAX && out.length < picked.size; n++) {
      const f = await optionalOf<NameFile>(src, nameChunkPath(n)); if (!f) break;
      for (const r of f.r) { const p = picked.get(r[0]); if (p) out.push({ ...p, name: r[1], slug: r[2], nameKey: fold(r[1]), nPrint: r[4] }); }
    }
    return out.sort((a, b) => a.rank - b.rank || (a.name < b.name ? -1 : a.name > b.name ? 1 : a.no - b.no));
  }));
}

/** P ix/o + nm. `identity` is a WUBRG mask: only commanders whose colour identity fits inside it. `q` is a name filter (folded substring). Pages are 1-based; a page past the end is empty. */
export async function getCommanderPage(o: { identity?: number; q?: string; page: number; per: 24 | 48 | 100 }): Promise<{ total: number; pages: number; items: OracleMini[] }> {
  const per = o.per === 48 || o.per === 100 ? o.per : 24, page = Math.max(1, Math.floor(Number(o.page)) || 1), q = fold(o.q).slice(0, 60).trim();
  const mask = o.identity == null ? null : Math.floor(Number(o.identity)) & 31;
  const rows = (await commanderList()).filter((r) => (mask == null || (r.identity & ~mask) === 0) && (!q || r.nameKey.includes(q)));
  const slice = rows.slice((page - 1) * per, page * per), { src } = await planeSource(), shards = new Map<string, Map<number, OracleDetail>>();
  await Promise.all([...new Set(slice.map((r) => oraclePath(r.no)))].map(async (rel) => {
    const f = await optionalOf<OracleShard>(src, rel); if (f) shards.set(rel, new Map(f.o.map((r) => [r[0], oracleFromRow(r)] as const)));
  }));
  const items = slice.map((r): OracleMini => {
    const d = shards.get(oraclePath(r.no))?.get(r.no);
    return d ? oracleMiniOf(d) : { no: r.no, slug: r.slug, name: r.name, nameKey: r.nameKey, colors: r.colors, identity: r.identity, typeLine: "", nPrint: r.nPrint, legal: r.legal, flags: r.flags };
  });
  return { total: rows.length, pages: Math.max(1, Math.ceil(rows.length / per)), items };
}

/** One commander: the oracle (null for an unknown slug or a card that cannot lead a deck), its first printings by market, and the library decks that name it (empty when Neon is down). */
export async function getCommanderBySlug(slug: string): Promise<{ oracle: OracleDetail; printings: CardMini[]; decks: LibraryDeckRow[] } | null> {
  const oracle = await getOracleBySlug(slug);
  if (!oracle || (oracle.flags & ORACLE_FLAGS.COMMANDER) === 0) return null;
  const [printings, decks] = await Promise.all([getOraclePrintings(oracle.no, 1, 24), getLibraryDecks().catch((): LibraryDeckRow[] => [])]);
  return { oracle, printings: printings.items, decks: decks.filter((d) => d.commanderSlug === oracle.slug) };
}
