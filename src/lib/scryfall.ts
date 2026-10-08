// src/lib/scryfall.ts (owner WP01b, FROZEN signatures). Scryfall bulk data: fetched ONLY in GitHub Actions (never on Vercel), streamed line by line (default_cards is 79 MB gz / 634 MB raw; parse about 5 s, 124-184 MB RSS), never JSON.parse the whole file.
// Headers on every request to api.scryfall.com: User-Agent (the build string in CI, "MTGCompare/1.0 (+<SITE_URL>)" in production code, never a personal email) and Accept: */*. One GET /bulk-data per run, one GET /sets (626 KB) when the bulk
// updated_at changed, one download from data.scryfall.io (no rate limit). NEVER /cards/*. A 429 is never retried through: back off 30 s once, then continue in SCRYFALL_MODE=off.
// Scryfall's purchase_uris / related_uris carry Scryfall's affiliate codes and are NEVER stored or rendered; Scryfall prices are never read.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import { Readable } from "node:stream";
import { fold } from "./constants";

export interface ScryfallRow {                       // slim, paper only (games includes "paper"); about 450 B in memory
  id: string; oracleId: string; name: string; set: string; setName: string; setType: string; cn: string; releasedAt: string; lang: string;
  rarity: string; layout: string; manaCost: string; cmc: number; typeLine: string; colors: string[]; colorIdentity: string[];
  power: string | null; toughness: string | null; loyalty: string | null; keywords: string[]; oracleText: string | null;
  legalities: Record<string, string>; finishes: string[]; frameEffects: string[]; promoTypes: string[]; borderColor: string; fullArt: boolean;
  promo: boolean; reserved: boolean; gameChanger: boolean; edhrecRank: number | null; tcgplayerId: number | null; tcgplayerEtchedId: number | null;
  imageStatus: string; nfaces: number; flavorName: string | null; printedName: string | null; digital: boolean; oversized: boolean; games: string[];
  faces: string[]; faceFlavor: (string | null)[];   // face names and face flavor names (transform / reversible)
}
export interface ScryfallSet { code: string; name: string; setType: string; tcgplayerId: number | null; releasedAt: string | null; parentSetCode: string | null; digital: boolean }
export interface ScryfallIndex { byTcgId: Map<number, ScryfallRow[]>; byEtchedId: Map<number, ScryfallRow[]>; bySet: Map<string, ScryfallRow[]>; oracleByNameKey: Map<string, Set<string>> /* folded oracle AND face names */; sets: Map<string, ScryfallSet> }
export type LinkLevel = "id" | "etched" | "fallback" | "variant" | "oracle-name" | "none";
export type ClaimMap = Map<string, number>;          // Scryfall printing id -> productId that claimed it by id
export interface JoinResult { linkLevel: LinkLevel; oracleId: string | null; row: ScryfallRow | null; starRow: ScryfallRow | null; rootProductId: number | null; ambiguous: boolean }

// ── headers, politeness ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const BUILD_UA = "MTGCompare-build/0.1 (+https://github.com/Specifxx/mtgcompare)";
/** The build string in CI (and in every Actions job), "MTGCompare/1.0 (+<SITE_URL>)" in production code. Never a personal e-mail. */
export function scryfallHeaders(env: Record<string, string | undefined> = process.env): Record<string, string> {
  const site = (env.NEXT_PUBLIC_SITE_URL || "https://mtgcompare.app").replace(/\/+$/, "");
  return { "User-Agent": env.CI || env.GITHUB_ACTIONS ? BUILD_UA : `MTGCompare/1.0 (+${site})`, Accept: "*/*" };
}
export class ScryfallRateLimited extends Error { constructor(where: string) { super(`Scryfall answered 429 for ${where}`); this.name = "ScryfallRateLimited"; } }
const API = "https://api.scryfall.com";
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function get(url: string, f: typeof fetch): Promise<Response> {
  let res = await f(url, { headers: scryfallHeaders() });
  if (res.status === 429) {                           // never retried through: back off once, then give up (the caller continues in SCRYFALL_MODE=off)
    await sleep(Number(process.env.SCRYFALL_BACKOFF_MS ?? 30_000));
    res = await f(url, { headers: scryfallHeaders() });
    if (res.status === 429) throw new ScryfallRateLimited(url);
  }
  if (!res.ok) throw new Error(`Scryfall ${url}: HTTP ${res.status}`);
  return res;
}

