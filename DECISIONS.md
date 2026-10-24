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
