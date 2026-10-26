# Decisions

Newest at the bottom. The old singles site's decision log (2026-09 to 2026-10-20) is in git history: `git show 7e0d746:DECISIONS.md`.

## 2026-10-21 — MTG Compare becomes sealed-only, a port of DexCompare

**Owner:** "there's too many cards in Magic the Gathering … make the site MTG compare exactly like dex compare … get rid of all the
cards … only focus on sealed products … price all the sealed products comparing stores across the globe … eBay and TCG affiliates
… we still want the blog posts … I want all the data on the GitHub, ideally."

- The repository was replaced with DexCompare's sealed app (`Specifxx/CompareEmpire` `apps/dexcompare-sealed` at `25ba16b`),
  adapted for Magic: the title classifier, the product types and sets, the store list (`src/data/stores.json`, built from the old
  registry and DexCompare's stores by probing each store's Magic sealed collections), TCGplayer's Magic sealed catalogue, the eBay
  queries, the brand (Arcane Ink: amethyst and brass), the guides, and the blog (the old posts that make sense for sealed product,
  same slugs).
- Removed with the singles site: the card catalogue (Scryfall/TCGCSV), accounts, Stripe Plus/Premium, alerts, collections, decks,
  price history, the admin panels, the Neon data plane and the weekly release cadence.
- **Data on GitHub** (as DexCompare): the imports commit `data/public/` to `main` and the site reads the bundled files. Neon stays
  only as the importers' working store, in a new schema `sealed` of the existing database, so the old tables are not touched.
- **Releases are daily again**: the evening import's data commit carries `[deploy]`, because a data refresh is now a commit (the
  weekly-release rule existed for the Neon data plane, which needed no deploy).
- **eBay calls default to 1,500 a day** (`ebay-import.yml`), not DexCompare's 2,500: the keyset has been shared with RiftCompare.
- RiftCompare has no Magic section, so the product page's price-history link is off (`src/lib/riftcompare.ts` `RIFT_SECTION`).

## 2026-10-22 — Vercel cost cut to the bone

**Owner:** "I don't want MTG Compare doing more than like $1 a day … reduce any cost features."

- **Vercel Web Analytics is off** (`src/components/SiteAnalytics.tsx` renders nothing, `src/lib/track.ts` is a no-op, the
  `@vercel/analytics` package is removed): it bills page views and custom events.
- **Link prefetching is off by default** (`src/components/Link.tsx` wraps `next/link`): every page is force-dynamic, so each
  prefetched link was a billed server render, whether or not anyone clicked it.
- **The eBay strip API is cached 6 hours at the CDN** (was 1): its data changes once a day.
- **More crawlers are refused in robots.txt**: SEO-tool crawlers (Ahrefs, Semrush) and AI-training crawlers, which render the long
  tail and send no visitors. Search engines and AI search crawlers still read the site.
- Unchanged and already cheap: no database reads from pages, no crons, no ISR writes, no image optimisation, one release a day.

## 2026-10-23: titles at 60 characters, built in lib/seo-titles.ts; eight data-driven guides

- Every price page's `<title>` (with " | MTG Compare" only when it still fits) is at most 60 characters and every description at most
  160 (`src/lib/seo-titles.ts`, `tests/seo-titles.test.ts`). Titles are candidate lists, most specific first; long names and regions
  lose the extras (the from-price, the box wording), never the query. A long store title is tidied and cut at a word, never rewritten.
  The page bodies' copy (hub-copy, deals, product-copy) is unchanged; only `generateMetadata` reads the new builders.
- Eight new guides read live data through `src/content/guides/more-data.ts`. Per-pack figures use lib/packs.ts counts only. The gift
  guide's cap is a round figure in each region's own currency (GIFT_CAP), stated as such: never a conversion of US$50.
- The weekly market wrap prints only real week-over-week moves from `data/public/price-history.json` (2+ stores on both days, moves of
  5–50%); with no file or under eight days of snapshots it says so and shows no numbers.
- Guide sitemap lastmod is the guide's editorial `updated` date (blog posts and the by-country guide likewise), never the import time.

## 2026-10-23 — DexCompare's newer interface, ported (owner: "make mtgcompare.app look and convert as well as dexcompare.app")

- The landing page is force-dynamic and CDN-cached a day (it renders the US "In stock today" grid on the server), no longer
  prerendered; other regions load through `/api/picks/<region>` (one-day CDN cache). The region is chosen in the browser: the
  saved region, then the browser language and time zone, and `/api/geo` only when those cannot decide (cost).
