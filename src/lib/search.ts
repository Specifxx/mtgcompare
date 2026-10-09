// src/lib/search.ts (owner WP07). The search grammar: pure, no I/O. `ParsedSearch` and `parseSearch` are FROZEN (contract 7.12); the planner that turns the parse into a CardQuery lives in src/lib/data/search.ts, the engine in plane/browse-index.ts.
// `ctx.setCodes` is the set of known lower-case Scryfall codes (getScrySets) plus Set.tok values.
//
// What a query can say (Annex C check 9, tests/search.test.ts):
//   mh3 6, lea 232, pbro 165p, plst khc-29, 7ed 231★   set code + collector number (the last two tokens; `-`, `/` and `:` also separate: mh3-6, mh3/6, mh3:6)
//   bolt m11, thoughtseize 2x2, sol ring c21, m11 bolt  a name plus a code that CONTAINS A DIGIT (m11, 2x2, c21, mh3, 40k, 5dn), trailing or leading
//   fire ice, war room, one with nothing, all that glitters   a name: an all-letter token is never a set code (of the 719 all-letter Scryfall codes 42 are also a word in a card name:
//                                                         war 129 oracles, one 77, all 54, ice 30 ...; of the 337 codes with a digit none is), unless it is written set:ice, e:ice, (ice) or followed by a collector number (ice 123)
//   sol ring foil, borderless, etched, surge foil, showcase   words of TREATMENT_BY_SYNONYM become `treat`; "foil" / "nonfoil" / "etched" become the finish (the unit view)
//   khan engineered evil                                  a printed (reskin) name: the planner matches `alt` as well as the name
//   jace the mind sculptor, jace, the mind sculptor       fold() removes punctuation; a leading "the" is optional
import { TREATMENTS, TREATMENT_BY_SYNONYM, fold, type Finish, type TreatmentKey } from "./constants";

export interface ParsedSearch {
  text: string;                    // the remaining name text, folded
  set?: string;                    // a Scryfall set code (lower case) or Set.tok
  number?: string;                 // a collector number as typed; compare with nkey()
  finish?: Finish;                 // "foil" / "nonfoil" words
  etched?: boolean;                // "etched" / "foil etched"
  treat: TreatmentKey[];           // words found in TREATMENT_BY_SYNONYM
}

/** A collector number as people type it: an optional set-style prefix ("khc-"), one to four digits, an optional suffix of up to two letters or stars ("165p", "231★", "551a"). */
const NUMBER_RX = /^(?:[a-z]{1,4}-)?\d{1,4}[a-z★†]{0,2}$/;
/** A code written the long way: set:ice, e:ice, edition:ice, s:ice. */
const EXPLICIT_SET_RX = /^(?:set|e|edition|s):([a-z0-9][a-z0-9_-]{0,11})$/;
const EXPLICIT_NUMBER_RX = /^(?:cn|number|num|#):?([a-z0-9][a-z0-9★†-]{0,10})$/;
const PAREN_RX = /^\(([a-z0-9][a-z0-9_-]{0,11})\)$/;
const hasDigit = (s: string): boolean => /\d/.test(s);

/** The treatment phrases a query may use, longest first. Two-letter synonyms (ce, ie, jp, ea, sb) and the hidden language words are left out: they are far more likely to be part of a name than a request. A trailing "*" (prefix synonym) matches the phrase itself only. */
const PHRASES: { words: string[]; key: TreatmentKey }[] = (() => {
  const hidden = new Set<string>(TREATMENTS.filter((t) => t.hidden).map((t) => t.key));
  const out: { words: string[]; key: TreatmentKey }[] = [];
  for (const [syn, key] of TREATMENT_BY_SYNONYM) {
    const phrase = syn.replace(/ \*$/, "").trim();
    if (!phrase || phrase.length <= 2 || hidden.has(key)) continue;
    out.push({ words: phrase.split(" "), key });
  }
  return out.sort((a, b) => b.words.length - a.words.length || b.words.join(" ").length - a.words.join(" ").length);
})();

function takeTreatments(words: string[]): { rest: string[]; treat: TreatmentKey[] } {
  const rest: string[] = [], treat: TreatmentKey[] = [];
  for (let i = 0; i < words.length;) {
    const hit = PHRASES.find((p) => p.words.every((w, k) => words[i + k] === w));
    if (hit) { if (!treat.includes(hit.key)) treat.push(hit.key); i += hit.words.length; } else rest.push(words[i++]!);
  }
  return { rest, treat };
}

/** A set code is taken from the text only when it CONTAINS A DIGIT (m11, 2x2, c21, mh3, 40k) or is written `set:ice`, `e:ice`, `(ice)` or followed by a collector number ("ice 123"): of the 719 all-letter Scryfall codes 42 are also a word in a card name (war 129 oracles, one 77, all 54, ice 30 ...). */
export function parseSearch(q: string, ctx: { setCodes: ReadonlySet<string> }): ParsedSearch {
  let tokens = String(q ?? "").normalize("NFKC").toLowerCase().slice(0, 120).split(/[\s,]+/).filter(Boolean);
  let set: string | undefined, number: string | undefined;
  const known = (c: string): boolean => ctx.setCodes.has(c);

  // 1. the explicit forms, anywhere in the text
  tokens = tokens.filter((t) => {
    let m = EXPLICIT_SET_RX.exec(t); if (m && !set) { set = m[1]; return false; }
    m = EXPLICIT_NUMBER_RX.exec(t); if (m && !number && NUMBER_RX.test(m[1]!)) { number = m[1]; return false; }
    m = PAREN_RX.exec(t); if (m && !set && known(m[1]!)) { set = m[1]; return false; }
    return true;
  });

  // 2. set code + collector number: the last two tokens, the first a known code, the second shaped like a number ("plst khc-29": the number may carry a prefix)
  if (!set && tokens.length >= 2) {
    const a = tokens[tokens.length - 2]!, b = tokens[tokens.length - 1]!;
    if (known(a) && NUMBER_RX.test(b)) { set = a; number = b; tokens = tokens.slice(0, -2); }
  } else if (set && !number && tokens.length) {
    const b = tokens[tokens.length - 1]!; if (NUMBER_RX.test(b) && /\d/.test(b)) { number = b; tokens = tokens.slice(0, -1); }          // "set:mh3 6"
  }

  // 3. "mh3-6", "mh3/6", "mh3:6" as one token
  if (!set && tokens.length) {
    const last = tokens[tokens.length - 1]!, cut = /[-/:]/.exec(last);
    if (cut && cut.index > 0) { const left = last.slice(0, cut.index), right = last.slice(cut.index + 1); if (known(left) && NUMBER_RX.test(right)) { set = left; number = right; tokens = tokens.slice(0, -1); } }
  }

  // 4. a name plus a code that contains a digit, trailing first, then leading
  if (!set && tokens.length) {
    const last = tokens[tokens.length - 1]!, first = tokens[0]!;
    if (hasDigit(last) && known(last)) { set = last; tokens = tokens.slice(0, -1); }
    else if (hasDigit(first) && known(first)) { set = first; tokens = tokens.slice(1); }
  }

  // 5. finish and treatment words in what is left (never in the set and number)
  const words = fold(tokens.join(" ")).split(" ").filter(Boolean);
  const { rest, treat } = takeTreatments(words);
  let finish: Finish | undefined, etched = false;
  const left: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const w = rest[i]!;
    if (w === "non" && rest[i + 1] === "foil") { finish = "N"; i++; }
    else if (w === "nonfoil") finish = "N";
    else if (w === "foil") finish = "F";
    else left.push(w);
  }
  if (treat.includes("etched")) { etched = true; finish = "F"; }
  return { text: left.join(" "), ...(set ? { set } : {}), ...(number ? { number } : {}), ...(finish ? { finish } : {}), ...(etched ? { etched: true } : {}), treat };
}