/** GET /bulk-data (one call per run): the `default_cards` entry. The JSON-array files were retired 2026-07-20, so `jsonl_download_uri` is the only download. */
export async function fetchBulkListing(opts: { fetch?: typeof fetch } = {}): Promise<{ updatedAt: string; jsonlUrl: string; compressedSize: number }> {
  const res = await get(`${API}/bulk-data`, opts.fetch ?? fetch);
  const body = (await res.json()) as { data?: { type: string; updated_at: string; jsonl_download_uri?: string; compressed_size?: number }[] };
  const e = body.data?.find((x) => x.type === "default_cards");
  if (!e?.jsonl_download_uri || !e.updated_at) throw new Error("Scryfall bulk-data lists no default_cards file");
  return { updatedAt: e.updated_at, jsonlUrl: e.jsonl_download_uri, compressedSize: e.compressed_size ?? 0 };
}
/** GET /sets (626 KB, about 1,056 sets): called when the bulk updated_at changed. */
export async function fetchSets(opts: { fetch?: typeof fetch } = {}): Promise<ScryfallSet[]> {
  const res = await get(`${API}/sets`, opts.fetch ?? fetch);
  return parseSets(await res.json());
}
export function parseSets(raw: unknown): ScryfallSet[] {
  const data = ((raw as { data?: unknown[] } | null)?.data ?? (Array.isArray(raw) ? raw : [])) as Record<string, unknown>[];
  return data.map((s) => ({
    code: String(s.code), name: String(s.name ?? ""), setType: String(s.set_type ?? ""), tcgplayerId: typeof s.tcgplayer_id === "number" ? s.tcgplayer_id : null,
    releasedAt: typeof s.released_at === "string" ? s.released_at : null, parentSetCode: typeof s.parent_set_code === "string" ? s.parent_set_code : null, digital: s.digital === true,
  }));
}

