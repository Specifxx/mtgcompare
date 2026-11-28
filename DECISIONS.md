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

## eBay: local sellers and stated postage only (2026-10-31)

A WargameCompare visitor's feedback (the owner passed it on for every sister site): eBay rows from overseas sellers carried postage
that made "a lot of wasted clicks". The Browse search now asks for items located in the marketplace's own country
(`itemLocationCountry`; eBay Germany, which stands for the EU, keeps every EU seller and the importer drops the rest,
`localSeller`), sends the buyer's country and a central postcode as `contextualLocation` so eBay quotes real postage, and
`baseItem` keeps no listing whose postage eBay does not state. The product's eBay row is the cheapest listing delivered (item +
postage, `pickListing`), still shown at its item price with the postage beside it, as before. NZ and SG keep the AU and US feeds.
Rows stored before this age out with the next import.

## Christmas theme: 1 November to Boxing Day (2026-11-01)

Owner, 2026-11-01: every Compare site gets a Christmas theme after the Halloween one, each its own take. Snow over the home hero, corner trees, gifts and a candy cane, a Santa hat on the logo, and a pill to booster boxes, bundles and Commander decks, cheapest first.

The season window is fixed in `src/lib/season.ts`: 1 November to 26 December, every year, by the visitor's own
date, stamped on `<html data-season>` by an inline boot script before first paint. `?season=christmas` previews it out
of season and `?season=off` hides it in season. Every decoration is CSS-gated on that attribute, `aria-hidden`,
`pointer-events: none`, painted under the content (never over a price or a button), animated with `transform`
only, and stopped under `prefers-reduced-motion`. The page's content and links stay in the server HTML; the season
adds no request, no script beyond the boot line and no database or data read. The shared rules sit between
`xmas-common:start` and `xmas-common:end` in `globals.css` (identical on every sister site); this site's colours sit in
the `xmas-site` block after it. Art is eight small SVGs in `public/xmas/`. To end it early, move the `to` date; after
Boxing Day it switches itself off.

## 2026-11-01 — Regional homepages lead with "MTG <region>"; no singles page for "shock lands price"

Search Console (90 days to 29 Oct): "mtg nz" and "magic the gathering nz" reach `/nz` and `/nz/releases` at positions
36–67 under "MTG booster box prices in New Zealand". Region homepages outside the US now lead with the words people type
("MTG NZ: Magic booster box & sealed prices, N stores"; Australia, Canada, Europe and Singapore spelled out, as searched).
The US title is unchanged. "shock lands mtg price" still shows the old singles URL `/cards/name/shock` (301'd) at position
80+; it is a singles query and this site is sealed-only since 2026-10-21, so no page is built for it.

## 2026-11-01: A beta community forum, no accounts, posts in this repo

The owner asked for "user forums ... you don't need to be able to sign in ...
put your name down ... it'll save your name ... all of this is public data ...
keep it within each website's repository", on every site, to give the sites a
reason to come back that search rankings alone don't. `/forum` (docs/forum.md):

- **Storage:** `forum.json` on this repo's public orphan branch `forum`
  (never deployed: its own vercel.json, plus `deploymentEnabled.forum: false`
  here). Written only by `POST /api/forum` with the visitor-reports token;
  a write reads the file's sha and retries when two posts race.
- **Cost:** pages read the file from raw.githubusercontent.com inside their
  normal cache life, never per visit; the browser fetches the newest copy from
  GitHub directly, so a new post shows in minutes with no deploy, no function
  and no database. Rebuilding pages for posts would have meant a build per post.
- **Spam:** honeypot, a 2.5 s minimum on the form, per-visitor limits (4 per
  10 min, 20 a day, 4 threads a day) and a per-instance cap, all in memory; no
  IP, email or hash is stored, and emails/IPs/phone numbers in posts are
  blanked. Links to other sites and slurs or strong profanity are HELD (filed
  under `held/` and flagged in the daily reports triage), never published.
- **Not dead when empty:** the site's topics with a line and a few prompts;
  never an invented post.
- **SEO:** threads are in the server HTML; a thread is noindex until it has a
  reply, the forum page until any thread has one; indexed threads carry
  DiscussionForumPosting JSON-LD.
- **Moderation:** the owner asks Claude; a post is removed by an edit to
  `forum.json` (`removeFromForum` in `src/lib/forum/core.ts`).

## 2026-11-01: Creators, "How to work with us"

Creators kept asking the owner how we'd like the site promoted, so /creators
now answers it in a "How to work with us" section (`#work-with-us`). Owner's
terms: flexible, low expectations, no contract, script or quota; any one of
three is plenty: link the site (plus their creator code where the site has
codes, RiftCompare only), a shout-out in their normal content, or a
walkthrough/review of the site. They call us their **partner**, never
"sponsor": we don't pay them for a mention. On our own pages they stay
"featured creators" ("partners" here still means affiliate links). The
section asks them to say it's a partnership (FTC/ASA), lightly. The
owner's ready-to-send replies live in the project's creators playbook, not
in the repo.

## 2026-11-01 — Visitors land on their own region's pages

Owner, 2026-11-01: "the default region is the region that the visitor is located in. And if they can't determine it,
then the default should be the US." The region-less pages already followed the visitor (RegionSuggest, US in the
server HTML), but a regional page kept whoever arrived on it: an American who clicked an /au result stayed on AUD.

`REGION_BOOT_SCRIPT` (`lib/region-boot.ts`, inline in the root layout, before paint) now moves a person, never a crawler,
link preview or audit tool, from a regional page of another region to the same page in theirs, through the page's own
hreflang alternate (a page with no copy there stays). Their region is the one they last browsed (`mtg-region`, kept by
RegionSwitcher), else their time zone's, else the US. `<main>` is hidden for at most 1.5 s while it decides. No request,
no cookie: still one CDN copy per page, and every regional page stays indexable as itself.

## 2026-11-01 — A beginners guide, not another gifts or product-types page

Bill asked for one or two new guides per site. MTG's guides already own gifts
(`magic-sealed-gifts-under-50`), product types and per-set prices, so the new
one answers a query none of them targets: "best Magic product for beginners"
(`best-magic-product-for-beginners`): which first product suits which new
player, with the region's cheapest open Starter Kits, Commander decks and Play
Booster packs today. It links the type hubs and the existing guides instead of
repeating them, and makes no contents claim beyond the ones already used.


## Contact address: compareempire@gmail.com, in the footer — 2026-11-01

The owner: "the sites that they don't [have their own email], just use compareempire@gmail.com", and contact info
"really clear on all of our websites". `CONTACT_EMAIL` falls back to the Compare Empire family inbox instead of
riftcompare@gmail.com (another brand's), and the footer now shows it as a mailto beside the Contact link on every
page (this reverses "no mailto in the footer", which existed only to keep the other brand's address out of the chrome).
`NEXT_PUBLIC_CONTACT_EMAIL` still overrides it. No form and no mail service.
## 2026-11-01: eBay and Amazon rows look like the other price rows

The owner: "the ebay and amazon links should blend in and look exactly the same as the other price rows … reflect that
change on the other sites that require it." Paid marketplace rows (eBay, Amazon, and TCGplayer where it is pinned) keep
their place and their "Ad"/paid-link label, but lose their brand tints and brand-coloured buttons: they use the same row
and the same button as a store. They are still never counted as a store and never re-ranked by commission. This
reverses the 2026-10-30 "bright, catchy colour" pinned rows; eBay ad strips and panels outside the price rows keep
their own look.

## 2026-11-02 — Free price widgets

`/widgets/p/<slug>?region=` is a live sealed price badge any blog, newsletter or store can put in an `<iframe>`: the
cheapest in-stock independent store price in the region (never a marketplace) and how many stores have it. It reads
only the public data files through `productPage`, is noindex, and is kept a day by the CDN like every data page.
Only `/widgets/:path+` may be framed. `/widgets` shows the snippet (iframe plus one plain text link, the part search
engines credit) with a real in-stock box, and a plain-HTML store badge. The daily outreach offers the widget instead
of asking for a link (owner, 2026-11-02: growth must be passive). RiftCompare and the engine sites have the same at `/embed`; here `/embed` is taken by the retired singles site's redirect (old embeds on other sites still land on `/us/sealed`), so the widgets live at `/widgets`.


## 2026-11-02 — Every set in the set list gets a pre-order page, guide or not

Pre-order landings were the family's top pages in October, but here a set had one only when a session had written its
`PreorderGuide` (sourced facts) in `src/lib/preorder-guides.ts`. Now a set in `src/lib/sets.ts` without a guide gets
`/<region>/preorders/<slug>` from `blankGuide`: the set's name and dates, every store's price list and the generic FAQ,
and nothing a source would have to back (no contents, prerelease, card count or sources line; those sections hide).
Adding the next set to `sets.ts`, which the importer needs anyway, is the whole job; a guide written later fills the
same page. `openPreorderGuides` (nav, header banner, homepage, sitemap) lists every unreleased set. A guide-less page
stays up for 45 days after release (noindexed, saying the set is out, as before) and then 308s to the set page.

## 2026-11-02 — Seasonal sale pages

`/<region>/boxing-day`, `/<region>/january-sales` and `/<region>/lunar-new-year` (owner-approved growth plan,
2026-11-02): one URL per region, kept every year like `/<region>/black-friday`, built weeks ahead so they are
indexed before the day. One component (`src/components/SaleSeasonPage.tsx`) with exactly the Black Friday
page's rows: furthest under the median of the region's stores, under their own 30-day typical price, and in
the US under MSRP. Every region has its own copy, so nothing is region-locked; the intro states where the day
is a sale day (Boxing Day: Australia, New Zealand, the UK and Canada) as a fact, not as the page's market.
Dates, the year a page is about (it rolls over a week after the event) and the copy are pure in
`src/lib/sale-seasons.ts`, checked against BANNED_COPY in `tests/sale-seasons.test.ts`; Lunar New Year is a
published-date table to 2040 (6 February 2027). Footer and sitemap always; the region home shows a card from
a few weeks before each event. Never a "was" price, a countdown or an invented sale.

## 2026-11-02 — Price alerts through RiftCompare's shared service

The owner chose "Yes, one shared service" for email price alerts on the sister sites. The site still has no accounts,
no database read from a page and no mail key; the product page gains an "Email me when the price drops" form.

- **The form** (`components/PriceAlertForm.tsx`, the same file on every sister site) posts
  `{site, productId, region, email, targetCents}` straight to `https://riftcompare.com/api/sister-alerts`.
  RiftCompare keeps the address (its own Neon project, private tables), sends one confirmation email (double opt-in)
  and checks daily. This site stores nothing and holds no key.
- **The prices** come from this site's own static `/alert-feed.json` (`lib/alert-feed.ts`, `force-static`, built with
  each release from `data/public/products.json` and `product-stats.json`): each product's `lowestPriceCents` per
  market (the cheapest open offer, TCGplayer included in the US, never eBay, never converted), with `u` =
  `/{r}/p/<slug>` (the service fills in the region), plus up to three of the site's own deals per market (the
  `isDeal` bar, re-stated in `feedIsDeal` because `deals.ts` reaches the database layer and this file is prerendered;
  a test pins them equal). Another site's alert email of the same group may end with one of them.
- The privacy page says what the form sends and links to RiftCompare's. RiftCompare's `sister-alerts.yml` fails (and
  its ops monitor reports it) when a site with alerts serves no fresh feed.

## 2026-11-02 — Share buttons

The owner wants word of mouth to be a big growth driver on every site (RiftCompare's DECISIONS has the twelve-site
entry). The product page's Share button (already the phone's share sheet, else a copied link) now sends a message
with the real price gap in that region (`lib/share-link.ts` `priceGap`: cheapest and dearest in-stock store, never
converted, TCGplayer left out), and the quick view has the same button (`/api/quick` returns the message). When a
region shows a gap, the product's og:image is `/og/p/<region>/<slug>`, a share card drawing it; it is a plain
function kept by Vercel's CDN for a day, never ISR, nothing prerendered, so only shared links cost a render. Every
shared link carries `utm_source=share&utm_medium=<product|set>`. `share` and `share_visit` join `buy_click` as the
only Vercel events (`lib/track.ts`): the button sends one, `ShareArrival` one per tab when a shared link brings
someone, and RiftCompare's weekly growth report counts both. robots.txt allows `/*utm_source=share` because X's and
Reddit's preview fetchers obey it. No shared-list page: the site has no list to share yet.

## Sites that grow each other: the family feed, cluster blocks and short footers (2026-11-02)

Owner, 2026-11-02: "We need each site to help each other grow as a team effort", and the
footer family lists were "a bit convoluted … I'm wondering if it actually helps". Plan:
"Sites that grow each other" in the consolidation doc (https://claude.ai/artifact/QjrWGrfBqH4sKctwdjwptK).

- **Three clusters** (`src/lib/family-network.ts`, the same file in every repo): card games
  (Rift, OP, Dex, MTG, Gundam, Lorcana, YGO, Cyberpunk), hobby (Wargame, Figure, Gunpla on
  Gundam Compare) and tech (Compare Empire, CamCompare). KaeYoung stays out.
- **The family feed.** Each site's own daily data job writes `family-feed.json` (its best real
  deals and pre-orders today, per region) beside the data it already commits, and copies its
  cluster sisters' feeds from raw.githubusercontent.com into `family-cluster.json`. Pages read
  the committed file: no database of another site, no request-time fetch, no new function. A
  feed older than four days, from the wrong site, with a link off its own host or a saving that
  isn't the arithmetic of its two prices is dropped (`validFeed`), so a block shows less, never a guess.
- **One block per page**, on the deals, Black Friday and pre-order pages: one tile per sister with
  its best item in the visitor's region, else the US price in its own currency. Labels never name
  a country. Plain followed links inside a cluster.
- **Footers: one short line.** The sites of our own cluster by name, then one "A Compare Empire
  site" link to https://compareempire.com/network, which lists every site. Why: nothing counts
  footer clicks, footer links get few, and Google gives little weight to sitewide links between
  one owner's look-alike sites (12 sites all cross-linked in every footer is the pattern it can
  read as a link scheme). Cross-traffic should come from the price blocks, which people have a
  reason to click.
- Here: `src/lib/family.ts` (deals per region from `dealsInMarket`, the cheapest independent store named), `scripts/family-sync.ts` in `sealed-import.yml` before the publish, the block on `/[region]/deals`, `/[region]/black-friday` and `/[region]/releases` (pre-orders), and the footer's "Other card games" line. `SISTER_SITES` is gone.

## 2026-11-02 — Amazon Associates: following the Operating Agreement's Dos and Don'ts

The owner sent Amazon's own "Operating Agreement: Top Dos and Don'ts" page (2026-11-02: "make sure you
are following these instructions for all amazon affiliates"), and every site was audited against it.
The rules we keep, on every Compare Empire site:

- **Disclosure beside every Amazon link** ("Ad" / "Paid link"), and Amazon's statement "As an Amazon
  Associate I (we) earn from qualifying purchases." in the footer of every page.
- **Amazon's trademark notice** in the footer of every page: "Amazon and the Amazon logo are trademarks
  of Amazon.com, Inc. or its affiliates." No Amazon logo, screenshot, review or Amazon's own colours
  (its orange): the page "Don't use style or color of Amazon site which may cause confusion".
- **Links lead to a specific product** (an ASIN, or a search for that exact product's name), never a
  category or generic search: "All the links or buttons on your site should take customers to specific
  products on Amazon."
- **No Amazon link in a pop-up or layer**: the quick views show none; product pages carry the row.
- **Never Amazon prices in price tracking or alerts** ("Don't track prices or set price alerts"), and no
  Amazon link or trademark in any email, SMS or printed material.
- Every link tagged, rel="sponsored nofollow"; no incentive (cashback, discount) for buying through it.
- Here: the "Also check Amazon" line on set, type and deals pages is gone (a category search); the quick
  view sends no Amazon row; the footer carries the trademark line. Product pages and guide rows keep theirs.

## 2026-11-02 — The region chooser in the hero, with drawn flags

Owner: "the region switcher must be more prevalent on all sites, on the main home page hero etc … and have
the flags as well". Every region home has a "Prices for" row of flag + code chips under its search
(`RegionChips`: plain links to each region home, which every region has, so they are followed), and the
landing page has the same row above its search, picking in place like the header's soft switcher
(`pickRegion`; without script the links go to each region home). The header switcher stays.

- **Flags are inline SVG (`src/components/Flag.tsx`), not the `REGIONS[].flag` emoji and not image files.**
  Windows draws a flag emoji as two letters ("AU"); image files would be new requests and hosting. No ids or
  clip paths, so a flag works inside the closed `<details>` menu and many times on a page. Every place that
  drew the emoji (header switcher and its list, phone menu tiles, sidebar, footer, region grid, store and
  product pages) now draws it; `REGIONS[].flag` stays for plain-text uses. The same file is in every Compare
  Empire repo that has a region switcher; keep the copies identical.
- Chips show the code, not the name: seven full names wrap even at 1280px. The name is the title and the
  screen-reader text.

## 2026-11-02 — One page per head term: "mtg booster box" is the booster box guide

Search Console (25–31 Oct): "mtg booster box" at position 32. Three of our pages answered it: the region home ("MTG booster box
prices in the US: N stores compared"), the guide `/<region>/guides/mtg-booster-box-prices` ("MTG booster box prices in the US")
and the Play Booster Box type page. Google splits a query between a site's own pages (RiftCompare, 2026-10-27).

- The guide is the landing page: it covers every box type, set by set, with the price per pack. It is now the first link under
  "Shop by product" in every region's menu ("Booster box prices").
- The home's title leads with "MTG sealed prices in <region>" instead. The region titles that lead with the place ("MTG NZ: …")
  are unchanged. The Play Booster Box type page keeps "MTG Play Booster Box prices".


## 2026-11-02: Nobody is moved to another region on a guess

Since 2026-11-01 `lib/region-boot.ts` moved every visitor on another region's page to their time zone's copy in the
browser. Crawlers were excluded, but Search Console then read regional copies as duplicates on Compare Empire, which has
the same script, and Google's guidance is not to redirect automatically on a guessed location. Now only a visitor who
PICKED a region (any `[data-region-pick]` link, kept in localStorage) is moved; everyone else stays on the URL they opened
and gets one line at the top, "This page shows <X> prices. Switch to <Y> prices · Stay", linking the page's own hreflang
alternate ("Stay" remembers the page's region). Crawlers never see the line. The script is byte-identical on MTG Compare,
DexCompare, WargameCompare and CamCompare.

## 2026-11-02 — At most one production build every 12 hours, and no branch but production deploys

**Why.** The owner capped Vercel spend at $5–6 a day across every site. 1 November cost $11.82 (normally
$2–4), and Build CPU was the largest line ($4.26), followed by CDN requests and ISR writes, which every
build multiplies (a deploy empties the page cache, so the next crawl re-renders and re-writes every page).
The `[deploy]` gate itself held; its premise did not: sessions landed 7–14 `[deploy]` commits a day per site
(manual "release now" runs and `[deploy]` in merge subjects), RiftCompare, OP, MTG and DexCompare alike.
Compare Empire's site built on every push to its production branch (84 commits that day) and CamCompare on
every three-hourly price commit, because neither had the gate.

**What.**
- `scripts/vercel-ignore-build.sh` skips a production `[deploy]` commit when the last production
  deployment (`VERCEL_GIT_PREVIOUS_SHA`, set by Vercel in that step) is under 12 hours old; the commit
  rides the next release. `[urgent]` in the SUBJECT overrides it, and only when the owner says a release
  cannot wait. An unset or unreadable last deployment builds (fail open). `tests/deploy-gap.test.ts` pins it,
  and the file is the same in every Compare Empire repo.
- `vercel.json` `git.deploymentEnabled` starts with `"**": false` and enables only the production branch
  (Vercel: when a branch matches several rules, any `true` wins). No preview is built for any branch or pull
  request, `[preview]` included; the older per-branch `false` entries stay for orphan commits' own copies.
- So "push to prod" means land on the production branch; the release reaches visitors within a day.

## 2026-11-02: an empty per-product eBay search is finished work, not a failed run

**Why.** The eBay import failed on 1 and 2 November ("Only 208 of 454 planned feeds refreshed") although every search
was answered: of 270 per-product searches, 18 found listings and 252 came back empty. Since eBay results are limited
to local sellers with stated postage (#38, 31 October) the sweep ends sooner, so the rest of the day's calls go to
hot-set products the sweep already looked for and did not find, and most of those are empty. The exit check counted
only feeds that wrote rows, so a run that did its job failed and the health monitor emailed the owner.

**What.** `feedsShortfall` (`src/lib/ebay-import.ts`) counts a counted per-product search that completed with no
listing (`feedsEmpty`) as finished. Failed, skipped and unfinished searches still count against the run, an empty
FIXED feed (set, type, chase, sealed) still does, and `BREAKER_EMPTY` still stops a run whose filter empties
everything. Not touched today's other changes (build gate, Amazon tags, region prompt, store vetting): none of them
reaches the eBay job.

The same day's tests also caught the family block's heading "Other card games on sale" (#53) on the Black Friday
page, where the copy rules ban "on sale"; it is now "Deals on other card games".

## 2026-11-03 — Footers link only card sites to card sites; every other site lists no sisters

The owner asked whether linking every Compare Empire site together helps or is a risk for search and for how the
sites look. Verdict: a sitewide footer link between sites one person owns carries little ranking value (Google
discounts it), and a mesh of unrelated sites (camera, appliance and figure sites in a card site's footer) can read
as a link network and looks odd to a reader. The owner said do it.

- `footerSisters()` in `lib/family-network.ts` (same file in every repo) now returns the other card sites for a card
  site and nothing for any other site. Gundam's Gunpla side no longer pulls WargameCompare and FigureCompare into its
  footer; the engine footer's heading is "Other card games".
- WargameCompare, FigureCompare, CamCompare and Compare Empire show no sister list in their footers, only one
  "A Compare Empire site" link to compareempire.com/network (Compare Empire: its own /network), the one page that
  lists every site. KaeYoung still links none.
- Anchors stay the brand name only, and links stay plain followed links: they are honest links between sites with
  one owner, not paid, so no `sponsored`/`nofollow`.
- Kept: the "Other card games" / hobby / tech price blocks on deals, Black Friday and pre-order pages
  (`clusterSisters`). They sit on a few pages, show real prices a reader of that page may want, and are not sitewide.

## 2026-11-03 — The quick view shows the product's own link

**Why.** Owner: "quickview popup should have a link change as well for all sites, instead of using the same link". The
pop-up kept the list page's URL, so a copied or bookmarked link lost the product, and Back left the page instead of
closing the pop-up.

**What.** Opening a quick view pushes the product page's own existing URL (/<region>/p/<slug>) with `history.pushState`
(`src/lib/quick-view-url.ts`, the same file on every site). Back closes it and restores the list's URL, Forward reopens it,
closing it (×, Escape, the backdrop) steps back, so the history never fills with pop-ups. "See price history and details"
only hides the pop-up and navigates to the URL already shown, which Next turns into a replace: Back from the product page
goes to the list. The entry copies Next's own history state (`__NA` and the router tree), so the app router passes the
push through and the page under the pop-up never re-renders.

**SEO.** No new URL exists: the link is the canonical product page, which a reload, a share or a crawler gets in full
server HTML. Never a `?view=` or `#` variant (duplicate URLs, extra CDN copies). Pinned by `tests/quick-view-url.test.ts`.

## 2026-11-03 — SEO audit: alt text on every image, old 301s pinned, landing stays short

The owner's 2026-11-03 SEO audit of all twelve sites asked for alt text, structured data, short titles and fuller
homepages. On MTG Compare:

- Every product, set-logo, eBay, cover and family image now carries the product, set or listing name as its alt
  (search results, eBay strip, region home, this week, cheapest packs, sets, store listing, blog covers, embeds).
  `tests/seo-audit.test.ts` fails on an `<img>` with an empty or missing alt.
- The old singles URLs (`/card/*`, `/sets/*`) still 301 to the sealed pages; the same test pins those redirects.
- Product pages already had Product/AggregateOffer and BreadcrumbList; titles were already under 60 characters.
- The landing page did NOT get the audit's FAQ block: the owner's 2026-10-25 short-landing rule (two sections, no
  FAQPage, `tests/shell.test.ts`) stands. The FAQ and its FAQPage markup stay on `/about` and the guides.

## Rate us and "What people say", run by RiftCompare (2026-11-03)

The owner wanted RiftCompare's rating pop-up on every site, each site's reviews public, and every written review approved in
RiftCompare's admin; star ratings count at once. This site stores nothing: the corner card (`components/site-reviews/RateCard.tsx`,
mounted in the root layout) posts cross-origin to `https://riftcompare.com/api/site-reviews`, and the region home's "What people
say" block reads the score and approved reviews from `https://riftcompare.com/api/site-reviews/mtg` in the browser (a public JSON
the CDN keeps six hours), so no page gains a function or a data read. The card copies RiftCompare's corner card, not its rating
drive: never on arrival, after 4 pages and 3 minutes or on return from a store tab, at most three times 14 days apart, always
closable; "Rate us" in the footer opens it at any time. No email is asked for. Never review markup (self-serving). RiftCompare's
DECISIONS.md, "Every site's reviews, approved in one queue".

## 2026-11-03 — New sets find themselves (Scryfall), so pre-order pages appear without anyone editing sets.ts

The owner (2026-11-03): "We need a fresh pipeline of new products for all our sites, that's where our demand is." The
pre-order page, the Coming soon block, the release calendar and the set pages already followed `lib/sets.ts`
(2026-11-02), but that list was typed by hand, so a newly announced set was missing until a session added it, and
until then the importer refused every store pre-order that named it (no set, no product).

**What.** The sealed import first runs `scripts/discover-sets.ts`: one read of Scryfall's set list (public, no key),
kept in `data/sets/discovered.json` and committed with the data snapshot (`publish-public-data.sh`). `lib/sets.ts`
merges it into `SETS`, so that same import files the new set's pre-orders, and the next release builds its pages.

- Taken: paper, top-level (no `parent_set_code`) expansion, core, masters and commander sets, plus Horizons and
  Jumpstart releases, due within 180 days (or out within the last 60). Left out, and listed in the job summary for a
  hand-written row: Mystery Booster, Un-sets, a name under four letters, a name already used, and a name that is part
  of an existing set's name ("Marvel" beside "Marvel Super Heroes"), because a bare store title would then flip sets.
- Name and date are Scryfall's; the slug is fixed when first seen (a live URL). Series from the set type; an
  expansion is Universes Beyond once most previewed cards carry the triangle security stamp, or before previews when
  its name opens with a known Universes Beyond franchise. Booster lines: Play and Collector (Jumpstart for a
  Jumpstart release, none for Commander-only).
- A hand-written row with the same code always wins: write one to add aliases, a pattern or a guide's facts.
- Never fails the import: an unreadable Scryfall keeps yesterday's file. `tests/set-discovery.test.ts`.

First live read (2026-11-03): Nauctis: The Sunken Realm (2027-02-05, Standard) and Marvel: Darkhold Destiny (2027-04-09,
Universes Beyond); Mystery Booster Commander Edition left out.

## 2026-11-03 — The daily Price Duel, on sealed prices

The card sites' share loop (Gundam, Lorcana, YGO, Cyberpunk, OP: `/daily`, a Wordle-shaped "which is worth more?") comes to
sealed, ported from DexCompare the same day. `/<region>/daily` (`src/lib/daily.ts`, `daily-data.ts`, `components/DailyGame.tsx`):
ten pairs of in-stock products a day, the one that costs more at the region's cheapest in-stock store price wins, an emoji grid and
a streak to paste anywhere (`utm_medium=daily`; Vercel events `daily_done { score }` and `share { kind: "daily" }`). Why: price
comparisons are not shared, scores are; the growth report of 3 Nov counted 14 share taps and 0 visits in a week.

- Per region, not global: the answer is the region's own price, in its own currency, from the browse index the region page already
  reads (one `marketProducts` read, CDN-cached a day with a week of puzzles inside; the client picks today's at midnight UTC).
- A product is picked by a hash of (day, slug), so an import that adds or drops products keeps almost every pair; a pair is only
  made from prices 1.25 to 8 times apart so a day's moves don't flip an answer; nothing under 5 units (packs, sleeves) or over
  2,000 (cases) plays; a sold-out or TCGplayer-only row never does. Puzzle #1 is 2026-11-03; never move the epoch.
- Linked from the sidebar's "More", the footer and the sitemap. `tests/daily.test.ts`.

## The ember-fan logo, a Creators button in the hero, and an eBay + TCGplayer banner under it — 2026-11-03

The owner wanted "a nicer logo that looks like the official one but is not a copy". The new mark (`components/Logo.tsx`, `app/icon.svg`,
`public/logo.svg`, the PNG icons, `favicon.ico`, and a flat copy in `lib/og-card.tsx`) is five flame-tongue petals fanning up from a
glowing sphere, red-orange with a lighter core, on the night-purple tile: the warm fan-shaped feel of the game's symbol, drawn as our own
lotus of flames. Nothing is traced: the tongues are straight leaf shapes that come to a point, there is no circle around them, no curled
tips and no planeswalker, mana or Wizards geometry. The five colour orbs (2026-10-27) are gone. When the mark changes again, re-render
every icon (the PNGs and the ICO were drawn from `icon.svg` with headless Chromium).

The featured-creators strip under the hero's paragraph (2026-10-30) is gone from the homepage; `/creators` is now a button in the hero
("✦ Creators"), and the page, footer link, sidebar entry and sitemap entry are unchanged. In its place, straight under the hero, sits an
eBay + TCGplayer banner (`components/home/LandingAds.tsx`): two panels side by side from md, stacked on a phone, 104px tiles with photo,
price and name. The eBay half is the sealed feed of the region the browser suggests (fetched near the viewport, as every strip is; the
page never fetches while rendering; blank tiles of the same size until it answers, a search button when there is nothing), placement
`listings-landing`; the TCGplayer half is the newest sets' products in the server HTML (`lib/landing-ads.ts`, the page's one data read
besides the picks), placement `tcgplayer-strip-landing`, each link tagged with the suggested region's sub-id. Two things that widened a
390px phone to 814px and had to be fixed before shipping: an `auto` grid track sizes to the scroll row's content (`grid-cols-[minmax(0,1fr)]`
and `min-w-0` on the panel), and a tile's `sr-only` span is absolutely positioned, so unless the tile is `relative` it is laid out at its
static position in the page, outside the clipped row. Title, description, canonical, hreflang, h1 and the links are unchanged.

## 2026-11-04 — Big-store gap: 5 stores from the per-region research

The owner asked for every big store captured with no gaps, on every site. Research per region (the sister sites' 1,300-host
union, retailer lists, community "where to buy" threads) named 23 Magic sealed candidates not in `stores.json`; a runner
probe (`scripts/probe-stores.ts`, the sandbox cannot reach stores) read each the way the import does. Five read sealed
Magic in their region's currency and are added: **Eclipse Games** (AU, `booster-boxes`: 33 sealed), **Hobbyco** (AU,
`magic-the-gathering`: 64 sealed, 26 in stock), **Card Chasers** (CA, `mtg`: 21 in stock), **Magic Traders** (EU,
`magic-the-gathering`: 38), **Game Roost** (NZ: 16). Read but not added: Games Haven (SG; its only Magic sealed sits in
a rolling `new-arrivals` collection, 0 in stock), Card Giants (US; its Magic collection is repacks and mystery bags),
Leisure Games (UK), Mind Games (AU), Cura Cards, Gumnut, Jenes, Games Paradise, Card Arena, Jeux Kingdom, OBO, Team Board
Game, Gaming Otaku (no Magic sealed in any collection), ILAN TCG and Madatsu (WooCommerce stores that state no currency).
Not addable, and why (the same list every card site hit): the biggest US and UK names run platforms with no public feed or a robots.txt that forbids reading — BigCommerce (Star City Games, Game Nerdz, Game Goblins, ToyWiz, Magic Madhouse), CrystalCommerce stores whose robots.txt disallows everything (Three Kings Loot, Carta Magica, Gamekeeper, The Connection, Card Titan, Collector's Cache, Nerd Rage, Pastimes), bot walls that answer 403 or a Cloudflare challenge (Chaos Cards, Big Orbit, Wayland, Firestorm, Mighty Ape AU and NZ, Gamesmen, EB Games, MTG Mate, Imaginaire, Le Valet, Bazaar of Magic, FantasyWelt, Keepseven, Nedgame, Poromagia, Dave & Adam's, Pro-Play, Pokémon Center, Red Hobby) and custom storefronts (Card Kingdom, CoolStuffInc, ABUGames, CoreTCG, Ideal808, Noble Knight, Miniature Market, Play-in, Parkage, Agora Hobby, Hobby Master NZ). A bot wall is never worked around. A BigCommerce reader would unlock the most (Star City Games, Miniature Market, Game Nerdz, Magic Madhouse, Game Goblins) and is the next adapter worth writing.

## 2026-11-04 — Stores without a feed: BigCommerce and Shopware read from their category pages

The big-store gap report named BigCommerce as the one platform worth an adapter. `src/lib/storefront-html.ts` (ported from OP
Compare's `lib/bigcommerce.ts`) reads a BigCommerce Stencil category page (`/<path>/?limit=100&page=N`: one `<article class="card">`
per product with its title, price and "Add to Cart" / "Out of stock" button) and, since Miniature Market turned out to run Shopware 6
rather than Magento, a Shopware listing (`<div class="card product-box">`, paged with `?p=N`, a `btn-buy` button or a stock-notify
form). The importer (`readHtmlStore`) and `scripts/probe-stores.ts` (`platform: "bigcommerce" | "shopware"`, `collections` as
category paths) put such a store through the same `identify()`, currency, floor, outlier and staleness rules as a Shopify or WooCommerce
read. A first page with no product grid is a failed read, never an empty category, so a theme that draws its grid in the browser can
never empty a store's rows. The pages state a currency only sometimes ("699.95$ AUD", JSON-LD); a page that states another currency
is refused, and one that states none is taken on the registry's word, which the probe says in its output.

Sniffed from a runner the same day (bot User-Agent, robots.txt honoured): **Miniature Market** (US, Shopware, 215 Magic sealed, 118 in
stock) and **Grand J Games** (AU, BigCommerce, 78 sealed, 59 in stock, plus its pre-order category) read and were added. Game Goblins
(US, BigCommerce) reads but lists 7 Magic sealed products, none in stock: not added. Magic Madhouse (UK) serves a bot challenge on every
page but its sitemap: out, never worked around. Star City Games, ToyWiz and Game Nerdz are BigCommerce stores whose grids are drawn by
JavaScript (no product in the HTML): not readable this way, and not worth a headless browser. Their homepages and category pages were
fetched once each for this check and nothing else.

## 2026-11-04 — HBT Collectables is removed and banned: they asked not to be linked

HBT Collectables (hbtcollectables.com, AU) answered the store outreach email by sending it to their lawyers as
"unauthorised linking" under their site's terms. The owner's call: take them off every site, apologise, send them
no more visitors. Here the store leaves `stores.json` and the shipping table, its cached offers and store stats
leave `data/public/`, and it joins `BLOCKED_STORES` (`src/lib/blocked-stores.ts`), which also drops any row of
theirs from an older export at read time and keeps a probe or registry sweep from adding them back. Both hosts
are on RiftCompare's `data/store-vetting/banned.json`. Not a judgement on the store: it does not want the
traffic, so we don't send it. The change rides the next data release.

## 2026-11-04 — List your store: stores come to us

The owner stopped cold email outreach ("not really doing anything") and set the aim: be popular enough that stores
ask us, and encourage the ones that do. Every Compare Empire site now has `/list-your-store` (shared
`ListYourStore.tsx` + the `ListStore` form in `ReportForms.tsx`), linked from the footer, `/contact` and the stores
page: what a store gets (free, no contract, never pays to rank), what we need (a readable shop, own currency,
established), and what happens next (checked within a few days, reply through the store's own contact details).
The request is filed as a `suggest-store` report with `issue: "owner"`; RiftCompare's daily reports triage puts
those first and asks for a reply within two days. No email is asked for (the reports branch is public); no pop-up,
no cold email. RiftCompare and OP Compare keep their `/stores/suggest` page (now the owner pitch) and redirect
`/list-your-store` to it.

## 2026-11-05: Pickup-only listings are left out, never shown with a shipping price

A visitor reported the Star Trek play booster box pre-order at the top of the MTG pre-orders page: a US$100 listing from 1st Capital
Gaming shown with the store's measured postage, while the store's page says the pre-order is collected in store. The importer read
nothing about that: Shopify's product feed carries the price, the stock and whether a variant needs shipping, and the store's note is
injected on its page by a pre-order app, so no feed can see it (and the same note says "Shipping: Nov 6", so the store's own
wording is ambiguous).

What the feed does say is now read:

- a Shopify variant with `requires_shipping: false` (pickup only, a service) is never a listing's price (`priceOf`); the posted
  variant is, even when dearer;
- a product whose title, tags or description say pickup only, in-store only, collection only, no shipping, cannot be shipped or
  "this item does not ship" (`src/lib/pickup-only.ts`, Shopify and WooCommerce) is left out of the store's rows altogether.

Left out, not labelled: a listing the store will not post is not a price a visitor elsewhere can pay, and the store's measured
postage (`src/lib/shipping.ts`, which already leaves pickup rates out of every figure) does not apply to it. "Pickup available" and
shipping policy ("cannot be shipped to PO boxes", "we do not ship internationally") are not refusals, and a rule here may only
refuse more, never loosen: every wording is in `tests/pickup-only.test.ts`. DexCompare's sealed app (the same reader) gets the same
change. The 1st Capital listing itself stays, since its feed says it ships and the probe measured US$9.25 postage on that
collection; if the store writes "pickup only" into the product, the next import drops it.

## 2026-11-05: Amazon's own price on the product page's Amazon row, from the Creators API

The owner's US Associates account was approved today and he asked for Amazon's API prices as price rows on every site.
Here, in two script-side steps and one reader:

- `scripts/amazon-asins.ts` runs in the daily import after the export (`sealed-import.yml`), in every region with its
  OWN Amazon (AU, US, UK, CA, DE for the eurozone; NZ and SG link to Amazon Australia as a search and stay a search, since an
  AUD price is not a New Zealand price). It searches the region's Amazon for each in-stock product (most stores first,
  `AMAZON_SEARCH_BUDGET` a region a day) and keeps a result ONLY when `identify()` in `lib/sealed-title.ts` reads the
  Amazon title as the same product (the same groupKey): the rule that matches the stores matches Amazon, a wrong merge
  being worse than a missing price. ASINs and misses go in `data/amazon/asins-<region>.json` (ASINs may be stored; a miss
  is retried after 30 days) and ride the publish commit; `status-<region>.json` says what the last run did.
- `scripts/fetch-amazon-prices.ts` runs first in every Vercel build, fetches today's prices for those ASINs (`getItems`,
  ten a call, one a second, `AMAZON_BUILD_CALLS` a region, 30 by default) into the git-ignored `data/amazon-live/`, and
  drops a price under 60% or over 160% of the product's in-stock store median. Prices are never committed: Amazon's
  licence lets a price be kept 24 hours and shown with its time.
- `lib/amazon-live.ts` gives the product page the item's own tagged `/dp/` link and, while under 24 hours old, the price;
  the page passes it to the table's pinned Amazon row (`OfferTable` `pinned.amazon`), which shows it with "as of <time>
  <region clock>" and the licence's disclaimer, and the browser hides the price after 24 hours (`AmazonPrice.tsx`) because
  the page sits in the CDN for a day. The row stays an ad outside the store order: never ranked, never the best price,
  never in deals, alerts, history, the feed, metadata, JSON-LD or the quick view (`tests/amazon-api.test.ts` pins the
  reader to the product page and the client to the scripts). Both files are traced into the functions
  (`next.config.js`).

One credential serves every store: `AMAZON_CREATORS_AU_CLIENT_ID` / `_CLIENT_SECRET` / `_VERSION` as GitHub secrets and
Vercel Production variables (the same values as Compare Empire's; `AMAZON_CREATORS_<REGION>_*` would override for one
store). Access is per marketplace and opens by itself once that store's account has qualifying sales (about 10 in 30
days); a refused store is skipped, so the feature costs nothing until then and switches on without a code change.

