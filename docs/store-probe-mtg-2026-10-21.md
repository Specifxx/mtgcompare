# MTG sealed store probe, 2026-10-21

Builds `src/data/stores.json` for MTG Compare (Magic sealed only).

## Method

- Candidates: 669 unique bases: the old MTG Compare registry (Shopify/WooCommerce rows only; ShadowPOS, Ecwid, BigCommerce and nopCommerce dropped) plus DexCompare's Pokémon registry.
- Per store, ~1 request/second per host: `/meta.json` (currency, home country); `/collections.json?limit=250` (up to 4 pages); handles scored as Magic (`mtg`/`magic`) + sealed words (sealed, booster, bundle, commander, display, deck, box, product...), excluding singles/cards/foil/accessories/sleeves/tokens/graded/Japanese/pre-order handles; the top 4 read with `/collections/<h>/products.json?limit=250`. WooCommerce: Store API categories and products.
- A product counts as English Magic sealed when its title has a sealed word (booster, bundle, commander deck, collector, display, prerelease, starter kit...) and a Magic word, and names no other game or non-English language.
- A handle is kept with >= 3 such products and <= 2,000 products (the importer reads at most 8 pages of 250); extra handles only when they add >= 3 new products; at most 3 handles. A store is kept with >= 5 distinct Magic sealed products.
- Market from the store's currency (AUD AU, USD US, GBP UK, CAD CA, NZD NZ, EUR EU, SGD SG); country from `/meta.json`. Duplicate hosts (www/non-www, myshopify mirrors) collapsed.

## Result

383 stores kept: AU 54, CA 118, EU 35, NZ 11, SG 11, UK 40, US 114.

Rejected: 239 with no qualifying Magic sealed collection, 22 under 5 products, 17 with no readable currency (no /meta.json).

Not re-checked here: whether the importer's own title filter accepts every product (the importer was still Pokémon-specific at probe time). Generic `magic-the-gathering` handles may also carry some singles; they are under the 2,000-product cap.
