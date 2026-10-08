// The deck rules of Magic: which formats a list can be checked against, how big a deck is, how many copies a card may have, which cards may lead a
// Commander-style deck and which pairs may lead one together, and the colour identity every other card must fit. Pure: no I/O and no data layer, so the
// deck builder, the published-deck publisher, the deck watch and the tests share ONE implementation (lib/deck.ts parses a list, lib/deck-price.ts resolves
// it, this file judges it).
//
// Facts come from the published oracle rows (Oracle.legal: 22 characters, one per FORMATS entry, L legal / N not legal / B banned / R restricted / ?
// unknown; Oracle.identity: a WUBRG mask; Oracle.flags: ORACLE_FLAGS). Legality is Scryfall's and is informational: an unknown status renders as nothing and
// the card is reported as "not checked", never as illegal (contract 3.2 rule 7).
//
// The size and copy rules are the formats' own. Formats whose rules this file cannot confirm (`verified: false`) are checked for legality and copies only.
import { FORMAT_LABEL, ORACLE_FLAGS, fold, identityFits, legalityOf, type Format } from "./constants";

/** Where a line of a list sits: the deck proper, the sideboard, the commander slot, a companion, or the maybeboard (never priced, never checked). */
export type DeckZone = "main" | "side" | "commander" | "companion" | "maybe";
export const DECK_ZONES: readonly DeckZone[] = ["commander", "companion", "main", "side", "maybe"];

export type RuleFamily = "constructed" | "commander" | "brawl" | "oathbreaker" | "gladiator";
export interface DeckFormat {
  key: Format;
  label: string;
  family: RuleFamily;
  /** Cards in the deck proper (the main deck plus the commander slot). */
  min: number;
  max: number | null;
  /** Sideboard cards allowed (a companion is extra). */
  side: number;
  /** Copies of one card (basic lands and "any number" cards excepted); a restricted card in Vintage and Timeless is limited to one. */
  copies: number;
  /** false: the size is not confirmed for this format, so only legality and copies are checked. */
  verified: boolean;
}

const row = (key: Format, family: RuleFamily, min: number, max: number | null, side: number, copies: number, verified = true): DeckFormat => ({ key, label: FORMAT_LABEL[key], family, min, max, side, copies, verified });
const constructed = (key: Format, verified = true): DeckFormat => row(key, "constructed", 60, null, 15, 4, verified);

export const DECK_FORMATS: Readonly<Record<Format, DeckFormat>> = {
  standard: constructed("standard"), future: constructed("future"), historic: constructed("historic"), timeless: constructed("timeless"), pioneer: constructed("pioneer"),
  modern: constructed("modern"), legacy: constructed("legacy"), vintage: constructed("vintage"), pauper: constructed("pauper"), alchemy: constructed("alchemy"),
  penny: constructed("penny"), premodern: constructed("premodern"),
  gladiator: row("gladiator", "gladiator", 100, 100, 0, 1),
  commander: row("commander", "commander", 100, 100, 0, 1), duel: row("duel", "commander", 100, 100, 0, 1), predh: row("predh", "commander", 100, 100, 0, 1),
  paupercommander: row("paupercommander", "commander", 100, 100, 0, 1),
  brawl: row("brawl", "brawl", 100, 100, 0, 1), standardbrawl: row("standardbrawl", "brawl", 60, 60, 0, 1),
  oathbreaker: row("oathbreaker", "oathbreaker", 60, 60, 0, 1),
  competitivebrawl: row("competitivebrawl", "brawl", 0, null, 0, 1, false), tlr: row("tlr", "constructed", 0, null, 0, 4, false),
};
export const isDeckFormat = (v: unknown): v is Format => typeof v === "string" && Object.prototype.hasOwnProperty.call(DECK_FORMATS, v);
/** The formats whose deck leads with a commander: a published deck is one of these. */
export const COMMANDER_FORMATS: readonly Format[] = (Object.values(DECK_FORMATS) as DeckFormat[]).filter((f) => f.family === "commander" || f.family === "brawl" || f.family === "oathbreaker").map((f) => f.key);
export const isCommanderFormat = (f: Format): boolean => DECK_FORMATS[f].family === "commander" || DECK_FORMATS[f].family === "brawl" || DECK_FORMATS[f].family === "oathbreaker";
export const COMMANDER_DECK_SIZE = 100;

