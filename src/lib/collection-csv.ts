// THE BINDER IMPORT: a CSV from TCGplayer, Moxfield, Deckbox or ManaBox (or our own export) into binder rows.
//
// The paste import (/api/collection/import) reads a deck-style list ("4 Lightning Bolt (M11) 146"). A collector
// bringing in a real binder has a spreadsheet instead, with a finish per line. This is the path that keeps the finish.
//
// HOW A LINE NAMES A PRODUCT, strongest key first (a Card is ONE product, the TCGplayer productId; a Foil copy is the
// same product in its Foil finish, its own price):
//   1. a TCGplayer "Product ID" / "TCGplayer Id" column: exactly Card.id. TCGplayer's own collection export carries it,
//      and so does this site's export (`tcgplayer_id`);
//   2. otherwise the set (a code or a name) plus the COLLECTOR NUMBER, read the way the deck lists read them
//      ("029/281" is 29, "231★" is 231, "KHC-29" stays). A Foil Etched copy looks for the etched twin of that printing
//      and falls back to the Foil of the base card, with a warning;
//   3. a number with no set matches nothing: a collector number is shared by hundreds of sets, and an ambiguous line
//      is skipped with that reason, never guessed (CLAUDE.md, the matcher rule). The same for two ordinary products
//      that share a set and a number: add the Product ID.
//
// COLUMNS (headers are matched by name, in any order, comma, tab or semicolon separated). UNVERIFIED against a fresh
// export of each site; the header names below are the ones their documentation and sample files use:
//   TCGplayer  Quantity, Name, Set, Card Number, Set Code, Printing (Normal | Foil), Condition, Language, Product ID
//   Moxfield   Count, Name, Edition (a set code), Condition, Language, Foil (foil | etched | blank), Collector Number
//   Deckbox    Count, Name, Edition (a set name), Card Number, Condition, Language, Foil (foil | blank)
//   ManaBox    Name, Set code, Set name, Collector number, Foil (normal | foil | etched), Quantity, Condition, Language
// A file that names neither a product-id column nor a number column is not treated as a binder CSV at all
// (parseCollectionCsv returns null and the caller reads the text as a pasted list).
//
// FINISH. "Foil", "foil", "Etched", "Foil Etched", "Normal", "Nonfoil" and blank (= Normal). The product's own finishes
// win in the end: a card with only one finish is written in that finish (track.ts normalizeFoil).
//
// Pure: no database, no Next. The route hands matchCsvRows a CsvData (the published-data loaders);
// tests/collection-csv.test.ts drives both halves with a fixture of real products.
import { normaliseCondition } from "./collection-conditions";
import { PRICE_MASK, fold } from "./constants";
import { normalizeNumber, pickFromSetNumber } from "./deck";
import { normalizeFoil } from "./track";

/** One requested line: N copies of one product, at one condition, in one finish. */
export interface CsvCopy {
  /** The TCGplayer product id the line named, when it named one. */
  productId: number | null;
  /** The collector number, normalised ("029/281" is "29"); null when the line had only a product id. */
  number: string | null;
  /** The set column(s) as typed ("MH3", "Modern Horizons 3"): a code or a name, only used with a number. */
  sets: string[];
  qty: number;
  /** The file's finish: true = Foil or Etched, false = Normal; null = not stated (Normal, unless the product has only a Foil). */
  isFoil: boolean | null;
  /** The file said Etched / Foil Etched. */
  etched: boolean;
  /** NM, LP, MP, HP or DMG. */
  condition: string;
  /** 1-based line in the pasted text, for the skipped list. */
  line: number;
  /** The card name column, when the file has one (never used to match). */
  name: string | null;
}

export interface CsvSkip {
  line: number;
  reason: string;
  /** The line's text, trimmed to 80 characters. */
  text: string;
}

export interface ParsedCollectionCsv {
  rows: CsvCopy[];
  /** The first SKIP_STORE_CAP skipped lines, in file order. */
  skipped: CsvSkip[];
  /** Every skipped line, stored or not. */
  skippedCount: number;
  /** Rows whose condition was filled in but not understood: imported as Near Mint. */
  conditionDefaulted: number;
}

