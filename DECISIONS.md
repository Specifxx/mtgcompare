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

## One family of sites — 2026-10-26

Owner, after the strategy review: "execute on all the recommended items". One of
them: one family of sites people recognise, without moving any domain. The
footer's sister-sites block now names the Compare Empire family, and every live
sister site is in it (Gundam Compare and Lorcana Compare joined MTG Compare's and
DexCompare's lists the same day). YGO Compare joins once it is public.

## 2026-10-27: a new mark (five colour orbs)

The two-rhombus mark read as nothing in a browser tab and on Vercel's dashboard. The new mark is five orbs in Magic's five colours
in colour-pie order on a brass ring, with a spark in the middle, on the same night-purple tile (`LogoMark`, `src/app/icon.svg`,
`public/logo.svg`, the PNG icons, and a 16/32/48 `src/app/favicon.ico`, which Vercel's dashboard and some crawlers ask for first).
It stays an original abstract mark: no mana symbol, no Planeswalker symbol, no Wizards of the Coast logo.

## 2026-10-27: every site links the whole family

The owner, once YGO Compare existed: "our website should all have all of our
compare websites now in the suite of websites … just try to backlink all of
it." Every site's footer now links the other eight: RiftCompare, OP Compare,
DexCompare, MTG Compare, Gundam Compare, Lorcana Compare, YGO Compare
(ygocompare.com), CamCompare (www.camcompare.app) and Compare Empire
(www.compareempire.com, Australian tech prices), each on the host it already
uses (no apex or www change). Plain followed links, never sponsored: they are
our own sites. The link text says what each compares ("Yu-Gi-Oh! card prices",
"Camera and lens prices"), with the site's name after it, rather than the
brand alone. MTG Compare is sealed-only since 2026-10-21, so its anchor now
says "Magic: The Gathering sealed prices" everywhere.

Footer only. In-page blocks ("Compare other TCGs" on card and product pages,
the article blocks) keep to card games, and the two sites that are not card
games are labelled as the wider family, so nine look-alike sites linked from
every page body never read as a link network.

This supersedes "YGO Compare joins once it is public" above. The footer
heading is now "More price comparison · the Compare Empire family".

## One family page and "Searching another game?" instead of a hub domain — 2026-10-28

The owner asked whether a separate hub site (tcgcompare.app or "TCG Empire")
should proxy all the compare sites to win generic queries like "compare TCG
card prices". Not built. A proxy that shows the same card pages would copy
the sister sites and split their rankings (the split-query problem fixed on
RiftCompare the day before). A link-only hub on a new domain has no authority
and no card pages to rank with. TCGPriceEmpire, a full multi-game site, was
built once and never launched (archived in CompareEmpire on 2026-10-27).
Buying the domain is the owner's call and is on hold.

What shipped instead, at no cost:

- **"Searching another game?"** Under a search on each of the seven
  card-game sites, a line links the same words to every other card-game site's
  own search (its SearchAction target). Someone typing "Charizard" on
  RiftCompare is pointed to DexCompare instead of a dead end. These are search
  links, so they're `nofollow`: a results page is noindex everywhere. Nothing
  is fetched from the other sites.
- **One `/tcg-price-comparison` page, on RiftCompare only.** It lists every
  game we compare, has a search box that sends the words to that game's site,
  and is linked from RiftCompare's "Compare other TCGs" footer heading. One page
  on the strongest domain, never a copy per site, so the family never competes
  with itself for the generic query.

## DexCompare's indexing round and "All sealed" menu, ported — 2026-10-28

The owner wants MTG Compare to earn like DexCompare. The two run the same code
(MTG was ported from Dex on 2026-10-21), and MTG's catalogue is no smaller where
it counts: 383 stores to Dex's 390, and more in-stock US and Canadian offers.
What MTG missed is the work Dex got after the port. Two pieces of it are
brought over here:

- **Index tiers** (`src/lib/index-tiers.ts`). The sitemap listed every
  comparable product, 5,616 regional product pages, most of them one store's
  listing inside our template. On Dex that same shape got 5,332 URLs "Crawled,
  currently not indexed" and 194 indexed. Now one rule decides both the
  sitemap and the robots tag: *strong* pages (two or more stores in stock, one
  in stock of three listing, or a headline format that three list) are in the
  sitemap; *thin* pages (fewer than two listings) are noindex; the rest are
  indexable but left out of the sitemap. On today's data that's 2,738 strong,
  1,143 middle, 3,390 thin. The headline formats are `MOVE_TYPES` (play,
  collector, draft and set booster boxes, bundles, Commander decks). Set and
  type pages are listed from three comparable products, and an empty one is
  now a real 404 instead of an empty 200. Deals, cheapest per pack and price
  moves are noindex and out of the sitemap when thin (`lib/section-thin.ts`).
  The region switcher's links to another region's deep pages are nofollow.
  Product pages get "Questions about …", answered only from the page's own
  data (`lib/product-faq.ts`), and the region home lists every set and type it
  carries, so every set page is two clicks from it.
- **The desktop "All sealed" dropdown** (`components/ShopMenu.tsx`, Dex
  CompareEmpire #68): by product, by set (newest released first, a pre-order
  labelled), by value. It's CSS only, made of plain links, with no new page
  and no extra read.

Left out on purpose: Dex's apex/www host rules (MTG has always been served
from the apex) and its Japanese section.

## 266 more stores, from the sister sites' registries — 2026-10-28

Every store DexCompare, OP Compare, RiftCompare and the Gundam, Lorcana and YGO
sites list that MTG Compare didn't (610 of them) went through
`scripts/probe-stores.ts` in GitHub Actions: right currency, a public feed,
and three or more products that `identify()` accepts as Magic sealed. 266
passed, which takes the registry from 383 stores to 649 (AU 88, CA 170, EU 43,
NZ 13, SG 12, UK 83, US 240).

The probe's fallback collection list was still DexCompare's Pokémon handles
(`pokemon-sealed`, `pokemon`…), so a store whose sitemap named no Magic
collection was read for Pokémon and found nothing. It now tries the common
Magic handles first (`magic-the-gathering`, `mtg-sealed`…). That one change
found 146 of the 266.

Left out on purpose: five storefronts that are the same shop as one already
listed (derpycards.ca, the Card Caster and Plenty of Games myshopify hosts,
board-game.co.uk for Zatu, and nortontcg.co.uk, which carries the same 115
products as The TCG Group). The same stock under two names would count as two
stores. The new stores show "Shipping at checkout" until the weekly shipping
probe measures them.

## A TCGplayer strip of real sealed products — 2026-10-28

**Owner:** "more TCGplayer ads and more eBay ads … with the actual cards there",
on every site but RiftCompare. The eBay side already has its image strips
(EbayStrip); TCGplayer had only rows and text search links.

* `TcgplayerStrip` (server-rendered, `lib/data.ts tcgplayerTiles`): real sealed
  products with their photo and TCGplayer's own in-stock price, each linking to
  the product on TCGplayer through the Impact deep link, plus a "Shop
  TCGplayer" tile. Labelled Ad, disclosed under it, no pop-up.
* Placements `tcgplayer-strip-home` (region home, after the second box rail),
  `tcgplayer-strip-set` (after a set page's products) and
  `tcgplayer-strip-product` (after "More from <set>"): always below a page's
  comparison, never between a buyer and a price.
* Tiles: the newest sets first, headline types first, at most three per set
  site-wide; a set or product page shows its set's own, topped up with the
  newest sets'. The read is scoped to TCGplayer and to one set or the ten newest
  (the egress guard flagged the unscoped one at 0.7 MB).
* Outside the US the price stays US$ and the strip says "The US marketplace".
  TCGplayer Direct reached Australia on 2026-10-07 for singles only, so nothing
  claims sealed ships there.

## Navigation from the first page: no region step, a sidebar, a full phone menu — 2026-10-28

**Owner:** the "Continue to Australia" button before any navigation was a
barrier; the wide desktop's left side was empty; the phone menu on the landing
page listed only regions.

* The pages with no region of their own (`/`, About, the blog, the legal pages,
  404s) draw the whole header now: sections, the "All sealed" dropdown, search
  and the region button. The server's HTML is built for the default region (the
  US, one CDN copy, no cookie or header read); the browser moves every link to
  the visitor's region (`useSoftRegion`: saved, language, time zone, then
  `/api/geo`, as before). Never a redirect: `/` stays the x-default landing page
  with its own canonical and hreflang.
