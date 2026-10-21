// Magic: The Gathering | Star Trek (TRK, with Commander: Star Trek, TRC): what the guides and the blog say about the release that is
// not a price. Every line is copied from its source and dated, never guessed. Ported from the old MTG Compare (lib/preorders.ts and
// lib/blog/star-trek.ts, read 14 and 16 October 2026):
//   • Wizards of the Coast's Star Trek product page (read 14 October 2026): the release date, the product line.
//   • Wizards' Collecting Star Trek article (published 14 July 2026, read 16 October 2026): what each product holds, the US MSRPs,
//     the prerelease and Arena dates, the four Commander decks, the mechanics in Wizards' words, the cancelled Beginner Box.
//   • playgroup.gg (read 16 October 2026): the precons' colours and themes, always said as reported.
// Prices are never here: the pages read them from the stores' live listings.

export const STAR_TREK_CHECKED = "2026-10-16";

export const WIZARDS_STAR_TREK = { label: "Wizards of the Coast's Star Trek product page", url: "https://magic.wizards.com/en/products/star-trek" };
export const WIZARDS_COLLECTING_STAR_TREK = { label: "Wizards of the Coast's Collecting Star Trek article", url: "https://magic.wizards.com/en/news/feature/collecting-star-trek" };
export const PLAYGROUP_STAR_TREK = { label: "playgroup.gg's Star Trek tracker", url: "https://playgroup.gg/sets/star-trek" };

export const STAR_TREK_DATES = {
  firstLook: "2026-07-14",
  prerelease: { from: "2026-11-06", to: "2026-11-12" },
  arena: "2026-11-10",
  release: "2026-11-13",
} as const;

/** The words every Star Trek product name carries in the stores' titles: what the live reads look for. */
export const STAR_TREK_WORDS = "Star Trek";

