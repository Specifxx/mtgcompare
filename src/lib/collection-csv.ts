// THE PRINTING-AWARE BINDER IMPORT — RiftCompare's lib/collection-csv.ts,
// ported for One Piece in wave 2 (2026-10-03).
//
// The paste import (/api/collection/import) matches a card by number or name
// and takes the base printing at Near Mint, so a collector could not bring in a
// real binder: a Parallel, a Manga or an SP all landed as the base card. This is
// the path that keeps the printing.
//
// HOW A LINE NAMES A PRINTING, strongest key first (a Card is ONE printing, the
// TCGplayer productId):
//   1. a TCGplayer "Product ID" / "TCGplayer Id" column — exactly Card.id. This
//      is what TCGplayer's own collection export carries, and what OP Compare's
//      export writes in `tcgplayer_id`;
//   2. otherwise the card NUMBER ("OP01-120") plus a PRINTING column
//      ("standard", "Parallel", "Manga", "SP", "Reprint"…);
//   3. a bare number matches only when exactly ONE printing carries it. Shanks
//      OP01-120 has a standard print, a Parallel and a Manga: a line that says
//      only "OP01-120" is skipped with that reason, never guessed (the matcher
//      rule, CLAUDE.md: an ambiguous listing is skipped, not guessed).
//
// FORMATS. OP Compare's own export (`name,set,number,printing,condition,foil,
// quantity,…,tcgplayer_id`, its TOTAL row ignored) round-trips through it, and
// so does any CSV, TSV or semicolon file whose header names a product-id column
// or a number column. A file that names neither is not treated as a printing
// CSV at all (parseCollectionCsv returns null and the caller reads the text as
// a pasted list).
//
// Pure: no database, no Next. The route hands it the cached catalogue;
// tests/collection-csv.test.ts drives both halves without a database.
import { normaliseCondition } from "./collection-conditions";
import { normalizeNumber } from "./deck";