* A region picked on such a page (header, phone menu, the landing grid's chips)
  switches the whole page in place (`pickRegion`) and is remembered; the links
  still go to each region's home without script.
* The hero's "Continue to <region>" button became five shortcuts (Play booster
  boxes, Collector boxes, Commander decks, Bundles, Deals) in the visitor's
  region.
* From xl (1280px) a sticky sidebar (`components/SideNav.tsx`) lists every
  product type, the eight newest sets, the deal pages and the rest
  (`lib/nav.ts navGroups`); the shell widens to 1480px so the page keeps its
  1200px. The phone menu draws the same groups, then the regions. Static links
  only: no read, no page that doesn't exist. Region pages never run the
  suggestion (it would cost a `/api/geo` call per view).

## Store audit: 165 stores added, 5 dead ones out — 2026-10-28

**Owner:** check every site's store health and make sure the latest stores
are on it.

* **Health.** The stores that stopped reading were re-probed. Five are gone
  (no public feed any more, or no Magic sealed left): More Than Meeples, TCG
  Company, The Haven Tabletop, Celly Sports, Remi Card Trader. Screen Free
  Games and Nutmeg Games read again from their main Magic collection. Obsession
  Gaming and Kuma Cards started blocking on 2026-10-27 on every sister site and
  stay for now, in case it is temporary.