// ── slim rows ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
interface RawFace { name?: string; mana_cost?: string; type_line?: string; oracle_text?: string; colors?: string[]; power?: string; toughness?: string; loyalty?: string; cmc?: number; oracle_id?: string; flavor_name?: string; image_uris?: unknown }
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const legalPool = new Map<string, Record<string, string>>();                // 480 distinct vectors across 118k rows: share the objects
const textPool = new Map<string, string>();                                 // the same oracle text rides on every printing of a card
const pooled = (m: Map<string, string>, s: string): string => { const h = m.get(s); if (h !== undefined) return h; m.set(s, s); return s; };
/** Pure. null for a row that is not paper. Multi-face cards whose top level lacks mana_cost / colors / power / loyalty / cmc / oracle_id take them from face 0 (a transform, modal_dfc or reversible_card has no top-level copy). */
export function slimScryfall(raw: unknown): ScryfallRow | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.id !== "string") return null;
  const games = Array.isArray(r.games) ? (r.games as string[]) : [];
  if (!games.includes("paper")) return null;
  const faces = Array.isArray(r.card_faces) ? (r.card_faces as RawFace[]) : [];
  const f0 = faces[0];
  const top = <T,>(k: string, face: (f: RawFace) => T | undefined, d: T): T => (r[k] !== undefined && r[k] !== null ? (r[k] as T) : f0 && face(f0) !== undefined ? (face(f0) as T) : d);
  const oracleText = typeof r.oracle_text === "string" ? r.oracle_text : faces.length ? faces.map((f) => f.oracle_text ?? "").filter(Boolean).join("\n//\n") : "";
  const legalRaw = (r.legalities ?? {}) as Record<string, string>; const legalKey = JSON.stringify(legalRaw);
  let legalities = legalPool.get(legalKey); if (!legalities) { legalities = legalRaw; legalPool.set(legalKey, legalRaw); }
  const nfaces = r.image_uris ? 1 : faces.filter((f) => f.image_uris).length || 1;
  return {
    id: r.id, oracleId: String(r.oracle_id ?? f0?.oracle_id ?? ""), name: String(r.name ?? ""), set: String(r.set ?? ""), setName: String(r.set_name ?? ""), setType: String(r.set_type ?? ""),
    cn: String(r.collector_number ?? ""), releasedAt: String(r.released_at ?? ""), lang: String(r.lang ?? "en"), rarity: String(r.rarity ?? ""), layout: String(r.layout ?? "normal"),
    manaCost: top("mana_cost", (f) => f.mana_cost, ""), cmc: Number(top("cmc", (f) => f.cmc, 0)), typeLine: top("type_line", (f) => f.type_line, ""),
    colors: top<string[]>("colors", (f) => f.colors, []), colorIdentity: (r.color_identity as string[] | undefined) ?? [],
    power: strOrNull(top<string | null>("power", (f) => f.power, null)), toughness: strOrNull(top<string | null>("toughness", (f) => f.toughness, null)), loyalty: strOrNull(top<string | null>("loyalty", (f) => f.loyalty, null)),
    keywords: (r.keywords as string[] | undefined) ?? [], oracleText: oracleText ? pooled(textPool, oracleText) : null, legalities,
    finishes: (r.finishes as string[] | undefined) ?? [], frameEffects: (r.frame_effects as string[] | undefined) ?? [], promoTypes: (r.promo_types as string[] | undefined) ?? [],
    borderColor: String(r.border_color ?? ""), fullArt: r.full_art === true, promo: r.promo === true, reserved: r.reserved === true, gameChanger: r.game_changer === true,
    edhrecRank: typeof r.edhrec_rank === "number" ? r.edhrec_rank : null, tcgplayerId: typeof r.tcgplayer_id === "number" ? r.tcgplayer_id : null, tcgplayerEtchedId: typeof r.tcgplayer_etched_id === "number" ? r.tcgplayer_etched_id : null,
    imageStatus: String(r.image_status ?? ""), nfaces, flavorName: strOrNull(r.flavor_name), printedName: strOrNull(r.printed_name), digital: r.digital === true, oversized: r.oversized === true, games,
    faces: faces.map((f) => String(f.name ?? "")), faceFlavor: faces.map((f) => strOrNull(f.flavor_name)),
  };
}

// ── streaming ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function eachLine(input: NodeJS.ReadableStream, onLine: (line: string) => void): Promise<void> {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) if (line) onLine(line);
}
/** Stream the default_cards download line by line through gunzip; `onRow` gets each PAPER row slimmed. rows = lines read, kept = paper rows. Never JSON.parse the whole file. */
export async function streamDefaultCards(url: string, onRow: (r: ScryfallRow) => void, opts: { fetch?: typeof fetch } = {}): Promise<{ rows: number; kept: number }> {
  const res = await (opts.fetch ?? fetch)(url, { headers: scryfallHeaders() });
  if (!res.ok || !res.body) throw new Error(`Scryfall download ${url}: HTTP ${res.status}`);
  const body = Readable.fromWeb(res.body as never);
  const gunzip = zlib.createGunzip(); body.on("error", (e) => gunzip.destroy(e)); body.pipe(gunzip);
  let rows = 0, kept = 0;
  await eachLine(gunzip, (line) => { rows++; const s = slimScryfall(JSON.parse(line)); if (s) { kept++; onRow(s); } });
  return { rows, kept };
}
/** The same stream from a file on disk (the Actions cache, a developer's download): .jsonl.gz, .ndjson.gz, .jsonl or .ndjson. A row that already is a slim row (our own cache file) is passed through. */
export async function streamDefaultCardsFile(file: string, onRow: (r: ScryfallRow) => void): Promise<{ rows: number; kept: number }> {
  const raw = fs.createReadStream(file);
  const input: NodeJS.ReadableStream = file.endsWith(".gz") ? raw.pipe(zlib.createGunzip()) : raw;
  let rows = 0, kept = 0;
  await eachLine(input, (line) => {
    rows++; const j = JSON.parse(line) as Record<string, unknown>;
    const s = typeof j.oracleId === "string" && typeof j.cn === "string" ? (j as unknown as ScryfallRow) : slimScryfall(j);
    if (s) { kept++; onRow(s); }
  });
  return { rows, kept };
}