/** One requested line: N copies of one printing, at one condition. */
export interface CsvCopy {
  /** The TCGplayer product id the line named, when it named one. */
  productId: number | null;
  /** "OP01-120", normalised; null when the line had only a product id. */
  number: string | null;
  /** The set column as typed ("OP01", "Romance Dawn"), only to narrow a number match. */
  set: string | null;
  /** A PRINTINGS key ("standard", "alt", "manga"…), or null when the file did not say. */
  printing: string | null;
  qty: number;
  /** The file's foil flag; null = not stated (the card's own finish decides). */
  isFoil: boolean | null;
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
const SET_HEADERS = new Set(["set", "setcode", "setname", "edition", "expansion"]);
const NUMBER_HEADERS = new Set(["number", "cardnumber", "collectornumber", "collectorno", "no", "num", "cardno", "#"]);
const PRINTING_HEADERS = new Set(["printing", "variant", "version", "art", "artvariant"]);
const QTY_HEADERS = new Set(["quantity", "qty", "count", "copies", "amount", "owned", "totalquantity", "addtoquantity"]);
const FOIL_HEADERS = new Set(["foil", "isfoil", "finish"]);
const COND_HEADERS = new Set(["condition", "cond", "grade"]);
const NAME_HEADERS = new Set(["name", "cardname", "card", "productname", "simplename"]);

interface Columns {
  id: number;
  set: number;
  number: number;
  printing: number;
  qty: number;
  foil: number;
  cond: number;
  name: number;
}

function findColumns(cells: string[]): Columns | null {
  const idx = (want: Set<string>) => cells.findIndex((c) => want.has(norm(c)));
  const cols: Columns = {
    id: idx(ID_HEADERS),
    set: idx(SET_HEADERS),
    number: idx(NUMBER_HEADERS),
    printing: idx(PRINTING_HEADERS),
    qty: idx(QTY_HEADERS),
    foil: idx(FOIL_HEADERS),
    cond: idx(COND_HEADERS),
    name: idx(NAME_HEADERS),
  };
  return cols.id >= 0 || cols.number >= 0 ? cols : null;
}

const TRUTHY = new Set(["foil", "foiled", "yes", "y", "true", "1", "x"]);
const FALSY = new Set(["", "no", "n", "false", "0", "normal", "regular", "nonfoil", "non-foil", "non foil", "none"]);

// Printing words, as people and exports write them, to a PRINTINGS key. A
// TCGplayer export's "Printing" column holds the FINISH ("Normal"/"Foil"), not
// the art: those read as "not stated" (null), so the product id or the
// one-printing rule decides.
const PRINTING_WORDS: [RegExp, string][] = [
  [/^(standard|base|regular|original)$/, "standard"],
  [/^(alt|alternate|alternate art|alt art|parallel|parallel art|aa)( \(.*\))?$/, "alt"],
  [/^manga( art)?$|manga/, "manga"],
  [/^(sp|special|special card|sp card)$/, "sp"],
  [/^(tr|treasure|treasure rare)$/, "treasure"],
  [/^reprint$/, "reprint"],
  [/^promo$/, "promo"],
  [/^(special foil|foil art)$/, "foil"],
  [/^don!*$/, "don"],
];

/** A printing cell to a PRINTINGS key; null = not stated; undefined = not understood. */
export function parsePrinting(raw: string): string | null | undefined {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t || t === "normal" || t === "foil" || t === "holofoil" || t === "non-foil") return null;
  for (const [re, key] of PRINTING_WORDS) if (re.test(t)) return key;
  return undefined;
}

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

    // OP Compare's own export ends with "TOTAL,,,,…": not a card.
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
        skip({ line, reason: `card number "${numRaw}" not understood (like OP01-120)`, text: clip(raw.trim()) });
        continue;
      }
    }
    if (productId == null && !number) {
      skip({ line, reason: "no card number or TCGplayer id", text: clip(raw.trim()) });
      continue;
    }

    // Read even beside a product id (the fallback when the id is unknown), but
    // only a line WITHOUT one is refused for a printing it can't read.
    let printing: string | null = null;
    if (cols.printing >= 0) {
      const p = parsePrinting(cell(cols.printing));
      if (p === undefined && productId == null) {
        skip({ line, reason: `printing "${cell(cols.printing)}" not understood (use standard, Parallel, Manga, SP…)`, text: clip(raw.trim()) });
        continue;
      }
      printing = p ?? null;
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

    const fRaw = cell(cols.foil).trim().toLowerCase();
    let isFoil: boolean | null = null;
    if (cols.foil >= 0 && fRaw !== "") {
      if (TRUTHY.has(fRaw)) isFoil = true;
      else if (FALSY.has(fRaw)) isFoil = false;
      else {
        skip({ line, reason: `foil "${cell(cols.foil)}" not understood (use foil or normal)`, text: clip(raw.trim()) });
        continue;
      }
    }

    const cRaw = cell(cols.cond);
    const cond = normaliseCondition(cRaw);
    // A blank cell is Near Mint by convention; only a grade we cannot read is reported.
    if (!cond && cRaw.trim() !== "") conditionDefaulted++;

    // The same printing and condition on two lines is one entry.
    const mk = `${productId ?? ""}|${number ?? ""}|${printing ?? ""}|${(cell(cols.set) || "").toLowerCase()}|${isFoil ?? ""}|${cond ?? "NM"}`;
    const prev = merged.get(mk);
    if (prev) {
      prev.qty = Math.min(QTY_CAP, prev.qty + qty);
      continue;
    }
    const copy: CsvCopy = { productId, number, set: cell(cols.set) || null, printing, qty, isFoil, condition: cond ?? "NM", line, name };
    merged.set(mk, copy);
    rows.push(copy);
  }
  return { rows, skipped, skippedCount, conditionDefaulted };
}

// ── Matching lines to Card rows ──────────────────────────────────────────────

/** The catalogue fields a match reads (data.ts CardLite + its set satisfies it). */
export interface CatalogueCard {
  id: number;
  number: string | null;
  printing: string;
  setCode: string;
  setName: string;
}

export interface CsvMatch {
  card: CatalogueCard;
  copy: CsvCopy;
}

export interface MatchedCsv {
  matched: CsvMatch[];
  /** Lines that name no printing we track, or more than one. */
  unmatched: CsvSkip[];
}