## 2026-11-06 — Black Friday and Cyber Monday price watch pages

The owner's October numbers (2026-11-06): the US made 73% of affiliate earnings at a US$108 average order, one US$6.4k order
earned as much as twelve ordinary days, and eBay credits only a purchase made within 24 hours of the click. His asks: Black
Friday and Cyber Monday "price watch" pages this week, so Google indexes them before 27 and 30 November, and the high end of
the market (sealed, graded, vintage) in its own prominent sections, each ending in a live eBay listing. Ported from DexCompare
the same day.

- `/[region]/cyber-monday` joins `/[region]/black-friday`: ONE component (`components/HolidaySalePage.tsx`) under two URLs,
  thin routes, `lib/black-friday.ts` `eventCopy(event)` for the words. The Black Friday page's URL, title, h1 and metadata are
  unchanged; both pages are in the sitemap for every region and link each other.
- Under the deals table, a **price watch** (`lib/price-watch.ts`, `#price-watch`): the dearest sealed in stock today (the
  region's ProductStat rows, dearest first, in stock only), the week's moves down (`priceMovesData(market).down`), older sets
  still in stock (one product per set from `olderInStockData`) and graded chase-card searches (`GRADED_SEARCHES`: Black Lotus,
  Alpha/Beta, Mox, Reserved List, Sheoldred, BGS 10). Every row ends in a tagged eBay search button (`placement: "price-watch"`,
  in `PLACEMENTS`), and the graded block carries the chase `EbayStrip`.
- Why searches and strips, not listings in the HTML: a sealed-only site holds no eBay listing of a single in its server data (the
  strips fetch at request time by design), and a graded slab is never a store row. A search link still carries the EPN tag and
  starts the 24-hour credit window on the click.
- The words keep `BANNED_COPY`: "down this week" and "dearest in stock", never "price drops", "was", "sale" or urgency;
  `tests/price-watch.test.ts` renders the Cyber Monday page in `files` mode and sweeps it, and pins the sitemap entry.

## 2026-11-06 — Awin: a store that accepts us pays from the next build, with no step by hand

**Decision (owner: "check if we are making the most of Awin, and if it's not there, just do it"):** the family's Awin
account (Compare Empire, publisher 3144410) is read each morning by Compare Empire's `scripts/awin-sync.ts`, which
publishes the programmes that accepted us, with their tracked domains, in its public `data/awin/programmes.json`. This
site copies it first in every build (`scripts/fetch-awin.ts` → `src/lib/awin-programmes.json`; the committed copy is an
empty list). `offerLink` turns a link to a joined advertiser's own domain (Magic Madhouse, Chaos Cards, Zatu…, whichever
accept) into its Awin deep link to the same page, `sponsored`, with the affiliate note. Order and prices never change.

## 2026-11-06 — Side rails on every regular screen, scrolling through ten popular products