/** Most data lines one import reads; the rest are reported, never dropped silently. */
export const CSV_LINE_CAP = 2000;
/** Skipped lines kept with their reason; the rest are only counted. */
const SKIP_STORE_CAP = 500;
/** Most copies one line may ask for; the collection row holds 999 (QUANTITY_CAP). */
const QTY_CAP = 999;

// ── Delimited text ───────────────────────────────────────────────────────────

/** One delimited line into cells, honouring "quoted, cells" and "" escapes. */
export function splitCells(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"' && cur === "") quoted = true;
    else if (ch === delim) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function detectDelimiter(header: string): string {
  let best = ",";
  let most = 0;
  for (const d of [",", "\t", ";"]) {
    const n = header.split(d).length - 1;
    if (n > most) {
      best = d;
      most = n;
    }
  }
  return best;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9#]/g, "");

const ID_HEADERS = new Set(["productid", "tcgplayerid", "tcgplayerproductid", "tcgplayer_id", "tcgid", "tcgproductid"].map(norm));
const SET_HEADERS = ["setcode", "set", "edition", "expansion", "setname"];
const NUMBER_HEADERS = new Set(["number", "cardnumber", "collectornumber", "collectorno", "no", "num", "cardno", "#"]);
const QTY_HEADERS = new Set(["quantity", "qty", "count", "copies", "amount", "owned", "totalquantity", "addtoquantity"]);
const FOIL_HEADERS = new Set(["foil", "isfoil", "finish", "printing"]);
const COND_HEADERS = new Set(["condition", "cond", "grade"]);
const NAME_HEADERS = new Set(["name", "cardname", "card", "productname", "simplename"]);
const LANG_HEADERS = new Set(["language", "lang"]);

interface Columns {
  id: number;
  sets: number[];
  number: number;
  qty: number;
  foil: number;
  cond: number;
  name: number;
  lang: number;
}

function findColumns(cells: string[]): Columns | null {
  const idx = (want: Set<string>) => cells.findIndex((c) => want.has(norm(c)));
  // every set-like column, the code column first: Moxfield's "Edition" is a code, Deckbox's a name, ManaBox has both
  const sets = SET_HEADERS.map((h) => cells.findIndex((c) => norm(c) === h)).filter((i, k, a) => i >= 0 && a.indexOf(i) === k);
  const cols: Columns = {
    id: idx(ID_HEADERS),
    sets,
    number: idx(NUMBER_HEADERS),
    qty: idx(QTY_HEADERS),
    foil: idx(FOIL_HEADERS),
    cond: idx(COND_HEADERS),
    name: idx(NAME_HEADERS),
    lang: idx(LANG_HEADERS),
  };
  return cols.id >= 0 || cols.number >= 0 ? cols : null;
}

/** A finish cell: { foil, etched } for a word we know, null for blank (Normal), undefined for one we do not understand. */
export function parseFinishCell(raw: string): { foil: boolean; etched: boolean } | null | undefined {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  if (/^(normal|nonfoil|non-foil|non foil|regular|none|no|n|false|0)$/.test(t)) return { foil: false, etched: false };
  if (/etched/.test(t)) return { foil: true, etched: true };
  if (/foil|^(yes|y|true|1|x)$/.test(t)) return { foil: true, etched: false };
  return undefined;
}

const ENGLISH = /^(|en|eng|english)$/;

const clip = (s: string) => (s.length > 80 ? `${s.slice(0, 79)}…` : s);

/**
 * Read a pasted or uploaded CSV. Null when the first non-empty line is not a
 * header naming a product-id column or a number column (so the caller falls
 * back to the pasted-list import). Otherwise every data line is either a
 * CsvCopy or a CsvSkip with its reason; nothing is dropped without being listed.
 */
export function parseCollectionCsv(text: string): ParsedCollectionCsv | null {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim() !== "");
  if (first < 0) return null;
  const delim = detectDelimiter(lines[first]);
  const header = splitCells(lines[first], delim);
  if (header.length < 2) return null; // a single-column line is a pasted list, not a CSV
  const cols = findColumns(header);
  if (!cols) return null;

  const rows: CsvCopy[] = [];
  const skipped: CsvSkip[] = [];
  let skippedCount = 0;
  const skip = (s: CsvSkip) => {
    skippedCount++;
    if (skipped.length < SKIP_STORE_CAP) skipped.push(s);
  };
  let conditionDefaulted = 0;
  let read = 0;
  const merged = new Map<string, CsvCopy>();

  for (let i = first + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === "") continue;
    const line = i + 1;
    if (++read > CSV_LINE_CAP) {
      skip({ line, reason: `over the ${CSV_LINE_CAP}-line limit for one import; paste the rest as a second file`, text: clip(raw.trim()) });
      continue;
    }
    const cells = splitCells(raw, delim);
    const cell = (c: number) => (c >= 0 ? (cells[c] ?? "") : "");
    const idRaw = cell(cols.id).trim();
    const numRaw = cell(cols.number).trim();
    const name = cell(cols.name) || null;

    // Our own export ends with "TOTAL,,,,…": not a card.
    if (!idRaw && !numRaw && (name ?? cells[0] ?? "").toUpperCase() === "TOTAL") continue;

    let productId: number | null = null;
    if (idRaw) {
      if (!/^\d{1,10}$/.test(idRaw)) {
        skip({ line, reason: `TCGplayer id "${idRaw}" is not a number`, text: clip(raw.trim()) });
        continue;
      }
      productId = Number(idRaw);
    }
    let number: string | null = null;
    if (numRaw) {
      number = normalizeNumber(numRaw);
      if (!number && productId == null) {
        skip({ line, reason: `collector number "${numRaw}" not understood (like 146, 231★ or KHC-29)`, text: clip(raw.trim()) });
        continue;
      }
    }
    if (productId == null && !number) {
      skip({ line, reason: "no collector number or TCGplayer id", text: clip(raw.trim()) });
      continue;
    }

    // Every listed product is English: a line in another language is a different card.
    const lang = cell(cols.lang).trim().toLowerCase();
    if (!ENGLISH.test(lang)) {
      skip({ line, reason: `language "${cell(cols.lang)}": only English printings are listed`, text: clip(raw.trim()) });
      continue;
    }

    let qty = 1;
    const qRaw = cell(cols.qty);
    if (qRaw !== "") {
      const q = Number(qRaw);
      if (!Number.isInteger(q) || q < 0) {
        skip({ line, reason: `quantity "${qRaw}" is not a whole number of 1 or more`, text: clip(raw.trim()) });
        continue;
      }
      if (q === 0) continue; // TCGplayer exports list every product, held or not
      qty = Math.min(QTY_CAP, q);
    }

    let isFoil: boolean | null = null;
    let etched = false;
    if (cols.foil >= 0) {
      const f = parseFinishCell(cell(cols.foil));
      if (f === undefined) {
        skip({ line, reason: `finish "${cell(cols.foil)}" not understood (use Foil, Etched or Normal)`, text: clip(raw.trim()) });
        continue;
      }
      if (f) {
        isFoil = f.foil;
        etched = f.etched;
      }
    }

    const cRaw = cell(cols.cond);
    const cond = normaliseCondition(cRaw);
    // A blank cell is Near Mint by convention; only a grade we cannot read is reported.
    if (!cond && cRaw.trim() !== "") conditionDefaulted++;

    const sets = [...new Set(cols.sets.map((c) => cell(c).trim()).filter(Boolean))];
    // The same product, finish and condition on two lines is one entry.
    const mk = `${productId ?? ""}|${number ?? ""}|${sets.join("/").toLowerCase()}|${isFoil ?? ""}|${etched ? 1 : 0}|${cond ?? "NM"}`;
    const prev = merged.get(mk);
    if (prev) {
      prev.qty = Math.min(QTY_CAP, prev.qty + qty);
      continue;
    }
    const copy: CsvCopy = { productId, number, sets, qty, isFoil, etched, condition: cond ?? "NM", line, name };
    merged.set(mk, copy);
    rows.push(copy);
  }
  return { rows, skipped, skippedCount, conditionDefaulted };
}