- Pre-order banner (the next real upcoming set), Black Friday page and banner (1 November to a week after Cyber Monday), MSRP
  badge (only Wizards' published prices in `rrp.ts`), "checked … ago", price history (chart from 7 days; the export writes it,
  nothing in `data/public` by hand), two tools only (value checker, eBay selling-fee calculator).
- GA4 events (region select, search without its words, store click, affiliate click) go through `src/lib/gtag.ts`, a no-op until
  `NEXT_PUBLIC_GA_ID` is set; GA4 sets cookies, so the privacy page must change before it is.
- Not ported, on purpose: Speed Insights, Vercel Analytics, the `/go` redirect (a billed function per click), the Discord/Telegram
  feed, DexCompare's Pokémon guides and tools.
- Store combos sold as "BUNDLE: …, …" are refused, and a set's own code ("Fra Reality Fracture Bundle") never names a bundle.

## 2026-10-23 — Retarget the landing page at sealed queries; the sister-site row becomes "Compare other TCGs"

- Search Console (28 days) showed the site found mostly for singles queries ("mtg card prices", "magic card prices") it no longer
  answers. The landing page now leads with the sealed queries: title "MTG Booster Box & Commander Deck Prices | MTG Compare", H1
  "MTG booster box, bundle & Commander deck prices, cheapest first", a description naming the four product kinds and the regions
  (under 60 and 155 characters, `tests/home-report.test.ts`). Region homes say "booster box, bundle & Commander deck prices"; the
  guides index is "MTG booster box price guides in <region>".
- The singles searches get a plain answer, not a redirect: `SinglesNote` ("Looking for MTG card prices?") on the landing page and
  every guides index says the site compares sealed product only and links the sealed guides of the region.
- The landing page carries a written market report (`src/components/home/MarketReport.tsx`, `src/lib/home-report.ts`): price ranges
  of the four kinds in the US, the cheapest of each today, a region table and a line per region in its own currency, and the share of
  listed products open per region. It reads the public data files through the guides' capped reads at render (no new data file),
  says "today", and prints week-on-week moves only from `price-history.json` (until a week of snapshots exists it says so). An empty
  read renders nothing. "Restock" talk stays within `copy-rules.ts`: the report describes the release cycle and the twice-daily
  reads, never "back in stock".
- Three guides answer "<product> price <country>" queries: `mtg-booster-box-prices`, `collector-booster-box-prices` and
  `mtg-bundle-prices`. A guide may set `titleIn` ("MTG booster box prices in {in}"): its H1, `<title>`, breadcrumb and Article
  headline name the region (`guideTitleIn`); `title` stays the registry's unique name. A Bundle gets no per-pack price.
