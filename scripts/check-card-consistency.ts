// scripts/check-card-consistency.ts (owner WP19, parity P03; the sibling of RiftCompare's script of the same name, whose pages derived "cheapest price" in five places from three sources and drifted).
// The PRICE half of the data-integrity audit, over the PUBLISHED tree. A price is stored once (px/, TCGplayer market and low per finish) and COPIED into five other families so that no page needs to join them:
// the set boards (st/), the browse index (ix/p), the typeahead table (nm/), the home tiles (hm/) and the movers (mv/). The copies are written by one publish; this proves they still agree, row by row, and that the
// store aggregates (un/, ix/s) can be explained by the offers they summarise (of/). A card that shows one figure in a list and another on its page fails here, not in front of a shopper.
//
//   npx tsx scripts/check-card-consistency.ts [--dir .data] [--json]        (read-only; exit 1 on any `error`)
//
// The HEADLINE is Normal first (C2, price.ts): the Foil quote is the headline only when no Normal price exists (the HEADF bit), and the figure shown is the market, else the thin low. Every cent is an integer USD
// cent in px/ and a market-currency cent in un/ and of/. The rules below were calibrated on the real 99,079-row tree of 2026-10-07 (0 findings) and on the golden mini tree of the tests.
import fs from "node:fs";
import path from "node:path";
import { PRICE_MASK } from "../src/lib/constants";
import type { BoardFile, HomeFile, IxK, IxP, IxS, MoversFile, NameFile, OfferFile, PxRow, UnFile } from "../src/lib/data/plane/formats";
import { fsTree, type TreeView } from "../src/lib/data/plane/tree";
import type { Finding, Level } from "./audit-publication";

const M = PRICE_MASK;
export const MAX_SANE_CENTS = 100_000_000;                                  // $1,000,000: the dearest real quote on 2026-10-07 is $203,067
const CAP = 12;
const rd = <T,>(t: TreeView, rel: string): T => JSON.parse(t.read(rel)) as T;
/** The headline quote of a px row (Normal first; the market, else the thin low), or null. */
export function headlineCents(p: PxRow): number | null {
  const [, mN, mF, lN, lF, mask] = p;
  if (mask & M.HEADF) return mF ?? lF ?? null;
  return mN ?? lN ?? null;
}
const dearestMarket = (p: PxRow): number | null => { const a = [p[1], p[2]].filter((x): x is number => x != null); return a.length ? Math.max(...a) : null; };

