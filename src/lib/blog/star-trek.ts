import { fold } from "../constants";
import type { OracleMini, SealedLite } from "../data";
import { PLAYGROUP_STAR_TREK, STAR_TREK, commanderDeckNames, type PreorderFact } from "../preorders";
import type { ReleaseView, StarTrekView } from "./types";

// What the three Star Trek posts of 2026-10-16 (release date and products, the Commander decks, the mechanics) say that is not a
// price: each line is copied from its source and dated, never guessed (DECISIONS.md, "Three Star Trek posts", 2026-10-16).
//   * Wizards of the Coast's Collecting Star Trek article (14 July 2026, read 16 October 2026): the contents of every product,
//     the Booster Fun treatments, how each mechanic works in Wizards' words, the four Commander decks by name.
//   * Scryfall (read 16 October 2026): the rules text quoted from revealed cards, reminder text included. Scryfall says what a
//     card is; no text here is a paraphrase presented as a card's.
//   * playgroup.gg (read 16 October 2026): the precons' colours and themes, which Wizards' article does not state. Always said
//     as reported. Wizards has named no face commander and published no decklist, so the posts name none.
// Prices are never here: the posts read them from the published data (PostContext.releases, PostContext.starTrek). The US MSRPs
// are lib/preorders.ts's (STAR_TREK.msrp), with their source.

/** The day the sources above were read. */
export const STAR_TREK_CHECKED = "2026-10-16";

export const SCRYFALL = { label: "Scryfall", url: "https://scryfall.com/sets/trk" };
export const WPN_STAR_TREK = { label: "Wizards Play Network's Star Trek dates and details", url: "https://wpn.wizards.com/en/news/star-trek-dates-and-details" };

/** The dates of the season besides the release itself (Wizards' Collecting Star Trek article; the WPN page for the league): YYYY-MM-DD. The release date and the prerelease are lib/preorders.ts's. */
export const SEASON = {
  firstLook: "2026-07-14",
  arena: "2026-11-10",
  league: { from: "2026-11-13", to: "2027-01-28" },
} as const;

/** What each product holds, per Wizards' Collecting Star Trek article; keyed by the product line (lib/preorders.ts), plus the Prerelease Pack, which has no line and no MSRP. */
export const CONTENTS: readonly { line: string; name: string; holds: string }[] = [
  { line: "Play Booster", name: "Play Booster", holds: "14 Magic cards: 7 commons (in 1 booster in 25 a stardates card replaces a common), 3 uncommons, 1 wildcard of any rarity, 1 traditional foil of any rarity, 1 rare or mythic rare and 1 land, plus a non-foil double-sided token. 30 boosters to a box." },
  { line: "Collector Booster", name: "Collector Booster", holds: "15 cards: 5 traditional foil commons, 3 traditional foil uncommons, 1 foil common or uncommon, 1 traditional foil basic land, 1 traditional foil rare or mythic rare, 1 non-foil extended-art rare or mythic rare, 2 Booster Fun rares or mythic rares, 1 foil Booster Fun rare or mythic rare, and 1 art card or traditional foil double-sided token. 12 boosters to a box." },
  { line: "Bundle", name: "Bundle", holds: "9 Play Boosters, 30 basic lands (15 traditional foil and 15 non-foil, 5 full-art in each half), 1 traditional foil promo card, 2 reference cards, an oversized spindown life counter and a card-storage box." },
  { line: "Beam Me Up Bundle", name: "Beam Me Up Bundle", holds: "8 Play Boosters and 1 Collector Booster, the same 30 basic lands as the Bundle, 2 of the 8 traditional foil Beam Me Up Bundle promo cards (Spacecraft drawn as schematics), 2 reference cards, a spindown life counter and a storage box." },
  { line: "Draft Night", name: "Draft Night", holds: "12 Play Boosters, 1 Collector Booster, 90 non-foil basic lands, 10 non-foil double-sided tokens and a draft insert: a kit for a Pick-Two Draft with four players." },
  { line: "Scene Box", name: "Scene Box (Enterprise-Q, Divergent Timeline)", holds: "3 Play Boosters, 6 traditional foil borderless scene cards that make one picture, 6 art cards and a display easel. There are two, each with its own scene." },
  { line: "Commander Deck", name: "Commander Deck (four)", holds: "A ready-to-play 100-card deck: a traditional foil face commander with borderless art and 99 non-foil cards, 32 of them new to Magic, plus 10 double-sided tokens, a reference card and a deck box." },
  { line: "Collector's Edition Commander Deck", name: "Collector's Edition Commander Deck (four)", holds: "Each of the four decks in surge foil: the face commander, the other 99 cards (32 of them new to Magic) and the 10 double-sided tokens (surge foil on one side), with a reference card and a deck box." },
  { line: "", name: "Prerelease Pack", holds: "6 Play Boosters, 1 traditional foil rare or mythic rare, a deck box and a spindown die: what you play with at a prerelease event. Wizards publishes no MSRP for it." },
];

