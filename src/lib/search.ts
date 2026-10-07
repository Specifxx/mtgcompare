// Card search over the cached catalogue — pure, so /api/search and /browse
// share it and tests/search.test.ts can pin it.
//
// What people type into the box, and how each shape is answered:
//   "OP01-024", "op01 024", "op01024"  → that card number (every printing of it)
//   "OP05-119 manga"                    → that number, narrowed by the other words
//   "Monkey.D.Luffy", "monkey d luffy"  → punctuation is a space, so both match
//   "monkeydluffy", "eustasscaptainkid" → a squashed name matches the squashed name
//   "luffy op05", "zoro alt art sr"      → every word must match the name, number,
//                                          printing, rarity, type, set code or set name
//   "big mom", "blackbeard", "doffy"    → the One Piece nicknames collectors use
//   "lufy", "doflamigo"                 → no match, so suggestNames() offers the
//                                          nearest real names ("Did you mean …?")
// A word matches the START of a word in the card's text (so "sp" is the SP
// printing, not every "spa…" in a name); words of four letters or more may also
// match inside a word. Ranking: exact name, then names that start with the
// query, then word-start matches, standard prints first, then value.
import { slugsForAlias } from "./card-aliases";
import type { CardLite, SetLite } from "./data";

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** norm() without the spaces: "Monkey.D.Luffy" → "monkeydluffy". */
export const squash = (s: string): string => norm(s).replace(/ /g, "");

const NUMBER_RE = /^(op|st|eb|prb)[-\s]?(\d{2})[-\s]?(\d{3})$/i;

/** "op01 120", "OP01-120", "op01120" → "OP01-120" when the query is a card number. */
export function numberQuery(q: string): string | null {
  const m = NUMBER_RE.exec(q.trim()) ?? null;
  if (m) return `${m[1].toUpperCase()}${m[2]}-${m[3]}`;
  const p = /^\s*p[-\s]?(\d{3})\s*$/i.exec(q);
  return p ? `P-${p[1]}` : null;
}

/** A card number anywhere in the query, and the words left over. */
export function splitNumber(q: string): { number: string | null; rest: string } {
  const whole = numberQuery(q);
  if (whole) return { number: whole, rest: "" };
  const m = /(?:^|\s)((?:op|st|eb|prb)-?\d{2}-?\d{3}|p-\d{3})(?=\s|$)/i.exec(q);
  if (!m) return { number: null, rest: q };
  return { number: numberQuery(m[1]), rest: (q.slice(0, m.index) + " " + q.slice(m.index + m[0].length)).trim() };
}

// Nicknames → the word that is in the card's printed name. Each maps to ONE
// distinctive name word, so "big mom" finds both "Charlotte Linlin" and
// "Kaido & Linlin". The original words are always tried as well, so an alias
// can only add results, never remove one.
export const ALIASES: Record<string, string> = {
  "big mom": "linlin",
  blackbeard: "teach",
  "black beard": "teach",
  whitebeard: "newgate",
  "white beard": "newgate",
  doffy: "doflamingo",
  akainu: "sakazuki",
  aokiji: "kuzan",
  kizaru: "borsalino",
  fujitora: "issho",
  ryokugyu: "aramaki",
  eneru: "enel",
  "red hair": "shanks",
  "red haired": "shanks",
  "pirate hunter": "zoro",
  "fire fist": "ace",
  "straw hat": "luffy",
  strawhat: "luffy",
  "captain kid": "kid",
  "secret rare": "sec",
  "super rare": "sr",
  "treasure rare": "tr",
  "leader card": "leader",
};

/** The query plus every alias rewrite of it (normalised). */
export function queryVariants(q: string): string[] {
  const base = norm(q);
  const out = new Set<string>([base]);
  const padded = ` ${base} `;
  for (const [alias, to] of Object.entries(ALIASES)) {
    if (padded.includes(` ${alias} `)) out.add(` ${padded.replace(` ${alias} `, ` ${to} `)} `.replace(/\s+/g, " ").trim());
  }
  return [...out].filter(Boolean);
}

export function haystack(c: CardLite, set: SetLite | undefined): string {
  return norm(
    [
      c.name,
      c.number ?? "",
      (c.number ?? "").replace("-", ""),
      c.variant ?? "",
      c.printing === "standard" ? "" : c.printing,
      c.rarity ?? "",
      c.cardType ?? "",
      set?.code ?? "",
      set?.name ?? "",
    ].join(" "),
  );
}

/** Does every word of `words` match `tokens` (word-start, or inside a word for 4+ letters)? */
export function wordsMatch(words: string[], tokens: string[], text: string): boolean {
  return words.every((w) => tokens.some((t) => t.startsWith(w)) || (w.length >= 4 && text.includes(w)));
}

