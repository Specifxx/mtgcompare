// tests/helpers/publish-harness.ts (owner WP01b). A local bare repository, a deterministic builder over the mini tree, and the git helpers the publish tests share (plane-publish, plane-prevstate).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { publish, type PublishInput } from "../../src/lib/data/plane/publisher";
import { reconcileStoreFamilies, trackedUidsOf } from "../../src/lib/data/plane/reconcile";
import { fsTree, type MutableTree } from "../../src/lib/data/plane/tree";
import { validateTree } from "../../src/lib/data/plane/validate";
import type { PointerFile } from "../../src/lib/data/plane/formats";
import { MINI_CUT, dayOf, isoOf, miniCatalog, miniFull } from "./plane-tree";

export const sh = (cwd: string, ...a: string[]): string => { const r = spawnSync("git", a, { cwd, encoding: "utf8" }); if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
export const mk = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "plane-pub-")); const remote = path.join(root, "remote.git"); sh(root, "init", "-q", "--bare", remote); return { root, remote, work: path.join(root, "w"), done: () => fs.rmSync(root, { recursive: true, force: true }) }; };
export const T0 = Date.parse("2026-01-05T21:48:00Z"); export const at = (days: number, hours = 0) => () => new Date(T0 + days * 86_400_000 + hours * 3_600_000);
export const day = (n: number) => isoOf(dayOf(n));
export type Mode = "catalog" | "full";
export function builder(n: number, mode: Mode, mutate?: (t: MutableTree) => void): PublishInput["build"] {
  return async (tree) => {
    const fresh = mode === "full" ? miniFull({ day: n }) : miniCatalog({ day: n });
    if (mode === "full") for (const f of tree.files().filter((x) => /^(un|of)\//.test(x) || /^ix\/(s|f)-/.test(x) || x.startsWith("sl/d/"))) tree.remove(f);
    for (const f of fresh.files()) tree.write(f, fresh.read(f));
    if (mode === "catalog") reconcileStoreFamilies(tree, trackedUidsOf(tree));                          // the phase-1 fix: membership first
    mutate?.(tree);
    const r = validateTree(tree, { phase: mode }); return { counts: { cards: r.counts.cards, units: r.counts.tracked, files: r.counts.files }, histCut: isoOf(MINI_CUT), prevCounts: null, status: { counts: { ...r.counts, sets: 3, sealed: 0, bytesRaw: r.counts.bytes, bytesGz: 0 } as never, runs: [{ at: "x", kind: mode, ok: true, seconds: 1, note: "" }] } };
  };
}
export const input = (m: ReturnType<typeof mk>, n: number, mode: Mode, extra: Partial<PublishInput> = {}): PublishInput => ({ remote: m.remote, workdir: m.work, phase: mode, priceDay: day(n), tcgcsv: `t${n}`, scryfall: `s${n}`, repo: "o/data", now: at(n), build: builder(n, mode), ...extra });
export const head = (m: ReturnType<typeof mk>): PointerFile => JSON.parse(sh(m.root, "--git-dir", m.remote, "show", "data:latest.json")) as PointerFile;
export const showAt = (m: ReturnType<typeof mk>, ref: string, p: string): string => sh(m.root, "--git-dir", m.remote, "show", `${ref}:${p}`);
export const checkout = (m: ReturnType<typeof mk>, ref: string): ReturnType<typeof fsTree> => { const d = path.join(m.root, `co-${ref.slice(0, 7)}`); fs.rmSync(d, { recursive: true, force: true }); sh(m.root, "clone", "-q", "--no-checkout", m.remote, d); sh(d, "checkout", "-q", ref); return fsTree(path.join(d, "v1")); };


// ── a real-data mini TCGCSV + Scryfall day, built from the 57 real products of tests/fixtures/magic-products.json and the 454 real groups of tests/fixtures/tcgcsv-groups.json (owner WP01b) ─────────────────────────────────────────
// The importer's tests run the whole of importCatalog over directories in the layouts it reads offline (loadTcgcsv: <dir>/groups.json + <dir>/<gid>/{products,prices}.json; loadScryfall: a default_cards file + sets.json). Prices, names, numbers, groups
// and the Scryfall ids are the fixtures'; the Scryfall facts a fixture does not record (type line, colours, legality) are left at neutral values: no test asserts them.
export interface MagicFixture { productId: number; name: string; groupId: number; group: string; groupKind: string; tcgNumber: string | null; tcgRarity: string | null; prices: { Normal?: { market: number | null; low: number | null }; Foil?: { market: number | null; low: number | null } }; expect: Record<string, unknown>; scryfall: { id: string; set: string; cn: string; name: string; layout: string; finishes: string[]; rarity: string; oracle_id: string; tcgplayer_id: number | null; tcgplayer_etched_id: number | null; flavor_name: string | null; faces: string[]; reserved: boolean; edhrec_rank: number | null }[] }
export const magicFixtures = (): MagicFixture[] => JSON.parse(fs.readFileSync(path.resolve(__dirname, "../fixtures/magic-products.json"), "utf8")) as MagicFixture[];
const realGroups = (): { groupId: number; name: string; abbreviation: string; publishedOn: string }[] => JSON.parse(fs.readFileSync(path.resolve(__dirname, "../fixtures/tcgcsv-groups.json"), "utf8"));
export interface MiniProduct { productId: number; name: string; groupId: number; number: string | null; rarity: string | null; Normal?: { market: number | null; low: number | null }; Foil?: { market: number | null; low: number | null }; imageCount?: number }
export interface MiniRaw { faceFlavor?: (string | null)[]; id: string; oracle_id: string; name: string; set: string; collector_number: string; layout?: string; finishes?: string[]; rarity?: string; tcgplayer_id?: number | null; tcgplayer_etched_id?: number | null; flavor_name?: string | null; faces?: string[]; reserved?: boolean; edhrec_rank?: number | null; released_at?: string; oversized?: boolean; set_type?: string }
export interface MiniDayOpts {
  /** productIds of the fixtures to leave out (a product that vanished). */ drop?: ReadonlySet<number>;
  /** price multiplier per product and subtype (default 1). */ scale?: (productId: number, sub: "Normal" | "Foil") => number;
  /** extra products and Scryfall rows (synthetic scenarios built on a real record). */ products?: MiniProduct[]; scryfall?: MiniRaw[];
  /** omit a whole group's files from the day (the group is absent from groups.json too when `hideGroups`). */ hideGroups?: ReadonlySet<number>;
  stamp?: string;
  /** change a product as TCGplayer lists it on this day (a rename, a new number); its Scryfall rows stay. */ patch?: (p: MiniProduct) => MiniProduct;
  /** a group's abbreviation as TCGCSV lists it on this day. */ abbreviation?: Readonly<Record<number, string>>;
}
export interface MiniDay { root: string; tcgDir: string; scryDir: string; stamp: string; groupIds: number[] }
const cents = (v: number | null | undefined, k: number): number | null => (v == null ? null : Math.round(v * k * 100) / 100);
export function miniMagicDay(root: string, o: MiniDayOpts = {}): MiniDay {
  const fx = magicFixtures().filter((f) => !o.drop?.has(f.productId)); const stamp = o.stamp ?? "2026-10-07T20:06:09Z";
  const groups = realGroups(); const gById = new Map(groups.map((g) => [g.groupId, g]));
  const prods: MiniProduct[] = [...fx.map((f): MiniProduct => ({ productId: f.productId, name: f.name, groupId: f.groupId, number: f.tcgNumber, rarity: f.tcgRarity, Normal: f.prices.Normal, Foil: f.prices.Foil })), ...(o.products ?? []).filter((p) => !o.drop?.has(p.productId))];
  if (o.patch) for (let i = 0; i < prods.length; i++) prods[i] = o.patch(prods[i]!);
  const gids = [...new Set(prods.map((p) => p.groupId))].filter((g) => !o.hideGroups?.has(g)).sort((a, b) => a - b);
  const tcgDir = path.join(root, "tcgcsv"), scryDir = path.join(root, "scryfall"); fs.mkdirSync(tcgDir, { recursive: true }); fs.mkdirSync(scryDir, { recursive: true });
  fs.writeFileSync(path.join(tcgDir, "groups.json"), JSON.stringify({ success: true, results: gids.map((g) => { const r = gById.get(g)!; return { groupId: r.groupId, name: r.name, abbreviation: o.abbreviation?.[g] ?? r.abbreviation, publishedOn: r.publishedOn, isSupplemental: false, categoryId: 1 }; }) }));
  fs.writeFileSync(path.join(tcgDir, "last-updated.txt"), stamp);
  for (const g of gids) {
    const list = prods.filter((p) => p.groupId === g); fs.mkdirSync(path.join(tcgDir, String(g)), { recursive: true });
    fs.writeFileSync(path.join(tcgDir, String(g), "products.json"), JSON.stringify({ success: true, results: list.map((p) => ({ productId: p.productId, name: p.name, cleanName: p.name, imageUrl: `https://tcgplayer-cdn.tcgplayer.com/product/${p.productId}_200w.jpg`, categoryId: 1, groupId: g, url: `https://www.tcgplayer.com/product/${p.productId}`, imageCount: p.imageCount ?? 1, presaleInfo: { isPresale: false, releasedOn: null, note: null }, extendedData: [...(p.rarity ? [{ name: "Rarity", value: p.rarity }] : []), ...(p.number ? [{ name: "Number", value: p.number }] : [])] })) }));
    const rows: unknown[] = [];
    for (const p of list) for (const sub of ["Normal", "Foil"] as const) { const r = p[sub]; if (!r) continue; const k = o.scale?.(p.productId, sub) ?? 1; rows.push({ productId: p.productId, lowPrice: cents(r.low, k), midPrice: null, highPrice: null, marketPrice: cents(r.market, k), directLowPrice: null, subTypeName: sub }); }
    fs.writeFileSync(path.join(tcgDir, String(g), "prices.json"), JSON.stringify({ success: true, results: rows }));
  }
  // Scryfall: the fixtures' rows (a row several fixtures share is written once), then the extra rows
  const seen = new Set<string>(); const raws: MiniRaw[] = [];
  for (const f of fx) for (const s of f.scryfall) { if (seen.has(s.id)) continue; seen.add(s.id); raws.push({ id: s.id, oracle_id: s.oracle_id, name: s.name, set: s.set, collector_number: s.cn, layout: s.layout, finishes: s.finishes, rarity: s.rarity, tcgplayer_id: s.tcgplayer_id, tcgplayer_etched_id: s.tcgplayer_etched_id, flavor_name: s.flavor_name, faces: s.faces, reserved: s.reserved, edhrec_rank: s.edhrec_rank, faceFlavor: s.faces.length && !s.flavor_name && typeof f.expect.alt === "string" ? [f.expect.alt, null] : undefined }); }          // a reversible or transform reskin carries its printed name on face 0 (the fixture keeps only the face names)
  for (const r of o.scryfall ?? []) if (!seen.has(r.id)) { seen.add(r.id); raws.push(r); }
  const lines = raws.map((r) => JSON.stringify({
    id: r.id, oracle_id: r.layout === "reversible_card" ? undefined : r.oracle_id, name: r.name, set: r.set, set_name: r.set.toUpperCase(), set_type: r.set_type ?? "expansion", collector_number: r.collector_number, released_at: r.released_at ?? "2020-01-01", lang: "en", rarity: r.rarity ?? "common",
    layout: r.layout ?? "normal", mana_cost: "", cmc: 0, type_line: "", colors: [], color_identity: [], keywords: [], legalities: {}, finishes: r.finishes ?? ["nonfoil"], frame_effects: [], promo_types: [], border_color: "black", full_art: false, promo: false, reserved: r.reserved === true, game_changer: false,
    edhrec_rank: r.edhrec_rank ?? null, tcgplayer_id: r.tcgplayer_id ?? null, tcgplayer_etched_id: r.tcgplayer_etched_id ?? null, image_status: "highres_scan", flavor_name: r.flavor_name ?? undefined, digital: false, oversized: r.oversized === true, games: ["paper"],
    card_faces: r.faces && r.faces.length ? r.faces.map((n, i) => ({ name: n, ...(r.faceFlavor?.[i] ? { flavor_name: r.faceFlavor[i] } : {}), ...(r.layout === "reversible_card" ? { oracle_id: r.oracle_id } : {}) })) : undefined,
  }));
  fs.writeFileSync(path.join(scryDir, "default-cards-20261007210542.jsonl"), lines.join("\n") + "\n");
  const codes = [...new Set(raws.map((r) => r.set))].sort();
  fs.writeFileSync(path.join(scryDir, "sets.json"), JSON.stringify({ object: "list", data: codes.map((c) => ({ code: c, name: c.toUpperCase(), set_type: raws.find((r) => r.set === c)?.set_type ?? "expansion", released_at: "2020-01-01", tcgplayer_id: null, parent_set_code: null, digital: false })) }));
  fs.writeFileSync(path.join(scryDir, "default_cards.meta.json"), JSON.stringify({ type: "default_cards", updated_at: "2026-10-07T21:05:42.958+00:00" }));
  return { root, tcgDir, scryDir, stamp, groupIds: gids };
}
export const tmpRoot = (prefix = "import-"): { root: string; done: () => void } => { const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); return { root, done: () => fs.rmSync(root, { recursive: true, force: true }) }; };

/** The environment of an offline importer run over a mini day: the downloaded TCGCSV and Scryfall files, a private cache and clone directory, no revalidate hook. Nothing here reaches the network, the repository's .cache or the system temp of another test. */
export function importEnv(root: string, day: MiniDay, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { TCGCSV_CACHE_DIR: day.tcgDir, SCRYFALL_CACHE_DIR: day.scryDir, IMPORT_CACHE_DIR: path.join(root, "cache"), PLANE_WORK_DIR: path.join(root, "work"), SKIP_REVALIDATE: "1", ...extra };
}