// ── card facts ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** What the rules read of an oracle: OracleMini and OracleDetail both satisfy it. `oracleText` and `keywords` are needed only to pair partners and to read a copy-limit exception. */
export interface RuleOracle {
  no: number;
  name: string;
  typeLine: string;
  identity: number;
  legal: string;
  flags: number;
  oracleText?: string | null;
  keywords?: readonly string[];
}

/** One name of a list in one zone. `key` is the oracle number when the facts are known (so two printings of a card are one name), else the folded name. */
export interface DeckEntry {
  key: string;
  name: string;
  qty: number;
  zone: DeckZone;
  oracle: RuleOracle | null;
  /** The rarity letter of the printing the list names (or resolved to); only the Pauper notes read it. */
  rarity?: string | null;
  /** "A deck can have up to N cards named ..." (copyLimitFromText); Infinity for "any number"; null or absent for a card without the clause. */
  copyLimit?: number | null;
}
export const entryKey = (oracle: Pick<RuleOracle, "no"> | null, name: string): string => (oracle ? `o${oracle.no}` : `n:${fold(name)}`);

const front = (typeLine: string): string => typeLine.split(" // ")[0] ?? "";
export const isBasicLand = (typeLine: string): boolean => /^Basic\b/.test(front(typeLine));
const isCreature = (o: RuleOracle): boolean => /\bCreature\b/.test(front(o.typeLine));
const isLegendary = (o: RuleOracle): boolean => /\bLegendary\b/.test(front(o.typeLine));
const isPlaneswalker = (o: RuleOracle): boolean => /\bPlaneswalker\b/.test(front(o.typeLine));
const isSpell = (o: RuleOracle): boolean => /^(?:(?:Tribal|Kindred|Snow|Legendary)\s+)*(?:Instant|Sorcery)\b/.test(front(o.typeLine));
const isBackground = (o: RuleOracle): boolean => (o.flags & ORACLE_FLAGS.BACKGROUND) !== 0;

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20 };
/** The copy-limit exception on a card: "A deck can have any number of cards named Relentless Rats." -> Infinity; "A deck can have up to nine cards named Nazgul." -> 9; none -> null. Reads the oracle text. */
export function copyLimitFromText(text: string | null | undefined): number | null {
  const m = /A deck can have (any number of|up to (\w+)) cards? named/i.exec(text ?? "");
  if (!m) return null;
  if (!m[2]) return Number.POSITIVE_INFINITY;
  const w = m[2].toLowerCase();
  const n = /^\d+$/.test(w) ? Number(w) : WORD_NUMBERS[w];
  return n && n > 0 ? n : null;
}

