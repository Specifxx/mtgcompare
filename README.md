# DexCompare (sealed)

Pokémon TCG **sealed product** — booster boxes, Elite Trainer Boxes, booster
bundles, collections, tins, blisters, decks and packs — compared across
independent stores in seven regions (AU, US, UK, CA, NZ, EU, SG), with live
stock.

This replaces the old singles-focused DexCompare in `apps/dexcompare` (20k
cards, price history, eBay Browse API, marketplace, forum). That app is left in
place untouched; nothing deploys from it once the Vercel project points here.

## What it does

- **Compares** every tracked store's listing of a product in one region, in
  that region's currency: in stock first, cheapest first.
- **Tells the truth about stock**: each listing is *In stock*, *Pre-order*
  (in stock, set not yet released), *Sold out*, or *Not checked recently* (the
  store couldn't be read for 72h). The headline "from" price is only ever an
  orderable listing. (Ported from Rift Compare's `sealed-offers.ts`.)
- **Puts the buy button first on a phone** (`src/app/[region]/p/[slug]/page.tsx`): a compact header (a 96 px photo
  beside the name) so the best price and its button sit in the first screen, the price table showing 8 rows with the
  rest in "Show more in-stock stores" / "sold out or not checked" drawers (every store link stays in the HTML), "Quick
  facts" and a per-pack "Value check" from the site's own data, a share button, and a phone buy bar that keeps the top
  of the page's action in reach (see "eBay listing strips" for its rules). **Sold-out pages** (most product pages) lead
  with an eBay box inside the sold-out notice, TCGplayer as the second choice, and an "In stock instead" row of four
  in-stock products of the same type.
- **Finds value, from current data only** (`src/lib/deals.ts`; nothing here is history):
  - **Deals** (`/<region>/deals`): products whose cheapest in-stock price is at least 10% under the median of three or
    more stores that have it today (never under 50% of it: that is a misfiled listing, not a deal), by type, plus the
    cheapest per pack and, in the US, what sits at or below MSRP.
  - **Cheapest per pack** (`/<region>/cheapest-packs`): listed price ÷ booster packs inside, overall and per pack type
    (US: against the $4.49 MSRP per pack, with `RRP_NOTE`).
  - **This week** (`/<region>/this-week`): sets releasing in the next 45 days and released in the last 30, with
    pre-order counts and the cheapest box, ETB and bundle, deals today, and products first seen in the last 14 days.
- **Hub pages that know the calendar**: set pages say "pre-orders … (out <date>)" until release and become
  "booster box, ETB & sealed prices" after it (no "booster box" for sets that never had one), with set facts, a per-pack
  comparison and previous/next set; `/<region>/sets` lists every set in order; `/<region>/releases` has the next set,
  this year's and last year's sets and "Add to calendar" (an `.ics` built in the browser); `/<region>/stores` is a
  "where to buy" page; type pages are capped (48 in stock, 24 sold out) with a link to the full filtered list.
- **Guides** (`/<region>/guides`): twelve evergreen guides (packs per product, box vs ETB vs bundle, are booster boxes
  worth it, sealed products explained, US MSRP, pre-ordering, what's in an ETB, Pokémon Center ETB vs ETB, the cheapest way to
  buy packs, where to buy online, avoiding resealed product, the Build & Battle Box), linked from the landing page with an FAQ, whose numbers come only from `packs.ts`, `rrp.ts`,
  `sets.ts`, `type-about.ts` and live blocks, each with "checked … ago". Old guide and blog URLs redirect to them.
- **Booster box prices by country** (`/guides/pokemon-booster-box-prices-by-country`, `src/app/(site)/guides/[slug]`): the one
  page that compares all seven markets, so it has one region-less URL (no hreflang). The newest booster-box set (the upcoming one
  while it is on pre-order) and the three before it, each market's cheapest open box with its per-pack price, the lead set's ETB
  and bundle, and US MSRP on the US row only. **Prices are never converted** (the site has no exchange-rate source it could print),
  so the page never names a "cheapest country": it says how to compare (your card's rate, tax, shipping, import charges). Facts,
  selection and sentences are `src/content/guides/country-prices.ts` (pure), the read `country-prices-data.ts` (≤ about 60 rows),
  the body `country-prices-body.tsx`; linked from every footer, the region home, releases, the guides index, the landing page and
  the pre-order page. No ad unit and no affiliate link on it.
- **Search everywhere**: the 60 px header (64 px from lg) has a search box on every page, with typeahead over the
  region's whole catalogue (`/api/browse/<region>`: one CDN-cached index per region, rebuilt after each import, so a
  keystroke never reaches the database). Browse pages (`/<region>/sealed`) are paged in SQL, 48 at a time; filtering,
  sorting or a query switches to the index in the browser.
- **Recently viewed**: the last 12 products a visitor opened in a region are kept in **their browser's localStorage**
  (`dex-recent-<region>`), never sent to DexCompare, and shown with today's prices at the end of the region home.
  Clearing site data removes them; with storage blocked nothing is shown.
- **Welcomes**: a landing page (`/`) that suggests the visitor's region, a phone menu with every section, and a footer
  of real links per region.
- **Share cards**: each region home and each guide has its own 1200×630 og:image (`/og/<region>`, `/og/guides/<slug>`,
  `src/lib/og-card.tsx`), static and drawn from the registry: the thumbnail a Reddit or Discord link shows. Each pre-order page (`/<region>/preorders/<set>`) has its own (`/og/preorders/<set>`): date, set name and the product photos in `public/preorders/<set>/`, drawn on request and kept a day by the CDN.
- **Google AdSense** (`src/lib/adsense.ts`), off until `NEXT_PUBLIC_ADSENSE_CLIENT` is set: then the script and meta in every
  `<head>`, `/ads.txt`, the privacy and about paragraphs, and with `NEXT_PUBLIC_ADSENSE_SLOT_GUIDE` one in-article unit per guide
  (DEPLOY.md, "Google AdSense").
- **Earns** through affiliate links, and only two kinds (`src/lib/affiliate.ts`):
  - **eBay Partner Network**: *search links* (Buy It Now, the region's eBay site; NZ uses
    ebay.com.au, SG ebay.com) and **real eBay listings** as image strips and grid tiles. The listings are
    imported **once a day** by a GitHub Actions job with DexCompare's own Browse API keys and
    stored in the database; the website never calls eBay and holds no eBay credential (see
    "eBay listing strips" below and DEPLOY.md, "eBay listings: the daily import").
  - **TCGplayer via Impact**: every tcgplayer.com link is wrapped in the
    partner deep link at render time; the database only holds plain URLs.
    TCGplayer is a US marketplace: in the US its offer is compared with the
    stores and ranked by price and stock like any store (badged
    "Marketplace", never counted as a store), and set pages, guides and searches carry a labelled TCGplayer search
    ("affiliate link"); in other regions it appears only in the product page's Marketplaces panel and as the second
    choice of a sold-out notice, labelled US$, and never in the region's ranking, "from" price or JSON-LD.

  Search links and TCGplayer links carry a sub-id, `dex-<region>-<placement>` (EPN `customid`, Impact
  `sharedid`), so the networks' reports say which surface earned; eBay LISTING tiles use eBay's affiliate URL exactly as eBay
  returned it, whose `customid` is a per-feed `dex-<market>-<feed kind>` (the surface is in the `buy_click` event). Placements
  are listed in `PLACEMENTS` (`src/lib/affiliate.ts`) and, with where each
  renders, in DEPLOY.md, "Click events". Store links go out untouched. Every
  group of affiliate links carries its own disclosure, and every outbound buy
  link (`src/components/OutboundLink.tsx`) records a Vercel `buy_click` event
  with `retailer` and `placement`. DEPLOY.md, "Monthly money check", says how to read what each surface earns.

### eBay listing strips

eBay is on most pages as image banners of real listings (`src/components/EbayStrip.tsx`, the look of Rift
Compare's "Chase cards on eBay" strip): the eBay wordmark, "AD · LIVE LISTINGS ON EBAY", a headline per feed
("Chase cards on eBay", "Sealed Pokémon on eBay", "<Set> chase cards on eBay", "<Product> on eBay",
"<Type> on eBay") and **how old the data is** ("Updated 9 h ago"), a row of six tiles (four in the slim strip above
every footer): portrait photo, title, price exactly as eBay returned it (A$717.90, US$24.99, never converted),
shipping called out ("Free shipping" / "+ A$12.00 shipping"; NZ and SG, served the AU / US feeds, make no shipping claim), the condition when it is not new, and an arrow link.
Under every strip: "Affiliate link: as an eBay Partner Network affiliate, DexCompare earns from qualifying purchases — at
no extra cost to you. Listings are imported from eBay about once a day (updated 9 h ago), so price and availability may
have changed; check eBay."

* **Where** (every placement, with its exact position, is in DEPLOY.md, "Click events"):
  * **Strips**: the region home (two: the sealed strip, with the hot-set button, right after the "Cheaper than most
    stores today" deals rail, and the chase strip after the booster-box rail; no strip above its footer), the landing page
    (the suggested region's feed once the browser knows it), product pages (the product's own listings, then its type's,
    then, for box-class types only, generic sealed: in stock below the offer table where the table is long enough, sold out
    below the price table and the in-stock alternatives, at least 960 px under the sold-out box's eBay unit), set and type
    pages and `/<region>/sealed` page 1 (on a row of its own after the first four products), releases and store pages
    (after the list), the 404, and **every new page carries exactly one**: deals (after the first section's first four
    products), cheapest per pack (after the overall table), this week (after "Releasing soon") and each guide (after its
    first data block). A slim strip sits above every other content page's footer where the page has room for it.
  * **Grid tiles**: long product grids on the browse, set, type and deals pages carry real listings as labelled tiles the
    size of a product card: one after every 16 products, at most two per grid, never within the last eight, the first at
    least 12 products below the grid's strip; from md up (three or four cards a row) a tile also needs 24 products after
    it, so a short grid page stays within the density ceiling. Each tile is a DIFFERENT listing, the sealed feed's 7th and
    8th, which no strip or pre-footer strip on the page shows (`src/lib/ebay-ads.ts` feedSlots / tileSource;
    `MAX_FEED_ROWS` stays 8, so the importer did not change).
  * **Product page**: the price table's one eBay row and, when that listing is new and cheaper than every in-stock store, the
    best-price card (both below); the **sold-out box** inside the sold-out notice (an eBay-blue search button in the server
    HTML; in the browser, the product's own new listing with its price, shipping and age when it has one, through the same
    request the table row makes; never on pre-orders or in NZ/SG); the **Marketplaces panel's eBay row**, an eBay-blue button
    on every product page that shows the product's own new listing price and age when the best-price card is not already
    showing eBay; and the **phone buy bar** (below).
  * **Search buttons**: the header's "eBay" item (xl and up), the "Shop <set> sealed on eBay" button inside the top line of
    the strip on every released set's page (`set-sealed`; hot sets keep "Shop <set> on eBay", `hot-set`), and on a search
    of `/<region>/sealed`, ONE query-matched box ("See "<query>" on eBay — Buy It Now", plus a TCGplayer search in the US,
    `browse-search`) in the slot the unfiltered list's strip uses, client-only so the query never reaches cached HTML.
    With **nothing to list** (before the first import, the kill switch, rows older than the age bound) a strip is one
    compact row: wordmark, "Ad" and a "Search Pokémon sealed on eBay" button. There are no text-only banners, chip rows or
    "Still deciding?" rows.
* **The price table's eBay row** (`listings-offer-row`, the owner's call: DexCompare compares websites, and eBay is one): a product's
  cheapest own eBay listing is a row of its store price table, ranked by its price among the in-stock stores, tinted, labelled "Ad",
  with eBay's blue "View on eBay" button and its age on the row; an eBay search for the product after the in-stock stores when it has
  none. When it is a new listing cheaper than every in-stock store (not on a pre-order) it is the best price: "Best price" on it, "Best store price" on the cheapest
  store, and the best-price card at the top of the page shows it (`listings-best-price`, `src/components/BestPriceCard.tsx`). Never
  counted (store count, median), never in JSON-LD, meta or the "from" prices elsewhere (`src/lib/ebay-offer-row.ts`). The same
  listing (one request, `useEbayPick`) prices the sold-out box and the Marketplaces panel's eBay row.
* **The phone buy bar** (`src/components/StickyBuyBar.tsx`, `product-sticky`, below lg only): the only sticky ad unit on
  the site (the header and the browse filters stick too, but they are the site's own controls). At most 64 px plus the safe area, it slides up with a CSS transform (no layout shift) only once the best-price card
  or the sold-out box has scrolled away, hides while the price table, any other ad unit or the footer is in view, can be
  dismissed for the session, is keyboard-reachable and sets `scroll-padding-bottom` so it never covers a focused element.
  It repeats what the top of the page already offers: the cheapest store, TCGplayer ("affiliate link"), or eBay ("Ad") where
  the best-price card shows the eBay listing as cheapest or the product is sold out.
* **Popular sets** (`src/lib/popular.ts` HOT_SETS, owner-edited, 30th Celebration first): once a hot set is out, its eBay search is
  highlighted as an eBay-blue button (44 px tall, placements `hot-home`, `hot-set`, `hot-product`) INSIDE the top line of an existing strip, never a unit of its
  own: the region home's sealed strip ("Shop 30th Celebration on eBay", the first hot set that is out), a hot set's page and a hot
  product's page ("Shop <product> on eBay"), and it is the compact CTA's button when that strip has nothing to list. It is in the strip's
  reserved box too, so the strip still replaces the box at the same height. A hot set searches "Pokemon <HOT_SET_QUERY or name>
  sealed" ("Pokemon 30th sealed": sellers write 30th Celebration / 30th Anniversary / 30th Anniversary Celebration). Every other
  released set's page gets the same kind of button, "Shop <set> sealed on eBay" (`set-sealed`); a set on pre-order gets none. The
  "Popular set" chip beside a hot product's Marketplaces panel stays hot-only (the owner's list, not eBay data).
  Helpers: `components/Ebay.tsx` (hotSetHighlight, setSealedHighlight, firstHotSet, hotProductHighlight); tests: `tests/hot-ui.test.ts`.
* **Data flow**: `scripts/ebay-import.ts` (once a day, GitHub Actions) → `EbayListing` (≤ 8 rows per feed, REPLACED per feed,
  never appended, deleted after the age bound + 4 h) → `GET /api/ebay/<region>?c=<context>` (a read of those rows: no eBay call,
  no token, a cascade item → type → sealed, set → chase, type → sealed; sealed only for box-class types; **CDN-cached for an hour**,
  then served stale for up to 23 hours while it refreshes, 10 minutes for an empty answer: `src/lib/ebay-route.ts`) → the strip,
  which fetches from the browser once it is within ~300 px of the viewport, into a box of reserved size (CLS 0). Pages stay ISR.
  A fresh import or the kill switch can take up to an hour to reach the edge (DEPLOY.md, "Edge cache and the kill switch"); the
  browser still checks every answer against the 26-hour age bound.
* **Catalogue sweep** (`src/lib/ebay-sweep.ts`): product feeds come first from broad searches paged 200 listings a call per
  marketplace, each listing handed to the product the repo's classifier says it is, so one call can feed dozens of products (an
  item feed for every product found, cheap ones included). One search per product had reached 1,735 of the 7,701 eligible
  keys a day, and 44% of those searches came back empty. A run buys the fixed feeds (chase, sealed, types, sets), then the sweep
  (up to `EBAY_SWEEP_CALLS`, default 2,100), then one search per eligible product the sweep missed, with what is left. The
  workflow's `probe` input measures the sweep (~60 calls, no listing written): on 2026-10-11, 60 pages found two or more
  listings for 590 product keys (product x marketplace); Canada and the EU find fewer by design (eBay-converted prices and German/Japanese listings are
  refused). DEPLOY.md, "The catalogue sweep".
* **Always**:
  * plain `<a>` links through `OutboundLink` (`rel="sponsored nofollow noopener noreferrer"`, one `buy_click`
    `{retailer, placement}` per click, the href eBay's own URL, unedited), thumbnails from `*.ebayimg.com` as plain lazy `<img>`
    (no-referrer; a tile whose picture fails hides itself), an "Ad" label (eBay) or "affiliate link" (TCGplayer) next to every
    unit and link, and the affiliate disclosure in the unit; store links stay plain and commissions never change the store order;
  * **eBay buttons are eBay blue** (`.btn-ad`, #3665f3 with white text, 4.9:1; it was a grey outline): the Marketplaces panel's
    eBay row on every product page, the sold-out box, the table row and the highlight buttons. They never pass for the site's red
    actions, and every unit around one carries its "Ad" label (the owner to confirm the blue against EPN's brand guidelines);
  * a unit of its own (a dashed, tinted box or tile), never inside a ranked table or row, but for the owner's calls on the product
    page: the price table's one eBay row, the best-price card when that new listing is cheaper than every in-stock store, and that
    same listing's price in the sold-out box and the Marketplaces panel (see `listings-offer-row`, `listings-best-price`,
    `listings-soldout-best` and `listings-marketplace` in DEPLOY.md);
  * no derived statistics (but for the best-price card's per-pack price and median/MSRP badges, computed in the browser), no
    script or iframe, never in server HTML, JSON-LD, meta, OG or the sitemap, no pop-up, interstitial, auto-redirect or countdown,
    no incentive to click;
  * **no sticky or overlay unit, with one exception**: the phone buy bar above, which hides whenever another unit is in view;
  * **at most one unit in a phone viewport and two in a desktop one** (the header's item is one of them on xl and up), at least
    960 px apart, and **ad density** (ad-unit height ÷ main content height) **at most 25% per page at 390 and 1440 wide** (a
    ceiling, not a target); no eBay unit on the About, Terms, Privacy or Contact pages.

  The rules that keep units apart live in `src/lib/ebay-ads.ts` (pure, tested; its header lists every rule). **When adding a
  unit, run the viewport sweep**: a Playwright scroll at 390×844 and 1440×900 with `/api/ebay` served from saved live JSON,
  counting the outermost `[data-ad]` elements in view at each stop (the price table's own rows, `listings-offer-row` and
  `listings-best-price`, and the pre-order page's pinned marketplace group in each price list, `preorders-ebay`, are the
  comparison, not units), the ad density, a visible "Ad" on every unit, `rel` containing
  `sponsored` on every eBay and TCGplayer link, no horizontal overflow at 320, and the layout-shift total (under 0.02, network
  throttled).
* **Licence**: eBay's API License Agreement 8.1(c) asks listing information to be at most six hours old (and other eBay Content 24 hours); a daily import is not, which
  is disclosed on every unit and **switchable to a compliant mode: the cron, `EBAY_LISTING_MAX_AGE_HOURS` (GitHub variable and Vercel) and a lower `EBAY_RUN_CAP`**; the strips' wording follows the bound by itself (DEPLOY.md, "The switch to compliant mode").
  8.1(b)(2) (eBay content not mixed with other content) is not met on the product page by the owner's choice: the price table's
  row and the best-price card, and since the growth release the sold-out box's price, the Marketplaces panel's price and the buy
  bar that repeats them; DEPLOY.md, "eBay's rules, and how each is met", says how to revert each.
* **Call budget**: 2,500 of eBay's 5,000 calls a day for the keyset (`EBAY_DAILY_CAP`, also the maximum: this site's share of a keyset shared
  with the owner's other site, which must be capped at 2,500 too; DEPLOY.md says what to do), counted in the database per Pacific day, every
  call reserved before it is made; one run may spend all of it (`EBAY_RUN_CAP` 2,500). The schedule is 08:37 UTC, the first slot after the
  Pacific reset in both PST and PDT. The importer stops on a 403 or 6 failed searches in a row.
* **Testing without keys**: `tests/ebay-*.test.ts` use fake fetch/database (fixtures in `tests/fixtures/`). For a browser run, import
  against a mock: preload a fetch stub that answers `https://api.ebay.com/*` with `NODE_OPTIONS="--import mock.mjs" npx tsx
  scripts/ebay-import.ts` (the code has no host override: it can only talk to api.ebay.com), then start the site on the same database;
  or serve saved live answers of `https://www.dexcompare.app/api/ebay/<region>?c=<context>` with Playwright's `page.route`
  (set `fetchedAt` to a few hours ago: the browser enforces the age bound).

## What this site does not store

No price history, no stock history, no event log, no accounts, no emails, nothing about visitors. The current state is also
published as files in `data/public/` after every import, and the site reads those, not the database (DEPLOY.md, "Where the data
lives"). Every table is
current state only (`prisma/schema.prisma`). "Recently viewed" lives only in the visitor's own browser (localStorage,
`dex-recent-<region>`, the last 12 slugs), and the search index (`/api/browse/<region>`) is a CDN-cached rendering of
`ProductStat`, not a table:

| Table | Holds |
| --- | --- |
| `Product` | one row per sealed product (market-agnostic) |
| `Offer` | each store's current listing of a product |
| `ProductStat` | per product × region: cheapest open price (TCGplayer's included), independent stores in stock and listing it (never TCGplayer), and whether TCGplayer has it (`marketplaceOpen`) — recomputed each import |
| `StoreStat` | per store: listings, in stock, last successful read |
| `EbayListing` | the eBay strips' data: ≤ 8 listings per feed, replaced per feed by the daily eBay import, deleted after the age bound + 4 h (transient, not history) |
| `EbayCallDay` | eBay Browse calls made per budget day (one small row a day) |

### Price history lives on RiftCompare

RiftCompare's Pokémon section (riftcompare.com/pokemon, the owner's) keeps TCGplayer's market price history, which this site
does not. The two are joined by TCGplayer's productId, taken from this site's TCGplayer product images (`src/lib/riftcompare.ts`):
a product page links `riftcompare.com/pokemon/tcgplayer/<id>` ("Price history … on RiftCompare's Pokémon section", nofollow),
and RiftCompare reads `/api/browse/<region>` for its "Independent stores" lines, which link back here with
`utm_source=riftcompare`. Changing the index's tuple or `INDEX_VERSION` hides those lines there until RiftCompare is updated.

## How it works

```
GitHub Actions (twice a day)               Vercel (Next.js 14, ISR)
.github/workflows/dexcompare-sealed-import.yml
  └─ scripts/import.ts                      pages read ProductStat/Offer,
       ├─ src/lib/importer.ts               scoped to one region/product
       │    reads each store (feeds.ts)     └─ cached until the next import
       │    identify() every title          ← POST /api/revalidate
       │    replaces that store's offers
       │    recomputes ProductStat
       └─ POST /api/revalidate

GitHub Actions (once a day)                 /api/ebay/<region> reads EbayListing
.github/workflows/dexcompare-ebay-import.yml  (no eBay call, no secret) for the strips and
  └─ scripts/ebay-import.ts                   tiles; CDN 1 h + stale-while-revalidate
       → EbayListing (replace per feed) + EbayCallDay (atomic call counter)
       fixed feeds, then the catalogue sweep (src/lib/ebay-sweep.ts), then per-product searches

                                            /api/browse/<region>: the search and filter index,
                                              one whole-market read per region per import
                                              (force-static, purged by /api/revalidate)
```

- **Stores** live in `src/data/stores.json`: Shopify stores are read through
  `/collections/<handle>/products.json`, WooCommerce stores through the public
  Store API. Both check robots.txt, pause between requests, and back off on 429.
- **Currency guard**: a store is only read if it charges in its region's
  currency (`/meta.json` for Shopify, the feed itself for Woo), and every
  Shopify read passes `?country=` — without it, a Shopify Markets store
  answers a US machine (including GitHub's runners) in converted USD.
- **Title → product** (`src/lib/sealed-title.ts`, tested in
  `tests/sealed-title.test.ts`): refuses singles, graded cards, accessories,
  other languages, other games and store-made bundles; set products group by
  set + type; collections, tins, blisters and decks by type + set + their
  distinctive words. It prefers leaving a listing out to putting it on the
  wrong product.
- **Egress**: the rules at the top of `src/lib/db.ts` (from Rift Compare). No
  page is prerendered against the database at build, and no request reads a
  whole table: browse pages read 48 rows a page in SQL, type pages are capped,
  set counts are one `GROUP BY`, and the new pages read at most about 200 rows
  each (DEPLOY.md, "Egress of the new routes").
- **Deploys** (`vercel.json` → `scripts/vercel-ignore-build.sh`): production
  builds when a push to `main` changes this app. Preview deployments are off
  (the owner, 2026-10-14): a branch builds only when its commit subject carries
  `[preview]`, and even then the build reads no database, because a preview's
  `DATABASE_URL` is production's (DEPLOY.md, step 4).
- **Caching**: every region page and the sitemap files are ISR-cached for 24
  hours (`export const revalidate = 86400`), and each store import (twice a
  day) re-renders them through `/api/revalidate`, so the TTL is only the
  backstop for a missed import. The floor is **6 hours**: never set a page,
  layout, sitemap or fetch TTL under `21600` (the owner, 2026-10-14: prices
  need refreshing every 6 to 24 hours, not more often; `tests/cache-ttl.test.ts`).
  The landing and trust pages read no data and stay static until a deploy. The
  only shorter cache is the eBay listings API (`/api/ebay/<region>`: CDN 1
  hour with stale-while-revalidate, 10 minutes when empty), which serves a
  strip's JSON, not a page.
- **Regions in URLs** (`src/lib/regions.ts`): every page under `/[region]`
  starts with `regionOrNotFound(params.region)`, which 404s an unknown or
  upper-case segment before anything dereferences it; `src/middleware.ts`
  308s the exact upper-case prefixes (`/AU/…` → `/au/…`). hreflang
  (`regionAlternates` in `src/lib/seo.ts`) advertises only the regions a page
  is indexable in, plus `x-default`.
- **Sitemap**: `/sitemap.xml` is an index of `/sitemap/0.xml` (static pages,
  store pages) and one file per region (`src/lib/sitemap.ts`,
  `src/app/sitemap.ts`). A failed query throws so ISR keeps the last good copy;
  the import job counts the live product URLs afterwards and fails under 1,000.
- **Trust pages** (`src/app/(site)`): `/about` (which stores and why, what we
  refuse, freshness, and every place eBay and TCGplayer appear), `/terms`,
  `/privacy` (including what "recently viewed" keeps in the browser), `/contact`
  (report a listing). The operator name comes from `NEXT_PUBLIC_OPERATOR` and the
  contact address from `NEXT_PUBLIC_CONTACT_EMAIL` (`src/lib/site.ts`).

## Local development

```bash
cd apps/dexcompare-sealed
npm install
cp .env.example .env               # point DATABASE_URL at a local Postgres
npx prisma db push
DATABASE_URL=… npx tsx scripts/import.ts --only AU   # or: --only pokebox,cherry
npm run dev                        # http://localhost:3003
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`. `SITE_URL` defaults
to `https://www.dexcompare.app`; set `NEXT_PUBLIC_SITE_URL` to override it.

## Adding a store

1. Put candidates in a JSON file: `[{ "name": "…", "base": "https://…", "country": "AU" }]`.
2. `npx tsx scripts/probe-stores.ts --in candidates.json --out probe.json`
   reads each store live: platform, currency, which collections hold Pokémon
   sealed, and how many products it would list.
3. `npx tsx scripts/registry-from-probe.ts probe.json` merges the stores that
   pass (≥ 3 sealed products, right currency) into `src/data/stores.json`.

Keep the probe at its default concurrency (3). Shopify rate-limits by IP across
every storefront it hosts.

## Adding a set

Add an entry at the top of `SETS` in `src/lib/sets.ts`: code, name, slug, series and the **English** release date
(`YYYY-MM-DD`), `logo` (or `null`), and `noBoosterBox: true` for a set never sold as a 36-pack booster box. Products
group under it from the next import; until a new set is added, its set products are refused as "no set" rather than
filed under the series' first set. Everything else follows from that one entry:

- **Before the release date** the set page is a pre-order page (title "Pokémon <set> pre-orders: … (out <date>)",
  "Pre-order · out in N days", "Add to calendar"), has no eBay highlight button (eBay pre-sales are refused by the
  importer), and appears in "Releasing soon" on `/this-week` and as the next set on `/releases`.
- **From the release date** the title becomes "booster box, ETB & sealed prices" (or "ETB, bundle & sealed prices"
  with `noBoosterBox`), the strip's top line gets "Shop <set> sealed on eBay" (`set-sealed`), and the set moves to
  "Just released" on `/this-week` for 30 days. The eBay import's sets bucket covers the 30 most recently released sets.
- `/sets` (sets in order), `/releases`, the footer's "Latest sets" (the first six of `SETS`), the search index and the
  guides' live blocks pick it up with no other change. With `logo: null` the set's hero uses its first booster box or
  ETB photo on a plate.
- **A hot set** (eBay first in the import, the highlighted button, the "Popular set" chip): add its code to `HOT_SETS` in
  `src/lib/popular.ts`, and to `HOT_SET_QUERY` if sellers don't write its name (`cel30: "30th"`).
- Pack counts: if its ETB or another product breaks the series' rule, add it to `ETB_BY_SET` (or the relevant map) in
  `src/lib/packs.ts`; the per-pack figures, the "Value check" and the guides use it.

## Adding a guide

Guides are typed TSX modules, not MDX (`src/content/guides/`):

1. Add an entry to the registry, `src/content/guides/index.ts`: `slug`, `title`, `description` (at most 160
   characters), `published` and `updated` (ISO editorial dates, never the data's refresh time; `updated` ≥
   `published`), `regions` (`"all"` or a list, e.g. the MSRP guide is US only), `topic` (`types` / `sets` it links to)
   and `ebay` (its one strip: `context` `"sealed"` or `"type:<slug>"`, and its heading).
2. Write `src/content/guides/<slug>.tsx` exporting `Body({ r, data })`. Facts come only from `packs.ts`, `rrp.ts` (with
   `RRP_NOTE` wherever MSRP appears), `sets.ts`, `type-about.ts` or the loaders in `src/content/guides/data.ts` (at
   most about 40 rows, 20 KB, per render). No pull rates, expected value, investment, trend or "best time to buy"
   claims, no quotes, no history ("today", "right now", "checked N h ago"); attribute pack counts as "pack counts from
   the publisher's product listings, as recorded in our data". Copy must never match `BANNED_COPY`
   (`src/lib/copy-rules.ts`).
3. Link at least three product, set or type pages. The page adds the byline, the table of contents (from the H2s),
   the one eBay strip (`listings-guide`, after the first data block), and in the US the labelled TCGplayer search
   (`guide-tcgplayer`) in the closing "Where to buy" section.
4. The sitemap (`staticSitemap`) and the `/guides` index pick it up from the registry; `tests/guides.test.ts` checks
   the dates, description length, links, `BANNED_COPY` and the pack and MSRP numbers. To win back an old URL, add a
   redirect in `next.config.js` above the blanket `/guides/:path(...)` rule (it sends every other `/guides/<slug>` to `/about`,
   except the by-country guide's slug, which it skips), only for a slug that existed under that prefix
   in `apps/dexcompare/src/lib/articles.ts`.

## Pre-order pages

An upcoming set can have a pre-order page at `/<region>/preorders/<set slug>`
(`src/app/[region]/preorders/[set]/page.tsx`, ported from Rift Compare's
`/radiance-preorders`): a summary strip (stores checked in the market, stores
taking pre-orders, the cheapest booster box pre-order and who has it, days to
release, and how many stores list the set across all seven markets), the
release date at a glance (release, prerelease, Pokémon TCG Live, set size),
then each product's price list: a pinned, labelled "Marketplaces" group at the
very top (eBay's search for the product, then TCGplayer: its offer in the US,
its US$ offer or a search elsewhere; unnumbered, never compared) and below it
the stores alone, numbered by price, open pre-orders cheapest first (the
owner's call, 2026-10-16; DEPLOY.md, "Ad rules", 12), what is in each box (in the US with its MSRP and per-pack
price), what is in the set and an FAQ that leads with the release date. Its
title serves both searches, "<set> pre-orders in <region>: prices & release
date". To add one, add an entry to `PREORDER_GUIDES` in
`src/lib/preorder-guides.ts` with facts from The Pokémon Company's announcement
(sourced and dated; a fact only a report gives is printed with that report's
name and date; no prices — those come from the stores, and US MSRP from
`src/lib/rrp.ts`). The words built from those facts (title, description, the
glance box, the FAQ) are `src/lib/preorder-copy.ts`, pure and tested. The set
page, the release calendar, the region home's pre-order rail and the sitemap
link it on their own.

The page retires itself: from the set's `releaseDate` it says the set is out,
points at the set page, is noindexed and leaves the sitemap
(`tests/preorders.test.ts`). Its store buttons report under the `preorders`
placement, its marketplace rows under `preorders-ebay` and
`preorders-tcgplayer`.

## IndexNow (Bing, Yandex)

`/indexnow.txt` serves the IndexNow key (`src/lib/indexnow.ts`; `INDEXNOW_KEY` in
Vercel overrides the built-in one). `.github/workflows/indexnow-submit.yml` (repository
root) runs daily at 22:37 UTC, after the evening import, and by hand: it follows the
live sitemap index and submits every page URL for the host the sitemap's URLs are on
(www.dexcompare.app), with the key the live key file serves. The run fails, with
IndexNow's answer in the log, when anything is refused. Google does not take IndexNow.
