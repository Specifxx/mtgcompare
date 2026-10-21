// Each post's body module, by slug. Kept apart from the registry (index.ts), which must stay free of React and the database.
import type { PostSlug } from "./index";
import type { PostModule } from "./kit";
import { cheapest, dearest } from "./posts/boxes";
import { cheaperAbroad, whereToBuy } from "./posts/markets";
import { commanderDecks, mechanics, releaseDate, whereToBuyStarTrek } from "./posts/star-trek";

export const POST_MODULES: Record<PostSlug, PostModule> = {
  "magic-star-trek-release-date-products": releaseDate,
  "magic-star-trek-commander-decks": commanderDecks,
  "magic-star-trek-mechanics-explained": mechanics,
  "where-to-buy-magic-star-trek": whereToBuyStarTrek,
  "cheapest-magic-booster-boxes": cheapest,
  "magic-booster-box-prices": dearest,
  "where-to-buy-magic-cards": whereToBuy,
  "are-magic-cards-cheaper-abroad": cheaperAbroad,
};
