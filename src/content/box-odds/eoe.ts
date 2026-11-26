// Edge of Eternities: Wizards' "Collecting Edge of Eternities" (Mike Turian and Jubilee Finnegan, 8 July 2025), read 2026-11-26.
// Every percentage is the article's. Collector-number ranges are TCGplayer's numbers for each treatment, checked against the
// article's card counts (tests/box-ev.test.ts): viewport lands 277-286 (5 rare shock lands, 5 mythic Planets), triumphant 287-302
// (12 rare, 4 mythic), surreal space 303-316 (11 rare, 3 mythic). Stellar Sights (its own TCGplayer group): 1-45 the lands,
// 46-90 their posters, 91-135 galaxy foil, 136-180 galaxy foil posters.
import type { SetOdds } from "@/lib/box-ev/types";

const SS = "edge-of-eternities-stellar-sights";
const EOC = "commander-edge-of-eternities";
const MAIN = ["1-261"];
const VIEWPORT = ["277-286"];
const TRIUMPHANT = ["287-302"];
const SURREAL = ["303-316"];

export const EOE: SetOdds = {
  code: "eoe",
  source: "https://magic.wizards.com/en/news/feature/collecting-edge-of-eternities",
  sourceTitle: "Collecting Edge of Eternities",
  read: "2026-11-26",
  play: {
    packs: 30,
    slots: [
      { label: "Commons", count: 6, outcomes: [{ label: "Common", pct: 100, pool: true, count: 81, pick: { r: "C", t: "", n: MAIN } }] },
      {
        label: "Common or Special Guest",
        count: 1,
        outcomes: [
          { label: "Common", pct: 98.2, pool: true, count: 81, pick: { r: "C", t: "", n: MAIN } },
          { label: "Special Guests card", pct: 1.8, pick: null },
        ],
      },
      { label: "Uncommons", count: 3, outcomes: [{ label: "Uncommon", pct: 100, pool: true, count: 100, pick: { r: "U", t: "", n: MAIN } }] },
      {
        label: "Wildcard",
        count: 1,
        outcomes: [
          { label: "Common", pct: 12.5, count: 81, pick: { r: "C", t: "", n: MAIN } },
          { label: "Uncommon", pct: 62.5, count: 100, pick: { r: "U", t: "", n: MAIN } },
          { label: "Rare", pct: 10.6, count: 60, pick: { r: "R", t: "", n: MAIN } },
          { label: "Mythic rare", pct: 0, lt1: true, pick: { r: "M", t: "", n: MAIN } },
          { label: "Stellar Sights rare land", pct: 10, count: 30, pick: { g: SS, r: "R", t: "(Borderless)", n: ["1-45"] } },
          { label: "Stellar Sights mythic land", pct: 2.5, count: 15, pick: { g: SS, r: "M", t: "(Borderless)", n: ["1-45"] } },
          { label: "Borderless viewport rare land", pct: 1, count: 5, pick: { r: "R", t: "(Borderless)", n: VIEWPORT } },
          { label: "Borderless viewport mythic land", pct: 0, lt1: true, pick: { r: "M", t: "(Borderless)", n: VIEWPORT } },
          { label: "Borderless triumphant or surreal space card", pct: 0, lt1: true, pick: { r: "RM", t: "(Borderless)", n: [...TRIUMPHANT, ...SURREAL] } },
        ],
      },
      {
        label: "Rare or mythic rare",
        count: 1,
        outcomes: [
          { label: "Rare", pct: 80.4, count: 60, pick: { r: "R", t: "", n: MAIN } },
          { label: "Mythic rare", pct: 14.2, count: 20, pick: { r: "M", t: "", n: MAIN } },
          { label: "Borderless triumphant rare", pct: 2, count: 12, pick: { r: "R", t: "(Borderless)", n: TRIUMPHANT } },
          { label: "Borderless triumphant mythic", pct: 0, lt1: true, pick: { r: "M", t: "(Borderless)", n: TRIUMPHANT } },
          { label: "Borderless surreal space rare", pct: 2, count: 11, pick: { r: "R", t: "(Borderless)", n: SURREAL } },
          { label: "Borderless surreal space mythic", pct: 0, lt1: true, pick: { r: "M", t: "(Borderless)", n: SURREAL } },
          { label: "Borderless viewport mythic land", pct: 0, lt1: true, pick: { r: "M", t: "(Borderless)", n: VIEWPORT } },
        ],
      },
      {
        label: "Traditional foil",
        count: 1,
        outcomes: [
          { label: "Foil common", pct: 58, pick: { r: "C", t: "", n: MAIN, foil: true } },
          { label: "Foil uncommon", pct: 32, pick: { r: "U", t: "", n: MAIN, foil: true } },
          { label: "Foil rare", pct: 6.4, pick: { r: "R", t: "", n: MAIN, foil: true } },
          { label: "Foil mythic rare", pct: 1.1, pick: { r: "M", t: "", n: MAIN, foil: true } },
          { label: "Foil Stellar Sights rare land", pct: 1, pick: { g: SS, r: "R", t: "(Borderless)", n: ["1-45"], foil: true } },
          { label: "Foil Stellar Sights mythic land", pct: 0, lt1: true, pick: { g: SS, r: "M", t: "(Borderless)", n: ["1-45"], foil: true } },
          { label: "Foil borderless viewport, triumphant or surreal space card", pct: 0, lt1: true, pick: { r: "RM", t: "(Borderless)", n: ["277-316"], foil: true } },
        ],
      },
      {
        label: "Basic land",
        count: 1,
        outcomes: [
          { label: "Basic land", pct: 64, pick: { r: "L", t: "", n: ["267-276"] } },
          { label: "Foil basic land", pct: 16, pick: { r: "L", t: "", n: ["267-276"], foil: true } },
          { label: "Borderless celestial basic land", pct: 16, pick: { r: "L", t: "(Borderless)", n: ["262-266"] } },
          { label: "Foil borderless celestial basic land", pct: 4, pick: { r: "L", t: "(Borderless)", n: ["262-266"], foil: true } },
        ],
      },
    ],
  },
  collector: {
    packs: 12,
    slots: [
      { label: "Foil commons", count: 5, outcomes: [{ label: "Foil common", pct: 100, pool: true, count: 81, pick: { r: "C", t: "", n: MAIN, foil: true } }] },
      { label: "Foil uncommons", count: 4, outcomes: [{ label: "Foil uncommon", pct: 100, pool: true, count: 100, pick: { r: "U", t: "", n: MAIN, foil: true } }] },
      {
        label: "Foil celestial basic land",
        count: 1,
        outcomes: [
          { label: "Foil celestial basic land", pct: 66.6, pick: { r: "L", t: "(Borderless)", n: ["262-266"], foil: true } },
          { label: "Galaxy foil celestial basic land", pct: 33.3, pick: { r: "L", t: "(Borderless)(Galaxy Foil)", n: ["367-371"], foil: true } },
        ],
      },
      {
        label: "Foil rare or mythic rare",
        count: 1,
        outcomes: [
          { label: "Foil rare", pct: 86, count: 60, pick: { r: "R", t: "", n: MAIN, foil: true } },
          { label: "Foil mythic rare", pct: 14, count: 20, pick: { r: "M", t: "", n: MAIN, foil: true } },
        ],
      },
      {
        label: "Edge of Eternities Commander card",
        count: 1,
        outcomes: [
          { label: "Borderless Commander mythic", pct: 9, count: 4, pick: { g: EOC, r: "M", t: "(Borderless)", n: ["1-4"] } },
          { label: "Extended-art Commander rare", pct: 91, count: 20, pick: { g: EOC, r: "R", t: "(Extended Art)" } },
        ],
      },
      {
        label: "Booster Fun card",
        count: 1,
        outcomes: [
          { label: "Extended-art rare", pct: 47, count: 33, pick: { r: "R", t: "(Extended Art)" } },
          { label: "Extended-art mythic", pct: 5, count: 7, pick: { r: "M", t: "(Extended Art)" } },
          { label: "Borderless viewport rare land", pct: 7, count: 5, pick: { r: "R", t: "(Borderless)", n: VIEWPORT } },
          { label: "Borderless viewport mythic land", pct: 4, count: 5, pick: { r: "M", t: "(Borderless)", n: VIEWPORT } },
          { label: "Borderless triumphant rare", pct: 17, count: 12, pick: { r: "R", t: "(Borderless)", n: TRIUMPHANT } },
          { label: "Borderless triumphant mythic", pct: 3, count: 4, pick: { r: "M", t: "(Borderless)", n: TRIUMPHANT } },
          { label: "Borderless surreal space rare", pct: 15, count: 11, pick: { r: "R", t: "(Borderless)", n: SURREAL } },
          { label: "Borderless surreal space mythic", pct: 2, count: 3, pick: { r: "M", t: "(Borderless)", n: SURREAL } },
        ],
      },
      {
        label: "Stellar Sights land",
        count: 1,
        outcomes: [
          { label: "Stellar Sights rare", pct: 36, count: 30, pick: { g: SS, r: "R", t: "(Borderless)", n: ["1-45"] } },
          { label: "Stellar Sights mythic", pct: 9, count: 15, pick: { g: SS, r: "M", t: "(Borderless)", n: ["1-45"] } },
          { label: "Poster Stellar Sights rare", pct: 18, count: 30, pick: { g: SS, r: "R", t: "(Borderless)", n: ["46-90"] } },
          { label: "Poster Stellar Sights mythic", pct: 4, count: 15, pick: { g: SS, r: "M", t: "(Borderless)", n: ["46-90"] } },
          { label: "Foil Stellar Sights rare", pct: 12, pick: { g: SS, r: "R", t: "(Borderless)", n: ["1-45"], foil: true } },
          { label: "Foil Stellar Sights mythic", pct: 3, pick: { g: SS, r: "M", t: "(Borderless)", n: ["1-45"], foil: true } },
          { label: "Foil poster Stellar Sights rare", pct: 6, pick: { g: SS, r: "R", t: "(Borderless)", n: ["46-90"], foil: true } },
          { label: "Foil poster Stellar Sights mythic", pct: 1.5, pick: { g: SS, r: "M", t: "(Borderless)", n: ["46-90"], foil: true } },
          { label: "Galaxy foil Stellar Sights rare", pct: 6, count: 30, pick: { g: SS, r: "R", t: "(Borderless)(Galaxy Foil)", n: ["91-135"], foil: true } },
          { label: "Galaxy foil Stellar Sights mythic", pct: 1.5, count: 15, pick: { g: SS, r: "M", t: "(Borderless)(Galaxy Foil)", n: ["91-135"], foil: true } },
          { label: "Galaxy foil poster Stellar Sights rare", pct: 3, count: 30, pick: { g: SS, r: "R", t: "(Borderless)(Galaxy Foil)", n: ["136-180"], foil: true } },
          { label: "Galaxy foil poster Stellar Sights mythic", pct: 0, lt1: true, pick: { g: SS, r: "M", t: "(Borderless)(Galaxy Foil)", n: ["136-180"], foil: true } },
        ],
      },
      {
        label: "Foil Booster Fun card",
        count: 1,
        outcomes: [
          { label: "Foil extended-art rare", pct: 38, pick: { r: "R", t: "(Extended Art)", foil: true } },
          { label: "Foil extended-art mythic", pct: 4, pick: { r: "M", t: "(Extended Art)", foil: true } },
          { label: "Foil viewport rare land", pct: 6, pick: { r: "R", t: "(Borderless)", n: VIEWPORT, foil: true } },
          { label: "Foil viewport mythic land", pct: 3, pick: { r: "M", t: "(Borderless)", n: VIEWPORT, foil: true } },
          { label: "Foil triumphant rare", pct: 13, pick: { r: "R", t: "(Borderless)", n: TRIUMPHANT, foil: true } },
          { label: "Foil triumphant mythic", pct: 2, pick: { r: "M", t: "(Borderless)", n: TRIUMPHANT, foil: true } },
          { label: "Foil surreal space rare", pct: 12, pick: { r: "R", t: "(Borderless)", n: SURREAL, foil: true } },
          { label: "Foil surreal space mythic", pct: 2, pick: { r: "M", t: "(Borderless)", n: SURREAL, foil: true } },
          { label: "Foil Special Guests card", pct: 6, pick: null },
          { label: "Foil Japan Showcase card", pct: 9, count: 10, pick: { r: "M", t: "(Showcase)", n: ["357-366"], foil: true } },
          { label: "Fracture foil Japan Showcase card", pct: 1, count: 10, pick: { r: "M", t: "(Showcase)(Fracture Foil)", foil: true } },
          { label: "Galaxy foil viewport rare land", pct: 2, count: 5, pick: { r: "R", t: "(Borderless)(Galaxy Foil)", n: ["372-381"], foil: true } },
          { label: "Galaxy foil viewport mythic land", pct: 1, count: 5, pick: { r: "M", t: "(Borderless)(Galaxy Foil)", n: ["372-381"], foil: true } },
          { label: "Singularity foil Sothera, the Supervoid", pct: 0, lt1: true, pick: { r: "M", t: "(Singularity Foil)", foil: true } },
        ],
      },
    ],
  },
};
