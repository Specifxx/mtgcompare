// Resolving and pricing a pasted list on the server: lib/deck.ts's pure parser and rules over the published data. A line is resolved to a printing through the
// loaders (an oracle by name, a printing by set and collector number, an exact product by id), each printing is read in the finish the line asks for, and the
// offers of those units come from the one shared reader of live offers (lib/offer-read.ts). Shared by /api/deck/price, the /deck page's share metadata, the
// published decks and the deck watch. No catalogue is held in memory: every read is a pinned file of the published tree (egress rules: lib/db.ts, contract 7.10).
//
// A list resolves the same way everywhere (resolveDeckLines); what a caller adds is what it does with the rows (a price, a rules check, a publish).
//   * a pin ("#35427") wins; then set and collector number; then the card by NAME, at the set the line names if it names one, else at the CHEAP printing
//     (the importer's PRICE_MASK.CHEAP: the cheapest regular Normal printing of the card; THIN printings are valid targets).
//   * the finish is the line's (*F*, *E*), else Normal if the product has a Normal row, else the only finish it has (deck.ts chooseFinish).
import { affiliateUrl, cardEbayQuery, ebaySearchUrl } from "./affiliate";
import { retailerSubId } from "./board";
import { CARD_FLAGS, CONDITIONS, PRICE_MASK, fold, finishLabel, nkey, tcgplayerUrl, type Finish, type Format } from "./constants";
import { MARKETS, type Country } from "./country";
import { canonicalQuery, getBrowseIndex, getCardLookup, getCardsByIds, getOracleBySlug, resolveBySetNumber, resolveOracles, type CardLite, type OracleDetail, type OracleMini } from "./data";
import { planeSource } from "./data/plane/runtime";
import { checkDeck, copyLimitFromText, entryKey, inferCommanders, inferredNote, isBasicLand, isCommanderFormat, type DeckEntry, type DeckReport, type DeckZone, DECK_FORMATS } from "./commander-rules";
import {
  DECK_LINE_CAP,
  QTY_CAP,
  basePrinting,
  chooseFinish,
  formatDeckLine,
  formatDeckList,
  marketTotals,
  mergeLines,
  orderPrintings,
  parseDeckList,
  pickFromSetNumber,
  splitByCheapestStore,
  type DeckLine,
  type MarketTotal,
  type MatchKind,
  type ResolvedLine,
} from "./deck";
import { readLiveOffers, type LiveOffer, type StoreRegistry } from "./offer-read";
import type { PricedCard } from "./published-decks";
import { sourceLabel } from "./stores";

/** Distinct printings whose offers are read for one request (the line cap: every line may be a different printing). */
export const DECK_DETAIL_CAP = DECK_LINE_CAP;
/** Printings offered for the switcher of a line. */
const OPTION_CAP = 40;
/** Cards whose oracle text is read for the copy-limit clause and the partner rules: the over-limit ones and the commanders. */
const DETAIL_CAP = 14;

// ── the data seam ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Everything the resolver reads. loaderData is the published data; a test (or a script) passes its own. */
export interface DeckData {
  /** Folded name -> oracle (resolveOracles: the full name, or a face or reskin name only when exactly one oracle carries it). */
  oracles(nameKeys: readonly string[]): Promise<Map<string, OracleMini>>;
  /** "<set>|<nkey>" -> one to three products (resolveBySetNumber). */
  bySetNumber(pairs: readonly { set: string; number: string }[]): Promise<Map<string, CardLite[]>>;
  /** Cards by product id, in the unit view of `unit` when given (every price, low and store count is that finish's). */
  cards(ids: readonly number[], unit?: Finish): Promise<Map<number, CardLite>>;
  /** The listed printings of an oracle, cheapest market first (at most 100), the one the catalogue marks CHEAP, and how many there are; `sc` narrows to one Scryfall set. */
  printings(oracleNo: number, o?: { sc?: string }): Promise<{ cards: CardLite[]; cheapId: number | null; total: number }>;
  /** Oracle rows with their text and keywords by oracle slug (at most DETAIL_CAP): copy-limit clauses and partner abilities. */
  details(slugs: readonly string[]): Promise<Map<string, OracleDetail>>;
}