// ── the index ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const NON_GAME_LAYOUTS: ReadonlySet<string> = new Set(["token", "double_faced_token", "emblem", "art_series"]);
/** Every folded name a printing answers to: the card name, each half of "A // B", every face, the flavor and printed names and every face flavor name (the reskin gate of the fallback join). */
export function printingNames(r: Pick<ScryfallRow, "name" | "flavorName" | "printedName" | "faces" | "faceFlavor">): Set<string> {
  const out = new Set<string>();
  const add = (s: string | null | undefined): void => { const f = fold(s); if (f) out.add(f); };
  add(r.name); for (const part of r.name.split(" // ")) add(part);
  add(r.flavorName); add(r.printedName); for (const f of r.faces) add(f); for (const f of r.faceFlavor) add(f);
  return out;
}
export function buildScryfallIndex(rows: Iterable<ScryfallRow>, sets: ScryfallSet[]): ScryfallIndex {
  const idx: ScryfallIndex = { byTcgId: new Map(), byEtchedId: new Map(), bySet: new Map(), oracleByNameKey: new Map(), sets: new Map(sets.map((s) => [s.code, s])) };
  const push = <K,>(m: Map<K, ScryfallRow[]>, k: K, r: ScryfallRow): void => { const a = m.get(k); if (a) a.push(r); else m.set(k, [r]); };
  for (const r of rows) {
    if (r.tcgplayerId) push(idx.byTcgId, r.tcgplayerId, r);
    if (r.tcgplayerEtchedId) push(idx.byEtchedId, r.tcgplayerEtchedId, r);
    push(idx.bySet, r.set, r);
    if (r.oracleId && !NON_GAME_LAYOUTS.has(r.layout)) {                       // oracle names answer only for real game cards (paper rows are all we hold)
      const keys = new Set<string>(); const add = (s: string): void => { const f = fold(s); if (f) keys.add(f); };
      add(r.name); for (const part of r.name.split(" // ")) add(part); for (const f of r.faces) add(f);
      for (const k of keys) { const s = idx.oracleByNameKey.get(k); if (s) s.add(r.oracleId); else idx.oracleByNameKey.set(k, new Set([r.oracleId])); }
    }
  }
  return idx;
}