const PRINTING_LABEL: Record<string, string> = {
  standard: "Standard", alt: "Parallel", manga: "Manga", sp: "SP", treasure: "Treasure Rare", foil: "Special foil", reprint: "Reprint", promo: "Promo", don: "DON!!",
};

const setKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Pair each line with the ONE printing it names, or report why it can't. */
export function matchCsvRows(rows: readonly CsvCopy[], catalogue: readonly CatalogueCard[]): MatchedCsv {
  const byId = new Map<number, CatalogueCard>();
  const byNumber = new Map<string, CatalogueCard[]>();
  for (const c of catalogue) {
    byId.set(c.id, c);
    if (c.number) (byNumber.get(c.number) ?? byNumber.set(c.number, []).get(c.number)!).push(c);
  }
  const matched: CsvMatch[] = [];
  const unmatched: CsvSkip[] = [];
  for (const copy of rows) {
    const label = `${copy.number ?? `#${copy.productId}`}${copy.name ? ` ${copy.name}` : ""}`;
    if (copy.productId != null) {
      const card = byId.get(copy.productId);
      if (card) {
        matched.push({ card, copy });
        continue;
      }
      if (!copy.number) {
        unmatched.push({ line: copy.line, reason: `TCGplayer id ${copy.productId} is not a One Piece card we track`, text: label });
        continue;
      }
      // An id we don't know but a number we might: fall through to the number.
    }
    let prints = byNumber.get(copy.number!) ?? [];
    if (copy.set && prints.length > 1) {
      const k = setKey(copy.set);
      const inSet = prints.filter((c) => setKey(c.setCode) === k || setKey(c.setName) === k);
      if (inSet.length) prints = inSet;
    }
    if (copy.printing) prints = prints.filter((c) => c.printing === copy.printing);
    if (prints.length === 1) {
      matched.push({ card: prints[0], copy });
      continue;
    }
    if (!prints.length) {
      unmatched.push({
        line: copy.line,
        reason: copy.printing ? `${copy.number} has no ${PRINTING_LABEL[copy.printing] ?? copy.printing} printing we track` : `${copy.number} is not a card we track`,
        text: label,
      });
      continue;
    }
    const kinds = [...new Set(prints.map((c) => PRINTING_LABEL[c.printing] ?? c.printing))];
    unmatched.push({
      line: copy.line,
      reason: `${copy.number} has ${prints.length} printings (${kinds.join(", ")}); add a printing column or a TCGplayer Product ID`,
      text: label,
    });
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
  printing: string;
  condition: string;
  isFoil: boolean;
  quantity: number;
  unitCents: number | null;
  costBasisCents: number | null; // per copy (averaged from a total)
  note: string | null;
  tcgplayerId: number;
}

/** "opcompare-binder-2026-10-03.csv" */
export const exportFilename = (now: Date = new Date()) => `opcompare-binder-${now.toISOString().slice(0, 10)}.csv`;

/**
 * The binder as CSV, in the visitor's currency: one row per entry, then a
 * TOTAL row. Its header is one parseCollectionCsv recognises (tcgplayer_id), so
 * the file imports straight back into the same printings.
 */
export function collectionCsv(rows: readonly ExportRow[], currency: string): string {
  const cur = currency.toLowerCase();
  const head = ["name", "set", "number", "printing", "condition", "foil", "quantity", `unit_${cur}`, `value_${cur}`, `paid_each_${cur}`, "note", "tcgplayer_id"];
  const money = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2));
  let total = 0;
  const lines = rows.map((r) => {
    const value = r.unitCents != null ? r.unitCents * r.quantity : null;
    total += value ?? 0;
    return [
      csvCell(r.name), csvCell(r.setCode), csvCell(r.number), csvCell(r.printing), csvCell(r.condition), r.isFoil ? "foil" : "",
      r.quantity, money(r.unitCents), money(value), money(r.costBasisCents), csvCell(r.note), r.tcgplayerId,
    ].join(",");
  });
  const totalRow = ["TOTAL", "", "", "", "", "", "", "", money(total), "", "", ""].join(",");
  return [head.join(","), ...lines, totalRow].join("\n") + "\n";
}