// ── Matching lines to products ───────────────────────────────────────────────

/** The catalogue fields a match reads (data CardLite satisfies it). */
export interface CsvCard {
  id: number;
  name: string;
  number: string | null;
  /** Scryfall set code, upper case (CardLite.setCode). */
  setCode: string;
  flags: number;
  treat: readonly string[];
  /** Both finishes' TCGplayer quotes; null when the finish has no row (a TCGplayer row exists, its values may be null). */
  n: { market: number | null; low: number | null } | null;
  f: { market: number | null; low: number | null } | null;
}

/** What the matcher reads from the published data (the route passes the loaders; a test passes a fixture). */
export interface CsvData {
  /** Products by TCGplayer id. */
  byIds(ids: readonly number[]): Promise<Map<number, CsvCard>>;
  /** "<code>|<nkey>" -> one to three products (resolveBySetNumber); `set` is a Scryfall set code. */
  bySetNumber(pairs: readonly { set: string; number: string }[]): Promise<Map<string, CsvCard[]>>;
  /** Folded set names ("modern horizons 3") to a set token, for a file that writes the name. Unknown names are absent. */
  setCodes(foldedNames: readonly string[]): Promise<Map<string, string>>;
}

export interface CsvMatch {
  card: CsvCard;
  copy: CsvCopy;
  /** The finish the copy is written in, after normalizeFoil: the only finish a product has is forced. */
  isFoil: boolean;
  /** Said when the file's finish could not be kept (Etched asked, no etched twin; Foil asked, no Foil row). */
  warning: string | null;
}

