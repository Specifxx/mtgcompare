// How many booster packs a sealed product holds, so a price can be shown per pack: the number buyers compare a Play Booster Box
// and a Bundle on. Current-state arithmetic only: no history is involved.
//
// Only products whose pack count is fixed by the product line AND known to us get a number; everything else returns null rather
// than a guess (CLAUDE.md: never invent a pack count). Mixed-pack products (Gift Bundles, Draft Night, Prerelease Packs: Play
// Boosters plus a Collector Booster or a promo) have no honest per-pack price and return null.
//
// Sources, per line:
//   - Play Booster Box: 36 packs from Murders at Karlov Manor (2024) to Innistrad Remastered (January 2025); 30 from Aetherdrift
//     (February 2025) on. Stores' descriptions read 2026-10-21: Duskmourn, Foundations and Innistrad Remastered "36", Aetherdrift
//     "30"; Wizards' Collecting Star Trek article (read 2026-10-16): "30 boosters to a box".
//   - Collector Booster Box: 12 packs (Wizards' Collecting Star Trek article; stores' descriptions for Forgotten Realms and Final
//     Fantasy). Masters-style sets sold smaller collector displays (Double Masters, Commander Masters), so those get none.
//   - Draft Booster Box: 36 packs (Dominaria United's description); the Commander Legends, Masters 25 and Ultimate Masters
//     style displays held 24, and are left out rather than guessed per set.
//   - Set Booster Box: 30 packs (March of the Machine's description).
//   - Jumpstart Booster Box: 24 packs (Innistrad: Double Feature's and the Jumpstart displays). UNCERTAIN for the newest sets, so
//     only the dedicated Jumpstart releases get a number.
//   - Bundle: 9 Play Boosters in the Play Booster era (Wizards' Collecting Star Trek article). Older bundles held Draft or Set
//     Boosters in counts that changed over the years, so they get none.
import { SET_BY_CODE } from "./sets";
import { TYPE_BY_LABEL, type TypeKey } from "./sealed-title";

/** The first set sold in Play Boosters, and the first whose Play Booster Box holds 30. */
const PLAY_ERA = "2024-02-09";
const THIRTY_PACK_PLAY_BOX = "2025-02-14";
// Draft and collector displays of these sets are not the usual size: no number rather than a wrong one.
const ODD_DISPLAYS = new Set(["cmr", "clb", "cmm", "2xm", "2x2", "a25", "uma", "bbd", "dbl"]);
const JUMPSTART_RELEASES = new Set(["jmp", "j22", "j25"]);

/** Packs in one unit of the product, or null when the line doesn't fix it (or we can't confirm it). */
export function packsFor(type: TypeKey, setCode: string | null, name = ""): number | null {
  void name;
  const set = setCode ? SET_BY_CODE.get(setCode) ?? null : null;
  switch (type) {
    case "play-booster":
    case "collector-booster":
    case "draft-booster":
    case "set-booster":
    case "jumpstart-booster":
      return 1;
    case "play-booster-box":
      if (!set) return null;
      return set.releaseDate >= THIRTY_PACK_PLAY_BOX ? 30 : 36;
    case "collector-booster-box":
      return set && !ODD_DISPLAYS.has(set.code) ? 12 : null;
    case "draft-booster-box":
      return set && !ODD_DISPLAYS.has(set.code) ? 36 : null;
    case "set-booster-box":
      return set && !ODD_DISPLAYS.has(set.code) ? 30 : null;
    case "jumpstart-booster-box":
      return set && JUMPSTART_RELEASES.has(set.code) ? 24 : null;
    case "bundle":
      return set && set.releaseDate >= PLAY_ERA && set.boosters?.includes("play") ? 9 : null;
    default:
      return null; // gift bundles, Draft Night, prerelease packs, decks, Secret Lair, cases: mixed or unconfirmed
  }
}

/** packsFor() by the product type LABEL a Product row carries ("Play Booster Box"). */
export function packsForLabel(typeLabel: string, setCode: string | null, name = ""): number | null {
  const t = TYPE_BY_LABEL.get(typeLabel);
  return t ? packsFor(t.key, setCode, name) : null;
}

/** Price per pack in cents, rounded, or null. */
export function perPackCents(priceCents: number | null | undefined, packs: number | null): number | null {
  if (!packs || !priceCents || priceCents <= 0) return null;
  return Math.round(priceCents / packs);
}