* **New stores (649 → 809)** come from the official Riftbound store
  registry's Shopify and WooCommerce game stores, probed from a GitHub runner in
  each market with the real `identify()`: added only with 3+ Magic sealed
  products, at least one in stock, prices in the market's currency, and not a
  second address or name of a store already listed. A store readable only
  through a "new arrivals" collection is left out: it would drop products as
  they age off the page.
* Postage for the new stores comes with the weekly shipping run; until then
  their rows say "Shipping at checkout".

## Small eBay + TCGplayer pair on product pages, TCGplayer on every page (2026-10-29)

Owner: the eBay and TCGplayer image strips should also show "near the top, but much smaller so it's not intrusive" on product pages, and on every other page (pre-orders, lists…). Two additions:
- `MiniSealedAds` (EbayStrip.tsx), under a product page's best price: one slim box with 56px tiles in two rows. The eBay row is the product's own listings through the same `useListings` request its strip makes, so no extra fetch. The TCGplayer row is the set's products, the same tiles as the strip further down. Every height is fixed (CLS 0), and an eBay row with nothing to list keeps its height as a search link. Placements `listings-product-mini` and `tcgplayer-strip-mini`.
- `PreFooterTcgplayer`, the TCGplayer strip beside the eBay pre-footer strip on every region page without one of its own (the home, product and set pages have one). It reads `tcgplayerTiles()` in the region layout at request time (files mode, never at build). Placement `tcgplayer-strip-footer`.

The eBay pre-footer strip already covered every page.

## L'Atelier TCG listed in Canada, its second storefront left out (2026-10-29)

L'Atelier TCG (Laval, QC) asked by email to be listed on MTG Compare. It runs its own platform but serves Shopify's
feed format for its whole catalogue at `/products.json` (1,716 products on 2026-10-29, every game, CAD, 356 of them
Magic sealed), so the collection handle `"*"` now means that whole feed, read strictly like any non-Magic collection,
and a feed `url` on the store's origin replaces Shopify's `/products/<handle>` (ported from DexCompare, where the same
store has been listed since 2026-10-26). It also asked for its second storefront, CCC (ccctcg.ca, Dorval): every one
of its 284 products is one of L'Atelier's, at the same price and availability, so it stays out. One stock shown as two
stores would mislead buyers and inflate the store count.

