// Box worth (expected value) pages: the published odds of one booster line, written as data (src/content/box-odds/<set>.ts).
//
// THE RULE (owner, 2026-11-26; DECISIONS.md "Box worth: published odds only"): every percentage here is copied from Wizards'
// own "Collecting <set>" article, with the article's URL and the day it was read. Nothing is guessed:
//   - an outcome Wizards prints as "less than 1%" is kept, marked `lt1`, and counted at ZERO, so the estimate is a floor;
//   - a slot Wizards names the pool of but prints no odds for (the commons, most uncommon slots) is one outcome at 100% with
//     `pool: true`: each card in the pool is counted as equally likely, and the page says so;
//   - an outcome whose cards we can't single out in TCGplayer's list (a sub-sheet with no tag or number range we can name)
//     is kept with `pick: null` and counted at zero, listed on the page as "not counted".
// Within an outcome every card is equally likely (Wizards prints the outcome's odds, not each card's).

/** Which cards an outcome draws from: TCGplayer's cards of one group (lib/cards.ts set files), filtered. */
export interface Pick {
  /** The card set file (data/cards/sets/<g>.json). Defaults to the set's main group. */
  g?: string;
  /** Rarity letters allowed ("R", "RM", "C"…), TCGplayer's. */
  r: string;
  /**
   * The card name's treatment tags, joined exactly as TCGplayer prints them, collector-number tags left out:
   * "" for a default-frame card, "(Borderless)", "(Showcase)(Surge Foil)"… A list allows any of them.
   */
  t: string | string[];
  /** Collector-number ranges, inclusive ("277-286", "305"). Absent: any number. */
  n?: string[];
  /** Name filter (a RegExp source, case-insensitive), for a sheet the tags and numbers can't separate. */
  name?: string;
  /** Leave these names out (RegExp source). */
  not?: string;
  /** The card is foil in this outcome: price it by TCGplayer's foil price. */
  foil?: boolean;
}

export interface Outcome {
  /** Wizards' wording, shortened: "Rare, main set", "Borderless triumphant mythic rare". */
  label: string;
  /** The printed percentage of this slot (0 when the article says "less than 1%"). */
  pct: number;
  /** Printed as "less than 1%": counted at zero. */
  lt1?: true;
  /** The article names the pool but prints no odds: each card in the pool equally likely. */
  pool?: true;
  /** The cards; null when we can't single them out in TCGplayer's list (counted at zero, shown as not counted). */
  pick: Pick | null;
  /** How many cards Wizards says the outcome holds, when printed: the tests hold the pick to it. */
  count?: number;
}

export interface Slot {
  /** "Rare or mythic rare", "Traditional foil, any rarity". */
  label: string;
  /** How many cards of a booster this slot fills (6 commons = 6). */
  count: number;
  outcomes: Outcome[];
  /**
   * Percentage points the article's own list leaves unaccounted for (its lines sum short of 100 by more than rounding). Kept as
   * printed: the gap is counted as nothing, like a "less than 1%" line.
   */
  unprinted?: number;
}

export interface BoosterOdds {
  /** Packs in one box. */
  packs: number;
  slots: Slot[];
}

export interface SetOdds {
  /** lib/sets.ts code. */
  code: string;
  /** The Wizards article the numbers are copied from. */
  source: string;
  /** Its title, for the citation. */
  sourceTitle: string;
  /** The day we read it (YYYY-MM-DD). */
  read: string;
  play?: BoosterOdds;
  collector?: BoosterOdds;
}

export type BoxKind = "play" | "collector";