/** What each product holds, per Wizards' Collecting Star Trek article, with its US MSRP where Wizards set one (US cents). */
export const STAR_TREK_PRODUCTS: readonly { name: string; match: RegExp; holds: string; msrpUsCents: number | null; each: string }[] = [
  {
    name: "Play Booster",
    match: /play booster(?!.*\b(?:box|display|case)\b)/i,
    holds: "14 Magic cards: 7 commons (in 1 booster in 25 a stardates card replaces a common), 3 uncommons, 1 wildcard of any rarity, 1 traditional foil of any rarity, 1 rare or mythic rare and 1 land, plus a non-foil double-sided token. 30 boosters to a box.",
    msrpUsCents: 699,
    each: "booster",
  },
  {
    name: "Collector Booster",
    match: /collector booster(?!.*\b(?:box|display|case)\b)/i,
    holds: "15 cards: 5 traditional foil commons, 3 traditional foil uncommons, 1 foil common or uncommon, 1 traditional foil basic land, 1 traditional foil rare or mythic rare, 1 non-foil extended-art rare or mythic rare, 2 Booster Fun rares or mythic rares, 1 foil Booster Fun rare or mythic rare, and 1 art card or traditional foil double-sided token. 12 boosters to a box.",
    msrpUsCents: 3799,
    each: "booster",
  },
  {
    name: "Bundle",
    match: /^(?!.*beam me up).*\bbundle\b/i,
    holds: "9 Play Boosters, 30 basic lands (15 traditional foil and 15 non-foil), 1 traditional foil promo card, 2 reference cards, an oversized spindown life counter and a card-storage box.",
    msrpUsCents: 6999,
    each: "bundle",
  },
  {
    name: "Beam Me Up Bundle",
    match: /beam me up/i,
    holds: "8 Play Boosters and 1 Collector Booster, the same 30 basic lands as the Bundle, 2 of the 8 traditional foil Beam Me Up Bundle promo cards, 2 reference cards, a spindown life counter and a storage box.",
    msrpUsCents: 9999,
    each: "bundle",
  },
  {
    name: "Draft Night",
    match: /draft night/i,
    holds: "12 Play Boosters, 1 Collector Booster, 90 non-foil basic lands, 10 non-foil double-sided tokens and a draft insert: a kit for a Pick-Two Draft with four players.",
    msrpUsCents: 11999,
    each: "kit",
  },
  {
    name: "Scene Box",
    match: /scene box/i,
    holds: "3 Play Boosters, 6 traditional foil borderless scene cards that make one picture, 6 art cards and a display easel. There are two, Enterprise-Q and Divergent Timeline, each with its own scene.",
    msrpUsCents: 4199,
    each: "box",
  },
  {
    name: "Commander Deck",
    match: /commander deck(?!.*collector['’]?s edition)/i,
    holds: "A ready-to-play 100-card deck: a traditional foil face commander with borderless art and 99 non-foil cards, 32 of them new to Magic, plus 10 double-sided tokens, a reference card and a deck box. There are four.",
    msrpUsCents: 7499,
    each: "deck",
  },
  {
    name: "Collector's Edition Commander Deck",
    match: /commander deck.*collector['’]?s edition|collector['’]?s edition.*commander/i,
    holds: "Each of the four decks in surge foil: the face commander, the other 99 cards and the 10 double-sided tokens (surge foil on one side), with a reference card and a deck box.",
    msrpUsCents: 15999,
    each: "deck",
  },
  {
    name: "Prerelease Pack",
    match: /prerelease/i,
    holds: "6 Play Boosters, 1 traditional foil rare or mythic rare, a deck box and a spindown die: what you play with at a prerelease event. Wizards publishes no MSRP for it.",
    msrpUsCents: null,
    each: "pack",
  },
];

/** The four Commander decks in Wizards' order, with what playgroup.gg reports of each (Wizards' article names them, nothing more). */
export const STAR_TREK_PRECONS: readonly { name: string; colours: string; identity: string; theme: string }[] = [
  { name: "Federation Fleet", colours: "Jeskai", identity: "white, blue and red", theme: "starships and card draw, from the Picard and Janeway eras" },
  { name: "Landing Party", colours: "Bant", identity: "green, white and blue", theme: "landfall and away-team exploration, from the original series" },
  { name: "Klingon Fury", colours: "Mardu", identity: "red, white and black", theme: "aggressive Warrior combat" },
  { name: "We Are the Borg", colours: "Esper", identity: "white, blue and black", theme: "artifact creatures, built around the new assimilate mechanic" },
];

/** How Wizards' Collecting Star Trek article describes each mechanic, word for word. */
export const STAR_TREK_MECHANICS: readonly { name: string; says: string }[] = [
  { name: "Assimilate", says: "The assimilate keyword action gives you control of a creature or puts a creature card onto the battlefield under your control. Either way, a +1/+1 counter is put on that creature, and it becomes a Borg artifact creature and loses its other creature types." },
  { name: "Face a dilemma", says: "Some cards have abilities that trigger whenever a player “faces a dilemma,” which happens whenever that player chooses one or more modes for a spell or ability." },
  { name: "Federation", says: "The federation ability word groups abilities that care about the number of creature types among non-Borg creatures a player controls." },
  { name: "Spacecraft and station", says: "Each Spacecraft starts as an artifact and can gain other abilities when you add charge counters to it with station." },
];

/** The Booster Fun of the set, in Wizards' words and numbers. */
export const STAR_TREK_TREATMENTS: readonly { name: string; what: string }[] = [
  { name: "Signed Headliner cards", what: "7 different cards, about 250 copies of each, hand-signed by the actor who played the character. They are found only in Collector Boosters, of any language, and are always in English." },
  { name: "Stardates cards (SDS)", what: "30 well-known reprints with Star Trek art. Non-foil in Play and Collector Boosters; traditional foil only in Collector Boosters." },
  { name: "LCARS frame cards", what: "29 cards and all 10 shock lands in the frame of the Enterprise's computer screens. Non-foil and traditional foil in Play and Collector Boosters; surge foil only in Collector Boosters." },
  { name: "Classic Enterprise cards", what: "24 cards in the style of the vintage Star Trek movie posters. Non-foil and traditional foil in Play and Collector Boosters; surge foil only in Collector Boosters." },
  { name: "Scene cards", what: "25 borderless cards across four scenes, whose art runs across several cards, in Play and Collector Boosters. The two Scene Boxes hold six more each." },
];

export const STAR_TREK_TRADEMARK = "Star Trek and related marks are trademarks of CBS Studios Inc.; MTG Compare is not affiliated with CBS Studios or Wizards of the Coast.";

/** The Star Trek product line a product name belongs to (the first that matches), or null. */
export function starTrekLine(name: string): (typeof STAR_TREK_PRODUCTS)[number] | null {
  // A box or display of boosters is not "the booster": checked first so a Play Booster Box is never priced as one pack.
  if (/\b(?:box|display|case)\b/i.test(name) && /booster/i.test(name) && !/scene box/i.test(name)) return null;
  return STAR_TREK_PRODUCTS.find((p) => p.match.test(name)) ?? null;
}

/** "13 November 2026". */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1];
  return `${d} ${month} ${y}`;
}