// ── names ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Community names for a card that appear nowhere in its printed name: nickname -> the card's full name. Closed and short: an entry is added only when the name is beyond doubt (the Scryfall name must exist; tests/search.test.ts resolves each against the published name table). Nicknames ADD results to a search, they never remove any. */
export const NICKNAMES: Readonly<Record<string, string>> = {
  bob: "Dark Confidant", goyf: "Tarmogoyf", snappy: "Snapcaster Mage", jtms: "Jace, the Mind Sculptor", fow: "Force of Will", fon: "Force of Negation",
  bop: "Birds of Paradise", "sad robot": "Solemn Simulacrum", sfm: "Stoneforge Mystic", "t3feri": "Teferi, Time Raveler",
};

/** The folded full names a typed query is a nickname for (exact phrase, case and punctuation ignored). */
export function nicknameTargets(text: string): string[] {
  const t = fold(text);
  return t && Object.prototype.hasOwnProperty.call(NICKNAMES, t) ? [fold(NICKNAMES[t]!)] : [];
}

const dropThe = (s: string): string => (s.startsWith("the ") ? s.slice(4) : s);
/**
 * How well a folded name matches a folded query: 0 exact, 1 the name starts with it, 2 every query word starts a name word in order, 3 every query word starts a name word, 4 a squashed match inside the name (for queries of four letters or more:
 * "monkeydluffy" finds "Monkey D Luffy"; a short query never matches the middle of a word). null = no match. A leading "the" is optional on both sides.
 */
export function nameTier(nameKey: string, queryKey: string): number | null {
  const n = dropThe(nameKey), q = dropThe(queryKey);
  if (!q || !n) return null;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  const nw = n.split(" "), qw = q.split(" ");
  let at = 0, inOrder = true;
  for (const w of qw) { let found = -1; for (let i = at; i < nw.length; i++) if (nw[i]!.startsWith(w)) { found = i; break; } if (found < 0) { inOrder = false; break; } at = found + 1; }
  if (inOrder) return 2;
  if (qw.every((w) => nw.some((x) => x.startsWith(w)))) return 3;
  const sq = q.replace(/ /g, "");
  if (sq.length >= 4 && n.replace(/ /g, "").includes(sq)) return 4;
  return null;
}

/** Levenshtein distance, giving up above `max` (returns max + 1). */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) { const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)); cur.push(v); if (v < best) best = v; }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]! > max ? max + 1 : prev[b.length]!;
}

/**
 * "Did you mean": up to `n` REAL names within a small edit distance of what was typed (a third of its length, at most 3), nearest first, then in the order given (the hot table is hottest first). Nothing for a short or hopeless query. Names are display names; the match is on their folded form.
 */
export function didYouMean(typed: string, names: readonly string[], n = 3): string[] {
  const q = dropThe(fold(typed));
  if (q.replace(/ /g, "").length < 4) return [];
  const max = Math.min(3, Math.max(1, Math.floor(q.length / 3)));
  const out: { name: string; d: number; i: number }[] = [], seen = new Set<string>();
  names.forEach((name, i) => {
    const key = dropThe(fold(name)); if (seen.has(key)) return;
    const d = editDistance(q, key, max); if (d <= max) { seen.add(key); out.push({ name, d, i }); }
  });
  return out.sort((a, b) => a.d - b.d || a.i - b.i).slice(0, n).map((x) => x.name);
}