- The landing FAQ's questions are `<h3>`s (the FAQPage JSON-LD unchanged); the landing page, the region homes and the about,
  contact, privacy and terms pages gained a BreadcrumbList (a visible trail, except the landing page's single crumb). Organization
  and WebSite stay in the root layout, once per page. The Product + AggregateOffer of product pages already matched camcompare's
  (it is a superset: offer count, low/high, currency, availability, condition), so nothing was ported.
- `SISTER_SITES` lists the three other games only, with the words each is found by as the anchor: Riftbound (riftcompare.com),
  One Piece (opcompare.app) and Pokémon (www.dexcompare.app). The old row linked mtgcompare.app to itself and had no Pokémon site.

## 2026-10-24: Halloween on the landing page, off by itself on 1 November

The owner asked for the site to be Halloween-themed like RiftCompare, reverting automatically afterwards. Ported RiftCompare's
mechanism (`src/lib/season.ts`): 16-31 October in the VISITOR's local time, decided in the browser by `SEASON_BOOT_SCRIPT`, which
stamps `data-season="halloween"` on `<html>` before first paint (`?season=halloween|off` previews). The client decides because every
page is one CDN copy for a day and reads no cookie or header (`tests/cache-ttl.test.ts`); a server date check would switch the theme
up to a day late. The server only decides whether the season's markup is in the HTML at all (`seasonMarkupLive`, a day of slack
either side), and CSS hides it outside the attribute, so 1 November needs no deploy; the markup drops out of the HTML on the first
render after 1 November. Magic flavour, brand kept: an amethyst moonlit sky on the landing hero, cobwebs, bats in the strip above
the content, candlelit jack-o'-lanterns in the bottom corners, and "Night falls on Innistrad" linking to the US store search for
Innistrad (the hero form's own GET search, no new data read). Decoration is behind the content, takes no pointer events, sits only
in the hero's padding and corners on a phone, and reduced motion gets no bats and no flicker. `tests/season.test.ts`. To remove the
season: delete `HalloweenDecor`, `InnistradComing`, their calls and the `.mc-` CSS block.

## 2026-10-24: Set-reveal posts (Star Trek and Reality Fracture chase cards and Collector Boosters)

Four blog posts in RiftCompare's best-performing format (query-led title, real counts, card list, FAQ): Star Trek chase cards,
Star Trek Collector Booster contents, Reality Fracture chase cards, Reality Fracture Collector Booster and products. A "chase card"
is defined by Wizards' own rarity and print-run numbers (mythic rares, Signed Headliners, serialized cards), never a card price: the
site has no singles data. Card lists are Scryfall's (`src/content/set-reveals.ts`, main-set mythics, images hotlinked unmodified),
product facts Wizards' Collecting articles; each post ties the cards to the boxes that carry them and shows live sealed prices.

## 2026-10-24: Dark theme by default; blog thumbnails and product tiles

- Dark is the default for a visitor with no saved choice (owner). `lib/theme.ts` `THEME_BOOT_SCRIPT` stamps `data-theme` on
  `<html>` before first paint from localStorage `mc-theme`; the header's `ThemeToggle` saves the choice. globals.css keys the dark
  palette on `:root:not([data-theme="light"])`, never `prefers-color-scheme`, so no-JS is dark too and the server reads nothing
  (pages stay one CDN copy). `tests/theme.test.ts` pins it.
- /blog cards carry a thumbnail like RiftCompare's: three of the set's mythics (Scryfall's whole-card "normal" images, hotlinked
  unmodified) for a set post, else the post's own share image. Card grids in posts use the "normal" image (the "small" one blurs).
- `ByMarket` leads with the site's own `ProductCard` tiles for the US (live price and stock only; nothing invented).

## The landing page, cut short (2026-10-25)

User feedback: the home page was too long. It is now the hero (headline, one line, "Continue to <region>", search), one paragraph on
how ranking is fair (linking /about), "Most stocked in <region> today" (five products: the newest Play and Collector Booster Boxes
ordered by in-stock store count, lib/picks.ts, region switcher kept, fixed-size slots) and six hot buttons for that region (Deals,
Play / Collector Booster Boxes, a set's pre-orders while one is open else Commander decks, Guides, Stores), then the footer.
Moved, not dropped: the FAQ and its FAQPage JSON-LD, "What we compare", the region/currency notes and the country guide link to
/about; the market report to each region home (its own region's figures); the guides grid lives on the guides index; "Popular right
now" became the hot buttons. The landing eBay strip is gone (the page is too short to carry a unit), and /about's eBay list says so.

## 2026-10-25: Measured shipping on the price table, a "Price + shipping" ranking, and a tax line

User feedback: shipping (and tax) differ by country AND by area within one; a store $10 cheaper that charges $20 more to post is not
cheaper. So:
- **Measured, never guessed.** `scripts/probe-shipping-rates.ts` (weekly, `.github/workflows/shipping-rates.yml`, one runner per market,
  3 stores at once, ≥1 s between a store's requests) asks each Shopify store's own storefront for a quote: one item a cart (its
  cheapest sealed item, then items near 40/80/150/300 in its currency), quoted to 8 AU capitals, 4 NZ cities (both islands), 4 US/UK/CA
  cities, 4 eurozone capitals and Singapore. Ported from the old singles site's probe, cut down to single items. Output:
  `src/data/shipping-rates.json`, bundled (no Neon, no runtime fetch); committed WITHOUT `[deploy]`, it rides the next daily release.
  A store not measured this week keeps its measurement 42 days, then drops out. WooCommerce stores and TCGplayer have no figure.
- **A row's figure** (`lib/shipping-quote.ts` quoteAt): per address, the measured item at or under the row's price; when the next
  measured item up was quoted differently (a free-over-$X threshold, a bigger parcel) the address gets the range between; under the
  store's cheapest measured item: unknown. The row shows the range across addresses ("+ $10.95–$14.95 shipping", "Free shipping",
  "free at $150"), and "Shipping at checkout" without a measurement.
- **The ranking rule is unchanged** (price, then stock). "Price + shipping" is the visitor's choice (localStorage, read only in the
  browser: pages stay CDN-cacheable): open rows with measured shipping by price + cheapest measured shipping, then open rows without
  one, then the rest. The eBay row's shipping is never compared: in that ranking it sits among the unknown rows and is never the best
  price. The best-price card stacks its two tops in one cell (no layout shift).
- **Tax**: one line per region (`RegionInfo.taxNote`): US and CA prices exclude sales tax (state/province, added at checkout); AU, NZ,
  UK, EU and SG listed prices include GST/VAT. Cross-border duties: one sentence, no numbers (`DUTIES_NOTE`).

## Stock first, and three stock pages (2026-10-25)

Owner's creator feedback: stock matters more than price for Magic boxes (often only at LGS); prices move on select products of
popular sets; Reality Fracture was out but Star Trek was leading; older product (LTR Collector boxes) is still at stores.

- Cards, the hero's "Hot right now", the latest-set rows, the landing picks and the product page's best-price card lead with stock
  before price: "In stock at 12 of 15 stores" (`lib/stock.ts stockHeadline`, ProductCard `cardStockLabel`). "of N" is the
  independent stores that LIST the product, not every store in the region (a store that never carried it is not "sold out" of it).
  TCGplayer is "+ TCGplayer", never counted. A sold-out product page now says so in the price slot.
- `/<region>/back-in-stock`: from `data/public/price-history.json`, nothing open in one daily snapshot then open in a later one
  (last 7 days) and open in the latest. A product's first snapshot is never a return (that is "Newly listed", deals.ts
  newlyTracked, shown below). A day with more than max(25, 10% of the market) returns is treated as a failed read the day before
  and dropped. Under 2 days: "Not enough history yet". `copy-rules.ts` keeps "back in stock" banned everywhere except
  history-built pages and links to them (`findBannedCopy(text, { history: true })`).
- `/<region>/price-moves`: cheapest in-stock price today vs 7 days ago, both open, at least 10% and 5.00, ratio within x2, only
  the headline types of popular sets (`popularSetCodes`: released HOT_SETS, the 6 newest released, the 8 most stocked). Empty
  state until 8 days of snapshots (MTG had 2 on 2026-10-25).
- `/<region>/out-of-print` ("Older sets in stock"): headline types from sets released 18+ months ago with an independent store in
  stock, grouped by set, most store stock first. The copy says only "released more than 18 months ago": we do not know print
  status, and never say anything about future value.
- "In stock only" on type and set pages is a client toggle (`StockFilter`), ON by default; both lists are in the one cached HTML.
  The browse grid's existing toggle stays OFF by default: turning it on loads the whole region index on every visit.
- Featuring is by date (`release.ts featureOrder/featureSort`, `popular.ts hotSetsByFeature/featureRank`): the newest released set
  leads, the pre-order set second. `hotRank` (the eBay importer's spending order) is unchanged: it is the owner's priority list.
- sealed-title: a box's own bracketed pack count ("Play Booster Box (30x Packs)") is no longer read as a lot.

## 2026-10-25 — Vercel Web Analytics back on, page views only

**Owner:** "it says zero visitors when there's clearly been visitors." It had been off since 2026-10-22 (cost). Page views are
counted again (`src/components/VercelPageViews.tsx`, query strings stripped); custom events stay off (`src/lib/track.ts` no-op),
so the bill is one event per page view. The project's Analytics tab must be enabled in Vercel for the script's data to be kept.
- 2026-10-25, later: buy clicks too. `src/lib/track.ts` sends `buy_click` (retailer, placement) and drops every other event name;
  search and share events stay off.

## 2026-10-25: Amazon Australia (Amazon Associates) links

- `src/lib/amazon.ts` builds direct amazon.com.au links: `/dp/<ASIN>?tag=` when `src/data/amazon-asins.json` has the product's slug
  (filled by hand, never guessed), else `/s?k=<searchTerms(name), "MTG " prefixed when it lacks MTG/Magic>&tag=`. The tag is
  `AMAZON_AU_TAG` read on the server (default `compareempire-22`); no NEXT_PUBLIC variable. rel is exactly
  `sponsored nofollow noopener` (owner spec; the eBay/TCGplayer REL_SPONSORED keeps noreferrer).
- Shown in AU, NZ and SG only ("Amazon Australia (ships to NZ)" with "may ship…; check delivery"), never US/UK/CA/EU. A marketplace
  link with no Amazon price, rating or stock: never a store, never in the offer table, never best price. Product page: its own card
  after the marketplaces; type, set and deals pages: one "Also check Amazon AU" line; the two AU guides: a column per product row.
- Clicks go through OutboundLink: Vercel gets buy_click (retailer "Amazon AU", `amazon-*` placements), GA4 also gets
  `amazon_click {product, region, page}`. No new Vercel event names.
- The footer carries "As an Amazon Associate I earn from qualifying purchases." and links `/affiliate-disclosure` on every page;
  `/about#money` now says three kinds of affiliate links.
- The two new guides are AU-only (their titles name Australia). "Best" Commander precons means only what our data shows: cheapest in
  stock, and stocked by the most stores.

## 2026-10-26 — SEO audit fixes

- Product titles keep the region (its code when long: "…price, AU") and the product type, and shorten the set name to its code
  or keep the name's last words before cutting what tells siblings apart; Secret Lair drops lead with the drop's own words. Over the
  catalogue × 7 regions, colliding titles fell from 2,773 to 245 (mostly duplicate products the next import merges).
- The classifier ignores store notes that had split one product into two pages: purchase limits ("One per customer", "Limit
  One" — "Limit Break VII" stays a deck name), dates ("Nov 6th"), "delayed until".
- The Organization JSON-LD names a mailbox only when NEXT_PUBLIC_CONTACT_EMAIL is set (the fallback is another brand's).
- Workflows read the canonical origin from the SITE_URL repository variable, so moving to www is configuration, not code.

## 2026-10-26: Star Trek classifier cleanup and the "Coming soon" block

- The Star Trek catalogue had 70 products for about 26 real ones. `identify()` now drops release-date notes before the signature
  ("(VVK - 06.11.2026)", "Vorverkauf", dd.mm.yyyy, "(Approx …)", "(Available …)", "(Delays Expected)", "Release Date: …"). It also
  drops a set's own code ("Star Trek TRK Commander Deck", "SOS Commander Deck - …"), "Fat Pack"/"special" in a special bundle's name,
  and two store spellings ("Divergent Timelines", "We Are The Bog"). A Commander deck or Scene Box sold as "Assorted"/"random"/"ea."
  names no product, so it is refused. A "(DE/EN)" bilingual print counts as foreign. "1 of each", "set of all", "display of N" and
  "Commander Deck Set" mean the set's commander-deck-set. A BARE "Carton" is refused: one US store prices its Star Trek "Commander
  Deck Carton" at $69.99, one deck's price. Prerelease EVENTS (a weekday, a time, "event") are refused, but "1 per event" is a
  purchase limit. "Rare/Uncommon/Mythic Bundle" are store lots of singles. "Fat Pack Bundle: Gift Edition" is the Gift Bundle.
- Across all of offers.json this changes 37 Star Trek titles and 168 others. The others are the same rules applied to older sets,
  mostly set-code merges and assorted, event or carton refusals. No two different products merged in the before/after review.
- `setOfferGroups`' product cap went from 30 to 60: Star Trek had 36 products in CA, and the cap (with no order) silently dropped some
  from the pre-order hub.
- The "Coming soon" block (`lib/coming-soon.ts`, `components/ComingSoon.tsx`) covers the next set by sets.ts dates, not by name. For
  each headline product it shows the cheapest open STORE pre-order (never TCGplayer) and the number of stores taking pre-orders, with
  US MSRP only from rrp.ts. It is hidden from release day. On the landing page it sits between the hero and "Most stocked". All seven
  regions are computed on the server and the visitor's suggested region is picked with no fetch, at a fixed height. The region
  homes show it where the PreorderBanner was. Because it links the hub, the landing page's hot buttons keep their Commander decks
  button.

## 2026-10-26: eBay and TCGplayer pinned at the top of the price table, as ordinary rows

- The owner: eBay and TCGplayer earn the affiliate money, so their rows should blend in with the store rows ("literally just a button
  that's a different colour"), eBay at the very top, TCGplayer second, then the stores cheapest first. This reverses 2026-10-24's
  "marketplaces after the store rows" and 2026-10-11's eBay row ranked by price among the stores.
- Every row has the store rows' grid (`OfferRows.tsx` ROW_GRID). The eBay row lost its sponsored tint, blue edge and thumbnail; it keeps
  the small "Ad" label and the affiliate note. Four buttons tell the rows apart: eBay blue (`.btn-ad`), TCGplayer ink (`.btn-tcg`), the
  cheapest store red (`.btn-primary`), the other stores soft.
- The cheapest row of the whole table is tinted and says "Best price", whichever it is. eBay qualifies under the old rule (a new listing in
  the stores' currency, not a pre-order). TCGplayer qualifies only where its price is in the region's currency (the US). When either wins,
  the cheapest store keeps its red button and reads "Best store price". Under "Price + shipping" only the stores re-rank and only a store
  can be the best price, because eBay's and TCGplayer's shipping are not measured.
- Outside the US, TCGplayer's row is its US$ offer (usMarketplace) or a TCGplayer search. It is labelled US$ and never compared.
- The in-stock page's Marketplaces panel under the table is gone, since it repeated both rows. The sold-out callout stays. The best-price
  card is unchanged.