/** Score one card for one normalised query; null = no match. Higher is better. */
export function scoreCard(c: CardLite, set: SetLite | undefined, qn: string): number | null {
  const words = qn.split(" ").filter(Boolean);
  if (!words.length) return null;
  const h = haystack(c, set);
  const tokens = h.split(" ");
  const name = norm(c.name);
  const qs = qn.replace(/ /g, "");
  let matched = wordsMatch(words, tokens, h);
  // "monkeydluffy", "eustass captainkid": the squashed query inside the squashed name.
  if (!matched && qs.length >= 4 && name.replace(/ /g, "").includes(qs)) matched = true;
  if (!matched) return null;
  let s = 0;
  if (name === qn) s += 100;
  else if (name.startsWith(qn)) s += 60;
  else if (name.includes(qn)) s += 30;
  else if (name.replace(/ /g, "").includes(qs)) s += 25;
  // Words that hit the NAME (not just set or printing text) are worth more.
  const nameTokens = name.split(" ");
  s += 6 * words.filter((w) => nameTokens.some((t) => t.startsWith(w))).length;
  if (c.printing === "standard") s += 5;
  s += Math.min(20, Math.log10((c.marketUsd ?? 0) + 1) * 5);
  return s;
}

export function searchCards(cards: CardLite[], setById: Map<number, SetLite>, q: string, limit = Infinity): CardLite[] {
  const { number, rest } = splitNumber(q);
  if (number) {
    const restN = norm(rest);
    const words = restN.split(" ").filter(Boolean);
    return cards
      .filter((c) => c.number === number)
      .filter((c) => {
        if (!words.length) return true;
        const h = haystack(c, setById.get(c.setId));
        return wordsMatch(words, h.split(" "), h);
      })
      .sort((a, b) => (a.printing === "standard" ? -1 : 0) - (b.printing === "standard" ? -1 : 0) || (b.marketUsd ?? 0) - (a.marketUsd ?? 0))
      .slice(0, limit);
  }
  // A community nickname for an exact printing ranks that card first.
  const aliased = new Set(slugsForAlias(q));
  const variants = queryVariants(q);
  if (!variants.length && !aliased.size) return [];
  const scored: { c: CardLite; s: number }[] = [];
  for (const c of cards) {
    const set = setById.get(c.setId);
    let best: number | null = null;
    for (const v of variants) {
      const s = scoreCard(c, set, v);
      if (s != null && (best == null || s > best)) best = s;
    }
    if (aliased.has(c.slug)) best = Number.MAX_SAFE_INTEGER;
    if (best != null) scored.push({ c, s: best });
  }
  return scored.sort((a, b) => b.s - a.s || a.c.id - b.c.id).slice(0, limit).map((x) => x.c);
}

/** Damerau-Levenshtein (optimal string alignment) distance, capped: returns cap+1 once it is exceeded. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > cap) return cap + 1;
  }
  return d[a.length][b.length];
}

/**
 * "Did you mean …?" for a query that matched nothing: up to `limit` distinct
 * card names whose name (or one of its words) is within a small edit distance
 * of the query (or of each query word), closest first and, among equals, the
 * name with the most printings. Real names only — never invented.
 */
export function suggestNames(names: Iterable<string>, q: string, limit = 3): string[] {
  const qn = norm(q);
  if (qn.length < 3) return [];
  const qWords = qn.split(" ").filter((w) => w.length >= 3);
  const allowed = (len: number) => (len <= 4 ? 1 : len <= 8 ? 2 : 3);
  const hits: { name: string; d: number; n: number }[] = [];
  // How many printings carry each name: the better-known card wins a tie.
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  for (const [name, n] of counts) {
    const nn = norm(name);
    if (!nn) continue;
    let best = editDistance(qn, nn, allowed(qn.length));
    if (best > allowed(qn.length)) {
      // Word by word: every query word close to some name word.
      const nWords = nn.split(" ");
      let total = 0;
      let ok = qWords.length > 0;
      for (const w of qWords) {
        let wb = Infinity;
        for (const t of nWords) wb = Math.min(wb, editDistance(w, t, allowed(w.length)));
        if (wb > allowed(w.length)) {
          ok = false;
          break;
        }
        total += wb;
      }
      if (!ok || total === 0) continue;
      best = total;
    }
    if (best === 0) continue;
    hits.push({ name, d: best, n });
  }
  return hits
    .sort((a, b) => a.d - b.d || b.n - a.n || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((h) => h.name);
}