// ── the join (contract 6.3; the executable reference is join/fb3.py, hold-out precision 99.955%) ────────────────────────────────────────────────────────────────────
// Chain, first hit wins, and every step refuses a Scryfall row another product already owns by id:
//   1 id (tcgplayer_id)  2 etched (tcgplayer_etched_id)  3 fallback: (set, collector number, name) over the group's static sets, then the sets its id-joined products learned, then for bucket groups the whole of Scryfall
//   4 variant: the printing is owned by another product of the SAME group (Surge / Ripple / Rainbow foil, stamped copies)  5 oracle-name: one oracle by exact folded name, no printing  6 none.
const STAR = /[★†‡*Φ]+$/;
const nnum = (s: string | null | undefined): string => {
  if (s == null) return "";
  let t = String(s).trim().toLowerCase();
  if (!t.includes(" // ")) t = t.replace(/\s*\/\s*\d+$/, "");
  return t.replace(/^0+(?=\d)/, "");
};
const stripStar = (s: string): string => s.replace(STAR, "").trim();
/** The keys a Scryfall collector number can be found under, weakest last: [0] exact, [1] without the star, [2] "38p" -> "38", [3] "XLN-217" -> "217". */
export function collectorKeys(cn: string): [strength: number, key: string][] {
  const k0 = nnum(cn), k1 = stripStar(k0); const out: [number, string][] = [[0, k0]];
  if (k1 !== k0) out.push([1, k1]);
  const k2 = k1.replace(/^(\d+)[a-z]$/, "$1"); if (k2 !== k1) out.push([2, k2]);
  const m = /^[a-z0-9]{2,6}-(.+)$/.exec(k1);
  if (m) { const k3 = m[1]!.replace(STAR, "").replace(/^0+(?=\d)/, ""); out.push([3, k3]); const k4 = k3.replace(/^(\d+)[a-z]$/, "$1"); if (k4 !== k3) out.push([3, k4]); }
  return out;
}
const TAIL = /\s+(Double-Sided Token|Token|Art Card|Emblem)$/i;
const TRAILING_GROUP = /\s*(\([^()]*\)|\[[^\[\]]*\])\s*$/;
/** Every folded string the product name can stand for: the whole name, without trailing "(...)" groups, without the Token / Art Card / Emblem suffix, each side of " - " and of " // ". */
export function nameCandidates(name: string): Set<string> {
  const out = new Set<string>(); let cur = name.trim();
  for (let seen = 0; ; seen++) {
    for (const t of [cur, cur.replace(TAIL, "")].map((x) => x.trim())) {
      out.add(fold(t));
      if (t.includes(" - ")) { const parts = t.split(" - "); out.add(fold(parts[0])); out.add(fold(parts.slice(1).join(" - "))); out.add(fold(parts[parts.length - 1])); }
      if (t.includes(" // ")) for (const part of t.split(" // ")) out.add(fold(part.replace(TAIL, "")));
    }
    const m = TRAILING_GROUP.exec(cur);
    if (!m || seen > 6) break;
    cur = cur.slice(0, m.index);
  }
  out.delete(""); return out;
}
/** The collector number a TCGplayer product states ("" when it has none or a composite one). */
const productNumber = (n: string | null): string => {
  if (!n || n.includes(" // ") || (n.includes("-") && !/^[a-z0-9]{2,6}-/.test(n.toLowerCase()))) return "";
  return nnum(n);
};
const BUCKET_KINDS: ReadonlySet<string> = new Set(["promo", "promo-pack", "list", "secret-lair", "gold-border", "oversized", "unset", "art-series"]);