export function evaluateConsistency(t: TreeView): Finding[] {
  const out: Finding[] = []; const seen = new Map<string, number>();
  const add = (level: Level, code: string, message: string) => { const n = (seen.get(code) ?? 0) + 1; seen.set(code, n); if (n <= CAP) out.push({ level, code, message }); else if (n === CAP + 1) out.push({ level, code, message: `...more ${code} findings not listed` }); };
  const files = t.files(), px = new Map<number, PxRow>(), slugId = new Map<string, number>();
  for (const f of files) {
    if (f.startsWith("px/")) for (const r of rd<{ p: PxRow[] }>(t, f).p) px.set(r[0], r);
    else if (f.startsWith("cat/")) for (const r of rd<{ c: [number, string][] }>(t, f).c) slugId.set(r[1], r[0]);
  }
  // 0. each px row on its own: integers, a mask that says what the numbers say
  for (const p of px.values()) {
    const [id, mN, mF, lN, lF, mask] = p, tag = String(id);
    for (const [name, v] of [["marketN", mN], ["marketF", mF], ["lowN", lN], ["lowF", lF]] as const) {
      if (v == null) continue;
      if (!Number.isInteger(v) || v <= 0) add("error", "PRICE_SHAPE", `${tag}: ${name} ${v} is not a positive whole number of cents`);
      else if (v > MAX_SANE_CENTS) add("warn", "PRICE_RANGE", `${tag}: ${name} ${v} is over $${(MAX_SANE_CENTS / 100).toLocaleString("en-US")}`);
    }
    if (Boolean(mask & M.HASN) !== (mN != null || lN != null)) add("error", "MASK_HASN", `${tag}: HASN ${mask & M.HASN ? "set" : "clear"} but marketN/lowN are ${mN ?? "null"}/${lN ?? "null"}`);
    if (Boolean(mask & M.HASF) !== (mF != null || lF != null)) add("error", "MASK_HASF", `${tag}: HASF ${mask & M.HASF ? "set" : "clear"} but marketF/lowF are ${mF ?? "null"}/${lF ?? "null"}`);
    if (Boolean(mask & M.LOWN) !== (mN == null && lN != null)) add("error", "MASK_LOWN", `${tag}: LOWN does not say whether Normal has only a thin low`);
    if (Boolean(mask & M.LOWF) !== (mF == null && lF != null)) add("error", "MASK_LOWF", `${tag}: LOWF does not say whether Foil has only a thin low`);
    if (Boolean(mask & M.HEADF) !== (!(mask & M.HASN) && Boolean(mask & M.HASF))) add("error", "MASK_HEADF", `${tag}: HEADF must be set exactly when Foil is the only finish with a price (Normal is the headline whenever it has one)`);
    if ((mask & M.TRACKN) && mN == null) add("error", "TRACK_NO_MARKET", `${tag}: Normal is tracked without a market price (a thin low is never ranked)`);
    if ((mask & M.TRACKF) && mF == null) add("error", "TRACK_NO_MARKET", `${tag}: Foil is tracked without a market price`);
  }
  // 1. the set boards carry the same five numbers (marketN, marketF, lowN, lowF, mask) as px for the same id
  for (const f of files.filter((x) => x.startsWith("st/"))) {
    for (const r of rd<BoardFile>(t, f).c) {
      const p = px.get(r[0]); if (!p) { add("error", "BOARD_NO_PX", `${f}: ${r[0]} has no px row`); continue; }
      if (r[10] !== p[1] || r[11] !== p[2] || r[12] !== p[3] || r[13] !== p[4] || r[14] !== p[5]) add("error", "BOARD_VS_PX", `${f}: ${r[0]} ${r[1]} shows ${r.slice(10, 15).join("/")}, px says ${p.slice(1, 6).join("/")}`);
    }
  }
  // 2. the browse index (columnar) carries the same numbers, -1 for none
  for (const f of files.filter((x) => /^ix\/k-\d+\.json$/.test(x))) {
    const c = f.slice(5, -5), pf = `ix/p-${c}.json`; if (!t.has(pf)) { add("error", "IX_NO_P", `${f} has no ${pf}`); continue; }
    const K = rd<IxK>(t, f), P = rd<IxP>(t, pf);
    K.id.forEach((id, i) => {
      const p = px.get(id); if (!p) { add("error", "IX_NO_PX", `${f}: ${id} has no px row`); return; }
      const want = [p[1] ?? -1, p[2] ?? -1, p[3] ?? -1, p[4] ?? -1, p[5]], got = [P.mn[i], P.mf[i], P.ln[i], P.lf[i], P.mk[i]];
      if (want.join() !== got.join()) add("error", "IX_VS_PX", `${pf}: row ${i} (${id}) is ${got.join("/")}, px says ${want.join("/")}`);
    });
  }
  // 3. the typeahead table: the price of the top printing is its dearest market (a shared-id star twin can make Foil the dearer finish)
  for (const f of files.filter((x) => /^nm\/\d+\.json$/.test(x))) {
    for (const r of rd<NameFile>(t, f).r) {
      if (!r[3]) continue;
      const id = slugId.get(r[3]); if (id === undefined) { add("error", "NM_TOP_SLUG", `${f}: ${r[2]} names top printing ${r[3]}, which is not in cat/`); continue; }
      const want = dearestMarket(px.get(id)!);
      if (want !== null && r[5] !== want) add("error", "NM_VS_PX", `${f}: ${r[1]} shows ${r[5]} for ${r[3]}, px says ${want}`);
    }
  }
  // 4. the home tiles: the headline of the card
  if (t.has("hm/home.json")) {
    const h = rd<HomeFile>(t, "hm/home.json");
    for (const k of ["chase", "popular", "up", "down"] as const) for (const r of h[k]) {
      const p = px.get(r[0]); if (!p) { add("error", "HOME_NO_PX", `hm/home.json ${k}: ${r[0]} has no px row`); continue; }
      const want = headlineCents(p); if (r[8] !== want) add("error", "HOME_VS_PX", `hm/home.json ${k}: ${r[2]} shows ${r[8]}, the headline is ${want}`);
    }
  }
  // 5. the movers: the market of the moving unit
  for (const f of files.filter((x) => /^mv\/.*\.json$/.test(x))) {
    for (const r of rd<MoversFile>(t, f).r) {
      const p = px.get(r[0]); if (!p) { add("error", "MOVER_NO_PX", `${f}: ${r[0]} has no px row`); continue; }
      const want = r[1] === 0 ? p[1] : p[2]; if (r[8] !== want) add("error", "MOVER_VS_PX", `${f}: ${r[3]} (${r[1] === 0 ? "Normal" : "Foil"}) shows ${r[8]}, px says ${want}`);
    }
  }
  // 6. the store aggregates against the offers they summarise: un/ is a SUMMARY of of/ (over the fresh in-stock subset), so it can never claim a cheaper store than any offer, nor more stores than the offers name
  const offers = new Map<string, { min: number; stores: Set<number> }>();
  for (const f of files.filter((x) => x.startsWith("of/"))) for (const o of rd<OfferFile>(t, f).o) {
    if (o[5] !== 1) continue; const k = `${o[0]}|${o[1]}`, e = offers.get(k) ?? { min: Infinity, stores: new Set<number>() };
    e.min = Math.min(e.min, o[3]); e.stores.add(o[2]); offers.set(k, e);
  }
  const unOf = new Map<number, UnFile["u"][number]>();
  for (const f of files.filter((x) => x.startsWith("un/"))) for (const r of rd<UnFile>(t, f).u) {
    unOf.set(r[0], r);
    for (let m = 0; m < 6; m++) {
      const low = r[1][m], n = r[2][m]!, sMin = r[3][m], e = offers.get(`${r[0]}|${m}`);
      if (n > 0 && sMin == null) add("error", "UN_STORES_NO_MIN", `${f}: unit ${r[0]} market ${m} counts ${n} store(s) but has no store minimum`);
      if (sMin != null && low != null && low > sMin) add("error", "UN_LOW_ABOVE_STOREMIN", `${f}: unit ${r[0]} market ${m}: the cheapest listing ${low} is dearer than the cheapest store ${sMin}`);
      if (sMin != null && (!e || sMin < e.min)) add("error", "UN_NOT_IN_OF", `${f}: unit ${r[0]} market ${m}: store minimum ${sMin} is below every in-stock offer in of/ (${e ? e.min : "none"})`);
      if (e && n > e.stores.size) add("error", "UN_MORE_STORES", `${f}: unit ${r[0]} market ${m}: ${n} stores counted, of/ names ${e.stores.size}`);
    }
  }
  // 7. the sparse store columns of the browse index are the same numbers as un/ (-1 for none)
  for (const f of files.filter((x) => /^ix\/s-\d+\.json$/.test(x))) {
    const kf = f.replace("ix/s-", "ix/k-"); if (!t.has(kf)) continue;
    const ids = rd<IxK>(t, kf).id;
    for (const u of rd<IxS>(t, f).u) {
      const uid = ids[u[0]!]! * 2 + u[1]!, r = unOf.get(uid); if (!r) { if (unOf.size) add("error", "IXS_NO_UN", `${f}: unit ${uid} has no un/ row`); continue; }
      const want = [...r[1].map((x) => x ?? -1), ...r[2], ...r[3].map((x) => x ?? -1)], got = u.slice(2, 20);
      if (want.join() !== got.join()) add("error", "IXS_VS_UN", `${f}: unit ${uid} is ${got.join("/")}, un/ says ${want.join("/")}`);
    }
  }
  return out;
}