export const loaderData: DeckData = {
  oracles: async (keys) => {
    const out = new Map<string, OracleMini>();
    const uniq = [...new Set(keys)];
    for (let i = 0; i < uniq.length; i += 300) for (const [k, v] of await resolveOracles(uniq.slice(i, i + 300))) out.set(k, v);
    return out;
  },
  bySetNumber: (pairs) => resolveBySetNumber(pairs),
  cards: (ids, unit) => getCardsByIds(ids, unit ? { unit } : {}),
  printings: async (oracleNo, o = {}) => {
    const ix = await getBrowseIndex({ withOracle: false });
    const page = ix.query(canonicalQuery({ oracleNo, sc: o.sc, sort: "price-asc", per: 100, page: 1 }));
    const cheap = page.items.find((c) => ((ix.mk[ix.rowOf(c.id)] ?? 0) & PRICE_MASK.CHEAP) !== 0);
    return { cards: page.items, cheapId: cheap?.id ?? null, total: page.total };
  },
  details: async (slugs) => {
    const out = new Map<string, OracleDetail>();
    await Promise.all([...new Set(slugs)].slice(0, DETAIL_CAP).map(async (s) => { const d = await getOracleBySlug(s).catch(() => null); if (d) out.set(s, d); }));
    return out;
  },
};

// ── resolving ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface DeckRow extends ResolvedLine<CardLite> {
  /** The card's oracle facts (legality, identity, type line), null when they could not be read. */
  oracle: OracleMini | null;
}
export interface ResolvedDeck {
  /** Resolved lines, repeated lines merged; an unmatched line has `card: null`. */
  rows: DeckRow[];
  /** Oracle facts by oracle number. */
  oracles: Map<number, OracleMini>;
}

const isEtchedCard = (c: Pick<CardLite, "flags">): boolean => (c.flags & CARD_FLAGS.ETCHED) !== 0;
/** The regular printing with the cheapest Foil market (what a Foil line without a set means). */
const cheapestFoil = (cards: readonly CardLite[]): CardLite | undefined =>
  [...cards.filter((c) => !(c.flags & (CARD_FLAGS.SERIAL | CARD_FLAGS.NOTPLAY | CARD_FLAGS.ETCHED)) && c.f?.market != null)].sort((a, b) => a.f!.market! - b.f!.market! || a.id - b.id)[0];
/** The key resolveBySetNumber answers by: lower-case set code, then the lookup form of the collector number. */
const pairKey = (set: string, number: string): string => `${set.toLowerCase()}|${nkey(number) ?? ""}`;
const facesOf = (s: string): string[] => [fold(s), ...s.split(" // ").map(fold)].filter(Boolean);
/** A line that names a card AND a printing must agree with it: a stale collector number must not price another card. */
const nameAgrees = (line: DeckLine, c: Pick<CardLite, "name" | "alt">): boolean => {
  if (!line.name) return true;
  const mine = new Set(facesOf(line.name));
  return [c.name, c.alt ?? ""].some((n) => facesOf(n).some((f) => mine.has(f)));
};

interface Choice { card: CardLite | null; how: MatchKind; setMissed: boolean; etchedMissed: boolean; ambiguous: boolean; options: CardLite[]; oracle: OracleMini | null }
const NONE: Choice = { card: null, how: "none", setMissed: false, etchedMissed: false, ambiguous: false, options: [], oracle: null };

