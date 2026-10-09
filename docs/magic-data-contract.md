# Magic data contract

The data rules of MTG Compare, adopted from the port contract of 2026-10-08. CLAUDE.md states them in one paragraph each; this page is the long form (the glossary, the invariants and what pins them, the vocabulary rules, slugs and URLs, the catalogue and tracking policy, finish handling per surface). The code blocks of the contract (the frozen TypeScript) are not copied: the source files are the truth (`src/lib/constants.ts`, `catalog.ts`, `track.ts`, `images.ts`, `data/plane/*`). The real fixtures are `tests/fixtures/magic-products.json` (57 real products that pin every rule). Where this page and the repository disagree, the repository wins and `requests/AMENDMENTS.md` of the port records why.

## 1. Glossary and invariants

Two sources feed every row and they own **different facts**. TCGplayer (via TCGCSV) owns *what is sold and for how much*: product, group, finish rows, prices, buy URL, its own product name and Number. Scryfall owns *what the card is*: oracle identity and rules facts, the printing's set code, collector number, layout, frame and promo facts, legalities, popularity. Neither source's *name* is an identity. Where each kind of data LIVES is decided by the owner addendum: public data (catalogue, prices, per-store offers, history and every precomputed public view) is published JSON on GitHub; Neon holds only private, user and operations state (section 12).

### 1.1 Glossary (use these words exactly; the code names follow)

| Term | Definition | Code name | Count |
|---|---|---|---|
| **Oracle card** | One rules object, Scryfall `oracle_id`: name, mana cost, type line, colours, identity, legalities, keywords, rules text, P/T, EDHREC rank, Reserved List. A product with no Scryfall join has **no** oracle (`oracleId` is null; there are no synthetic rows) | `Oracle`, `OracleDetail`, `Card.oracleId` | 34,801 joinable [S]; **33,429 priced** [V] |
| **TCGplayer product** | One `productId` of TCGCSV category 1. A **single** iff its `extendedData` has `Rarity`; otherwise a sealed/other product (never joined to Scryfall) | `productId` | 115,422 singles, 3,725 sealed/other [S] |
| **Printing (Scryfall)** | One Scryfall card object: a set, a collector number, a language, a frame and promo treatment. It links to at most two products (base + `tcgplayer_etched_id`); a product links to at most two printings (the star twin of the 7th to 10th Edition) | `Card.scryId`, `Card.sc`, `ScryfallRow` | 118,601 rows, 109,465 paper [S] |
| **Card row** | One TCGplayer product that is a single card we know about: the unit of URL, slug, image and buy link. It carries up to TWO finish units. **The Card row IS the product, not the printing and not the finish** | `Card`, `CardLite`, `Card.id = productId` | **98,796 class-0 + 195 specials + 65 Reserved List = 99,056** at the default floor [V] |
| **Finish** | A TCGplayer price row of a product: `Normal` (non-foil, `N`, index 0) or `Foil` (`F`, index 1). There are exactly two. Foil Etched, Surge, Galaxy, Rainbow... are **separate products** whose only row is `Foil` | `Finish = "N" \| "F"`, `finish` smallint | 49,623 singles carry both rows [S] |
| **Finish kind** | The display word of a unit: `nonfoil`, `foil`, `etched`. A *view* of (Card, Finish); never stored, never a third finish code | `FinishKind`, `finishKind()` | |
| **Unit** | `(productId, finish)`: the thing that has a price, store offers, a history series, an alert and a collection line. At most two per Card | `UnitRef`, `uid = productId * 2 + finishIndex`, `UnitKey = "<id>.<0\|1>"` | |
| **Tracked unit** | A unit whose own TCGplayer **market** is >= `TRACK_FLOOR_CENTS` (with hysteresis). The only units with store offers, eBay eligibility, history points and unit aggregates | `PRICE_MASK.TRACKN/TRACKF` | 28,538 units on 22,712 printings [V] |
| **Market value / display value** | The **market value** of a unit is its TCGplayer market price, and it is the only value that RANKS (sorts, range filters, hot-name score, indexes, `TOP`, the chase pool). The **display value** is the market, else a plausible thin low, flagged `LOWN`/`LOWF` ("low only"); it is shown, never ranked | `marketOnlyCents`, `unitValueCents` | 1,171 low-only headline rows worth $805,714 [V] |
| **Headline unit** | The unit a tile shows: Normal if Normal has a display value, else Foil. Computed at READ time. **Never persisted as an identity** | `headFinish`, `headlineOf()` | |
| **Treatment** | How a printing differs from the plain print: frame (borderless, showcase, extended, retro), foil pattern (etched, surge, galaxy), promo stamp (prerelease, promo pack), serialized. A closed vocabulary parsed from the TCGplayer name and the group, cross-checked with Scryfall. Words outside the vocabulary are NOT treatments: they live in the label | `TreatmentKey`, `Card.treat` | 74 keys; 3,438 distinct parenthetical tokens [S] |
| **Label** | The human variant text of a Card: treatment labels + version / event / pack / source words + unknown words, in name order | `Card.label` | |
| **Family** | The products that are the same Scryfall printing: a base product, its etched twin, variant products (Surge Foil, stamped copies). The root is the lowest productId that holds the id link | `Card.rootId` (null = alone) | 255 printings, 510 rows [S: MAGIC] |
| **Origin set** | The Scryfall set of the printing (`sc`): `pbro`, `plst`, `sld`, `m11`. It is what users type in a deck list. The TCGplayer **group** (`Set`) is the shelf TCGplayer files the product on; for 31 bucket groups it spans many origin sets | `Card.sc`, `Set`, `ScrySet` | 658 codes vs 401 groups in the catalogue [S: MAGIC] |
| **Class** | `cls`: 0 card, 1 token/emblem, 2 art-series card, 3 oversized, 4 helper. Decided once at import. Only class 0 has an oracle, counts as a printing of a card, can be the top printing or be tracked | `Card.cls`, `CARD_CLASS` | 98,796 / 195 listed specials [V] |
| **Catalogue row** | A `Card` that exists in the published catalogue. **Listed** (`LISTED` bit) = in search, lists, set checklists, deck and CSV resolution. **Thin** (`THIN` bit) = listed but below the index floor: it has a page, a search hit and a place in checklists, and it is `noindex` and absent from every sitemap. A row is never deleted because of a price | `Card`, `LISTED`, `THIN` | 33,640 thin of 98,796 [V] |
| **Published data** | Static, sharded, versioned JSON on GitHub (a private data repository), found through a pointer, read by the loaders. The only source of public pages. The site renders current prices even when Neon is down, rotated or deleted. Nothing paid is in it | section 12 | 9,488 files, 153 MB [M] |

**Naming bridge.** Sections 3 to 5, 8 and 11 were written against OP's table names (`Card`, `CardPrice`, `Unit`, `Offer`, `Oracle`, `Set`, `Sealed`, `Meta`). After the owner addendum there is no Postgres catalogue: those names stay as the names of CONCEPTS and of fields, and each one lives in a published file whose tuple positions are in `plane/formats.ts` (2.5 lists them column by column). "Written once", "stored" and "persisted" in those sections mean "carried by the published row and read back by the importer from the previously published state (6.2)".

| Name in the text | Lives in | Notes |
|---|---|---|
| `Card` (`id`, `slug`, `name`, `number`, `treat`, `label`, `flags`, `link`, `rootId`, `sc`, `cls`, `colors`, `mv`) | `cat/<d>/<b>.json`, `CatRow` (21 columns) | static; rewritten only when a row appears or its text changes |
| `Card.mask`, `CardPrice` (market and low per finish, change 7 d / 30 d, 90-day high) | `px/<d>/<b>.json`, `PxRow` | `mask` is `PRICE_MASK`; MARKET ONLY (a low-only unit has a null market) |
| `Unit`, `Unit.low*`, `Unit.stores*` (tracked units only) | `un/<d>/<b>.json`, `UnRow` | phase 2 of the publish |
| `Offer` | `of/<d>/<b>.json`, `OfferTuple` (7 elements) | `store` is a registry id, `path` is store-relative |
| `Oracle` (`legal`, `nPrint`, `flags`) | `or/<n>.json`, `OracleRow`; browse columns in `ix/o-*` | one character per format in `legal` |
| `Set`, `Set.tok` | `meta/sets.json`, `SetRow` | the token is write-once |
| `Sealed` | `sl/list-<k>.json`, `sl/d/<h>.json` | |
| `Meta`, the import part of `ImportRun` | `latest.json` and `status.json` (`runs`, `groups`, `config`, `guards`) | one courtesy `ImportRun` row in Neon |
| `Card.searchCount`, `viewCount` | `CardStat` in Neon | private; never published |

