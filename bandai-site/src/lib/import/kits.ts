// Model kits (SITE.kits): one kit = one JAN barcode. Hobby shops title the
// same kit a dozen ways ("Bandai HG 1/144 #03 Gundam Aerial 'Witch from
// Mercury'", "HG Gundam Aerial", "[PRE-ORDER] HGTWFM Aerial"), but every box
// carries the same EAN-13, and shops put it in the SKU, the barcode field or
// the description. Matching is by that number ONLY: a listing without one is
// skipped, never guessed from its title (a wrong match is worse than none).
import { CURRENCY, type KitsConfig, type Market } from "@/lib/site-types";
import type { KitOffer } from "@/lib/kit-store";

/** EAN-13 check digit. */
export function validEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

/** Every valid EAN-13 in a text that starts with one of the maker's prefixes. */
export function jansIn(text: string, prefixes: string[]): string[] {
  const out = new Set<string>();
  for (const m of String(text ?? "").matchAll(/(?<!\d)(\d{13})(?!\d)/g)) {
    const c = m[1];
    if (prefixes.some((p) => c.startsWith(p)) && validEan13(c)) out.add(c);
  }
  return [...out];
}

export interface RawListing {
  title: string;
  sku?: string | null;
  barcode?: string | null;
  body?: string | null;
}

/** A maker's own item number, as shops put it in a SKU, turned into its JAN.
 *  Bandai Spirits numbers a kit 50NNNNN and barcodes it 4573102NNNNN + a
 *  check digit (HG Gundam Aerial: 5063030 ↔ 4573102630308; MG Barbatos:
 *  5058222 ↔ 4573102582225). Shops write the number as "5063030",
 *  "G5063030", "H1-MG-BARBATOS-5058222", their distributor's "MK63030" /
 *  "BANMK63030", or "BAN630308" (the barcode's last six digits). `prefix` is
 *  the JAN prefix those numbers belong to (KitsConfig.itemCodeJanPrefix). */
export function janFromItemCode(sku: string, prefix: string): string | null {
  const s = String(sku ?? "");
  const found = new Set<string>();
  for (const m of s.matchAll(/(?<!\d)50(\d{5})(?!\d)/g)) found.add(withCheck(prefix + m[1]));
  for (const m of s.matchAll(/(?<![A-Z0-9])(?:BAN)?MK(\d{5})(?!\d)/gi)) found.add(withCheck(prefix + m[1]));
  for (const m of s.matchAll(/(?<![A-Z0-9])BAN(\d{6})(?!\d)/gi)) if (validEan13(prefix + m[1])) found.add(prefix + m[1]);
  return found.size === 1 ? [...found][0] : null;
}

function withCheck(twelve: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(twelve[i]) * (i % 2 ? 3 : 1);
  return twelve + ((10 - (sum % 10)) % 10);
}

export interface JanHit {
  jan: string;
  /** Read from an item number, not printed as a barcode: held to the kit's
   *  grade by the import (a disagreeing listing is dropped). */
  derived: boolean;
}

/** The listing's JAN: the variant's barcode or SKU first, then the maker's
 *  item number in the SKU, then the description. Two different JANs (a "goes
 *  well with" list, a bundle) mean no answer. */
export function janOf(l: RawListing, prefixes: string[], itemCodePrefix?: string): JanHit | null {
  const direct = [...jansIn(l.barcode ?? "", prefixes), ...jansIn(l.sku ?? "", prefixes)];
  if (new Set(direct).size === 1) return { jan: direct[0], derived: false };
  if (direct.length) return null;
  if (itemCodePrefix && l.sku) {
    const j = janFromItemCode(l.sku, itemCodePrefix);
    if (j) return { jan: j, derived: true };
  }
  const body = jansIn(String(l.body ?? "").replace(/<[^>]+>/g, " "), prefixes);
  return body.length === 1 ? { jan: body[0], derived: false } : null;
}

