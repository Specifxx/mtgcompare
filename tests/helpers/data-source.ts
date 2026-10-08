// tests/helpers/data-source.ts (owner WP02). `src/lib/data.ts` is the folder `src/lib/data/` (a barrel plus one module per domain, and plane/). The ten tests that grep the old file as text
// (best-basket-redesign, deals, demand-finder, ebay-claims, history, portfolio-orphaned-card, portfolio-performance, rising-cards, sealed-offers, set-checklist) call readDataSource() or readDataModule(name) instead.
// Each file is prefixed with a marker line so a test can still slice "the block of file X".
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.TEST_ROOT ?? path.resolve(__dirname, "../..");
export function dataFiles(root: string = ROOT): string[] {
  const dir = path.join(root, "src/lib/data");
  if (!fs.existsSync(dir)) return [];
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  return walk(dir).filter((f) => /\.ts$/.test(f)).sort();
}
export function readDataSource(root: string = ROOT): string {
  return dataFiles(root).map((f) => `// FILE ${path.relative(root, f).replace(/\\/g, "/")}\n${fs.readFileSync(f, "utf8")}`).join("\n");
}
/** The text of ONE data module, e.g. readDataModule("deals") or readDataModule("plane/entitlement"). */
export function readDataModule(name: string, root: string = ROOT): string { return fs.readFileSync(path.join(root, "src/lib/data", `${name}.ts`), "utf8"); }

// ── a published tree of REAL Magic products, derived from tests/fixtures/magic-products.json (the 57 products of Annex A: real TCGCSV ids, names, groups and 2026-10-07 prices, real Scryfall ids and oracle ids) ─────────────────────────────────────────
// For the loader tests: every row is a column of the fixture or a deterministic function of it (the bucket, shard and index layouts are the publisher's, shards.ts). What the fixture does not carry is left empty, never invented: no oracle text, no mana cost, no
// legality ("?" is the honest unknown), no change figures, no history, no store offers. Products with no price at all are left out (they have no catalogue row).
import os from "node:os";
import { CARD_FLAGS, LINK, PRICE_MASK, nsort } from "../../src/lib/constants";
import { memTree, type MutableTree } from "../../src/lib/data/plane/tree";
import { bucketPath, cardBucket, ixPath, oracleShard, scShard, slugShard } from "../../src/lib/data/plane/shards";

