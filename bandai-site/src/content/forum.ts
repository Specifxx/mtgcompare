// The forum's topics for this site (src/lib/forum/site.ts reads them). An empty
// topic shows its blurb and prompts, never an invented post.
import type { ForumCategory } from "@/lib/forum/core";

export const FORUM_INTRO = "Talk Union Arena, Dragon Ball Super Fusion World and Digimon prices, deals, pulls and decks with other players.";

export const FORUM_CATEGORIES: ForumCategory[] = [
  { key: "union-arena", name: "Union Arena", blurb: "New series, box prices and the SR*** cards everyone is chasing.", prompts: ["Which series are you collecting?", "Best Union Arena box to open right now?"] },
  { key: "fusion-world", name: "Fusion World", blurb: "FB sets, Manga Boosters, leaders and starter decks.", prompts: ["Which FB set has the best value per box?", "Is a Manga Booster worth opening?"] },
  { key: "digimon", name: "Digimon", blurb: "BT and EX sets, Rare Pulls and the meta.", prompts: ["Your best Rare Pull so far", "Cheapest competitive Digimon deck?"] },
  { key: "deals", name: "Deals & where to buy", blurb: "Good prices you spotted, store experiences and shipping tips.", prompts: ["Best booster box price you've seen this week", "Which store shipped fastest for you?"] },
  { key: "site", name: "Site feedback", blurb: "Ideas, bugs or a store we should add.", prompts: ["A feature you'd like to see"] },
];