/** The Booster Fun of the set, in Wizards' words and numbers. */
export const TREATMENTS: readonly { name: string; what: string }[] = [
  { name: "Signed Headliner cards", what: "7 different cards, about 250 copies of each, hand-signed by the actor who played the character (Captain James T. Kirk and Captain Kathryn Janeway among them). They are found only in Collector Boosters, of any language, and are always in English." },
  { name: "Stardates cards (SDS)", what: "30 well-known reprints with Star Trek art: Sheoldred, the Apocalypse becomes “Khan, Engineered Evil”. Non-foil in Play and Collector Boosters; traditional foil only in Collector Boosters." },
  { name: "LCARS frame cards", what: "29 cards and all 10 shock lands in the frame of the Enterprise's computer screens. Non-foil and traditional foil in Play and Collector Boosters; surge foil only in Collector Boosters." },
  { name: "Classic Enterprise cards", what: "24 cards in the style of the vintage Star Trek movie posters. Non-foil and traditional foil in Play and Collector Boosters; surge foil only in Collector Boosters." },
  { name: "Scene cards", what: "25 borderless cards across four scenes, whose art runs across several cards, in Play and Collector Boosters (non-foil and traditional foil). The two Scene Boxes hold six more each, whose non-foil versions are in Collector Boosters." },
];

/** The ten shock lands, all reprinted in the main set (Wizards). */
export const SHOCK_LANDS = ["Blood Crypt", "Breeding Pool", "Godless Shrine", "Hallowed Fountain", "Overgrown Tomb", "Sacred Foundry", "Steam Vents", "Stomping Ground", "Temple Garden", "Watery Grave"] as const;

/** The revealed cards the posts name: each links to its name page (/cards/name/<slug>) once the catalogue has it, and is plain text until then. */
export const NAMED_CARDS = [
  "Borg Queen, Perfection Manifest",
  "Assault Drone",
  "Hive Mind Coprocessor",
  "Seven of Nine",
  "Set Phasers to . . .",
  "Consider the Prime Directive",
  "Hoshi Sato, Exolinguist",
  "Saavik, Stoic Student",
  "U.S.S. Enterprise-D, Galaxy-Class",
  "Captain Kirk, Boldly Going",
  "Sheoldred, the Apocalypse",
] as const;
export type NamedCard = (typeof NAMED_CARDS)[number];

/** Rules text of revealed cards, exactly as Scryfall prints it (read 16 October 2026), reminder text included: the mechanics post quotes these, and nothing else, as a card's text. */
export const SCRYFALL_TEXT: Partial<Record<NamedCard, string>> = {
  "Borg Queen, Perfection Manifest": "When Borg Queen enters, assimilate target creature card from an opponent's graveyard. (Put it onto the battlefield under your control with a +1/+1 counter. It's a Borg artifact creature and loses all other creature types.)",
  "Assault Drone": "Artifact creatures you control get +1/+0.",
  "Seven of Nine": "Whenever you face a dilemma, draw a card. (You face a dilemma as you choose one or more modes for a spell or ability.)",
  "Set Phasers to . . .": "Choose one — • Stun — Tap target creature and put a stun counter on it. (If a permanent with a stun counter would become untapped, remove one from it instead.) • Kill — This spell deals 3 damage to target attacking creature.",
  "Consider the Prime Directive": "Choose one — • Interfere — Counter target spell unless its controller pays {3}. • Observe — Tap up to one target creature and put a stun counter on it. Draw a card. (If a permanent with a stun counter would become untapped, remove one from it instead.)",
  "Hoshi Sato, Exolinguist": "Federation — When Hoshi Sato enters, look at the top X cards of your library, where X is the number of creature types among non-Borg creatures you control. Put one of them into your hand and the rest on the bottom of your library in a random order.",
  "Saavik, Stoic Student": "Federation — When Saavik enters, she deals X damage to target attacking or blocking creature an opponent controls, where X is the number of creature types among non-Borg creatures you control.",
  "U.S.S. Enterprise-D, Galaxy-Class": "Station (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It's an artifact creature at 7+.)",
};