interface Derived {
  bySetKey: Map<string, ScryfallRow[]>; byKey: Map<string, ScryfallRow[]>; bySetName: Map<string, ScryfallRow[]>; names: Map<string, Set<string>>; children: Map<string, Set<string>>;
  declared: Map<number, Set<string>>; byFoldedSetName: Map<string, string[]>; groupSets: Map<number, Set<string>>;
}
const derivedCache = new WeakMap<ScryfallIndex, Derived>();
function derive(idx: ScryfallIndex): Derived {
  const hit = derivedCache.get(idx); if (hit) return hit;
  const d: Derived = { bySetKey: new Map(), byKey: new Map(), bySetName: new Map(), names: new Map(), children: new Map(), declared: new Map(), byFoldedSetName: new Map(), groupSets: new Map() };
  const push = (m: Map<string, ScryfallRow[]>, k: string, r: ScryfallRow): void => { const a = m.get(k); if (a) a.push(r); else m.set(k, [r]); };
  for (const [code, rows] of idx.bySet) for (const r of rows) {
    for (const [st, k] of collectorKeys(r.cn)) { push(d.bySetKey, `${st}|${code}|${k}`, r); push(d.byKey, `${st}|${k}`, r); }
    const names = printingNames(r); d.names.set(r.id, names); for (const n of names) push(d.bySetName, `${code}|${n}`, r);
  }
  for (const s of idx.sets.values()) {
    if (s.parentSetCode) { const c = d.children.get(s.parentSetCode); if (c) c.add(s.code); else d.children.set(s.parentSetCode, new Set([s.code])); }
    if (s.tcgplayerId) { const c = d.declared.get(s.tcgplayerId); if (c) c.add(s.code); else d.declared.set(s.tcgplayerId, new Set([s.code])); }
    const f = fold(s.name); const a = d.byFoldedSetName.get(f); if (a) a.push(s.code); else d.byFoldedSetName.set(f, [s.code]);
  }
  derivedCache.set(idx, d); return d;
}
/** The folded forms a group name can take as a Scryfall set name ("Art Series: X" is "X Art Series", "Commander: X" is "X Commander", "Promo Pack: X" and "X Promos"/"X Prerelease Cards" are "X Promos", "Universes Beyond: X" is "X"). */
function groupNameForms(name: string): Set<string> {
  const v = new Set<string>([fold(name)]);
  let m = /^Art Series: (.*)$/.exec(name); if (m) v.add(fold(`${m[1]} Art Series`));
  m = /^Commander: (.*)$/.exec(name); if (m) v.add(fold(`${m[1]} Commander`));
  m = /^Promo Pack: (.*)$/.exec(name); if (m) v.add(fold(`${m[1]} Promos`));
  m = /^(.*?)(?: Promos?| Prerelease Cards)$/.exec(name); if (m) v.add(fold(`${m[1]} Promos`));
  m = /^Universes Beyond: (.*)$/.exec(name); if (m) v.add(fold(m[1]));
  return v;
}
/** The Scryfall sets a TCGplayer group stands for, from facts alone: the set whose tcgplayer_id is the groupId, the set whose code is the abbreviation, a set of the same name, and the derived codes of art-series ("a<code>"), promo-pack ("p<code>") and "x:code" abbreviations. */
export function staticSets(idx: ScryfallIndex, g: { groupId: number; name: string; abbreviation: string; kind: string }): Set<string> {
  const d = derive(idx); const out = new Set<string>(d.declared.get(g.groupId) ?? []);
  const a = (g.abbreviation ?? "").toLowerCase();
  if (a && idx.sets.has(a)) out.add(a);
  for (const f of groupNameForms(g.name)) for (const c of d.byFoldedSetName.get(f) ?? []) out.add(c);
  if (g.kind === "art-series" && a.length > 2 && idx.sets.has(`a${a.slice(2)}`)) out.add(`a${a.slice(2)}`);
  if (g.kind === "promo-pack" && a.length > 2) for (const c of [`p${a.slice(2)}`, a.slice(2)]) if (idx.sets.has(c)) out.add(c);
  const m = /^[a-z]:(.+)$/.exec(a); if (m && idx.sets.has(m[1]!)) out.add(m[1]!);
  return out;
}
const withChildren = (idx: ScryfallIndex, sets: Iterable<string>): Set<string> => { const d = derive(idx); const out = new Set<string>(sets); for (const s of [...out]) for (const c of d.children.get(s) ?? []) out.add(c); return out; };

