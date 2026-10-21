// Each guide's body module, by slug: what /[region]/guides/[slug] renders. Kept apart from the registry (index.ts), which the
// sitemap imports and which must stay free of React and the database.
import type { GuideSlug } from "./index";
import type { GuideModule } from "./kit";
import * as compare from "./play-booster-vs-collector-booster-vs-bundle";
import * as howManyPacks from "./how-many-packs-in-magic-products";
import * as explained from "./magic-sealed-products-explained";
import * as collector from "./is-a-collector-booster-box-worth-it";
import * as whereToBuy from "./where-to-buy-magic-sealed-online";
import * as preorder from "./how-to-preorder-magic-sets";
import * as resealed from "./how-to-avoid-resealed-magic-products";
import * as msrp from "./magic-msrp";

export const GUIDE_MODULES: Record<GuideSlug, GuideModule> = {
  "play-booster-vs-collector-booster-vs-bundle": compare,
  "how-many-packs-in-magic-products": howManyPacks,
  "magic-sealed-products-explained": explained,
  "is-a-collector-booster-box-worth-it": collector,
  "where-to-buy-magic-sealed-online": whereToBuy,
  "how-to-preorder-magic-sets": preorder,
  "how-to-avoid-resealed-magic-products": resealed,
  "magic-msrp": msrp,
};
