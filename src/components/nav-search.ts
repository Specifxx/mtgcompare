import { NAV_GROUPS, type NavGroupLink } from "./nav-groups";

// ─────────────────────────────────────────────────────────────────────────────
// SEARCHING THE FEATURE LIST
// ─────────────────────────────────────────────────────────────────────────────
// Shared by the ⌘K command launcher (CommandLauncher.tsx) and the phone menu
// overlay (CinematicNavMenu.tsx). It lives in its own module for two reasons:
// those two are the site's only "find a page" surfaces and must behave
// identically, and a plain module can be unit-tested (tests/nav-search.test.ts)
// while a "use client" component cannot easily be.
//
// WHAT WAS WRONG. The launcher matched on `label.toLowerCase().includes(query)`
// and nothing else, which fails in the two ways a visitor notices immediately:
//
//   1. PLURALS EMPTY THE PANEL. "price" matched (via "Bulk Pricer") but "prices"
//      matched nothing; "deal" found the Deal Finder, "deals" found nothing.
//      Typing one more letter of a correct word making every result vanish is
//      what "the search bar is broken" means.
//   2. LABELS ARE WRITTEN TO BE READ, NOT SEARCHED. "blog" (labelled "News &
//      analysis"), "alerts" (labelled "My Watchlist"), "champion", "set" and
//      "faq" all returned nothing, for pages we have. Group titles were not
//      searched at all, so the word "Prices" — a heading visible in the panel
//      the visitor is looking at — matched nothing.
//
// The fix is a token-prefix match over a wider haystack (label + group title +
// the words in the href + explicit keywords), with a crude stemmer so singular
// and plural are the same query.
//
// OVER-MATCHING is the failure mode in the other direction, and a panel that
// returns everything is no more useful than one that returns nothing. Three
// things hold it back: stop words are dropped from the query, every remaining
// token must match (AND, not OR), and matching is by PREFIX, never by substring
// — so each further character can only narrow the result set, never widen it.

/**
 * Crude plural stem: "prices" → "price", "deals" → "deal". Length-guarded so
 * short words are left alone ("sets" → "set" is wanted, "is" → "i" is not) and
 * so double-s words ("class", "loss") survive intact.
 */
export function stem(word: string): string {
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export const words = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);

// Dropped from the QUERY only, never from the index. People type questions
// ("how do i sell my cards", "where are the best decks"); every one of these
// words would otherwise have to appear in a link's haystack for the query to
// match anything at all.
const STOP = new Set([
  "a", "an", "and", "are", "at", "be", "best", "by", "can", "do", "does", "for", "from",
  "get", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "the", "to", "what",
  "when", "where", "which", "who", "why", "with", "you", "your",
]);

export interface IndexedLink extends NavGroupLink {
  group: string;
  /** Every searchable word, stemmed and deduped. */
  haystack: string[];
  /** The label's own words, stemmed — used for ranking, not matching. */
  labelWords: string[];
  labelLower: string;
  /** Raw lower-cased keyword phrases, for whole-query phrase matching. */
  phrases: string[];
}

// Built once at module load: NAV_GROUPS is a static array, so re-deriving this
// on every keystroke would be pure waste.
export const NAV_INDEX: IndexedLink[] = NAV_GROUPS.flatMap((g) =>
  g.links.map((l) => {
    const labelWords = words(l.label).map(stem);
    const rest = [...words(g.title), ...words(l.href), ...(l.keywords ?? []).flatMap(words)].map(stem);
    return {
      ...l,
      group: g.title,
      labelWords,
      labelLower: l.label.toLowerCase(),
      phrases: (l.keywords ?? []).map((k) => k.toLowerCase()),
      haystack: Array.from(new Set([...labelWords, ...rest])),
    };
  })
);

/**
 * Query → stemmed tokens, stop words removed. A query made ENTIRELY of stop
 * words ("what is the") keeps them rather than collapsing to nothing, so it
 * narrows to something instead of silently showing the whole index.
 */
export function queryTokens(query: string): string[] {
  const all = words(query).map(stem);
  const kept = all.filter((t) => !STOP.has(t));
  return kept.length ? kept : all;
}

/**
 * Rank, best first: exact label, label prefix, every token hits a label word, a
 * keyword phrase containing the WHOLE query, then anything else (group title,
 * path, a keyword hit token-by-token). Ties keep NAV_GROUPS order.
 *
 * The phrase tier is what makes multi-word intent queries land. "how to play"
 * loses "how" and "to" to the stop list, leaving just "play" — which /games
 * ("play") matches as readily as /learn ("how to play"), and /games sorts first.
 * Comparing the untokenised query against the raw keyword phrase puts the page
 * that actually answers the question on top.
 */
function rankOf(link: IndexedLink, query: string, tokens: string[]): number {
  if (link.labelLower === query) return 0;
  if (link.labelLower.startsWith(query)) return 1;
  if (tokens.every((t) => link.labelWords.some((w) => w.startsWith(t)))) return 2;
  if (link.phrases.some((k) => k.includes(query))) return 3;
  return 4;
}

/** Every feature matching `query`, best first. An empty query returns them all. */
export function searchNav(query: string): IndexedLink[] {
  const q = query.trim().toLowerCase();
  if (!q) return NAV_INDEX;
  const tokens = queryTokens(q);
  if (!tokens.length) return NAV_INDEX;
  return NAV_INDEX.map((l, i) => ({ l, i, rank: rankOf(l, q, tokens) }))
    .filter(({ l }) => tokens.every((t) => l.haystack.some((w) => w.startsWith(t))))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.l);
}
