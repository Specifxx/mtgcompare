// NEW SETS FIND THEMSELVES (2026-11-03). Every sealed import first reads Scryfall's set list (scripts/discover-sets.ts) and
// keeps the English paper releases due in the next DISCOVER_AHEAD_DAYS days in data/sets/discovered.json. lib/sets.ts adds
// those to SETS, so from that import on the importer files the new set's store pre-orders under it, and the pages that already
// follow SETS (the pre-order page, the homepage's Coming soon block, the release calendar, the set page, the sitemap) appear by
// themselves on the next release. A set hand-written into lib/sets.ts always wins: its row replaces the discovered one.
//
// Facts only, and refuse rather than guess:
// - The name and release date are Scryfall's (Wizards' announced street date). A later read moves the date; the slug is the
//   one first written and never changes, because it is a live URL.
// - The series comes from Scryfall's set type; an expansion is "Universes Beyond" only once Scryfall's previewed cards carry
//   the triangle security stamp (most of them), else "Standard".
// - A set whose name is part of an existing set's name ("Marvel" inside "Marvel Super Heroes") is left out and reported: a bare
//   title would then flip from the old set to the new one, and wrongly merging two products is worse than missing one. Such a
//   set is added to lib/sets.ts by hand, with a pattern.
//
// Pure: no network, no file access (the script does both), so tests/set-discovery.test.ts checks every rule directly.
import type { BoosterLine } from "./sets";

/** The fields of a Scryfall set object (https://scryfall.com/docs/api/sets) this reads. */
export interface ScryfallSet {
  code: string;
  name: string;
  set_type: string;
  released_at?: string | null;
  digital?: boolean;
  parent_set_code?: string | null;
  card_count?: number;
}

export interface DiscoveredSet {
  code: string;
  name: string;
  /** URL slug, fixed when first discovered. */
  slug: string;
  releaseDate: string;
  series: string;
  boosters?: BoosterLine[];
  /** Scryfall's set_type, kept to explain the series. */
  scryfallType: string;
  /** First day an import saw it (YYYY-MM-DD). */
  firstSeen: string;
}

/** How far ahead a set is taken: stores open pre-orders two to three months out; further ahead a page would have no prices. */
export const DISCOVER_AHEAD_DAYS = 180;
/** A set released up to this long ago is still taken (an import that missed it, or a date Scryfall moved back). */
export const DISCOVER_BEHIND_DAYS = 60;

// Set types that are sold as sealed product of their own. Left out: commander decks of a main set (they carry parent_set_code and are
// filed under the main set), Secret Lair ("box"), promos, tokens, Alchemy/digital, memorabilia, From the Vault, Spellbooks, duel
// decks, starter and premium decks.
const SEALED_TYPES = new Set(["expansion", "core", "masters", "draft_innovation", "commander", "funny"]);

const PLAY: BoosterLine[] = ["play", "collector"];

/** "Magic: The Gathering | Star Trek" or "Universes Beyond: Fallout" → "Star Trek", "Fallout". */
export function cleanSetName(name: string): string {
  return name
    .replace(/^\s*magic\s*:?\s*the\s*gathering\s*[|—–\-:]\s*/i, "")
    .replace(/^\s*universes\s*beyond\s*[:|—–\-]\s*/i, "")
    .trim();
}

/** The same slug lib/sets.ts gives a hand-written set. */
export function setSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Words of a name, for the "is this name inside another set's name" check. */
function words(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && w !== "the");
}

