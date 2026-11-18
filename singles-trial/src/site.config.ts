// The ONE file that names games and the brand. Engine code (src/lib, src/app, scripts) never names a game.
//
// Each game is a TCGplayer product line (TCGCSV category id). A game is imported and shown only while `live` is true, and a game
// goes live only after the one before it passed its indexing gate (DECISIONS.md, 2026-11-18). `slug` is the first URL segment and
// is frozen once the game is live.
export interface Game {
  slug: string;
  name: string;
  /** How the game is named in a sentence and an eBay search. */
  short: string;
  category: number;
  live: boolean;
  /** Why a game is not live yet (shown nowhere; for the next reader). */
  note?: string;
}

export const SITE = {
  name: "TCG Singles DB",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://tcgsinglesdb.com").replace(/\/$/, ""),
  tagline: "Single-card prices for every trading card game",
  /** EPN customid and Impact sharedid prefix: tells this site apart in the networks' reports. */
  tag: "tcgsdb",
  disclaimer:
    "TCG Singles DB is an independent price guide. It is not affiliated with, endorsed by or sponsored by The Pokémon Company, Nintendo, Konami, Wizards of the Coast, TCGplayer, eBay or any card game publisher. Card names and images belong to their owners.",
} as const;

export const GAMES: Game[] = [
  { slug: "pokemon", name: "Pokémon", short: "Pokemon", category: 3, live: true },
  { slug: "yugioh", name: "Yu-Gi-Oh!", short: "Yugioh", category: 2, live: false, note: "second: after Pokémon passes its three-week indexing gate" },
  { slug: "star-wars-unlimited", name: "Star Wars: Unlimited", short: "Star Wars Unlimited", category: 79, live: false },
  { slug: "flesh-and-blood", name: "Flesh and Blood", short: "Flesh and Blood", category: 62, live: false },
  { slug: "digimon", name: "Digimon Card Game", short: "Digimon", category: 63, live: false },
  { slug: "dragon-ball-fusion-world", name: "Dragon Ball Super Fusion World", short: "Dragon Ball Fusion World", category: 80, live: false },
  { slug: "union-arena", name: "Union Arena", short: "Union Arena", category: 81, live: false },
  { slug: "magic", name: "Magic: The Gathering", short: "MTG", category: 1, live: false, note: "MTG Compare has every Magic card; decided after its indexing read (about 9 Dec 2026)" },
  { slug: "one-piece", name: "One Piece Card Game", short: "One Piece", category: 68, live: false, note: "OP Compare has its cards; last" },
  { slug: "lorcana", name: "Disney Lorcana", short: "Lorcana", category: 71, live: false, note: "Lorcana Compare has its cards; last" },
];

export const LIVE_GAMES = GAMES.filter((g) => g.live);
export const gameBySlug = (slug: string): Game | null => LIVE_GAMES.find((g) => g.slug === slug) ?? null;