// ── partners ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** What a card offers a second commander slot: a plain Partner, one named Partner variant ("Partner - Survivors"), "Partner with <name>", Choose a Background, a Background, a Doctor's companion or a Time Lord Doctor. */
export interface PartnerKind {
  plain: boolean;
  /** Folded variant names: "partner - friends forever" -> "friends forever", "partner - father & son" -> "father son". */
  variants: string[];
  /** Folded name of the card it must be paired with ("Partner with Toothy, Imaginary Friend"), else null. */
  mate: string | null;
  chooseBackground: boolean;
  background: boolean;
  doctorsCompanion: boolean;
  timeLordDoctor: boolean;
}
export function partnerKind(o: RuleOracle): PartnerKind {
  const text = o.oracleText ?? "", kw = new Set((o.keywords ?? []).map((k) => k.toLowerCase()));
  const variants = [...text.matchAll(/^Partner\s*[—–-]\s*([^(\n]+?)\s*(?:\(|$)/gim)].map((m) => fold(m[1]!)).filter(Boolean);
  if (/^Friends forever\b/im.test(text)) variants.push("friends forever");
  const withMate = /^Partner with ([^\n(]+?)\s*(?:\(|$)/im.exec(text);
  const mate = withMate ? fold(withMate[1]!) : kw.has("partner-with") ? "" : null;
  return {
    plain: kw.has("partner") && !variants.length && mate === null,
    variants: [...new Set(variants)],
    mate,
    chooseBackground: (o.flags & ORACLE_FLAGS.CHOOSE_BACKGROUND) !== 0 || kw.has("choose-a-background"),
    background: isBackground(o),
    doctorsCompanion: kw.has("doctor's-companion") || kw.has("doctors-companion"),
    timeLordDoctor: /^Legendary Creature — Time Lord Doctor$/.test(front(o.typeLine)),
  };
}

/** Whether two cards may share the commander slot (Commander rules 702.124: Partner, Partner with, Partner variants, Friends forever, Choose a Background, Doctor's companion). Order does not matter. */
export function canPair(a: RuleOracle, b: RuleOracle): boolean {
  const x = partnerKind(a), y = partnerKind(b);
  if (x.plain && y.plain) return true;
  if (x.variants.some((v) => y.variants.includes(v))) return true;
  if (x.mate !== null && y.mate !== null && x.mate !== "" && y.mate !== "" && [fold(b.name), fold(front(b.name))].includes(x.mate) && [fold(a.name), fold(front(a.name))].includes(y.mate)) return true;
  if ((x.chooseBackground && y.background) || (y.chooseBackground && x.background)) return true;
  if ((x.doctorsCompanion && y.timeLordDoctor) || (y.doctorsCompanion && x.timeLordDoctor)) return true;
  return false;
}

// ── who may lead the deck ────────────────────────────────────────────────────────────────────────────────────────────────────

/** May this card be the (first) commander of a deck in this format? Commander, Duel Commander and PreDH: ORACLE_FLAGS.COMMANDER (a legendary creature, a legendary Vehicle or Spacecraft with power and toughness, or text that says so).
 *  Brawl: that, or any legendary creature or planeswalker. Oathbreaker: a planeswalker. Pauper Commander: a creature that is legal there (it was printed at common) or that was printed at
 *  uncommon: Scryfall marks an uncommon-only creature NOT legal in the 99 (no oracle of the data of 2026-10-07 is "restricted" there), so `rarity` is the lowest rarity the card was printed at
 *  (commanderNeedsPrintings says when the caller must read the printings for it) and the line's own printing is the fallback. */
export function commanderEligible(format: Format, o: RuleOracle, rarity?: string | null): boolean {
  const fam = DECK_FORMATS[format].family;
  if (fam === "oathbreaker") return isPlaneswalker(o);
  if (fam === "brawl") return (o.flags & ORACLE_FLAGS.COMMANDER) !== 0 || (isLegendary(o) && (isCreature(o) || isPlaneswalker(o)));
  if (format === "paupercommander") { const s = legalityOf(o.legal, format); return isCreature(o) && (s === "legal" || s === "restricted" || rarity === "U" || rarity === "C"); }
  return (o.flags & ORACLE_FLAGS.COMMANDER) !== 0;
}

/** Whether the rules need the printings of this entry: a Pauper Commander commander that is a creature and not legal in the deck, which may lead only if it was printed at uncommon. The oracle row does not say what a card was printed at. */
export const commanderNeedsPrintings = (format: Format, e: Pick<DeckEntry, "zone" | "oracle">): boolean =>
  format === "paupercommander" && e.zone === "commander" && !!e.oracle && isCreature(e.oracle) && legalityOf(e.oracle.legal, format) !== "legal";

/** The identity the deck is held to: every commander's colours together. */
export const deckIdentity = (commanders: readonly Pick<RuleOracle, "identity">[]): number => commanders.reduce((m, c) => m | c.identity, 0);

// ── the check ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type IssueCode =
  | "size" | "side-size" | "copies" | "banned" | "not-legal" | "no-commander" | "bad-commander" | "partner" | "signature-spell" | "identity" | "restricted" | "pauper-rarity" | "inferred" | "unchecked";
export interface DeckIssue {
  code: IssueCode;
  /** An error is a rule the list breaks; a note is something worth saying that breaks none. */
  level: "error" | "note";
  message: string;
  /** The cards the issue is about ("Lightning Bolt (5)", "Mox Opal"), at most 12. */
  names: string[];
}
export interface DeckCounts { main: number; side: number; commander: number; companion: number; /** main plus the commander slot: what the size rule counts */ deck: number }
export interface DeckReport {
  format: Format;
  label: string;
  /** No error: the list obeys every rule this check knows. Not a guarantee of legality (unknown cards are listed in `unchecked`). */
  ok: boolean;
  issues: DeckIssue[];
  counts: DeckCounts;
  /** The colour identity the deck is held to (the commanders'); null for a format without a commander. */
  identity: number | null;
  commanders: string[];
  /** Cards whose legality is unknown or whose facts could not be read: not judged. */
  unchecked: string[];
  /** false when the size rule of this format is not confirmed. */
  verified: boolean;
}

const MAX_NAMES = 12;
const cap = (names: string[]): string[] => (names.length > MAX_NAMES ? [...names.slice(0, MAX_NAMES - 1), `and ${names.length - MAX_NAMES + 1} more`] : names);
const sum = (es: readonly DeckEntry[]): number => es.reduce((n, e) => n + e.qty, 0);
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** For a Commander-style format with nothing in the commander slot: the one card (or the legal pair) of the sideboard that can lead the deck. MTGO and Moxfield text exports file the commander in the sideboard. Returns the entries with those cards moved. */
export function inferCommanders(format: Format, entries: readonly DeckEntry[]): { entries: DeckEntry[]; inferred: string[] } {
  const none = { entries: [...entries], inferred: [] as string[] };
  if (!isCommanderFormat(format) || entries.some((e) => e.zone === "commander")) return none;
  const side = entries.filter((e) => e.zone === "side" && e.oracle && e.qty === 1);
  const fam = DECK_FORMATS[format].family;
  let pick: DeckEntry[] = [];
  if (fam === "oathbreaker") {
    const pw = side.find((e) => commanderEligible(format, e.oracle!, e.rarity)), spell = side.find((e) => e !== pw && isSpell(e.oracle!));
    pick = pw ? (spell ? [pw, spell] : [pw]) : [];
  } else {
    const lead = side.find((e) => commanderEligible(format, e.oracle!, e.rarity));
    if (lead) {
      const mate = side.find((e) => e !== lead && canPair(lead.oracle!, e.oracle!) && (commanderEligible(format, e.oracle!, e.rarity) || isBackground(e.oracle!)));
      pick = mate ? [lead, mate] : [lead];
    }
  }
  if (!pick.length) return none;
  const moved = new Set(pick);
  return { entries: entries.map((e) => (moved.has(e) ? { ...e, zone: "commander" as const } : e)), inferred: pick.map((e) => e.name) };
}

/** The note that says which cards were read from the sideboard as the commander(s). */
export const inferredNote = (names: readonly string[]): DeckIssue => ({ code: "inferred", level: "note", message: `Read ${names.join(" and ")} from the sideboard as the commander${names.length > 1 ? "s" : ""}.`, names: cap([...names]) });

/** Judges a list against a format. Pure: the caller resolves the lines and passes the oracle facts. A format that leads with a commander and has none in the commander slot looks in the sideboard first (inferCommanders). */
export function checkDeck(format: Format, input: readonly DeckEntry[], opts: { inferCommander?: boolean } = {}): DeckReport {
  const rules = DECK_FORMATS[format];
  const issues: DeckIssue[] = [];
  const err = (code: IssueCode, message: string, names: string[] = []): void => void issues.push({ code, level: "error", message, names: cap(names) });
  const note = (code: IssueCode, message: string, names: string[] = []): void => void issues.push({ code, level: "note", message, names: cap(names) });
  const live = input.filter((e) => e.zone !== "maybe" && e.qty > 0);
  const { entries, inferred } = opts.inferCommander === false ? { entries: [...live], inferred: [] as string[] } : inferCommanders(format, live);
  const zone = (z: DeckZone): DeckEntry[] => entries.filter((e) => e.zone === z);
  const leaders = zone("commander");
  const counts: DeckCounts = { main: sum(zone("main")), side: sum(zone("side")), commander: sum(leaders), companion: sum(zone("companion")), deck: 0 };
  counts.deck = counts.main + counts.commander;
  const led = rules.family !== "constructed" && rules.family !== "gladiator";
  const label = rules.label;

  // size
  if (rules.verified) {
    const a = /^[AEIOU]/i.test(label) ? "An" : "A";
    if (rules.min === rules.max && counts.deck !== rules.min) err("size", `${a} ${label} deck is exactly ${rules.min} cards${led ? ", the commander included" : ""} (this list has ${counts.deck}).`);
    else if (rules.max === null && counts.deck < rules.min) err("size", `${a} ${label} deck needs at least ${rules.min} cards in the main deck (this list has ${counts.deck}).`);
    if (rules.side === 0 && counts.side > 0) (led ? note : err)("side-size", `${label} has no sideboard${led ? `: the ${plural(counts.side, "card", "cards")} listed there ${counts.side === 1 ? "is" : "are"} not part of the deck` : ""}.`);
    else if (rules.side > 0 && counts.side > rules.side) err("side-size", `A sideboard holds at most ${rules.side} cards (this one has ${counts.side}).`);
  }

  // legality, restricted cards and copies, one name at a time across every zone
  const groups = new Map<string, DeckEntry[]>();
  for (const e of entries) (groups.get(e.key) ?? groups.set(e.key, []).get(e.key)!).push(e);
  const banned: string[] = [], notLegal: string[] = [], unchecked: string[] = [], over: string[] = [], restricted: string[] = [];
  for (const g of groups.values()) {
    const e = g[0]!, qty = sum(g), o = e.oracle;
    if (!o) { unchecked.push(e.name); continue; }
    const status = legalityOf(o.legal, format);
    // Pauper Commander: a creature printed at uncommon is not legal in the 99 but may lead the deck (only if every copy the list has is in the commander slot)
    const leads = format === "paupercommander" && g.every((x) => x.zone === "commander") && commanderEligible(format, o, e.rarity);
    if (status === "banned") banned.push(e.name);
    else if (status === "not_legal" && !leads) notLegal.push(e.name);
    else if (status === "unknown") unchecked.push(e.name);
    if (status === "restricted" && !(format === "vintage" || format === "timeless")) restricted.push(e.name);
    const exception = g.map((x) => x.copyLimit).find((n) => n != null) ?? null;
    const limit = isBasicLand(o.typeLine) ? Infinity : exception ?? (status === "restricted" && (format === "vintage" || format === "timeless") ? 1 : rules.copies);
    if (qty > limit) over.push(`${e.name} (${qty})`);
  }
  if (banned.length) err("banned", `Banned in ${label}: ${banned.slice(0, MAX_NAMES).join(", ")}.`, banned);
  if (notLegal.length) err("not-legal", `Not legal in ${label}: ${notLegal.slice(0, MAX_NAMES).join(", ")}.`, notLegal);
  if (over.length) {
    const limited = rules.copies === 1 ? `${label} is a singleton format: one copy of each card, except basic lands` : `At most ${rules.copies} copies of a card, except basic lands (and a restricted card in Vintage or Timeless is limited to one)`;
    err("copies", `${limited}: ${over.slice(0, MAX_NAMES).join(", ")}.`, over);
  }
  if (restricted.length) note("restricted", `Restricted in ${label}: ${restricted.slice(0, MAX_NAMES).join(", ")}. Check the format's rules for how.`, restricted);

  // the commander slot
  let identity: number | null = null;
  const commanderNames = leaders.map((e) => e.name);
  if (led) {
    const lo = leaders.filter((e) => e.oracle);
    if (!leaders.length) err("no-commander", rules.family === "oathbreaker" ? "Add your Oathbreaker (a planeswalker) and its signature spell." : "Add your commander: the card that leads the deck and sets its colours.");
    else if (rules.family === "oathbreaker") {
      const pw = lo.filter((e) => isPlaneswalker(e.oracle!)), spells = lo.filter((e) => isSpell(e.oracle!));
      if (counts.commander !== 2 || pw.length !== 1 || spells.length !== 1) err("bad-commander", "An Oathbreaker deck leads with one planeswalker (the Oathbreaker) and one instant or sorcery (its signature spell).", commanderNames);
      else if (!identityFits(spells[0]!.oracle!.identity, pw[0]!.oracle!.identity)) err("signature-spell", "The signature spell's colour identity must fit the Oathbreaker's.", [spells[0]!.name]);
      identity = pw[0] ? pw[0].oracle!.identity : null;
    } else if (counts.commander === 1) {
      const c = leaders[0]!;
      if (c.oracle && !commanderEligible(format, c.oracle, c.rarity)) err("bad-commander", `${c.name} can't be a ${label} commander.`, [c.name]);
    } else if (counts.commander === 2 && leaders.length === 2) {
      const [a, b] = [leaders[0]!, leaders[1]!];
      if (a.oracle && b.oracle) {
        const fits = (e: DeckEntry): boolean => commanderEligible(format, e.oracle!, e.rarity) || isBackground(e.oracle!);
        if (!fits(a) || !fits(b)) err("bad-commander", `${[a, b].filter((e) => !fits(e)).map((e) => e.name).join(" and ")} can't be a ${label} commander.`, commanderNames);
        else if (!(canPair(a.oracle, b.oracle) || canPair(b.oracle, a.oracle))) err("partner", `${a.name} and ${b.name} can't be commanders together: both need Partner (or the same Partner variant), name each other, or pair a Background with a creature that chooses one.`, commanderNames);
      }
    } else err("partner", `A deck has one commander, or two that are partners (this one has ${counts.commander}).`, commanderNames);
    if (rules.family !== "oathbreaker") identity = lo.length === leaders.length && lo.length > 0 ? deckIdentity(lo.map((e) => e.oracle!)) : null;

    // colour identity of everything else
    if (identity !== null) {
      const off = zone("main").concat(zone("companion")).filter((e) => e.oracle && !identityFits(e.oracle.identity, identity!)).map((e) => e.name);
      if (off.length) err("identity", `Outside the commander's colour identity: ${off.slice(0, MAX_NAMES).join(", ")}.`, off);
    }
  }

  // Pauper: Scryfall's status says the card has been printed at common; say so when the printing named in the list is not
  if (format === "pauper" || format === "paupercommander") {
    const odd = entries.filter((e) => e.oracle && e.rarity && !["C", "L"].includes(e.rarity) && legalityOf(e.oracle.legal, format) === "legal" && !isBasicLand(e.oracle.typeLine)).map((e) => e.name);
    if (odd.length) note("pauper-rarity", `Legal in ${label} through a common printing; the printing in this list is not a common: ${odd.slice(0, MAX_NAMES).join(", ")}.`, odd);
  }
  if (inferred.length) issues.push(inferredNote(inferred));
  if (unchecked.length) note("unchecked", `${plural(unchecked.length, "card was", "cards were")} not checked (legality unknown): ${unchecked.slice(0, MAX_NAMES).join(", ")}.`, unchecked);

  return { format, label, ok: !issues.some((i) => i.level === "error"), issues, counts, identity, commanders: commanderNames, unchecked, verified: rules.verified };
}

/** The first error of a report as a sentence, or null. */
export const firstError = (r: DeckReport): string | null => r.issues.find((i) => i.level === "error")?.message ?? null;