/** What the fallback needs to know about the products that hold a printing by id: the group of every product, and for every group the Scryfall sets its id-joined singles live in with counts (tier B). */
export interface JoinMemory { learned: Map<number, Map<string, number>>; groupOf: Map<number, number> }
/** Pass 1 of the join: which printing each product owns by id. `claimed` is printing id -> the lowest productId that holds it by id (id or etched id). Only singles feed `learned`. */
export function claimByIds(products: Iterable<{ productId: number; groupId: number; single: boolean }>, idx: ScryfallIndex): { claimed: ClaimMap; memory: JoinMemory } {
  const claimed: ClaimMap = new Map(); const memory: JoinMemory = { learned: new Map(), groupOf: new Map() };
  const list = [...products].sort((a, b) => a.productId - b.productId);
  for (const p of list) {
    memory.groupOf.set(p.productId, p.groupId);
    for (const rows of [idx.byTcgId.get(p.productId), idx.byEtchedId.get(p.productId)]) for (const r of rows ?? []) {
      if (!claimed.has(r.id)) claimed.set(r.id, p.productId);
      if (p.single) { let m = memory.learned.get(p.groupId); if (!m) memory.learned.set(p.groupId, (m = new Map())); m.set(r.set, (m.get(r.set) ?? 0) + 1); }
    }
  }
  return { claimed, memory };
}
const isStar = (cn: string): boolean => /[★†]/.test(cn);
const cnOrder = (a: ScryfallRow, b: ScryfallRow): number => { const x = collectorKeys(a.cn)[0]![1], y = collectorKeys(b.cn)[0]![1]; return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : 1; };
/** A shared tcgplayer_id (1,204 of them): a CLEAN pair is a nonfoil printing and its star twin that is foil only (1,187): the Normal unit is the plain printing, the Foil unit the star one. Any other shape (17) takes the lowest collector number and has no star twin. */
export function pickShared(rows: readonly ScryfallRow[]): { row: ScryfallRow; starRow: ScryfallRow | null; clean: boolean } {
  if (rows.length === 1) return { row: rows[0]!, starRow: null, clean: false };
  const plain = rows.filter((r) => !isStar(r.cn)), star = rows.filter((r) => isStar(r.cn));
  const only = (r: ScryfallRow, f: string): boolean => r.finishes.length === 1 && r.finishes[0] === f;
  if (rows.length === 2 && plain.length === 1 && star.length === 1 && only(plain[0]!, "nonfoil") && only(star[0]!, "foil")) return { row: plain[0]!, starRow: star[0]!, clean: true };
  return { row: [...rows].sort(cnOrder)[0]!, starRow: null, clean: false };
}
const oracleOf = (r: ScryfallRow | null): string | null => (r && r.oracleId ? r.oracleId : null);
const none: JoinResult = { linkLevel: "none", oracleId: null, row: null, starRow: null, rootProductId: null, ambiguous: false };

