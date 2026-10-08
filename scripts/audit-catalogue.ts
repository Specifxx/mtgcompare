// scripts/audit-catalogue.ts (owner WP19, parity P03; contract 1.2 pins C1, C3, C4, C8, C9, C10, C11, C14 here: "A scripts/audit-catalogue.ts"). The IDENTITY half of the data-integrity audit, over the PUBLISHED tree: the catalogue
// is files now, so what RiftCompare's db-audit.ts read from Postgres this reads from v1/cat, px, or, sc, slug, meta and sl. Read-only and pure over a TreeView (the tests plant a defect in a copy of the golden tree and see the code fire).
//
//   npx tsx scripts/audit-catalogue.ts [--dir .data] [--prev <v1-dir>] [--seed data/slug-seed.json] [--json]
//     --dir     a checkout (it holds v1/) or PLANE_DIR; default PLANE_DIR, else .data
//     --prev    the previous publish's v1/ directory: the write-once rules of C1/C3/C4 across two trees (no id deleted, no slug changed, no oracle ordinal moved)
//     --seed    data/slug-seed.json, the committed fallback that lets a rebuilt catalogue reproduce every URL (C3); default the repository's own
// Exit 1 on any `error`. The price half is scripts/check-card-consistency.ts, the history half scripts/audit-history.ts, the byte and freshness half scripts/audit-publication.ts.
import fs from "node:fs";
import path from "node:path";
import { CARD_CLASS, CARD_FLAGS, LINK, PRICE_MASK, PRIMARY_TYPES, RARITIES, SEALED_KINDS, SET_KINDS, TREATMENT_BY_KEY, ptypeOf } from "../src/lib/constants";
import type { CatRow, OracleRow, PxRow, ScShard, SealedListFile, SetRow, SlugShard } from "../src/lib/data/plane/formats";
import { loadPrevState, writeOnceProblems } from "../src/lib/data/plane/prevstate";
import { fsTree, type TreeView } from "../src/lib/data/plane/tree";
import type { Finding, Level } from "./audit-publication";

export interface SlugSeed { v: number; toks?: Record<string, string>; cards?: Record<string, string>; oracles?: Record<string, string> }
export interface Catalogue { cat: CatRow[]; px: Map<number, PxRow>; oracles: Map<number, OracleRow>; sets: Map<number, SetRow>; sealed: SealedListFile["s"]; sc: ScShard[]; slugShards: SlugShard[] }
const rd = <T,>(t: TreeView, rel: string): T => JSON.parse(t.read(rel)) as T;
/** Reads every catalogue family of a tree into memory (about 100,000 rows: 330 ms on the real tree). */
export function loadCatalogue(t: TreeView): Catalogue {
  const files = t.files(), c: Catalogue = { cat: [], px: new Map(), oracles: new Map(), sets: new Map(), sealed: [], sc: [], slugShards: [] };
  for (const f of files) {
    if (f.startsWith("cat/")) c.cat.push(...rd<{ c: CatRow[] }>(t, f).c);
    else if (f.startsWith("px/")) for (const r of rd<{ p: PxRow[] }>(t, f).p) c.px.set(r[0], r);
    else if (f.startsWith("or/")) for (const r of rd<{ o: OracleRow[] }>(t, f).o) c.oracles.set(r[0], r);
    else if (f.startsWith("sc/")) c.sc.push(rd<ScShard>(t, f));
    else if (f.startsWith("slug/")) c.slugShards.push(rd<SlugShard>(t, f));
    else if (/^sl\/list-\d+\.json$/.test(f)) c.sealed.push(...rd<SealedListFile>(t, f).s);
  }
  if (t.has("meta/sets.json")) for (const r of rd<{ sets: SetRow[] }>(t, "meta/sets.json").sets) c.sets.set(r[0], r);
  return c;
}

