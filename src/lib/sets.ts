// English Magic: The Gathering releases whose SEALED product MTG Compare groups by set. Newest first.
//
// Codes are Scryfall's (lowercase); names and release dates are TCGplayer's group list as TCGCSV publishes it (the
// `publishedOn` of each group, read 2026-10-19 into the old MTG Compare's tests/fixtures/tcgcsv-groups.json), which matches
// Wizards' street dates. A release's Commander decks are filed under the main set (Commander: Bloomburrow → blb); a
// release's sub-sets (Commander: X, X: Eternal-Legal, Mystical Archive, Stellar Sights, …) never have sealed product of their
// own and are left out.
//
// ADDING A SET: add an entry at the top. `slug` is the URL (/au/sets/<slug>) and must never change once live. If stores title
// the set some other way, add an `aliases` regex source. `boosters` says which booster lines the set was sold in, which is how a
// bare "Booster Box" is read (see boosterKind() in sealed-title.ts): leave a line out and a title naming it is refused.

/** The booster lines a set was sold in. "play" replaced "draft" + "set" from Murders at Karlov Manor (February 2024). */
export type BoosterLine = "play" | "draft" | "set" | "collector" | "jumpstart";

export interface MtgSet {
  code: string;
  name: string;
  slug: string;
  series: string;
  releaseDate: string; // YYYY-MM-DD
  logo: string | null;
  /** Kept for the shape the pages read; no Magic set name is also a series name. */
  generic?: boolean;
  aliases?: string[]; // extra regex sources (case-insensitive, matched on the accent-folded title)
  /** Booster lines sold for the set (draft/set/play/collector/jumpstart). Undefined: none (Commander-only releases). */
  boosters?: BoosterLine[];
  /** Pokémon-era field (a set sold without a 36-pack box). Never set for Magic; kept so older readers compile. */
  noBoosterBox?: boolean;
  /** Overrides the set's name pattern (for names that are a prefix of another set's, like "Jumpstart"). */
  pattern?: string;
}

const PLAY: BoosterLine[] = ["play", "collector"];
const DSC: BoosterLine[] = ["draft", "set", "collector"];

type Row = [code: string, name: string, date: string, series: string, boosters?: BoosterLine[]];