export interface MatchedCsv {
  matched: CsvMatch[];
  /** Lines that name no product we list, or more than one. */
  unmatched: CsvSkip[];
}

const maskOf = (c: Pick<CsvCard, "n" | "f">): number => (c.n ? PRICE_MASK.HASN : 0) | (c.f ? PRICE_MASK.HASF : 0);

/** The finish a copy is stored in, and the warning when it differs from what the file asked. Exported for the paste import and the tests. */
export function finishFor(card: Pick<CsvCard, "n" | "f" | "flags">, want: { isFoil: boolean | null; etched: boolean }): { isFoil: boolean; warning: string | null } {
  const asked = want.isFoil === true;
  const isFoil = normalizeFoil({ mask: maskOf(card) }, asked);
  const warning = asked && !isFoil ? "has no Foil version; added as non-foil" : null;
  return { isFoil, warning };
}

const pairKey = (code: string, nk: string) => `${code.trim().toLowerCase()}|${nk}`;

/** Pair each line with the ONE product it names, or report why it can't. */
export async function matchCsvRows(rows: readonly CsvCopy[], data: CsvData): Promise<MatchedCsv> {
  const ids = [...new Set(rows.map((r) => r.productId).filter((x): x is number => x != null))];
  const byId = ids.length ? await data.byIds(ids) : new Map<number, CsvCard>();
  const needNumber = rows.filter((r) => r.number && !(r.productId != null && byId.has(r.productId)));

  // Round 1: every set string as typed is tried as a Scryfall code. Round 2: the ones that found nothing are tried as a set name.
  const round1 = new Map<string, CsvCard[]>();
  const pairs1 = needNumber.flatMap((r) => r.sets.map((s) => ({ set: s.replace(/\s+/g, "").toLowerCase(), number: r.number! })));
  if (pairs1.length) for (const [k, v] of await data.bySetNumber(pairs1)) round1.set(k, v);
  const names = [...new Set(needNumber.filter((r) => !r.sets.some((s) => round1.has(pairKey(s.replace(/\s+/g, ""), r.number!)))).flatMap((r) => r.sets.map(fold)).filter(Boolean))];
  const codeOfName = names.length ? await data.setCodes(names) : new Map<string, string>();
  const pairs2 = needNumber.flatMap((r) => r.sets.map((s) => codeOfName.get(fold(s))).filter((c): c is string => !!c).map((set) => ({ set, number: r.number! })));
  const round2 = pairs2.length ? await data.bySetNumber(pairs2) : new Map<string, CsvCard[]>();

  const matched: CsvMatch[] = [];
  const unmatched: CsvSkip[] = [];
  for (const copy of rows) {
    const label = `${copy.name ?? ""} ${copy.sets[0] ? `(${copy.sets[0].toUpperCase()}) ` : ""}${copy.number ?? `#${copy.productId}`}`.trim();
    const fail = (reason: string) => unmatched.push({ line: copy.line, reason, text: label });
    if (copy.productId != null) {
      const card = byId.get(copy.productId);
      if (card) {
        const f = finishFor(card, copy);
        matched.push({ card, copy, isFoil: f.isFoil, warning: f.warning });
        continue;
      }
      if (!copy.number) {
        fail(`TCGplayer id ${copy.productId} is not a Magic card we list`);
        continue;
      }
      // An id we don't know but a number we might: fall through to the set and number.
    }
    if (!copy.sets.length) {
      fail(`${copy.number} needs a set: a collector number alone names a card in hundreds of sets (add a set column or a TCGplayer Product ID)`);
      continue;
    }
    const nk = copy.number!;
    let candidates: CsvCard[] = [];
    for (const s of copy.sets) {
      candidates = round1.get(pairKey(s.replace(/\s+/g, ""), nk)) ?? [];
      if (!candidates.length) {
        const code = codeOfName.get(fold(s));
        candidates = code ? (round2.get(pairKey(code, nk)) ?? []) : [];
      }
      if (candidates.length) break;
    }
    const pick = pickFromSetNumber(candidates, copy.etched);
    if (!pick) {
      fail(`${copy.sets[0]} ${nk} is not a card we list`);
      continue;
    }
    if (pick.ambiguous) {
      fail(`${copy.sets[0]} ${nk} is shared by ${candidates.length} products (stamped or promo versions); add the TCGplayer Product ID`);
      continue;
    }
    const f = finishFor(pick.card, copy);
    const etchedNote = pick.etchedMissed ? "no Foil Etched version of this printing; the Foil of the base card was used" : null;
    matched.push({ card: pick.card, copy, isFoil: f.isFoil, warning: etchedNote ?? f.warning });
  }
  return { matched, unmatched };
}