const CAP = 12;                                                    // examples kept per code: one bad rule never hides the others
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const F = CARD_FLAGS, M = PRICE_MASK;
/** Every invariant of the identity half. `seed` is data/slug-seed.json (or null). Pure. */
export function evaluateCatalogue(c: Catalogue, seed: SlugSeed | null = null): Finding[] {
  const out: Finding[] = []; const seen = new Map<string, number>();
  const add = (level: Level, code: string, message: string) => { const n = (seen.get(code) ?? 0) + 1; seen.set(code, n); if (n <= CAP) out.push({ level, code, message }); else if (n === CAP + 1) out.push({ level, code, message: `...more ${code} findings not listed` }); };
  const ids = new Set<number>(), slugs = new Map<string, number>(), topByOracle = new Map<number, number>(), cardsPerSet = new Map<number, number>(), slugOf = new Map<number, string>();
  for (const r of c.cat) {
    const [id, slug, , , setId, sc, , fnum, rarity, cls, treat, , flags, link, oracleNo, scryId, , , colors, mv, ptype] = r;
    const px = c.px.get(id), mask = px ? px[5] : null, tag = `${id} ${slug}`;
    // C1 / C3 / C10: identity
    if (!Number.isInteger(id) || id <= 0) add("error", "ID_SHAPE", `${tag}: the id is not a positive integer`);
    if (ids.has(id)) add("error", "ID_DUP", `${tag}: the id appears twice in cat/`); ids.add(id); slugOf.set(id, slug);
    if (!SLUG.test(slug)) add("error", "SLUG_SHAPE", `${tag}: the slug is not lower-case ascii words joined by hyphens`);
    const other = slugs.get(slug); if (other !== undefined && other !== id) add("error", "SLUG_DUP", `${tag}: the slug of ${other} too`); slugs.set(slug, id);
    if (!c.sets.has(setId)) add("error", "SET_UNKNOWN", `${tag}: set ${setId} is not in meta/sets.json`);
    if (cls === CARD_CLASS.CARD) cardsPerSet.set(setId, (cardsPerSet.get(setId) ?? 0) + 1);
    if (!px) { add("error", "PX_MISSING", `${tag}: no px row for this catalogue row`); continue; }
    // vocabulary (C12: unknown words go to Card.label; a key the vocabulary does not know must not be in `treat`)
    if (!(rarity in RARITIES)) add("error", "RARITY", `${tag}: rarity "${rarity}" is not in the vocabulary`);
    if (treat) for (const k of treat.split(/\s+/)) if (!(k in TREATMENT_BY_KEY)) add("error", "TREAT_KEY", `${tag}: treatment key "${k}" is not in the vocabulary (an unknown word belongs in the label)`);
    // C9: the denormalised copies of the oracle's facts
    const o = oracleNo ? c.oracles.get(oracleNo) : undefined;
    if (oracleNo && !o) add("error", "ORACLE_REF", `${tag}: oracle ordinal ${oracleNo} has no row in or/`);
    if (o) {
      if (colors !== o[7]) add("error", "C9_COLORS", `${tag}: colours ${colors} differ from the oracle's ${o[7]} (${o[3]})`);
      if (mv !== o[5]) add("error", "C9_MV", `${tag}: mana value ${mv} differs from the oracle's ${o[5]} (${o[3]})`);
      if (ptype !== ptypeOf(o[6])) add("error", "C9_PTYPE", `${tag}: primary type ${ptype} (${PRIMARY_TYPES[ptype] ?? "?"}) differs from the oracle's "${o[6]}" (${PRIMARY_TYPES[ptypeOf(o[6])]})`);
    } else if (colors || mv) add("error", "C8_NO_ORACLE_FACTS", `${tag}: carries colours ${colors} / mana value ${mv} without an oracle (C8: a product without a join shows no mana cost or colours; its type is the TCGplayer SubType as text, so ptype may be set)`);
    // C8 / joins: link and flag agree
    if (link === LINK.NONE && oracleNo) add("error", "C8_LINK_NONE", `${tag}: an oracle is attached but link is NONE`);
    if ((flags & F.JOINED) && ![LINK.ID, LINK.ETCHED, LINK.FALLBACK, LINK.VARIANT].includes(link as never)) add("error", "JOINED_LINK", `${tag}: JOINED with link ${link}`);
    if (!(flags & F.JOINED) && link !== LINK.NONE && link !== LINK.ORACLE_NAME) add("error", "JOINED_LINK", `${tag}: link ${link} without the JOINED flag (only NONE and ORACLE_NAME are unjoined)`);
    if (scryId && !(flags & F.JOINED)) add("error", "SCRY_ID", `${tag}: a Scryfall id without the JOINED flag`);
    if ((flags & F.SCRYIMG) && !scryId) add("error", "SCRY_IMG", `${tag}: SCRYIMG set but no Scryfall id to build the image from`);
    // C5 / C6: the star twin and the etched flag
    if (Boolean(flags & F.STAR) !== Boolean(fnum)) add("error", "C6_STAR", `${tag}: STAR ${flags & F.STAR ? "set" : "clear"} but the foil number is ${fnum || "empty"}`);
    if ((flags & F.FOILONLY) && (mask! & M.HASN)) add("error", "FOILONLY_HASN", `${tag}: FOILONLY but a Normal price exists`);
    // C11: a token, art card, oversized card or helper is never an oracle card, never ranked, never tracked, always THIN
    if (cls !== CARD_CLASS.CARD) {
      if (oracleNo) add("error", "C11_ORACLE", `${tag}: class ${cls} carries oracle ${oracleNo}`);
      if (link !== LINK.NONE) add("error", "C11_LINK", `${tag}: class ${cls} has link ${link}`);
      if (mask! & M.TOP) add("error", "C11_TOP", `${tag}: class ${cls} is TOP`);
      if (mask! & (M.TRACKN | M.TRACKF)) add("error", "C11_TRACKED", `${tag}: class ${cls} is tracked`);
      if ((mask! & M.LISTED) && !(mask! & M.THIN)) add("error", "C11_THIN", `${tag}: class ${cls} is listed but not THIN`);
    }
    // the mask is coherent with itself
    if ((mask! & M.TOP)) { if (!(mask! & M.LISTED)) add("error", "TOP_UNLISTED", `${tag}: TOP but not LISTED`); if (oracleNo) topByOracle.set(oracleNo, (topByOracle.get(oracleNo) ?? 0) + 1); }
    if ((mask! & (M.TRACKN | M.TRACKF)) && !(mask! & M.LISTED)) add("error", "TRACKED_UNLISTED", `${tag}: tracked but not LISTED`);
    if ((mask! & M.GONE) && (mask! & M.LISTED)) add("error", "GONE_LISTED", `${tag}: GONE and LISTED together`);
    if ((mask! & M.THIN) && !(mask! & M.LISTED)) add("error", "THIN_UNLISTED", `${tag}: THIN but not LISTED`);
  }
  for (const [no, n] of topByOracle) if (n > 1) add("error", "TOP_MANY", `oracle ${no}: ${n} printings are TOP (the dearest class-0 printing is one)`);
  // sets: a set's cardCount is its class-0 rows; every sealed product belongs to a known set or none
  for (const s of c.sets.values()) if (s[10] !== (cardsPerSet.get(s[0]) ?? 0)) add("warn", "SET_COUNT", `set ${s[0]} ${s[3]}: meta/sets.json says ${s[10]} cards, cat/ holds ${cardsPerSet.get(s[0]) ?? 0} class-0 rows`);
  const sealedIds = new Set<number>();
  for (const s of c.sealed) {
    const [id, slug, , setId, kind] = s;
    if (sealedIds.has(id)) add("error", "SEALED_DUP", `sealed ${id} ${slug} appears twice`); sealedIds.add(id);
    if (ids.has(id)) add("error", "ID_SEALED_CLASH", `sealed ${id} ${slug} is also a card id (C1: productIds are unique across singles and sealed)`);
    if (setId && !c.sets.has(setId)) add("error", "SEALED_SET", `sealed ${id} ${slug}: set ${setId} is not in meta/sets.json`);
    if (!(SEALED_KINDS as readonly string[]).includes(kind)) add("error", "SEALED_KIND", `sealed ${id} ${slug}: kind "${kind}" is not in the vocabulary`);
    const other = slugs.get(slug); if (other !== undefined) add("error", "SLUG_DUP", `sealed ${id}: the slug ${slug} is a card slug too`);
  }
  for (const s of c.sets.values()) if (!(s[6] in SET_KINDS)) add("error", "SET_KIND", `set ${s[0]} ${s[3]}: kind "${s[6]}" is not in the vocabulary`);
  // C14: a (set code, number key) names 1 to 3 products and every one of them is in that set
  // the shard key is the Scryfall set code, or the set TOKEN for a product that has none (formats.ts ScShard)
  const codeOf = new Map(c.cat.map((r) => [r[0], r[5] || c.sets.get(r[4])?.[2] || ""] as const));
  for (const sh of c.sc) for (const [code, byNum] of Object.entries(sh.s)) for (const [nk, list] of Object.entries(byNum)) {
    if (list.length < 1) add("error", "C14_LIST", `sc ${code} ${nk}: an empty product list`);
    else if (list.length > 3) add("warn", "C14_LIST", `sc ${code} ${nk}: ${list.length} products (a locator resolves 1 to 3 products; a longer list is a promo set that reuses one number, which the resolver narrows by finish and treatment words)`);
    for (const id of list) if (codeOf.get(id) !== undefined && codeOf.get(id) !== code) add("error", "C14_CODE", `sc ${code} ${nk}: product ${id} belongs to set code ${codeOf.get(id) || "(none)"}`);
  }
  // the slug shards agree with cat (the validator checks the same; kept so this audit stands alone on a partial tree)
  let slugRows = 0; for (const sh of c.slugShards) for (const [slug, id] of sh.s) { slugRows++; if (slugOf.get(id) !== slug) add("error", "SLUG_SHARD", `slug shard: ${slug} -> ${id} disagrees with cat (${slugOf.get(id) ?? "no row"})`); }
  if (c.slugShards.length && slugRows !== c.cat.length) add("error", "SLUG_COUNT", `slug shards hold ${slugRows} card slugs, cat holds ${c.cat.length}`);
  // C3: data/slug-seed.json reproduces every URL of a rebuilt catalogue
  if (seed) {
    for (const [id, slug] of Object.entries(seed.cards ?? {})) { const got = slugOf.get(Number(id)); if (got !== undefined && got !== slug) add("error", "SEED_CARD", `product ${id}: the seed says ${slug}, the catalogue says ${got}`); }
    for (const [id, tok] of Object.entries(seed.toks ?? {})) { const s = c.sets.get(Number(id)); if (s && s[2] !== tok) add("error", "SEED_TOK", `set ${id}: the seed says token ${tok}, the catalogue says ${s[2]}`); }
    const oracleSlug = new Map([...c.oracles.values()].map((o) => [o[1], o[2]] as const));
    for (const [uuid, slug] of Object.entries(seed.oracles ?? {})) { const got = oracleSlug.get(uuid); if (got !== undefined && got !== slug) add("error", "SEED_ORACLE", `oracle ${uuid}: the seed says ${slug}, the catalogue says ${got}`); }
  }
  return out;
}
/** C1, C3, C4 across two publishes: no id deleted, no slug changed, no oracle ordinal moved, no set token changed. The publisher refuses the same things; this is the independent reader. */
export function evaluateAgainstPrevious(prev: TreeView, next: TreeView): Finding[] {
  return writeOnceProblems(loadPrevState(prev), next, 50).map((p) => ({ level: "error" as Level, code: `WRITE_ONCE_${p.code}`, message: p.message }));
}

