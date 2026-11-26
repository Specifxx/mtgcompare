// Lorwyn Eclipsed: Wizards' "Collecting Lorwyn Eclipsed" (5 January 2026), read 2026-11-26. Every percentage is the article's.
// TCGplayer's numbers per treatment, checked against the article's counts (tests/box-ev.test.ts): default-frame basics 269-273,
// full-art basics 274-283; borderless 284-296 (5 rare, 8 mythic); fable frame 297-346 (10 uncommon, 26 rare, 14 mythic);
// borderless shock lands 347-351; extended art 353-381 (29 rare); Japan Showcase 382-391, fracture foil 392-401.
// Not singled out: the Special Guests cards (TCGplayer's Special Guests group doesn't say which set each belongs to).
import type { SetOdds } from "@/lib/box-ev/types";

const ECC = "commander-lorwyn-eclipsed";
const MAIN = ["1-268"];
const BORDERLESS = ["284-296"];
const FABLE = ["297-346"];
const SHOCK = ["347-351"];

export const ECL: SetOdds = {
  code: "ecl",
  source: "https://magic.wizards.com/en/news/feature/collecting-lorwyn-eclipsed",
  sourceTitle: "Collecting Lorwyn Eclipsed",
  read: "2026-11-26",
  play: {
    packs: 30,
    slots: [
      { label: "Commons", count: 6, outcomes: [{ label: "Common", pct: 100, pool: true, count: 81, pick: { r: "C", t: "", n: MAIN } }] },
      {
        label: "Common or Special Guest",
        count: 1,
        outcomes: [
          // "In 1 of 55 Play Boosters, 1 of 20 Special Guests cards will replace a common": 1.82%.
          { label: "Common", pct: 98.18, pool: true, count: 81, pick: { r: "C", t: "", n: MAIN } },
          { label: "Special Guests card", pct: 1.82, pick: null },
        ],
      },
      {
        label: "Uncommons",
        count: 3,
        outcomes: [
          { label: "Uncommon", pct: 90, pool: true, count: 100, pick: { r: "U", t: "", n: MAIN } },
          { label: "Fable frame uncommon", pct: 10, count: 10, pick: { r: "U", t: "(Showcase)", n: FABLE } },
        ],
      },
      {
        label: "Wildcard",
        count: 1,
        outcomes: [
          { label: "Common", pct: 18, pick: { r: "C", t: "", n: MAIN } },
          { label: "Uncommon", pct: 58, pick: { r: "U", t: "", n: MAIN } },
          { label: "Rare", pct: 19, pick: { r: "R", t: "", n: MAIN } },
          { label: "Mythic rare", pct: 2, pick: { r: "M", t: "", n: MAIN } },
          { label: "Fable frame uncommon", pct: 2, pick: { r: "U", t: "(Showcase)", n: FABLE } },
          { label: "Fable frame rare or mythic", pct: 0, lt1: true, pick: { r: "RM", t: "(Showcase)", n: FABLE } },
          { label: "Borderless rare", pct: 1, count: 5, pick: { r: "R", t: "(Borderless)", n: BORDERLESS } },
          { label: "Borderless mythic", pct: 0, lt1: true, pick: { r: "M", t: "(Borderless)", n: BORDERLESS } },
          { label: "Borderless shock land", pct: 0, lt1: true, pick: { r: "R", t: "(Borderless)", n: SHOCK } },
        ],
      },
      {
        label: "Rare or mythic rare",
        count: 1,
        outcomes: [
          { label: "Rare", pct: 78.2, pick: { r: "R", t: "", n: MAIN } },
          { label: "Mythic rare", pct: 13.6, pick: { r: "M", t: "", n: MAIN } },
          { label: "Fable frame rare", pct: 4.6, count: 26, pick: { r: "R", t: "(Showcase)", n: FABLE } },
          { label: "Fable frame mythic", pct: 1.2, count: 14, pick: { r: "M", t: "(Showcase)", n: FABLE } },
          { label: "Borderless rare or mythic", pct: 0, lt1: true, pick: { r: "RM", t: "(Borderless)", n: BORDERLESS } },
          { label: "Borderless shock land", pct: 0, lt1: true, pick: { r: "R", t: "(Borderless)", n: SHOCK } },
        ],
      },
      {
        label: "Traditional foil",
        count: 1,
        outcomes: [
          { label: "Foil common", pct: 60.4, pick: { r: "C", t: "", n: MAIN, foil: true } },
          { label: "Foil uncommon", pct: 29.8, pick: { r: "U", t: "", n: MAIN, foil: true } },
          { label: "Foil rare", pct: 6.5, pick: { r: "R", t: "", n: MAIN, foil: true } },
          { label: "Foil mythic rare", pct: 1.1, pick: { r: "M", t: "", n: MAIN, foil: true } },
          { label: "Foil fable frame uncommon", pct: 1, pick: { r: "U", t: "(Showcase)", n: FABLE, foil: true } },
          { label: "Foil fable frame rare", pct: 1, pick: { r: "R", t: "(Showcase)", n: FABLE, foil: true } },
          { label: "Foil fable frame mythic", pct: 0, lt1: true, pick: { r: "M", t: "(Showcase)", n: FABLE, foil: true } },
          { label: "Foil borderless rare or mythic", pct: 0, lt1: true, pick: { r: "RM", t: "(Borderless)", n: BORDERLESS, foil: true } },
          { label: "Foil borderless shock land", pct: 0, lt1: true, pick: { r: "R", t: "(Borderless)", n: SHOCK, foil: true } },
        ],
      },
      {
        label: "Basic land",
        count: 1,
        outcomes: [
          { label: "Basic land", pct: 40, count: 5, pick: { r: "L", t: "", n: ["269-273"] } },
          { label: "Foil basic land", pct: 10, pick: { r: "L", t: "", n: ["269-273"], foil: true } },
          { label: "Full-art basic land", pct: 40, count: 10, pick: { r: "L", t: "", n: ["274-283"] } },
          { label: "Foil full-art basic land", pct: 10, pick: { r: "L", t: "", n: ["274-283"], foil: true } },
        ],
      },
    ],
  },
  collector: {
    packs: 12,
    slots: [
      { label: "Foil commons", count: 5, outcomes: [{ label: "Foil common", pct: 100, pool: true, count: 81, pick: { r: "C", t: "", n: MAIN, foil: true } }] },
      {
        label: "Foil uncommons",
        count: 4,
        outcomes: [
          { label: "Foil uncommon", pct: 63.6, pool: true, count: 100, pick: { r: "U", t: "", n: MAIN, foil: true } },
          { label: "Foil fable frame uncommon", pct: 36.4, count: 10, pick: { r: "U", t: "(Showcase)", n: FABLE, foil: true } },
        ],
      },
      { label: "Foil full-art basic land", count: 1, outcomes: [{ label: "Foil full-art basic land", pct: 100, pool: true, count: 10, pick: { r: "L", t: "", n: ["274-283"], foil: true } }] },
      {
        label: "Foil rare or mythic rare",
        count: 1,
        outcomes: [
          { label: "Foil rare", pct: 85.5, pick: { r: "R", t: "", n: MAIN, foil: true } },
          { label: "Foil mythic rare", pct: 14.5, pick: { r: "M", t: "", n: MAIN, foil: true } },
        ],
      },
      {
        label: "Lorwyn Eclipsed Commander card",
        count: 1,
        outcomes: [
          { label: "Borderless Commander mythic", pct: 9, count: 4, pick: { g: ECC, r: "M", t: "(Borderless)", n: ["1-4"] } },
          { label: "Extended-art Commander rare", pct: 91, count: 20, pick: { g: ECC, r: "R", t: "(Extended Art)" } },
        ],
      },
      {
        label: "Booster Fun cards",
        count: 2,
        outcomes: [
          { label: "Extended-art rare", pct: 37.7, count: 29, pick: { r: "R", t: "(Extended Art)" } },
          { label: "Fable frame rare", pct: 33.7, pick: { r: "R", t: "(Showcase)", n: FABLE } },
          { label: "Fable frame mythic", pct: 9.1, pick: { r: "M", t: "(Showcase)", n: FABLE } },
          { label: "Borderless rare", pct: 13, pick: { r: "R", t: "(Borderless)", n: BORDERLESS } },
          { label: "Borderless mythic", pct: 4.5, count: 8, pick: { r: "M", t: "(Borderless)", n: BORDERLESS } },
          { label: "Borderless shock land", pct: 2, count: 5, pick: { r: "R", t: "(Borderless)", n: SHOCK } },
        ],
      },
      {
        label: "Foil Booster Fun card",
        count: 1,
        outcomes: [
          { label: "Foil extended-art rare", pct: 30.4, pick: { r: "R", t: "(Extended Art)", foil: true } },
          { label: "Foil fable frame rare", pct: 27.2, pick: { r: "R", t: "(Showcase)", n: FABLE, foil: true } },
          { label: "Foil fable frame mythic", pct: 7.3, pick: { r: "M", t: "(Showcase)", n: FABLE, foil: true } },
          { label: "Foil borderless rare", pct: 5.2, pick: { r: "R", t: "(Borderless)", n: BORDERLESS, foil: true } },
          { label: "Foil borderless mythic", pct: 4.2, pick: { r: "M", t: "(Borderless)", n: BORDERLESS, foil: true } },
          { label: "Foil borderless shock land", pct: 5.2, pick: { r: "R", t: "(Borderless)", n: SHOCK, foil: true } },
          { label: "Foil Special Guests card", pct: 10.5, pick: null },
          { label: "Foil Japan Showcase card", pct: 9, count: 10, pick: { r: "M", t: "(Showcase)", n: ["382-391"], foil: true } },
          { label: "Fracture foil Japan Showcase card", pct: 1, count: 10, pick: { r: "M", t: "(Showcase)(Fracture Foil)", foil: true } },
          { label: "Serialized Bitterbloom Bearer", pct: 0, lt1: true, pick: { r: "M", t: "(Borderless)(Serial Numbered)", foil: true } },
        ],
      },
    ],
  },
};