**Decision (owner: "I do not see those ads on the left and right side of the screen … it should appear on regular 16:9
screens … 16:10 even … scrollable … up to 10 products … popular products"):** the side rails now show from 1280px wide,
not 1864px. Below 1864px the shell gives up 160px a side for them (`globals.css`: `.max-w-shell` and `xl:max-w-shell` are
`min(1480px, 100vw - 320px)` from 1280px), so a 1280, 1366, 1440, 1536, 1600 or 1680px window gets a 136px rail on each
side, 12px from the window and from the page; from 1864px the shell is its full 1480px and the rails sit just outside it as
before. Each rail runs from under the header to the window's foot and its list scrolls through up to ten tiles, popular
first, instead of as many as the height fitted (at most six). A window too short for one whole tile shows none.

**Still true:** browser-only (mounted after a matchMedia check, nothing in the server HTML, so no SEO change), fixed (CLS
0; the shell rule is CSS, identical in the server HTML, so nothing moves when the rails mount), labelled Ad, rel
sponsored under their own placements, never a store, never Amazon.

**Cost:** the content column is narrower between 1280 and 1864px (960px at 1280). Pages already lay out at those
widths (a 1024px laptop gets the same), so nothing breaks; revisit if clicks per visit fall on laptops.

MTG Compare had no rails until now: this ports DexCompare's (`SideAds.tsx`, placements `listings-side` and `tcgplayer-strip-side`). The eBay rail tops
the sealed feed up from the Play Booster Box and Collector Booster Box feeds, no listing twice; the TCGplayer rail is the
pre-footer strip's ten newest-set products.

## 2026-11-06 — Store thumbs up and down, one tally shared by every site

**Decision (owner: "a little mini area where you can rate a shop … thumbs up a store or thumbs down a store … across all
the sites you can now see that these stores are trusted"):** every store row carries two tiny thumbs beside the store's
name (`src/components/StoreVote.tsx`, the same file on every Compare Empire site), with counts once a store has votes and
a green "Trusted" mark from 3 thumbs up and 80% of the votes. RiftCompare keeps the votes and serves one public tally
(`riftcompare.com/api/store-votes`, CDN six hours), keyed by the store's host without "www.", so a shop listed on several
sites shares its thumbs; this site stores nothing and fetches the tally in the browser only (no function, no build
step). One vote per browser per store, a few per network, marketplaces (eBay, Amazon, TCGplayer…) get none. Votes never
order prices, hide a store or decide the cheapest. RiftCompare's DECISIONS.md, 2026-11-06, has the rules; change the
component there first and copy it.

**Addendum (owner, 2026-11-06: "the home page must have this as well"):** the home page gets the same rails, in the
visitor's suggested or picked region (`SoftSideAds`, the way its header and sidebar follow the visitor).

## 2026-11-06 — Buy links open the store's checkout

**Decision (owner: "for all the sites that we can, send them directly to the checkout page, with the item in the
basket"):** an in-stock Shopify store row opens that store's checkout with the priced item in the cart, through
Shopify's cart permalink (`/cart/<variant id>:1`), as RiftCompare (#340) and OP Compare (#99) do. `feeds.ts` keeps each
variant's id, `priceOf` names the in-stock variant it priced, and the importer stores it as `?variant=<id>` on the
offer URL (still the product page, with that variant picked). `offerLink` turns it into the cart link, tagged
`utm_source=mtgcompare&utm_medium=referral&utm_content=checkout`. `offerRef` (and its SQL twin) strips the variant, so a
listing keeps its identity across runs. Awin stores keep their tracked product link (Awin is returned first); TCGplayer,
eBay and Amazon keep their pages; sold-out rows and WooCommerce/BigCommerce/HTML stores keep product pages.
`buy_click` carries `link_type`. `lib/checkout-link.ts`, `tests/checkout-link.test.ts`. Revert by removing the
`shopifyCartUrl` block in `offerLink`.

## 2026-11-06 — The phone dock: the side rails' ads on screens too narrow for them

Owner: "how can we have those [eBay and TCGplayer side rail ads] on mobile phone … like I have a Z Fold 7 … but also iPhones.
How do we get those ads to show on phones in the best way that doesn't interrupt user experience, but will also potentially
get a couple of clicks."

**Pattern:** below the rails' width, one bar along the foot of the screen (`AdDock.tsx`, fed by the rails' own tiles in
`SideAds.tsx`), the phone buy bar's size and rules: 64px plus the safe area, slides on transform only (CLS 0), never on the
first screen (only after 60% of a screen is scrolled), hidden while any other ad unit, the footer, a dialog, the menu or the
keyboard is in view, never on a page with the buy bar (product pages keep their own units), ✕ for the visit. On a phone it
shows one tile at a time with a View button, eBay and TCGplayer taking turns: the next tile peeks at the edge and swipes, and
each time the dock comes back it shows the next one (nothing animates on its own). From 640px (tablets) both sides at once.
Nothing is in the server HTML and nothing is requested until the visitor scrolls a third of a screen: no SEO change.
Placements `listings-dock` / `tcgplayer-strip-dock` (or the site's equivalents) so its clicks can be read on their own.

**Why this pattern (viewport simulation, Playwright, a local build):** Galaxy Z Fold cover screen (411×960, ~21:9), iPhone SE,
iPhone 16 (393×852), iPhone 16 Pro Max (440×956), iPad (820×1180); home, browse, a guide and a product page, stopping every
half screen. Without the dock an ad unit was in view at 8–20% of stops; with it 75–90% on the home page and guides, ~70% on
browse, 0% on product pages (by design). Never two units in a phone screen because of the dock, layout shift unchanged, the
bar is 7% of the Fold cover screen and 10% of an iPhone SE (Better Ads' "large sticky ad" line is 30%). Rejected: an extra
in-flow strip (the pages already have one unit per screen at most and in-flow ads are what the visitor already scrolls past),
a corner chip that opens a sheet (an overlay, and a tap before any product shows), a ticker under the header (covers the top
of the page, where searchers land). Split halves (eBay | TCGplayer) were tried on phones first: at 375px each title was cut to
a word, so phones show one at a time.

**Measure:** the dock's placements against the strips' in the ~11-10 / ~11-17 checks. If pages per visit drop on phones,
raise DOCK_ARM or drop the dock from that site first.

## 2026-11-06 — A cart list on every site

**Decision (owner: "I really like the cart feature … all of our websites"; built on RiftCompare first, TCGEmpire
#346):** every store price row gets an "Add to cart" button, and the header a cart with its count on every width.
`/cart` (static, noindexed, out of the sitemap) groups the lines by store with ONE "Check out at <store>" button per
store: Shopify's cart permalink `/cart/<variant>:<qty>,…`, which fills that store's cart and opens its checkout. The
list lives in the visitor's browser only (`localStorage` `ce_cart_v1`): no account, no database, no function. The page
re-checks each line's price and stock from the store's own `/products/<handle>.js` in the browser (Shopify serves it
with CORS open) and leaves a sold-out line out. A line is cartable only when the row's own buy link already is a cart
permalink (the single-click checkout links), so Awin and partner stores, and rows whose variant we don't know, stay
"manual" lines on their own tracked links; eBay, Amazon, TCGplayer and Cardmarket are never lines. Shared files, the
same in every site (port fixes by hand): `src/lib/cart-list.ts`, `src/components/cart/*` (`cart-config.ts` is the
one per-site file; styles imported once from the root layout), `tests/cart-list.test.ts`.

## 2026-11-06 — Every visitor lands on their own region, the US when we can't tell

The owner, for every site: "all of our websites … should default to the US version, unless it detects the user's
country." `lib/region-boot.ts` (byte-identical in MTG Compare, DexCompare, WargameCompare and CamCompare) now moves
every person, never a crawler, on a regional page of another region to the same page in theirs: the region they picked
(localStorage), else their time zone's, else the US. This reverses the 2026-11-02 rule that moved only visitors who had
picked and offered everyone else a "Switch to <X> prices" line; Compare Empire made the same reversal earlier the same
day. Crawlers still see every regional page as it is, and URLs, titles, canonicals and hreflang are unchanged, so
indexing is untouched. A pick always beats the time zone. `tests/region-boot.test.ts` pins it.

## 2026-11-06 — eBay and Amazon rows are full price rows, on top, outlined

**Decision (owner: "eBay prices and Amazon prices should function exactly like a normal store price row. So you can also
add to cart … if it's in stock … it just sits on the very top. And it has a different colored outline"):** the eBay row
is always the first row, with a green outline, and Amazon the second, with an amber one. Both carry everything a store
row has: the stock line, the store thumbs (one tally per eBay / Amazon domain, `ebay.com.au`, `amazon.com`…) and the
cart button. They are "manual" cart lines on their own tagged links (`src/lib/cart-list.ts`), never a Shopify checkout;
an Amazon line's price is dropped from the visitor's list after 24 hours (Amazon's licence), and the cart then says to
see today's price on Amazon. With no Amazon price the row reads "Also check on Amazon", a tagged link. Unchanged: neither
is counted as a store, "Best price", a deal, an alert price or the reference price; TCGplayer and Cardmarket stay
references (no thumbs, no cart line); no Amazon link in a pop-up.
MTG Compare (and DexCompare, the same tables): the slots are now eBay, Amazon, TCGplayer, then the stores (TCGplayer was
second). The eBay listing row (`EbayOfferRow`) shows the store row's "In stock" pill, with its shipping moved under the price.

## 2026-11-06: The quick view carries the tagged Amazon link (owner)

Since 2026-11-02 the quick view showed no Amazon link (or, on KaeYoung and ScentCompare, an "Amazon" row that opened our
own product page), read as Amazon's ban on links in pop-ups. The owner noticed the quick view sends nobody to Amazon and
chose (2026-11-06) to put the product page's own tagged Amazon link there. Amazon's Participation Requirements, item
(o): "You will not post or serve any Special Links … within any pop-up or pop-under windows, transitional page ads, or
layer ads, except for pop-up windows in conjunction with your Site promoting Products closely associated with the
materials on your Site." A quick view the visitor opens for one product, showing that same product, fits the exception;
the owner accepted the remaining risk. The quick view shows the link only (the item's own page where the ASIN is known,
else the tagged search), never Amazon's price: that stays on the product page under the 24-hour licence. Uninvited
overlays (a phone ad dock, a corner card, an exit pop-up) still never carry Amazon, and an Amazon page is never framed
(item (n)).

## 2026-11-07: A case is six boxes, and eBay far under the median is never the best price (visitor feedback)

An eBay seller (JT, Leatherwood Collectibles) wrote that the Marvel Super Heroes Play Booster Box Case page (six boxes,
180 packs) showed a 120-pack "Sleeved Play Booster Case" from eBay as "Best price in stock … 26% below the median": another
product at two-thirds of the price. `rowPacks` skipped every pack check on a case (its listings state one box's packs), so
nothing caught it. Now `wrongCaseQuantity` (`sealed-title.ts`) refuses, on a Play/Collector Booster Box Case or Bundle Case,
a title that says "sleeved", a unit count other than six ("Case of 4", "24x … Master Case", "4 Bundles") or a case-sized pack
count that is not this case's ("120 Packs"; Play 180/216, Collector 72). It runs in `refusedForType` (the import AND the read
path, so stored rows go at once) and in `identify()` for store titles (collectorstore's sleeved cases, heroesworld's
"Case of 4"). Only stated counts count: plural "6 Boxes", "6x", "x6", "case of 6", "6-Box"; a set's own number ("Modern
Horizons 3 Bundle Case") is never read. Every store title on 2026-11-07 says six, so six is the rule, not a guess.

Second guard (`ebayFloorFor` / `ebayMayBeBest`, `ebay-offer-row.ts`): an eBay listing under 75% of the in-stock stores'
median (two or more stores) is still shown in its row at its price, but is never "Best price", the best-price card or a
"% below the median" claim. A real deal that far under every store is rare; a different product is not. Stores are not held
back: their deals are what the site is for, and identify() already decides what they are.

Not done: putting "6 boxes" in the eBay query. Browse requires every keyword in the title, so it would hide the real cases
titled "Play Booster Box Case" with no count (most of them); the refusal after the search does the job without that loss.

## 2026-11-07 — The low-traction cull: Secret Lairs, precons and other multi-set products must be a comparison

Owner, 2026-11-07: apply Compare Empire's focus cull to every site. On 2026-11-07 MTG Compare listed 4,798 products; 1,760 were in
stock nowhere and 1,786 at one store only; 2,158 were Secret Lair drops. Search Console (56 days, `demand` branch) put 3 product
pages over a click or 10 impressions. Same rule as DexCompare's (`lib/focus.ts`, applied by the exporter): search demand, a set
under 120 days or upcoming, two in-stock sources in one market, or a core product (boxes, bundles, packs, cases, starter kits)
with any listing. `LOW_VALUE_TYPES` (Secret Lair drops, Commander and other decks, prerelease packs, special bundles, scene boxes,
collections) need the comparison. ≈4,800 → 1,950 products. Neon and the price history keep everything; a culled URL 301s to its
type page (`data/public/culled.json`, `lib/culled.ts`).

## 2026-11-07: Three listings to index a region page; the sitemap lists the core

The owner's Search Console and Bing audit (2026-11-07) found thousands of region product pages "Crawled" or
"Discovered – currently not indexed": the same product exists at seven region URLs, and a page where one or two stores
list it is a store's shelf inside the template, which Google buckets as thin. `productTier` (`src/lib/index-tiers.ts`)
now needs three listings (stores, plus an open marketplace offer) for a region page to be indexable (`MIN_INDEX_LISTINGS`):
0–2 is thin, noindex, follow, out of the sitemap and out of hreflang (the page's `regionAlternates` already advertises
only the regions where `productNoindex` is false). The sitemap's strong tier is now the core: in stock at three or more
stores (`STRONG_IN_STOCK`), or a headline product five or more stores list (`STRONG_HEADLINE_LISTED`); everything between
stays indexable and linked, out of the sitemap. Every page stays live and every URL is unchanged. Loosen the constants
once Search Console shows the core indexed (recheck ~25 Nov). `tests/index-tiers.test.ts`.
## 2026-11-07 — Black Friday strip (owner: "capture all of the Black Friday SEO")

One line under the header on every region page, in the server HTML, linking that region's `/black-friday` from 1 November
to the Saturday after Black Friday, then its `/cyber-monday` to the day after Cyber Monday, then nothing (`saleStrip` in
`lib/black-friday.ts`, tested). The xl header entry switches to Cyber Monday on the same day; the sidebar and footer list
both pages. A link, never a pop-up (pop-up policy: nothing uninvited on a visit's first page), never a countdown or any
BANNED_COPY phrase. The strip covers the widths (phone, lg) where the header has no room for the entry.

## Black Friday guide (2026-11-07)

Owner: get the Black Friday pages indexed and ranking. The sale pages were already in the sitemap and the daily IndexNow
run (it submits the whole sitemap). Added: the guide `magic-black-friday-2026` (every region), which gives the dates,
today's cheapest Play and Collector Booster boxes, Bundles and Commander decks as a live block (the prices to read a
Black Friday price against) and five checks. It links both sale pages, and they link back to it. It makes no claim
about what will be cheaper on the day, and nothing in it matches BANNED_COPY.

## 2026-11-08 — One Our sites page instead of footer cross-links

From the owner's Search Console audit of DexCompare: its only links from other sites were ~9,000 site-wide footer
links from our own sites, all to its home page, with the brand or a keyword as the anchor. They pass no authority,
and a network of same-owner sites linking each other from every page is the pattern Google's link-spam policy warns
about. CamCompare indexes well with more of them, so they are not what holds a site back, but they buy nothing.
DexCompare's footer went first (CompareEmpire #153); every other site now does the same: the footer links one
internal page, `/our-sites`, and that page links each other family site once, by its plain name, from
`FAMILY_SITES` (`lib/family-network.ts`, unchanged; `footerSisters` stays for the shared test). Every other footer
link, page URL and title is unchanged. Cross-traffic still comes from the price blocks on the deals and pre-order pages.

## 2026-11-08 — Product, guide and tool pages indexed in the US, AU, UK and CA only

Ported from DexCompare (CompareEmpire #153), after the owner's Search Console audit there: 8,899 URLs "Discovered –
currently not indexed", and a new site with no outside links offering seven near-identical regional copies of every
product and guide. `INDEXED_DETAIL_REGIONS` (`lib/index-tiers.ts`) is us, au, uk, ca: NZ, SG and EU keep every page for
visitors, but their product, guide and tool pages are `noindex`, out of the sitemap and out of every hreflang set. Their
home, sealed, set and type hubs stay indexable. The 3-listing product rule (`productNoindex`) is unchanged. Add a region
back once the core is indexed (recheck ~2026-11-25).

## 2026-11-08 — Christmas is one quiet line, not a costume

Owner: "some of the christmas themes on our websites are a bit too much - the theme must match the domain". The
2026-11-01 Christmas look (falling snow, a strand of lights, trees, presents, candy canes, stockings, a Santa hat on the
logo, candy-cane stripes and seasonal palette swaps) is gone, with its art in `public/xmas/`. The season keeps at most ONE
touch, drawn in the site's own colours: the gifts line in the hero (`ChristmasGifts`, `.xmas-pill`), a plain pill that inherits the hero's text colour, with no gift icon or red glow. It still starts and ends by itself (`lib/season.ts`, 1 November to
Boxing Day), and the tests pin that nothing else comes back. Black Friday and Cyber Monday (strip, pages, nav) are
unchanged. The same rule went to every sister site: the site's own identity first.

## 2026-11-08 — Full-width shell and a featured-product hero

Owner, 2026-11-08: KaeYoung and ScentCompare's hero ("feature some products on the hero … uses the full screen"), "maybe the same for
the DexCompare / MTG Compare engine". Ported from DexCompare (CompareEmpire #154), same files:

- From 1280px the shell runs from the eBay rail's edge to the TCGplayer rail's (`.max-w-shell` margins of 136px), the sidebar flush
  against the left rail; `.page` 1440px.
- Landing page and region homes: two columns from lg, two big product cards on the right (`components/home/HeroCards.tsx`): the
  first two `hotPicks` on region homes under the same "Hot right now" h2, the most-stocked two on the landing page (`lib/picks.ts`,
  swapped to the visitor's region through `/api/picks/<region>`). Stat chips; on a phone the type shortcuts are one sideways row.
  Same h1 words, links, URLs, titles and metadata. Seasonal decor unchanged.

## 2026-11-08 — The alert form asks, unticked, for a weekly price drops email

Owner, on the 2026-11-08 competitor scan: "implement all of this" (gap #5, a weekly email of the biggest price drops).
The shared `PriceAlertForm.tsx` (byte-identical on every sister site) gains one UNTICKED box, "Also email me this site's
biggest price drops once a week", sent as `weekly` beside the alert. RiftCompare's alert service does the rest
(TCGEmpire DECISIONS.md, "A weekly biggest-drops email for the sister sites"): it rides the same double opt-in, builds
one edition a week from this site's own `/alert-feed.json`, links only to this site's pages (no eBay or Amazon), and
every email has a one-click stop. This site still stores no address and holds no mail key, and nothing new pops up.
## 2026-11-08 — "Is this a good price?": paste a store link

Owner, 2026-11-08 (the competitor scan's gap #7, "implement all of this"): a visitor pastes a store's product link and sees whether
it is a good price. `/<region>/tools/is-this-a-good-price` (`components/tools/LinkChecker.tsx`, `lib/link-check.ts`):

- The browser asks `/api/check/<host>` for that store's listings: our own stored rows, only for a store in `src/data/stores.json`
  (anything else is a 404), force-dynamic and kept by the CDN for a day like the quick view, never ISR. It never fetches the pasted
  page. The product's cheapest and median in-stock prices come from the browse index the browser already loads.
- A link is keyed by host and path (`linkPath`: a Shopify product is `/products/<handle>` from any collection or market prefix); two
  products under one path need the `?variant=` to tell them apart, or there is no answer (a wrong product is worse than none).
- Verdict (`priceVerdict`): within 1% of the cheapest in stock is the best price; under the median fair; within 3% of it typical;
  above it "you can pay less", with the saving. A listing that was out of stock says so instead. eBay, Amazon, marketplaces, stores
  we don't read and unmatched pages fall back to a search from the link's words, and the visitor types the price.
- Pasting a link into the header search opens the checker (`#link=` in the fragment, so the CDN keeps one copy of the page).
- Fixed on the way: the old singles site's `/:region/tools/:rest*` redirect sent `/au/tools` and every tool page outside the US and
  NZ to the sealed list since the tools were ported (2026-10-23). It now redirects only paths that are not today's tools.

## 2026-11-08 — Store badges, free price data and My collection (competitor scan)

The owner approved the competitor scan's ideas (Collectr and PriceCharting keep people coming back with "what is my
collection worth"; Scryfall grew on free data credited with a link; price sites earn links from the stores they list).
- **Store badge.** `/list-your-store` ends with "Already listed? Add our badge": the site's plain-HTML "prices compared on"
  badge (an ordinary link: no iframe, script, image or tracking) and its code to copy. `ListYourStore.tsx` takes it as the
  optional `badge` prop and stays the same file in every site. Stores see it when they come to us; nobody is emailed about it
  (cold outreach stays stopped).
- **Per-store badge.** A store's own page ends with "Add this badge to <store>'s site" (`components/StoreBadgeBox.tsx`): the
  same badge, pointing at that store's page here (`storeBadge(…, path)`), so a store that adds it links to its own listing.
- **Free price data.** `/prices.json` (`lib/price-api.ts`): every product's cheapest in-stock price per market, in that
  market's currency, with an absolute link to its comparison; never eBay, never converted. Free for any use with a visible
  link back (the licence and an attribution snippet are in the file and on the widgets page). Built from the same numbers as
  `/alert-feed.json` and served as a static file: no function runs for it and only a release changes it. Open CORS.
- **My collection.** "I own this" on the product page (`components/vault`, `lib/vault.ts`, the same files in every site)
  keeps a list in the browser only (`ce_vault_v1`: no account, no database, nothing sent to us). `/collection` (a static,
  noindex shell) values it from `/prices.json` in the market each item was added in, one total per market (never converted):
  worth today, the change since the items were added, the change since the last look (one total per market and day in
  `ce_vault_days_v1`), and a share line with the real totals (`utm_medium=collection`). Values are the price to buy it again
  at a store, and the page says so. Linked from the footer.

## 2026-11-09: Navigation audit: browse sets by series (era), not only by newest

Bill: navigation is very important; a collector deep in one space wants to get to it fast. The audit scored the header, sidebar, phone
menu, search, breadcrumbs and browse pages against the rubric in the project thread. Product type was already one click (the "All
sealed" dropdown) and sets were a flat list of the newest eight, but a player who thinks "Universes Beyond" or "Masters & Horizons"
had to open the sets page and scroll. Reference: SportsCardCompare's sport/brand menus (waxcompare #13), ported to this niche's own
dimension, the series.

- The header's "Sets" item now opens a dropdown (`setsMenuColumns`, ShopMenu.tsx): one column per series (up to four), its newest
  sets under it, heading and "All <series> sets" to that series' block on `/sets` (`/sets#universes-beyond`; the page already had the
  ids and the chip row). The sidebar and phone menu get a "Sets by series" group from the same `navGroups` list.
- No new page, no new read: the lists come from `sets.ts`, and a set (or a series) no store lists in the region is left out
  (`listed`), so no dead link. URLs, titles, canonicals, h1s and JSON-LD are untouched.
- Not done: a `/series/<slug>` hub or a series filter on the browse grid (new indexable pages, owner's call); the side rails
  (`SideAds`, `AdDock`) and the footer's "Our sites" link fall short of the rubric's "no clutter" item but are the owner's own
  revenue and family decisions, so they stay until he says.

## 2026-11-09: one mega-menu component for the header dropdowns (owner)

- Bill: navigation like the best modern sites, one shared pattern across the Dex / MTG engine family. `components/NavMenu.tsx` (the same
  file in DexCompare, MTG, Gundam, Wargame, YGO and Bandai; keep them identical) wraps every header dropdown: the panel is always in the
  server's HTML as plain links (closed it is only `invisible`, so crawlers read it and keyboards skip it), it opens on hover with intent
  (90 ms in, 200 ms grace out), a chevron button toggles it for touch and click, focus into the item opens it, ArrowDown/Up/Home/End move
  through the links, Escape closes and returns focus, focus leaving or a press outside closes it, one menu open at a time, a navigation
  closes it (`aria-expanded`, `aria-controls`, `aria-haspopup`). The label stays a real link.
- Header is now Deals, All sealed, Sets, Guides, Stores, the first four dropdowns. New: Deals (best prices, stock and moves, coming soon:
  the open pre-order hub and the release calendar, replacing the "Releases" item) and Guides (guides, tools, Price Duel, blog, creators,
  forum; the separate 1440px "Blog" link went into it). Product (Play / Collector / Commander / Secret Lair) and sets by series (Standard,
  Universes Beyond, Masters, Commander) already existed.
- No URL, title, canonical, h1 or JSON-LD changed; no read or page added; the phone menu and the sidebar are unchanged.
- Not done: removing the side panel (the menus do not yet cover its deep groups, and it carries the current-section state for the
  deep levels; revisit once the menus have been in use), a phone bottom sheet (the `<dialog>` menu stays), and the side rails and
  footer links, which are the owner's own decisions. Deals is a hover menu: nothing is added to the deploy cadence.

## 2026-11-09 — A damaged-box variant is never a store's price

`priceOf` drops variants titled as damaged, dented or imperfect when the store lists others (all damaged: no listing), so a cheaper cosmetically damaged copy never becomes the product's price. Ported from DexCompare after a store asked for standard and damaged boxes to be kept apart.

## 2026-11-10: Product page weight cut, every store row kept (site review X1, ported from DexCompare)

Measured on a local production build with today's data: /us/p/star-trek-play-booster-box went from 843 KB (313 KB payload) to 483 KB (254 KB payload); /us 692 KB to 573 KB of HTML. The title, meta tags, canonical,
hreflang, JSON-LD, headings and every link are byte-identical (compared). The same change as DexCompare's entry of the same day:

- Price-table rows past `FULL_ROWS` (20, `lib/ebay-offer-row.ts`) in the server's price order are lean (`OfferRows.tsx` LeanRow):
  store, stock pill, price, button. Their data drops title, cart, per-pack, host and shipping text; the shipping cents stay, so
  "Price + shipping" still ranks them. Every row stays visible and in the server HTML. `FULL_ROWS` lives in a server module: a
  server component importing a value from a "use client" module gets a client reference, not the number.
- Row cells, `StockPill` and `ProductCard` use short `@apply` classes in `globals.css` (`.or-*`, `.sp-*`, `.pc-*`); `StoreVote`
  reads `components/store-vote.css` (imported by the root layout so node tests can load the component).
- The shipping sentence is said once, under the table, not on every row.
- `Flag` is an `<img>` of `public/flags/<code>.svg`, written by `scripts/write-flags.tsx`, not ~2 KB of inline SVG per flag.

## 2026-11-10: Store pages out of the sitemap (SEO indexing plan, SEO-4)

- 761 of the sitemap's 3,414 URLs were `/<region>/stores/<store>` pages. Nobody searches a shop's page on a comparison site, and
  Google reads a few URLs a day. DexCompare took its own out on 2026-11-07; `SITEMAP_STORE_PAGES = false` (`lib/sitemap.ts`)
  is the same switch here. The sitemap is about 2,650 URLs.
- The pages stay live and indexable, linked from each region's `/stores` directory, which stays listed. No URL, title,
  canonical or noindex rule changed. `tests/sitemap.test.ts` pins it.
- Search Console still counts 41,703 URLs for this sitemap from the old singles site. After the release, `sitemap.xml` is
  resubmitted once (site review task MTG-1, owned by the page-slimming thread).

## 2026-11-10: A "which product should you buy" guide for each upcoming set (MTG-2)

Release pages are the site's best pages (`/us/preorders/star-trek` 106 visitors a week, the Star Trek chase-cards post 9 Google
clicks at position 9.5), and Search Console's question queries are "how many packs", "cheapest booster box" and "best set to buy".
Each announced set now has a buying guide built on the shared set guide (`set-sealed-prices.tsx`) with a new `which` section: one
line per goal (open or draft: Play Booster box; foils and alternate art: Collector Booster box, 12 packs; smaller start or gift:
Bundle; Commander out of the box: a Commander deck; try the set: one pack), each with today's cheapest open listing in the region
and its per-pack price where the pack count is certain. A kind no store lists is left out. Star Trek (13 Nov 2026), Nauctis: The
Sunken Realm (5 Feb 2027) and Marvel: Darkhold Destiny (9 Apr 2027), dates from the set list (Scryfall). `SET_BUYING_GUIDES`
(`content/guides/index.ts`) maps set code to guide: the set's pre-order page links it, and the region home's pre-order section
links every guide whose set is still unreleased. The shared set guide now says "comes out on" for a future release instead of
"was released". Add a set's guide when it is announced; leave it up after release (it becomes the set's price guide).

## 2026-11-10: The US sweep takes the one-by-one searches and some of the UK's and the EU's calls (owner: "use the recommendation")

Measured over the 30 days to 11 Nov (`/mnt/project-files/strategy/ebay-site-region-split-2026-11-10.html`): the US had 74% of
visitors and every eBay dollar (A$100.40) on 45% of the sweep's calls. The run of 2026-11-10 swept US 439 / EU 141 / UK 133 /
CA 127 / AU 126 pages, then searched 255 hot-set products one by one and found listings for 18. In the US, "commander deck" and
"secret lair" stopped on eBay's 10,000-deep limit (50 pages each) and every other US query ran out, so the US left its share
unspent. The owner approved the recommended split on 2026-11-10.

- **A fixed sweep split** (`SWEEP_SHARE`, `src/lib/ebay-sweep.ts`): **US 800, CA 127, AU 126, UK 100, EU 70**, scaled to the
  sweep's budget (the workflow's 1,200: US 784, UK 98, EU 68, AU 124, CA 126). Product counts no longer decide it. The US is
  still swept first; what a marketplace leaves unspent rolls forward by the same shares.
- **US deep searches** (`US_DEEP_QUERIES`): Commander decks (under US$60, 60–150, 150 up) and Secret Lair (under US$50, 50–120,
  120 up) are searched again in price bands, each band its own 10,000 deep, so the US share has pages to spend. eBay's limit
  itself cannot be raised; a band that gains nothing stops after two dry pages like any query.
- **One-by-one searches capped at 40** (`DEFAULT_ITEM_CALLS`, `EBAY_ITEM_CALLS`). Fixed feeds 260 + sweep 1,200 + 40 = the
  1,500 daily cap. If the sweep runs dry early the rest of the cap is left unspent on the shared keyset, not spent one by one.
- The daily cap (1,500), the keyset (RiftCompare's) and the fixed feeds do not change. Recheck about 24 Nov: the Sweep table's
  US pages and stop reasons, no 429, and mtg-us-* earnings against the 30 days to 11 Nov.

## 2026-11-12: front pages feature the dearer products

Owner: "promote the more expensive items, so when users buy them we get more commission". Where the site chooses what to FEATURE (the landing page's five picks and TCGplayer banner, the region home's hero cards, deals rail, pre-order grid and TCGplayer strip) it now keeps only products at or above US$100 (`FEATURE_MIN_USD_CENTS`, `lib/feature-floor.ts`; other markets through `roughUsdCents`) and puts the dearer first. Real US data of 2026-11-12: median in-stock product $57, top quartile from $103, so the floor keeps booster boxes, Collector boxes, cases, Commander deck sets and big bundles and drops packs, prerelease packs, Secret Lair drops and most decks. The deals rail ranks by the saving in money, not percent. Cheap products stay listed, searchable and linked from their type and set pages; URLs, titles, metadata, JSON-LD, the sitemap and each product's price-ordered store rows are unchanged, the reference price stays TCGplayer's market and eBay is still never a deal. No commission rate is read. The landing hero tops up to five picks if fewer clear the floor; the pre-order grid falls back to every pre-order when none does. To change the bar, change the one constant.


## 2026-11-12: a tasteful festive layer on the Christmas season (owner)

Bill asked on 2026-11-08 to strip the over-the-top Christmas theme ("the theme must match the domain"), and on 2026-11-12 asked for it to be
more festive again. We chose tasteful accents, not a return of the costume.

**What.** Behind the existing season window (`data-season="christmas"`, 1 November to Boxing Day, the visitor's date, `?season=` preview) and
ONE off switch, `CHRISTMAS_FESTIVE_LAYER` in `src/lib/season.ts` (it sets `data-festive` on `<html>` and gates the card's markup): (1) a one-line
"Christmas gift guide" card on the home page, an inline SVG gift in `currentColor`, linking the existing "Magic sealed gifts under $50" guide, in the site's own surface and
text colours with a cranberry 3px left border and a pine icon; it is a link in the server HTML, not a heading, so every title, meta, h1 and h2 is
unchanged; (2) a 3px two-tone hairline (cranberry then pine, flat, no stripes) at the very top of the page, drawn by `body::before` from CSS
alone, with lighter tones in the dark theme for contrast; (3) the same two colour tokens (`--xmas-red`, `--xmas-pine`) on the gifts pill's border and the
Black Friday strip's bottom border, no new elements. No new page was made.

**Still gone, and pinned.** No snow, lights, Santa hats, candy-cane stripes, palette swap, sparkles, animation, image, webfont, extra request,
pop-up, floating rail or layout shift; no client JavaScript. The test pins both the new pieces and the absence of `@keyframes`, snow, flake,
canvas and repeating gradients in the Christmas CSS.

**Taking it off.** Set `CHRISTMAS_FESTIVE_LAYER = false` after New Year, or let the window end on 26 December: the card, the hairline and the
accents all go together. Without the layer the quiet gifts pill of 8 November  is what remains.

## 2026-11-12: a sign-up people can see (price alert beside the best price, a weekly-drops box on the hubs)

Owner, 2026-11-12: growth has stalled and he wants it fixed with no work from him. Measured the same day: MTG Compare had 1,193
visitors in the week to 11 Nov and RiftCompare's alert service counted 0 alerts and 0 weekly subscribers for this site since
alerts launched on 2 Nov. The only sign-up was a text link under the whole price table. The same change as DexCompare's, the
same day.

- **The price alert moves under the best price.** `PriceAlertForm` gets `prominent`: a real button (`btn-ghost`, a bell) in the
  server HTML right under the best-price card, on in-stock and sold-out products alike. The form still opens in place on a
  tap, never by itself; its fields, copy, unticked weekly box and privacy line are unchanged. The old link under the table
  is gone (one form per page).
- **A weekly-drops box on the hubs** (`WeeklyDropsBox`): the region home, deals, a set's page, price moves and this week. One
  email field, posting `kind: "weekly"` to the alert service: no product, no price, no alert; the same double opt-in. No
  heading tag, a fixed height in the server HTML, never a pop-up, never on a product page.
- **Drawn from 14 Nov** (`lib/weekly-box.ts`), once RiftCompare's release takes `kind: "weekly"`.
- **Counted**: `alert_open`, `alert_created`, `weekly_signup` in Web Analytics; RiftCompare's Monday report lists alerts and
  weekly subscribers per site.
- Unchanged: every URL, title, meta, canonical, JSON-LD and heading; no address is stored here.
- Measure on 19 Nov: sign-ups per 100 visitors.

## 2026-11-12: invite-only, raffle and lottery listings are never a price

- A visitor reported (on DexCompare) that most of the cheapest prices were invite-only offers. Same reader here, so the same fix:
  `src/lib/invite-only.ts` reads title, link, tags, description and option names; `priceOf` drops a match and the public-data reader
  drops any such Offer row an older export holds. Rules may only refuse more. Tests: `tests/invite-only.test.ts`.

## 2026-11-12 — Amazon only where Amazon carries the product (owner)

The owner: no Amazon where Amazon doesn't sell the item (RiftCompare first). `amazonCarries` (lib/amazon.ts) hides the product page's and quick view's Amazon row, and
the sold-out Amazon card, for prerelease packs, draft-night and scene boxes, Secret Lair and cases, unless the import found a real ASIN.

## 2026-11-12 — A calmer palette: three colours, three jobs (owner left the design to us; ported from DexCompare)

The owner found DexCompare's home page and quick view too busy ("too many colors … all the colored rows") and left the redesign to us; the same
clutter was here. The rule now, as on DexCompare (CompareEmpire #196):

- **The brand colour is the one thing to press**: the Search button and the best price's button, plus section links. A price table has ONE filled
  brand button; every other buy button (`.btn-soft`: the other stores and the pinned eBay, Amazon and TCGplayer rows) is neutral.
- **Green (`--open`) is money**: a saving and the best-price row (`.or-hl`: a raised ground, a 3px green edge, the "Best price" badge). Stock is
  a 6px dot beside grey words (`.sp-*`), not a tinted pill, and nothing pulses.
- **Everything else is neutral.** The row outlines of 2026-11-06 and 11-07 are gone (the classes stay as hooks); rows keep their order, tags and
  links. Ads (`.ad-box`, `.btn-ad`, the TCGplayer strip, the landing pair) are a dashed neutral box with the "Ad" label and an ink-filled button.
  Logos keep their colours. Pre-order and sale cards are plain cards; the region chip in use is the ink chip.
- The quick view's footer link is a ghost button; the hero's type chips are one sideways row at every width.
- Unchanged: URLs, titles, metadata, headings, text, JSON-LD and every link in the server HTML. Classes and tokens only.
- Measure a week on (19 Nov): outbound clicks per placement against the week before. If the pinned eBay row's clicks fall, give that row's
  button the ink fill (`.btn-ad`) before bringing any outline back.

## 2026-11-12: Only eBay and TCGplayer are paid rows

Owner: "we just want eBay and TCGplayer as the paid links at the top. That is why our revenue is declining." The pinned Amazon row
now exists only when this build fetched a real Amazon price for the product (`amazonRow` returns null otherwise), and the sold-out
page's Amazon search row is gone. `tests/paid-rows.test.ts` pins it.

## 2026-11-13: urgent release

Owner asked for every site to be released now: the unpriced-Amazon fix, Fetch as an ordinary store row and the blue TCGplayer button had been merged without a deploy marker. One build, via this commit's subject.

## 2026-11-13: the side rails are off; the ads are the strips inside the page

Owner: visitors looked down, the side banners "don't look as good" and spoil the site's look, so the eBay and TCGplayer (or Amazon) rails come off every site and the page column gets the side space back. The ads that stay are the horizontal strips inside the page and, on small screens, the phone dock (after a scroll, never on a product page). The rail code stays behind one constant (`SIDE_RAILS = false` in the rail component, or `SITE.sideRails` on MotorCompare): nothing is rendered or fetched while it is false, and the CSS that narrowed the column for them is gone. Measured before the change (Vercel Web Analytics, unique visitors, Oct 30 to Nov 5 against Nov 6 to Nov 12, the rails having shipped Nov 6): DexCompare 4,200 to 4,972 with bounce 57% to 43%; RiftCompare 3,399 to 3,179 (its fall was Oct 29, a week before the rails); OP Compare 1,123 to 1,016. The measure to watch next is clicks per placement for the strips, not visitors. Never re-add rails, a floating banner or a gutter ad without the owner.

## 2026-11-13: one horizontal in-page ad block in place of the side rails

Owner: with the side rails off (2026-11-13: the side rails are off), replace them with ONE bigger, subtler, horizontal ad block inside the page that looks native: the site's own
dashed `.ad-box`, a small "Ad" pill, six larger tiles (172px pictures, the logo word, two title lines, price and "View"), eBay's and TCGplayer's taking
turns, eBay first, scrolling sideways when the column is narrower (`.scroller`). No pop-up, nothing fixed, no side space.

- **Where, once a page** (`components/InlineAds.tsx`): the region home between sections (where the TCGplayer strip was), below a product page's "More
  from <set>" and below a set page's grid, never beside a buy button or above a price; every other region page gets it from the layout directly above
  the footer. The pre-footer eBay strip, the pre-footer TCGplayer strip and `TcgplayerStrip` are gone (replaced, so a page has one such block). The
  page's own eBay strips and in-feed tiles are unchanged; the in-feed tiles still start past the 6th listing, which the block can show.
- **Browser only, CLS 0:** the server HTML holds an empty box of the block's height; tiles are fetched (the sealed feed the strips share, CDN-cached) and
  drawn when it nears the viewport; under three tiles the box is removed. The phone dock stays and yields to the block (`[data-ad]`).
- **Paid links:** eBay and TCGplayer only, never Amazon; `rel` sponsored; placements `listings-inline` and `tcgplayer-strip-inline` (the side placements
  are removed). Never a store row, best price, deal or alert. `tests/side-ads.test.ts` pins it. The rail code (`SIDE_RAILS`, the two rails) is deleted.

## 2026-11-13: the price alert button is in the quick view too

Ported from DexCompare the same day (its DECISIONS.md has the measurement: over half of Dex's buy clicks start in the quick view, and the alert button, on the product page only, had no taps in its first day and a half). The quick route sends `alert` (the service's site key, the product id, the region's lowest in-stock store price and its market) and `QuickView` draws the same `PriceAlertForm` above its footer link: a button, the form opens in place on a tap, never by itself. A response the CDN kept from before has no `alert` and draws nothing. `QuickView` takes the site key from the route, never from `lib/alert-feed.ts`, which reads files. `tests/quick-view-alert.test.ts`.

## 2026-11-13: the front page is trimmed: a short "Coming soon", ten products, green stock words

Owner: the landing page's "Coming soon" block "takes up too much of the page … so long vertically when there's only one row", the front page
should show more in-stock products, and the "in stock … at X stores" text should be a different colour.

- **Coming soon** (`components/ComingSoon.tsx`): the hub link moved up to the heading's line, and on the landing page the products are ONE sideways
  row of fixed-size tiles. Before, the block reserved a full row per product of the busiest region (so a region swap moved nothing), which left the
  US, with one pre-order, four empty rows. One row is the same height for every region, so the swap still moves nothing (CLS 0). The region home's
  block keeps its two columns and gets the same one-line heading.
- **Ten picks** (`lib/picks.ts` `PICK_SLOTS`, `HomeRegionGrid` `SLOTS`): "Most stocked in <region> today" is two rows of five (ten rows on a phone),
  from the same pool (the region's newest in-stock Play and Collector Booster Boxes, up to sixteen); the second row's photos load lazily.
- **Stock words** (`globals.css` `.sp-open`, the landing grid's line): an open product's "In stock at 12 of 15 stores" is the stock green, semibold,
  instead of grey words beside a green dot. This relaxes one detail of the calm palette (2026-11-12): green is still the only colour used, for money
  and availability; pre-order, sold-out and stale stay grey.

URLs, titles, metadata, headings and JSON-LD are unchanged. Released with `[deploy] [urgent]` in the merge subject, as the owner asked.

## 2026-11-13: the minimal look: one navigation, a hero of words and a search, products first

Owner: "we're making things too complicated, and before it was simplicity that was driving it … get rid of the products on the hero … cull the
features that we show and all the display aesthetics … we can be minimalistic, dynamic, aesthetic and smooth without having everything there". Ported
from DexCompare the same day (its DECISIONS.md has the review of every page type), with this site's own names, copy, product types, colours and data.
It goes further than the trim above (same day): the "Coming soon" block that entry shortened is off both home pages. It reverses the 2026-11-08
featured cards in the hero.

- **One navigation.** The desktop sidebar (`SideNav.tsx`, deleted) repeated the header's menus down the left of every page. The header is the site's
  only navigation now: four sections (Deals, All sealed, Sets, Guides), each with its menu, then the search with the row's spare room, the theme, the
  region and the cart; below lg the menu button's sheet lists the same groups (`lib/nav.ts`). The row had up to seven entries: the seasonal "Black
  Friday", "Stores" and eBay's sponsored link are out of it. "Stores we compare" and the booster box price guide (the sidebar's first link) are in the
  Guides menu's "The data" column, both sale pages lead the Deals menu in season (`dealsMenuColumns`; the strip under the header stays), and the All
  sealed menu lists eight sets, as the phone menu does (with seven, the eighth newest set had lost its link from every page). So no page lost a
  site-wide link: compared link by link on 24 pages, the only internal links that left a page are product links from the home pages' cut blocks (1 on
  the landing page, 8 on /us, 7 on /au, 8 on /uk), each still linked from its type page, set page or pre-order hub. eBay's link is out of the header:
  no ad in the navigation. The page is one centred column, 1200px (`max-w-page`; it was 1440px beside a 240px sidebar).
- **The hero has no product, on the landing page and on every region home** (`components/home/Hero.tsx`): the same h1, one line under it, the search,
  the region row and six ways in, centred, on a ground of two CSS gradients. `SoftWaysIn.tsx` points the landing page's ways and search at the
  visitor's region, as `RegionSuggest` did for the old shortcuts. `HeroCards` and `SoftHeroCards` ("Hot right now") are deleted, not hidden; the stat
  chips, the "Shop by type" chip row (the All sealed and Deals menus) and the Creators chip (the Guides menu, the footer) are gone. A region home
  keeps its breadcrumb and one quiet line (stores, in stock, checked). In season the landing hero's one pill is the Christmas gift guide; the
  Halloween dressing is no longer placed (`HalloweenDecor`, `InnistradComing` and their CSS stay for next October's decision). Both headlines are
  long, so they are set a size down on a wider measure (`.hero-h1-long`): two lines on a desktop, where the landing page's first products show at the
  foot of a 1440×900 screen.
- **Where pre-orders live now.** The "Coming soon" block left the landing page and the region home (`ComingSoon.tsx`, `ComingSoonSwitch.tsx`,
  `lib/coming-soon.ts`, `lib/coming-soon-data.ts` and `tests/coming-soon.test.ts` are deleted: nothing else used them). The owner wanted it short, not
  unreachable, so pre-orders are: the hero's sixth tile on the landing page ("Pre-orders": the release calendar, with what stores have open); the
  hero's pill (the soonest set with a pre-order hub) and the shelf's Pre-orders tab on a region home, whose sixth tile is "All sets"; and the Deals
  menu's "Coming soon" column (the open hubs, then the calendar) on every page.
- **A region home was eighteen blocks, one after another; it is six.** The hero; ONE shelf, "In stock today", whose lists (Play booster boxes,
  Collector boxes, deals, pre-orders) sit behind tabs (`Tabs.tsx`: every panel is server-rendered and stays in the HTML, a tab only chooses which
  shows, no request); the four latest sets as tiles, two columns (a Magic set's name and "Play Booster Box from $179.99" need the width); the weekly
  email; the page's one ad block; then the reading matter (the market report's four sections and "Every set and product type") as closed `<details>`
  with their `<h2>` in the summary (`Fold.tsx`), and recently viewed. Gone from the page, each still one click away: the Black Friday and sale cards
  (the strip under the header; the Deals menu), both eBay strips, the latest sets' product rows and the "which product to buy" links (each set's page;
  the footer's guides), the older-sets rows (Deals menu, "Older sets in stock"), the six guide cards (Guides menu, footer), "How MTG Compare works"
  (/about, from the footer) and the reviews row (the footer's "Rate us").
- **The landing page is the hero, the region's ten and one ad block.** The paragraph on how stores are ranked is gone: the footer says "No store pays
  to be listed or to rank" on every page and links /about. The eBay + TCGplayer banner (`LandingAds`; owner, 2026-11-03: straight under the hero) is
  still the page's one ad block, under the ten products now: the products are what the visitor came for.
- **List pages show products first.** A type page's intro and facts table (two clamped lines and "More about") sat between the headline and the grid;
  they are the fold "About <type>" under it, and its two text links are buttons under the grid. A set page's sentence opens its "About", its per-pack
  strip follows the product grid, and its header lost its box.
- **The product card** is the photo, the name, one stock line ("In stock · 12 stores", still the stock green of the trim above; its title keeps the
  whole sentence, "In stock at 12 of 15 stores") and the price, with the per-pack price beside it and at most one badge on the photo (−N% under the
  median, else "Below MSRP" where Wizards publish one, US only). No frame, type pill, series line, saving line, "+ TCGplayer" tag or compare cue. It
  is still one link with the same `data-qv*`, so the quick view and its buy rows are untouched, and so is the product page (the page that earns) apart
  from the missing sidebar.
- **Ads: the trade-off.** A page keeps ONE in-page block under what the visitor came for, the list pages' own strips and in-grid tiles, and the phone
  dock. The header link and the region home's two strips are gone. Revenue check, 13 November: side rails and banners had 163 eBay clicks and 0 sales
  last week; the earnings come from the product page's and the quick view's rows, which did not change. Clicks per placement are rechecked on 19
  November; if the home's strips earned, one comes back under the shelf.
- **Motion is CSS only** (`globals.css`, "Motion."): the hero's parts rise in turn on load (the h1 moves 10px but is never transparent, so the largest
  paint is not held back), sections rise as they scroll in only where the browser ties it to the scroll position (`animation-timeline: view()`), tabs
  and folds fade in, the header takes its line once the page moves under it (a colour, tied to the scroll). Transforms and opacity only, inside
  `@media screen and (prefers-reduced-motion: no-preference)` or switched off under `prefers-reduced-motion: reduce`; nothing in the layout moves. No
  animation library, no scroll listener, no observer.
- **Found on the way, and fixed: every region page was wider than a phone's screen.** A visually hidden label inside a sideways scroller that is not
  positioned is not clipped by it and counts toward the page's width. On a 390px phone the layout was 962px wide on every region page once the ad
  block's tiles loaded and 658px on a product page from its first paint (1,726px on a 1440px desktop), so the page slid sideways. `:where(.scroller,
  .overflow-x-auto, .overflow-x-scroll) { position: relative }`: 390px (and 1440px) on all thirteen pages measured, after scrolling each to its end.
- **Measured, old build against new, same data** (US region; phone 390px, desktop 1440px; heights at load): the region home 27,157px → 7,132px on a
  phone and 15,848px → 5,344px on a desktop; its HTML 505,515 → 402,397 bytes, elements 2,357 → 1,787, links 460 → 381, first-load JS 148 → 139 kB.
  Landing page: 5,049px → 3,883px on a phone, 3,203px → 2,869px on a desktop, 200,953 → 171,118 bytes, 1,026 → 829 elements, first-load JS 143 → 140
  kB. A type page 1,448 → 1,248 elements, a set page 1,920 → 1,630, the product page 2,602 → 2,468 (its JS unchanged at 142 kB). Titles, descriptions,
  canonicals, hreflang, robots, Open Graph, h1s and JSON-LD compared field by field on 24 pages against the build before: no change.
- `tests/minimal-look.test.ts` pins the hero (no product, no ad, no script), the shelf (every panel in the HTML), the folds, the region home's order
  and outline, where pre-orders live, the products-first order of a type and a set page, one h1, valid JSON-LD and the motion rules; `shell`,
  `shop-menu`, `black-friday`, `side-ads`, `hot-ui`, `geo` and `base-components` are updated for the new markup.

URLs, titles, metadata, h1s and JSON-LD are unchanged. Released with `[deploy] [urgent]` in the merge subject, as the owner asked.

## 2026-11-13: "+ I own this" has its padding: the collection's button and link carry their class's weight

Found while checking the minimal look, old build against new (Lighthouse, then a walk of the product page). The redesign changed
nothing here: the fault is as old as the collection. `vault.css` wrote the button as `:where(.ce-vault-btn)`, which weighs nothing,
and Tailwind's preflight styles a bare `<button>` (padding 0, the parent's size and weight) and a bare `<a>` (the parent's colour):
one element out-weighs a `:where()`. So "+ I own this" and "Share my collection" drew with no padding, their words against the
border, at 16px and weight 400 where the file asks for 14.4px, 14px and 700, and "See my collection →" was the text's colour, not
the accent. The two rules are written with their class now (`.ce-vault-btn`, `.ce-vault-link`). Measured on a fresh build: the
button is 111.8×40px with 14.4px of padding (it was 91.2×40px with none), and the link is the accent, which reads at 4.5:1 or
better on the page's ground in both themes.

`tests/vault.test.ts` reads the reset from `tailwindcss` itself and the elements from the components' markup, and fails on any
`:where()` rule in `vault.css` that the reset beats (six lines on the old file). `cart.css` is written the same way and is left
alone: its add button is an icon, where the lost padding and size show nothing, and its class's weight would out-rank the
`text-muted` the price rows put on it. DexCompare and YGO Compare took the same fix the same day; the file is also on Gundam, Bandai, Lorcana,
Cyberpunk and SportsCardCompare, which this change did not touch (reported). No deploy marker: it rides the next release.

## 2026-11-14: A/B tests in the quick view: two 50/50 splits, 20 November to 3 December

The owner (2026-11-14): "we need to do some A/B testing to determine what is the best way for us to earn more revenue". The same
build as DexCompare's (its DECISIONS.md, 2026-11-14, has the full reasoning). Measured here, 7-13 November: 1,364 visitors, 1,143
buy clicks, 591 of them (52%) inside the quick view; TCGplayer 184 clicks, eBay 84, Amazon 65.

**Where: the quick view only** (`src/lib/ab.ts`, `src/lib/ab-client.tsx`). The panel is drawn in the browser after a tap and is
in no page's server HTML: no cookie on the server, no second URL, no cache key, nothing a crawler reads changes. The product
page's own table always draws the control (`tests/ab.test.ts`). The visitor's coin tosses live in their own `localStorage` (`ab1`).

- `order` (US only): eBay's row then TCGplayer's (the control), against TCGplayer's priced row first, eBay's under it. Both stay
  pinned above the stores; "Best price" and the stores' order do not move.
- `cta` (everyone): TCGplayer's priced row's button says "View deal" (the control), against "Buy now".
- DexCompare's third test, `mini`, moves a small ad pair this quick view does not have: every visit here carries `-` for it.

**Counted** once a visit each: `ab_seen`, `ab_paid`, `ab_tcg`, `ab_ebay`, `ab_amazon`, `ab_store`, one property `k`
(`us:a-b`). Fixed dates, decided before any number is seen: nothing before 20 November 00:00 UTC (the 19 November rechecks read an
untouched site), nothing from 4 December 00:00 UTC, no stopping early; two-sided two-proportion test on the share of visits with a
TCGplayer click, p under 0.05, else the control stays. RiftCompare's earnings refresh reads the events and the Monday report shows
them. No deploy marker: it rides the next release.

**The event list grew (`src/lib/track.ts`, owner's rule of 2026-10-25: only listed names reach Vercel).** The tests' eight names
joined it, and so did `alert_open`, `alert_created` and `weekly_signup`: the sign-up work of 2026-11-12 sends them, but they were
never listed, so every one was dropped and the 19 November sign-up recheck would have read zero for MTG Compare whatever happened.
They count from the next release. `tests/track.test.ts` pins the whole list.

## 2026-11-14: Every sitemap product is linked from its siblings; lastmod is the day a page changed

The owner's Search Console check (14 November): 3 of 20 sampled sitemap URLs indexed, most of the rest "URL is unknown to Google",
and the sitemap still counted at 41,703 URLs. Audited on a production build of the 14 November data, every page of the US and AU
sitemaps fetched and read (965 and 372 pages), then every page reachable from `/us` by links (2,001 pages).

**What was already right, so nothing changed.** All 2,672 sitemap URLs answer 200, are indexable and are their own canonical; no
noindex page is listed; one `h1` each; no duplicate description; product pages carry Product + AggregateOffer with the real low and
high price and offer count (801 of 801 in the US; a sold-out page carries none, on purpose), list pages ItemList, every page
BreadcrumbList; hreflang names only the regions where the page is indexable. The old site's URLs redirect in one hop. **The old
sitemap is not being served anywhere:** the singles site's index was `/sitemap.xml` too, with children at `/sitemaps/<kind>-<n>.xml`
and a `/news-sitemap.xml`; the children and the news sitemap answer 404 and nothing redirects them. So the 41,703 is the count from
Google's last read of the old index at the same URL, and it changes when Google reads the index again (the one resubmission is
the owner's, MTG-1). `tests/internal-links.test.ts` pins that no route or redirect brings those files back.

**1. Internal links (`lib/ring.ts`, `lib/product-data.ts`, the product page).** 255 of the US sitemap's 801 product pages were
linked from two indexable pages or fewer: their type page and the sealed list. 220 were Secret Lair drops. The cause: a product
page's "More <type>" block showed the same cheapest four on every page of the type, and "More from <set>" the same cheapest eight on
every page of the set (41 of the 73 sets the US lists have more than nine products; Star Trek has 59). Both blocks now show the
products that FOLLOW this one in the list, wrapping at the end (`ringAfter`), so every product is picked by as many siblings as the
block holds:

- no set (`typeNeighbours`): the four after it by name among the type's in-stock products whose page is indexable. Name order keeps
  a line together (a From the Vault box shows the other From the Vault boxes, where it showed three Signature Spellbooks).
- in a set (`setNeighbours`): the eight after it in the set's own order (in stock, cheapest first), so the ones priced next above
  it. A sold-out product, and a set with eight or fewer in-stock indexable products, keep the first eight as before. The sold-out
  page's "In stock instead" is unchanged.

After: 1 of 801 at two links or fewer; the median product has 11 indexable pages linking it (it was 6), the tenth percentile 6
(it was 2). AU: 1 of 223. Same block sizes, same cards, same markup: the average product page is 340,448 bytes (340,797). No new
query: both read what the page already read.

**2. Sitemap lastmod (`lib/sitemap.ts` `sitemapChanges`, `app/sitemap.ts`).** Every product, set and type URL carried the import's
time, so all of them said "changed today" twice a day: 889 of 889 US URLs on one date. A date that is never false is the only one a
crawler uses. A product's lastmod is now the day of its last change-point in the daily price history (its cheapest in-stock price
or its count of stores with stock: what the page leads with); a set's or type's is the latest of its products'. On the 14 November
data the US file has 22 different dates and 309 URLs dated today. A product with no history yet, the section pages (deals, this
week) and `PUBLIC_DATA_MODE=db` keep the import time. The URL list is the same, line for line.

**3. Two links that were 404s**, found by the crawl: the release calendar's chip to a Pokémon guide left from the DexCompare port
(now the sealed-products guide), and the pre-order guide's link to `/<region>/preorders`, which has no page (now the release
calendar). The test walks `src` for both kinds.

Not done, on purpose: titles (three Warhammer 40,000 Collector's Edition decks share one shortened title in the US; a title rule
change needs its own look), old `/sets/<code>` URLs to today's set pages (the old codes are not today's slugs), the sitemap index
getting a lastmod, and the blog's "More from the blog" (the three newest posts are the ones Google sends visitors to; every post is
one click from `/blog`). URLs, titles, descriptions, canonicals, robots, hreflang, h1s and JSON-LD are unchanged. No deploy marker:
it rides the next release.

## 2026-11-14: The product page reads every store (ported from DexCompare)

`productPage` read a product's offers with `take: 80` and no order. The file store returns rows in file order, so on a product more
than 80 stores list the page kept 80 arbitrary ones. On the 14 November data that is 48 of 5,872 product-market pairs (146 stores at
most). Such a page could drop its cheapest in-stock store, and then its title, best price, quick view and Product JSON-LD stated a
dearer price than the list card beside it. DexCompare had the same read (its 2026-11-14 entry: 89 pages, 23 with a dearer
"cheapest").

Now both capped offer reads (`productPage`, `setOfferGroups`) order first: in stock, then cheapest, then store name, and the product
page's cap is `PRODUCT_OFFERS_TAKE` (200), above today's largest product. Past the cap the dearest sold-out rows are the ones left
out, never an in-stock one. `tests/product-offers-cap.test.ts` pins it on the committed data. No deploy marker: it rides the next
release.

## 2026-11-14: a polish pass: the faults a first-time visitor meets, fixed in the shared styles

The owner asked for the sites to look significantly better and feel friendlier. The minimal look of 13 November stands; this pass
adds no block, banner, badge or section. It walks the home, list, set, product, search and 404 pages on a 390px phone and at 1440px
(both themes), measures them, and fixes what a careful first visit trips on. Before and after screenshots:
`/mnt/project-files/redesign/2026-11-14-polish/mtg/`.

**No paid link, ad block, placement, pinned row, URL, title, description, canonical, robots, Open Graph, JSON-LD, h1 or h2 changed.**
Checked on ten pages of the build before and the build after, scripts off: the metadata, the heading outline, the set of links, every
`rel="sponsored"` link and every price-table row (198 across the three table pages) are the same text, byte for byte. The 19 November
clicks-per-placement recheck and the quick view's A/B test (20 November to 3 December) read the same placements. The quick view, the
price table's rows and every `.btn-*` rule are untouched: each of those buttons is a paid row's button somewhere.

- **Every page scrolled sideways on a tablet or a small laptop.** The widest header dropdown (four columns, 46rem) hangs from the
  third nav item and ran 94px past the window from 1024px to 1117px wide; a closed panel is only invisible, so the whole page was
  1118px wide there. Below xl it sits 10rem to the left (`HeaderNav.tsx`); measured at 320, 360, 390, 768, 1024, 1100, 1180 and
  1440px on nine pages: none is wider than its window. A set page was 15px too wide at 320px (the previous/next set tiles): fixed.
- **The footer.** A link that wraps keeps 6px above and below it (two long guide titles read as one paragraph). The guides, twenty
  sentence-long titles, were one of four narrow columns: a ribbon 1,000px tall on a phone and 1,500px on a desktop, with the last
  column pushed onto a row of its own under it. They have their own row now, in one, two or three columns by width, and the short
  column moves up beside the others (dense flow; the HTML's order and every link are unchanged). A desktop page is about 700px
  shorter (the region home 5,620px to 4,928px).
- **A product's name is not cut on a phone.** Two lines cut the product type off a long set ("Teenage Mutant Ninja Turtles Play
  Booster…": a box or a pack?). Three lines on the phone's two-column grid, two from sm; the stock line and price stay at the foot.
- **Searching from a phone's header.** The box showed about seven letters. While it has focus it takes the room of the theme
  switch and the region flag beside it (CSS, `:focus-within`); both return when it loses focus, and the cart and menu do not move.
- **The phone menu's title** read "MTG Compare United Sta…". It is the name and the region's flag and code, as the footer shows it
  (the whole name is still read out).
- **A search that finds nothing** said "Nothing matches those filters" to someone who typed a word. It names the words ("No sealed
  product matches "…""), says what to try, and its button says "See every product". The marketplaces' box under it is unchanged.
- **The 404 page** kept the dark default for a visitor who had chosen light: React draws that page whole in the browser, so the
  boot script in `<head>` never runs. `ThemeToggle` stamps the saved choice when `<html>` has none. Its sixteen tiles fill four
  columns from md (three left one alone on a sixth row).
- **Keyboard focus squared round buttons off.** The focus rule sits outside the layers and set a 6px radius, which out-ranked
  every `rounded-*` class. The ring follows the element's own corners now; a bare text link keeps soft ones (`:where()`).
- **Small things.** The region home's facts line no longer ends a row on a hanging dot. "Cheapest per pack": the name and the line
  under it sit together whether the name takes one line or two, and the whole cell is the link's target. 40px targets for the theme
  switch, a section's "All … →" link, the hero's pill, the weekly email's button (44px, beside its 44px field) and "Send report".
  A chip gives a little when pressed (transform, 150ms, off under `prefers-reduced-motion`).

**Seen and left.** In the price table on a phone a store's name, its per-pack price and its shipping are cut short ("MinM…",
"≈ $…"): the row's grid gives the name the width the buttons leave. Those rows are shared with the pinned eBay, TCGplayer and Amazon
rows and with the quick view, which are frozen until the A/B test ends on 3 December; fix it after that. The store thumbs (20×16px)
and the "Price / Price + shipping" switch (36px) are in the same table. `ReportForms.tsx` and `WeeklyDropsBox.tsx` are files shared
across the sites with their own inline styles, left as they are apart from the two button classes the pages pass in.

`tests/polish.test.ts` pins each cause (11 tests). No deploy marker: it rides the next release.

## 2026-11-14: Product titles a region's pages shared keep the words that tell them apart; the old singles URLs keep their redirects

**Titles.** Computed for every product page of every region on the 14 November data (5,872 pages): 51 pages shared their `<title>`
with another page of the same region. The four Warhammer 40,000 Collector's Edition Commander decks were all "MTG 40K … Commander
Deck (Collector's Edition) price, US" (and the same in the UK, Canada and the EU), the three March of the Machine Halo Foil Secret Lair
volumes one title, three Secret Lair Non-Foil drops one title, Star Trek's Collector Commander decks the same as the plain deck of the
same name in Australia, and so on. The cause: a name too long for 60 characters is cut to "MTG <SET CODE> … <its last words>", and
in these names the words that tell them apart (the deck's name, "Collector", "Vol. 1") are in the middle.

Now `seoCopy.productTitle` takes the set's other products (`titleSiblings` in `lib/product-data.ts`: this region's and every
region's, from the data files already in memory; no query, and in `db` mode none, so the title is the plain one). Only when the
plain title is also a sibling's in this region does it change (`distinctTitle`): within the same 60 characters it keeps the name's own
words, in order, in one to three runs joined by "…", choosing the words rarest among the set's products, and only a choice whose words
are not all in another product's name, so it cannot describe a sibling. "MTG 40K Necron Dynasties Commander … (Collector's) price, US",
"MTG 40K Forces of the Imperium … (Collector's) price, US", "MTG Secret Lair … the Machine Vol. 2 - Halo Foil price, US". The words are
chosen against the whole set so a product reads the same in every region.

37 titles change (all of them shared before), none passes 60, and no other title changes. Left shared: three pairs of products whose
names are the same word for word ("Reality Fracture - Secret Lair Bundle" in the US and Canada, "Star Trek - Beam Me Up Bundle" in
Canada): the name holds nothing that tells them apart, and the name is the store's. `tests/product-titles-unique.test.ts` pins on the
committed data that no two product pages of a region share a title except such pairs, and that only shared titles change.

**The old singles URLs (investigated, not changed).** The retired singles site's paths (`/card/*`, `/cards/*`, `/sets/*` and the rest)
are `redirects()` in `next.config.js`, which Vercel answers in its routing layer before any function runs: a redirect costs no
invocation. A 410 has no such free form in Next.js: `redirects()` only redirects, a 410 from middleware or a route handler is a function
call on every hit, and the one static way (a legacy `routes` entry in `vercel.json` with `"status": 410`) changes how Vercel routes the
whole Next.js app and cannot be tried here, with previews off. Taking the redirects out instead would make `/card/<x>` land on
`/[region]` and render a 404 in a function. And the 41,703 Search Console counts are the old sitemap index's list, which changes when
Google next reads `/sitemap.xml` (the 2026-11-14 entry above), not how the old URLs answer. So the redirects stay, and old links keep
landing on the sealed list. No deploy marker: it rides the next release.

## 2026-11-14: The other pages in the home page's voice

The owner (14 November): "I like how all our compare websites are more aesthetic on the homepage now but can we make all the other
pages more aesthetic as well". The home pages of 13 November are the spec; this pass brings every other page type to them with shared
classes, and adds no block, banner, badge or section. Before and after screenshots (390px and 1440px, dark and light):
`/mnt/project-files/redesign/2026-11-14-polish/mtg/r2-before-*` and `r2-after-*`.

- **One page header everywhere.** The h1s were 24, 30, 36, 40 or 48px by page, bold or extra-bold, some without the display face.
  Every h1 but the two home heroes and the product page's is now `.page-title` (the display face, 30px on a phone to 42px on a
  desktop, set tight and balanced like the hero), and the line under it `.page-lead` (muted, a 65-character measure). On the list,
  set, type, sets, deals and the sale pages, releases, stores and a store, guides and a guide, the blog and a post, tools, about and the
  static pages, cart, collection, 404 and the error page. The product page's h1 keeps its smaller size (long names) and gains the
  same tracking and balance. Eyebrows are grey everywhere (the deals and sale pages' were brand).
- **The home hero's ground, a size down.** One soft glow of the brand colour at the top of every other page: a background on
  `<main>` (`#main:not(:has(.hero))`), not an element, so nothing is added and nothing moves.
- **Calm palette, finished on the inner pages.** The tinted boxes left over are plain cards: a set page's "Cheapest way in" (the
  per-pack price is the green, as money) and its pre-order link, the sets index's "Next set" pill, the release calendar's "Next set"
  card (its one filled button stays: the thing to press), the product page's "Value check" row, and a guide table's picked row (marked
  like the price table's best row: a raised ground and a 3px green edge).
- **Articles.** `.prose-dex` (about, terms, privacy, contact, disclosure, list your store, the guides' prose) reads on a 68-character
  measure, with two heading steps (h2, h3), grey list markers, ink bold words and a table that scrolls in its own box.
- **Indexes.** A guide card's cover shows from sm up: on a phone the guides index is a list of words and the page is 13,228px tall,
  not 18,299 (a guide page's "More guides" 18,247, not 23,112); the covers are lazy, so a phone no longer downloads them. Link cards
  (guides, the blog, a guide's "Related") lift on hover like the home tiles (transform and shadow, 200ms, the rise only under
  `prefers-reduced-motion: no-preference`), and "Related" leads with the home tiles' quiet icon square.

**Nothing paid or crawled changed.** No paid link, ad block, pinned row, placement, button word or order; no URL, title,
description, canonical, robots, Open Graph, JSON-LD, h1 or h2 text. Checked on 16 URLs, server HTML of the build before against the
build after with scripts off (two product pages in the US and one in AU, a type, a set, the sets, guides and stores indexes, a guide,
the blog and a post, a store, about, deals, the release calendar and a search): the title, every meta and alternate link, the h1s and
h2s, the JSON-LD, the set of internal links, every `rel="sponsored"` link in order and the page's whole text are identical. So the
19 November clicks-per-placement recheck and the quick view's A/B test (20 November to 3 December; the quick view is untouched) read
the same placements. Measured on the build: no page wider than its window at 390 or 1440px, no console or hydration error, layout
shift 0 on the five pages measured. `tests/inner-pages.test.ts` pins each rule. No deploy marker: it rides the next release.

## 2026-11-14: The price rows' cart button says "Add to cart"

The owner, opening the price rows: "there needs to be an add to cart button ... right now, it just sends it to the site". The
cart button was already on every store row, but as a bare grey cart icon on a computer (lost on the tinted best-price row) and
as small coloured text on a phone, so it read as decoration. `CartAddButton` now carries its words by default ("Add to cart",
"In cart" once added; "Add" beside the icon below 640px where a row has no room), with a firmer neutral border, and the phone's
text button (`inline`) is drawn as a bordered button (`cart.css`). Neutral, never a new colour: the buy button stays the one
filled action and the calm three-colour rule holds. Nothing else moved: which rows can be added (open store rows, eBay and
Amazon with a live price; never a marketplace or a search row), the line's buy link and its affiliate tag, the row order, the
buy button and every placement are unchanged. A caller can still ask for the bare icon (`label={false}`).

The quick view gets the same labelled button (owner, 2026-11-14: "there needs to be [one] on the quick view pop-ups"),
over the A/B freeze on his say-so. Its tests (20 November to 3 December) start after this ships and the button is the same in
every arm, so the arms still differ only in what each test changes; the paid rows' order and wording are untouched.

### 2026-11-14 — On a phone, a price row's two buttons get their own line

With "Add to cart" beside the store's button, a phone row's second column took the store's name down to one letter ("T  BEST
PRICE" on the cheapest row). Below 640px a full row is now name and stock, price, host, then the cart button and the store's
button side by side at full width (`globals.css`, after `.or-act`). The name keeps the whole row and the cart button says "Add to
cart" in full. Lean rows, the order of rows and every paid row's wording are unchanged.

## 2026-11-14: Review of the day's design work; the link cards stop fading for visitors who turned motion off

A second, sceptical pass over today's design merges (#145 polish, #147 the other pages in the home page's voice), building the
commit before them (e72be8f) and main side by side and comparing 16 page types at 390 and 1440px in both themes, plus server HTML
with scripts off on 24 URLs.

What it found, per page type:

- **Guides index, guide "Related", blog index, a post's "More from the blog" (the `.lift` link cards) and the tools' and
  Related icons (`.tile-icon`):** the hover transition still ran for a visitor who asked for reduced motion (measured 0.2s with
  `prefers-reduced-motion: reduce`). Both rules come after the "Motion." reduce block in `globals.css`, so their own transition
  beat its `transition: none` (same weight, later in the file). The transitions now live only inside the
  `prefers-reduced-motion: no-preference` query beside the lift itself: 0s with motion off, 200ms and the 2px rise with it on.
  `tests/inner-pages.test.ts` pins it. Nothing else about the cards changed.
- **Every other page type (home, landing, product, type, set, sets, release calendar, stores, store, about, deals, 404):** no
  fault found. No page wider than its window, no console or hydration error, no layout shift over 0.01, focus visible on the first
  six tab stops, and no text under 4.5:1 that was not already there (the TCGplayer wordmark's blue "player" on the dark theme,
  3.5:1, is a paid row's logo and frozen).

**Nothing paid or crawled changed.** No paid link, ad block, pinned row, placement, button word, URL, title, description,
canonical, robots, Open Graph, JSON-LD, h1 or h2. Server HTML before against after: identical on 21 of 24 URLs; the three product
pages differ only by the owner's "Add to cart" words (#148, his request), which removed leave the text identical. So the
19 November clicks-per-placement recheck is unaffected. Sitemap: 8 files, 2,672 URLs, no duplicates; 79 sampled all 200, indexable
and self-canonical. robots.txt blocks only `/api/` and query strings. Unknown pages return 404. No deploy marker: it rides the next
release.

## 2026-11-14: the one ad block moves up under the shelf

Owner: eBay clicks dropped right after the minimal redesign and he asked for eBay ads back on the home page. The home pages' one native ad block (eBay and TCGplayer, labelled Ad) had been pushed to the very bottom, under the sets. It now sits directly under the product shelf. Still one block a page, still browser-only with its height reserved, no pop-up, no rail, quick view untouched, same placements and customid tags. Click numbers by placement were not readable from the build container; the 19 November recheck stands.

## 2026-11-16: An all-nines placeholder price is not "in stock" (Data Quality audit)

Audit of the committed public data (offers.json, 16 Nov): 24 in-stock store rows sat at US$999.99 or US$9,999 (a store hiding a product it cannot sell: a Collector Booster at CA$999.99, a Commander deck at A$9,999). The high-outlier rule skips old sets on purpose, so they survived. `demotePlaceholderPrices` (importer.ts, ported from DexCompare) writes a store row at 99999, 999999 or 9999999 cents as sold out when the market median is under a third of it, or, with no median, when it is US$9,999.99 or more. The row and its price stay, as sold out; a real ask near the market's, or a lone US$999.99, is kept. Rows from stores unread for 72 hours are left to the page's "Not checked recently" (6 stores on 16 Nov).

## 2026-11-16: A small unpriced "Also on Amazon" line under the product table

The 2026-11-12 rule (Amazon row only with a real price) took Amazon buy clicks to zero on 13 Nov, and Amazon earnings with them. Not a row: one
line under the product page's price table, only where Amazon sells the item (a known ASIN, else a type Amazon carries), unpriced and labelled
paid, hidden when the priced row shows. Never the quick view (A/B window 20 Nov-3 Dec), never pinned, best, a deal or an alert; the region's
shared tag, placement `amazon-below-table`. Read clicks per day against 7-12 Nov. `tests/paid-rows.test.ts` pins it.

## 2026-11-17: "Check on Amazon" is a row again, an ordinary last one

Owner: "even if there are no Amazon prices available, we should have an option to check on Amazon in our price rows." The unpriced
search row (the item's own page where an ASIN is known, else a search) returns whenever the region has an Amazon tag and the type is
one Amazon carries: an ordinary row at the END of the list, product page and quick view (before the A/B freeze of 20 Nov), labelled
"Check on Amazon", shared region tag, never pinned above the stores, never ranked, never the best price. A priced Amazon row still pins.
The below-table line of 2026-11-16 is removed (it would duplicate the row).
## 2026-11-16: urgent release of the "Also on Amazon" line

Amazon clicks were about 0 a day since 13 Nov. The owner approved one urgent production build (subject carries the urgent marker) so the unpriced matched line goes live now instead of waiting for the next daily release. One build, no previews.

## 2026-11-17: booster packs on the region home

Owner: the front page "feels like it's just the booster boxes". The shelf gains a "Booster packs" tab (Play, Collector, Set and Draft
packs taking turns, newest set first, up to eight, each at its own per-pack price; `homeRails().packs`), and the hero's sixth way in
is "Booster packs" (`/type/play-booster-packs`) in place of Bundles, which stays in the header menus. No pack count is claimed and no
box price is divided. The pack type pages, `/cheapest-packs` and their sitemap entries already existed; nothing about them changed.
Homepage only: the quick view, its paid rows and wording (A/B freeze 20 Nov to 3 Dec) are untouched.
## 2026-11-17: Quick view always shows the store's name; "Add to cart" is smaller (owner: "you can't even see the store name"; "add to cart seems too big")

From sm up the price row's badges wrap under the name instead of squeezing it (`.or-top` wraps, `.or-name` keeps 4.5rem), and the eBay row uses the same classes (it had its own copy, which let "eBay" and "TCGplayer" shrink to nothing beside the Ad / Best price / Marketplace badges). The cart button is 36px tall at 12px text with a thinner border (`.ce-cart-add.has-label`). Layout and sizing only: no wording, paid-row order or A/B arm changed.
## 2026-11-16: Seasons get an event layer (data-event), Black Friday week first (UI/UX squad)

Ported from TCG Prices (tcgcompare PR 34). `data-event="blackfriday"` (Black Friday minus 7 days to Cyber Monday, 20 to 30 Nov 2026)
stacks on the season; its only effect is the 3px top hairline turning one amber instead of cranberry and pine. No new colour, no
markup, no motion, no layout shift; `?event=blackfriday` previews, `?event=off` hides. Quick-view rows and wording are untouched.

## 2026-11-17: URL freeze, and two sides of the network, one footer link

Owner, from the Grok growth report (items 5 and 9): stop the sitewide cross-links between the sites, and freeze URLs.
The network now has two sides (`TCG_SIDE`, `sameSide`, `isTcgSide` in `src/lib/family-network.ts`, the same file in every repo): the
card-game and wargame sites on one, perfume, K-beauty, car parts, cameras, figures, sports cards and tech on the other. `clusterSisters`
and `footerSisters` return same-side sites only, so deal and pre-order tiles, the data jobs' copied feeds and the `/our-sites` (or
`/network`) list never cross. The footer keeps its single link to `/our-sites`; the "Every Compare Empire site" link to
compareempire.com is gone from the card sites. SportsCardCompare is on the other side from the card sites (its search results no
longer offer their searches). Where this repo had a repeated block of sister links (a blog "Also from us" aside, "Compare other TCGs"
on every card page, non-card sisters in `SITE.sisterSites`) it is removed. A contextual link from a guide to another game stays.
DexCompare's links read dexcompare.io (the old host is still accepted in a feed until Dex republishes). Not changed: price alerts,
`alert-feed.json`, the family feeds and the sister data reads: they are data, not links. Also a "URL freeze" rule in CLAUDE.md:
no mass path change without a redirect map, agents never flip hosts, no pop-unders or surprise navigation (this repo had none).

## 2026-11-17: Click log fields, "Prices checked", /methodology and the footer's not-affiliated line (Grok growth report items 1, 7, 8)

- **Click log (item 1).** Outbound clicks were already one event each (`OutboundLink`: Vercel `buy_click {retailer, placement, link_type}`, GA4 `affiliate_click` / `outbound_store_click`). Vercel Pro keeps few custom-event properties (DEPLOY.md: two, and the event already sends three), and it records the page path and the visitor's country on every event itself, so Vercel's event is NOT widened. GA4 (no such limit) now also gets `paid` (rel sponsored), `page`, `region` (the market in the path), `pos` (the row's place among its list's rows), `rank` (item-price rank among the list's priced rows, ties share) and `gap_pct` (item price above the cheapest, one decimal). `store` is the existing `retailer`. Read at click time from `data-cents` on a row (open, priced, in the region's own currency only, so a search row, a sold-out row and TCGplayer's US$ outside the US carry none): item price only, never converted, never postage. Nothing stored, fetched or sent to our own server; no database. `rowContext` in `OutboundLink.tsx`, `tests/click-context.test.ts`. The quick view's A/B events and rows are untouched (the quick view's links gain the same inert attributes and GA4 fields, nothing visible).
- **Prices checked (item 7).** The product page's price section opens with "Prices checked <time>" (newest listing read, `Ago` corrects it in the browser). Soft 200s: a product page with no stats row and no offers already 404s, one with fewer than three listings is already noindex (`productNoindex`), and hub pages with nothing to show already 404; nothing more was needed.
- **Methodology (item 8).** `/methodology` (static, in the footer and the sitemap): what we track and do not, how the table is ordered, how the site earns (links to /affiliate-disclosure), independence. No editor is named: none is public on this site (`OPERATOR` shows only when set). The footer says in plain words that the site is not affiliated with Wizards of the Coast, Hasbro or any store, before the Fan Content line.
- **Price alert (item 6)** was already an inline form on the product page (target price and email, opens in place under the best price, no pop-up); unchanged.
- **Paid alternative line (item 2)**: this site has no such second line (OP Compare does), so nothing changed here.

## 2026-11-17: TCGplayer data notice in the footer

Grok growth report (2026-11-17), item 8 ("plain not-affiliated footer lines"), and the image-licence report (`/mnt/project-files/seo/grok-2026-11-17/image-licence-report.md`, item 11): TCGplayer's API terms ask for the notice "This product uses TCGplayer data but is not endorsed or certified by TCGplayer.", and no footer carried it. It is now one plain line in the footer, beside the existing not-affiliated lines (which are unchanged). Nothing else changed: no price, link, order or cache rule.

## 2026-11-17: Bot clicks on TCGplayer (every TCGplayer link goes through /out/tcgplayer)

Owner (2026-11-17): Impact showed 700 to 800 TCGplayer clicks a day, largely bots. Vercel's browser-side `buy_click` events for 10 to 17 November counted about 1,150
TCGplayer clicks across all the TCG sites (about 165 a day; MTG Compare's own: 301 in the week). This site put the Impact URL straight in the page HTML, so a crawler that
follows links reached Impact as our click and we could neither see nor stop it. `tcgplayerAffiliateUrl()` now returns `/out/tcgplayer?u=<tcgplayer url>&sharedid=<sub id>`, and
`src/app/out/tcgplayer/route.ts` sends a person on to Impact and a bot (`lib/bot-click.ts`: bot User-Agent, no Accept-Language, no Sec-Fetch-Mode, or a Sec-Fetch-Site that is
not same-origin or same-site) to TCGplayer's own page, untagged, so Impact never counts it. https on tcgplayer.com only (no open redirect); `no-store`,
`X-Robots-Tag: noindex, nofollow`, disallowed in robots.txt; the anchors keep `rel="sponsored nofollow"`. A bot and a person read the same HTML. A bot that clicks a link in a
real browser on our page is same-origin and still passes; that needs a Vercel Firewall rate limit on `/out/*`.
## 2026-11-17: Quick view: price history at the very bottom, at most 10 rows (owner)

Owner, 2026-11-17: the price-history chart at the top of the quick view is "not even that valuable". It now sits at the very bottom of the panel, below the rows and the ad pair, and the quick view lists at most 10 rows (`maxRows`): the pinned eBay and TCGplayer rows first, then the cheapest others, with "N more listings on the full page" (the page and "See price history and details" still show everything). The Cheapest price box and the Add to cart buttons are unchanged. Paid rows, their order and wording are untouched in every A/B arm (Dex and MTG tests, 20 Nov to 3 Dec).

## 2026-11-17: AI assistants: ChatGPT's utm_source survives the page-view query strip

`VercelPageViews` dropped the whole query string, which also dropped `utm_source=chatgpt.com`, the one marker ChatGPT leaves (it sends no referrer). It now keeps `utm_source` only when it names an AI assistant (chatgpt, perplexity, claude, gemini, copilot); nothing a visitor typed is sent. Visits from answers show under Vercel → Analytics → UTM Parameters; no custom event, so no extra billing (`track` stays a no-op).
## 2026-11-17: Card prices: the most valuable cards of each set

**Owner:** with Dex and MTG Compare growing, bring back single-card prices, earning through TCGplayer and a "Check on eBay" row, with no
sealed eBay quota spent on them, and every card page found on Google by its name and number, as MTGStocks is. Evaluated first
(`/mnt/project-files/ops/singles-plan-2026-11-17.html` in the project files): yes, but capped, because this site's own singles
catalogue (99,079 products, ~42,000 sitemap URLs) had only its homepage indexed after a week (2026-10-19, above) and DexCompare's
June card pages collapsed the same way.

- **What gets a page:** the cards of the sets this site lists sealed product for, at TCGplayer's market price of US$5 or more
  (`MIN_VALUE_CENTS`), most valuable first. The list starts at 1,000 (`START_CARDS`), grows by at most 100 a day (`DAILY_GROWTH`)
  and stops at 5,000 (`CEILING`), all in `src/lib/cards.ts`. Stop widening (lower `CEILING` to the current size) if under 30% of
  card pages are indexed three weeks after launch, or if sealed Google clicks fall more than 15% week on week with no other cause.
- **One page per card, not per region:** `/card-prices/<set>/<card>` (slug = name + collector number, frozen once given), with the
  set's list at `/card-prices/<set>` and the hub at `/card-prices`. TCGplayer is a US marketplace and its price is one figure for
  everyone, so seven regional copies would be seven duplicates. The title carries the set and number ("Sheoldred, the Apocalypse
  (DMU #107) Price") so a search for a printing lands on it.
- **URLs never 404:** a card keeps its page once it has one; under the gate it stays, noindex and out of the sitemap. A card
  TCGplayer stops listing redirects (308) to its set's list; an unknown set is a 404.
- **The price is TCGplayer's market price only** (recent sales, per finish: normal, foil, etched), never a seller's ask, as the
  sister sites' 2026-11-03 rule. No store prices for singles.
- **Rows:** "Check on eBay" first (a tagged EPN search: no eBay API call, so no sealed quota spent), then TCGplayer through
  `/out/tcgplayer` (placements `card-ebay`, `card-tcgplayer`). The quick view is untouched (A/B test 20 Nov to 3 Dec); card tiles or
  ad banners there wait for the verdict.
- **Data:** `scripts/card-import.ts` (`card-prices.yml`, 19:17 UTC daily) reads TCGCSV's mirror of TCGplayer's public price files
  (category 1: the groups list, then products + prices per set, a quarter of a second apart, no key) and commits
  `data/cards/mtg-cards.json` to main with NO deploy marker: it rides the evening sealed import's release. No database, no eBay.
  A set that fails to read keeps yesterday's cards; a run that cannot read the groups keeps yesterday's file.
- **Pages** are force-dynamic and cached by the CDN for a day (`CDN_PAGES`), read no request data, and are listed in their own
  sitemap file, `/sitemap/8.xml` (`CARDS_SITEMAP_ID`), indexable cards only.
- **Current visitors** see a slim "New: Card prices" line (`NewCardsStrip`) on the landing page, under each region home's hero
  and on set pages, closed for good with its ×. Never a pop-up or overlay; hidden before paint once closed, so nothing shifts. Each
  set page also shows its five most valuable cards, linking to the list.
- **Not yet:** spare eBay calls on the top cards (this keyset's sealed pass comes first; revisit after 7 Dec), Pokémon cards on
  DexCompare (after its 25 Nov index check on dexcompare.io), price history for cards.

## 2026-11-17: the ASIN pass gets the UK, Canada and EU credentials

The Amazon audit found `status-uk.json` "InvalidAssociate" here while DexCompare, KaeYoung, Scent, Figure and Wargame read the UK as ok: the
import workflow passed only the AU and US credentials. It now passes the CA, UK and EU ones too (each from its own Associates account; a
region with no secret stays refused, as before). No secrets are handled here: they are set by the owner's PowerShell script.

## 2026-11-17: Card prices: every card (owner: "we want all the cards")

Supersedes the cap of the entry above (1,000 cards, +100 a day, ceiling 5,000). The owner wants every Magic card; the risk the cap
answered (Google rejecting a site of thin card pages, as it did MTG's old singles site and Dex's June card pages) is now handled by
what Google is shown, not by what exists.

- **Every card has a page.** `scripts/card-import.ts` reads every TCGplayer Magic group (art series, tokens, substitute cards and
  memorabilia skipped; tokens, emblems, art cards and checklists dropped inside a set) and writes `data/cards/`: `sets.json`,
  `sets/<set>.json` (one file per set, read only by that set's pages), `search.json` (the search index) and `top.json` (the hub's
  and the sealed set pages' top cards). One page per card, `/card-prices/<set>/<card>`, the set list `/card-prices/<set>`, the
  hub, and `/card-prices/search` (noindex). A card keeps its slug, its first day and its release by TCGplayer product id forever;
  the first run migrated the 1,000 cards live since 17 Nov under the same URLs. A card TCGplayer drops 308s to its set's list.
- **Google sees cards in a ramp, the 100-a-day idea kept as an indexing schedule.** A page is indexable (and in the sitemap) only
  once released (`ix`): 2,000 at the start, then `CARD_INDEX_GROWTH` (repository variable, default 500, `0` pauses) a day, most
  valuable first, only at US$1 or more (`MIN_INDEX_CENTS`); a released card that falls under US$1 loses its release. Unreleased
  cards are live pages with `noindex, follow`. Sitemaps: `/sitemap/8.xml` is the hub and every set with a released card;
  `/sitemap/9.xml` on hold released cards 10,000 a file (12 files, room for 120,000). A set with nothing released is noindex.
- **Search** (`searchCards`, pure, shared by the search page and `/api/cards/search`): a name (all words, any order), a set code
  ("FDN"), a collector number ("227", "#227", "227/281") or set-name words, in any order; exact names first, then value. The header
  search asks the API from three characters after 300 ms and shows up to four cards under the products; each distinct query is
  held six hours by the CDN, so keystrokes rarely reach a function. `Æ`/`Œ` fold to ae/oe in slugs and queries.
- **Size:** `data/cards/` is about 25 MB and is traced into every function (`data/cards/**/*.json`); a page reads only its own set
  file and memoises it.
- **Tripwires unchanged:** under 30% of released cards indexed three weeks in, set `CARD_INDEX_GROWTH=0`; MTG sealed Google clicks
  down 15% week on week with no other cause, noindex the cards.

## 2026-11-17: Fiverr first-time-shopper review of DexCompare, applied here (owner)

The owner bought a professional first-time-shopper QA review of DexCompare (the engine this site shares) and asked for every finding to
reach every site. Applied here, as on Dex (full reasoning in DexCompare's DECISIONS.md, same date):

- **An eBay ad is never "Best price".** `EBAY_CAN_BE_BEST = false` (`lib/ebay-offer-row.ts`): the table badge, the best-price card and the sticky bar
  name the cheapest store (or TCGplayer when cheaper); eBay stays at the top as a labelled ad with its real price. Reverses the 2026-10-11
  call that eBay's price counts as the cheapest when it is; set the constant true to roll back.
- **A total on every row that charges postage:** `ShipCell.total` ("≈ $X total" / "from $X total"), also under the quick view headline.
- **Cart hand-off:** the drawer opens with "You pay each store on its own site. We never take payment."; "Estimated total (before postage)".
  The label stays "Add to cart" (owner, 2026-11-14).
- **No banner pair above the sealed list's results** (`OWN` in `InlineAds.tsx`); the mini eBay strip drops listings under 75% of the stores'
  median; the eBay button is the ink `btn-ad`; the quick view sets the tab title and description while open; the Christmas line waits for the
  Black Friday strip to end; CSP (report-only) frame-src gained the Google ad-quality hosts.
- Quick view: these touch it before the 20 Nov A/B window opens; no arm logic changed.

## 2026-11-18: The return nudge, a targeted prompt for a visitor who has clicked a store (owner)

Earnings fell; the owner asked for targeted, subtle ads. About 70% of buy clicks go to stores that pay nothing. After a click on a STORE row, when the
visitor comes back to the tab (away 4 s or more, within 30 minutes), a small dismissible card ("Still comparing?", Ad) offers the page's own sponsored
eBay and TCGplayer links, copied unchanged. Once a session, 20 s or ✕ or Esc, never Amazon, no price or "best" claim, yields to the rating card. It
touches nothing in the quick view (the 20 Nov to 3 Dec A/B test is unaffected). **Measured:** half the visitors are the control arm (localStorage
`rn-arm`); `nudge_eligible` {arm} fires for both, `nudge_shown` and `nudge_click` {which} for "on" (the three names join the Vercel whitelist, one event
per eligible return at most), GA4's `affiliate_click` carries `nudge_arm`. Lift = paid clicks per eligible return, on against off. Rollback: remove
`<ReturnNudge />` from the root layout.

## 2026-11-18: cart checkout opens every store or none (owner)

Checkout (`openAll`, `src/lib/cart-checkout.ts`) opens one blank tab per store inside the click, and only when every one opens does it send each to its store's own tagged link. If the browser refuses any, it closes the ones that opened, visits nothing, and the drawer shows the allow-pop-ups steps and a "Try again" button. Before, the first store opened and the rest were refused, which left the visitor with one tab. Chrome 157 on dexcompare.io and on url-opener.com (the owner's model, which does the same close-and-ask) both give one tab until pop-ups are allowed for the site; with them allowed, all open. No browser API grants that permission from a click, so the steps stay.

## 2026-11-18 — Accounts on MTG Compare (one network account, ported from DexCompare)

Owner (18 Nov): accounts lived only on RiftCompare and OP Compare; expand them, team decides. RiftCompare is already the network's
account service (DexCompare signs in on its own pages through `/api/sister-premium/*`, 2026-11-10), so MTG Compare gets the same
client, not a new system: `/account` (emailed 20-minute link; a Google button appears once `NEXT_PUBLIC_MTG_GOOGLE_CLIENT_ID` holds
MTG Compare's own client), `/watches` (every price alert set with that email, on any device, with a stop button), `/premium`
(the same RiftCompare Premium: no banner ads, back-in-stock alerts, 200 alerts), a back-in-stock line on sold-out product pages,
and a quiet account icon in the header (sm and up) plus "Sign in / My watches" in the phone menu. No pop-up, no corner card:
DexCompare's PremiumCorner and PremiumSlides were not ported. The browser keeps one token (`mtg_premium_v1`); pages stay one CDN copy.
The old singles site's `/premium` and `/account` redirects to /about are lifted; anything deeper under them still 301s to the new page.
Sign-ups are counted on RiftCompare's admin Accounts › MTG Compare tab.

## 2026-11-18: Home pages rank items by demand (owner: "the most popular items should be on the homepage in that order")

The owner wants every site's home page to lead with the items most likely to earn a click, revenue and a purchase. Each home list
(shelf, grid, picks, deals, pre-orders, popular cards) is now ordered by `src/lib/home-rank.ts`, the same pure file in every repo:

- **Demand**, real numbers only: each item's product page views and buy clicks, last 28 days plus the last 7 again (recent counts
  twice), from Vercel Web Analytics through RiftCompare's public `/api/demand/<site>` (`src/lib/analytics/item-demand.ts` there; top
  100 product pages a window, `buy_product` events by product where a site sends them). A buy click weighs 20 views. Log scale, so
  one runaway item cannot take the list.
- **Value**, from the item's own facts: in stock and at how many stores, a paid row with a price, the price (commission is a share of
  it, on a soft curve), a release in the last 30/90 days or an open pre-order, a price under its usual.
- `score = value × (1 + log(1 + views + 20 × clicks))`.
- **Safe fallback:** under 30 views and clicks across a list, demand is ignored and value alone decides; equal scores keep the list's
  old order. `NEXT_PUBLIC_HOME_RANK=off` (Vercel variable) turns it off without a code change.
- **No feedback loop:** the 4th slot, and every 8th after, goes to the best-valued item with no demand yet, so a new item is seen
  before it can be clicked; the 7-day weight lets a leader fall when it stops being clicked.
- **Data path, no database:** the daily data job runs `scripts/pull-demand.sh <site> <file>`, which commits the demand file to
  `main` with no deploy marker (it rides the release). That file's git history is the log of what the ranking saw each day.
- Heroes stay words, search and ways in (owner, 2026-11-13): the ranking orders the lists, it adds no product to a hero.
- Measure: buy clicks per visitor sitewide and on home pages, the week before (11-18 Nov) against the two weeks after the release;
  a demand file under 30 views for a list means that list ran on the fallback and is read apart.

Here: the region home shelf (play and collector boxes, packs: the 150 in stock of each type ranked, eight shown), its deals and pre-orders, and the landing page's ten picks (feature floor first). MTG Compare sends no per-product click yet, so demand is product page views. `data/demand.json`, pulled by `sealed-import.yml`. The quick view is untouched (A/B tests 20 Nov to 3 Dec).

## 2026-11-18: The phone bottom nav, ported from TCG Prices (owner)

Owner tried TCG Prices' bottom bar on his phone ("looks good … a bit of lag"; the smoother version is in) and wants it on every site.
`components/BottomNav.tsx` is tcgcompare's controller unchanged (no position arithmetic, `transform` only, browser only, below 768px,
hidden while zoomed, typing, any dialog is open, an Add to cart button is under it, or the buy bar is SHOWN), with MTG Compare's own tabs:
Home, Deals, Sets, Cart (opens the drawer), Menu (the header's menu sheet). No Search tab: the sticky header already holds the search
box on every phone screen, so it would only repeat it; Sets is the next most used way in. Every tab links into the page's region, else
the visitor's pick (`mtg-region`), else the US.

- Mounted in the root layout, OUTSIDE the quick view, and hidden while its `aria-modal` dialog is open: the quick-view A/B test sees
  the same bar in every arm. `tests/bottom-nav.test.ts` pins both.
- MTG's product page always holds the buy bar's element (`data-buybar="hidden"` until it slides in), so the bar yields only to a shown
  one (`[data-buybar='shown']`); a product page gets the bar at its top, which the dock never had.
- The ad dock yields to `html[data-bottomnav]`, one bar at a time. `BOTTOM_NAV` in `lib/site.ts` is the switch: shipped "optin"
  (`?bn=1`), flipped to "on" after the phone harness (five phone sizes, the quick view, two product pages swept top to bottom: never
  over an Add to cart button or the buy bar, CLS 0); "off" is the rollback.
- Found on the way, not changed: the closed cart drawer is always in the DOM with `aria-modal="true"` (inert and aria-hidden), and the
  ad dock's "a dialog is open" check matches it, so the dock may never show here. Same as on TCG Prices; reported to the ads thread.

## 2026-11-18: llms.txt points AI agents at the free price file

`/prices.json` already existed, but nothing an agent reads said so. `llms.txt` now has a "Free price data and citing" block: the file, that it is free and open to every origin, the date to quote and a suggested credit line. No new route, no spend.
## 2026-11-18: Creator and social campaigns on page views (owner)

Custom events stay off (cost), so MTG Compare cannot send a buy click per campaign. Page views now also keep `utm_source`,
`utm_medium` and `utm_campaign` when the medium is `creator` or `social` (a safe tag: letters, digits, dash, underscore, dot,
40 characters), so Vercel counts the VISITORS each creator or post brought; the AI-assistant `utm_source` rule is unchanged and
nothing a visitor typed is sent. Convention for every link we hand out:
`?utm_source=<platform>&utm_medium=creator|social&utm_campaign=<handle or post>`.

## 2026-11-18: Feedback asks: "Was this page useful?" in the footer, a /feedback page, counted by the daily triage (owner)

The owner: "We need more feedback so can we find a way to get more". One RiftCompare visitor's note (sort the movers by %
gain or loss) became a feature the same day, but across the network three weeks brought about 58 star ratings and fewer than
ten written notes. Rift's own record also holds "too many popups asking for my opinion", so every ask here is inline.

- `components/FeedbackAsk.tsx` (the same file on every site): one line at the top of the footer, "Was this page useful?
  Yes / No". The tap is sent at once (a vote alone counts); only then does an optional "What would make it better?" box
  open. Never a pop-up, nothing fixed or floating, hidden for the rest of the visit on a page already answered, and in no
  quick view (the Dex / MTG quick-view A/B, 20 Nov to 3 Dec, is untouched).
- `/feedback`: the full form (an idea, something wrong, something missing) and "You asked, we built it", the changes
  visitors' notes have led to; add a line there when a note leads to a change. noindex, linked from the footer and the menu.
- Both post to `/api/report` as kind `feedback` (`lib/reports-github.ts`). A note is an inbox file like any report; a bare
  vote is `votes/<site>/<day>/<time>-up|down-<rand>.json`, counted from its file name by RiftCompare's daily *Reports
  triage*, which now prints a 7-day feedback table per site and flags every note for a look. No email address is asked
  for or kept: the thanks shows the site's inbox for anyone who wants a reply.
## 2026-11-18: an eBay row may be "Best price" again (owner)

The owner withdrew the 2026-11-17 rule that an eBay ad is never "Best price": the cheapest row is the cheapest row, and it carries the
badge, whichever it is. `EBAY_CAN_BE_BEST = true` (`lib/ebay-offer-row.ts`): a NEW eBay listing in the stores' currency, strictly cheaper than
every in-stock store and not more than 25% under their median (`ebayMayBeBest`), takes the table badge, the best-price card and the sticky
bar; otherwise a store (or TCGplayer when cheaper) keeps it. The row order does not change: eBay, TCGplayer, Amazon, then the stores.
## 2026-11-18: TCGplayer's barcode on the sealed product page

Owner: "any unique identifiers … we should capture … as these are easy SEO results". Search Console (RiftCompare maintenance task
`gsc-identifiers`, 90 days to 15 Nov): KaeYoung's every Google click came from a typed barcode; ScentCompare and Gundam kits show the same.
Ported from DexCompare the same day: `scripts/tcg-barcodes.ts` (a never-failing step before the sealed import; TCGCSV category 1, cards
with a Number skipped) writes `data/barcodes/tcgplayer.json` (TCGplayer id -> barcode; check digit verified, a code on two or more
products dropped, `src/lib/gtin.ts`); the product page joins it through its TCGplayer offer's URL (`src/lib/barcodes.ts`) and shows
"Barcode (UPC/EAN)" and "TCGplayer ID" in Quick facts, and the Product markup carries `gtin12`/`gtin13` and `productID`. Never from a
store title. The quick view (A/B window 20 Nov to 3 Dec) is unchanged.

## 2026-11-18: Share for a deal, and guides get the share button (owner)

Owner: sharing should be easy and rewarded ("if you share … you can open Deal Finder … gives incentive"). Pages that pass `deal`
to `ShareButton` (product, set and guide pages) put half of browsers (`share_arm` in localStorage, `pickShareArm`) on
"Share · get a deal": after a share completes, a small card under the button (the visitor's own tap, ✕ to close) points to the
region's `/deals`. The other half is the control. The quick view never passes `deal`, so it is unchanged during its A/B test
(20 Nov to 3 Dec; `tests/share-link.test.ts`). Nothing is gated. Events `share { kind, arm }` (two properties, Vercel's limit)
and `share_unlock { kind }`. Read the share rate per arm after two weeks; keep the offer only if it raises sharing.

## 2026-11-18: the Amazon button is amber, and the quick view's "See full page" is a real button (owner)

Owner: the Amazon row's button was the neutral `.btn-soft`, so it read like any store's. It is now `.btn-amazon` (globals.css):
#F5A524 with #111 ink, #DC8A0B on hover, a #B7791F hairline, the same in both themes. It is the button of the priced "View deal"
row and the unpriced "Check Amazon" row (`OfferRows`), and of the sold-out Amazon card's button (`Amazon.tsx`). `rel`, the tracking, the "Ad"/"Paid link" labels, the row order, prices and the Cheapest logic are untouched, and
so are the TCGplayer button and the phone eBay + TCGplayer pair's position (the quick view's A/B test starts 20 Nov). The quick view's
pinned footer link, already visible without scrolling, becomes a 44px bold bordered button reading "See full page: price history
and details" (`data-see-full-page`); it was a 42px ghost button. `tests/amazon-button.test.ts` pins both.

## 2026-11-18: the amber of the Amazon button is not Amazon's own orange

The first cut used #FFA41C, which is Amazon's brand orange. Amazon's Associates agreement bars styling that could pass for Amazon, so the button is now a distinct, calmer amber (#F5A524, hover #DC8A0B, border #B7791F, dark text #111): still clearly different from the site's normal buy button, not Amazon's colour.

## 2026-11-18: a return-visit beacon, so retention has a number on every site

Owner, 2026-11-18: "we want new visitors and we want to retain those visitors". Vercel Web Analytics cannot tell a returning
visitor from a new one, and Google Analytics runs on only four of the sites (consent-gated on two). `lib/return-visit.ts` keeps one
small localStorage record (`rv`: first day, last day, visit days) and `components/ReturnBeacon.tsx` (root layout, renders nothing)
sends ONE `return_visit` event the first time a returning visitor opens the site on a new day. New visitors send nothing (Vercel's
visitor count is the denominator), so it costs at most one event per returning visitor per day. Properties are buckets only:
`k` = "<days since last visit>:<page type>", `age` = days since first visit, `n` = visit days, `via` (direct, search, email, share,
social, ai, other), plus the arm of each live 50/50 test (`rn`, `ln`, `share`, `cart`, `watch`) so every retention lever reads its
return rate on against off. No id, date or URL leaves the browser. The identical file is in every Compare repo; read weekly by the
retention thread. Rollback: remove `<ReturnBeacon />` from the layout.

## 2026-11-18: the return-visit beacon also carries the `since` arm

Retention lever 2 ("Since your last visit", on the sister sites) is a 50/50 test under `since-arm`; `ARM_KEYS` in
`lib/return-visit.ts` gains `since` so the file stays the same in every repo. Nothing changes on this site until it runs the lever.

## Collection value card (owner, 2026-11-18: "we need more shareable artefacts")

My collection's "Share my collection" now draws a 1200×630 picture of the visitor's own totals (value, change since
added, item count, three most valuable items, "Track yours free at <host>") in the browser with a canvas
(`components/vault/collection-card.ts`, ported from TCG Prices) and hands it to the share sheet as a file; where files
can't be shared it saves the PNG and copies the link. No server, no function, no Vercel image cost, nothing sent to us.
Link: `/?utm_source=share&utm_medium=collection&utm_campaign=collection-card`. Counted in Vercel as `share {kind:
collection, how: image|text|saved|copy}`, only once it really went out.

## Deals page: a share button and its own share image per region (owner, 2026-11-18: "we need more shareable artefacts")

`/[region]/deals` gets a share button (kind and medium `deals`, `utm_source=share&utm_medium=deals`) and
`[region]/deals/opengraph-image.tsx`: "Today's deals in <region>, up to N% under" with the page's own count
(`dealsBySection`, `dealPct`, `dealsCopy.summary`), drawn by `lib/og-card.tsx` (text and the logo, no product photo).
It lists no params, so nothing reads data at build: each region's image is drawn on its first request after a release
and kept until the next. `pageMeta` names it as the page's image. The quick view is untouched.

## 2026-11-18: "Which tool should we build here next?" (a demand test, not a promise)

Owner, 18 Nov: the other sites lack RiftCompare's tools, which is why Premium only sells there (Rift's sign-ups: 24 from the tool
gate, 11 tool previews, 9 deck tools, 6 set tracker of 152 in 30 days). Before copying any tool here, `components/ToolInterest.tsx`
asks product-page readers, low on the page and never beside a price, a buy button or in the quick view, which of four RiftCompare
tools they want: Best Basket, box value, pull tracker, set tracker. One tap per visitor (localStorage) sends `tool_interest
{tool, page}`; nothing else is stored or sent. Read about 4 Dec: a tool is built on a site only if it clears 5 taps per 1,000
product viewers. Remove the box once read. Plan: /mnt/project-files/strategy/premium-network-plan-2026-11-18.html (project files).

## The weekly Hot 100 at /<region>/hot-100 — 2026-11-18

**What.** A new page per region, `/<region>/hot-100`, and its share card `/og/hot-100/<region>`: every product whose cheapest
in-stock price rose over the last seven days (up to the newest import), biggest rise first, up to 100, each with its place on
the chart seven days earlier (▲ / ▼ / New). Pure, from `data/public/price-history.json` alone (`lib/hot100.ts`). The weekly
chart's rules with a lower floor: two or more stores in stock on both days, a rise of 1% or more and under 50% (a bigger jump is a
misfiled listing). A short week is the Hot 37, never padded (RiftCompare's Hot 40 rule). Noindex under five rows.

**Why.** Owner, 2026-11-18: RiftCompare's Hot chart works on Reddit as a plain link and title; every site gets one stable URL to post
once a week (tagged `utm_source=reddit&utm_medium=social&utm_campaign=hot100-<site>-<date>`). The dated Sunday chart stays where it
exists. Shipped with `[deploy] [urgent]` on the owner's ask for today's links. `tests/hot100.test.ts`.
## 2026-11-18: The weekly price-drops box on guides, pre-order and release pages (retention)

GA4, last 28 days: people who land on a guide, a pre-order page or the release calendar are among our largest groups of new
visitors and the least likely to come back (MTG: pre-orders 7% returning, guides 4–10%; Dex: guides 5%, releases 6%, against
15–34% for home and sealed). Those pages offered no way to hear from us again. They now carry the same one-field weekly
price-drops box as home, deals and set pages (`WeeklyDropsBox`, placements `guide`, `preorder`, `releases`): inline, below the
content, server-rendered at a fixed height, never a pop-up. Read: `weekly_signup` by placement, and the census's sister
weekly-digest counts, at the retention read of 2 Dec.

## 2026-11-18: Back-in-stock emails are free for everyone (owner)

The owner chose "Free for everyone" for back-in-stock alerts (retention thread, 18 Nov): accounts with an alert came back after
week one at 56% against 25% without one, and accounts given Premium came back at only 23%. `RestockAlert` on a sold-out product
now shows visitors one email field (kind `restock` on RiftCompare's alert service, the same double opt-in as a price alert);
members keep the one-tap button and their watch list. The Premium pages no longer sell it as a perk: Premium is no banner ads,
200 alerts, the watch list and a year of collection history. Event `restock_signup` {member, region}; read on 2 Dec. Needs the
service side (TCGEmpire, same day) live first, or a visitor's form answers "for Premium members".

## 2026-11-18: Card prices: new sets' cards go to Google first (owner: new sets' singles live first)

The owner's revenue plan of 18 Nov gives this work one job: a new Magic set's singles are live, priced and findable first. Every card
of a new or upcoming set at US$1+ is released to Google the day TCGplayer prices it, outside the daily step (`freshSets`,
`releaseForIndexing`'s third argument): a sealed set (lib/sets.ts) released in the last 60 days or not yet out, plus the groups named
after it (Commander, Promo Pack, Stardates). Promo groups TCGplayer re-dates have no sealed set and never count. The first run adds
about 970 cards (Star Trek, Reality Fracture and their Commander groups; Nauctis and Marvel: Darkhold Destiny as they are spoiled).
The `/card-prices` hub leads with "New and upcoming sets". `CARD_INDEX_GROWTH=0` still pauses only the back catalogue.

## 2026-11-18: A plain best price on a plain store (owner)

**Decision (owner, Bill).** When the row that carries "Best price" is a plain store (no affiliate link; not eBay, TCGplayer, Amazon or a partner row), it is no longer the marked row: no raised ground and green edge (`.or-hl`), no green badge. It gets a small neutral "Best price" chip (`.or-tag`: hairline border, muted text, no fill) with its price fully visible, and, only where the list has an eBay row and/or a TCGplayer row, a small "i" with the words "Prices and stock change: also check eBay and TCGplayer" (only the rows that exist are named; a tap shows the line under the row on a phone). When the best price IS one of our paid rows, it keeps the full existing treatment. Applies to the price table (`StoreRow`, `lib/best-tag.ts`) on the product page and in the quick view (the same `OfferRowsWithEbay`). Sort order, the red button, `rel="sponsored"`, tracking, labels, JSON-LD, feeds and alerts are untouched. The quick view's "Cheapest price" box and the best-price card were already neutral and are unchanged.

**Why.** The loud green on a store that pays us nothing pulled clicks away from our paid eBay and TCGplayer rows. We do not claim eBay is cheaper: the hint says only that prices and stock change.

**Measure.** Paid clicks per 100 buy clicks (eBay + TCGplayer + Amazon + affiliate rows against all outbound clicks, by `placement`) for the week before and after the release. `tests/best-tag.test.ts` pins it.

## 2026-11-18: other-language store words no longer split one product into two pages

**What.** `identify()` drops words that say a title is a pre-order or English in another language, or a catalogue label, before the
signature: "Vorbestellung" (German pre-order), "PREVENTA"/"RESERVA" (Spanish), "PREORDINE" (Italian), "Englisch", "Inglés",
"CCG", German "ab <date>", "Der"/"El" before The Hobbit, "Einsteigerbox", and a store SKU written into the title ("MTG-FND-STC",
"MTG-StarTrek-BNDL"). "Terrors of the Abys" (Miniature Market) reads as the Abyss deck. A trailing "ITA"/"GER"/"SPA" is the
foreign print, like "- DE". "Display (3 Boxes)" or "(4 Bundles)" is a store's lot, except after "Case", where it says what a case
holds.

**Why.** Job B audit (wrong prices) of the Nauctis pre-orders: one EU store's "Vorbestellung: …" titles and one US store's "Magic
the Gathering CCG …" titles each made their own one-store page of every Nauctis Commander deck and bundle, so the real page missed a
store and a search showed two pages. Across offers.json the change moves 188 titles: 154 join the product page they belong to (EU
bundles and beginner boxes titled "Englisch"/"Inglés" were a separate "special bundle" page per set), 14 Italian prints and 18
titles that name no product once the language word is gone ("Scene Box - Inglés") are refused, one 3-box display is refused, one
new key ("Learn to Play Beginner Box Single Pack"). No two different products merged in the before/after review. The orphaned
one-store pages lose their offers at the next import and 301 to their type page (`culled.json`), so no URL 404s.

**Measure.** Products with store offers in `nau`, `mdd`, `trk` and EU bundle pages after the next import; buy clicks on the merged
pages week on week. `tests/sealed-title.test.ts`.

## 2026-11-18 — The bottom nav is a floating pill, and closing the cart gives it back

Owner, 2026-11-18: "after you open the cart and then you close it, the little bottom navigation disappears", and the nav should be
"the little football field kind of shape … floating above the bottom a little bit" (Catchback's), with the eBay / TCGplayer ad dock
sitting on top of it.

- **The bug.** A header that mounts the cart button twice (desktop and phone copies) mounted two `CartDrawer`s. Only one draws, but both
  ran the scroll-lock effect: the second saved the first's `overflow: hidden` as "previous" and put it back on close, so the page stayed
  locked and `BottomNav` (and the ad dock) read it as an open dialog forever. Now only the drawer that draws locks scroll or checks
  live prices (`mounted` in both effects). Sites with one header button never hit it, but carry the same guard.
- **The pill.** Geometry only, colours stay the site's own: 12px from each side (at most 460px wide), rounded ends, a soft shadow, and
  `bottom: var(--bn-gap)` where `--bn-gap` is `max(8px, safe-area − 14px)`, so it floats above the home indicator without the old full
  safe-area band. `--bn-h` (54px) and `--bn-space` (height + gap) are on `:root`; the stacked ad dock, nudges and toasts sit
  `var(--bn-space)` + a small gap up, and the body's bottom padding follows it. Hidden, it slides fully off-screen (transform only, CLS 0).
- **Measured** (local build, dock stacked): Pixel 7 412×915 nav + dock take 129px (14.1%); iPhone 15 393×852 with a 34px safe area
  143px (16.8%); iPhone SE 375×667 129px (19.3%); the old flush bar took about the same plus the full safe area.

## Ads below content, cross-site block off, shorter footer, who runs it (2026-11-19)

Owner, 2026-11-19 (core-update quality pass): "all the ads that can negatively impact our indexing let's remove and have
more strategically placed ads". The banner pair no longer opens any page: the `[region]` layout draws `LayoutInlineAds`
after the page, the region home under the in-stock shelf, product and set pages last, the landing page after the region's
ten (it sat under the hero from 2026-11-17). `FamilyCluster` is off (`CROSS_SITE_BLOCKS`); the one family link is the
footer's `/our-sites`. The footer's MTG Compare column is 9 links (was 15), Explore 8 (was 17, seasonal pages included)
and Guides the region's newest six. The about page says who runs it (Bill and George), how AI tools are used, and what
the group costs (about A$790 a month, our books, 30 days to 15 Nov 2026). Kept: the phone dock (after a scroll,
dismissible).


## 2026-11-19: The phone ad dock sits above the bottom nav instead of yielding to it (owner)

The owner, 2026-11-19: the eBay/TCGplayer strip right above the phone bottom nav, "I want it for all the sites, so people have like an
ad on their phone right there." Since the bottom nav arrived (18 Nov) the dock hid whenever the nav showed. It now stays up, stacked
just above the nav (`data-dock-stack`, the same geometry as the other sites: `translate` by `--bn-space`). Its own rules are unchanged:
after a scroll, never beside the product page's buy bar, labelled "Ad", ✕ for the visit, never Amazon, never for ad-free members.

## 2026-11-19 — Collector side: cards in My collection, rising and falling cards, a collector-first Premium page, Collection in the phone bar

Owner, 2026-11-19: now that the site has single cards, make it feel like a collector app (Collectr's kind, as a web app): the collection
done right, rising cards, Premium "very easy to get" with a trial and a page as attractive as RiftCompare's, freemium, never paywall the
cheapest price. And: "replace the menu with My Collection" on the bottom nav.

- **Cards in My collection.** Every card page has "I own this" below the buy rows (never above a price), with a finish picker (only
  finishes with a TCGplayer price). A card is a vault item `card:<tcgplayer id>:<finish>` with its set slug, valued in US$ at that
  finish's TCGplayer market price. /collection asks `/api/cards/prices/<set>` once per set it holds (the committed set file, CDN six
  hours); still no account, no database, nothing sent about the visitor. No eBay call anywhere (owner, 19 Nov: the eBay quota is for the
  most-demanded sealed products).
- **Members' collection history and CSV** (Dex's code, ported): the /premium page promised "a year of collection history" since 10 Nov
  and MTG's /collection didn't keep it. `recordDay` keeps `MEMBER_HISTORY_DAYS` for a member, with a chart and a spreadsheet export.
- **Rising and falling cards** (`/card-prices/movers`, new URL, no existing one moved). The import keeps one snapshot a day of every card
  worth US$1+ in `data/card-history/<day>.json` (~1.2 MB; OUTSIDE `data/cards` so no function bundles it; last 8 days kept, git keeps
  the rest) and writes `data/cards/movers.json`: one day and seven, finish by finish (a foil price appearing is not a rise), both prices
  US$2+. Free for everyone: it is public data, so gating it would be theatre. Noindex until both seven-day lists hold 20 cards.
- **Premium page**: collector-first, with only what ships (collection history and export, 200 alerts, watch list, no banners, one
  account), a Free and Premium table that shows every price, the collection and rising cards as free, and the trial up front.
- **Bottom nav**: Collection replaces Menu; the header keeps its menu button on phones, so nothing is lost.

**Measure (read 9 Dec):** `vault_add` on card pages per 1,000 card viewers, `premium_view` → `premium_trial_click` → `premium_checkout_open`.

## 2026-11-19: Search-engine-first audit after the November 2026 core update

Google's core-update guidance asks whether a page exists mainly to help people or mainly to catch a search, and names
content "spread across a large network of sites" and re-dating pages to look fresh as warning signs. What changed here:

- **Seasonal sale pages.** The same template put Boxing Day, January sales and Lunar New Year (and Valentine's Day where
  a site has it) pages on every Compare site, indexed all year, each listing the same deals as the Black Friday page.
  `saleIndexable` in `lib/sale-seasons.ts`: Lunar New Year and Valentine's Day pages are never indexed, Boxing Day and
  January sales only from three weeks before the homepage links them until a week after they end; out of season they are
  noindex, follow and out of the sitemap (`withoutOffSeasonSales`). The URLs stay live all year (URL freeze).

Black Friday and Cyber Monday pages are unchanged (in season). Judge the effect on 1 to 8 Dec against 3 to 9 Nov.

## 2026-11-19 — My collection needs an account; Sign in and Premium always visible

Owner, 19 Nov: "you can only use my collection if you are signed in and the login/signup button should be visible for all
sites", "premium should also be visible". `/collection` shows a sign-in card (benefits, then `/account?next=/collection`)
until this browser holds a RiftCompare account token; "I own this" / "Add to collection" send a signed-out visitor to sign in
first. The header carries the account link at every width ("Sign in" in words from 400px, the icon alone below so search keeps
its room) and a gold "Premium" pill from md for non-members; the phone menu opens with "Sign in / Sign up" and "Premium · 14
days free". `/account` signed in is an account hub (collection, alerts, movers, Premium trial, sign out). The check is
browser-only, so every page keeps one CDN copy; the collection itself still lives in the browser (`ce_vault_v1`).

## 2026-11-19 — Continue with Google and Discord on /account

Owner, 19 Nov: Google and Discord sign-in on all our sites, accounts for retention. `/account` has "Continue with Google" and
"Continue with Discord" (`OAuthButtons.tsx`): plain links to RiftCompare's `/api/sister-premium/oauth/<provider>`, which runs the
provider's sign-in through RiftCompare's existing apps and comes back to `/account/verify#c=<code>&n=<path>`, the emailed link's own
door. One account across our card sites, linked by the verified address. A site with its own Google client keeps Google's in-page
button instead. `/account/verify` now lands on the page the visitor was headed to (or the account hub), and a failed round trip
shows its reason on `/account`.

## 2026-11-19: Collection check-up test

The owner's AI subscription idea is aimed at collectors (decision card, 19 Nov): a weekly "Collection Advisor" note on a
member's own collection. Before anything is built, a two-week hand-written test runs on RiftCompare, MTG Compare, OP
Compare and DexCompare. Here, `/collection` shows a "Free collection check-up" form (`components/vault/CheckupOffer.tsx`)
once a visitor has 10+ items: their email, an optional question and a "save me the founder price (US$5.99 instead of
US$7.99), no charge" tick. It posts the list (name, quantity, market, today's value, value when added) to
`https://riftcompare.com/api/checkup`, which keeps the request privately and tells the team (RiftCompare's DECISIONS.md,
same date). This site stores nothing and calls no AI. Read 3 Dec 2026: go if 60+ requests across the sites and 25+
founder ticks; stop under 20.

## 2026-11-19: eBay's button is eBay blue again

Owner (2026-11-19): "our eBay clicks have still stagnated. We're nowhere near our all-time high … I really need to increase it."
Vercel buy clicks: eBay about 240 a day across the network before 12 Nov, about 170 since; 5-11 Nov vs 12-18 Nov DexCompare 706 to
489, RiftCompare 298 to 165, OP Compare 153 to 61. The fall starts on 12 Nov, when the calm palette made eBay's button ink;
TCGplayer, which kept its own blue button, rose (DexCompare 545 to 779, MTG Compare 160 to 363). So eBay's buttons wear eBay's own
blue again (#3665f3, white ink, fixed in both themes) on every site; nothing else about the rows changes (no outline, tint, order or
label), and the cheapest row keeps its mark. RiftCompare and OP Compare had started a 50/50 the same morning; it ended for
everyone. Read: eBay buy clicks per 100 visitors, the week after release vs 12-18 Nov.

## 2026-11-19: TCGplayer's market price on the price history chart, OP Compare's look (owner)

Owner: "I really really like opcompare's price history where you have the tcgplayer market price as well as the cheapest
price locally. Can we pls copy it across all our tcg websites?" The product page's chart (`PriceHistoryTwoLine.tsx`) now draws
the cheapest in-stock listing in the region (solid red, the existing daily history) against TCGplayer's market price (dashed
gold), with Now / Low / High / change, 7D / 30D / 90D / All tabs and a tooltip reading both lines. Either line draws alone
once it has MIN_DAYS of snapshots.

The TCGplayer line is new data, from the TCGplayer read the import already makes (no extra request): the importer writes
today's `marketPrice` per TCGplayer product id with the day's exchange rates to `data/public/tcg-market.json`, and the export
folds it into `data/public/tcg-history.json` (same change-point format and fold as `price-history.json`, one "US" series per
product slug, US cents). A product is joined to TCGplayer only by the id in its own TCGplayer offer's URL, never by title; a
market file over three days old is not folded in. It starts empty and fills from the next import.

**The one conversion.** Prices are never converted for display, except this line: outside the US it is TCGplayer's US price
at the file's rate, labelled "TCGplayer market (converted)" and said so under the chart. It is never a price row, a best
price, a deal, a sort, an alert, the feed or structured data (`lib/tcg-market.ts`, `tests/tcg-market.test.ts`).

**The quick view keeps its old chart until 3 Dec 2026**, when the quick view A/B test ends: nothing changes there during
it. The quick view route already sends `tcgHistory`, so the switch then is the component alone.

## One-tap price and restock alerts for anyone signed in (2026-11-19)

Boardroom, 2026-11-19: a one-tap restock and price-drop alert on sealed product pages, MTG Compare first, free for all (alerts stay
free). Signed in with any account (free or Premium), the product page's and quick view's alert button is "Alert me under <10% below
today's lowest in-stock price>": one tap saves it through the account's token (no email field; no confirmation when the account's
address is verified), with "Pick my price" beside it (`components/premium/PriceAlert.tsx`, `setPriceWatch`). The back-in-stock button
is one tap for free accounts too, not only members. Signed out, both are the ordinary forms, unchanged. Nothing saves or opens by
itself. The shared service already accepted a free account's token for price and restock alerts; Premium only raises the limit
from 25 to 200.

## 2026-11-19: Sign in is a filled button at every width, and the sign-in flow never names another site

Owner, 2026-11-19: "there should be a login or sign up button, very visible for new … or non-logged in users … I don't want them to
redirect. I don't want the [RiftCompare] logo to appear on any of the site signups."

- Signed out, the header's account link is a filled button in the site's own colour reading "Sign in" from 340px wide (the icon alone
  below that). Every header was measured at 360, 390, 430, 768, 1024, 1280, 1440 and 1536px: the button is on screen with no
  sideways scroll at each. Where the row was full, other items stepped aside (the Premium pill, a sections row or a sponsored link
  move to a wider breakpoint; the menu carries them), never Sign in.
- Copy on the sign-in, account, Premium, watches, alert and privacy pages says "our shared alert service" and "all our price
  comparison sites", never the name of the site that runs the shared account service.
- `next.config.js` rewrites `/account-service/alerts/(confirm|manage|unsubscribe)` and `/account-service/oauth/(google|discord)[/callback]`
  to the shared service, so alert emails and (once the owner registers the redirect addresses) Google and Discord sign-in keep the
  visitor on this site's own address. A rewrite is not a redirect: the address bar never changes.
## 2026-11-19 — eBay stand-out row, 50/50

The owner, the same evening eBay's blue came back: the colour change moved eBay clicks, so "we can do something even more than just a
color change … make it stand out even more". Every visitor keeps eBay's blue button; a new 50/50 (localStorage `ebay-pop`, arm on
`<html data-ebaypop>`, `ebay_pop` on buy_click) gives arm "pop" a bolder, larger eBay button with a soft blue halo and tints the list
row that holds an eBay button eBay blue with a blue edge. Shape and colour only: no new words, no new claim (eBay is called the cheapest
only when it is), no position change, no extra eBay API call, white on #0064d2 passes contrast. Run on Rift, Dex, MTG and OP. Read
3 Dec: eBay buy clicks per arm, total buy clicks per arm as the check; keep the winner and roll it out to the other card sites.

## 2026-11-19 — A tag lint that stops the build

From the 19 Nov boardroom review, on the four money sites: paid rows always there, and never untagged. The product page's
Marketplaces panel already draws eBay and TCGplayer in every region (a listing or price when there is one, else each one's tagged
search; TCGplayer steps aside only in the US when it is already the best-price button above). New: `scripts/tag-lint.ts` runs first in
`npm run build` (`src/lib/tag-lint.ts`, `tests/tag-lint.test.ts`). Every eBay builder in every region and placement must carry campaign
5339155912 and a customid, every TCGplayer link must go through Impact (/out/tcgplayer), an eBay listing without our campaign must be
refused by `listingHref`, and no component may hard-code a bare eBay or TCGplayer href. A failure stops the release: a paid link going
out untagged costs more than a late one.

## 2026-11-19: [urgent] needs eight hours too: a network ceiling of 57 builds a day

[urgent] in a commit subject used to skip the 12-hour gap altogether. On 17 and 18 Nov the network built production 94
and 137 times a day, almost all of them [urgent] (about eight builds per site per day), and Vercel reached $10.27 a day
against the $6 cap: every build rewrites the ISR cache and burns build CPU. `scripts/vercel-ignore-build.sh` now builds an
[urgent] commit only when production last built at least `URGENT_MIN_GAP_HOURS` (8) ago; a plain [deploy] still waits 12.
So one site builds at most three times a day, and the 19 production projects at most 57 a day (normally about 25).
Batch urgent changes into one release instead of one per merge. Pinned by `tests/deploy-gap.test.ts`. The same change
went to every Compare site's gate.

## Amazon API allowance: mostly ScentCompare, card sites at zero (owner, 2026-11-19)

Amazon's Creators API limit is per Associates account (one a country), shared by every site on it: 1 call a second and
8,640 a day for the first 30 days (the US until about 8 Dec 2026), then 1 a day per US$0.05 of shipped revenue the API
referred in 30 days. The owner: "be very frugal", no Amazon calls for card sites ("people aren't buying on Amazon"), and
half or more for ScentCompare, the best performer. Each site's daily calls (environment variables can only lower them):

| Site | searchItems a day (US / other) | getItems at build (US / other) |
|---|---|---|
| ScentCompare | 2,000 / 600 | 200 / 100 |
| KaeYoung | 600 / 300 | 100 / 60 |
| DexCompare | 300 | 30 |
| MTG Compare, WargameCompare | 100 | 20 |
| Compare Empire | 100 | 30 |
| CamCompare | 150 (AU only) | about 30 (AU only) |
| Rift, OP, YGO, Lorcana, Cyberpunk, Gundam (and kits), Bandai, SportsCardCompare, TCG Prices, Figure, Motor | 0 | 0 |

US total at most about 3,600 calls a day (ScentCompare about 61%, ScentCompare and KaeYoung together about 81%), against
8,640 until about 8 Dec 2026 and a revenue-based limit after it (1 a day per US$0.05 of API-referred shipped revenue).

Here the defaults are lowered to this table's numbers. Amazon clicks here were real before 13 Nov, so a small share stays.

## Commander deck twins: colours, "New Arrival", misspellings, Nauctis "Collector Edition" (2026-11-19)

A sweep of every Commander deck page with one or two offers found 26 store listings each holding a second, one-store page of
a deck other stores already list: Grand J Games writes each Star Trek deck's colour identity ("(Federation Fleet
Blue-Red-White)"), Miniature Market appends "(New Arrival)", sagaconcepts "(Single Pack)", and stores misspell "Kilngon",
"We Are The Borgs", "Terror Of The Abyss" and "The Ruinous Power". For Commander decks `signatureTokens` now drops a
hyphenated run of two or more colour words (never one: a deck may be named for a colour), those two notes, and folds the four
misspellings. Lazarus Games calls Nauctis's foil decks "Collector Edition"; Wizards and TCGplayer call them "Premium Edition"
(Lazarus's US$159.95-189.95 sits beside TCGplayer's US$189.85-219.77), so for Nauctis only "Collector Edition" reads as
Premium. Sets before Nauctis keep the "collector" marker for their Collector's Editions, so no other page moves. Measured on
the 19 Nov export: 26 offers rekey, every one onto an existing page of the same deck and edition; nothing else changes. The
one-store pages they leave are orphaned and 301 through `culled.json` after the next import.

## The Hot 100's share card is the chart itself, with photos (2026-11-20)

The owner's Rift Compare "rising cards" snapshot posts get about 2,000 Reddit views a day each, and he posts only a link and a
title: the link's thumbnail carries the post. Our Hot 100 card was text only (the week, the count, the #1 rise), so a Reddit
link post showed nothing a reader would stop for. `/og/hot-100/<region>` now draws the chart: the #1 riser large with its
photo, #2 to #6 beside it with their photos, each with its real 7-day rise, last week's and today's cheapest in-stock price
and its store count, all from `lib/hot100.ts` and the product files, the same rows the page lists.

The photos are TCGplayer's (asked at 200 px) and the stores' own Shopify files (asked at 300 px), fetched when the card is
drawn with a six-second timeout each, and kept only as PNG or JPEG (satori draws nothing else); a photo that fails is a plain
tile. Because it reads the product files the route is no longer prerendered: it is `force-dynamic` and kept by Vercel's CDN
for a day, like `/og/p` (one render per region a day). The page's og:image carries the week (`?w=<through>`), so a link
posted after a release is never shown last week's picture from a cache.

## 2026-11-20: A "Join the Discord" box with a reason, linking the family's one hub

The owner asked why the Discord had 9 members after five months: the only link anywhere went (from RiftCompare's menu) to
a server the owner does not run, with two empty channels and no reason to join. The family now has ONE hub, the owner's
server "TCG Deals & Restocks" (the sealed restock and price-drop feeds on top, a channel per game). This site links its
own never-expiring invite code, so the server's Invites list counts the members each site brings with no tracking of
ours. `DiscordCta` ("Restock and deal alerts, free on Discord") sits under the price table on the product page and
in the footer: never above a price, never a pop-up. `tests/discord-cta.test.ts`.

## 2026-11-20: Creator links tag their visitors' sales (paid creators)

The owner approved paid creators (2026-11-20): paid only per tracked buy click or code, A$300 a month in all, cut on day 21 unless
their visitors earned 1.5x. The ledger is on RiftCompare's earnings dashboard (`Specifxx/TCGEmpire` `lib/earnings/creator-deals.ts`).
Here: `lib/paid-visit.ts` (the same file as Rift's and Dex's) adds `cr` + six letters of a `utm_medium=creator` landing's
utm_campaign to every affiliate sub-id the visitor opens (EPN `customid`, and `/out/tcgplayer`'s `sharedid`, which the route passes
to Impact), mounted by `PaidVisitTagger` in the layout; and `lib/campaign.ts` keeps the tab's first-touch campaign for GA4's
`affiliate_click` / `outbound_store_click` as `campaign`, so a creator's buy clicks can be counted. Vercel's buy_click is unchanged.
`tests/paid-visit.test.ts`.


## 2026-11-20: The Hot 100 share card shows rises AND drops (owner)

A Reddit reply to a Hot 100 link post asked for "the biggest drops. I just want to rip and play"; the owner: every snapshot
thumbnail is half biggest rises, half biggest drops. `/og/hot-100/<region>` (`lib/og/hot100-card.tsx`) now draws the week's
three biggest rises beside its three biggest drops, each with its photo, change and two prices; the page lists up to 20 drops under
the chart ("Biggest drops this week"). `hotDrops` in `lib/hot100.ts` is the Hot 100's own rules mirrored (2+ stores in stock both
days, a fall of 1% or more and under the 50% misfiled-listing cap, the same seven days), from the same history; nothing new is read.
The og:image query gained `&v=2` so a cached rises-only picture is never served for the new one. No ▲/▼ glyphs on the card: the
bundled font lacks them. `tests/hot100.test.ts`.

## 2026-11-20: A Santa hat on the logo and lights under the header

**Owner, 2026-11-20:** "change the logo for all of our websites so that it's Christmas themed now. Put a Santa hat on top
of the logos … and add some decorations here and there, like some Christmas lights … and yeah, Santa Claus." The owner
asked for hats and lights by name, so they come back after the 2026-11-08 tone-down, kept to the header.

- The logo mark wears a Santa hat (class `xmas-cap` on its wrapper), a string of lights hangs under the sticky header
  (`xmas-garland`), and the home page's gift-guide line, where there is one, gets a small Santa. All of it is the
  `xmas-logo` block in `globals.css`, the same block on every Compare site (RiftCompare's DECISIONS has the history).
- CSS only: three inline SVG data URIs (~2.5 KB of stylesheet), no request, no script, no animation. Every piece is
  `position: absolute` and `pointer-events: none`: no layout shift, no tap caught, nothing in the server HTML changes
  but two class names, so titles, metadata and structured data are untouched. Favicons and share images are unchanged.
- Off switch: `CHRISTMAS_FESTIVE_LAYER` (`lib/season.ts`, the `data-festive` attribute on `<html>`); the Christmas window
  also ends it on 27 December by itself. Remove after New Year: delete the block and the two classes.

## The Hot 100 sells, not just ranks (2026-11-20)

Reddit link posts land on `/<region>/hot-100`, and those visitors almost never clicked buy (13–19 Nov: MTG's Hot 100 had 0
buy clickers in 732 visitors; Reddit visitors 2.9% on MTG and 0.7% on Rift, against 23% and 12% from Google; the
buy-clicks boardroom, move 2). The page now opens with "Shop the top risers", the week's top three as `ProductCard`s,
and every chart row (`StockRow` with `buy`) opens the quick view on a plain click and shows a Buy button beside its
cheapest price. The quick view itself is unchanged (the A/B runs to 3 Dec); the rows only link into it. Same data as
before (`cardsFor`), no new read, caching unchanged. Read on 27 Nov and 4 Dec as buy clickers among visitors with a
reddit.com referrer; the target is 8% or more.

Same day, after the Hot 100 post drew 2,812 visitors (2,584 from Reddit, 95% phones) and 2 buy clickers on the page before
the change above was live: the "Biggest drops this week" rows get the same `buy` (quick view + Buy). A drop is the week's
best buying signal, and it was the one list on the page with no way to a price but the product page. Same data, same quick view.
## 2026-11-20: Numbered "Emblem" cards are cards

The card coverage audit (TCG Singles DB's `coverage.yml`, owner 2026-11-20: every card, promos and special printings included)
found 22 cards TCGplayer lists that had no page here, all named "Emblem": the 19 Jurassic World Collection "(Borderless)
(Emblem)" foils (27-45, US$200 to US$1,300 market), Eventide's Leering Emblem (171), Future Sight's Emblem of the Warmind (112)
and Secret Lair's "Earth's Mightiest Emblem - Arcane Signet" (908). `cardsOfGroup` dropped every name with "emblem". A game
emblem is a token: rarity T, or a letter number such as E1. Only those are left out now; a card with a plain number stays.

## The Hot 100 buy prompt, 50/50 (2026-11-20)

The owner, the day a Hot 100 Reddit post brought 2,596 Reddit visitors to `/us/hot-100` (95% on phones) and the page had 2 buy
clickers: "we might need some pop up buy clicks ads to convert". `HotBuyNudge` (`lib/hot-nudge.ts`): a visit that LANDED on a Hot 100
page from reddit.com is split 50/50 (localStorage `hot-nudge`); the "on" arm sees one small card at the foot of the screen with the
week's #1 riser, its cheapest in-stock price, "Compare every store" (the quick view, unchanged) and one paid link, a TCGplayer search
(placement `tcgplayer-hot-nudge`). Never on load (8 s and a scroll past the first screen), never after a buy click or over a quick
view, once a visit and 3 times in 7 days, ✕ and Escape close it, gone after 30 s. No eBay or Amazon in a pop-up (owner rules).
Google visitors and crawlers never see it: the server HTML has nothing, so search and the light-ads group of the heavy-ads test
(MTG light, to 10 Dec) are untouched. Counted by ONE event `hot_nudge` {k: "<arm>:seen|shown|buy"}; buy_click is unchanged (3
properties). Read on 22 Nov and at the next Hot 100 post: visits with a buy click per seen visit, per arm; keep at p < 0.05.
Click metric: MTG /us/hot-100 Reddit buy clickers, 2 of 2,596 on 19-20 Nov; target 8%.
## 2026-11-20: A "keep up" strip on the Hot 100 (owned audience)

The Hot 100 is where Reddit posts land, and Reddit visitors rarely buy (about 2.3% click a buy button, against about 19% from
Google), and a Reddit visitor who does not buy is gone. Under the first buy cards, before the chart, the page now offers two ways
to come back: the week's biggest price drops by email (the existing weekly email on RiftCompare's shared alert service, kind
"weekly", double opt-in; this site keeps no address) and the Discord hub through this site's own invite code
(`components/KeepUpStrip.tsx`). Inline, never a pop-up, no heading, a fixed minimum height so nothing moves. It is not an A/B
test: it is on for everyone. Measured as `weekly_signup` with placement `hot-100` (an existing event, no new event name) and
the invite's uses in Discord. The email promises the week's drops, which is what the weekly email sends, not the Hot 100 chart
itself.
## 2026-11-20 — Black Friday pages: products furthest under their own 30-day price, with a buy button on every line

Code red plan (20 Nov), Cyber Week buy sprint: the season's pages lead with a list a shopper can act on. `lib/real-drops.ts`: a product
is listed only when its cheapest in-stock price today is 10% or more under the median of its OWN recorded daily prices over the
last 30 days (today left out), with 14+ recorded days, wrong-listing days (under half the median) left out, no claim when the
records swing more than 2x, no placeholder prices (9999.99), and a typical price of 20.00 or more. Each line carries the
cheapest store's buy button (its own link, `offerLink`) and a tagged eBay search, placement `bf-drops`. It replaces the
"Under their own 30-day typical price" list on the same pages (same idea, no buy button, fewer guards). Copy says "under its
30-day typical" and "lowest since <date>", never "was", "dropped" or "ever" (BANNED_COPY). Read 3 Dec: `bf-drops` buy clicks
28 Nov to 1 Dec against the 4 days before. The same file ships on Dex, Rift and OP.

## 2026-11-20 — "Pick one" Commander deck and Scene Box listings are vague; Italian Star Trek decks are foreign

The 20 Nov export had 33 store titles that each made a one-offer page: luckydice's Italian Star Trek decks ("Flotta della
Federazione", "Furia Klingon", "Noi Siamo i Borg", "Squadra di Sbarco"), "pick one" listings where the store chooses the deck or
box ("(Choose Your Style)", "(4 options)", "[Various]", "(Various Styles)", "(See Variants)", "(au choix)", "Pick Your Scene",
"Choose one", "Individual Commander Decks", "1pc", "Standard Edition", "(Assorted see instore for availability)"), and store
notes ("(New Arrival)" outside Commander decks, "(Delayed Availability)", "(DELAYED NO ETA)", "1pc"). `sealed-title.ts` now
reads the Italian names as foreign, drops the pick-one words for Commander decks and Scene Boxes (a title naming no deck is then
vague, one naming its deck keys onto it), and drops the notes everywhere. Replayed on every offer title: 25 refused, 8 join an
existing page (Beam Me Up Bundle, Star Trek Bundle, Prerelease Pack, both Scene Boxes, Marvel Beginner Box, Reality Fracture
Secret Lair Bundle), nothing else moves. Orphaned pages 301 via `culled.json`.

## 2026-11-19 — Black Friday strip on sealed pages

The owner's board (19 Nov): ride Black Friday on the pages we already have, no new URLs. Every product page with an in-stock
price shows one short card under the best price, through 1 Dec (`lib/bf-strip.ts`, `BlackFridayStrip.tsx`, labelled by
`saleStrip`: Black Friday, then Cyber Monday): the cheapest price today and where, that store's measured shipping (`shippingCell`,
only when measured), when that price was read, the pre-order date, and where today's price sits against the product's own
recorded history. The history cue needs 14 priced days in the last 90; it says "Lowest price in 90 days" only when the
recorded prices reach back 90 days, otherwise "Lowest price since <first day>"; a price that never moved says "Same price since <first day>" (no low claimed), and
above the low it gives the window's real low and its day. A day under half the window's median is a wrong listing and never the low; a window
whose prices (or today's against them) differ by more than 2x gets no cue at all. Never a
"was" price, "lowest ever", a countdown or a link; no new read, no eBay call; the quick view (its A/B runs to 3 Dec) and the
phone strip ad are untouched. Same strip on DexCompare, RiftCompare and OP Compare. Judge on buy clicks per product-page view,
24 Nov to 1 Dec against 10 to 17 Nov.

Amended 2026-11-21 (partner terms): TCGplayer's commission rises with a calendar month's sales, so Cyber Weekend sales through us
also lift the month's rate. The strip gains ONE link, on its own line under the facts: an "Ad"-labelled, tagged TCGplayer search
for the product ("See Black Friday prices on TCGplayer", placement `tcgplayer-bf-strip`). It claims no price and no deal, ranks
nothing, and never takes the cheapest badge; the rows below stay sorted by price. Counted in the 3 Dec Cyber Week read. When
TCGplayer's own Cyber Weekend landing page is available it replaces the search.


## 2026-11-21: A Cyber Weekend sign-up under the real drops (owned audience)

The Black Friday and Cyber Monday pages carry one sign-up directly under the real-drops block: the weekly drops email (KeepUpStrip,
placement `black-friday`, email only because the Discord box sits lower on the page) on the sister-alert sites, a free-account
prompt on the account sites. The weekly email has its own Black Friday (27 Nov) and Cyber Monday (30 Nov) editions on RiftCompare's
service (TCGEmpire DECISIONS, same day), so a sign-up before 26 Nov gets the Black Friday one. Inline, never a pop-up; real drops only.

## 2026-11-22: A giveaway, run by RiftCompare's points engine

**Decision.** `/giveaway` (static, prerendered) shows this site's prize (two Star Trek Play Boosters, under A$20 at Australian
stores), its points, the leaderboard and the official rules; the home pages carry `GiveawayHomeBanner` under the hero while it is
open, and the menus list it. The entry panel (`components/giveaway/`) sends the visitor's stored RiftCompare session
(`lib/premium-member.ts`) to `https://riftcompare.com/api/sister-giveaway`, and the board reads RiftCompare's CDN-held
`/api/giveaway/leaderboard?site=mtg`; the draw (a public drand number), the winner's email and claim form, and the address are all
RiftCompare's (TCGEmpire DECISIONS.md, 2026-11-22). This site still stores no address and holds no key. `lib/giveaway.ts` repeats
the prize and dates of RiftCompare's `mtg-star-trek-2026-12` entry and must change with it; a new round every two months.

**Why.** Owner, 2026-11-22: "make all of that ... for MTG Compare as well ... a less than $20 most recent booster pack ... a point
system ... every 2 months".

## 2026-11-22: Bot rules never untag a real person

The owner (22 Nov): "make sure that there are literally zero false negatives when you filter bots, and false positives are okay."
A buy link sent untagged to a real person is a lost sale; a bot sent tagged costs nothing we can see. `lib/bot-click.ts` had
untagged anything with no Accept-Language, no Sec-Fetch-Mode, or a Sec-Fetch-Site of "none" or "cross-site". Real people
send all of those: iOS before 16.4 and some in-app browsers send no Sec-Fetch-*, and a link opened from Discord, an email, a
pasted URL or a translate proxy is "none" or "cross-site". "yandex" and "baidu" also matched real browsers' UAs (YaBrowser
builds, baiduboxapp). Now `looksLikeBot` (the one thing that untags) is only an empty User-Agent or a self-named crawler or
script; the header checks moved to `suspectClick`, which at most leaves a click out of the server-side click log, never the tag.
The 10-14 Nov crawler with full browser headers will reach the networks tagged again: accepted by the owner's rule.

## 2026-11-22: One-store twins, fourth pass (starter kits, Scene Box spellings, [Prerelease] tags)

An audit of every product with one offer (163 on the 22 Nov export) found more store wordings that made a second page of a
product other stores list. `identify()` now reads: a "[Prerelease]" tag or a leading "Prerelease -" on a Commander deck or a
Collector Booster as the store's pre-order shelf (alohacardshop's four Star Trek decks and pack), a set's Starter Kit or Starter
Collection without its year ("Bloomburrow Starter Kit 2024"; a set-less kit keeps its year) and without "Learn to Play", "2
Ready-to-Play Decks", "2 Player" or "Single Pack" (so the 23-store "Foundations Learn to Play Beginner Box" page joins the
Foundations Beginner Box, both US$29.99), Scene Box spellings (Smuag, Treasure, Smaug™, Crack the Plate, "Lo Hobbit"), "Multi
Verse"/"Multiverses Reforged", "Tales from Middle Earth", a slash colour identity ("WHITE/BLUE/BLACK"), "Limit one per customer",
"[Special Deals]", "Universe Beyond", "Gatheing"/"Gatherigng", "Avater", "Starterset". It refuses consignment listings (a
second-hand sale), a pick-one "(2 Varieties)" Scene Box, and Italian ("Mondi Altrove", "Mazzi") and Croatian ("Kutija za
pocetnike") prints. Never "Karten": German stores list English packs as "(14 Karten) - Englisch". Replayed on every offer title of
the export: 83 offers change, 74 join an existing page, 9 are refused, no offer lands on a new key and no two different products
merge; 46 one- and two-store pages empty and 301 through culled.json. Left alone on purpose: "Reality Reforged" (not sure it is
Multiverse Reforged), "Take Home"/"At Home" prerelease kits (some add boosters), "ITA\ENG" starter kits.

## 2026-11-23: "Share this deal with your group chat" under the best price

A text button under the product page's best price (ported from DexCompare, `components/DropShare.tsx`, `dropText` in `lib/share-link.ts`) copies, or hands
the phone's share sheet, one line with the cheapest store's real price and name ("Pre-order: " when the set is not out yet) and our
page's canonical link tagged `utm_source=share&utm_medium=drop`. Shown only when the best price is a store row (never eBay). It is
a separate component so the share-for-a-deal A/B test on `ShareButton` is untouched; it sends `share { kind: "drop" }` and its
visits arrive as `share_visit` with medium `drop`.

**Why.** On 22 Nov Cardboard Hero took ten referral orders in 41 minutes for its Delta Reign wave-2 ETB pre-order (CA$89.99, the
cheapest in Canada here), but only about three came through a click we tracked: the store link had been pasted into a restock
chat. People share drops anyway; this makes the link they paste ours, so every store is compared and the clicks are counted.
Owner, 2026-11-23: "how can we capture these restock chats or posts so we can get even more clicks". Read `share` kind `drop`
and `share_visit` on 25 Nov and 30 Nov; remove it if fewer than 5 shares in a week and buy clicks on product pages fall.

## 2026-11-23: A real profile page, and sign-in slides inside the one-prompt-a-visit budget

**Decision.** `/account` signed in is now a profile (`components/account/ProfileHub.tsx`): who, Free or Premium, four tiles (the
collection's value today from this browser's list and `/prices.json`, the price alerts, the giveaway points, Premium), the
giveaway's check-in and invite link in place, a "get the most from your account" checklist, and the Premium card for a free
account. Signed out, `/account` puts the sign-in slides (`SignInSlides`, "panel") beside the form. The slides sell only the FREE
account, one true benefit each (the giveaway while open, alerts, the collection, one account for every card site): no price, no
Premium, nothing `copy-rules.ts` bans. The home page's one promo banner is the slides for a signed-out visitor (the giveaway is its
first slide) and the plain giveaway banner for everyone else, so the page still carries one. `SignInCorner` (new here; this site had no
corner card): a signed-out visitor is asked for a free account, never money; never on a visit's first page, after a scroll, closed
for 7 days, never on the account pages, on product pages only from 1024px. It is the visit's ONE self-opening prompt
(`lib/prompt-slot.ts`): it stands down when the rating card or the return nudge had the visit, and the
rating card stands down after it. It never shows on a page that already carries the slides (the home banner).
Every sign-in prompt links `/account?src=<surface>`; the sign-in sends it on, and RiftCompare stamps a new account
`sister:mtg:<surface>` (TCGEmpire `sisterSignupSource`). Events: `signin_prompt` {surface, step}, `signin_prompt_click`,
`signin_complete` {src, method}, `profile_view`.

**Why.** Owner, 2026-11-22: "Can we significantly uplift the profile pages and the sign in and login incentive ... especially
dexcompare and mtgcompare". In the week to 22 Nov, 118 of 125 new reachable people were RiftCompare accounts and Dex and MTG, with most of the Google traffic, added 6. Owner, 2026-11-23: "keep user experience high and not flooding them with ads and
information" (ops/product-ux/page-budget.md): hence one prompt a visit and nothing on the first page.

## 2026-11-23: Commander decks and Secret Lair drops can reach the home "Most popular" tab (merch)

**What.** The region home's "Most popular" pool (`src/app/[region]/page.tsx`) was in-stock boxes, ETB/collector boxes and packs only.
`homeRails` now also returns the eight best-ranked in-stock Commander decks and Secret Lair drops (Secret Lair reads a 400-row window,
it has ~770 products), and they join the pool on demand (`lib/home-rank.ts`), at most three of the eight so the boxes keep the rest.
No new tab, section or URL; quick view and price rows untouched.

**Why.** The 23 Nov demand feed: 8 of the top 20 US product pages in 7 days were Commander decks or Secret Lair drops (Star Trek
Borg deck 95 views, Klingon Fury 78, Landing Party 74, Federation Fleet 73; Secret Lair Masters of the Universe 111, Hulk SMASH 58),
and none could reach the tab. Read 30 Nov: buy clicks per home visitor on MTG against 16-22 Nov.

## 2026-11-23: One-store twins, fifth pass (take-home Prerelease kits, Scene Box contents, "Villians")

The rest of the 22 Nov audit list. `identify()` now reads a Prerelease Pack sold outside the event as the set's Prerelease Pack:
"Take Home Prerelease Kit", "Prerelease Pack Take Home", "At-Home Prerelease Kit", "Prerelease at Home Pack Kit (No Additional
Packs)" and cardknights' German "6 Play-Booster & exklusive Foil-Promokarte" (the pack's own contents). Their prices sit inside the
set pack's own range in the same market (Aetherdrift take-home C$34-45 against the pack's C$25-50; TMNT C$40-48 against C$38-70).
A kit the store added boosters to ("Includes TWO Additional Star Trek Play Boosters") is the store's bundle and is refused
("multiple"). A faction pack keeps its faction. Scene Boxes: "(incl. 3 play boosters)" is what the box holds, not which one;
"Villians Unleashed" (8 stores) and Marvel Super Heroes' "Villains United" (2 stores; the set has one villains box, beside Heroes
United) are the Villains Unleashed box; "Treasure's Of Smaug" is Treasures of Smaug. Replayed on every offer title of the 23 Nov
export: 26 offers change, 25 join an existing page, 1 is refused, no offer lands on a new key and no two different products merge.
Left alone on purpose: the Reality Fracture "Foundations (Starter) Commander Deck" listings, which stores file both as Commander
Decks (77 offers under Foundations) and as Starter Commander Decks, under two sets; that needs TCGplayer's own naming first. Also the
two-box Scene Box sets ("Divergent Timeline / Enterprise-Q", "Coppia (2 Scene Box)") and "Star Trek- Scene Box Limit 2 PP".


## Black Friday page: one deal list, deals above the fold (owner's review, 2026-11-24)

The owner reviewed DexCompare's /us/black-friday and asked for it "urgently" on every site, ported here from DexCompare: deals above the fold, one list with a toggle, a discount badge on
every row, filters and sort, sticky section chips, per-row freshness, delivered price, a sparkline, plain labels, footnotes as info
tips, one affiliate disclosure, aligned rows, a primary store button with eBay as a text link, bigger thumbnails, one slim alerts bar,
phone rows with 44px targets, and click and scroll tracking per section.

- The two lists ("furthest under their own 30-day price", "furthest under the median") are ONE list (`lib/sale-deals.ts`,
  `lib/sale-deals-data.ts`, `components/SaleDeals.tsx`). Each row carries one offer, the cheapest a shopper can order now, and both
  discounts are measured against that same price; the toggle ("Biggest price drops" / "Under other stores today") picks the basis
  that badges and ranks. The badge is the % under; the struck price is that basis's reference (30-day typical or store median),
  labelled for screen readers, never "was".
- "Price drops" joins HISTORY_PHRASES (owner's label): allowed only on pages built from the recorded history, like this list.
- A row read more than 12 hours ago says so in amber. Shipping is the store's measured checkout (`shippingCell`), shown as
  "≈ $X delivered", else "Shipping at checkout".
- Clicks: the list keeps `bf-drops` (the 3 Dec read); the price watch rows are now `bf-moves`, `bf-dearest`, `bf-older`,
  `bf-graded`. `bf_section` counts each section's first view (scroll depth), `bf_filter` each filter used.
- The email box and the Discord box are one slim bar after the fifth row (email, Discord, Telegram).
- MTG Compare lists English product only, so the language filter hides itself when no row is Japanese.

## 2026-11-24 — The owner's UX review (DexCompare, 2026-11-23), ported

The owner reviewed DexCompare and asked for the same everywhere ("these requirements are site-wide"). Ported from
`Specifxx/CompareEmpire` #351, #352 and #353 (apps/dexcompare-sealed, DECISIONS.md "Owner's UX review" P0, P1 and P2):

- **Listings sort and filter** (P0 3, 4): eight or more products get the sort bar (price, price per pack, % under median, newest)
  and set, era and price-band filters (`GridControls.tsx`, `lib/grid-sort.ts`), one continuous order, no feed tiles in the grid,
  the eBay strip under it. No language filter: MTG Compare lists English product only.
- **Typo-tolerant search** (P0 5): one or two edits by word length (`suggestQuery`), "Showing results for", the most stocked
  products instead of a dead end. `search_zero` / `search_fixed` go to GA4 only (`gaEvent`), never Vercel's billed events.
- **Nothing opens while typing** (P0 1, `lib/visitor-busy.ts`); the sale strip has a close button for 7 days (P0 6).
- **P1**: delivered price by default (`ship-mode.ts`); the stores first and the marketplaces (eBay, TCGplayer, Amazon) in a
  labelled block under them on the product page; "Shortlist" for the cart; price history beside the best price and sticky
  Prices / History / Facts / FAQ links; "N% under median" labelled badges with the definition on hover; one-line deals lede;
  a failed image retried once, then the site mark; store thumbs votes hidden on phones.
- **P2**: Deals menu of five entries (one starred sale page; pre-orders and the release calendar in the Sets menu's "Coming
  soon"), a filter box on the sets index, an empty shortlist that offers today's deals, reduced motion for every animation.

## 2026-11-24 — Impression events sampled 1 in 10 visitors

The coordinator's Vercel cost check: since 19 Nov MTG Compare's Web Analytics events went from about $0.05 to $0.31 a day, mostly
per-view "seen"/"shown" events (hot_nudge, ebay_pop, ab_seen, nudge_eligible, nudge_shown). `lib/track.ts` now sends them for
one visitor in ten only (sticky in localStorage `mtg-imp-sample`), each with `w: 10`; clicks, sign-ups and buy clicks are never
sampled. Per visitor, so each A/B arm's impressions and clicks come from the same people: the 3 December reads compare arms as
before, and an absolute count (seen, shown) is the sum of `w`, or the event count × 10.

## 2026-11-24: six regional guide copies noindex (Job D, the page scorecard)

The coordinator's page scorecard of 2026-11-23 (`/strategy/page-scorecard-2026-11-23.json`: 28 settled days of Search Console to
20 Nov, visits to 23 Nov) put these guide copies in MTG Compare's bottom 20%, each past Google's page 3 with no click and no visit:
`/uk/guides/mtg-booster-box-prices` (149 impressions, position 46), `/uk/guides/mtg-bundle-prices` (102, 46),
`/ca/guides/is-a-collector-booster-box-worth-it` (82, 32), `/au/guides/is-a-collector-booster-box-worth-it` (60, 33),
`/uk/guides/magic-sealed-products-explained` (52, 39) and `/uk/guides/secret-lair-drops-explained` (24, 45). Seven near-identical
copies of one guide split what little signal a new site has; the US copy is the one to rank (US-first, 22 Nov). They are now
`noindex`, out of the sitemap and out of every copy's hreflang (`GUIDE_NOINDEX_IN`, `guideCopyIndexable` in
`src/content/guides/index.ts`), and stay live, linked and in the region's guide index for visitors. The UK copies that rank on
page 1 or 2 (collector-booster-box-prices at 8, how-to-avoid-resealed at 12, how-to-preorder at 16) are untouched. Take a copy off
the list once its region has outside links or the US copy ranks on page 1. Pinned by `tests/sitemap.test.ts`.

## 2026-11-25 — Fiverr usability review, ported from TCG Prices

A paid tester's think-aloud on TCG Prices (tcgcompare DECISIONS.md, 2026-11-25) asked whether we compare every store or only the
ones that pay us. Under the price table the product page now says "Every store we track is listed, whether it pays us or not, in
price order" with a link to /methodology, and the group-chat share button reads "Share deal" (its full wording stays as the
button's accessible name): the tester found the page's buttons too wordy. Cart and watch wording wait for their A/B verdicts.

## 2026-11-26: The header's string of Christmas lights is removed (owner)

Owner, 2026-11-26: "I don't really like the Christmas lights on the very top." The string of lights hanging under the header
(2026-11-20) is removed on every Compare site: the `.xmas-garland::after` rule is gone from the `xmas-logo` block in `globals.css`
and the class is off the header. The Santa hat on the logo stays, and nothing else of the Christmas layer changes.
## 2026-11-25: A TCGplayer column in the empty right side of a wide window (owner)

The owner, 2026-11-25, on a desktop: "Why are the display ads at the very bottom of the site? … there's so much space on the left and the
right side of the website." (YGO Compare #267, DexCompare #367.) MTG Compare is a LIGHT site (the ad-intensity test's control, read
10 Dec), so it takes one column, not two: `components/GutterAds.tsx` with `sides="right"`, from 1440px wide, the newest sets'
TCGplayer products in the right-hand gutter. The region home already places its banner pair under the in-stock shelf, and product
and set pages under their own content, so no banner moves here.

The column is sized to the gutter beside the page's 1152px content (about 110px at 1440, 180px at most) and stays 14px clear of it
and of the window; it sits absolutely inside `<main>` with a sticky card, so it starts under the header line, ends where the content
ends and never takes width from the page. Browser only (CLS 0, no SEO change), labelled Ad, rel sponsored under `gutter-tcg`, never
Amazon, never for ad-free members or in the app. Its tiles start after the banner's six. This reverses "never a rail" (2026-11-13) on
the owner's word. Read: gutter clicks per 100 desktop visitors; if desktop store buy clicks per visitor fall 10%, it goes. For the
10 Dec heavy/light read, compare MTG's desktop before and after this release separately.


## 2026-11-25: Best Basket on MTG Compare, the plan for Premium members

The owner (2026-11-25): Best Basket "on all the sites as premium", after users asked for it. `/<region>/best-basket` takes the
shortlist's products (one line per product page in that region) and splits them across stores for the lowest total with
shipping, with RiftCompare's solver ported as is (the same files as DexCompare's, CompareEmpire #369) (`lib/basket-optimize.ts`; types in `lib/postage.ts`).

- **Rows:** in stock, read by the import in the last 48 hours, never a pre-order (an unreleased set, or "pre-order" in the
  title or link), never TCGplayer, eBay or Amazon. These are Rift's rules after the Sprite Fountain report (TCGEmpire #653).
- **Shipping:** each store's measured figure (`src/data/shipping-rates.json`) for that subtotal, at the dearest address, shown
  as "up to" when addresses differ or the order holds more than one item (we measure single-item carts). A store we never
  measured is left out and counted, never priced at zero.
- **Free vs Premium:** everyone gets the delivered total and the saving. The store-by-store plan (buy links, each store's
  shipping, one checkout per store, the one-store order) is returned by `/api/basket/<region>` only when RiftCompare's
  sister-premium status says the token is Premium right now. It is withheld in the response, not hidden with CSS. The cheapest
  price of every product stays free on its page.
- **Links:** each line's link is the row's own `offerLink` under the placement `best-basket`. A Shopify cart permalink carries
  the line's quantity, and a store whose lines are all permalinks gets one checkout link (`checkoutUrl`).
- **Placement:** the only entry is a link on `/cart` once the list holds two or more products from one region. There is no
  pop-up, and the page is noindex.

## 2026-11-26: the phone's home pages, tidied (one path: the headline, the search, one row of ways in, the products)

**Owner, 2026-11-26:** "we should still tidy up the landing page for our sites a little bit, because I think there's just too
much going on, especially for mobile phone."

**Measured at 390px before:** the region home (`/us`) was 7,286px tall and its first product began at about 1,470px, on the
second screen. Above it: the sale strip, the breadcrumb, the pre-order pill, the headline, two lines of sub-text, the search,
seven region chips in two rows, six tiles in three rows, two lines of counts, the giveaway card, the card-prices line, the
shelf's title, tabs and note. The landing page (`/`) was 4,451px and its first product began at about 1,190px.

**Now, below 640px only:** the headline, the search, the six ways in as ONE sideways row of chips, then the products; the
giveaway and the card-prices line sit under the products by `order`. `/us` is 6,828px and its first product begins at about
685px; `/` is 4,189px and its first product at about 600px: both on the first screen. Hidden on a phone: the sub-line, the
line of counts, the shelf's one-line note, and on a region home the hero's region row (the header's flag chooser is on the
same screen and the footer lists every region). On the landing page, where a region is chosen, the region row stays as one
sideways row instead of two (owner, 2026-11-02: the switcher prominent in the hero, with flags).

**Deliberately not done (this is a top earner):** no product, price, stock line or buy link is hidden. The shelf keeps its
eight products and the landing page its ten rows (the sister sites show six), the four latest sets stay, the pre-order pill
stays (it is a way to a set's stores, not a second promo; the Christmas line already waits for the sale strip). If the page
should be shorter still, the shelf's seventh and eighth product are the next 350px.

**Unchanged:** the HTML is the same at every width, so a crawler, find-in-page and a desktop see every block; no URL, title,
heading or JSON-LD changes; from 640px up the pages are pixel-identical (compared at 700px and 1280px). No ad moves: the
banner pair is still the first block after the products, the giveaway and the card-prices line, as it was. On the region home
the giveaway's markup moved inside the page's one column (`home-flow`) so a phone can reorder it; it draws the same on a
desktop. CSS only, in one block of `globals.css` ("The phone's home page, tidied"), placed before the eBay stand-out block
because `tests/ebay-pop.test.ts` reads everything after that heading. The hooks are `home-flow`, `home-give`, `home-new`,
`home-shelf`, `hero-regions` (landing) and `hero-markets` (region home). Reverts by deleting the block.

**Read:** phone bounce (non-Reddit) and store buy clickers per 100 phone visitors on `/` and the region homes, the week after
release against the week before. If phone region switches from the hero were doing work (GA `region_select`, placement
`hero`), the region row comes back as one row on the region homes too.

## 2026-11-26 — EU store sweep: 39 eurozone shops for Magic sealed

Owner, 2026-11-26: "we need a much bigger European scene … we need all those stores in". The candidates were every
eurozone shop the sister sites' registries list (and the Riftbound retailer directory) that this site did not list.
`scripts/probe-stores.ts --in research/eu-candidates-2026-11-26.json --write` (`probe-stores-eu.yml`, run on a GitHub
runner because the container cannot reach store hosts) kept the ones with 3+ sealed Magic products in EUR. nerdbank.de
was left out: same stock as spielewelt.de (one stock, two domains counts once). No existing store changed. Prices stay
in EUR, never converted.

## After a buy click, one price alert offer (2026-11-26, COO: compounding plan move 3)

Someone who clicks through to a store and comes back to this tab has not necessarily bought. `AfterBuyAlert` (product page only)
asks once: "Not buying today? We can email you if it gets cheaper", with the ordinary price alert (one tap when signed in). It
keeps the page budget: it shows only after the visitor's own buy click (OutboundLink dispatches `buyclick`) and only once they
are back on this tab, never on load; it is the visit's one prompt (`claimPromptSlot`); ✕ silences it for 7 days and a created
alert for 30; it is never a modal: an inline card under the price table on phones, a corner card from 1024px. Products with no
price today get none. Counted as `after_buy_alert` {k: shown|created|close}; the number is alerts created per 100 buy clickers on
product pages, reported in Owned Audience's Monday self-review. `tests/after-buy-alert.test.ts`.

## 2026-11-26 — The old rarities post goes to the rarity guide; the pack-count guide names its products

**Why (Search Recovery, Dex and MTG half-share to 21 Dec):** Search Console, 90 days to 23 Nov. The old singles site's
`/guides/magic-card-rarities-explained` still ranked 7.2 for "how to identify rare magic the gathering cards" (176
impressions, 21 a day by the last week, 0 clicks), but it 308'd to the blog index. The 20 Nov guide
`/us/guides/how-to-identify-rare-magic-cards` answers that query. "how many packs in a collector booster box" and "how
many packs in a mtg booster box" sat at about 9.5 with 0 clicks under the title "How many packs are in each Magic sealed
product?".

**Now:** `/guides/` and `/blog/magic-card-rarities-explained` 308 to the rarity guide (`REHOMED_POSTS` in
`src/lib/blog/index.ts`, pinned in `tests/guides.test.ts`). The pack-count guide is titled "How many packs in a Magic
booster box, Collector box or Bundle?". No URL is removed.

**Read:** clicks on the rarity guide and the pack-count guide, 7 to 13 Dec against 16 to 22 Nov.

## 2026-11-26 — Box worth: published odds only

**Why (owner, OzBargain report move 2):** "Is a box worth opening?" is a question buyers search before they buy a box, and
the honest answer needs two things we already hold: Wizards' own pull rates and TCGplayer's card prices.

**Now:** `/<region>/box-value` ranks every box we can value; `/<region>/box-value/<set>` gives one set's Play and Collector
Booster Box (`#collector` picks the second, so the page never reads the URL's query and stays one CDN copy).
- **Only published odds.** Every percentage is copied from the set's "Collecting <set>" article on magic.wizards.com
  (`src/content/box-odds/<code>.ts`, source URL and read date on each). A "less than 1%" line counts as zero, so the
  average is a floor and says so. A slot whose cards Wizards names but prints no per-card odds for (commons, most
  uncommons) treats each card in the pool as equally likely. A line we cannot single out in TCGplayer's list (Special
  Guests, Scene Box rares, some basics) has `pick: null`, counts as zero and is listed in the page's fine print. Nothing is
  guessed: a set without its article is not on the page.
- **The maths** (`src/lib/box-ev/model.ts`, pure, shared by server and browser): the average is the sum over slots of count
  × each line's chance × the mean market price of that line's priced cards. Cards under a floor the visitor picks ($0, $1,
  $2, $5; $1 by default) count as nothing, because bulk does not sell at market. 2,000 boxes are opened one card at a time
  with a fixed seed, so the server's HTML and the browser draw the same chart.
- **The verdict** is against the cheapest in-stock US box (US$, the currency the card prices are in). Other regions show
  their own cheapest box in their own currency beside it, never converted, and no verdict against it.
- **Tests** (`tests/box-ev.test.ts`): the maths on a toy set, and for every odds file that each slot sums to 100 within
  Wizards' rounding, that every line finds cards in the numbers Wizards prints, and that the lines are mostly priced.
- Indexed in us/au/uk/ca like other detail pages, in the sitemap there. Entry points are plain links (the set page's card,
  the box product page's "Is this box worth opening?" chip); no prompt.

First sets: Edge of Eternities, Lorwyn Eclipsed, Star Trek. More follow as their treatments are mapped to collector numbers.

## 2026-11-26 — Collector pulse under the price table

The owner (26 Nov) wants a community that talks about us. Move 1 of the community plan: one inline question under the
product page's price table, "what are you doing with this today?" (Buying, Holding, Skipping), stored by RiftCompare's
`/api/sentiment` (no sign-in, no address kept; RiftCompare DECISIONS.md "Collector pulse"). The split shows from 10
answers, and the weekly market posts quote it ("62% of collectors are holding Foundations boxes"), data nobody else has.
It never orders a price, never sits by a buy button or in the quick view. One question a visit: until ToolInterest's
test is read (4 Dec) the pulse shows only to visitors who already answered that one; from 5 Dec to everyone
(`components/CollectorPulse.tsx`). If RiftCompare is unreachable nothing is drawn. Read 9 Dec with the growth tests:
keep if 2%+ of product viewers answer.

## 2026-11-26 — A new set's pre-orders go live the day they open

The owner (26 Nov): "make sure new Magic sets and pre-orders go live on MTG Compare the day pre-orders open, with real prices from
the first store that lists them, starting with the newest sets." Set discovery (2026-11-03) already files Scryfall's announced sets
before every import, and Nauctis (498 offers) and Darkhold Destiny (459) were listed weeks ahead. Three gaps remained:

- **Shortened titles.** A discovered set matched only on its whole name, so "MTG Nauctis Play Booster Box (Pre-Order)" and
  "Darkhold Destiny Collector Booster Box" were refused as naming no set. Discovery now keeps the parts of a two-part name as
  `shortNames` ("Nauctis", "The Sunken Realm", "Darkhold Destiny"), matched like the name itself. Refuse rather than guess: a part
  is kept only with five letters or more, not only generic words, and when no other Magic set's name in Scryfall's whole list (or
  any hand-written set) contains it or is contained by it. "Marvel" (inside Marvel Super Heroes) and "Tarkir" (inside Khans of
  Tarkir, still sold) are refused. Hand-written sets keep their hand-written aliases.
- **Pre-orders for a set we do not know.** Every import now collects the titles it refused as naming no set that say they are a
  pre-order (`PREORDER_WORDS`, in the languages our stores write), writes them to `data/sets/unknown-preorders.json` (full runs
  only) and lists them in the job summary. The next discovery reads them: a set due between 180 and 365 days out is taken when two
  stores already sell its pre-orders. They never become products themselves.
- **Half a day's wait.** Only the evening import releases; a set whose first pre-order the morning run read waited up to a day.
  `scripts/new-set-release.ts` compares the export with main: an upcoming set (out today or later) with no offer before and one
  now makes the morning run's data commit a release too. The 12-hour build gate is unchanged and still decides; inside it the
  commit rides the next release. This happens a handful of times a year, and on that day the evening release may fall inside the
  gate and ride the next morning's (no extra builds; one set of prices a few hours later).
## 2026-11-26: The giveaway strip on the home and product pages

The owner asked to surface the Star Trek giveaway (closes 14 Dec) and the daily check-in on the home page and product pages, with
a clear referral invite link and no display ads. `components/giveaway/GiveawayStrip.tsx` is one inline card, never a pop-up or a
second prompt. While the giveaway is open it is the home page's one promo banner, for visitors signed in or out, and the sign-in
slides return when it closes; the old `GiveawayHomeBanner` is gone. On the product page it sits under the price table, after the
collector pulse, and draws nothing once the giveaway closes. Signed out, it shows the rules' own numbers from `lib/giveaway.ts`
(sign in 50 = entry 10 + free bonus 40, check-in +5, each friend +25), a sign-in button and "Get your invite link" (sign in, then
`/giveaway#invite`). Signed in, it shows the account's points, the check-in button, the free bonus if unclaimed, and the invite link
with Copy, through the same `giveawayCall` as `/giveaway`. It reads RiftCompare at most once every 10 minutes per tab
(sessionStorage), so browsing product pages costs no call per page. The rules are unchanged. `tests/giveaway-strip.test.ts`.

## 2026-11-26 — No pre-order page in a market no store prices the set in

The owner (26 Nov): "Do not publish a set page with no prices." The set page already 404s with no listed product, but the automatic
pre-order page (2026-11-02) and every link to it (menus, the home pill and banner, the release calendar, the set and product pages,
the sitemap, hreflang) appeared for every upcoming set in every region, so a set Scryfall announced showed "No store we track lists it
yet" until a store did, and Darkhold Destiny's Singapore page had no price at all. Now the export writes `data/sets/priced.json` (set
code → the markets where at least one STORE prices it; TCGplayer is a marketplace and does not count) beside the snapshot, and
`lib/priced-sets.ts` `setPricedIn` gates the page (a 404 until then, never a redirect: the URL comes back once priced) and every link.
A set therefore goes live in a market on the first release after the first store there opens pre-orders, with that store's price.

## 2026-11-26 — Member rewards on the account page

Owner (26 Nov): "we really, really need a loyalty system ... on all of our Empire websites", one that never runs at a loss. The
shared account service keeps one points balance (RiftCompare `lib/loyalty.ts`, `/api/loyalty`, DECISIONS there, "Compounding daily
streaks, and member rewards"); this site draws it in its own name on the account page (`components/account/MemberRewards.tsx`),
posting the member's token as every other account call does. A daily check-in is 1 point on day 1 of a streak, one more each day in
a row, up to 10 a day; points buy 7 days of Premium (300 points, once a month, never for paying subscribers). It loads after render,
opens nothing by itself and shows on no other page (one prompt a visit at most). Points have no cash value and never change giveaway
entries.

## 2026-11-27: The Empire design system takes the generated-template effects off

A visitor wrote to Compare Empire asking us to "hire a graphic designer so it wasn't giving claudeslop", and the owner asked for
a design agent to lift every site. The `empire-ds` block at the end of `globals.css` (the same block on TCG Prices, Dex and MTG;
rules and the list of tells in the project's `design-system/README.md`) takes off the gradient words and wordmark, the hero's
glows, glass and the pill above the headline, the ring round the search and the gradient button, and sets a price guide's type
and rules instead: the brand colour solid, a left-aligned masthead hero from 640px (centred on phones), a hairline between
sections, 10px radius on cards, inputs and buttons and 6px on badges. CSS only: no markup, words, order, URL or heading changes.
`tests/ebay-pop.test.ts` now reads the A/B block up to the design block, not to the end of the file.

## 2026-11-27 — Black Friday mode for one day (owner)

Owner, 27 Nov: "for one day, have the site turn into Black Friday mode … advertising way more about products and links". For
Black Friday in every time zone (00:00 UTC 27 Nov to 10:00 UTC 28 Nov, `lib/bf-mode.ts`) the promo line under the header becomes
one bold Black Friday bar: the region's Black Friday deals page, and a labelled TCGplayer sale link (`tcgplayer-bf-mode`). Same
place as the line, in the server HTML, never a pop-up, fixed or floating; ✕ hides it for the visit. The browser re-reads the
clock, so a cached page reverts on time with no build; the files can go after Cyber Monday.

## 2026-11-27 — Empire design language v2, "Ledger"

Bill (2026-11-27): rework the sites so they look state of the art and expert-designed, not vibe-coded. v1 (empire-ds) took
the template tells off; v2 (`empire-v2`, last in `globals.css`; the project's design-system/README.md) gives the look a point
of view, a price ledger: Geist for words and Geist Mono for the big prices (bundled, replacing Google-served Inter and Bricolage;
the Bricolage TTFs stay for share images), near-black neutral greys in dark and warm paper in light with MTG amethyst kept as the one
accent, product photos on one paper plate inside a bordered card, mono uppercase table heads, and nothing that blurs or
rises in on scroll. The offer table's buttons, order and the eBay A/B arms are untouched (A/B reads frozen to 2 Dec). CSS,
fonts and the shell test's font names only: no word, order, URL, heading or ranking changed.

## 2026-11-27 — Penny, the mascot who suggests a first search

Owner, 27 Nov: "cute little things that are smiling, welcoming, inviting … a little mascot saying, hey, search this term
here … people really like being told what to do". Penny, a smiling ginger cat who waves (our own flat SVG, no game or
character art), sits under the home page's search with "New here? Search your first item. Try one of these:" and three
example searches for this game. A tap types the example into the search box and runs it (a plain GET form is sent).
`components/MascotGuide.tsx` is the same file on every card site; only the examples differ.

- Inline in the hero, server-rendered, no layout shift. Never a pop-up, an overlay or a second prompt (one prompt per visit).
- One short wave on load and on hover, none under reduced motion. Neutral bubble that reads on dark and light.
- The h1, title, meta, URLs and order of the page are unchanged; the hero gains one line of text and three buttons.

Released at 11:35 UTC on 27 Nov, once the 8-hour gate opened (the first [deploy] [urgent] merge came within 8 hours of the 03:30 data build).

## 2026-11-27 — Black Friday mode runs to the end of TCGplayer's sale (owner)

The owner asked the same day for "a lot more effort this weekend into Black Friday and Cyber Monday … capture this
opportunity with TCG Player", so the bar (`lib/bf-mode.ts`, `BfModeBar`) no longer stops at 10:00 UTC on 28 Nov: it runs
until 04:00 UTC on 1 Dec, when TCGplayer's sale ends (11PM 30 Nov New York). Its label follows the weekend (Black Friday,
Cyber Weekend from 28 Nov 10:00 UTC, Cyber Monday from 30 Nov 05:00 UTC), and on Cyber Monday it links the Cyber Monday page.
Same place, same ✕, no pop-up; it still switches itself off with no build. Delete the files after the sale.

## 2026-11-27 — "Sale: 10% store credit" on the TCGplayer row while its sale runs (owner)

The first hourly read of Black Friday (27 Nov, 00:00 to 12:00 UTC) had buy clickers up 48% across the card sites, but TCGplayer
was only 9 to 20% of them, and the owner asked to "capture this opportunity with TCG Player". So TCGplayer's own row in every
product price table carries a small chip saying what its sale is (`TcgSaleChip`, 9AM 27 Nov to 11PM 30 Nov New York time,
`lib/bf-mode.ts`). It is drawn only in the browser after the clock is read, so cached HTML never shows it outside the sale. It
ranks nothing and marks no row the cheapest. Delete it with the bar after the sale.

## 2026-11-27 — UK and NZ release calendars and the Star Trek Commander post are noindex (page scorecard, Job D)

The 2026-11-23 page scorecard (28 days of Search Console to 20 Nov) put /uk/releases (position 58, 42 impressions) and
/nz/releases (position 51, 83 impressions) past Google's page 3 with no clicks and no visits, and the same for
/blog/magic-star-trek-commander-decks (position 35). Seven near-identical calendars split the signal the US copy can rank on, and
the Star Trek set hub and deck pages answer the post's query with live prices. They stay live for visitors, but are noindex, out of
the sitemap and (the calendars) out of every copy's hreflang: `RELEASES_NOINDEX_IN` in `lib/index-tiers.ts`, `Post.noindex` in
`lib/blog/index.ts`. The US calendar is never on the list. /release-dates already 301s to /us/releases. Take a copy off once it
has outside links or the US copy ranks on page 1.
Released at 19:37 UTC on 27 Nov once the 8-hour gate opened: the bar through Cyber Monday and the TCGplayer sale chip.

## 2026-11-27 — TCGplayer's sale card, once a visit, to the end of its sale (owner)

The owner asked for "a pop-up on every single website" for TCGplayer's Cyber Weekend sale, naming the 10% store credit and
"some items to get started". `TcgSalePopup.tsx` (drawn by `HolidayStrip.tsx` beside the Black Friday bar) is a small labelled
Ad card in the corner, or a short sheet along the bottom on a phone: no backdrop, nothing blocked, ✕ or Escape closes it for
good. It opens only while the sale runs (`tcgSaleOn`, 14:00 UTC 27 Nov to 04:00 UTC 1 Dec), nine seconds into a page, never
while a text field has focus or a key was pressed in the last five seconds, and only when it can take the visit's one prompt
slot. Its three links are this site's own tagged TCGplayer searches; no eBay and no Amazon (pop-ups are TCGplayer only). It
is off by itself when the sale ends. Not on Compare Empire, KaeYoung or ScentCompare: TCGplayer sells nothing they compare.

## 2026-11-27 — The rating card no longer asks on its own

Owner, 27 Nov: "make sure that users have a good experience … not too many pop-ups … the feedback pop-up on Rift Compare
can be taken down a little because we already have enough feedback". The rate-us corner card never opens by itself any
more (`AUTO_ASK = false`); a "Rate us" link still opens it. During Cyber Weekend the visit's one prompt goes to the sale card.

Released at 22:40 UTC: TCGplayer's sale card, owner asked for urgent releases.

## 2026-11-27 — The phone buy bar test: the paid link in the bar, from 3 Dec (Head of Conversion)

The phone buy bar repeats the page's best price, and that is usually a store that pays nothing: about two of every three buy clicks
go to unpaid stores, while eBay earns about A$0.35 a click and TCGplayer about A$0.42 (30 days to 23 Nov,
strategy/marketplace-placement-2026-11-24.html). So, 50/50 in the browser from 3 Dec (`lib/bar-test.ts`, localStorage `bar-test`),
phones only, product pages only, never the quick view: "store" keeps today's bar; "paid", where today's bar would show an unpaid
store, shows the cheaper of the page's own eBay listing and TCGplayer's in-stock tagged offer in this region's currency, with its
real price and link and an "Ad" label. Neither there (a pre-order, NZ or SG without TCGplayer): the store, as today. The best-price
card and the table are unchanged, and the bar never calls the paid link the cheapest. One event, `bar_test` {k}: "<arm>:seen" once a
visit (sampled 1 in 10 visitors like every impression, w:10), "<arm>:paid" / "<arm>:store" on the visit's first click of each kind
on a product page. Read 16 Dec: paid clickers per 100 phone product-page visitors per arm, and that store clicks do not fall by more
than the paid ones rise. MTG's only new test; it rides the normal release.

## 2026-11-28 — Owner override of the deploy floor

The owner (28 Nov, 00:38 UTC): "Ignore the deploy limit. Just deploy them urgently." `scripts/vercel-ignore-build.sh` now builds a `[deploy]` commit whose subject also carries `[owner-now]` whatever the gap since the last production build. Only for a release the owner has asked for in those words; every other release keeps the 12-hour gap and the 8-hour `[urgent]` floor. Released at 00:38 UTC for the Cyber Weekend TCGplayer bar and pop-up.