export async function resolveDeckLines(input: readonly DeckLine[], data: DeckData = loaderData, opts: { options?: boolean } = {}): Promise<ResolvedDeck> {
  const lines = input.slice(0, DECK_LINE_CAP);
  const withOptions = opts.options !== false;

  // 1. exact products, then (set, number)
  const pinned = lines.some((l) => l.productId) ? await data.cards([...new Set(lines.flatMap((l) => (l.productId ? [l.productId] : [])))]) : new Map<number, CardLite>();
  const pairs = lines.filter((l) => l.set && l.number && !(l.productId && pinned.has(l.productId))).map((l) => ({ set: l.set!, number: l.number! }));
  const bySn = pairs.length ? await data.bySetNumber(pairs) : new Map<string, CardLite[]>();
  const snHit = (l: DeckLine): CardLite[] | undefined => (l.set && l.number ? bySn.get(pairKey(l.set, l.number)) : undefined);

  // 2. oracle facts for every name that must be found by name. A card whose NAME ends in a parenthesis ("Hazmat Suit (Used)", "Erase (Not the Urza's Legacy One)")
  //    reads like a set code to the parser: a line that names a set and finds no card by its bare name is asked again with the parenthesis put back.
  const byName = lines.filter((l) => !(l.productId && pinned.has(l.productId)) && l.name);
  const oracles = byName.length ? await data.oracles([...new Set(byName.map((l) => fold(l.name)))]) : new Map<string, OracleMini>();
  const withParen = (l: DeckLine): string => fold(`${l.name} (${l.set})`);
  const retry = byName.filter((l) => l.set && !oracles.has(fold(l.name)));
  if (retry.length) for (const [k, v] of await data.oracles([...new Set(retry.map(withParen))])) oracles.set(k, v);
  // the oracle a line names, and whether the "set" it carried was really the end of the name
  const oracleOf = (l: DeckLine): { oracle: OracleMini | null; inName: boolean } => {
    const plain = l.name ? oracles.get(fold(l.name)) : undefined;
    if (plain) return { oracle: plain, inName: false };
    const paren = l.set && l.name ? oracles.get(withParen(l)) : undefined;
    return paren ? { oracle: paren, inName: true } : { oracle: null, inName: false };
  };
  const printingsMemo = new Map<string, Promise<{ cards: CardLite[]; cheapId: number | null; total: number }>>();
  const printingsOf = (no: number, sc?: string): ReturnType<DeckData["printings"]> => {
    const k = `${no}|${sc ?? ""}`;
    return printingsMemo.get(k) ?? printingsMemo.set(k, data.printings(no, sc ? { sc } : undefined)).get(k)!;
  };
  const optionsOf = async (card: CardLite): Promise<CardLite[]> => {
    if (!withOptions || !card.oracleNo) return [card];
    const p = await printingsOf(card.oracleNo);
    const rest = orderPrintings(p.cards.filter((c) => c.id !== card.id)).slice(0, OPTION_CAP - 1);
    return [card, ...rest];
  };

  // 3. one choice per line
  const choose = async (l: DeckLine): Promise<Choice> => {
    const pin = l.productId ? pinned.get(l.productId) : undefined;
    if (pin) return { ...NONE, card: pin, how: "pinned", options: await optionsOf(pin), oracle: null };
    const hit = snHit(l);
    if (hit) {
      const pick = pickFromSetNumber(hit, l.etched === true);
      if (pick && nameAgrees(l, pick.card)) return { ...NONE, card: pick.card, how: "setnumber", ambiguous: pick.ambiguous, etchedMissed: pick.etchedMissed, options: await optionsOf(pick.card) };
    }
    const { oracle, inName } = oracleOf(l);
    if (!oracle) return NONE;
    const set = inName ? undefined : l.set;
    const inSet = set ? await printingsOf(oracle.no, set) : null;
    const whole = await printingsOf(oracle.no);
    const found = !!inSet && inSet.cards.length > 0;
    const pool = found ? inSet!.cards : whole.cards;
    const missedSet = !!set && (!found || !!l.number);
    let card: CardLite | undefined, etchedMissed = false;
    if (l.etched) {
      card = [...pool].filter(isEtchedCard).sort((a, b) => (a.marketUsd ?? Infinity) - (b.marketUsd ?? Infinity) || a.id - b.id)[0];
      etchedMissed = !card;
    }
    if (!card && l.finish === 1) card = cheapestFoil(pool);
    if (!card) card = pool === whole.cards && whole.cheapId ? pool.find((c) => c.id === whole.cheapId) : undefined;
    card ??= basePrinting(pool.filter((c) => !isEtchedCard(c))) ?? pool[0];
    if (!card) return { ...NONE, oracle };
    return { card, how: found ? "set" : "name", setMissed: missedSet, etchedMissed, ambiguous: false, options: withOptions ? [card, ...orderPrintings(pool.filter((c) => c.id !== card!.id)).slice(0, OPTION_CAP - 1)] : [card], oracle };
  };
  const choices = await Promise.all(lines.map(choose));

  // 4. the unit view of each chosen printing: its own finish's prices, lows and store counts
  const wantFinish = lines.map((l, i) => { const c = choices[i]!.card; return c ? chooseFinish(c, l.finish) : { finish: "N" as Finish, adjusted: false }; });
  const idsN = new Set<number>(), idsF = new Set<number>();
  choices.forEach((c, i) => { if (c.card) (wantFinish[i]!.finish === "F" ? idsF : idsN).add(c.card.id); });
  const [unitN, unitF] = await Promise.all([idsN.size ? data.cards([...idsN], "N") : new Map<number, CardLite>(), idsF.size ? data.cards([...idsF], "F") : new Map<number, CardLite>()]);

  // 5. oracle facts of the printings that were not found by name
  const known = new Map<number, OracleMini>();
  for (const c of choices) if (c.oracle) known.set(c.oracle.no, c.oracle);
  const missing = [...new Set(choices.flatMap((c) => (c.card?.oracleNo && !known.has(c.card.oracleNo) ? [fold(c.card.name)] : [])))];
  if (missing.length) {
    const found = await data.oracles(missing);
    for (const o of found.values()) known.set(o.no, o);
  }

  const rows: DeckRow[] = lines.map((line, i) => {
    const ch = choices[i]!, f = wantFinish[i]!;
    const base = ch.card;
    const card = base ? ((f.finish === "F" ? unitF : unitN).get(base.id) ?? base) : null;
    const oracle = base?.oracleNo ? (known.get(base.oracleNo) ?? null) : null;
    return { line, card, finish: f.finish, options: ch.options.map((o) => (card && o.id === card.id ? card : o)), how: ch.how, setMissed: ch.setMissed, etchedMissed: ch.etchedMissed, ambiguous: ch.ambiguous, finishAdjusted: f.adjusted, oracle };
  });
  return { rows: mergeLines(rows), oracles: known };
}

