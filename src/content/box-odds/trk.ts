// Star Trek: Wizards' "Collecting Star Trek" (20 October 2026), read 2026-11-26. Every percentage is the article's.
// TCGplayer's numbers per treatment, checked against the article's counts (tests/box-ev.test.ts):
//   borderless lands 332-337 (5 rare, 1 mythic); scene 338-362 (10 uncommon, 8 rare, 7 mythic); LCARS frame 363-391 (7 uncommon,
//   14 rare, 8 mythic); LCARS shock lands 392-401 (10 rare); classic Enterprise 402-425 (5 uncommon, 13 rare, 6 mythic); Klingon
//   frame 426-435 (1 common, 6 uncommon, 3 rare); Klingon script 436-445; extended art 446-481 (28 rare, 8 mythic); surge foil
//   LCARS shock lands 487-496, LCARS frame 497-525, classic Enterprise 526-549. Stardates (SDS) is its own TCGplayer group.
// Not singled out (counted at zero, listed on the page): the holodeck and away team basic lands (TCGplayer's basic land numbers
// don't say which art is which), the Scene Box (TRC) rares, and the six new-to-Magic borderless Commander rares (TCGplayer lists
// 18 borderless Commander rares; the article names 6).
import type { SetOdds } from "@/lib/box-ev/types";

const SDS = "star-trek-stardates";
const TRC = "commander-star-trek";
const MAIN = ["1-306"];
const BL_LAND = ["332-337"];
const SCENE = ["338-362"];
const LCARS = ["363-391"];
const SHOCK = ["392-401"];
const CLASSIC = ["402-425"];
const KLINGON = ["426-435"];
const SCRIPT = ["436-445"];

