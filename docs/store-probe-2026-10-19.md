# Store probe, 19 October 2026: Beaches TCG

The owner asked for [Beaches TCG](https://beachestcg.com.au/) (Mona Vale, NSW;
"I think they might only do sealed products"). One store, same method and bar as
[`store-probe-2026-09-28.md`](store-probe-2026-09-28.md): `scripts/probe-stores.ts`
at concurrency 3, the market's currency, at least 3 English Pokémon sealed products
through `identify()` and at least one in stock at probe time. Its row is in
[`store-probe-2026-10-19.csv`](store-probe-2026-10-19.csv).

| Region | Key | Store | Base | Listed | In stock | Collection read |
| --- | --- | --- | --- | ---: | ---: | --- |
| AU | `beachestcg` | Beaches TCG | beachestcg.com.au | 32 | 1 | pokemon-tcg |

- **Counts**: the probe found 36 sealed products (1 in stock) before the rules
  below; with them, 32 (the fixture test below). A second probe the same morning got
  a 429: Shopify throttles per IP, and the import then keeps the store's previous
  rows and carries on.
- **Feed**: Shopify (`qf1nsm-k0.myshopify.com`); `/meta.json` says AUD, country AU,
  ships to AU only. robots.txt allows `/collections/*/products.json`.
- **Collections**: of the store's 20, the probe keeps only `pokemon-tcg` (54
  products). `pokemon-slabs` (graded cards) is refused by its handle; the others are
  other games, accessories, events and sales.

## What it lists

The live feed of 19 October is saved as
[`tests/fixtures/beachestcg-pokemon-tcg-2026-10-19.json`](../tests/fixtures/beachestcg-pokemon-tcg-2026-10-19.json)
(handle, title, variants), and `tests/importer.test.ts` ("a new store's live feed")
runs it through `readShopifyCollection` and `rowsFromReads` and pins every title's
product key or refusal. Of 54 products, 32 are listed (one in stock: "Chaos rising
toxel blister", A$11.99) and 22 refused: 13 Japanese (foreign), "Pokemon Ninja
Spinner booster pack" (Japanese by its description; no English set has the name,
so `no-set`), 3 accessories (top loaders, a playmat, assorted tech sticker packs)
and the 5 refusals below.

Worth knowing: "Chaos rising toxel blister" (a single-pack blister by its
description) joins "Chaos Rising Blister - Toxel", where two other stores' listings
worded the same way already sit.

## Classifier rules added

- `sets.ts`: "Stella Crown" is the store's spelling of Stellar Crown (its photo is
  the English pack). Japan's set is Stellar Miracle, and Japanese titles are refused
  as foreign first.
- `sealed-title.ts`, `assortedOfDistinct`: an "assorted" ex Box that names no
  Pokémon ("Pokemon 30th anniversary ex box assorted": the Greninja ex or the
  Sylveon ex Box) and an assorted Mega Charizard or Mega Mewtwo product ("Mega
  Charizard Tin - Assorted": X or Y) are refused as vague. A set's assorted mini
  tins and blisters still file as the set's mini tin or blister.
- `sealed-title.ts`: a set-less collection of a Pokémon sold as both a Special and
  a Premium Collection that names neither is refused as vague. "Pokemon - Charizard
  Ex Box" is the Special Collection by its photo but was being filed as the Premium
  Collection.
- `sealed-title.ts`, `UNQUALIFIED`: two set-less titles that name a Pokémon but no
  product are refused as vague instead of making pages of their own: an
  unqualified Kyurem ex box ("Pokemon Kyurem ex box": Black or White Kyurem? The
  photo is the Black Kyurem ex Box) and a tin named only "Mega Gengar" ("Mega
  Gengar tin": no tin has that name; Mega Gengar's is the Mega Moonlit Tin). Exact
  signatures, not a rule for every Pokémon: "Mega Charizard Tin", "Mega Forces Tin"
  and "Mega Moonlit Tin" are tins' own names, and "Mega Gengar ex Tin" and "Mega
  Clefable ex Tin" (Psydeck TCG's listings, the only offer on each page) keep the
  pages they have.

Against the published catalogue of 18 October (49,084 offers, old and new
`identify()` side by side), 9 other offers change, all to refused: four Canadian
"Charizard EX Box" listings at C$360 to C$9,999 that sat on the Charizard ex
Premium Collection page, three assorted Mega Charizard tins (AU Collectors
Colosseum, AU Grailborne in stock at A$99, NZ Pop Stop) and two assorted Ascended
Heroes Mega ex Boxes (AU PokéBox, AU The Wandering Collector). No product loses its
last offer and no product name changes key, so no page moves or disappears. The
`UNQUALIFIED` signatures change none of the 49,084.

## Postage

DexCompare records no postage for any store: every price is before delivery.
Beaches publishes no flat rate or free-shipping threshold. Its Terms & Conditions
(beachestcg.com.au/pages/terms-conditions, section 4) say: "Shipping costs and
estimated delivery times are provided at checkout and may vary based on your
location and chosen shipping method". It ships within Australia only.

## Notes

- Several 30th Celebration listings say "In store only, while stock lasts" in
  their descriptions, not their titles. All were sold out on 19 October. The import
  reads titles, so if they come back orderable they will show as in stock.
- With one product in stock, the store turns dormant (20+ listings, none in stock)
  as soon as that sells out. `prune-registry.ts` keeps it: it lists 32.