### 1.2 Invariants (a test or an audit script pins every one; T = unit test on a real productId of the fixtures, A = audit script, R = ratchet test of WP19)

| # | Invariant | Pinned by |
|---|---|---|
| C1 | `Card.id` is the TCGplayer `productId`; never renumbered or reused. `Set.id` is the `groupId`. `Sealed.id` is a productId | A `scripts/audit-catalogue.ts` (WP19) |
| C2 | **Every persisted price, offer, history point, alert, collection line, deal row and eBay row carries `finish`.** There is no slot and no "headline" in a key. `uid` and `UnitKey` are the only unit identifiers | T `tests/finish.test.ts`, A orphan sweep |
| C3 | The slug is `slugBase(product, Set.tok)`: a function of TCGCSV text. Written once on insert, never rewritten (no swap, no 308). The join never changes a slug. A collision keeps the first writer; rows are inserted in ascending productId and `data/slug-seed.json` lets a rebuilt catalogue reproduce every URL | T `tests/catalog.test.ts`, `tests/import-slug.test.ts` |
| C4 | A catalogue row is never deleted because of a price. Rows leave `LISTED` through hysteresis (the 20% Schmitt band) and become `GONE` only after two consecutive COMPLETE days of absence; `scripts/prune-catalog.ts` (manual) removes rows absent for 60 days that no `CollectionCard`, `PriceAlert`, `PublishedDeck` or `SetReleaseAlert` references | A, T |
| C5 | ETCHED (rule E) is set iff the product name carries the Foil Etched token, OR the product is joined through `tcgplayer_etched_id` AND that Scryfall row's `finishes` contains `etched`. A base product whose Scryfall row also lists `etched` is NOT etched | T fixtures 541332, 532997, 251776, 594545, 286677, 238617 |
| C6 | A shared TCGplayer id (two Scryfall printings, 1,204 today) is ONE Card row. Normal unit = the printing without a star; Foil unit = the star printing (`Card.fnum`) | T fixtures 2831, 3077 |
| C7 | Prices come from TCGCSV only. Scryfall `prices` are never stored or shown (up to 24 h stale, absent without an id, equal to the cent for only 89.3% of finish pairs). Scryfall `purchase_uris` / `related_uris` carry Scryfall's affiliate codes and are never stored or rendered | T `tests/scryfall.test.ts` |
| C8 | Oracle facts come from Scryfall only. A product without a join shows no mana cost, colours, legalities or oracle text; its type is the TCGplayer `SubType` as text. **Unknown is not "not legal"** | T `tests/legalities.test.ts` |
| C9 | `Card.colors`, `mv`, `ptype` are denormalised copies of the card's oracle; the importer writes both in one publish; an audit compares them | A |
| C10 | Names are never an identity. Joins use ids (productId, oracle_id, Scryfall id); names appear only as a tie-break inside a `(set, number)` key and in the in-memory store matcher | T join tests |
| C11 | `cls != 0` implies no oracle, `link = NONE`, never `TOP`, never tracked, never counted as another printing of a card, always `THIN` | T, A |
| C12 | Closed vocabularies are open at the edges: an unknown treatment word, set type, layout, promo type, frame effect, format key or finish subtype is counted in the run summary, kept where informative (label, `Oracle.layout`), and never fails the run | T `tests/catalog.test.ts` |
| C13 | **Premium gates only OUR analytics** (Deal Finder's ranking, filters and member integrations, Rising Cards, Demand Finder, history beyond the free window, alerts, Best Basket, exports of our own computed data). Names, images, oracle facts, legalities, search, set browsing and prices stay free for everyone; no export contains bulk Scryfall fields. Scryfall-derived loaders are never behind `isPremium` | T `tests/premium-gates.test.ts`, R `tests/premium-gates-pages.test.ts` |
| C14 | `Card.number` is a locator: a lookup by `(sc, nkey)` returns a LIST (1 to 3 products), resolved by finish/treatment words, never assumed unique | T `tests/resolve.test.ts` |
| C15 | No `unstable_cache` outside `src/lib/data/`; no `get*` loader (called as a function, not a method) inside an `unstable_cache` callback, directly or through a helper; no cache entry above 1 MB (hard ceiling 2 MB) AS NEXT MEASURES IT; every collection-returning loader has a budget row measured on real rows. Mechanism and numbers: sections 7 and 12 | R `tests/nested-cache.test.ts`, T `tests/plane-budget.test.ts` |
| C16 | Nothing under `src/app` imports `@/lib/db`; the per-user library list in `CLAUDE.md` is the only other reader of Neon. Public pages never need Neon, and no public server render calls a Neon-backed loader except the allowed deck reads (7.13) | R `tests/app-no-db-import.test.ts`, `tests/public-no-neon.test.ts` |
| C17 | The publisher fails closed: any failsafe aborts BEFORE the pointer moves; a partial TCGCSV day never deletes, nulls or unlists. A group or store that vanishes or comes back unpriced is HELD (rows keep every flag), not unlisted | T `tests/import-failsafe.test.ts` |
| C18 | Publishing is idempotent: a second run on the same price day produces byte-identical shards and moves nothing but the same-day history point | T `tests/import-idempotent.test.ts` |
| C19 | A legality badge on a printing page is shown only when the printing is playable as printed (`NOTPLAY` clear); the oracle-level grid is shown on the oracle block with an "as printed" note when `NOTPLAY` is set | T |
| C20 | Store offers exist only for tracked units and only from stores and public feeds. TCGplayer is the catalogue price (a synthesised row); eBay is its own block (never an offer row, never in store lows, never counted as a store, never in alerts or baskets) | T `tests/no-ebay-api.test.ts` (R) |
| C21 | eBay content is display-only, short-lived and **never written to GitHub or to any file published with the source**: no seller identity, hotlinked images, an age label on every live tile and row, swept at 72 h; it lives in Neon only | T `tests/ebay-claims.test.ts`, R `tests/publication-guard.test.ts` |
| C22 | Writers are single: the importer/publisher writes the published catalogue, prices, offers and views and (to Neon) only a courtesy `ImportRun` row; the eBay job writes `EbayTrack`, `EbayBest`, `EbayPanel`, `EbayBanner`, `EbayLedger`; the demand overlay job writes the two preview slices (`pv/`) only; all of them publish through one concurrency group (`data-publish`, `queue: max`) | A, T `tests/plane-workflows.test.ts` |
| C23 | A DB-backed test skips (never fails) when `TEST_DATABASE_URL` is unset, so `npm test` stays green on a machine without Postgres; with it set, the same tests run against `mtgcompare_test` and refuse any host that is not local or `*_test`/`*_scratch` | T `tests/helpers/pg.ts` (WP19) |
| C24 | **Public data is files.** The pages, the sitemap, the price guide, the deal inputs and the share images render from the published data; if Neon is unreachable they degrade (no eBay tiles, no member features), they do not fail | section 12, R `tests/build-no-data.test.ts` |
| C25 | **The importer reads nothing from Neon.** Its memory (previous flags, slug map, `lastGroups`, config hash, guard trips) is the previously published state | section 12 |
| C26 | **Releases are weekly and data never waits for one.** A data refresh needs no deploy and no cache purge (the pointer moves, files are read at the commit it names); a build prerenders no data-backed page and needs neither the database nor the data host | R `tests/deploy-cadence.test.ts`, `tests/build-no-data.test.ts` |
| C27 | **A Premium tool's rows are cut once, on the server, where they are loaded** (`premium-gates.ts`), never hidden with CSS and never in a file a free visitor can fetch | T `tests/premium-gates.test.ts`, R `tests/premium-gates-pages.test.ts` |
| C28 | **Nothing paid is a file.** The only files derived from the private demand counters are the two clear preview slices (`pv/demand.json`: at most 10 rows of the 7-day top searched; `pv/rising.json`: at most 3 picks per scope). No ranked list, score or demand count is published; the paid lists are computed per request behind an opaque `Entitlement` and cached under tier-neutral keys | T `tests/plane-no-premium.test.ts`, `tests/plane-entitlement.test.ts`, `tests/plane-validate.test.ts`; R `tests/publication-guard.test.ts` |
| C29 | Admin access is one helper per page and per route, fail closed, and an admin counts as Premium | T `tests/admin.test.ts` |
| C30 | Every environment variable the code reads is in the table of Annex B; secrets are never `NEXT_PUBLIC_*`; no Rift affiliate id is a default | R `tests/env-names.test.ts` |
| C31 | **The data format is additive inside `v1`.** A week-old deployment must read today's files and a rolled-back dataset must be readable by today's code: new files are optional, new tuple elements are appended, nothing changes meaning or position; a breaking change ships as `v2` beside `v1` for two releases | T `tests/plane-format.test.ts` (golden samples), 2.9 |
| C32 | **Every published file is JSON, at most 1,000,000 bytes, in an allow-listed family with a budget row**, and the validator runs BEFORE any commit: a refusal pushes only a status commit and the last good publish stays live | T `tests/plane-validate.test.ts`, `tests/plane-budget.test.ts` |

---


### 3.1 What the vocabulary contains

| Vocabulary | Size | Notes |
|---|---:|---|
| `RARITIES` | 8 | `M R U C S P L T`; "L" is basic Land (OP's L was Leader). Typed `Record<string, RarityInfo>` like OP's, with the exact key union `Rarity` |
| Finishes | 2 | `N`, `F`. Etched and the foil patterns are products, not finishes |
| `TREATMENTS` | 74 | 9 frame, 8 art, 5 edition, 19 promo, 1 serial, 23 foil pattern, 9 language; 13 are hidden from the label and the filter UI (`nopw`, `placing`, `sb`, `otherfoil`, the 9 languages); 22 carry a Scryfall implication (`sf`) |
| `SET_KINDS` | 13 | hidden from search, browse, price guide, sets index: `art-series`, `oversized` only. Typed `Record<string, SetKindInfo>` like OP's, with the exact key union `SetKind` |
| `SEALED_KINDS` | 11 | `sealedKind()` puts 48 of 3,712 products in `Other` |
| `FORMATS` | 22 | the 22 characters of `Oracle.legal` (headroom: the string has no fixed length, so a 23rd format appends a character without a migration; a reader treats a missing character as unknown, 2.4) |
| `COLORS` | 5 + 2 pseudo | keyed by name, WUBRG bits; `COLOR_GROUPS` colourless and multicolor |
| `PRIMARY_TYPES` | 10 | `Card.ptype` is the index |
| `CARD_FLAGS` | 14 bits | `Card.flags` (smallint; bit 15 is never used) |
| `PRICE_MASK` | 13 bits | `HASN HASF HEADF TRACKN TRACKF LOWN LOWF GONE LISTED TOP CHEAP` + **`THIN` (2048)** + **`GONEP` (4096)** |
| `ORACLE_FLAGS` | 6 bits | `Oracle.flags` |

Group kinds over the 454 real groups: expansion 127, deck 73, masters 52, commander 43, art-series 39, promo 36, promo-pack 28, core 20, unset 8, secret-lair 6, gold-border 4, list 2, oversized 1; **imported 439**; not imported: foreign 8, non-card 7. 31 imported groups are rolling-date "bucket" groups (`ROLLING_PUBLISHED`): Prerelease Cards, The List Reprints, Special Guests, Secret Lair Drop, promo collections. Their cards come from many origin sets, which is why `Card.sc` exists.

### 3.2 The rules the constants implement (stated once; every package reads them here)

1. **A closed treatment vocabulary.** The words of a TCGplayer product name are matched against `TREATMENT_BY_SYNONYM` (folded phrases; a trailing `*` matches the phrase plus more words, so `neon ink*` takes "Neon Ink Yellow"). A word outside the vocabulary is **not** a treatment: it goes to `Card.label` (display), the slug (identity) and the `unknownWords` counter of the run summary (3,438 distinct parenthetical tokens exist today, 1,061 are unknown words). There are no `raw:` keys. Finish words (`IGNORED_FINISH_WORDS`) never become treatments or label text.
2. **Rule S: what Scryfall may imply.** For the root member of a family joined by id or etched id, a Scryfall fact in `sf` (`border:borderless`, `frame:extendedart`, `promo:prerelease`, `promo:serialized`, `flag:full_art`, ...) adds that treatment key **only if** its `kind` is frame, art, serial, edition or promo. It never adds a foil-pattern key and never `retro`, `futuresight` or `whiteborder` (marked "NO sf" in the table: a 1997-frame printing in an old set is not "retro"; 5,159 printings are white-bordered by default). A foil pattern is a property of the PRODUCT, so it comes from the product's own name only.
3. **Rule E: etched (changed in this pass, budget critique 10, [V] `critic-budget-work/etched.py`).** `CARD_FLAGS.ETCHED` is set iff **the product name carries the Foil Etched token, OR the product is joined through `tcgplayer_etched_id` and that Scryfall row's `finishes` contains `etched`**. The product name is TCGplayer's own statement of what it sells. A base product whose Scryfall row also lists `etched` is **not** etched (326 such rows today). The first draft missed 3 real products named "(Foil Etched)" whose etched-id row lacks `etched` in `finishes` (251773 Demonlord Belzenlok, 251776 Griselbrand, 251782 Kothophed): they now render "Foil Etched". Two anomalies remain and are fixtures: 594545 (Sol Ring) and 286677 (Inquisitor Greyfax), both "not etched". 1,152 products carry both token and flag; 63 carry the flag without the token (Display Commander "Thick Stock").
4. **Star twin of a shared id.** When two Scryfall printings share one TCGplayer id (1,204 ids, 1,187 clean pairs in the 7th to 10th Edition and Collectors' sets), they are ONE `Card`: the **Normal unit is the printing without a star** (`Card.number`), the **Foil unit is the star printing** (`Card.fnum`, `CARD_FLAGS.STAR`); 17 irregular pairs take the lowest collector number and set no `fnum` (counted `sharedOdd`). `displayNumber(card, finish)` picks the number to show.
5. **Effective rarity.** `effectiveRarity({ tcg, scry, cls })`: tokens are `T`, TCGplayer's `L` stays `L`, a joined card shows Scryfall's true rarity (TCGplayer files 4,382 of 4,630 joined Promo/Special rows under P or S while Scryfall says C/U/R/M), an unjoined card keeps TCGplayer's letter.
6. **Names.** `Card.name = displayName(layout, oracle.name)`: split, fuse and aftermath keep "A // B"; transform, modal_dfc, adventure, flip, prepare and reversible_card show the front face (that is how TCGplayer, the stores and users write them); everything else is Scryfall's name. A Universes Beyond reskin's printed name is `Card.alt` (`reskinAlt`), searched and matched. `nameForms()` gives the folded forms the store matcher and the search use.
7. **Legality has five states** per format, one character each in `Oracle.legal`: `L` legal, `N` not legal, `B` banned, `R` restricted, `?` unknown. **Unknown renders as nothing**, never as "not legal" (C8). `playableAsPrinted()` is false for gold-border, silver-border, oversized and Un-set printings (`NOTPLAY`); a printing page shows a legality badge only when it is true (C19). `oldschool` is not stored (it differs per printing, 772 oracles).
8. **Commander eligibility** (`oracleFlags`, `ORACLE_FLAGS.COMMANDER`): commander-legal AND (the FRONT face is a Legendary Creature, or a Legendary Vehicle or Spacecraft with power and toughness, or the text says "can be your commander"). 3,467 oracles; 27 oracles that are legendary creatures only on the back face are excluded.
9. **Collector numbers are locators.** `nkey` is the lookup key ("029/281" to "29", "213★" to "213", "A39" to "a39", "551a", "KHC-29" kept; letters and prefixes are identity, stars are not); `nsort` is the natural-sort integer ("2" < "10" < "10★" < "10a" < "11"; prefixed numbers sort after plain; no number sorts last); a lookup by `(sc, nkey)` returns a LIST of 1 to 3 products (C14).
10. **Set kinds** are decided by `classifyGroup` on the group NAME (never the abbreviation), first rule wins; `foreign` and `non-card` groups are not imported. `gold-border` and `unset` stay visible (Black Lotus Collector's Edition is a collectible) and their printings carry `NOTPLAY`.
11. **Group-derived treatments** (`GROUP_TREATMENTS`): where the group IS the treatment and the product name carries no word for it (`Prerelease Cards` gives `prerelease`, `Promo Pack:` gives `promopack`, `The List Reprints`, `Special Guests`, `Secret Lair`, ...). Applied to class 0 products; added to `treat` if absent.
12. **Products with a class.** `CARD_CLASS`: 0 card, 1 token or emblem, 2 art-series card, 3 oversized, 4 helper (rules, theme and insert cards). The class is decided once at import (section 6); only class 0 has an oracle, counts as a printing, can be `TOP` or tracked (C11).
13. **Market ranks, display shows (new, critique 5).** Anything that orders, filters or counts by value uses `marketOnlyCents`; a unit with only a thin low is shown as "low only" (`LOWN`/`LOWF`) with its low, and is never `TOP`, never tracked (unless `TRACK_LOW_BASIS=1`), never in an index or a "most expensive" list.
14. **Transliteration before folding (new, critique 12).** Letters that NFKD does not decompose (Æ Œ ß Ø Đ Ł Þ Ð) are transliterated first in `slugify`, in `fold`'s siblings and in oracle slugs: `Æther Vial` is `aether-vial`, `Ætherling` is `aetherling` (the draft produced `ther-vial` and `therling` for every Æ card).


## 4. Slug and URL scheme

Owner of the functions: **WP01a** (`src/lib/catalog.ts`, `src/lib/images.ts`); owners of the routes: the page packages named in 4.3. A slug is an address, so it is decided by one rule that anyone can recompute from public text.

### 4.1 Slugs

| Entity | Rule | Examples (real fixtures) | Write-once? |
|---|---|---|---|
| **Card** | `slugBase(product, Set.tok)` = `slugify([core, setTok, number, otherParentheticalWords].join(" "))`. `core` is the TCGplayer name with every `(...)` and `[...]` group removed; `setTok` is the group's write-once token; `number` is the first 1 to 4 digit parenthetical (the collector number written in the name, `0205` gives `205`), else `numberToken(Number)` (leading zeros and `/total` removed, `7 // 2` gives `7`); every other parenthetical word keeps its TEXT, not a canonical key. Empty result: `card-<productId>`. | `forest-who-205` (496078), `plains-eoe-367-borderless-galaxy-foil` (638920), `ezio-auditore-da-firenze-acr-203-foil-etched` (541332), `griselbrand-sld-160-foil-etched` (251776), `birds-of-paradise-7ed-231` (2831), `fire-ice-dmr-215` (457193), `soldier-angel-double-sided-token-onc-7-2` (478655), `black-lotus-lea` (1042) | yes: the slug is stored with the catalogue row and never recomputed for an existing row |
| Card collision | `withProductSuffix(base, id)` = `<base cut to 80>-p<productId>`. **The first writer keeps the bare slug, forever.** New rows are inserted in ascending productId within a run, so on a fresh build the lower id wins (the one real collision: `serra-angel-30a-p-1`, the $23.48 Foil 284921 beats the $0.47 Foil 284951). A later row never takes a live slug: the "swap with a 308" idea of the budget critique is REJECTED, it would break write-once (C3) and add a redirect class for no visitor benefit | | |
| **Set** | `setSlugOf(group, tok)` = `slugify(bucket ? name : tok + " " + name)`; a collision gets `<slug>-g<groupId>` | `mh3-modern-horizons-3`, bucket group `prerelease-cards` | yes |
| **Set.tok** | `slugify(abbreviation)` if this group wins it, else `g<groupId>`; ties between groups sharing an abbreviation go to the lowest `KIND_RANK` (expansion, core, masters first, then commander, then the rest), then the lowest groupId (`chooseSetToks`) | `WHO` and `MOC` are each shared by two groups today: the loser is `g23166` / `g23109` | yes: stored tokens are passed back as `frozen` |
| **Oracle** | `oracleSlugOf(oracle, bareTaken)` = `slugify(name)` cut to 80; the oracle with the oldest `released_at` (then smallest id) keeps the bare slug, later ones get `-<first 8 chars of the uuid>`; empty gives `card-<8>`. Ligatures are transliterated first | `sol-ring`, `fire-ice`, **`aether-vial`** (was `ther-vial`) | yes |
| **Sealed** | `sealedSlugOf(name, id, bareTaken)` = `slugify(name)` cut to 80, duplicate gives `-<productId>`; inserted in ascending productId order | | yes |
| **Published deck** | OP's generator, unchanged; `commanderSlug` is the commander's oracle slug | | |

**Where the write-once state lives (addendum 9).** The importer reads nothing from Neon, so "already assigned" comes from the previously PUBLISHED catalogue (slug per row, token per group, bare-slug owner per oracle). If the published data is ever lost, `data/slug-seed.json` (committed to `main`; generated by `scripts/slug-seed.ts`, WP01b: the 439 `Set.tok` values, the 3 card-slug collisions and the 22 oracle same-slug groups with their winners) lets a rebuilt catalogue reproduce every URL a search engine already knows.

**Why the slug is a function of TCGplayer text only.** ADDITIVE built it from the Scryfall set code and number and SCALE from the Scryfall number; both then collide (MEASURED: ADDITIVE 13 collisions in 65,196 rows, SCALE 1,323 in 65,157 before raw keys) and both change when a join improves, which moves a live URL. MAGIC's rule uses only fields TCGCSV publishes: **3 collisions in all 111,839 included singles** (`checks/check-catalog.ts`: 111,836 distinct, re-run [V] with the ligature change: identical), no dependence on the Scryfall join, and it is unit-testable with no Scryfall data. The importer pre-checks each new slug against the in-memory set of published slugs.

`slugify` is OP's plus one addition: Æ Œ ß Ø Đ Ł Þ Ð are transliterated BEFORE NFKD, which does not decompose them (critique 12; the rest: NFKD, ASCII, `&` to "and", quotes dropped, `[^a-z0-9]+` to `-`, cap 90). `tests/catalog.test.ts` runs `slugBase` over `tests/fixtures/magic-products.json` (57 real products, each with its expected slug, `nkey`, `nsort`, class, rarity, finish flags and display name), over 111,839 real names for the collision count, and over the ligature vectors (`Æther Vial`, `Ætherling`, `Jötun Grunt`, `Lim-Dûl's Vault`).

### 4.2 Finish, family and number in URLs

| URL | Meaning |
|---|---|
| `/card/<slug>` | the canonical page of a product; the finish tab defaults to `defaultFinish()` (the first tracked finish, else the headline) |
| `/card/<slug>?finish=nonfoil\|foil\|etched` | a VIEW of the same page (`parseFinishParam`): selects the tab; any other value is ignored and never a 404; the canonical link is always the bare slug; never in the sitemap; `Disallow: /*?finish=` in robots |
| `?finish=etched` on a product that has an etched family member | 308 to that member's own slug (its Foil unit); on a product that is itself etched it selects Foil |
| **`/card/<set>/<number>`** (route `src/app/card/[slug]/[number]/page.tsx`) | the resolver users speak ("mh3/6"): `[slug]` holds the Scryfall SET CODE here, `[number]` the collector number; `resolveBySetNumber` on `(sc, nkey)`; one hit 308 to its slug; several hits (a base and a Surge Foil twin) render a chooser; none 404. **The draft's `/card/[sc]/[number]` cannot exist beside `/card/[slug]`: `next build` throws `You cannot use different slug names for the same dynamic path ('sc' !== 'slug')` [V, next 14.2.35; `tsc`, eslint and every unit test pass with it]. `tests/route-names.test.ts` walks `src/app` and fails on sibling dynamic directories with different names.** A set code can never equal a static child of `/card/[slug]` (`opengraph-image`), checked on ten real codes |
| `/cards/name/<oracleSlug>` | the rules object with all its printings (`getOraclePrintings`); indexable iff it has an indexable printing and at least two listed printings (4.4) |

### 4.3 Route table (OP route to MTG route; the page owner changes only its own files)

| OP route | MTG route | Owner | Change |
|---|---|---|---|
| `/` | `/` | WP15 | home feed; the eBay chase strip immediately under the hero |
| `/card/[slug]`, `/api/card/[slug]`, `/api/card/[slug]/view` | same | WP06 | `?finish=`; `/view` counts the view (batched, section 12) |
| (new) | `/card/[slug]/[number]` | WP06 | set + number resolver (above) |
| `/cards`, `/cards/all` | same | WP08 | `/cards/all?letter=` is the A-Z index of ORACLE names, not of printings |
| (new) | `/cards/name/[oracleSlug]` | WP08 | oracle hub |
| `/cards/rarity/[rarity]` (`RARITY_SLUGS`) | same | WP08 | 8 pages |
| `/cards/type/[type]` | same | WP08 | `PRIMARY_TYPES` |
| `/cards/printing/[printing]` | `/cards/treatment/[key]` | WP08 | greenfield: no redirect; `TREATMENT_KEYS` minus hidden ones |
| `/colors`, `/colors/[color]` | same | WP08 | 7 pages (`COLOR_PAGES`) |
| `/keywords`, `/keywords/[slug]` | same | WP08 | `Oracle.keywords` |
| `/sets`, `/sets/[slug]`, `/sets/[slug]/gallery` | same | WP12 | |
| `/sealed`, `/sealed/[slug]`, `/api/sealed/[slug]` | same | WP09 | |
| `/leaders`, `/leaders/[slug]` | `/commanders`, `/commanders/[slug]` | WP11 | `ORACLE_FLAGS.COMMANDER` |
| `/decks/leader/[leader]` | `/decks/commander/[commander]` | WP11 | |
| `/decks`, `/decks/[slug]`, `/deck` | same | WP11 | |
| `/tools/deal-finder`, `/tools/rising`, `/tools/demand`, `/api/deal-finder` | same | WP13 (deal), WP07 (rising, demand) | **Premium gates** (section 14) |
| `/sitemap.xml` (new), `/sitemaps/[section]` (new) | | WP15 | sectioned sitemaps (4.5) |
| `/robots.txt`, `/llms.txt`, `/llms-full.txt`, `/llm/*` (new) | | WP20 | AI-crawler policy and markdown mirrors |
| `/embed/*`, `/api/og`, extra `opengraph-image` routes (new); `/preorders` is a `next.config.js` redirect to `/release-dates` (no pre-order page was built) | | WP20 | growth surfaces |
| `/api/click` (restored) | | WP15 | outbound click log (10.32) |
| `/admin/*` | `/admin`, `/admin/{accounts,subscriptions,store-health,inbox,support,premium,demand,rising,decks}` (OP) + `/admin/{ebay,data,deploys,database,clicks,loyalty,mail,lookup,deals}` (new) | WP21 (WP13 for `deals`, WP04, WP07, WP10 for their OP pages) | section 15 |
| `/browse`, `/search`, `/price-guide`, `/market`, `/market/records`, `/movers`, `/singles`, `/gallery`, `/rising/[token]`, `/tools/*`, `/trade`, `/stores/*`, `/portfolio*`, `/c/[token]`, `/watching`, `/alerts*`, `/dashboard`, `/profile`, `/premium*`, `/blog*`, `/guides*`, `/learn`, `/about`, `/methodology`, regional pages `/au /uk /ca /sg /eu` | same | as OP | |

### 4.4 Indexing policy

A card page is indexable iff it is `LISTED`, not `THIN`, not `GONE`, class 0, and (`tracked != 0` or `TOP`): `isIndexable(mask, cls)` in `track.ts`; **35,050 URLs [V]** out of 98,796 class-0 rows (22,712 tracked printings and 21,443 `TOP` printings, 9,105 in both). Every other page is `noindex, follow` (`cardRobots` in WP06): the 33,640 `THIN` rows, class 1 to 4, hidden set kinds, Reserved List rows with no price (65), and any list URL with a query string except `page`. Robots disallows `/*?finish=`, `/*?sort=`, `/search`, `/api/`, `/admin`. An oracle hub is indexable iff the oracle has an indexable printing (21,667 do) and at least two listed printings: **15,180 hubs [V]**, the largest is Mountain with 774 printings (Forest 759, Island 753): the hub paginates. The floor stays 50 cents for INDEXING even though the catalogue floor is 1 cent: a page for a 5-cent bulk common is useful to the person who typed its name and thin to a crawler.


## 5. Catalogue and tracking policy

Owner **WP01a** (`src/lib/track.ts`), evaluated by the importer (WP01b) once per run. Three decisions, kept apart: **who gets a row** (the catalogue), **who gets a crawlable page** (the index) and **who gets prices from stores, history, alerts and eBay** (tracking). The first draft chose a 50-cent catalogue floor because every row cost Neon bytes against a 500 MB design target. The owner addendum moves the catalogue out of Neon, so that constraint is gone and the policy is rebuilt around what still binds: **published bytes and sitemap quality**. Every number below is recomputed by `checks/check-policy-snapshot.ts` and `checks/count_indexable.py` over the real 2026-10-07 snapshot (111,839 included singles) with the code of 5.7 [V].

### 5.1 Definitions

| Term | Definition | Stored as |
|---|---|---|
| Market value of a unit | its TCGplayer **market** price; `null` when the unit has only a thin low. **It is the only value that ranks** (sorts, range filters, hot-name score, `TOP`, the chase pool, indexes, value statistics): `marketOnlyCents` | `marketN/F` |
| Display value | the market, else its plausible low (`plausibleLow` drops a low under 25% of a market of $5 or more); a low-only value is shown as "low only" and flagged `LOWN`/`LOWF`, never ranked | `lowN/F`, `mask` |
| Catalogue row | a `Card` row exists in the published catalogue | row |
| Listed | in search, lists, set checklists, deck and CSV resolution | `mask` `LISTED` |
| **Thin** | listed, class 0, with score under `INDEX_FLOOR_CENTS` (or class 1 to 4): has a page, is `noindex`, is in no sitemap | `mask` `THIN` |
| Tracked unit | a (product, finish) whose own MARKET value is at least `TRACK_FLOOR_CENTS` (with hysteresis); low-only units are never tracked | `mask` `TRACKN` / `TRACKF` |
| Indexable | `isIndexable(mask, cls)`: LISTED, not THIN, not GONE, class 0, and (tracked or `TOP`) | derived (4.4) |
| `TOP` | the class-0 printing of an oracle with the highest `bestUsd` (MARKET values only; ties: lower id) | `mask` `TOP` |
| `CHEAP` | the cheapest regular Normal printing of an oracle (deck lines and CSV rows without a set resolve to it) | `mask` `CHEAP` |
| `GONEP` / `GONE` | absent from ONE / TWO consecutive COMPLETE TCGCSV days | `mask` |

### 5.2 The numbers (recomputed [V]; the first draft's column is kept for comparison)

| Quantity | Draft (floor 50 cents) | **Final (floor 1 cent)** |
|---|---:|---:|
| Included singles (439 groups, all classes) | 111,839 | 111,839 |
| Singles with no price on either finish | 1,593 | 1,593 |
| **Class-0 catalogue rows** | 65,156 | **98,796** |
| ... of which THIN (score under 50 cents) | n/a | **33,640** |
| ... of which index-eligible | 65,156 | 65,156 |
| Specials listed (class 1 to 4, best unit value >= $20) | 195 | 195 (always THIN) |
| Unpriced Reserved List rows (Black Lotus and kin), listed, `noindex` | 65 | 65 |
| **Card rows** (class 0 + specials + Reserved) | 65,416 | **99,056** |
| Priced oracles | 33,429 | 33,429 |
| ... with a catalogue row | **21,667 (64.8%)** | **33,429 (100%)** |
| Oracles with no row (not findable, not priceable in a deck, not importable from CSV) | **11,762** | 0 |
| **Tracked units, market basis, $5** | 28,538 on 22,712 printings | 28,538 on 22,712 (unchanged) |
| Same with low-only units counted (`TRACK_LOW_BASIS=1`) | 29,459 on 23,585 | same |
| Dual-finish printings in the catalogue | 32,071 | 49,248 |
| Printings whose only tracked unit is the **Foil** one although a Normal row exists | 5,760 | 5,760 |
| Units priced $4.00 to $4.99 (the exit band) | 4,022 | 4,022 |
| Indexable card pages | 35,050 | 35,050 |
| Indexable oracle hubs (an indexable printing and >= 2 listed printings) | 11,139 | **15,180** (largest: Mountain, 774) |
| Sitemap URLs / files | about 53,900 / 10 | about 58,000 / 10 |
| Low-only headline rows | 1,171 (not distinguished) | 1,171, shown as "low only", never ranked |

The fallback ladder (`catalogue-floor-ladder.txt`; each rung is an environment variable and a re-run, no code change) if the published bytes of the browse and search shards ever bind:

| `CATALOG_FLOOR_CENTS` | rows | oracles covered | oracle-completeness rows added | rows with completeness |
|---:|---:|---:|---:|---:|
| 50 | 65,156 | 21,667 of 33,429 | 11,762 | 76,918 |
| 25 | 88,503 | 30,399 | 3,030 | 91,533 |
| 10 | 97,719 | 33,247 | 182 | 97,901 |
| **1 (default)** | **98,796** | **33,429** | 0 | 98,796 |

Value coverage must name its denominator: the research total of $1,968,727 ("market else low, best finish") contains **1,392 products with no market price on any finish whose single thin listings add up to $820,493 (41.7%)** (a $203,067.70 Living Artifact, a $69,999.99 Cloud). On the market-only denominator ($1,135,309) the $5 set covers **93.0%**. Nothing is wrong with the floor; a reported figure must say which denominator it uses.

**What the addendum frees, and what it does not.** Freed: the Neon 500 MB row budget (rows cost published bytes now, `OFFER_ROWS_BUDGET` is now a published-bytes cap: 450,000 offers, with the file caps and the 500,000-offer projection in 7.11) and the 5 GB transfer (public pages read files). Still binding: (1) the byte size of the catalogue shards that every list and search touches (section 12 sizes the 98,796 rows: +14% raw bytes against the 65,351-row catalogue of the first draft, 2.6); (2) the Next fetch/Data Cache 2 MiB item ceiling per shard; (3) sitemap and crawl quality (a 5-cent bulk common is a fine page for the person who searched it and a thin page for a crawler: THIN keeps it out of the sitemap); (4) the store crawl depth (offers exist only for tracked units); (5) the eBay budget (tiered, section 15.2). The $5 TRACK floor therefore stays: it is a crawl, history and eBay decision now, not a storage one; stepping it to $2 (47,850 units) costs history files, store matching time and eBay allocation, and is measured, not assumed.

### 5.3 Rules

1. **Score** (decides the catalogue and the index): `min(max(marketOrLowN, marketOrLowF), PRICE_CLIP_CENTS) x (1 + 2 x pop)`, **unrounded** (rounding admits about 325 extra rows at 49.5 cents; `trackScoreCents` returns the float). `pop = max(1 / (1 + edhrecRank / 1500), reserved ? 0.5 : 0)`; 0 for an unjoined product or a class other than 0. The clip ($2,000) is for scoring only, never for display.
2. **Catalogue** (class 0): enter when `score >= CATALOG_FLOOR_CENTS` (**1**); stay while `score >= 0.8 x floor` (`inCatalogue`). Every priced single qualifies, so rule 2b exists for the day the floor is raised.
   2b. **Oracle completeness** (`CATALOG_ORACLE_COMPLETE=1`, `completenessPicks`): every priced class-0 oracle keeps at least its `TOP` printing listed whatever the floor (`TOP` ranks by MARKET, ties by the higher display value, then the lower id). At floor 50 it adds 11,762 rows, at 25 3,030, at 10 182, at 1 none. Deck lines, CSV rows, search, the name hubs and the commander pages can therefore always resolve an oracle.
3. **Index** (class 0): a listed row is THIN while `score < INDEX_FLOOR_CENTS` (50), with the same 0.8 Schmitt band (`isThin(score, wasIndexable, cls, cfg)`; a new row has `wasIndexable = false`). Thin rows are `noindex, follow`, absent from every sitemap, present everywhere else.
4. **Specials** (class 1 to 4: tokens, art cards, oversized, helpers): listed only when the best unit value (no popularity) is at least `CATALOG_SPECIAL_FLOOR_CENTS` (2,000), same 0.8 exit; never tracked, never joined to an oracle, never `TOP`, always THIN. `0` disables them. A $215 Treasure token (fixture 165632) stays reachable; the 5,764 token-class products do not bloat the catalogue.
5. **Tracking** (per unit): enter when the unit's MARKET value >= `TRACK_FLOOR_CENTS` (500); stay while >= `0.8 x 500` = $4.00 (`unitTracked`). A thin low is not a price: 1,392 no-market products hold $820k of single-listing "value", so `TRACK_LOW_BASIS=0`.
6. **Hysteresis is the only memory**, and it is read from the previously PUBLISHED catalogue (the `LISTED`, `THIN`, `TRACKN`, `TRACKF`, `GONEP` bits), never from Neon (C25). There is no day counter and no extra column. A unit between $4.00 and $5.00 keeps whichever state it had. The catalogue is therefore path-dependent for the 8,293 class-0 rows whose score sits in the 40 to 50 cent band: a fresh build lists them by the floor (1 cent) and indexes none of them until 50, a long-lived one keeps the indexed ones until 40. Annex C check 1 carries a range, not a point.
7. **Unpriced rows**: `inCatalogue` is evaluated only for priced rows. A class-0 row with no price on either finish keeps its previous `LISTED` **and its `TRACKN`/`TRACKF` bits** (a price outage is "unknown", not "zero"; the draft kept `LISTED` only, then `unitTracked(null, ...)` untracked the unit and its offers were deleted); a NEW unpriced row is listed only when its oracle is on the Reserved List (65 today); it carries no tracked bits.
8. **Absent products and groups**: a product missing from a COMPLETE day (F1 passed) gets `GONEP`; the second consecutive complete day without it gets `GONE`, loses `LISTED` and its tracked bits; the row stays (C4). It returns when TCGCSV lists it again. A whole GROUP that is absent, or comes back with under 90% of yesterday's products or priced rows, is HELD (5.4 F2b): no row of it changes state.
9. **Sealed products** are always in the sealed catalogue (3,712; no floor). Their store offers (finish 0) are not units: no floor applies, they count against the offer budget and are pruned by value like any other offer. A sealed product absent for two complete days is `GONE` (the draft had no such state).
10. **Headline** is Normal-first (`headlineOf`): Normal if it has a display value, else Foil. `bestUsd` (max of the two MARKET values) ranks "most expensive" lists, the chase pool, `TOP` and the allocator.

### 5.4 Guards (the policy side; the importer implements them in section 6 and reads their memory from the published state)

| Guard | Setting | Effect |
|---|---|---|
| F10 mass flag change | `IMPORT_MAX_LISTED_CHANGE` 0.05, `IMPORT_MAX_TRACKED_CHANGE` 0.15 | more than 5% of EXISTING rows changing `LISTED`, or 15% of EXISTING tracked units changing, keeps the OLD flags and records `guards.flagChange`. `changed.*` counts rows that existed in the previous run: inserts and GONE transitions are not changes (the draft left this undefined, so a bootstrap database refilled by a full run would trip it). Exempt below 1,000 existing rows. **It cannot lock the catalogue any more** (`flagChangeGuard`, tested): it releases once when `trackConfigHash` differs from the published one (an operator changed a dial on purpose; the draft silently vetoed `CATALOG_FLOOR_CENTS=25` as +36% rows and `TRACK_FLOOR_CENTS=200` as +68% units, run after run), when `IMPORT_ACCEPT_FLAG_CHANGE=1`, and on the `IMPORT_GUARD_MAX_TRIPS`-th (3) consecutive trip, so a real persistent repricing is accepted on the third day |
| **F2b group hold** (new, budget critique 4 [V]) | `lastGroups: { groupId: [products, priced] }` in the published state | a group present yesterday and absent today, or with under 90% of yesterday's products or priced rows, is HELD: its rows keep every flag, nothing is unlisted, no offer is deleted, `guards.groupHold` is recorded. Real evidence: Secret Lair Drop Series (gid 2576) is 3,356 products, 3,261 rows and **11.36% of all tracked units**; Prerelease Cards (gid 92) 4,006 / 3,928 / 4.81%; The List Reprints (gid 2715) 5,302 / 5,227 / 1.76%. Absent or unpriced, each passes F1, F2, F7 and the old F10 (4.98%, 5.69%, 3.36% of rows at the old floor); TCGCSV really ships empty groups (Launch Party Cards, Mystery Booster Cards; Mystery Booster Commander Edition has 80 products and none priced) |
| F2c store hold | `StoreResult.matched` of the last run | a store read whose matched count falls under 50% of its previous matched count is a FAILED read: its rows are untouched and `refreshedAt` does not advance (a Cloudflare challenge page that parses as an empty collection must not delete a store's offers) |
| F6 caps | `CATALOG_MAX_ROWS` 200,000; `TRACK_MAX_UNITS` 70,000 | the importer refuses to write a larger catalogue or unit set (the row cap rose from 130,000 because rows no longer cost Neon bytes) |
| Offer budget | `OFFER_ROWS_BUDGET` 450,000 | before the tracked bits are set, the effective floor is computed from the budget (the draft pruned after the crawl, so every day wrote up to 100k rows the guard then deleted and showed "0 stores" on tracked units); `offersPruned` and the effective floor go to the run summary |
| F7 price sanity | more than 30% of tracked units moved by more than 50% against the last history day, or fewer than 80% of tracked units priced | the history publish is skipped and flagged; catalogue prices still update |

### 5.5 What each surface keys on

| Surface | Keys on | Untracked card behaviour |
|---|---|---|
| Store offers, store lows and counts | tracked unit | no store table; "We compare store prices for cards worth $5 and up; this one is shown for reference." |
| eBay allocator candidates, banner pool | tracked units (the pool also needs art and the chase rule); the unit of work is the NAME | a plain affiliate eBay search link (tier C), no API call |
| Price history, charts, `change7d/30d`, movers, index | tracked units, MARKET values | "price history is kept for cards at $5 and up"; the reference price only |
| Price alerts, watchlist | any listed card, per finish; tracked: the market's store low of that finish; untracked: the TCGplayer market of that finish; a card that leaves tracking re-baselines silently, like one that enters | |
| Deal Finder, Today's Top Deals | tracked units | not listed |
| Sitemap / indexing | `isIndexable` | `noindex, follow` |
| Portfolio value, trade calculator, deck pricing | any listed card: the market of the chosen finish (a low-only unit prices at its low and says so); store prices only if tracked | market-based |
| Sets tracker, checklist, gallery | **all listed rows of the set, THIN included** (so a collector sees every common of the set) | as in OP (`otherSource`) |
| Search, lists | LISTED; THIN rows sort after others of equal rank and are out of `/price-guide` and "most expensive" lists by their value | |

An untracked card page shows: header and art, oracle facts (type, mana pips, text, the legality grid with the `NOTPLAY` note), set and number, the finish selector when both finishes exist, **TCGplayer market and lowest listing per finish** (the "reference" row), a highlighted **Buy on eBay** search CTA beside the TCGplayer affiliate button, other printings and set neighbours. No store table, no chart (one line of text), no eBay panel. A THIN page adds `noindex, follow` and nothing else.

### 5.6 Dials (GitHub Actions variables of the importer, read only by `trackConfigFromEnv`; never Vercel variables)

| Variable | Default | Measured effect of changing it |
|---|---|---|
| `CATALOG_FLOOR_CENTS` | **1** | 98,796 class-0 rows; the ladder above |
| `CATALOG_EXIT_RATIO` | 0.8 | width of the band |
| `CATALOG_ORACLE_COMPLETE` | 1 | keeps every priced oracle resolvable at any floor |
| `INDEX_FLOOR_CENTS` | 50 | 33,640 THIN rows; raising it shrinks the sitemap |
| `CATALOG_SPECIAL_FLOOR_CENTS` | 2000 | 195 specials; 0 = none |
| `TRACK_FLOOR_CENTS` | 500 | 28,538 units; a $2 floor is 47,850 units and 440,000 offers |
| `TRACK_EXIT_RATIO` | 0.8 | $4.00 exit |
| `TRACK_LOW_BASIS` | 0 | 1 adds 921 units on 873 printings that no one has paid for |
| `TRACK_POP_BOOST` | 0 | 1 tracks by the popularity-boosted score: about +24% units, +20% printings [S: SCALE] |
| `TRACK_PER_ORACLE_CAP` | 0 | K keeps the K best tracked printings per oracle (off by default: collectors want every printing) |
| `PRICE_CLIP_CENTS` | 200000 | scoring clip |
| `CATALOG_MAX_ROWS`, `TRACK_MAX_UNITS`, `OFFER_ROWS_BUDGET` | 200000, 70000, 450000 | F6 |
| `IMPORT_MAX_LISTED_CHANGE`, `IMPORT_MAX_TRACKED_CHANGE` | 0.05, 0.15 | F10 |
| `IMPORT_ACCEPT_FLAG_CHANGE`, `IMPORT_GUARD_MAX_TRIPS` | 0, 3 | the F10 release valves |

**Changing a dial.** Edit the variable and re-run; `trackConfigHash` differs from the published one, so F10 releases once and logs it, F6 still caps, and the next run is a normal run. Nothing else is needed (the draft claimed this and F10 made it false).


## 8. Finish handling per surface

**The rule behind every row below:** a Card has up to two finishes; every price, offer, history series, alert, collection line, deck line, deal row and eBay row is per (Card, finish) (C2); the headline of a tile is **Normal first** (`headlineOf`); OP's `pickPrice` (highest market wins) is deleted. MEASURED reason: `pickPrice` would headline the Foil row for 43,717 of 48,703 (89.8%) dual-finish printings; the foil/normal median ratio is 1.84x, p95 17.4x, and 325 printings have a Normal under $1 beside a Foil of $20 or more [M: MAGIC]. In the catalogue (floor 1 cent), 49,248 printings carry both rows ([V]; 32,071 at the old 50-cent floor) and 5,760 of them have only their Foil unit tracked.

Identifiers: `uid = productId * 2 + finishIndex` in tuples, `UnitKey = "<productId>.<finishIndex>"` in history and maps, `finish smallint` in tables, `Finish = "N" | "F"` in TypeScript, `?finish=nonfoil|foil|etched` in URLs (4.2). Three finish words, one finish axis: **etched is a kind of the Foil unit of an etched PRODUCT, not a third axis** (rule E, 3.2); it is reached through the family link (`Card.rootId`, `FamilyMember`), never through a flag on the base product.
Every surface reads the same helpers (`headlineOf`, `otherFinish`, `defaultFinish`, `finishLabel`, `finishKind`, `displayNumber`, `normalizeFoil`), so a surface that forgets finishes is wrong in one visible way (it shows the headline) rather than many invisible ones.

### 8.1 What the flags mean

| Fact | Where | Rule |
|---|---|---|
| a finish exists | `mask` `HASN` / `HASF` | a TCGCSV price row of that subtype exists for the product (its values may be null: "listed but no price"). `FOILONLY` is "no Normal row". Foil Etched, Surge, Galaxy and the other patterns are separate products whose only row is Foil |
| the headline finish | `mask` `HEADF` | Normal if Normal has a display value (market, else plausible low), else Foil; recomputed daily; **never stored in a key**. `CardLite.marketUsd` is the MARKET of that unit only (null for a low-only unit); the display value is a separate field, so a $203,067.70 single listing is shown as "low only" and never tops a value sort (5.1) |
| a finish is tracked | `mask` `TRACKN` / `TRACKF` | section 5 |
| the preselected tab | `defaultFinish(card)` | the first TRACKED finish in the order N, F; else the headline. For the 5,760 Foil-only-tracked cards that is Foil, so the store table and the chart open on the unit that has them |
| the other finish chip | `otherFinish(card)` | the finish that is not the headline, if it has a quote: a muted "Foil $X" or "Non-foil $X" |
| the finish word | `finishLabel(card, f)` | N "Non-foil"; F with `ETCHED` "Foil Etched"; F with a foil-pattern treatment "Surge Foil", "Galaxy Foil", ...; else "Foil" |
| the number shown | `displayNumber(card, f)` | the Foil unit of a shared-id product shows the star printing's number (`fnum`) |

### 8.2 Surface by surface (the owner changes only its own files)

| Surface | Unit(s) used | Rule | Owner |
|---|---|---|---|
| Tile, list row, table row | the headline unit, or the unit named by the list's `finish` filter (unit view, section 7) | price = the display value of that unit (a low-only unit says "low only"); ordering uses `marketUsd` (market only); the muted other-finish chip from `otherFinish`; store low, store count and change come from the SAME unit; a Foil unit's tile carries `finishLabel` | WP06, WP07 |
| Card page: price header, tabs | `?finish=` else `defaultFinish` | tabs appear only when both `HASN` and `HASF`; each tab is a unit; the number follows `displayNumber`; a tab whose unit is untracked shows the TCGplayer reference only ("store prices for cards worth $5 and up") | WP06 |
| Card page: family | `FamilyMember[]` | an etched, Surge or stamped sibling is a link ("Foil Etched version"), not a tab; `?finish=etched` on a base product with an etched member is a 308 to that member | WP06 |
| QuickView | `defaultFinish` | same as the card page; the finish chips switch the unit without a navigation | WP06 |
| Price board rows | `OfferRow.finish` | store and feed rows of the selected finish plus the SYNTHESISED TCGplayer row of that finish (`tcgplayerUrl(id, finish)`); eBay is its own block (C20) | WP06 |
| Price history chart, sparklines, movers, rising | `unitKey(id, finish)` | one series per tracked unit; the free window and the Premium range follow C13; an untracked unit shows one line of text | WP02 (readers), WP06, WP07 |
| Market index | tracked units, MARKET values | both finishes count as units | WP07 |
| Price alerts | `PriceAlert.finish` | set from the selected tab at creation (never "follow the headline"); a tracked unit's baseline is that finish's store low in the market (TCGplayer's low counts in the US), an untracked unit's is the TCGplayer market of that finish; a card that becomes tracked later keeps its alert and re-baselines without sending; the unique key is `(email, cardId, finish, market)`; ADDITIVE's headline-only alerts missed the 5,760 Foil-only-tracked cards | WP14 |
| Watchlist (local and account) | `{ cardId, finish }` | the item keeps its finish; `resolveLocalItems` keeps its signature | WP14 |
| Portfolio, binder | `CollectionCard.isFoil` (Boolean, unchanged model) | `isFoil` true is the Foil unit (finish 1); every write calls `normalizeFoil(price.mask, wanted)`, which forces the only finish a product has; value = `marketN` or `marketF`; an etched product is its own card with `isFoil` true | WP12 |
| Collection CSV import and export | finish column | accepted values "Foil", "foil", "Etched", "Foil Etched", "Normal", "Nonfoil", blank = Normal; "Etched" looks for the etched family member by `(sc, nkey)` and falls back to the Foil of the base card with a warning; export writes `Foil` / `Etched` / blank | WP12 |
| Set tracker, checklist, gallery | the printing (Card) | a printing counts as owned if ANY `CollectionCard` row exists for the card, whatever the finish | WP12 |
| Deck lists (parse, price, publish, watch) | `lines[].finish?: 0 \| 1` | markers `*F*`, `*E*`, `(foil)`, `(etched)` after a line set the finish; an unmarked line is Normal; the price is that finish's market (store lows only for tracked units); a line without a set resolves to the `CHEAP` printing | WP10, WP11 |
| Deal Finder, Today's Top Deals | units (`uid`) | one row per unit; a card can appear twice; the comparison is the store low of the unit against THAT unit's TCGplayer low or market and its eBay best. **Rows are limited by `premium-gates.ts` (section 14): signed out none, free account 3, Plus and Premium all** | WP13 |
| Best Basket | units (`uid`) | `BasketListingTuple` carries `uid`; a basket item is a unit | WP13 |
| Trade calculator, selling fees | the chosen finish | market of that finish | WP13 |
| Store matcher | `Offer.finish` | the finish is read from the listing title or variant ("foil", "non-foil", "etched", pattern names); an unmarked listing is Normal if the product has a Normal row, else the product's only finish; a foil word on a product with no Foil row is skipped and counted; etched words match only etched products; **never inferred from the headline** (C2) | WP03, WP04 |
| eBay matcher, `EbayBest`, `EbayPanel` | `(productId, finish, market)` | the unit of WORK is the oracle name (one search finds every printing); each listing is matched to a unit by its finish words and carries `finish`; a slab (graded) has no finish and is never an offer | WP05 |
| Public price feeds (Card Kingdom, Mana Pool; adapters present, off by default, 10.11) | `MatchRow.scryId` / `starScryId` + the feed's finish | exact keys, no matcher: `(scryId, nonfoil)` is the N unit, `(scryId, foil)` the F unit, `(starScryId, foil)` the F unit of a shared-id card, `(scryId, etched)` the F unit of the ETCHED family member (`rootId` group); a row whose unit is untracked is dropped | WP04 |
| Buy links | `tcgplayerUrl(id, finish)`, eBay search with "foil" for F | affiliate wrappers are WP06's | WP06 |
| Sealed | `finish = 0` | always Normal; `Offer.finish` 0 | WP09 |
| Search, browse, price guide | `finish` filter | unit view: Foil prices when filtered by Foil; words "foil", "nonfoil", "etched" in the query set it (the search grammar, section 7) | WP07 |
| Sitemap, canonical, JSON-LD | the product | one URL per INDEXABLE product (not THIN); the structured data price is the default finish's | WP15, WP06 |
| OG images, email templates | `defaultFinish` | the card image shows the headline (`imageFor(c, "og")`, a JPEG); an email names the unit with `finishLabel` | WP16, WP14 |
| Reports and admin | `PriceReport.finish` | carries the finish | WP18 (the form), WP21 (the inbox) |
| Public JSON (embeds, optional API) | `finishKind` strings `nonfoil`, `foil`, `etched` | never the smallint; never a demand-derived or Scryfall-bulk field (C13, C28) | WP20, WP07 |

### 8.3 Edge cases, decided

| Case | Decision |
|---|---|
| Foil-only product (`FOILONLY`) | one price, labelled by `finishLabel`; no Normal tab; headline Foil |
| Shared id with a star twin (`STAR`, 1,204 ids) | one card; Normal unit = the printing without a star, Foil unit = the star printing; `displayNumber` switches |
| Normal row exists but both values are null | `HASN` set, no value; the headline falls to Foil; the Normal tab shows "no price" |
| A Foil unit crosses the $5 floor | tracked from the next import; its alert baselines without sending; hysteresis at $4.00 (5.3) |
| TCGplayer row contradicts Scryfall's `finishes` (31 rows) | TCGplayer wins (it is the price source); counted `finishConflicts` |
| Etched id and base id both joined | rule E decides the flag; the products stay two cards in one family |
| Reserved List card with no price | listed, `noindex`, no tabs, "no price" |
| Unit with only a thin low (1,171 headline rows) | shown as "low only" with its low and a one-line explanation; not ranked, not tracked, not in an index; its price alert baselines on the low |
| THIN page (33,640) | renders fully, `noindex, follow`, no sitemap entry, present in set checklists, decks, CSV and search |
| Name says Foil Etched, Scryfall's etched row lacks `etched` in its finishes (3 products) | ETCHED by rule E; the page says "Foil Etched" |

---