export async function main(argv: readonly string[], env: Record<string, string | undefined>): Promise<number> {
  const i = argv.indexOf("--dir"), root = path.resolve((i >= 0 ? argv[i + 1] : undefined) ?? env.PLANE_DIR ?? ".data"), v1 = path.join(root, "v1");
  if (!fs.existsSync(v1)) { console.log(`${root} has no v1/ directory: nothing to check.`); return 0; }
  const t = fsTree(v1), findings = evaluateConsistency(t);
  console.log(`price consistency of ${root}: ${t.files().length} files checked`);
  if (!findings.length) console.log("no finding: px, the set boards, the browse index, the typeahead table, the home tiles, the movers and the store aggregates agree.");
  for (const f of findings) { console.log(`  ${f.level === "error" ? "ERROR" : "warn "} [${f.code}] ${f.message}`); if (f.level === "error") console.log(`::error title=Price consistency (${f.code})::${f.message}`); }
  if (argv.includes("--json")) console.log(JSON.stringify(findings, null, 1));
  return findings.some((f) => f.level === "error") ? 1 : 0;
}
if (process.argv[1] && /scripts[\\/]check-card-consistency\.ts$/.test(process.argv[1])) main(process.argv.slice(2), process.env).then((c) => { process.exitCode = c; }).catch((e) => { console.error(e); process.exitCode = 1; });