/** Resolves text the way /deck prices it. */
export const resolveDeckText = (text: string, data: DeckData = loaderData, opts: { options?: boolean } = {}): Promise<ResolvedDeck> => resolveDeckLines(parseDeckList(text), data, opts);

// ── the rules check ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The names of a resolved deck as rule entries (same card and zone merged; unmatched lines are left out, the caller reports them). */
export function entriesOf(rows: readonly DeckRow[]): DeckEntry[] {
  const out = new Map<string, DeckEntry>();
  for (const r of rows) {
    if (!r.card) continue;
    const key = `${entryKey(r.oracle, r.card.name)}|${r.line.zone}`;
    const prev = out.get(key);
    if (prev) prev.qty += r.line.qty;
    // The rarity of a printing counts only where the list names the printing: a bare name is priced at the cheapest one, which says nothing about the card.
    else out.set(key, { key: entryKey(r.oracle, r.card.name), name: r.card.name, qty: r.line.qty, zone: r.line.zone, oracle: r.oracle, rarity: r.how === "name" ? null : r.card.rarity });
  }
  return [...out.values()];
}

/** The format a list is read as when the caller does not say: Commander when it has a commander section, else none. */
export const guessFormat = (rows: readonly { line: { zone: DeckZone } }[]): Format | null => (rows.some((r) => r.line.zone === "commander") ? "commander" : null);

/**
 * Judges a resolved deck against a format. Reads the oracle text of the cards the verdict depends on (the commanders: partner abilities; the cards over the copy
 * limit: "A deck can have any number of cards named ..."), at most DETAIL_CAP of them, then runs the pure check of lib/commander-rules.ts.
 */
export async function checkResolved(rows: readonly DeckRow[], format: Format, data: DeckData = loaderData, opts: { inferred?: readonly string[] } = {}): Promise<DeckReport> {
  const entries = entriesOf(rows);
  const rules = DECK_FORMATS[format];
  const total = new Map<string, number>();
  for (const e of entries) total.set(e.key, (total.get(e.key) ?? 0) + e.qty);
  const slugsFor = new Set<string>();
  const wantsText = (e: DeckEntry): boolean => !!e.oracle && ((isCommanderFormat(format) && e.zone === "commander") || (!isBasicLand(e.oracle.typeLine) && (total.get(e.key) ?? 0) > rules.copies));
  const slugOf = new Map<number, string>();
  for (const r of rows) if (r.oracle) slugOf.set(r.oracle.no, r.oracle.slug);
  for (const e of entries) if (wantsText(e) && e.oracle && slugsFor.size < DETAIL_CAP) { const s = slugOf.get(e.oracle.no); if (s) slugsFor.add(s); }
  const detail = slugsFor.size ? await data.details([...slugsFor]) : new Map<string, OracleDetail>();
  const bySlug = (e: DeckEntry): OracleDetail | undefined => (e.oracle ? detail.get(slugOf.get(e.oracle.no) ?? "") : undefined);
  const enriched = entries.map((e) => {
    const d = bySlug(e);
    return d ? { ...e, oracle: { ...e.oracle!, oracleText: d.oracleText, keywords: d.keywords }, copyLimit: copyLimitFromText(d.oracleText) } : e;
  });
  const report = checkDeck(format, enriched);
  // the commanders were moved out of the sideboard before this check: say so, as checkDeck does when it moves them itself
  return opts.inferred?.length ? { ...report, issues: [...report.issues, inferredNote(opts.inferred)] } : report;
}

/** The names of the cards a Commander-style format would read from the sideboard as its commander(s); empty when there is a commander already or none can lead. */
export const inferredCommanders = (rows: readonly DeckRow[], format: Format): string[] => inferCommanders(format, entriesOf(rows)).inferred;