// ── The export (/api/portfolio/export) ───────────────────────────────────────

/**
 * One cell, quoted when it holds a delimiter, a quote or a line break. A text
 * cell that starts with = + - @ (or a tab or CR) would run as a formula when
 * the file is opened in Excel or Sheets, so it gets a leading apostrophe, which
 * both apps show as plain text. Numbers, and strings that are only a number
 * (a price), are never formulas and stay as they are. The importer reads no
 * text column back, so there is nothing to strip.
 */
export function csvCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^[-+]?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface ExportRow {
  name: string;
  setCode: string;
  number: string | null;
  /** "Foil" or "Etched" for a Foil copy, "" for Normal: the words every importer reads. */
  finish: "Foil" | "Etched" | "";
  condition: string;
  quantity: number;
  unitCents: number | null;
  costBasisCents: number | null; // per copy (averaged from a total)
  note: string | null;
  tcgplayerId: number;
}

/** "mtgcompare-binder-2026-10-08.csv" */
export const exportFilename = (now: Date = new Date()) => `mtgcompare-binder-${now.toISOString().slice(0, 10)}.csv`;

/**
 * The binder as CSV, in the visitor's currency: one row per entry, then a
 * TOTAL row. Its header is one parseCollectionCsv recognises (tcgplayer_id), so
 * the file imports straight back into the same products and finishes.
 */
export function collectionCsv(rows: readonly ExportRow[], currency: string): string {
  const cur = currency.toLowerCase();
  const head = ["name", "set", "number", "condition", "finish", "quantity", `unit_${cur}`, `value_${cur}`, `paid_each_${cur}`, "note", "tcgplayer_id"];
  const money = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2));
  let total = 0;
  const lines = rows.map((r) => {
    const value = r.unitCents != null ? r.unitCents * r.quantity : null;
    total += value ?? 0;
    return [
      csvCell(r.name), csvCell(r.setCode), csvCell(r.number), csvCell(r.condition), r.finish,
      r.quantity, money(r.unitCents), money(value), money(r.costBasisCents), csvCell(r.note), r.tcgplayerId,
    ].join(",");
  });
  const totalRow = ["TOTAL", "", "", "", "", "", "", money(total), "", "", ""].join(",");
  return [head.join(","), ...lines, totalRow].join("\n") + "\n";
}