## One eBay campaign for every Compare site, hard-coded — 2026-10-30

**Decided (owner).** Every Compare site now sends eBay clicks to ONE EPN campaign, 5339155912 (RiftCompare's,
already set up), hard-coded in the code: no variable overrides it any more, so a forgotten secret or Vercel
value can't split the sites again. The sites are told apart by the `customid` prefix alone, which comes first
in every tag; this site's is `mtg-<region>`. The importer enforces the same id on every stored listing URL.
Replaced: 5339155911 (WargameCompare, FigureCompare, Compare Empire, K Young), 5339231473 (Lorcana),
5339231474 (Gundam), 5339234013 (YGO). Old secrets/variables (`EBAY_AFFILIATE_CAMPAIGN`,
`NEXT_PUBLIC_EBAY_CAMPAIGN_ID`, `EBAY_CAMPAIGN_ID`) are no longer read and can be deleted.

## A creators page, starting with Kevin Lepage — 2026-10-30

The owner asked for a creators section like RiftCompare's, with Kevin Lepage (@kevin_altered_mtg, altered-card illustrator) as
the first. `/creators` lists the creators in `src/lib/creators.ts` (a hand-edited array: no database, no form, no account, since this
site has none), the newest as a big spotlight, and the homepage carries one compact strip into it under the hero's paragraph
(`components/home/CreatorsTeaser.tsx`), as RiftCompare's homepage does. The page reads no data, so it is prerendered at build like
`/about`; it is in the sitemap, the footer and the sidebar's "More". `/creators` used to 301 to `/about` (an old singles-site page);
that rule is gone and `/creators/<anything>` now goes to the hub, which is why photos live in `public/img/creators/`, not
`public/creators/` (the redirect would catch them). Creator links are followed and keep the referrer (`rel="noopener"`): showing a
creator that we send them visitors is the deal. Only links the creator shows publicly: his Facebook ("Kevin Altered") is left out
until we have its URL. Unlike RiftCompare there is no tip button or creator code (no Pro here); "get featured" is an email.

## 2026-10-30: quick view on every product card (from K Young)

Owner: "I really like the kaeyoung quick view pop ups, can we do that for dexcompare, mtgcompare and all the other sites".
A plain click on a product card now opens K Young's quick view at once with what the card shows (photo, type, name),
then the product page's own price rows load from `/api/quick/<region>/<slug>`: a function response Vercel's CDN keeps
for a day like every page (the data only changes with a release), fetched ahead when a mouse rests on a card. The rows
come from `offerRowsData()`, the function `OfferTable` itself now uses, and are drawn by the table's own
`OfferRowsWithEbay`, so the quick view cannot disagree with the page: eBay first, then TCGplayer and Amazon, then the
stores, the eBay row fetched exactly as on the page. Store buttons carry the new `quickview-table` placement. The card
is still a real link, so crawlers, new tabs and modified clicks reach the product page, whose server HTML keeps every
price.

## 2026-10-31: wrong-price reports and store suggestions go to a private GitHub repo

**Owner:** "for all of these websites … we must have the ability to report any prices that are wrong, for users to
suggest a store … it's just stored within the GitHub … a daily job that checks for that."

* Every Compare Empire site now has the same two forms: **Report a wrong price** (a quiet link under the price table
  that opens in place, never a pop-up) and **Suggest a store**. Both POST to `/api/report`
  (`src/lib/reports-github.ts`, `src/components/ReportForms.tsx`: the same two files in every site repo).
* They are filed in ONE **private** repository, `Specifxx/compare-reports`: one new JSON file per report at
  `inbox/<site>/<day>/…json`, created through GitHub's contents API with `REPORTS_GITHUB_TOKEN` (a fine-grained token
  with Contents read/write on that repo only, Vercel only). Private because the site repos are public and a note is a
  stranger's free text; the K Young reviews branch is public because reviews are meant to be read.
