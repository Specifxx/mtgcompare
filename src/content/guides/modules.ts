// Each guide's body module, by slug: what /[region]/guides/[slug] renders. Kept apart from the registry (index.ts), which the
// sitemap imports and which must stay free of React and the database.
import type { GuideSlug } from "./index";
import type { GuideModule } from "./kit";
import * as areBoxesWorthIt from "./are-pokemon-booster-boxes-worth-it";
import * as boxVsEtbVsBundle from "./booster-box-vs-etb-vs-booster-bundle";
import * as howManyPacks from "./how-many-packs-in-pokemon-products";
import * as preorder from "./how-to-preorder-pokemon-tcg";
import * as explained from "./pokemon-sealed-products-explained";
import * as msrp from "./pokemon-tcg-msrp";
import * as etb from "./whats-in-a-pokemon-elite-trainer-box";
import * as pcEtb from "./pokemon-center-etb-vs-elite-trainer-box";
import * as cheapest from "./cheapest-way-to-buy-pokemon-packs";
import * as whereToBuy from "./where-to-buy-pokemon-cards-online";
import * as resealed from "./how-to-avoid-resealed-pokemon-products";
import * as buildBattle from "./pokemon-build-and-battle-box";

export const GUIDE_MODULES: Record<GuideSlug, GuideModule> = {
  "how-many-packs-in-pokemon-products": howManyPacks,
  "booster-box-vs-etb-vs-booster-bundle": boxVsEtbVsBundle,
  "are-pokemon-booster-boxes-worth-it": areBoxesWorthIt,
  "pokemon-sealed-products-explained": explained,
  "pokemon-tcg-msrp": msrp,
  "how-to-preorder-pokemon-tcg": preorder,
  "whats-in-a-pokemon-elite-trainer-box": etb,
  "pokemon-center-etb-vs-elite-trainer-box": pcEtb,
  "cheapest-way-to-buy-pokemon-packs": cheapest,
  "where-to-buy-pokemon-cards-online": whereToBuy,
  "how-to-avoid-resealed-pokemon-products": resealed,
  "pokemon-build-and-battle-box": buildBattle,
};