/** How Wizards' Collecting Star Trek article describes each mechanic, word for word. */
export const WIZARDS_SAYS = {
  assimilate: "The assimilate keyword action gives you control of a creature or puts a creature card onto the battlefield under your control. Either way, a +1/+1 counter is put on that creature, and it becomes a Borg artifact creature and loses its other creature types.",
  dilemma: "Some cards have abilities that trigger whenever a player “faces a dilemma,” which happens whenever that player chooses one or more modes for a spell or ability.",
  federation: "The federation ability word groups abilities that care about the number of creature types among non-Borg creatures a player controls.",
  station: "Each Spacecraft starts as an artifact and can gain other abilities when you add charge counters to it with station.",
} as const;

/** The mechanics with a keyword page once a card with them is in the catalogue (keyword slugs: Scryfall's keyword list). Federation is an ability word, which Scryfall does not list. */
export const STAR_TREK_KEYWORDS = ["assimilate", "face-a-dilemma", "station"] as const;

/** The four decks in Wizards' order, with what playgroup.gg reports of each (Wizards' article names them, nothing more). */
export const PRECONS: readonly { name: string; colours: string; identity: string; theme: string }[] = [
  { name: "Federation Fleet", colours: "Jeskai", identity: "white, blue and red", theme: "starships and card draw, from the Picard and Janeway eras" },
  { name: "Landing Party", colours: "Bant", identity: "green, white and blue", theme: "landfall and away-team exploration, from the original series" },
  { name: "Klingon Fury", colours: "Mardu", identity: "red, white and black", theme: "aggressive Warrior combat" },
  { name: "We Are the Borg", colours: "Esper", identity: "white, blue and black", theme: "artifact creatures, built around the new assimilate mechanic" },
];
export const PRECONS_REPORTED: PreorderFact = {
  text: "The four decks' colours and themes: Federation Fleet Jeskai (starships and card draw), Landing Party Bant (landfall), Klingon Fury Mardu (aggressive Warriors) and We Are the Borg Esper (artifact creatures and assimilate); face commanders and decklists not yet published.",
  kind: "reported",
  source: PLAYGROUP_STAR_TREK,
  checked: STAR_TREK_CHECKED,
};

/** The release view of Star Trek in the context, or null (the release posts' common first step). */
export const starTrekView = (ctx: { releases: readonly ReleaseView[] }): ReleaseView | null => ctx.releases.find((r) => r.release.key === STAR_TREK.key) ?? null;

/** The Oracle card of a named card in the catalogue, or null: the posts link /cards/name/<slug> only when it exists. */
export function namedOracle(view: StarTrekView | null, name: NamedCard): OracleMini | null {
  return view?.oracles.get(fold(name)) ?? null;
}

/** The release's Commander decks, deck by deck: Wizards' four names, then any other name the catalogue holds; each with its catalogue products (the deck and its Collector's Edition), when listed. */
export function deckProducts<T extends Pick<SealedLite, "name" | "kind">>(products: readonly T[]): { name: string; deck: T | null; collectors: T | null }[] {
  const ce = /collector['’]?s edition/i;
  const names = [...PRECONS.map((p) => p.name)];
  for (const n of commanderDeckNames(products)) if (!names.some((x) => fold(x) === fold(n))) names.push(n);
  const of = (p: T): string | null => commanderDeckNames([p])[0] ?? null;
  return names.map((name) => {
    const mine = products.filter((p) => p.kind === "Commander Deck" && fold(of(p) ?? "") === fold(name));
    return { name, deck: mine.find((p) => !ce.test(p.name)) ?? null, collectors: mine.find((p) => ce.test(p.name)) ?? null };
  });
}

/** The cheapest live price of a product in a market, with its store count; null when no store or TCGplayer lists it there. */
export function liveIn<T extends { low: Record<string, number | null>; stores: Record<string, number> }>(p: T | null, country: string): { cents: number; stores: number } | null {
  const cents = p?.low[country];
  return p && cents != null ? { cents, stores: p.stores[country] ?? 0 } : null;
}