interface FixtureProduct {
  productId: number; name: string; groupId: number; group: string; groupKind: string; tcgNumber: string | null; tcgRarity: string; prices: Partial<Record<"Normal" | "Foil", { market: number | null; low: number | null }>>;
  expect: { slug: string; setTok: string; cls: number | "sealed"; rarity: string | null; nkey: string | null; hasN: boolean; hasF: boolean; etched: boolean; displayName: string | null; alt: string | null; fnum: string | null; sc: string | null; layout: string; link: string };
  scryfall: { id: string; set: string; cn: string; name: string; oracle_id: string; edhrec_rank: number | null }[];
}
const cents = (v: number | null | undefined): number | null => (v == null ? null : Math.round(v * 100));
const kebab = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const REAL_PRICE_DAY = "2026-10-07";
/** The 57-product fixture as a published tree (cat, px, un for the tracked units, slug, sc, or, nm, meta, ix, ss/runs, status.json). Product ids and slugs are the fixture's; `oracleNo` is the rank of the Scryfall oracle id among the fixture's. */
export function realMiniTree(): MutableTree {
  const all = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/magic-products.json"), "utf8")) as FixtureProduct[];
  const priced = all.filter((p) => Object.values(p.prices).some((q) => q && (q.market != null || q.low != null))), sealed = priced.filter((p) => p.expect.cls === "sealed"), ps = priced.filter((p) => typeof p.expect.cls === "number").sort((a, b) => a.productId - b.productId);
  const t = memTree(), j = (v: unknown): string => JSON.stringify(v);
  const oracleIds = [...new Set(ps.map((p) => p.scryfall[0]?.oracle_id).filter((x): x is string => !!x))].sort(), oracleNo = new Map(oracleIds.map((o, i) => [o, i + 1] as const));
  const groups = new Map<number, FixtureProduct>(); for (const p of ps) if (!groups.has(p.groupId)) groups.set(p.groupId, p);
  for (const p of sealed) if (!groups.has(p.groupId)) groups.set(p.groupId, p);
  const count = (g: number): number => ps.filter((p) => p.groupId === g).length;
  const mask = (p: FixtureProduct): number => {
    const n = p.prices.Normal, f = p.prices.Foil; let m = PRICE_MASK.LISTED;
    if (n) { m |= PRICE_MASK.HASN; if (n.market == null) m |= PRICE_MASK.LOWN; if ((n.market ?? 0) >= 5) m |= PRICE_MASK.TRACKN; }
    if (f) { m |= PRICE_MASK.HASF; if (f.market == null) m |= PRICE_MASK.LOWF; if ((f.market ?? 0) >= 5) m |= PRICE_MASK.TRACKF; }
    if (!n) m |= PRICE_MASK.HEADF; else if (n.market == null && f?.market != null) m |= PRICE_MASK.HEADF;
    return m;
  };
  const tracked = (m: number): boolean => (m & (PRICE_MASK.TRACKN | PRICE_MASK.TRACKF)) !== 0;
  // sets and Scryfall sets
  const setRow = (g: FixtureProduct): unknown[] => [g.groupId, `${g.expect.setTok}-${kebab(g.group)}`, g.expect.setTok, g.expect.setTok.toUpperCase(), g.group, 0, g.groupKind, 0, 0, g.expect.sc ?? 0, count(g.groupId), ps.filter((p) => p.groupId === g.groupId && tracked(mask(p))).length, 0];
  t.write("meta/sets.json", j({ v: 1, at: REAL_PRICE_DAY, sets: [...groups.values()].map(setRow) }));
  const scs = [...new Set(ps.map((p) => p.expect.sc).filter((x): x is string => !!x))].sort();
  t.write("meta/scrysets.json", j({ v: 1, sets: scs.map((c) => [c, groups.get(ps.find((p) => p.expect.sc === c)!.groupId)!.group, "expansion", 0, 0]) }));
  // identity and prices by bucket
  const byBucket = new Map<number, FixtureProduct[]>(); for (const p of ps) (byBucket.get(cardBucket(p.productId)) ?? byBucket.set(cardBucket(p.productId), []).get(cardBucket(p.productId))!).push(p);
  const LINKS: Record<string, number> = { none: LINK.NONE, id: LINK.ID, etched: LINK.ETCHED, fallback: LINK.FALLBACK, variant: LINK.VARIANT };
  const unByBucket = new Map<number, unknown[]>();
  for (const [b, list] of byBucket) {
    t.write(bucketPath("cat", b), j({ v: 1, b, c: list.map((p) => [p.productId, p.expect.slug, p.expect.displayName ?? p.name, p.expect.alt ?? 0, p.groupId, p.expect.sc ?? 0, p.tcgNumber ?? 0, p.expect.fnum ?? 0, p.expect.rarity ?? "C", p.expect.cls as number, "", 0, CARD_FLAGS.TCGIMG | (p.expect.etched ? CARD_FLAGS.ETCHED : 0), LINKS[p.expect.link] ?? 0, oracleNo.get(p.scryfall[0]?.oracle_id ?? "") ?? 0, p.scryfall[0]?.id ?? 0, 0, 0, 0, 0, 9]) }));
    t.write(bucketPath("px", b), j({ v: 1, b, p: list.map((p) => [p.productId, cents(p.prices.Normal?.market), cents(p.prices.Foil?.market), cents(p.prices.Normal?.low), cents(p.prices.Foil?.low), mask(p)]) }));
    for (const p of list) for (const [fin, key] of [[0, "Normal"], [1, "Foil"]] as const) {
      const q = p.prices[key]; if (!q || (q.market ?? 0) < 5) continue;
      (unByBucket.get(b) ?? unByBucket.set(b, []).get(b)!).push([p.productId * 2 + fin, [cents(q.low), null, null, null, null, null], [0, 0, 0, 0, 0, 0], [null, null, null, null, null, null]]);
    }
  }
  for (const [b, u] of unByBucket) t.write(bucketPath("un", b), j({ v: 1, b, at: REAL_PRICE_DAY, u }));
  t.write("meta/buckets.json", j({ v: 1, width: 256, cat: [...byBucket.keys()].sort((x, y) => x - y), tracked: [...unByBucket.keys()].sort((x, y) => x - y) }));
  // sealed products are rows of sl/list, never of cat (the fixture holds one with a price: the Secret Lair x Marvel's Deadpool drop)
  t.write("sl/list-0.json", j({ v: 1, at: REAL_PRICE_DAY, chunk: 0, chunks: 1, s: sealed.map((p) => [p.productId, p.expect.slug, p.name, p.groupId, "Secret Lair Drop", 0, 0, 0, cents(p.prices.Normal?.market), cents(p.prices.Normal?.low), 0, 0, null]) }));
  // lookups: card slugs and oracle slugs share the slug shards
  const slugs = new Map<string, { s: [string, number][]; o: [string, number][] }>(); const shard = (s: string) => slugs.get(slugShard(s)) ?? slugs.set(slugShard(s), { s: [], o: [] }).get(slugShard(s))!;
  const oracleRows: unknown[][] = []; const oracleOf = new Map<number, FixtureProduct[]>();
  for (const p of ps) { shard(p.expect.slug).s.push([p.expect.slug, p.productId]); const no = oracleNo.get(p.scryfall[0]?.oracle_id ?? ""); if (no) (oracleOf.get(no) ?? oracleOf.set(no, []).get(no)!).push(p); }
  for (const [no, list] of oracleOf) { const sc0 = list[0]!.scryfall[0]!; const slug = kebab(sc0.name); shard(slug).o.push([slug, no]); oracleRows.push([no, sc0.oracle_id, slug, sc0.name, "", 0, "", 0, 0, "?".repeat(22), sc0.edhrec_rank ?? 0, 0, list[0]!.expect.layout === "normal" ? 0 : list[0]!.expect.layout, 0, 0, 0, "", 0, list.length]); }
  for (const [h, v] of slugs) t.write(`slug/${h}.json`, j({ v: 1, h: Number.parseInt(h, 16), s: v.s.sort((a, c) => (a[0] < c[0] ? -1 : 1)), o: v.o.sort((a, c) => (a[0] < c[0] ? -1 : 1)), z: [] }));
  const sc: Record<string, Record<string, Record<string, number[]>>> = {};
  for (const p of ps) if (p.expect.sc && p.expect.nkey) { const s = (sc[scShard(p.expect.sc)] ??= {}); ((s[p.expect.sc] ??= {})[p.expect.nkey] ??= []).push(p.productId); }
  for (const [h, s] of Object.entries(sc)) t.write(`sc/${h}.json`, j({ v: 1, h: Number.parseInt(h, 16), s }));
  const orShards = new Map<string, unknown[][]>(); for (const r of oracleRows) (orShards.get(oracleShard(r[0] as number)) ?? orShards.set(oracleShard(r[0] as number), []).get(oracleShard(r[0] as number))!).push(r);
  for (const [h, o] of orShards) t.write(`or/${h}.json`, j({ v: 1, h: Number.parseInt(h, 16), o }));
  t.write("nm/0.json", j({ v: 1, n: 0, r: oracleRows.map((r) => [r[0], r[3], r[2], 0, r[18], null, 0]) }));
  // the browse index: the listed rows sorted by id
  const dictSc = ["", ...scs]; const k = ps;
  t.write("ix/dict.json", j({ v: 1, chunk: 8192, rows: k.length, sc: dictSc, tr: [""], lb: [""] }));
  t.write(ixPath("k", 0), j({ v: 1, n: k.length, id: k.map((p) => p.productId), slug: k.map((p) => p.expect.slug), name: k.map((p) => p.expect.displayName ?? p.name), set: k.map((p) => p.groupId), sc: k.map((p) => dictSc.indexOf(p.expect.sc ?? "")), num: k.map((p) => p.tcgNumber ?? ""), ns: k.map((p) => nsort(p.tcgNumber)), rar: k.map((p) => p.expect.rarity ?? "C").join(""), cls: k.map((p) => String(p.expect.cls)).join(""), tr: k.map(() => 0), lb: k.map(() => 0), fl: k.map((p) => CARD_FLAGS.TCGIMG | (p.expect.etched ? CARD_FLAGS.ETCHED : 0)), or: k.map((p) => oracleNo.get(p.scryfall[0]?.oracle_id ?? "") ?? 0), co: k.map(() => 0), mv: k.map(() => 0), pt: "9".repeat(k.length), alt: Object.fromEntries(k.flatMap((p, r) => (p.expect.alt ? [[r, p.expect.alt]] : []))), sid: Object.fromEntries(k.flatMap((p, r) => (p.scryfall[0] ? [[r, p.scryfall[0].id]] : []))) }));
  t.write(ixPath("p", 0), j({ v: 1, n: k.length, mn: k.map((p) => cents(p.prices.Normal?.market) ?? -1), mf: k.map((p) => cents(p.prices.Foil?.market) ?? -1), ln: k.map((p) => cents(p.prices.Normal?.low) ?? -1), lf: k.map((p) => cents(p.prices.Foil?.low) ?? -1), mk: k.map(mask), t: [] }));
  const none6 = [-1, -1, -1, -1, -1, -1], zero6 = [0, 0, 0, 0, 0, 0];                                   // ix/s rows: [row, finish, low x6, stores x6, storeMin x6]; the US low of a tracked unit is TCGplayer's own low
  t.write(ixPath("s", 0), j({ v: 1, at: REAL_PRICE_DAY, u: k.flatMap((p, r) => (["Normal", "Foil"] as const).flatMap((key, fin) => { const q = p.prices[key]; return q && (q.market ?? 0) >= 5 ? [[r, fin, cents(q.low) ?? -1, ...none6.slice(1), ...zero6, ...none6]] : []; })) }));
  t.write("ix/odict.json", j({ v: 1, legal: ["", "?".repeat(22)], keywords: [""] }));
  const n = oracleIds.length; t.write("ix/o-0.json", j({ v: 1, n, no: oracleIds.map((_, i) => i + 1), co: oracleIds.map(() => 0), idn: oracleIds.map(() => 0), lg: oracleIds.map(() => 1), ed: oracleIds.map((o) => oracleOf.get(oracleNo.get(o)!)![0]!.scryfall[0]!.edhrec_rank ?? -1), fl: oracleIds.map(() => 0), kw: oracleIds.map(() => 0) }));
  t.write("ss/runs.json", j({ v: 1, at: `${REAL_PRICE_DAY}T21:41:07Z`, r: [] }));
  t.write("status.json", j({ v: 1, at: `${REAL_PRICE_DAY}T21:41:07Z`, by: "publish", counts: { cards: ps.length, listed: ps.length, thin: 0, tracked: [...unByBucket.values()].flat().length, oracles: oracleIds.length, sets: groups.size, sealed: 0, offers: 0, files: t.files().length, bytesRaw: 0, bytesGz: 0 } }));
  return t;
}
/** Writes a tree as a PLANE_DIR (`<dir>/v1/**` and `<dir>/latest.json`) in a fresh temporary directory and returns it. `ptr` overrides fields of the pointer. */
export function writePlaneDir(tree: { files(): string[]; read(rel: string): string }, ptr: Record<string, unknown> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mtgc-plane-"));
  for (const f of tree.files()) { const p = path.join(dir, "v1", f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, tree.read(f)); }
  fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify({ v: 1, seq: 7, ref: "b".repeat(40), publishedAt: `${REAL_PRICE_DAY}T21:41:07Z`, priceDay: REAL_PRICE_DAY, tcgcsv: "", scryfall: "", phase: "full", format: "v1", counts: { cards: tree.files().length, units: 0, files: tree.files().length }, manifestSha256: "0".repeat(64), prev: null, repo: "Specifxx/mtgcompare-data", histCut: REAL_PRICE_DAY, pvAt: null, ...ptr }));
  return dir;
}