/** `memory` (optional, from claimByIds) carries tier B (the sets a group's id-joined singles live in) and the group of every owner (the variant step); without it both are skipped. cls != 0 products are joined by id only (a token or art card never gets an oracle). */
export function joinProduct(p: { productId: number; groupId: number; name: string; number: string | null; cls: number }, g: { name: string; abbreviation: string; kind: string }, idx: ScryfallIndex, claimed: ClaimMap, memory?: JoinMemory): JoinResult {
  // 1, 2: the exact links
  const byId = idx.byTcgId.get(p.productId), byEt = idx.byEtchedId.get(p.productId);
  if (byId?.length) { const s = pickShared(byId); return { linkLevel: "id", oracleId: oracleOf(s.row), row: s.row, starRow: s.starRow, rootProductId: null, ambiguous: false }; }
  if (byEt?.length) { const s = pickShared(byEt); return { linkLevel: "etched", oracleId: oracleOf(s.row), row: s.row, starRow: s.starRow, rootProductId: null, ambiguous: false }; }
  if (p.cls !== 0) return none;
  const d = derive(idx); const cands = nameCandidates(p.name); const num = productNumber(p.number);
  const free = (r: ScryfallRow): boolean => { const c = claimed.get(r.id); return c === undefined || c === p.productId; };
  const nameOk = (r: ScryfallRow): boolean => { const n = d.names.get(r.id); if (!n) return false; for (const c of cands) if (n.has(c)) return true; return false; };
  const gref = { groupId: p.groupId, name: g.name, abbreviation: g.abbreviation, kind: g.kind };
  const stat = staticSets(idx, gref);
  const lset = new Set<string>(); for (const [s, n] of memory?.learned.get(p.groupId) ?? []) if (n > 0 && !stat.has(s)) lset.add(s);
  const tiers: [string, Set<string>][] = []; if (stat.size) tiers.push(["A", withChildren(idx, stat)]); if (lset.size) tiers.push(["B", withChildren(idx, lset)]);
  const owned: ScryfallRow[] = [];
  let ambiguous = false;
  /** One candidate set: exactly one free row is the link; several are a star pair (the plain printing wins) or AMBIGUOUS, which ends the search (a skip, never a guess) but still allows the oracle-name step. */
  const decide = (hits: ScryfallRow[]): JoinResult | "stop" | null => {
    const uniq = [...new Map(hits.map((r) => [r.id, r])).values()].sort((a, b) => (a.id < b.id ? -1 : 1));
    const fr = uniq.filter(free); owned.push(...uniq.filter((r) => !free(r)));
    if (fr.length === 1) return { linkLevel: "fallback", oracleId: oracleOf(fr[0]!), row: fr[0]!, starRow: null, rootProductId: null, ambiguous: false };
    if (fr.length > 1) {
      const sameSet = new Set(fr.map((r) => r.set)).size === 1 && new Set(fr.map((r) => [...(d.names.get(r.id) ?? [])].sort().join("|"))).size === 1;
      const plain = fr.filter((r) => !isStar(r.cn));
      if (sameSet && plain.length === 1) return { linkLevel: "fallback", oracleId: oracleOf(plain[0]!), row: plain[0]!, starRow: fr.find((r) => r !== plain[0]) ?? null, rootProductId: null, ambiguous: false };
      ambiguous = true; return "stop";
    }
    return null;
  };
  search: {
    for (const [, sets] of tiers) {
      if (num) {
        for (let strength = 0; strength <= 3; strength++) {
          const keys = strength < 2 ? [num, stripStar(num)] : [stripStar(num)];
          const hits: ScryfallRow[] = [];
          for (const s of sets) for (const k of new Set(keys)) hits.push(...(d.bySetKey.get(`${strength}|${s}|${k}`) ?? []).filter(nameOk));
          const r = decide(hits); if (r === "stop") break search; if (r) return r;
        }
      } else {
        const hits: ScryfallRow[] = [];
        for (const s of sets) for (const n of cands) hits.push(...(d.bySetName.get(`${s}|${n}`) ?? []));
        const r = decide(hits); if (r === "stop") break search; if (r) return r;
      }
    }
    if (num && BUCKET_KINDS.has(g.kind)) {                                                    // the whole of Scryfall, for the groups whose cards come from many origin sets
      for (let strength = 0; strength <= 1; strength++) {
        const hits: ScryfallRow[] = [];
        for (const k of new Set([num, stripStar(num)])) hits.push(...(d.byKey.get(`${strength}|${k}`) ?? []).filter(nameOk));
        const r = decide(hits); if (r === "stop") break search; if (r) return r;
      }
    }
  }
  if (!ambiguous) {
    const sameGroup = owned.filter((r) => { const c = claimed.get(r.id); return c !== undefined && c !== p.productId && memory?.groupOf.get(c) === p.groupId; });
    if (sameGroup.length) { const r0 = sameGroup[0]!; return { linkLevel: "variant", oracleId: oracleOf(r0), row: r0, starRow: null, rootProductId: claimed.get(r0.id) ?? null, ambiguous: false }; }
  }
  const strict = strictOracleName(p.name, idx);                                                // 5: one oracle by exact folded name (no printing)
  if (strict) return { linkLevel: "oracle-name", oracleId: strict, row: null, starRow: null, rootProductId: null, ambiguous };
  return { ...none, ambiguous };
}
/** The strict oracle-name link: trailing "(...)" groups and the Token / Art Card / Emblem suffix removed, NO " - " splitting; exactly one oracle among the real game cards answers to the folded name. */
export function strictOracleName(name: string, idx: ScryfallIndex): string | null {
  let s = name;
  for (;;) { const m = TRAILING_GROUP.exec(s); if (!m) break; s = s.slice(0, m.index); }
  const o = idx.oracleByNameKey.get(fold(s.replace(TAIL, "")));
  return o && o.size === 1 ? [...o][0]! : null;
}