// Grade words as shops write them, most specific first.
const GRADES: [RegExp, string][] = [
  [/\bmgex\b/i, "MGEX"],
  [/\bmgsd\b/i, "MGSD"],
  [/\bre\s*\/\s*100\b/i, "RE/100"],
  [/\bfull\s+mechanics\b/i, "FM"],
  [/\bhirm\b|\bhi-resolution\b/i, "HiRM"],
  [/\bmega\s*size\b/i, "Mega Size"],
  [/\b30\s*m[msf]\b|\b30\s+minutes\s+(missions|sisters|fantasy)\b/i, "30 Minutes"],
  [/\bfirst\s+grade\b|\bfg\b/i, "FG"],
  [/\bperfect\s+grade\b|\bpg(?:\s*unleashed)?\b/i, "PG"],
  [/\bmaster\s+grade\b|\bmg\b|\bmg\s*ka\b/i, "MG"],
  [/\breal\s+grade\b|\brg\b/i, "RG"],
  [/\bentry\s+grade\b|\beg\b/i, "EG"],
  [/\bsd\s*(?:cs|ex|w)?\b|\bsdcs\b|\bsdex\b|\bsdw\b|\bbb\s*senshi\b|\bsd\s+gundam\b|\bcross\s+silhouette\b/i, "SD"],
  // HG plus its series letters: HGUC, HGCE, HGTWFM, HGBD:R, HGIBO, HG00…
  [/\bhigh\s+grade\b|\bhg(?:[a-z0-9]{0,5}|bd:r)\b/i, "HG"],
];

export function gradeOf(title: string): string | null {
  for (const [re, g] of GRADES) if (re.test(title)) return g;
  return null;
}

export function scaleOf(title: string): string | null {
  return title.match(/\b1\s*\/\s*(144|100|60|48|35|72)\b/)?.[0].replace(/\s/g, "") ?? null;
}

// Not a kit, whatever its barcode: tools, paint, decals, stands, toys,
// figures, cards, and second-hand or opened boxes.
const NOT_KIT =
  /\b(nipper|cutter|paint|marker|primer|thinner|panel\s*line|top\s*coat|decal|water\s*slide|sticker\s*set|action\s*base|display\s*stand|led\s*unit|tool|sanding|file|tweezers|figure-?rise|figuarts|robot\s*spirits|metal\s*build|metal\s*robot|chogokin|gashapon|candy\s*toy|keychain|t-?shirt|card\s*game|booster|sleeves?|playmat|built|assembled|painted|custom\s*build|used|opened|damaged|box\s*damage|no\s*box|bundle\s*of|lot\s*of)\b/i;

/** A store title that looks like a plastic model kit (a grade or a scale) and
 *  not a tool, a toy or a pre-built model. */
export function isKitTitle(title: string): boolean {
  if (NOT_KIT.test(title)) return false;
  return gradeOf(title) != null || scaleOf(title) != null || /\bgunpla\b|\bplastic\s+model\b|\bmodel\s+kit\b/i.test(title);
}

/** Pre-order wording in a title or tags. */
export function isKitPreorder(title: string, tags: string[] = []): boolean {
  return /pre-?\s*order|preorder|\beta\b|coming\s+soon/i.test(title) || tags.some((t) => /pre-?order/i.test(t));
}

/** The kit's own words: grade, scale, maker, store noise, quotes and the
 *  series name taken out. "Bandai HG 1/144 #03 Gundam Aerial 'The Witch from
 *  Mercury' [PRE-ORDER]" → "Gundam Aerial". */