export const TRK: SetOdds = {
  code: "trk",
  source: "https://magic.wizards.com/en/news/feature/collecting-star-trek",
  sourceTitle: "Collecting Star Trek",
  read: "2026-11-26",
  play: {
    packs: 30,
    slots: [
      {
        label: "Commons",
        count: 6,
        outcomes: [
          { label: "Common", pct: 97.1, pool: true, count: 81, pick: { r: "C", t: "", n: MAIN } },
          { label: "Klingon frame common", pct: 2.9, count: 1, pick: { r: "C", t: "(Showcase)", n: KLINGON } },
        ],
      },
      {
        label: "Common or Stardates card",
        count: 1,
        outcomes: [
          { label: "Common", pct: 96, pool: true, count: 81, pick: { r: "C", t: "", n: MAIN } },
          { label: "Stardates card", pct: 4, count: 30, pick: { g: SDS, r: "M", t: "(Borderless)" } },
        ],
      },
      {
        label: "Uncommons",
        count: 3,
        outcomes: [
          { label: "Uncommon", pct: 78.1, pool: true, count: 110, pick: { r: "U", t: "", n: MAIN } },
          { label: "Scene uncommon", pct: 7.7, count: 10, pick: { r: "U", t: "(Borderless)", n: SCENE } },
          { label: "LCARS frame uncommon", pct: 4.6, count: 7, pick: { r: "U", t: "(Showcase)", n: LCARS } },
          { label: "Classic Enterprise uncommon", pct: 4.6, count: 5, pick: { r: "U", t: "(Showcase)", n: CLASSIC } },
          { label: "Klingon frame uncommon", pct: 5, count: 6, pick: { r: "U", t: "(Showcase)", n: KLINGON } },
        ],
      },
      {
        label: "Wildcard",
        count: 1,
        outcomes: [
          { label: "Common", pct: 20.8, count: 81, pick: { r: "C", t: "", n: MAIN } },
          { label: "Uncommon", pct: 54.1, count: 110, pick: { r: "U", t: "", n: MAIN } },
          { label: "Rare", pct: 16.7, count: 80, pick: { r: "R", t: "", n: MAIN } },
          { label: "Mythic rare", pct: 2.6, count: 25, pick: { r: "M", t: "", n: MAIN } },
          { label: "Klingon frame uncommon", pct: 1, pick: { r: "U", t: "(Showcase)", n: KLINGON } },
          { label: "Klingon frame common or rare", pct: 0, lt1: true, pick: { r: "CR", t: "(Showcase)", n: KLINGON } },
          { label: "Scene uncommon", pct: 1.5, pick: { r: "U", t: "(Borderless)", n: SCENE } },
          { label: "Scene rare or mythic", pct: 0, lt1: true, pick: { r: "RM", t: "(Borderless)", n: SCENE } },
          { label: "LCARS frame uncommon", pct: 1, pick: { r: "U", t: "(Showcase)", n: LCARS } },
          { label: "LCARS frame rare or mythic", pct: 0, lt1: true, pick: { r: "RM", t: "(Showcase)", n: LCARS } },
          { label: "Classic Enterprise rare or mythic", pct: 0, lt1: true, pick: { r: "RM", t: "(Showcase)", n: CLASSIC } },
          { label: "Borderless land", pct: 0, lt1: true, pick: { r: "RM", t: "(Borderless)", n: BL_LAND } },
          { label: "LCARS shock land", pct: 0, lt1: true, pick: { r: "R", t: "(Showcase)", n: SHOCK } },
        ],
      },
      {
        label: "Rare or mythic rare",
        count: 1,
        outcomes: [
          { label: "Rare", pct: 80.1, count: 80, pick: { r: "R", t: "", n: MAIN } },
          { label: "Mythic rare", pct: 12.4, count: 25, pick: { r: "M", t: "", n: MAIN } },
          { label: "Klingon frame rare", pct: 0, lt1: true, pick: { r: "R", t: "(Showcase)", n: KLINGON } },
          { label: "Scene rare", pct: 1, count: 8, pick: { r: "R", t: "(Borderless)", n: SCENE } },
          { label: "Scene mythic", pct: 0, lt1: true, pick: { r: "M", t: "(Borderless)", n: SCENE } },
          { label: "LCARS frame rare", pct: 1.8, count: 14, pick: { r: "R", t: "(Showcase)", n: LCARS } },
          { label: "LCARS frame mythic", pct: 0, lt1: true, pick: { r: "M", t: "(Showcase)", n: LCARS } },
          { label: "Classic Enterprise rare", pct: 1.5, count: 13, pick: { r: "R", t: "(Showcase)", n: CLASSIC } },
          { label: "Classic Enterprise mythic", pct: 0, lt1: true, pick: { r: "M", t: "(Showcase)", n: CLASSIC } },
          { label: "Borderless rare land", pct: 1, count: 5, pick: { r: "R", t: "(Borderless)", n: BL_LAND } },
          { label: "Borderless mythic land", pct: 0, lt1: true, pick: { r: "M", t: "(Borderless)", n: BL_LAND } },
          { label: "LCARS shock land", pct: 1.4, count: 10, pick: { r: "R", t: "(Showcase)", n: SHOCK } },
        ],
      },
      {
        label: "Traditional foil",
        count: 1,
        outcomes: [
          { label: "Foil common", pct: 51.2, pick: { r: "C", t: "", n: MAIN, foil: true } },
          { label: "Foil uncommon", pct: 34.7, pick: { r: "U", t: "", n: MAIN, foil: true } },
          { label: "Foil rare", pct: 6.3, pick: { r: "R", t: "", n: MAIN, foil: true } },
          { label: "Foil mythic rare", pct: 1, pick: { r: "M", t: "", n: MAIN, foil: true } },
          { label: "Foil Klingon frame uncommon", pct: 1, pick: { r: "U", t: "(Showcase)", n: KLINGON, foil: true } },
          { label: "Foil Klingon frame common or rare", pct: 0, lt1: true, pick: { r: "CR", t: "(Showcase)", n: KLINGON, foil: true } },
          { label: "Foil scene uncommon", pct: 1.6, pick: { r: "U", t: "(Borderless)", n: SCENE, foil: true } },
          { label: "Foil scene rare or mythic", pct: 0, lt1: true, pick: { r: "RM", t: "(Borderless)", n: SCENE, foil: true } },
          { label: "Foil LCARS frame uncommon", pct: 1.1, pick: { r: "U", t: "(Showcase)", n: LCARS, foil: true } },
          { label: "Foil LCARS frame rare or mythic", pct: 0, lt1: true, pick: { r: "RM", t: "(Showcase)", n: LCARS, foil: true } },
          { label: "Foil classic Enterprise rare or mythic", pct: 0, lt1: true, pick: { r: "RM", t: "(Showcase)", n: CLASSIC, foil: true } },
          { label: "Foil borderless land", pct: 0, lt1: true, pick: { r: "RM", t: "(Borderless)", n: BL_LAND, foil: true } },
          { label: "Foil LCARS shock land", pct: 0, lt1: true, pick: { r: "R", t: "(Showcase)", n: SHOCK, foil: true } },
        ],
      },
      {
        label: "Land",
        count: 1,
        outcomes: [
          { label: "Common dual land", pct: 40, count: 10, pick: { r: "L", t: "", n: ["275-305"], not: "^(Plains|Island|Swamp|Mountain|Forest)\\b" } },
          { label: "Foil common dual land", pct: 10, pick: { r: "L", t: "", n: ["275-305"], not: "^(Plains|Island|Swamp|Mountain|Forest)\\b", foil: true } },
          { label: "Basic land", pct: 26.7, count: 10, pick: { r: "L", t: "", n: ["307-316"] } },
          { label: "Foil basic land", pct: 6.7, pick: { r: "L", t: "", n: ["307-316"], foil: true } },
          { label: "Holodeck basic land", pct: 6.7, pick: null },
          { label: "Foil holodeck basic land", pct: 1.7, pick: null },
          { label: "Away team basic land", pct: 6.7, pick: null },
          { label: "Foil away team basic land", pct: 1.7, pick: null },
        ],
      },
    ],
  },
  collector: {
    packs: 12,
    slots: [
      {
        label: "Foil commons",
        count: 5,
        outcomes: [
          { label: "Foil common", pct: 89, count: 81, pick: { r: "C", t: "", n: MAIN, foil: true } },
          { label: "Foil common dual land", pct: 11, count: 10, pick: { r: "L", t: "", n: ["275-305"], not: "^(Plains|Island|Swamp|Mountain|Forest)\\b", foil: true } },
        ],
      },
      { label: "Foil uncommons", count: 3, outcomes: [{ label: "Foil uncommon", pct: 100, pool: true, count: 110, pick: { r: "U", t: "", n: MAIN, foil: true } }] },
      {
        label: "Foil Booster Fun common or uncommon",
        count: 1,
        outcomes: [
          { label: "Foil Klingon frame common", pct: 2.7, pick: { r: "C", t: "(Showcase)", n: KLINGON, foil: true } },
          { label: "Foil Klingon script common", pct: 1.4, count: 1, pick: { r: "C", t: "(Showcase)(Klingon)", n: SCRIPT, foil: true } },
          { label: "Foil Klingon frame uncommon", pct: 16.1, pick: { r: "U", t: "(Showcase)", n: KLINGON, foil: true } },
          { label: "Foil Klingon script uncommon", pct: 8.1, count: 6, pick: { r: "U", t: "(Showcase)(Klingon)", n: SCRIPT, foil: true } },
          { label: "Foil scene uncommon", pct: 26.9, pick: { r: "U", t: "(Borderless)", n: SCENE, foil: true } },
          { label: "Foil LCARS frame uncommon", pct: 18.9, pick: { r: "U", t: "(Showcase)", n: LCARS, foil: true } },
          { label: "Foil classic Enterprise uncommon", pct: 13.5, pick: { r: "U", t: "(Showcase)", n: CLASSIC, foil: true } },
          { label: "Surge foil LCARS frame uncommon", pct: 7.3, count: 7, pick: { r: "U", t: "(Showcase)(Surge Foil)", n: ["497-525"], foil: true } },
          { label: "Surge foil classic Enterprise uncommon", pct: 5.2, count: 5, pick: { r: "U", t: "(Showcase)(Surge Foil)", n: ["526-549"], foil: true } },
        ],
      },
      {
        label: "Foil basic land",
        count: 1,
        outcomes: [
          { label: "Foil away team basic land", pct: 33.3, pick: null },
          { label: "Surge foil away team basic land", pct: 33.3, pick: null },
          { label: "Foil holodeck basic land", pct: 33.3, pick: null },
        ],
      },
      {
        label: "Foil rare or mythic rare",
        count: 1,
        outcomes: [
          { label: "Foil rare", pct: 86.5, count: 80, pick: { r: "R", t: "", n: MAIN, foil: true } },
          { label: "Foil mythic rare", pct: 13.5, count: 25, pick: { r: "M", t: "", n: MAIN, foil: true } },
        ],
      },
      {
        label: "Star Trek Commander card",
        count: 1,
        outcomes: [
          { label: "Extended-art Commander rare", pct: 93.1, count: 197, pick: { g: TRC, r: "R", t: "(Extended Art)" } },
          { label: "Extended-art Commander mythic", pct: 2.1, count: 9, pick: { g: TRC, r: "M", t: "(Extended Art)" } },
          { label: "Borderless face commander", pct: 1, count: 4, pick: { g: TRC, r: "M", t: "(Borderless)", n: ["1-4"] } },
          { label: "Borderless new Commander rare", pct: 2.8, pick: null },
          { label: "Borderless new Commander mythic", pct: 1, count: 4, pick: { g: TRC, r: "M", t: "(Borderless)", n: ["9-999"] } },
        ],
      },
      {
        label: "Booster Fun cards",
        count: 2,
        outcomes: [
          { label: "Klingon frame rare", pct: 1.9, count: 3, pick: { r: "R", t: "(Showcase)", n: KLINGON } },
          { label: "Scene rare", pct: 4.2, pick: { r: "R", t: "(Borderless)", n: SCENE } },
          { label: "Scene mythic", pct: 1.7, count: 7, pick: { r: "M", t: "(Borderless)", n: SCENE } },
          { label: "Scene Box rare", pct: 4.6, pick: null },
          { label: "LCARS frame rare", pct: 10.4, pick: { r: "R", t: "(Showcase)", n: LCARS } },
          { label: "LCARS frame mythic", pct: 2.3, count: 8, pick: { r: "M", t: "(Showcase)", n: LCARS } },
          { label: "LCARS shock land", pct: 7.7, pick: { r: "R", t: "(Showcase)", n: SHOCK } },
          { label: "Borderless rare land", pct: 3.5, pick: { r: "R", t: "(Borderless)", n: BL_LAND } },
          { label: "Borderless mythic land", pct: 0, lt1: true, count: 1, pick: { r: "M", t: "(Borderless)", n: BL_LAND } },
          { label: "Classic Enterprise rare", pct: 8.5, pick: { r: "R", t: "(Showcase)", n: CLASSIC } },
          { label: "Classic Enterprise mythic", pct: 2.1, count: 6, pick: { r: "M", t: "(Showcase)", n: CLASSIC } },
          { label: "Extended-art rare", pct: 21.5, count: 28, pick: { r: "R", t: "(Extended Art)" } },
          { label: "Extended-art mythic", pct: 3.1, count: 8, pick: { r: "M", t: "(Extended Art)" } },
          { label: "Stardates card", pct: 23.1, pick: { g: SDS, r: "M", t: "(Borderless)" } },
          { label: "Foil Stardates card", pct: 5, pick: { g: SDS, r: "M", t: "(Borderless)", foil: true } },
        ],
      },
      {
        label: "Foil Booster Fun card",
        count: 1,
        // The article's lines for this slot sum to 96%; the signed headliners are printed with no odds ("extremely low quantity").
        unprinted: 4,
        outcomes: [
          { label: "Foil Klingon frame rare", pct: 2.2, pick: { r: "R", t: "(Showcase)", n: KLINGON, foil: true } },
          { label: "Foil Klingon script rare", pct: 2.7, count: 3, pick: { r: "R", t: "(Showcase)(Klingon)", n: SCRIPT, foil: true } },
          { label: "Foil scene rare", pct: 4.9, pick: { r: "R", t: "(Borderless)", n: SCENE, foil: true } },
          { label: "Foil scene mythic", pct: 2, pick: { r: "M", t: "(Borderless)", n: SCENE, foil: true } },
          { label: "Foil LCARS frame rare", pct: 12, pick: { r: "R", t: "(Showcase)", n: LCARS, foil: true } },
          { label: "Foil LCARS frame mythic", pct: 2.7, pick: { r: "M", t: "(Showcase)", n: LCARS, foil: true } },
          { label: "Foil LCARS shock land", pct: 8.9, pick: { r: "R", t: "(Showcase)", n: SHOCK, foil: true } },
          { label: "Surge foil LCARS frame rare", pct: 3.2, count: 14, pick: { r: "R", t: "(Showcase)(Surge Foil)", n: ["497-525"], foil: true } },
          { label: "Surge foil LCARS frame mythic", pct: 1, count: 8, pick: { r: "M", t: "(Showcase)(Surge Foil)", n: ["497-525"], foil: true } },
          { label: "Surge foil LCARS shock land", pct: 4.6, count: 10, pick: { r: "R", t: "(Showcase)(Surge Foil)", n: ["487-496"], foil: true } },
          { label: "Foil classic Enterprise rare", pct: 9.8, pick: { r: "R", t: "(Showcase)", n: CLASSIC, foil: true } },
          { label: "Foil classic Enterprise mythic", pct: 2.4, pick: { r: "M", t: "(Showcase)", n: CLASSIC, foil: true } },
          { label: "Surge foil classic Enterprise rare", pct: 3, count: 13, pick: { r: "R", t: "(Showcase)(Surge Foil)", n: ["526-549"], foil: true } },
          { label: "Surge foil classic Enterprise mythic", pct: 1, count: 6, pick: { r: "M", t: "(Showcase)(Surge Foil)", n: ["526-549"], foil: true } },
          { label: "Foil extended-art rare", pct: 24.9, pick: { r: "R", t: "(Extended Art)", foil: true } },
          { label: "Foil extended-art mythic", pct: 3.6, pick: { r: "M", t: "(Extended Art)", foil: true } },
          { label: "Foil borderless new Commander rare", pct: 5.3, pick: null },
          { label: "Foil borderless new Commander mythic", pct: 1.8, pick: { g: TRC, r: "M", t: "(Borderless)", n: ["9-999"], foil: true } },
        ],
      },
    ],
  },
};