/** MTGO and Moxfield text exports file the commander in the sideboard: for a Commander-style format with nothing in the commander slot, the card (or the legal pair) that can lead the deck moves there. */
export function withInferredCommanders<R extends DeckRow>(rows: readonly R[], format: Format): R[] {
  const inferred = inferredCommanders(rows, format);
  if (!inferred.length) return [...rows];
  const names = new Set(inferred);
  return rows.map((r) => (r.card && r.line.zone === "side" && names.has(r.card.name) ? { ...r, line: { ...r.line, zone: "commander" as const } } : r));
}

// ── pricing ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface DeckCardOut {
  id: number;
  slug: string;
  name: string;
  number: string | null;
  variant: string | null;
  printing: string;
  rarity: string | null;
  cardType: string | null;
  colors: string[];
  setCode: string;
  hasImage: boolean;
  finish: Finish;
  /** The cheapest in-stock store or TCGplayer listing per market, for this finish. */
  low: Record<Country, number | null>;
  marketUsd: number | null;
  /** What to show as the unit's price: market, else the thin low (`lowOnly`). */
  valueUsd: number | null;
  lowOnly: boolean;
  thin: boolean;
  oracleNo: number | null;
}

export interface DeckOptionOut {
  id: number;
  label: string;
  /** The printing's price in the viewer's market, in its headline finish. */
  low: number | null;
  marketUsd: number | null;
}

export interface DeckLineOut {
  raw: string;
  qty: number;
  zone: DeckZone;
  how: MatchKind;
  ambiguous: boolean;
  /** The line named a set or a number that did not resolve: the cheapest printing was priced instead. */
  setMissed: boolean;
  etchedMissed: boolean;
  /** The finish the line asked for does not exist on the printing. */
  finishAdjusted: boolean;
  finish: Finish;
  /** "Foil", "Foil Etched", "Surge Foil"; null for Normal. */
  finishWord: string | null;
  commander: boolean;
  card: DeckCardOut;
  /** The line's canonical text (what the share link and "send to" carry). */
  text: string;
  options: DeckOptionOut[];
  cheapest: { source: string; store: string; priceCents: number; url: string; condition: string | null } | null;
  tcgplayerUrl: string | null;
  ebayUrl: string;
}

export interface DeckPriceResult {
  market: Country;
  lines: DeckLineOut[];
  unmatched: string[];
  totals: Record<Country, MarketTotal>;
  /** Σ qty × the TCGplayer market of each line's unit (a low-only unit counts at its low: `lowOnlyCopies` says how many copies that is). */
  marketUsdTotal: number;
  lowOnlyCopies: number;
  split: {
    groups: { source: string; store: string; totalCents: number; copies: number; picks: { id: number; finish: Finish; name: string; qty: number; unitCents: number; url: string; condition: string | null }[] }[];
    totalCents: number;
    missing: string[];
  };
  /** The list judged against `format`; null when no format applies. */
  check: DeckReport | null;
  format: Format | null;
  text: string;
  /** Card lines read from the paste (headers and comments not counted). */
  lineCount: number;
  truncated: boolean;
}

export function optionLabel(c: Pick<CardLite, "number" | "label" | "treat" | "setCode">, setCode?: string): string {
  const code = setCode ?? c.setCode;
  const v = c.label ?? (c.treat.length ? c.treat.join(" ") : "Regular");
  return `${code ? `${code} ` : ""}${c.number ?? ""} ${v}`.replace(/\s+/g, " ").trim();
}

/** The name a plan line or a watch alert shows: "Lightning Bolt (M11) 149", with the finish word for a Foil copy. */
export function deckCardName(c: Pick<CardLite, "name" | "number" | "setCode" | "flags" | "treat">, finish: Finish): string {
  return `${c.name} (${c.setCode})${c.number ? ` ${c.number}` : ""}${finish === "F" ? ` · ${finishLabel(c, "F")}` : ""}`;
}

const isBasketSource = (source: string): boolean => source === "tcgplayer" || source.startsWith("store:");
/** Offers that can fill a deck line in a market: live, this market, a store or TCGplayer, never eBay. */
export function basketOffers<T extends { market: string; inStock: boolean; source: string }>(offers: readonly T[], market: Country): T[] {
  return offers.filter((o) => o.market === market && o.inStock && isBasketSource(o.source));
}

/** A resolved row that found a card. */
export type MatchedRow = DeckRow & { card: CardLite };

/**
 * The units a resolved list buys, for Best Basket's pasted list and the deck watch: one entry per (product, finish) with its copies summed (capped at QTY_CAP),
 * keyed by `uid` = productId * 2 + finish as a string, the key BasketCard.cardId and the listing tuples carry. Every zone but the maybeboard (the parser drops it)
 * is bought: a sideboard is part of the list. Lines that matched no card come back apart so the caller can say so.
 */