* Nothing about the visitor is stored: no email field, no IP, no hash of one (the per-visitor limit, 6 an hour, lives
  in the function's memory), and email addresses, IP addresses and phone-like numbers in a note are blanked before
  the write. A honeypot field swallows bots.
* Each write creates a new file (no read, no sha), so reports never race, and the commit subject never carries
  `[deploy]`/`[preview]`. The route is POST only: no page view or crawler runs it, so it costs nothing at rest.
* A daily job in that repo (`triage.yml`) keeps one issue per site listing what is still open, flags repeat
  reports of the same product and store, and warns before the token expires. A handled report is moved to
  `done/<site>/`. Until the token is set the route answers 503 and the form says to email the site's address.

## Visitor reports live on each site's own `reports` branch, not a private repo — 2026-10-31

**Owner:** "we don't need a private repo for this … just build it into each site … inside the public GitHub, it's
fine. As long as it's not reflected on the front end." This replaces the private `Specifxx/compare-reports` repo
of the entry before it; everything else in that entry (the forms, no email/IP, redaction, new file per report,
POST only, 503 until the token is set) still holds.

* Each site writes its reports to **its own repo**, on an orphan branch named `reports` (`SITE_REPOS` in
  `src/lib/reports-github.ts`): `inbox/<site>/<day>/…json`, moved to `done/<site>/…` once handled. The branch is
  never merged into `main` and never deploys: `git.deploymentEnabled.reports = false` in `main`'s `vercel.json`
  (pinned by `tests/reports-github.test.ts`) and the branch's own `vercel.json` turns deploys off as well.
* Nothing on any site reads the branch, so no report ever shows on a page. The branch is public with the source,
  which is why nothing about the visitor is stored and notes are redacted before the write.
* One token, `REPORTS_GITHUB_TOKEN` (fine-grained, Contents read/write on the twelve site repos only), set in each
  Vercel project for Production.
* The daily triage moved to RiftCompare (`Specifxx/TCGEmpire`): `.github/workflows/reports-triage.yml` reads all
  twelve `reports` branches through the API and keeps one issue per site there, plus a once-a-day "Reports digest"
  comment. Those issues are public, so they link to each report's file and never quote a note. It fails (and
  GitHub emails the owner) when a site has no `reports` branch, or the token stops working or expires within 14
  days (checked only when the token is also a TCGEmpire Actions secret). The ops monitor's job list watches it.

## 2026-10-31 — Every product link opens the quick view

Owner, 2026-10-31: "Whenever I click on any item … I want a quick view open like K Young." Only `ProductCard` carried
`data-qv`, so the home page's lists, tables, set pages, deals rows and guides went straight to the product page (72 of
the 104 product links on `/us`). `QuickView.tsx` now opens for any plain click on a link to `/<region>/p/<slug>`: a
card's `data-qv` attributes when present, else the region and slug read from the href, with the link's own photo and
text until `/api/quick` answers (it now also returns `name`, `sub` and `img`). Links inside the quick view and on the
product's own page navigate as before; modified, middle and new-tab clicks follow the link, so the pages stay crawlable.


## 2026-10-31 — TCG Synergy is banned, and banned stores stay out

The owner reported TCG Synergy (tcgsynergy.myshopify.com, a CA Shopify store first added by the 2026-10-28 store audit)
as a scam site. It is removed from `src/data/stores.json` and `src/data/shipping-rates.json`, and named in
`src/lib/blocked-stores.ts`, which every path that could bring it back now checks: `STORES` drops a banned entry even if
it reappears in the registry, `scripts/probe-stores.ts` and `scripts/registry-from-probe.ts` skip it, and the file store
(`lib/public-data/store.ts`) drops its offers and store stats from a data export made before the ban, so it disappears
with the next release rather than waiting for an import to delete the rows. Matching is on the key, name or any part of
the host with punctuation removed, so a custom domain in front of the same shop is caught too
(`tests/blocked-stores.test.ts`). To ban another store, add its key to `BLOCKED_STORES`.