export function kitCore(title: string): string {
  let t = ` ${title} `;
  t = t.replace(/\[[^\]]*\]|\((?:[^)]*(?:pre-?order|eta|ship|release|arriv|stock|limited|edition|ver)[^)]*)\)/gi, " ");
  t = t.replace(/\beta\s+[a-z]{3,9}\.?(?:\s*[-–/]\s*[a-z]{3,9}\.?)?\s+\d{4}\b|\(\s*tentative\s*\)/gi, " "); // "ETA June-July 2027", "(Tentative)"
  t = t.replace(/["“”][^"“”]{3,}["“”]/g, " "); // "Mobile Suit Gundam SEED"
  t = t.replace(/\s'[^']{6,}'(?=\s|$)/g, " ");
  t = t.replace(/\b(bandai(\s+(spirits|hobby|namco))?|gunpla|plastic\s+model(\s+kit)?|model\s+kit|kit|pre-?\s*order|preorder|new|in\s+stock|japan(ese)?\s+version|official)\b/gi, " ");
  for (const [re, g] of GRADES) if (g !== "30 Minutes") t = t.replace(new RegExp(re.source, "gi"), " ");
  t = t.replace(/\b1\s*\/\s*(144|100|60|48|35|72)\b/g, " ");
  t = t.replace(/(^|\s)#?\d{1,3}(?=\s)/, " "); // the grade's running number "#03", "191"
  t = t.replace(/\s[-–—|:,]+\s/g, " ").replace(/\s+/g, " ").trim();
  return t.replace(/^[-–—|:,\s]+|[-–—|:,\s]+$/g, "");
}

/** "HG 1/144 Gundam Aerial" from the store titles of one JAN: the most common
 *  core (ties: the shortest), behind the grade and scale most stores agree on. */
export function kitName(titles: string[]): { name: string; grade: string | null; scale: string | null } {
  const vote = <T>(xs: (T | null)[]): T | null => {
    const n = new Map<T, number>();
    for (const x of xs) if (x != null) n.set(x, (n.get(x) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const grade = vote(titles.map(gradeOf));
  const scale = vote(titles.map(scaleOf));
  const cores = titles.map(kitCore).filter((c) => c.length >= 3);
  // One entry per wording, case aside; its best-cased spelling (a shop that
  // doesn't shout) represents it.
  const byKey = new Map<string, { core: string; n: number }>();
  const shouts = (c: string) => c === c.toUpperCase();
  for (const c of cores) {
    const k = c.toLowerCase();
    const e = byKey.get(k);
    if (!e) byKey.set(k, { core: c, n: 1 });
    else {
      e.n++;
      if (shouts(e.core) && !shouts(c)) e.core = c;
    }
  }
  const core = [...byKey.values()].sort((a, b) => b.n - a.n || a.core.length - b.core.length)[0]?.core ?? titles[0];
  // "30 Minutes" kits keep their own line name ("30MM bEXM-15 Portanova").
  const prefix = grade && grade !== "30 Minutes" && !new RegExp(`\\b${grade.replace("/", "\\/")}\\b`, "i").test(core) ? grade : null;
  const name = [prefix, scale, titleCase(core)].filter(Boolean).join(" ");
  return { name, grade, scale };
}

// Words a shop shouts ("GUNDAM AERIAL", "30MM bEXM-14T CIELNOVA") are
// capitalised; model codes (RX-78-2, BEXM-21, MK-II), two-letter words (ZZ,
// EW) and names written in capitals on purpose (SEED, AGE, LAH) stay.
const KEEP_CAPS = new Set(["SEED", "ZAFT", "AEUG", "ORB", "GQUUUUUUX", "AGE", "LAH", "IBO", "MSV", "AOZ", "GMS", "UFO", "DX", "EX", "NT", "UC", "HGUC", "SDCS", "SDEX", "MGEX", "MGSD", "PG", "RG", "MG", "HG", "EG", "SD"]);
function titleCase(s: string): string {
  return s.replace(/(^|[\s(\/])([A-Z][A-Z'’]{2,})(?=$|[\s),\/])/g, (m, pre: string, w: string) =>
    KEEP_CAPS.has(w.replace(/['’]/g, "")) ? m : pre + w[0] + w.slice(1).toLowerCase(),
  );
}

export const kitsEnabled = (k: KitsConfig | undefined): k is KitsConfig => !!k && k.stores.length > 0;

export interface KitListing extends KitOffer {
  jan: string;
  derived: boolean;
  title: string;
  grade: string | null;
  image: string | null;
  market: Market;
}

/** One JAN's listings, minus the ones that disagree with the rest: a grade
 *  other than the kit's (the barcode-printing shops decide it when there are
 *  any), or, with three or more listings, a price under 0.4× or over 2.5× the
 *  median (in US dollars at the day's rate). Either is far likelier a wrong
 *  code than a real difference. */
export function keepConsistent(ls: KitListing[], fx: Record<string, number>): KitListing[] {
  const vote = (xs: KitListing[]) => {
    const n = new Map<string, number>();
    for (const l of xs) if (l.grade) n.set(l.grade, (n.get(l.grade) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const direct = ls.filter((l) => !l.derived);
  const grade = vote(direct) ?? vote(ls);
  let out = grade ? ls.filter((l) => !l.grade || l.grade === grade) : ls;
  // Two listings far apart, one read from an item number: trust the barcode.
  if (out.length === 2) {
    const [a, b] = out.map((l) => l.cents / (fx[CURRENCY[l.market]] ?? 1));
    if (Math.max(a, b) / Math.min(a, b) > 3) out = out.filter((l) => !l.derived);
  }
  if (out.length >= 3) {
    const usd = (l: KitListing) => l.cents / (fx[CURRENCY[l.market]] ?? 1);
    const sorted = out.map(usd).sort((a, b) => a - b);
    const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    out = out.filter((l) => usd(l) >= mid * 0.4 && usd(l) <= mid * 2.5);
  }
  return out;
}