export function basketUnits(rows: readonly DeckRow[]): { wanted: Map<string, number>; info: Map<string, MatchedRow>; unmatched: DeckRow[] } {
  const wanted = new Map<string, number>(), info = new Map<string, MatchedRow>(), unmatched: DeckRow[] = [];
  for (const r of rows) {
    if (!r.card) {
      unmatched.push(r);
      continue;
    }
    const uid = String(r.card.id * 2 + (r.finish === "F" ? 1 : 0));
    wanted.set(uid, Math.min(QTY_CAP, (wanted.get(uid) ?? 0) + r.line.qty));
    if (!info.has(uid)) info.set(uid, r as MatchedRow);
  }
  return { wanted, info, unmatched };
}

/** The live offers of units: the contract's one reader (offer-read.ts) over the site's pinned source, or the injected one. */
export type OfferReader = (units: readonly { id: number; finish: Finish }[], market: Country) => Promise<LiveOffer[]>;
export const liveOfferReader = (o: { registry?: StoreRegistry } = {}): OfferReader => async (units, market) => {
  const { src } = await planeSource();
  return readLiveOffers(src, { units, market, includeTcgplayer: true, registry: o.registry });
};

const condIndex = (c: string | null): number | null => { const i = c ? CONDITIONS.indexOf(c as (typeof CONDITIONS)[number]) : -1; return i < 0 ? null : i; };
/** Live offers as Best Basket's listing tuples ([uid, source, priceCents, condition index, url]): in stock, a store or TCGplayer, the 60 cheapest per unit. */
export function listingTuples(offers: readonly LiveOffer[]): [number, string, number, number | null, string][] {
  const byUnit = new Map<number, LiveOffer[]>();
  for (const o of offers) if (o.inStock && isBasketSource(o.source)) (byUnit.get(o.productId * 2 + (o.finish === "F" ? 1 : 0)) ?? byUnit.set(o.productId * 2 + (o.finish === "F" ? 1 : 0), []).get(o.productId * 2 + (o.finish === "F" ? 1 : 0))!).push(o);
  return [...byUnit].flatMap(([uid, list]) => list.sort((a, b) => a.priceCents - b.priceCents).slice(0, 60).map((o): [number, string, number, number | null, string] => [uid, o.source, o.priceCents, condIndex(o.condition), o.url]));
}

const storeName = (source: string, market: Country): string => (source === "tcgplayer" ? "TCGplayer" : sourceLabel(source, market));

/** The price of a copy in a market: the cheapest live listing; in the US a unit with no listing falls back to its TCGplayer low or market (an untracked card has no store rows). */
function lowsOf(card: CardLite, offers: readonly LiveOffer[] | null): Record<Country, number | null> {
  const out = {} as Record<Country, number | null>;
  for (const m of MARKETS) out[m] = offers ? null : card.low[m];
  for (const o of offers ?? []) if (o.inStock && isBasketSource(o.source) && (out[o.market] == null || o.priceCents < out[o.market]!)) out[o.market] = o.priceCents;
  const q = card.headFinish === "F" ? card.f : card.n;
  if (out.US == null && q) out.US = q.low ?? q.market;
  return out;
}