// Set Boosters began with Zendikar Rising (September 2020): Throne of Eldraine to Core Set 2021 sold Draft and Collector Boosters.
// Series: "Standard" (premier sets), "Universes Beyond", "Masters & Horizons", "Commander", "Supplemental".
const ROWS: Row[] = [
  // Announced: Wizards' Star Trek product page (read 2026-10-14) gives 13 November 2026.
  ["trk", "Star Trek", "2026-11-13", "Universes Beyond", PLAY],
  ["fra", "Reality Fracture", "2026-10-02", "Standard", PLAY],
  ["hob", "The Hobbit", "2026-08-14", "Universes Beyond", PLAY],
  ["msh", "Marvel Super Heroes", "2026-06-26", "Universes Beyond", [...PLAY, "jumpstart"]],
  ["sos", "Secrets of Strixhaven", "2026-04-24", "Standard", PLAY],
  ["tmt", "Teenage Mutant Ninja Turtles", "2026-03-06", "Universes Beyond", PLAY],
  ["ecl", "Lorwyn Eclipsed", "2026-01-23", "Standard", PLAY],
  ["tla", "Avatar: The Last Airbender", "2025-11-21", "Universes Beyond", PLAY],
  ["spm", "Marvel's Spider-Man", "2025-09-26", "Universes Beyond", PLAY],
  ["eoe", "Edge of Eternities", "2025-08-01", "Standard", PLAY],
  ["fin", "Final Fantasy", "2025-06-13", "Universes Beyond", PLAY],
  ["tdm", "Tarkir: Dragonstorm", "2025-04-11", "Standard", PLAY],
  ["dft", "Aetherdrift", "2025-02-14", "Standard", PLAY],
  ["inr", "Innistrad Remastered", "2025-01-24", "Masters & Horizons", PLAY],
  ["j25", "Foundations Jumpstart", "2024-11-15", "Supplemental", ["jumpstart"]],
  ["fdn", "Foundations", "2024-11-15", "Standard", PLAY],
  ["dsk", "Duskmourn: House of Horror", "2024-09-27", "Standard", PLAY],
  ["blb", "Bloomburrow", "2024-08-02", "Standard", PLAY],
  // Assassin's Creed sold "Beyond Boosters" (no play or draft line) and Collector Boosters.
  ["acr", "Assassin's Creed", "2024-07-05", "Universes Beyond", ["collector"]],
  ["mh3", "Modern Horizons 3", "2024-06-14", "Masters & Horizons", PLAY],
  ["otj", "Outlaws of Thunder Junction", "2024-04-19", "Standard", PLAY],
  ["pip", "Fallout", "2024-03-08", "Universes Beyond", ["collector"]],
  ["mkm", "Murders at Karlov Manor", "2024-02-09", "Standard", PLAY],
  ["rvr", "Ravnica Remastered", "2024-01-12", "Masters & Horizons", ["draft", "collector"]],
  ["lci", "The Lost Caverns of Ixalan", "2023-11-17", "Standard", DSC],
  ["who", "Doctor Who", "2023-10-13", "Universes Beyond", ["collector"]],
  ["woe", "Wilds of Eldraine", "2023-09-08", "Standard", DSC],
  ["cmm", "Commander Masters", "2023-08-04", "Commander", DSC],
  ["ltr", "The Lord of the Rings: Tales of Middle-earth", "2023-06-23", "Universes Beyond", [...DSC, "jumpstart"]],
  ["mat", "March of the Machine: The Aftermath", "2023-05-12", "Standard", ["set", "collector"]],
  ["mom", "March of the Machine", "2023-04-21", "Standard", DSC],
  ["one", "Phyrexia: All Will Be One", "2023-02-03", "Standard", DSC],
  ["dmr", "Dominaria Remastered", "2023-01-13", "Masters & Horizons", DSC],
  ["j22", "Jumpstart 2022", "2022-12-02", "Supplemental", ["jumpstart"]],
  ["bro", "The Brothers' War", "2022-11-18", "Standard", DSC],
  ["40k", "Warhammer 40,000", "2022-10-07", "Universes Beyond", ["collector"]],
  ["unf", "Unfinity", "2022-10-07", "Supplemental", DSC],
  ["dmu", "Dominaria United", "2022-09-09", "Standard", DSC],
  ["2x2", "Double Masters 2022", "2022-07-08", "Masters & Horizons", ["draft", "collector"]],
  ["clb", "Commander Legends: Battle for Baldur's Gate", "2022-06-10", "Commander", DSC],
  ["snc", "Streets of New Capenna", "2022-04-29", "Standard", DSC],
  ["neo", "Kamigawa: Neon Dynasty", "2022-02-18", "Standard", DSC],
  ["dbl", "Innistrad: Double Feature", "2022-01-28", "Supplemental", ["draft"]],
  ["vow", "Innistrad: Crimson Vow", "2021-11-19", "Standard", DSC],
  ["mid", "Innistrad: Midnight Hunt", "2021-09-24", "Standard", DSC],
  ["afr", "Adventures in the Forgotten Realms", "2021-07-23", "Standard", DSC],
  ["mh2", "Modern Horizons 2", "2021-06-18", "Masters & Horizons", DSC],
  ["stx", "Strixhaven: School of Mages", "2021-04-23", "Standard", DSC],
  ["tsr", "Time Spiral Remastered", "2021-03-19", "Masters & Horizons", ["draft", "collector"]],
  ["khm", "Kaldheim", "2021-02-05", "Standard", DSC],
  ["cmr", "Commander Legends", "2020-11-20", "Commander", ["draft", "collector"]],
  ["znr", "Zendikar Rising", "2020-09-25", "Standard", DSC],
  ["2xm", "Double Masters", "2020-08-07", "Masters & Horizons", ["draft", "collector"]],
  ["jmp", "Jumpstart", "2020-07-17", "Supplemental", ["jumpstart"]],
  ["m21", "Core Set 2021", "2020-07-03", "Standard", ["draft", "collector"]],
  ["iko", "Ikoria: Lair of Behemoths", "2020-04-24", "Standard", ["draft", "collector"]],
  ["thb", "Theros Beyond Death", "2020-01-24", "Standard", ["draft", "collector"]],
  ["eld", "Throne of Eldraine", "2019-10-04", "Standard", ["draft", "collector"]],
  ["c19", "Commander 2019", "2019-08-23", "Commander"],
  ["m20", "Core Set 2020", "2019-07-12", "Standard", ["draft"]],
  ["mh1", "Modern Horizons", "2019-06-14", "Masters & Horizons", ["draft"]],
  ["war", "War of the Spark", "2019-05-03", "Standard", ["draft"]],
  ["rna", "Ravnica Allegiance", "2019-01-25", "Standard", ["draft"]],
  ["uma", "Ultimate Masters", "2018-12-07", "Masters & Horizons", ["draft"]],
  ["grn", "Guilds of Ravnica", "2018-10-05", "Standard", ["draft"]],
  ["c18", "Commander 2018", "2018-08-10", "Commander"],
  ["m19", "Core Set 2019", "2018-07-13", "Standard", ["draft"]],
  ["bbd", "Battlebond", "2018-06-08", "Supplemental", ["draft"]],
  ["dom", "Dominaria", "2018-04-27", "Standard", ["draft"]],
  ["a25", "Masters 25", "2018-03-16", "Masters & Horizons", ["draft"]],
  ["rix", "Rivals of Ixalan", "2018-01-19", "Standard", ["draft"]],
];

