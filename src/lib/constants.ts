// src/lib/constants.ts (owner WP01a, FROZEN). Magic: The Gathering vocabulary. Pure: no I/O, no imports.
// Persisted lists (treatment keys, formats, flag bits, store ids) are APPEND-ONLY: they are written into the PUBLISHED catalogue files (GitHub) and into Neon rows, so a reordering corrupts data that already exists. tests/constants.test.ts pins their order.
// Existing OP export names are kept where the meaning survives: COLORS ColorKey COLOR_KEYS isColor RARITIES RARITY_KEYS rarityLabel CARD_TYPES
// PRINTINGS PRINTING_KEYS SET_KINDS SEALED_KINDS SealedKind sealedKindSlug. Their CONTENTS are Magic's. RARITIES and SET_KINDS are typed Record<string, Info> exactly as in OP, so OP code that indexes them by a string keeps compiling
// (critique 11: the `as const` form broke 17 sites with TS7053); the exact key unions are the types Rarity and SetKind.

// ───────────────────────────── text primitives ─────────────────────────────
/** NFKD, drop combining marks, AE->Ae ae oe, lower-case, delete ' and the curly apostrophe, [^a-z0-9]+ -> one space, trim. The search/join/match normaliser. */
export function fold(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/Æ/g, "Ae").replace(/æ/g, "ae").replace(/Œ/g, "Oe").replace(/œ/g, "oe")
    .toLowerCase().replace(/['\u2019]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

// ───────────────────────────── finishes and units ─────────────────────────────
export const FINISH_KEYS = ["N", "F"] as const;
export type Finish = (typeof FINISH_KEYS)[number];                       // N = TCGplayer "Normal" (non-foil), F = TCGplayer "Foil". There is NEVER a third value.
export const FINISH_INDEX: Record<Finish, 0 | 1> = { N: 0, F: 1 };       // the smallint stored in Unit / Offer / PriceAlert / PriceReport / EbayBest
export const finishFromIndex = (i: number): Finish => (i === 1 ? "F" : "N");
export const TCG_SUBTYPE_FINISH: Record<string, Finish> = { Normal: "N", Foil: "F" };   // TCGCSV prices[].subTypeName; any other value is ignored and counted in ImportRun.summary.magic.unknownSubtypes
export interface UnitRef { id: number; finish: Finish }
export const uidOf = (id: number, f: Finish): number => id * 2 + FINISH_INDEX[f];        // tuples, deal rows, baskets (safe to 1.4M product ids)
export const unitOfUid = (u: number): UnitRef => ({ id: Math.floor(u / 2), finish: finishFromIndex(u % 2) });
export type UnitKey = `${number}.${0 | 1}`;                                               // history files and maps: "<productId>.<finishIndex>"
export const unitKey = (id: number, f: Finish): UnitKey => `${id}.${FINISH_INDEX[f]}` as UnitKey;
export function parseUnitKey(k: string): UnitRef | null {
  const m = /^(\d+)\.([01])$/.exec(k);
  return m ? { id: Number(m[1]), finish: finishFromIndex(Number(m[2])) } : null;
}
export type FinishKind = "nonfoil" | "foil" | "etched";                                    // a VIEW of (card, finish); never stored
export const FINISH_LABEL: Record<FinishKind, string> = { nonfoil: "Non-foil", foil: "Foil", etched: "Foil Etched" };
export const tcgplayerUrl = (productId: number, finish?: Finish): string =>
  `https://www.tcgplayer.com/product/${productId}${finish === "F" ? "?Printing=Foil" : ""}`;   // "?Printing=Foil" is UNVERIFIED and harmless when ignored (owner decision 10.28)

// ───────────────────────────── flag bits, classes, masks ─────────────────────────────
export const CARD_FLAGS = {                       // Card.flags (smallint, bits 0..13)
  ETCHED: 1, SERIAL: 2, PROMO: 4, FULLART: 8, DFC: 16,           // DFC = two image faces (transform, modal_dfc, reversible_card)
  SCRYIMG: 32, TCGIMG: 64, JOINED: 128, FUTURE: 256,             // usable Scryfall image / TCGplayer image exists / linked to a Scryfall printing / presale or released in the future
  FOILONLY: 512, STAR: 1024, NOTPLAY: 2048, UB: 4096, LOWRES: 8192,   // no Normal row exists / shared id with a star twin (fnum set) / not tournament-legal as printed / Universes Beyond / Scryfall lowres scan
} as const;
export const CARD_CLASS = { CARD: 0, TOKEN: 1, ART: 2, OVERSIZED: 3, HELPER: 4 } as const;
export const LINK = { NONE: 0, ID: 1, ETCHED: 2, FALLBACK: 3, VARIANT: 4, ORACLE_NAME: 5 } as const;
export const PRICE_MASK = { HASN: 1, HASF: 2, HEADF: 4, TRACKN: 8, TRACKF: 16, LOWN: 32, LOWF: 64, GONE: 128, LISTED: 256, TOP: 512, CHEAP: 1024, THIN: 2048, GONEP: 4096 } as const;   // Catalogue mask (published catalogue rows; Neon holds none of it). THIN: listed but below the INDEX floor or listed only by the oracle-completeness rule: noindex, out of sitemaps (section 5.3). GONEP: absent from ONE complete day; GONE is set only after two consecutive complete days (section 5.4 F2b). LOWN/LOWF: the unit's value is a thin low, not a market. TOP: dearest class-0 printing of its oracle (market values, ties: lower id). CHEAP: cheapest regular Normal one (deck lines and CSV rows without a set use it)
export const ORACLE_FLAGS = { RESERVED: 1, GAME_CHANGER: 2, COMMANDER: 4, PARTNER: 8, BACKGROUND: 16, CHOOSE_BACKGROUND: 32 } as const;
export const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;      // Offer.condition index; match.ts keeps conditionRank/conditionLabel
export type Condition = (typeof CONDITIONS)[number];
export const STORE_ID = { TCGPLAYER_VIRTUAL: 0, EBAY_BASE: 1 /* 1..6 by MARKET_INDEX, display only */, FEED_BASE: 8 /* 8 cardkingdom, 9 manapool */, REGISTRY_MIN: 10, MAX: 32767 } as const;
export const STALE_HOURS = 72;                                             // an Offer whose StoreRun is older than this is not in stock
export const availableFinishes = (mask: number): Finish[] => [...((mask & PRICE_MASK.HASN) ? ["N" as const] : []), ...((mask & PRICE_MASK.HASF) ? ["F" as const] : [])];
export const trackedBits = (mask: number): number => (mask >> 3) & 3;      // bit 1 = Normal tracked, bit 2 = Foil tracked (CardLite.tracked)

// ───────────────────────────── rarity (EFFECTIVE) ─────────────────────────────
export interface RarityInfo { label: string; order: number; tone: string }
const RARITY_TABLE = {
  M: { label: "Mythic Rare", order: 0, tone: "text-orange-300" },
  R: { label: "Rare",        order: 1, tone: "text-amber-300" },
  U: { label: "Uncommon",    order: 2, tone: "text-slate-300" },
  C: { label: "Common",      order: 3, tone: "text-slate-400" },
  S: { label: "Special",     order: 4, tone: "text-fuchsia-300" },   // Scryfall "special" / "bonus", or TCGplayer S when unjoined
  P: { label: "Promo",       order: 5, tone: "text-lime-300" },      // only when unjoined: a joined promo shows its true rarity and the PROMO flag
  L: { label: "Basic Land",  order: 6, tone: "text-emerald-300" },   // "L" is TCGplayer's own letter for a basic land
  T: { label: "Token",       order: 7, tone: "text-sky-300" },       // class 1
} as const satisfies Record<string, RarityInfo>;
export type Rarity = keyof typeof RARITY_TABLE;
/** OP's shape: indexable by any string. `RARITIES[c.rarity]` compiles for a string; the Rarity union is for code that wants exhaustiveness. */
export const RARITIES: Record<string, RarityInfo> = RARITY_TABLE;
export const RARITY_KEYS = ["M", "R", "U", "C", "S", "P", "L", "T"] as const;
export const isRarity = (v: string): v is Rarity => Object.prototype.hasOwnProperty.call(RARITY_TABLE, v);
export const rarityInfo = (r: string | null | undefined): RarityInfo | undefined => (r ? (RARITIES as Record<string, RarityInfo | undefined>)[r] : undefined);
export const RARITY_SLUGS: Record<Rarity, string> = { M: "mythic", R: "rare", U: "uncommon", C: "common", S: "special", P: "promo", L: "land", T: "token" };
export const SCRYFALL_RARITY: Record<string, Rarity> = { common: "C", uncommon: "U", rare: "R", mythic: "M", special: "S", bonus: "S" };
export function rarityLabel(r: string | null | undefined): string { return rarityInfo(r)?.label ?? r ?? "—"; }
/** cls 1 -> T; TCGplayer L -> L; Scryfall's rarity when joined; else TCGplayer's letter; else S. */
export function effectiveRarity(i: { tcg: string | null; scry: string | null; cls: number }): Rarity {
  if (i.cls === 1) return "T";
  if (i.tcg === "L") return "L";
  if (i.scry && i.scry in SCRYFALL_RARITY) return SCRYFALL_RARITY[i.scry]!;
  if (i.tcg && isRarity(i.tcg)) return i.tcg;
  return "S";
}

// ───────────────────────────── treatments (closed vocabulary) ─────────────────────────────
export type TreatmentKind = "frame" | "art" | "promo" | "edition" | "serial" | "foil" | "language";
export interface TreatmentDef { key: string; label: string; kind: TreatmentKind; foil: boolean; hidden: boolean; chase: boolean; dot?: string; syn: readonly string[]; sf: readonly string[] }
// syn: folded phrases; a trailing "*" also matches the phrase followed by more words ("neon ink*" matches "neon ink yellow"). sf: Scryfall facts that imply the key (rule S).
// chase: feeds isChasePrinting() and the banner pool (src/lib/chase-pool.ts).
const T = <const K extends string>(key: K, label: string, kind: TreatmentKind, syn: readonly string[], o: { foil?: boolean; hidden?: boolean; chase?: boolean; dot?: string; sf?: readonly string[] } = {}) =>
  ({ key, label, kind, foil: !!o.foil, hidden: !!o.hidden, chase: o.chase ?? (kind === "foil" || kind === "serial"), dot: o.dot, syn, sf: o.sf ?? [] }) as { key: K; label: string; kind: TreatmentKind; foil: boolean; hidden: boolean; chase: boolean; dot: string | undefined; syn: readonly string[]; sf: readonly string[] };
export const TREATMENT_KIND_DOT: Record<TreatmentKind, string> = { frame: "#f97316", art: "#c026d3", promo: "#84cc16", edition: "#ca8a04", serial: "#e11d48", foil: "#6366f1", language: "#94a3b8" };
export const TREATMENTS = [
  // frames and art (array order = TREATMENT_ORDER: slug and label order)
  T("borderless", "Borderless", "frame", ["borderless", "borderless alternate art"], { chase: true, sf: ["border:borderless"] }),
  T("extended", "Extended Art", "frame", ["extended art", "extended", "ea"], { chase: true, sf: ["frame:extendedart"] }),
  T("showcase", "Showcase", "frame", ["showcase"], { chase: true, sf: ["frame:showcase"] }),
  T("scroll", "Showcase Scrolls", "frame", ["showcase scrolls", "scroll", "scrolls"], { chase: true, sf: ["promo:scroll"] }),
  T("sketch", "Sketch", "frame", ["sketch", "sketch showcase"], { chase: true }),
  T("retro", "Retro Frame", "frame", ["retro frame", "retro"], { chase: true }),                    // NO sf: a 1997-frame printing in an old set is not "retro"
  T("inverted", "Inverted", "frame", ["inverted"], { sf: ["frame:inverted"] }),
  T("fullart", "Full Art", "frame", ["full art", "full-art"], { chase: true, sf: ["flag:full_art"] }),
  T("anime", "Anime", "art", ["anime", "anime borderless"], { chase: true }),
  T("poster", "Poster", "art", ["poster", "borderless poster"], { chase: true, sf: ["promo:poster"] }),
  T("concept", "Concept Praetor", "art", ["concept praetor", "concept"], { chase: true, sf: ["promo:concept"] }),
  T("stainedglass", "Stained Glass", "art", ["stained glass"]),
  T("shatteredglass", "Shattered Glass", "art", ["shattered glass"], { sf: ["frame:shatteredglass"] }),
  T("jp", "Japan Showcase", "art", ["jp alternate art", "jp exclusive", "jp", "japan showcase", "japanese showcase", "jp graphic novel insert"], { sf: ["promo:japanshowcase", "promo:jpwalker"] }),
  T("phyrexian", "Phyrexian", "art", ["phyrexian"]),                              // an ART variant in a fictional language, not a language
  T("schematic", "Schematic", "art", ["schematic"]),
  T("futuresight", "Future Sight", "frame", ["future sight"]),                      // NO sf: Scryfall frame "future" also covers the original Future Sight set
  T("whiteborder", "White Border", "edition", ["white border"]),                    // NO sf: 5,159 printings are white-bordered by default
  T("nopw", "No PW Symbol", "edition", ["no pw symbol"], { hidden: true }),
  T("display", "Display Commander", "edition", ["display commander", "thick stock"], { sf: ["promo:thick"] }),
  T("ce", "Collector's Edition", "edition", ["ce", "collector's edition"]),
  T("ie", "International Edition", "edition", ["ie", "international edition"]),
  // promo stamps and events (the first block can also come from the GROUP, see GROUP_TREATMENTS)
  T("prerelease", "Prerelease", "promo", ["prerelease", "pre-release", "prerelease stamped"], { sf: ["promo:prerelease"] }),
  T("promopack", "Promo Pack", "promo", ["promo pack"], { sf: ["promo:promopack"] }),
  T("thelist", "The List", "promo", []),                                               // group-derived only
  T("specialguest", "Special Guest", "promo", []),
  T("secretlair", "Secret Lair", "promo", []),
  T("buyabox", "Buy-a-Box", "promo", ["buy-a-box", "buy a box"], { sf: ["promo:buyabox"] }),
  T("bundle", "Bundle", "promo", ["bundle", "costco bundle"], { sf: ["promo:bundle"] }),        // "<2-4 char set code> Bundle" ("WAR Bundle") is this key plus src
  T("launch", "Launch Party", "promo", ["launch", "launch party", "launch promo"]),
  T("gameday", "Game Day", "promo", ["game day"], { sf: ["promo:gameday"] }),
  T("fnm", "Friday Night Magic", "promo", ["fnm", "friday night magic"], { sf: ["promo:fnm"] }),
  T("judge", "Judge Gift", "promo", ["judge", "judge gift", "judge promo"], { sf: ["promo:judgegift"] }),
  T("arenaleague", "Arena League", "promo", ["arena league"], { sf: ["promo:arenaleague"] }),
  T("wpn", "WPN / Gateway", "promo", ["wpn", "wpn exclusive", "wpn & gateway"]),
  T("datestamped", "Date-Stamped", "promo", ["date-stamped", "date stamped"], { sf: ["promo:datestamped"] }),
  T("stamped", "Stamped", "promo", ["gold-stamped*", "stamped*", "planeswalker stamp"], { sf: ["promo:stamped"] }),
  T("placing", "Event placing", "promo", ["winner", "finalist", "top 8", "1st place", "2nd place", "3rd place", "4th place"], { hidden: true }),   // the exact placing stays in the label and the slug
  T("planechase", "Planechase", "promo", ["planechase", "planechase anthology", "planechase 2012"]),
  T("archenemy", "Archenemy", "promo", ["archenemy"]),
  T("sb", "Sideboard", "promo", ["sb"], { hidden: true }),                         // World Championship Decks sideboard copy: a separate product with its own price
  T("serial", "Serialized", "serial", ["serial numbered", "serialized"], { sf: ["promo:serialized"] }),
  // foil patterns: each is its own TCGplayer product with a Foil row only (foil: true)
  T("etched", "Foil Etched", "foil", ["foil etched", "etched", "etched foil"], { foil: true }),                  // NO sf: the etched fact is a property of the PRODUCT (rule E)
  T("surge", "Surge Foil", "foil", ["surge foil", "surge-foil"], { foil: true }),
  T("galaxy", "Galaxy Foil", "foil", ["galaxy foil"], { foil: true }),
  T("ripple", "Ripple Foil", "foil", ["ripple foil"], { foil: true }),
  T("rainbow", "Rainbow Foil", "foil", ["rainbow foil"], { foil: true }),
  T("doublerainbow", "Double Rainbow Foil", "foil", ["double rainbow foil", "double rainbow"], { foil: true }),
  T("textured", "Textured Foil", "foil", ["textured foil", "textured"], { foil: true }),
  T("halo", "Halo Foil", "foil", ["halo foil"], { foil: true }),
  T("fracture", "Fracture Foil", "foil", ["fracture foil"], { foil: true }),
  T("confetti", "Confetti Foil", "foil", ["confetti foil"], { foil: true }),
  T("raised", "Raised Foil", "foil", ["raised foil"], { foil: true }),
  T("compleat", "Step-and-Compleat Foil", "foil", ["step-and-compleat foil", "step and compleat foil", "compleat foil"], { foil: true }),
  T("gilded", "Gilded Foil", "foil", ["gilded foil"], { foil: true }),
  T("silverscroll", "Silver Scroll Foil", "foil", ["silver scroll foil"], { foil: true }),
  T("silverfoil", "Silver Foil", "foil", ["silver foil"], { foil: true }),
  T("manafoil", "Mana Foil", "foil", ["mana foil"], { foil: true }),
  T("neon", "Neon Ink Foil", "foil", ["neon ink*", "neon ink foil"], { foil: true }),
  T("oilslick", "Oil Slick Raised Foil", "foil", ["oil slick", "oil slick raised foil"], { foil: true }),
  T("invisible", "Invisible Ink Foil", "foil", ["invisible ink", "invisible ink foil"], { foil: true }),
  T("facet", "Facet Foil", "foil", ["facet foil"], { foil: true }),
  T("firstplace", "First-Place Foil", "foil", ["first-place foil", "first place foil"], { foil: true }),
  T("embossed", "Embossed Foil", "foil", ["embossed", "embossed foil"], { foil: true }),
  T("otherfoil", "Special Foil", "foil", ["alternate foil", "pool party foil", "out of sight foil", "black & white foil", "dazzle foil", "dragonscale foil", "cosmic foil", "singularity foil", "glossy foil", "chocobo track foil"], { foil: true, hidden: true, chase: false }),
  // languages that appear on products inside included groups (non-English groups are excluded wholesale)
  T("lang-es", "Spanish", "language", ["spanish"], { hidden: true }), T("lang-it", "Italian", "language", ["italian"], { hidden: true }),
  T("lang-fr", "French", "language", ["french"], { hidden: true }),  T("lang-de", "German", "language", ["german"], { hidden: true }),
  T("lang-ja", "Japanese", "language", ["japanese"], { hidden: true }), T("lang-pt", "Portuguese", "language", ["portuguese"], { hidden: true }),
  T("lang-ko", "Korean", "language", ["korean"], { hidden: true }), T("lang-zh", "Chinese", "language", ["chinese"], { hidden: true }), T("lang-ru", "Russian", "language", ["russian"], { hidden: true }),
] as const satisfies readonly TreatmentDef[];
export type TreatmentKey = (typeof TREATMENTS)[number]["key"];                       // CLOSED: no "raw:" keys. Unknown words go to Card.label, the slug and the unknownWords counter
export const TREATMENT_KEYS: readonly TreatmentKey[] = TREATMENTS.map((t) => t.key);
export const TREATMENT_BY_KEY: Readonly<Record<string, TreatmentDef>> = Object.fromEntries(TREATMENTS.map((t) => [t.key, t]));
const synFold = (s: string): string => fold(s.replace(/\*$/, "")) + (s.endsWith("*") ? " *" : "");
/** fold(syn) -> key; "neon ink *" is a prefix synonym. A duplicate synonym fails tests/constants.test.ts. */
export const TREATMENT_BY_SYNONYM: ReadonlyMap<string, TreatmentKey> = new Map(TREATMENTS.flatMap((t) => t.syn.map((s) => [synFold(s), t.key] as const)));
export const FOIL_PATTERN_KEYS: ReadonlySet<string> = new Set(TREATMENTS.filter((t) => t.foil).map((t) => t.key));
export const IGNORED_FINISH_WORDS: readonly string[] = ["foil", "non-foil", "nonfoil", "normal", "regular"];   // finish words never become treatments or label text
/** Group-level treatments: the group IS the treatment when the product name carries no word for it. First match wins; applied to cls 0 products; added to `treat` if absent. */
export const GROUP_TREATMENTS: readonly (readonly [RegExp, TreatmentKey])[] = [
  [/^Prerelease Cards$/, "prerelease"], [/^Promo Pack:/, "promopack"], [/^The List Reprints$/, "thelist"], [/^Special Guests$/, "specialguest"], [/Secret Lair|^SLX Cards$/, "secretlair"],
  [/^Game Day & Store Championship Promos$/, "gameday"], [/^FNM Promos$/, "fnm"], [/^Judge Promos$/, "judge"], [/^Buy-A-Box Promos$/, "buyabox"],
  [/^Launch Party & Release Event Promos$/, "launch"], [/^WPN & Gateway Promos$/, "wpn"], [/^Arena Promos$/, "arenaleague"],
  [/^Collector's Edition$/, "ce"], [/^International Edition$/, "ie"],
];
export const parseTreat = (s: string): TreatmentKey[] => s.split(/\s+/).filter((k): k is TreatmentKey => k in TREATMENT_BY_KEY);
export const joinTreat = (keys: readonly TreatmentKey[]): string => TREATMENT_KEYS.filter((k) => keys.includes(k)).join(" ");   // sorted by array order, de-duplicated
export const hasTreatment = (c: { treat: readonly TreatmentKey[] }, key: string): boolean => (c.treat as readonly string[]).includes(key);
export const isChasePrinting = (c: { treat: readonly TreatmentKey[]; flags?: number }): boolean => c.treat.some((k) => TREATMENT_BY_KEY[k]?.chase) || ((c.flags ?? 0) & (CARD_FLAGS.ETCHED | CARD_FLAGS.SERIAL | CARD_FLAGS.FULLART)) !== 0;
/** OP's `printing`: the first key by array order, else "standard". */
export const printingOf = (treat: readonly TreatmentKey[]): string => TREATMENT_KEYS.find((k) => treat.includes(k)) ?? "standard";
/** OP-compatible views, derived. `standard` is always first. */
export const PRINTINGS: Record<string, { label: string; dot: string; order: number }> = {
  standard: { label: "Standard", dot: "#7d8794", order: -1 },
  ...Object.fromEntries(TREATMENTS.map((t, i) => [t.key, { label: t.label, dot: t.dot ?? TREATMENT_KIND_DOT[t.kind], order: i }])),
};
export const PRINTING_KEYS: string[] = Object.keys(PRINTINGS).sort((a, b) => PRINTINGS[a]!.order - PRINTINGS[b]!.order);
export type Printing = string;   // deliberately NOT a union: a stale `=== "don"` compiles and is caught by tests/legacy-vocab.test.ts
export function treatmentLabel(treat: readonly TreatmentKey[]): string { return TREATMENT_KEYS.filter((k) => treat.includes(k)).map((k) => TREATMENT_BY_KEY[k]!.label).join(" · "); }
/** Finish word of a unit: N "Non-foil"; F: ETCHED "Foil Etched"; else the label of the first foil-pattern treatment ("Surge Foil"); else "Foil". */
export function finishLabel(c: { flags: number; treat: readonly TreatmentKey[] }, f: Finish): string {
  if (f === "N") return FINISH_LABEL.nonfoil;
  if (c.flags & CARD_FLAGS.ETCHED) return FINISH_LABEL.etched;
  const p = TREATMENT_KEYS.find((k) => c.treat.includes(k) && FOIL_PATTERN_KEYS.has(k));
  return p ? TREATMENT_BY_KEY[p]!.label : FINISH_LABEL.foil;
}
export function finishKind(c: { flags: number }, f: Finish): FinishKind { return f === "N" ? "nonfoil" : c.flags & CARD_FLAGS.ETCHED ? "etched" : "foil"; }
/** ?finish= values: nonfoil|normal|n -> N; foil|f -> F; etched|e|foil-etched -> F + etched; anything else null (ignored, never a 404). */
export function parseFinishParam(v: string | null | undefined): { finish: Finish; etched: boolean } | null {
  const s = (v ?? "").toLowerCase();
  if (s === "nonfoil" || s === "normal" || s === "n" || s === "non-foil") return { finish: "N", etched: false };
  if (s === "foil" || s === "f") return { finish: "F", etched: false };
  if (s === "etched" || s === "e" || s === "foil-etched") return { finish: "F", etched: true };
  return null;
}
export const finishParam = (f: Finish, kind?: FinishKind): "nonfoil" | "foil" | "etched" => (f === "N" ? "nonfoil" : kind === "etched" ? "etched" : "foil");

// ───────────────────────────── set kinds ─────────────────────────────
export interface SetKindInfo { label: string; plural: string; order: number; hidden: boolean }
const SET_KIND_TABLE = {
  expansion:     { label: "Expansion",              plural: "Expansions",                     order: 0,  hidden: false },
  core:          { label: "Core set",               plural: "Core sets",                      order: 1,  hidden: false },
  masters:       { label: "Masters & special set",  plural: "Masters and special sets",       order: 2,  hidden: false },
  commander:     { label: "Commander",              plural: "Commander products",             order: 3,  hidden: false },
  deck:          { label: "Deck product",           plural: "Duel decks, precons and others", order: 4,  hidden: false },
  "secret-lair": { label: "Secret Lair",            plural: "Secret Lair drops",              order: 5,  hidden: false },
  list:          { label: "The List",               plural: "The List and Special Guests",    order: 6,  hidden: false },
  promo:         { label: "Promos",                 plural: "Promos and events",              order: 7,  hidden: false },
  "promo-pack":  { label: "Promo Pack",             plural: "Promo Packs",                    order: 8,  hidden: false },
  "gold-border": { label: "Collector's & gold border", plural: "Collector's, International and World Championship", order: 9, hidden: false },   // visible: Black Lotus CE/IE is a collectible. Its printings carry NOTPLAY
  unset:         { label: "Un-set & playtest",      plural: "Un-sets and playtest cards",     order: 10, hidden: false },   // visible; printings carry NOTPLAY
  "art-series":  { label: "Art Series",             plural: "Art Series",                     order: 11, hidden: true },
  oversized:     { label: "Oversized",              plural: "Oversized cards",                order: 12, hidden: true },
} as const satisfies Record<string, SetKindInfo>;
export type SetKind = keyof typeof SET_KIND_TABLE;
/** OP's shape: indexable by any string (`SET_KINDS[s.kind]`). */
export const SET_KINDS: Record<string, SetKindInfo> = SET_KIND_TABLE;
export const SET_KIND_KEYS = Object.keys(SET_KIND_TABLE) as SetKind[];
export const HIDDEN_SET_KINDS: readonly SetKind[] = ["art-series", "oversized"];                 // out of default search, browse, price guide, the sets index and the sitemap names; reachable by URL; noindex
export const MAIN_SET_KINDS: readonly SetKind[] = ["expansion", "core", "masters"];              // releasedSets() default, market, movers, price guide, nav "Sets" (replaces OP's ["booster","extra","premium"])
export const RELEASE_SET_KINDS: readonly SetKind[] = ["expansion", "core", "masters", "commander"];   // release dates, calendar, countdown, upcomingSets() (replaces OP's [... "starter"])
export const TRACKER_SET_KINDS: readonly SetKind[] = ["expansion", "core", "masters", "commander", "deck", "secret-lair", "list"];   // the set tracker / portfolio sets
export const NOTPLAY_SET_KINDS: readonly SetKind[] = ["gold-border", "unset", "art-series", "oversized"];   // every printing is not tournament-legal as printed
export const isHiddenKind = (k: string): boolean => (HIDDEN_SET_KINDS as readonly string[]).includes(k);
/** A group whose publishedOn carries fractional seconds is a rolling "bucket" (31 included groups today); a real release date does not. */
export const ROLLING_PUBLISHED = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z$/;
export const GROUP_RULES: readonly (readonly [SetKind | "foreign" | "non-card", RegExp])[] = [
  ["foreign",     /Foreign (Black|White) Border|Salvat|Hachette|JingHe|^Renaissance$/],                                                       // 1  not imported
  ["non-card",    /^(Magic: The Gathering Apparel|Box Sets|Launch Party Cards|Mystery Booster Cards|Rivals Quick Start Set|Spellslinger Starter Kit|Mystery Booster: Retail Exclusives)$/],   // 2  not imported
  ["art-series",  /^Art Series:/],                                                                                                            // 3
  ["oversized",   /^Oversize Cards$/],                                                                                                        // 4
  ["unset",       /^(Unglued|Unhinged|Unstable|Unsanctioned|Unfinity)$|Un-Known|Playtest|^Ponies:/],                                          // 5
  ["secret-lair", /Secret Lair|^SLX Cards$/],                                                                                                 // 6
  ["list",        /^(The List Reprints|Special Guests)$/],                                                                                    // 7
  ["promo-pack",  /^Promo Pack:/],                                                                                                            // 8
  ["gold-border", /^(Collector's Edition|International Edition|World Championship Decks|Summer Magic)$/],                                      // 9
  ["promo",       /Promos?$|Promo Cards$|Prerelease Cards|Magic Player Rewards|MagicFest|Gift Boxes|Magic Premiere Shop|Special Occasion|APAC Lands|Guru Lands|European Lands|Challenger Decks|Ampersand|30th Anniversary Promos|Breaking News|The Big Score/],   // 10
  ["deck",        /^(Duel Decks|From the Vault|Premium Deck Series|Signature Spellbook|Mythic Edition|Magic Game Night|Welcome Deck|Planechase|Archenemy|Battle Royale|Beatdown|Deckmasters|Magic Modern Event|Coldsnap Theme|Duels of the Planeswalkers|Arena Starter|Starter 19|Starter 20|Vanguard|Introductory|Anthologies|Explorers of Ixalan|Starter Commander|Commander Collection|Global Series)|Guild Kits/],   // 11
  ["commander",   /^Commander\b(?! Legends| Masters)|Commander Anthology|Commander's Arsenal/],                                               // 12
  ["masters",     /Masters|Remastered|Mystery Booster|Conspiracy|Modern Horizons|Jumpstart|Chronicles|Timeshifted|Double Feature|Multiverse Legends|The Aftermath|Enchanting Tales|Mystical Archive|Stellar Sights|Eternal-Legal|Through the Ages|Source Material|Clue Edition|Retro Frame Artifacts|Anniversary Edition|Battlebond|Commander Legends|Masterpiece|Expeditions|Box Toppers|Jurassic World/],   // 13
  ["core",        /^(Alpha|Beta|Unlimited|Revised|Fourth|Fifth|Classic Sixth|7th|8th|9th|10th) Edition$|^Magic 20\d\d|^Core Set/],            // 14
];
/** First match on the group NAME wins (never the abbreviation). 15: an unnamed rolling bucket is a promo bucket; 16: everything else is an expansion. foreign and non-card groups are NOT imported. */
export function classifyGroup(g: { name: string; publishedOn?: string | null }): SetKind | "foreign" | "non-card" {
  for (const [kind, rx] of GROUP_RULES) if (rx.test(g.name)) return kind;
  if (ROLLING_PUBLISHED.test(g.publishedOn ?? "")) return "promo";
  return "expansion";
}
export const isBucketGroup = (g: { publishedOn?: string | null }): boolean => ROLLING_PUBLISHED.test(g.publishedOn ?? "");

// ───────────────────────────── sealed kinds ─────────────────────────────
export const SEALED_KINDS = [
  "Booster Box", "Case", "Booster Pack", "Bundle", "Commander Deck", "Prerelease Pack", "Starter Product", "Secret Lair Drop", "Collection & Gift", "Tin & Box Set", "Other",
] as const;
export type SealedKind = (typeof SEALED_KINDS)[number];
export function sealedKindSlug(k: string): string { return k.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
/** Ordered, first match wins, on the lower-cased product name; applied only to products without `Rarity` in the 439 included groups. Counts on 2026-10-07 (3,712 products in the 439 imported groups), in rule order: Secret Lair Drop 1,079; Case 328; Prerelease Pack 168; Commander Deck 199; Bundle 142; Booster Box 382; Booster Pack 596; Starter Product 682 (510 before the Intro Pack rule moved 172 products out of Booster Pack); Tin & Box Set 80; Collection & Gift 8; Other 48. */
export const SEALED_RULES: readonly (readonly [SealedKind, RegExp])[] = [
  ["Secret Lair Drop", /secret lair/],
  ["Case", /\bcase\b/],
  ["Prerelease Pack", /pre-?release/],
  ["Commander Deck", /commander deck|commander collection|commander (starter|party)/],
  ["Bundle", /\b(bundle|fat pack|gift bundle)\b/],
  ["Booster Box", /booster display|booster box|\bdisplay\b|\bbox\b(?! set)/],
  ["Starter Product", /\bintro pack\b/],                                   // an Intro Pack is a 60-card deck with two boosters (172 products), not a booster pack
  ["Booster Pack", /\bboosters?\b|\bpack\b/],
  ["Starter Product", /starter|welcome|planeswalker deck|challenger|theme deck|beginner|intro|\bkit\b|\bdeck\b/],
  ["Tin & Box Set", /\btin\b|box set|\bset of\b|\bbox\b/],
  ["Collection & Gift", /collection|gift|anthology|\bedition\b|collector/],
];
export function sealedKind(name: string): SealedKind { const n = name.toLowerCase(); for (const [k, rx] of SEALED_RULES) if (rx.test(n)) return k; return "Other"; }

// ───────────────────────────── formats and legality ─────────────────────────────
export const FORMATS = ["standard", "future", "historic", "timeless", "gladiator", "pioneer", "modern", "legacy", "pauper", "vintage", "penny", "commander", "oathbreaker", "standardbrawl", "brawl", "competitivebrawl", "alchemy", "paupercommander", "duel", "premodern", "predh", "tlr"] as const;   // index = position in Oracle.legal. Append-only. `oldschool` is dropped on purpose (differs per printing, 772 oracles)
export type Format = (typeof FORMATS)[number];
export const FORMAT_INDEX = Object.fromEntries(FORMATS.map((f, i) => [f, i])) as Record<Format, number>;
export const FORMAT_LABEL: Record<Format, string> = {
  standard: "Standard", future: "Future Standard", historic: "Historic", timeless: "Timeless", gladiator: "Gladiator", pioneer: "Pioneer", modern: "Modern", legacy: "Legacy",
  pauper: "Pauper", vintage: "Vintage", penny: "Penny Dreadful", commander: "Commander", oathbreaker: "Oathbreaker", standardbrawl: "Standard Brawl", brawl: "Brawl",
  competitivebrawl: "Competitive Brawl", alchemy: "Alchemy", paupercommander: "Pauper Commander", duel: "Duel Commander", premodern: "Premodern", predh: "PreDH", tlr: "TLR",   // "tlr": expansion unverified; hidden from the UI list
};
export const FORMAT_UI: readonly Format[] = ["standard", "pioneer", "modern", "legacy", "vintage", "commander", "pauper", "brawl", "oathbreaker", "historic", "timeless", "alchemy"];   // shown by default
export const LEGAL_CHARS = { L: "legal", N: "not_legal", B: "banned", R: "restricted", "?": "unknown" } as const;
export type LegalStatus = (typeof LEGAL_CHARS)[keyof typeof LEGAL_CHARS];
export const LEGAL_FROM_SCRYFALL: Record<string, keyof typeof LEGAL_CHARS> = { legal: "L", not_legal: "N", banned: "B", restricted: "R" };
/** A missing string, a missing index or "?" -> "unknown" (rendered as NOTHING: unknown is not "not legal"). */
export function legalityOf(legal: string | null | undefined, f: Format): LegalStatus { return (LEGAL_CHARS as Record<string, LegalStatus>)[(legal ?? "")[FORMAT_INDEX[f]] ?? "?"] ?? "unknown"; }
export const isPlayable = (legal: string | null | undefined, f: Format): boolean => { const s = legalityOf(legal, f); return s === "legal" || s === "restricted"; };
/** Importer side: Scryfall's `legalities` object -> the 22-char string. A status outside the four -> "?" (counted); an unknown extra key is returned, never fatal. */
export function legalString(src: Record<string, string> | undefined): { legal: string; unknownKeys: string[]; unknownStatuses: number } {
  let unknownStatuses = 0;
  const legal = FORMATS.map((f) => { const c = LEGAL_FROM_SCRYFALL[src?.[f] ?? ""]; if (!c) unknownStatuses++; return c ?? "?"; }).join("");
  const known = new Set<string>([...FORMATS, "oldschool"]);
  return { legal, unknownKeys: Object.keys(src ?? {}).filter((k) => !known.has(k)), unknownStatuses };
}
export const legalSql = (f: Format): string => `substr("legal", ${FORMAT_INDEX[f] + 1}, 1)`;     // SQL fragment (no user input): playable = ... IN ('L','R')
export const playableAsPrinted = (c: { flags: number; cls: number }): boolean => !(c.flags & CARD_FLAGS.NOTPLAY) && c.cls === CARD_CLASS.CARD;

// ───────────────────────────── colours, identity, types ─────────────────────────────
export const COLORS = {   // OP-compatible shape: keyed by the colour NAME; WUBRG order; `bit` is the Card.colors / Oracle.colors / Oracle.identity bitmask
  White: { label: "White", letter: "W", bit: 1,  hex: "#f2e9c9", tagline: "Order, protection & lifegain",     slug: "white" },
  Blue:  { label: "Blue",  letter: "U", bit: 2,  hex: "#2f7fd6", tagline: "Knowledge, counters & tempo",      slug: "blue"  },
  Black: { label: "Black", letter: "B", bit: 4,  hex: "#8b7d9e", tagline: "Death, removal & sacrifice",       slug: "black" },
  Red:   { label: "Red",   letter: "R", bit: 8,  hex: "#e0383e", tagline: "Speed, burn & chaos",              slug: "red"   },
  Green: { label: "Green", letter: "G", bit: 16, hex: "#21a35f", tagline: "Growth, ramp & big creatures",     slug: "green" },
} as const;
export type ColorKey = keyof typeof COLORS;
export const COLOR_KEYS = Object.keys(COLORS) as ColorKey[];
export function isColor(v: string): v is ColorKey { return Object.prototype.hasOwnProperty.call(COLORS, v); }
export const COLOR_BIT = { W: 1, U: 2, B: 4, R: 8, G: 16 } as const;
export type ColorLetter = keyof typeof COLOR_BIT;
export const COLOR_LETTERS = ["W", "U", "B", "R", "G"] as const;
/** Pseudo-colours for hubs and filters. */
export const COLOR_GROUPS = {
  colorless:  { label: "Colorless",  slug: "colorless",  hex: "#a8a8b0", tagline: "Artifacts, lands and Eldrazi" },
  multicolor: { label: "Multicolor", slug: "multicolor", hex: "#d4af37", tagline: "Two or more colors" },
} as const;
export const COLOR_PAGES = ["white", "blue", "black", "red", "green", "colorless", "multicolor"] as const;   // /colors/[color]
export type ColorPage = (typeof COLOR_PAGES)[number];
export const colorMask = (colors: readonly string[]): number => colors.reduce((m, c) => m | (isColor(c) ? COLORS[c].bit : (COLOR_BIT as Record<string, number>)[c] ?? 0), 0);   // accepts names or letters
export const colorsOfMask = (mask: number): ColorKey[] => COLOR_KEYS.filter((k) => (mask & COLORS[k].bit) !== 0);                        // WUBRG order; [] = colourless
export const maskLetters = (mask: number): ColorLetter[] => COLOR_LETTERS.filter((l) => (mask & COLOR_BIT[l]) !== 0);
export const colorKind = (mask: number): "colorless" | "mono" | "multi" => { const n = maskLetters(mask).length; return n === 0 ? "colorless" : n === 1 ? "mono" : "multi"; };
/** White..Green = EXACTLY that one colour; colorless = mask 0; multicolor = 2+ colours. Card colour, not identity. */
export function matchesColorPage(mask: number, page: ColorPage): boolean {
  if (page === "colorless") return mask === 0;
  if (page === "multicolor") return colorKind(mask) === "multi";
  return mask === COLOR_BIT[page === "white" ? "W" : page === "blue" ? "U" : page === "black" ? "B" : page === "red" ? "R" : "G"];
}
/** Does a card's identity fit inside a commander's? (deck rule: every card's identity is a subset) */
export const identityFits = (cardIdentity: number, deckIdentity: number): boolean => (cardIdentity & ~deckIdentity) === 0;
export const IDENTITY_NAMES: Readonly<Record<number, string>> = {
  0: "Colorless", 1: "White", 2: "Blue", 4: "Black", 8: "Red", 16: "Green",
  3: "Azorius", 6: "Dimir", 12: "Rakdos", 24: "Gruul", 17: "Selesnya", 5: "Orzhov", 10: "Izzet", 20: "Golgari", 9: "Boros", 18: "Simic",
  7: "Esper", 14: "Grixis", 28: "Jund", 25: "Naya", 19: "Bant", 21: "Abzan", 11: "Jeskai", 22: "Sultai", 13: "Mardu", 26: "Temur",
  15: "Yore-Tiller", 30: "Glint-Eye", 29: "Dune-Brood", 27: "Ink-Treader", 23: "Witch-Maw", 31: "Five-color",
};
export const identityName = (mask: number): string => IDENTITY_NAMES[mask] ?? "Colorless";
export const PRIMARY_TYPES = ["creature", "planeswalker", "battle", "land", "artifact", "enchantment", "instant", "sorcery", "kindred", "other"] as const;
export type PrimaryType = (typeof PRIMARY_TYPES)[number];                  // Card.ptype = index
export const PRIMARY_TYPE_LABEL: Record<PrimaryType, string> = { creature: "Creature", planeswalker: "Planeswalker", battle: "Battle", land: "Land", artifact: "Artifact", enchantment: "Enchantment", instant: "Instant", sorcery: "Sorcery", kindred: "Kindred", other: "Other" };
export const CARD_TYPES = PRIMARY_TYPES.map((t) => PRIMARY_TYPE_LABEL[t]) as readonly string[];   // OP name kept: facet labels, in PRIMARY_TYPES order
/** FRONT face only (text before " // ") and only the part before the em dash; first match in PRIMARY_TYPES order. "Artifact Creature" -> creature, "Artifact Land" -> land, "Kindred Instant" / "Tribal Instant" -> instant,
 *  "Summon Wolf" -> creature, "Interrupt" -> instant, Plane / Scheme / Vanguard / Conspiracy / Attraction / Dungeon / Emblem -> other. */
export function primaryType(typeLine: string | null | undefined): PrimaryType {
  const types = (typeLine ?? "").split(" // ")[0]!.split(/\s[—–-]\s/)[0]!.toLowerCase();
  for (const t of PRIMARY_TYPES) if (t !== "other" && new RegExp(`\\b${t}\\b`).test(types)) return t;
  if (/\bsummon\b/.test(types)) return "creature";
  if (/\binterrupt\b/.test(types)) return "instant";
  return "other";
}
export const ptypeOf = (typeLine: string | null | undefined): number => PRIMARY_TYPES.indexOf(primaryType(typeLine));
/** COMMANDER: the Oracle is commander-legal AND (FRONT face is Legendary and a Creature, or a Legendary Vehicle/Spacecraft with power and toughness, or the text says "can be your commander").
 *  27 oracles are legendary creatures only on the BACK face and are not commanders. PARTNER: keywords partner, partner-with, friends-forever, doctors-companion. */
export function oracleFlags(o: { typeLine: string; oracleText: string | null; keywords: readonly string[]; power: string | null; toughness: string | null; reserved: boolean; gameChanger: boolean; commanderLegal: boolean }): number {
  const front = o.typeLine.split(" // ")[0]!;
  const legendary = /\bLegendary\b/.test(front);
  const creature = /\bCreature\b/.test(front);
  const vehicle = /\b(Vehicle|Spacecraft)\b/.test(front) && o.power != null && o.toughness != null;
  const text = o.oracleText ?? "";
  const kw = new Set(o.keywords.map((k) => k.toLowerCase().replace(/\s+/g, "-")));
  let f = 0;
  if (o.reserved) f |= ORACLE_FLAGS.RESERVED;
  if (o.gameChanger) f |= ORACLE_FLAGS.GAME_CHANGER;
  if (o.commanderLegal && ((legendary && (creature || vehicle)) || /can be your commander/i.test(text))) f |= ORACLE_FLAGS.COMMANDER;
  if (["partner", "partner-with", "friends-forever", "doctors-companion"].some((k) => kw.has(k))) f |= ORACLE_FLAGS.PARTNER;
  if (/\bBackground\b/.test(front)) f |= ORACLE_FLAGS.BACKGROUND;
  if (kw.has("choose-a-background")) f |= ORACLE_FLAGS.CHOOSE_BACKGROUND;
  return f;
}

// ───────────────────────────── names ─────────────────────────────
export const FRONT_ONLY_LAYOUTS = ["transform", "modal_dfc", "adventure", "flip", "prepare", "reversible_card"] as const;
export const frontFace = (fullName: string): string => fullName.split(" // ")[0]!;
/** The name TCGplayer, the stores and users use. split (incl. fuse and aftermath) keep "A // B"; FRONT_ONLY_LAYOUTS show the FRONT face only; everything else is Scryfall's name. Pure. */
export function displayName(layout: string | null | undefined, oracleName: string): string {
  return layout && (FRONT_ONLY_LAYOUTS as readonly string[]).includes(layout) ? frontFace(oracleName) : oracleName;
}
/** The printed (flavor) name of a Universes Beyond reskin: flavor_name, else the face-0 flavor name. */
export const reskinAlt = (r: { flavorName: string | null; faceFlavorNames: readonly (string | null)[] }): string | null => r.flavorName ?? r.faceFlavorNames[0] ?? null;
/** Folded forms for search and for the store matcher: name, front face, every face, alt, TCG core name. */
export function nameForms(c: { name: string; alt: string | null; tcgName: string }, oracle?: { name: string }): string[] {
  const forms = new Set<string>();
  for (const s of [c.name, c.alt, c.tcgName, oracle?.name, ...(oracle?.name ?? c.name).split(" // ")]) { const f = fold(s); if (f) forms.add(f); }
  return [...forms];
}

// ───────────────────────────── collector numbers (a locator, never an identity) ─────────────────────────────
function cleanNumber(n: string | null | undefined): string | null {
  if (!n) return null;
  let s = String(n).trim().toLowerCase();
  s = s.includes(" // ") ? s.split(" // ")[0]! : s.replace(/\s*\/\s*\d+$/, "");
  return s.replace(/^0+(?=\d)/, "") || null;
}
/** Lookup key. "029/281" -> "29"; "0205" -> "205"; "7 // 2" -> "7"; "213★" -> "213"; "A39" -> "a39"; "551a" -> "551a"; "165p" -> "165p"; "KHC-29" -> "khc-29"; null/"" -> null. Letters and prefixes ARE identity, stars are not. */
export function nkey(n: string | null | undefined): string | null { const k = cleanNumber(n); return k ? k.replace(/[★†‡*]+$/, "") || null : null; }
/** Natural-sort integer (< 2^31): (prefix ? 1e9 : 0) + min(digits, 999999) * 1000 + suffixRank (0 none, 1 star/dagger, 2 + (letter - 'a') for one letter, 30 anything else); no digits -> 2e9. "2" < "10" < "10★" < "10a" < "11"; prefixed numbers sort after plain ones. */
export function nsort(n: string | null | undefined): number {
  const m = /^([^\d]*)(\d+)(.*)$/.exec(cleanNumber(n) ?? "");
  if (!m) return 2_000_000_000;
  const [, pre, dig, suf] = m as unknown as [string, string, string, string];
  const rank = !suf ? 0 : /^[★†]+$/.test(suf) ? 1 : /^[a-z]$/.test(suf) ? 2 + suf.charCodeAt(0) - 97 : 30;
  return (pre ? 1_000_000_000 : 0) + Math.min(parseInt(dig, 10), 999_999) * 1000 + rank;
}
export const displayNumber = (c: { number: string | null; fnum: string | null }, f: Finish): string => (f === "F" && c.fnum ? c.fnum : c.number) ?? "—";