export async function priceDeck(
  text: string,
  market: Country,
  opts: { withOffers?: boolean; page?: string; format?: Format | null; data?: DeckData; offers?: OfferReader } = {},
): Promise<DeckPriceResult> {
  const page = opts.page ?? "/deck";
  const data = opts.data ?? loaderData;
  const parsed = parseDeckList(text);
  const resolved = await resolveDeckLines(parsed, data);
  const asked = opts.format === undefined ? guessFormat(resolved.rows) : opts.format;
  const inferred = asked && isCommanderFormat(asked) ? inferredCommanders(resolved.rows, asked) : [];
  const rows = inferred.length ? withInferredCommanders(resolved.rows, asked!) : resolved.rows;
  const matched = rows.filter((r): r is DeckRow & { card: CardLite } => r.card != null);
  const unmatchedRows = rows.filter((r) => !r.card);

  const units = [...new Map(matched.map((m) => [`${m.card.id}.${m.finish}`, { id: m.card.id, finish: m.finish }])).values()].slice(0, DECK_DETAIL_CAP);
  let offers: LiveOffer[] | null = null;
  if (opts.withOffers !== false) offers = await (opts.offers ?? liveOfferReader())(units, market).catch(() => null);
  const offersOf = (c: { id: number }, finish: Finish): LiveOffer[] | null => (offers ? offers.filter((o) => o.productId === c.id && o.finish === finish) : null);

  const keyOf = (m: { card: CardLite; finish: Finish }): string => `${m.card.id}.${m.finish}`;
  const split = offers
    ? splitByCheapestStore(
        matched.map((m) => ({
          key: keyOf(m),
          qty: m.line.qty,
          offers: basketOffers(offersOf(m.card, m.finish) ?? [], market).map((o) => ({ source: o.source, priceCents: o.priceCents, url: o.url, condition: o.condition })),
        })),
      )
    : { groups: [], totalCents: 0, missing: [] as string[] };
  const pickFor = new Map<string, { source: string; priceCents: number; url: string; condition: string | null }>();
  for (const g of split.groups) for (const p of g.picks) pickFor.set(p.key, { source: g.source, priceCents: p.unitCents, url: p.url, condition: p.condition });

  const pins = await pinnedIds(matched.map((m) => m.card), data);

  const lines: DeckLineOut[] = matched.map((m) => {
    const c = m.card;
    const pick = pickFor.get(keyOf(m));
    const mine = offersOf(c, m.finish);
    const low = lowsOf(c, mine);
    const own = (c.headFinish === "F" ? c.f : c.n);
    return {
      raw: m.line.raw,
      qty: m.line.qty,
      zone: m.line.zone,
      how: m.how,
      ambiguous: m.ambiguous,
      setMissed: m.setMissed,
      etchedMissed: m.etchedMissed,
      finishAdjusted: m.finishAdjusted,
      finish: m.finish,
      finishWord: m.finish === "F" ? finishLabel(c, "F") : null,
      commander: m.line.zone === "commander",
      card: {
        id: c.id, slug: c.slug, name: c.name, number: c.number, variant: c.label, printing: c.printing, rarity: c.rarity, cardType: c.cardType, colors: c.colors, setCode: c.setCode,
        hasImage: c.hasImage, finish: m.finish, low, marketUsd: own?.market ?? c.marketUsd, valueUsd: own ? (own.market ?? own.low) : c.valueUsd, lowOnly: own ? own.market == null && own.low != null : c.lowOnly, thin: c.thin, oracleNo: c.oracleNo,
      },
      text: formatDeckLine(m.line.qty, c, { finish: m.finish, pinned: pins.has(c.id) }),
      options: m.options.map((o) => ({ id: o.id, label: optionLabel(o), low: o.low[market] ?? (o.headFinish === "F" ? o.f : o.n)?.low ?? null, marketUsd: o.marketUsd })),
      cheapest: pick ? { ...pick, store: storeName(pick.source, market), url: affiliateUrl(pick.url, retailerSubId(pick.source), page) } : null,
      tcgplayerUrl: affiliateUrl(tcgplayerUrl(c.id, m.finish), "tcgplayer", page),
      ebayUrl: ebaySearchUrl(market, cardEbayQuery({ name: c.name, number: c.number, variant: [c.label, m.finish === "F" ? "foil" : ""].filter(Boolean).join(" ") || null }), page.replace(/^\//, "").replace(/\//g, "-") || "deck"),
    };
  });
  const ZONE_ORDER: Record<DeckZone, number> = { commander: 0, companion: 1, main: 2, side: 3, maybe: 4 };
  lines.sort((a, b) => ZONE_ORDER[a.zone] - ZONE_ORDER[b.zone]);

  const nameOf = new Map(matched.map((m) => [keyOf(m), deckCardName(m.card, m.finish)]));
  const format = asked;
  const check = format ? await checkResolved(rows, format, data, { inferred }).catch(() => null) : null;
  const priced = lines.map((l) => ({ qty: l.qty, low: l.card.low }));
  return {
    market,
    lines,
    unmatched: unmatchedRows.map((r) => r.line.raw),
    totals: marketTotals(priced, MARKETS),
    marketUsdTotal: lines.reduce((s, l) => s + (l.card.valueUsd ?? 0) * l.qty, 0),
    lowOnlyCopies: lines.reduce((n, l) => n + (l.card.lowOnly ? l.qty : 0), 0),
    split: {
      groups: split.groups.map((g) => ({
        source: g.source,
        store: storeName(g.source, market),
        totalCents: g.totalCents,
        copies: g.copies,
        picks: g.picks.map((p) => ({ id: Number(p.key.split(".")[0]), finish: (p.key.endsWith(".1") ? "F" : "N") as Finish, name: nameOf.get(p.key) ?? p.key, qty: p.qty, unitCents: p.unitCents, url: affiliateUrl(p.url, retailerSubId(g.source), page), condition: p.condition })),
      })),
      totalCents: split.totalCents,
      missing: split.missing.map((k) => nameOf.get(k) ?? k),
    },
    check,
    format,
    text: formatDeckList([...lines.map((l) => ({ zone: l.zone, text: l.text })), ...unmatchedRows.map((r) => ({ zone: r.line.zone, text: r.line.raw }))]),
    lineCount: parsed.length,
    truncated: parsed.length >= DECK_LINE_CAP,
  };
}

/**
 * The list line for a card picked in the deck page's search: its set and number, with " #id" only when those would not find this product again. Null for a slug
 * that is not a card.
 */
export async function lineForSlug(slug: string, qty: number, data: DeckData = loaderData): Promise<string | null> {
  const look = await getCardLookup({ slugs: [slug] });
  const c = look.bySlug.get(slug);
  if (!c || c.cls !== 0) return null;
  const sn = c.number ? await data.bySetNumber([{ set: c.sc ?? c.setCode, number: c.number }]) : new Map<string, CardLite[]>();
  const pick = c.number ? pickFromSetNumber(sn.get(pairKey(c.sc ?? c.setCode, c.number)) ?? [], isEtchedCard(c)) : null;
  const pinned = !pick || pick.card.id !== c.id || pick.ambiguous;
  return formatDeckLine(Math.max(1, Math.min(QTY_CAP, Math.floor(qty) || 1)), c, { finish: c.headFinish, pinned });
}

// ── helpers for the library and the publisher ────────────────────────────────────────────────────────────────────────────────

/** Whether each chosen printing must carry " #id" to be found again from its text (its set and number alone find another product, or several). */
export async function pinnedIds(cards: readonly CardLite[], data: DeckData = loaderData): Promise<Set<number>> {
  const asked = cards.filter((c) => c.number).map((c) => ({ set: c.sc ?? c.setCode, number: c.number! }));
  const sn = asked.length ? await data.bySetNumber(asked).catch(() => new Map<string, CardLite[]>()) : new Map<string, CardLite[]>();
  const out = new Set<number>();
  for (const c of cards) {
    if (!c.number) { out.add(c.id); continue; }
    const pick = pickFromSetNumber(sn.get(pairKey(c.sc ?? c.setCode, c.number)) ?? [], isEtchedCard(c));
    if (!pick || pick.card.id !== c.id || pick.ambiguous) out.add(c.id);
  }
  return out;
}

/** The canonical text of resolved rows, sections included (Commander, Companion, Deck, Sideboard): what a published deck stores as `list`, and parseDeckList reads back to the same units. */
export async function canonicalText(rows: readonly DeckRow[], data: DeckData = loaderData): Promise<string> {
  const matched = rows.filter((r): r is DeckRow & { card: CardLite } => r.card != null);
  const pins = await pinnedIds(matched.map((r) => r.card), data);
  return formatDeckList([
    ...matched.map((r) => ({ zone: r.line.zone, text: formatDeckLine(r.line.qty, r.card, { finish: r.finish, pinned: pins.has(r.card.id) }) })),
    ...rows.filter((r) => !r.card).map((r) => ({ zone: r.line.zone, text: r.line.raw })),
  ]);
}

/** What a deck total needs of a unit-view card. */
export const pricedCard = (c: CardLite): PricedCard => ({ low: c.low, usd: (c.headFinish === "F" ? c.f : c.n)?.low ?? (c.headFinish === "F" ? c.f : c.n)?.market ?? null });

/**
 * The unit-view cards of stored deck lines ({ cardId, qty, finish }: the shape of PublishedDeck.lines and LibraryDeckRow.lines), keyed "<id>.<0|1>". The library
 * and a deck page price a deck NOW from these (deckTotals over pricedCard), so a price import moves every total without a deck read.
 */
export async function deckUnitCards(lines: readonly { cardId: number; finish?: Finish | 0 | 1 }[], data: DeckData = loaderData): Promise<Map<string, CardLite>> {
  const isF = (f: Finish | 0 | 1 | undefined): boolean => f === "F" || f === 1;
  const idsN = [...new Set(lines.filter((l) => !isF(l.finish)).map((l) => l.cardId))], idsF = [...new Set(lines.filter((l) => isF(l.finish)).map((l) => l.cardId))];
  const [n, f] = await Promise.all([idsN.length ? data.cards(idsN, "N") : new Map<number, CardLite>(), idsF.length ? data.cards(idsF, "F") : new Map<number, CardLite>()]);
  const out = new Map<string, CardLite>();
  for (const [id, c] of n) out.set(`${id}.0`, c);
  for (const [id, c] of f) out.set(`${id}.1`, c);
  return out;
}