function slugOf(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const SETS: MtgSet[] = ROWS.map(([code, name, releaseDate, series, boosters]) => ({ code, name, slug: slugOf(name), series, releaseDate, logo: null, ...(boosters ? { boosters } : {}) }));

// Title spellings the plain set name doesn't cover (stores drop the subtitle, the "The", the "Universes Beyond:" or use the code).
const ALIASES: Record<string, string[]> = {
  trk: ["\\bstar\\s*trek\\b"],
  hob: ["\\bhobbit\\b"],
  msh: ["\\bmarvel\\s*super\\s*heroes\\b"],
  tmt: ["\\btmnt\\b", "\\bninja\\s*turtles\\b"],
  tla: ["\\blast\\s*airbender\\b"],
  spm: ["(?<!\\bsuper\\s*heroes\\b.*)\\bspider\\s*-?\\s*man\\b(?!.*\\bsuper\\s*heroes\\b)"],
  tdm: ["\\bdragonstorm\\b"],
  fin: ["\\bfinal\\s*fantasy\\b"],
  dsk: ["\\bduskmourn\\b"],
  acr: ["\\bassassin'?s?\\s*creed\\b"],
  otj: ["\\bthunder\\s*junction\\b"],
  pip: ["\\bfallout\\b"],
  mkm: ["\\bkarlov\\s*manor\\b"],
  lci: ["\\blost\\s*caverns\\b"],
  who: ["\\bdoctor\\s*who\\b"],
  // "Lord of the Rings Tales of MiddleEarth", "LOTR". The Hobbit is its own set (hob), named first by length.
  ltr: ["(?<!\\bhobbit\\b.*)\\blord\\s*of\\s*the\\s*rings\\b(?!.*\\bhobbit\\b)", "\\btales\\s*of\\s*middle\\s*-?\\s*earth\\b", "\\blotr\\b"],
  mat: ["\\bmachine\\s*:?\\s*(?:-\\s*)?the\\s*aftermath\\b"],
  one: ["\\ball\\s*will\\s*be\\s*one\\b"],
  bro: ["\\bbrothers'?\\s*war\\b"],
  "40k": ["\\bwarhammer\\b"],
  "2x2": ["\\b2x2\\b"],
  clb: ["\\bbaldur'?s\\s*gate\\b"],
  snc: ["\\bnew\\s*capenna\\b"],
  neo: ["\\bneon\\s*dynasty\\b"],
  dbl: ["\\bdouble\\s*feature\\b"],
  vow: ["\\bcrimson\\s*vow\\b"],
  mid: ["\\bmidnight\\s*hunt\\b"],
  afr: ["\\bforgotten\\s*realms\\b"],
  // "Commander 2021 (Strixhaven)" decks are Strixhaven's; "Secrets of Strixhaven" is longer and is tried first.
  stx: ["(?<!\\bsecrets\\s*of\\s*)\\bstrixhaven\\b", "\\bcommander\\s*2021\\b"],
  tsr: ["\\btime\\s*spiral\\s*:?\\s*remastered\\b"],
  "2xm": ["\\b2xm\\b"],
  m21: ["\\bm21\\b", "\\bcore\\s*(?:set\\s*)?2021\\b"],
  // "Commander 2020" decks were Ikoria's.
  iko: ["\\bikoria\\b", "\\bcommander\\s*2020\\b"],
  m20: ["\\bm20\\b", "\\bcore\\s*(?:set\\s*)?2020\\b"],
  mh1: ["\\bmh1\\b"],
  m19: ["\\bm19\\b", "\\bcore\\s*(?:set\\s*)?2019\\b"],
  a25: ["\\ba25\\b"],
  uma: ["\\buma\\b"],
};
// Names that are a prefix of another set's name match only on their own.
const PATTERNS: Record<string, string> = {
  // Not "Jumpstart 2022", not "Foundations Jumpstart", not another set's Jumpstart boosters (those name their set first, and the
  // longer set name wins anyway).
  jmp: "\\bjump\\s*start\\b(?!\\s*(?:2022|2025|22|25)\\b)",
  // "Modern Horizons" alone: not 2 or 3.
  mh1: "\\bmodern\\s*horizons\\b(?!\\s*(?:2|3|ii|iii)\\b)",
  // "Dominaria" alone: not United or Remastered.
  dom: "\\bdominaria\\b(?!\\s*:?\\s*(?:united|remastered)\\b)",
  // "Double Masters" alone: not 2022.
  "2xm": "\\bdouble\\s*masters\\b(?!\\s*2022\\b)",
  // "Foundations" alone: not Foundations Jumpstart.
  fdn: "\\bfoundations\\b(?!\\s*:?\\s*-?\\s*jump\\s*start\\b)",
  // "Commander Legends" alone: not Battle for Baldur's Gate.
  cmr: "\\bcommander\\s*legends\\b(?!\\s*:?\\s*-?\\s*battle\\b)",
  // "March of the Machine" alone: not The Aftermath.
  mom: "\\bmarch\\s*of\\s*the\\s*machine\\b(?!\\s*:?\\s*-?\\s*(?:the\\s*)?aftermath\\b)",
};
for (const s of SETS) {
  if (ALIASES[s.code]) s.aliases = ALIASES[s.code];
  if (PATTERNS[s.code]) s.pattern = PATTERNS[s.code];
}

export const SET_BY_CODE = new Map(SETS.map((s) => [s.code, s]));
export const SET_BY_SLUG = new Map(SETS.map((s) => [s.slug, s]));

export const SERIES_ORDER = ["Standard", "Universes Beyond", "Masters & Horizons", "Commander", "Supplemental"];
