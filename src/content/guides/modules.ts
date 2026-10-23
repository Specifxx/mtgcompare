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
import * as cheapestPacks from "./cheapest-way-to-buy-magic-packs";
import * as playVsCollector from "./play-vs-collector-booster-box-value-by-set";
import * as universesBeyond from "./universes-beyond-sealed-price-guide";
import * as commander from "./commander-precon-price-guide";
import * as secretLair from "./secret-lair-drops-explained";
import * as gifts from "./magic-sealed-gifts-under-50";
import * as calendar from "./magic-release-dates-preorder-calendar";
import * as wrap from "./magic-sealed-market-wrap";

export const GUIDE_MODULES: Record<GuideSlug, GuideModule> = {
  "play-booster-vs-collector-booster-vs-bundle": compare,
  "how-many-packs-in-magic-products": howManyPacks,
  "magic-sealed-products-explained": explained,
  "is-a-collector-booster-box-worth-it": collector,
  "where-to-buy-magic-sealed-online": whereToBuy,
  "how-to-preorder-magic-sets": preorder,
  "how-to-avoid-resealed-magic-products": resealed,
  "magic-msrp": msrp,
  "cheapest-way-to-buy-magic-packs": cheapestPacks,
  "play-vs-collector-booster-box-value-by-set": playVsCollector,
  "universes-beyond-sealed-price-guide": universesBeyond,
  "commander-precon-price-guide": commander,
  "secret-lair-drops-explained": secretLair,
  "magic-sealed-gifts-under-50": gifts,
  "magic-release-dates-preorder-calendar": calendar,
  "magic-sealed-market-wrap": wrap,
};
