// MTG Compare's forum settings (the rules are in ./core.ts, docs/forum.md).
import type { ForumSite } from "./core";

export const FORUM_SITE: ForumSite = {
  site: "mtgcompare",
  siteName: "MTG Compare",
  repo: "Specifxx/mtgcompare",
  hosts: ["mtgcompare.app", "www.mtgcompare.app"],
  base: "/forum",
  topic: "Magic: The Gathering",
  intro: "Talk Magic: The Gathering sealed prices, deals, new sets and collections with other players.",
  categories: [
    {
      "key": "new-sets",
      "name": "New set prices",
      "blurb": "Pre-orders, release week and how a new set's boxes are pricing.",
      "prompts": [
        "Is the next set worth pre-ordering by the box?",
        "Collector or Play Booster box: which is better value?"
      ]
    },
    {
      "key": "deals",
      "name": "Deals & where to buy",
      "blurb": "Good prices you spotted, store experiences and shipping tips.",
      "prompts": [
        "Which store shipped fastest for you?",
        "Best booster box price you've seen this week"
      ]
    },
    {
      "key": "commander",
      "name": "Commander & precons",
      "blurb": "Which precons are worth it, upgrades and budget builds.",
      "prompts": [
        "Best value precon right now?",
        "First upgrades for a new precon?"
      ]
    },
    {
      "key": "collection",
      "name": "Collection talk",
      "blurb": "Sealed collecting, opening vs holding, and what you're chasing.",
      "prompts": [
        "Open it or keep it sealed?",
        "Which sets do you think will hold value?"
      ]
    },
    {
      "key": "site",
      "name": "Site feedback",
      "blurb": "Ideas, bugs or a store we should add.",
      "prompts": [
        "A store we should compare"
      ]
    }
  ],
  reserved: ["mtg compare", "wizards"],
};