const readSeed = (file: string): SlugSeed | null => (fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as SlugSeed) : null);
export async function main(argv: readonly string[], env: Record<string, string | undefined>): Promise<number> {
  const arg = (k: string): string | undefined => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const root = path.resolve(arg("--dir") ?? env.PLANE_DIR ?? ".data"), v1 = path.join(root, "v1");
  if (!fs.existsSync(v1)) { console.log(`${root} has no v1/ directory: nothing to audit.`); return 0; }
  const t = fsTree(v1), cat = loadCatalogue(t), seed = readSeed(path.resolve(arg("--seed") ?? path.join(__dirname, "..", "data", "slug-seed.json")));
  const findings = evaluateCatalogue(cat, seed);
  const prevDir = arg("--prev"); if (prevDir) findings.push(...evaluateAgainstPrevious(fsTree(path.resolve(prevDir)), t));
  console.log(`catalogue ${root}: ${cat.cat.length} rows, ${cat.oracles.size} oracles, ${cat.sets.size} sets, ${cat.sealed.length} sealed products; seed ${seed ? `${Object.keys(seed.cards ?? {}).length} cards, ${Object.keys(seed.toks ?? {}).length} set tokens` : "absent"}${prevDir ? `; compared with ${prevDir}` : ""}`);
  if (!findings.length) console.log("no finding: identity, duplicates, vocabulary, derived copies and class rules all hold.");
  for (const f of findings) { console.log(`  ${f.level === "error" ? "ERROR" : "warn "} [${f.code}] ${f.message}`); if (f.level === "error") console.log(`::error title=Catalogue (${f.code})::${f.message}`); }
  if (argv.includes("--json")) console.log(JSON.stringify(findings, null, 1));
  return findings.some((f) => f.level === "error") ? 1 : 0;
}
if (process.argv[1] && /scripts[\\/]audit-catalogue\.ts$/.test(process.argv[1])) main(process.argv.slice(2), process.env).then((c) => { process.exitCode = c; }).catch((e) => { console.error(e); process.exitCode = 1; });