/** `inner`'s words appear, in order and together, inside `outer`'s. */
export function nameInside(inner: string, outer: string): boolean {
  const a = words(inner);
  const b = words(outer);
  if (!a.length || a.length > b.length) return false;
  for (let i = 0; i + a.length <= b.length; i++) if (a.every((w, j) => b[i + j] === w)) return true;
  return false;
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Series from Scryfall's set type (and, for an expansion, whether its cards are Universes Beyond). */
export function seriesOf(s: Pick<ScryfallSet, "set_type" | "name">, universesBeyond: boolean): string {
  const name = cleanSetName(s.name);
  if (s.set_type === "masters" || /\bhorizons\b/i.test(name)) return "Masters & Horizons";
  if (s.set_type === "commander") return "Commander";
  if (s.set_type === "draft_innovation" || s.set_type === "funny") return "Supplemental";
  return universesBeyond ? "Universes Beyond" : "Standard";
}

/** The booster lines a new set is read with: Play and Collector since 2024, Jumpstart for a Jumpstart release, none for a Commander-only one. */
export function boostersOf(s: Pick<ScryfallSet, "set_type" | "name">): BoosterLine[] | undefined {
  if (/\bjump\s*start\b/i.test(s.name)) return ["jumpstart"];
  if (s.set_type === "commander") return undefined;
  return PLAY;
}

export interface Candidate {
  set: ScryfallSet;
  name: string;
}

export interface Skip {
  code: string;
  name: string;
  why: string;
}

/**
 * The Scryfall sets worth a look: paper, top-level, a sealed set type, released within the window around `today`, and not already
 * known by code or by slug. `known` is every hand-written set (code, name, slug).
 */
export function candidates(
  all: readonly ScryfallSet[],
  known: readonly { code: string; name: string; slug: string }[],
  today: string,
): { take: Candidate[]; skipped: Skip[] } {
  const from = addDays(today, -DISCOVER_BEHIND_DAYS);
  const to = addDays(today, DISCOVER_AHEAD_DAYS);
  const codes = new Set(known.map((k) => k.code));
  const slugs = new Set(known.map((k) => k.slug));
  const take: Candidate[] = [];
  const skipped: Skip[] = [];
  for (const s of all) {
    const date = s.released_at ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < from || date > to) continue;
    if (s.digital || s.parent_set_code || !SEALED_TYPES.has(s.set_type)) continue;
    const code = s.code.toLowerCase();
    if (codes.has(code)) continue;
    const name = cleanSetName(s.name);
    if (name.length < 4) {
      skipped.push({ code, name, why: "name too short to match a store title safely" });
      continue;
    }
    if (slugs.has(setSlug(name))) {
      skipped.push({ code, name, why: "a known set already has this name" });
      continue;
    }
    const inside = known.find((k) => nameInside(name, k.name));
    if (inside) {
      skipped.push({ code, name, why: `its name is part of ${inside.name}'s: add it to lib/sets.ts by hand, with a pattern` });
      continue;
    }
    take.push({ set: { ...s, code }, name });
  }
  return { take, skipped };
}

/**
 * The new discovered list: each candidate (with whether its cards are Universes Beyond, null = unknown) merged over what the file
 * held. A set keeps its first slug and first-seen day; its date and series follow Scryfall. A set Scryfall no longer lists, or a
 * code now hand-written into lib/sets.ts, is dropped (lib/sets.ts would ignore it anyway).
 */
export function mergeDiscovered(
  previous: readonly DiscoveredSet[],
  take: readonly Candidate[],
  universesBeyond: ReadonlyMap<string, boolean | null>,
  allCodes: ReadonlySet<string>,
  knownCodes: ReadonlySet<string>,
  today: string,
): DiscoveredSet[] {
  const prev = new Map(previous.map((d) => [d.code, d]));
  const out = new Map<string, DiscoveredSet>();
  for (const { set, name } of take) {
    const before = prev.get(set.code);
    const ub = universesBeyond.get(set.code);
    // Unknown (no previewed cards yet, or the lookup failed): keep what an earlier read found.
    const isUb = ub ?? before?.series === "Universes Beyond";
    const boosters = boostersOf({ ...set, name });
    out.set(set.code, {
      code: set.code,
      name,
      slug: before?.slug ?? setSlug(name),
      releaseDate: set.released_at!,
      series: seriesOf(set, isUb),
      ...(boosters ? { boosters } : {}),
      scryfallType: set.set_type,
      firstSeen: before?.firstSeen ?? today,
    });
  }
  // Out of the window (it released over DISCOVER_BEHIND_DAYS ago) but still listed by Scryfall: keep it, the set page stays.
  for (const d of previous) if (!out.has(d.code) && allCodes.has(d.code) && !knownCodes.has(d.code)) out.set(d.code, d);
  return [...out.values()].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.code.localeCompare(b.code));
}

/** A set's cards are Universes Beyond when at least half carry the triangle security stamp; null when none are previewed yet. */
export function isUniversesBeyond(total: number, triangle: number): boolean | null {
  if (total <= 0) return null;
  return triangle * 2 >= total;
}
