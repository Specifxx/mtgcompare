# Store probe, September 2026

How the store list in `src/data/stores.json` was built, so it can be audited
and re-run. Every row of [`store-probe-2026-09.csv`](store-probe-2026-09.csv)
is one store that was checked live, with its outcome.

## Where the candidates came from

1. **Rift Compare's registry** (`TCGEmpire/src/lib/retailers.ts`, 171 stores)
   and the **old DexCompare registry** (69 stores) — 209 unique stores. Most
   are Riftbound or singles shops; the question was which also sell Pokémon
   sealed.
2. **New stores**, found by web search and store directories per region and
   pre-checked for a public Shopify/WooCommerce feed and Pokémon listings:
   AU 46, NZ 13, US 59, UK 35, EU 60, CA 34, SG 16.

## How each store was checked

`scripts/probe-stores.ts`, the same code path the importer uses:

- **Platform**: Shopify `products.json`, else the WooCommerce Store API.
  Stores on other platforms (BigCommerce, Wix, Squarespace, custom builds) are
  out of scope — there's no public feed to read.
- **Currency**: the shop's base currency (Shopify `/meta.json`, or the Woo
  feed's `currency_code`) must be the region's. Eight stores listed as US in
  the old registries turned out to charge CAD; they were re-checked as Canadian
  stores. The check also caught that Shopify converts prices to the visitor's
  currency by IP: every read passes `?country=` with the store's own country.
- **Pokémon sealed**: the store's collections are ranked by name, the best
  few are read, and every title goes through `identify()`
  (`src/lib/sealed-title.ts`). Only English Pokémon sealed product counts —
  singles, graded cards, accessories, other games, other languages and
  store-made bundles don't.
- **Bar**: at least 3 sealed products. The chosen collections (at most 4 per
  store) are the fewest that cover what was found, so the daily import reads
  as little as possible.

Shopify rate-limits by IP across all its storefronts. The first pass ran ten
stores at a time and got hundreds of 429s; stores that were rate-limited were
re-probed at three at a time, which is also the importer's default.

## Result

See the CSV for every store. Summary (latest result per store):

| Region | Checked | Listed | Too few sealed | Wrong / unreadable currency | No public feed |
| --- | ---: | ---: | ---: | ---: | ---: |
| AU | 89 | 62 | 24 | 1 | 2 |
| CA | 95 | 79 | 15 | 0 | 0 |
| EU | 72 | 62 | 9 | 1 | 0 |
| NZ | 13 | 8 | 3 | 2 | 0 |
| SG | 26 | 16 | 10 | 0 | 0 |
| UK | 70 | 58 | 11 | 1 | 0 |
| US | 107 | 66 | 37 | 3 | 1 |
| **Total** | **472** | **351** | **109** | **8** | **3** |

(One CA store stayed rate-limited on every attempt and isn't listed.)

After the probe, a full import with the final classifier re-checked every
listed store, and `scripts/prune-registry.ts` removed the 7 that read fine but
listed fewer than 3 English sealed products (mostly EU shops whose Pokémon
stock turned out to be German, French or Japanese editions once the language
filter learned those languages' words). **Final registry: 344 stores** —
AU 60, CA 79, EU 58, NZ 8, SG 16, UK 57, US 66.

## Seen but not addable (other platforms)

Big names that would need their own adapter: EB Games / JB Hi-Fi / Big W
(AU), GameNerdz, Steel City Collectibles, DA Card World, Collector's Cache,
ToyWiz (US), Chaos Cards, Magic Madhouse, Big Orbit Cards (UK), Project EXT on
CrystalCommerce, Sakura Play, Kyo Cards, Genie TCG (SG), TheCardMrkt on Square
(CA). Rift Compare's `pending-platforms.ts` explains why CrystalCommerce stores
are held back until a store confirms it's happy to be read.
