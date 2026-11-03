# Decisions

Newest at the bottom. The engine's own history (the lean Rift Compare
playbook, eBay planning, matching rules, caching, forum, reports, seasons) is
in the sister repos' DECISIONS.md (`Specifxx/GundamCompare`,
`Specifxx/lorcanacompare`, `Specifxx/ygocompare`); code comments that cite a
DECISIONS heading mean theirs unless it is below.

## Why a Cyberpunk TCG site — 2026-11-01

Owner asked whether Cyberpunk TCG was worth a site after affiliate sales of
Cyberpunk cards showed up (most likely RiftCompare visitors buying on eBay
within the 24-hour cookie). Research the same day: WeirdCo's Kickstarter
raised US$28.35M from 50,773 backers (the most-funded tabletop campaign);
Beta print shipped September 2026, retail release 6 November 2026; WeirdCo
will not reprint a set or configuration; the Beta box (US$180 MSRP) sold
around US$315 on TCGplayer in October with 223 eBay sales in 90 days.
TCGplayer lists it (category 92, since 31 August), Cardmarket supports it in
Europe. Of the 1,240 stores the sister sites track, 1,136 answered and 392
listed Cyberpunk TCG (243 with three or more products). No site compared store
prices for it (CHOOMDEX shows eBay and TCGplayer only). Owner: build it,
domain cyberpunkcompare.com.

Risks taken knowingly: a brand-new game with no track record and no date for
set 2; "Cyberpunk" in the domain is CD PROJEKT's trademark (owner's call).

## Beta and Retail are separate products, told apart by the title — 2026-11-01

TCGplayer lists Welcome to Night City twice, "- Beta" and "- Retail", with
identical card and sealed names, and the Beta box costs about twice the Retail
one. A Beta price on the Retail box's page (or the reverse) is the worst kind
of wrong match, and the 0.25×–4× plausibility guard cannot catch a 2× error.

Engine option `SITE.setEditions` (off for the other games): the edition word
is removed from set and sealed names for matching, and a title's edition must
equal the product's. A title is Beta when it says "Beta", "36 packs" or
"Kickstarter"/"backer"; otherwise it is Retail (the default edition) because
stores selling the release-week box call it plain "Booster Box"; a title that
points at both matches neither. The eBay pass applies the same rule, and its
searches name the edition only for Beta. Pinned by `tests/set-editions.test.ts`.

## Rarity codes spelled out — 2026-11-01

TCGplayer stores Cyberpunk TCG rarities as codes (C, UC, R, E, S, IL, IO, IS,
NR). Engine option `SITE.rarityNames` maps them at import, so pages, filters
and rarity matching read "Iconic Legend", not "IL". IO is "Iconic" (TCGplayer's
"other" Iconic cards); NR is Nova Rare (promos, box toppers, event prizes).

## Its own eBay app — 2026-11-01

Owner: Cyberpunk Compare gets a new eBay keyset; Gundam, Lorcana and YGO keep
their shared app and budgets unchanged. `dailyBudget` 2,500 (half a keyset, so
it can take a second site), cards from US$10, every sealed product. Runs at
00:17 UTC. A no-op until the secrets exist.

## 2026-11-02 — Self-updating price report

The owner wants growth that runs without him ("a more passive, working in the background solution"): no daily Reddit
posts. Links are the passive lever, and outreach needs a page worth linking to. `/price-report` is that page: one URL
for good, rebuilt from the committed data every release (`src/lib/market-report.ts`, pure, tested), so nobody writes
it. It says how often a US store undercuts TCGplayer's market price on cards from $5 and sealed from $10 (USD against
USD, never converted), lists the most valuable sealed products a US store has in stock (cases left out: almost none
are stocked), counts products in stock per market, shows the 30-day movers (7-day until a month of history exists) and
ends with a citation line. `revalidate = 86400`, in the sitemap and footer. The daily outreach task offers it to
writers and creators.

## 2026-11-02 — Black Friday page

`/black-friday` lists today's in-stock US store prices 8–60% under TCGplayer's market price (the same
`deals()` as the homepage and Deal Finder, stores only: eBay and Amazon rows are left out), sealed first, then cards, one row per product. One URL kept
every year so links and rankings carry over; it must be indexed weeks before the day (27 November 2026),
so it ships now. The homepage links it from 1 November to a week after Cyber Monday; the footer and
sitemap always do. Never a "was" price, a countdown, "ends soon" or an invented sale: we only know what a
store asked when we last read it. Dates and the split are pure (`src/lib/black-friday.ts`, tests in
`tests/black-friday.test.ts`). Part of the passive-growth plan (owner, 2026-11-02: no daily Reddit posts).

## 2026-11-02 — Free price widgets

`/embed/card/<slug>` is a live price badge any blog, deck guide or store can put in an `<iframe>`: the cheapest in-stock
store price in the chosen market (`?market=`, US by default; never TCGplayer, eBay, Amazon or a pre-order), else
TCGplayer's market price labelled as such. `/embed` lists the snippet (the iframe plus one plain text link, the only
part search engines credit) and a plain-HTML badge for the stores we compare. The daily outreach offers the widget
instead of asking for a link (owner, 2026-11-02: growth must be passive). The badge is a route handler reading only
`src/lib/data.ts`, noindex, cached a day by its CDN header; a missing slug answers 404 with a 5-minute cache.
RiftCompare has had the same widgets since 2026-09.

## 2026-11-02 — The monitor reports to Empire HQ; only red mails

The owner asked for one Monday email instead of a mail per site (the control tower, approved 2026-11-02). The ops
monitor now writes every result to `ops-status.json`, and its workflow force-pushes it as `status.json`, one orphan
commit, to this repo's public `ops-status` branch (never deployed, `vercel.json`). RiftCompare's ops monitor reads it
every three hours for Empire HQ (riftcompare.com/admin/hq) and the one Monday report, and mails the owner itself if
the file goes quiet for a day (a stopped monitor cannot mail). Only a FAILED check fails the run, which is GitHub's
email to the owner; warnings wait for HQ and Monday. The file carries status and the monitor's own sentences only,
the same as the public Actions log.


## 2026-11-02 — An announced set with written copy gets its pre-order page before any store lists it

`/preorders/<slug>` already built itself for every upcoming set with a sealed product. The gap was the months between
an announcement and the first store listing, when "<set> pre-order" is already searched: Gundam's GD07 Blazing Fist
had copy in `src/content/preorders.ts` but no page. `preorderSets` now takes a `curated` test, and `preorderSetList`
passes "has an entry in `PREORDER_COPY.sets`": such a set has its page while upcoming even with nothing sealed, saying
plainly that no store lists it yet. Promo groups and placeholders have no copy, so they still need a sealed product.
The header strip ("pre-orders are open") still waits for a real listing. Engine change, the same in all four repos.

## 2026-11-02 — Seasonal sale pages

`/boxing-day`, `/january-sales` and `/lunar-new-year` (owner-approved growth plan, 2026-11-02): one URL
each, kept every year like `/black-friday`, built weeks ahead so Google has indexed them before the day.
Dates, the year a page is about (it rolls over a week after the event) and the homepage window are pure
in `src/lib/sale-seasons.ts` (tests in `tests/sale-seasons.test.ts`); Lunar New Year is a published-date
table to 2040 (6 February 2027). The site covers several countries, so no page reads as one country's:
the opening sentence names every market we have stores in, and the page has one section per market,
in that market's own currency, never converted. Each section lists `storeDealsIn(market)`: the cheapest
in-stock store at least 10% (and at most 45%: past that it is likelier a wrong match than a sale) under
the median of three or more stores there, stores only; the US section also keeps the Black Friday
page's under-TCGplayer `deals()`. Never a "was" price, a countdown or an invented sale. The footer and
sitemap always link them; the homepage only from a few weeks before each event to two days after.

## 2026-11-02 — Price alerts through RiftCompare's shared service

The owner chose "Yes, one shared service" for email price alerts on the sister sites. This reverses part of
"No accounts, no database, no email" (2026-10-25): the site still has no accounts, no database and no mail key, but
the card page now has an "Email me when the price drops" form.

- **The form** (`components/PriceAlertForm.tsx`, the same file on every sister site; `PriceAlert.tsx` picks the
  visitor's market) posts `{site, productId, region, email, targetCents}` straight to
  `https://riftcompare.com/api/sister-alerts`. RiftCompare keeps the address (its own Neon project, private tables),
  sends one confirmation email (double opt-in), then checks daily. This site stores nothing and holds no key.
- **The prices** come from this site's own static `/alert-feed.json` (`lib/alert-feed.ts`), built with each deploy
  from the same files the pages read: per product, the lowest in-stock store or TCGplayer offer in each market, in
  that market's currency, never eBay, never converted; plus up to five of the site's own deals (store price under
  TCGplayer market) that another card site's alert email may end with. Served from the CDN (`revalidate` 86400),
  so it costs no function call.
- **Behind `SITE.priceAlerts`** (on for Gundam, Lorcana, YGO and Cyberpunk); the site's `key` must be registered in
  RiftCompare's `lib/sister-alerts/sites.ts`. The privacy page says what the form sends and links to RiftCompare's.
- RiftCompare's `sister-alerts.yml` fails (and its ops monitor reports it) when a site with alerts serves no fresh
  feed, so a broken feed here shows up there.

## Share buttons and shared lists (2026-11-02)

The owner wants word of mouth to drive growth. Every card and sealed page and
the quick view get a Share button (`components/ShareButton.tsx`): the phone's
own share sheet, else the link copied, no pop-up, no reward, no account. The
message names the real price gap in the visitor's market (`priceGap` in
`lib/share.ts`: cheapest and dearest in-stock item price from two different
sellers, never converted). The card page's share image
(`card/[slug]/opengraph-image.tsx`) draws the same gap for the US, the page's
baseline market; it is drawn on first request and kept a day (empty
`generateStaticParams`), so only cards someone shares cost a render.

Best Basket results get "Share this list": `/list?i=<id>*<qty>.<id>…` carries
the list in the URL (nothing stored), and `/list` is one static, noindex shell
that prices it in the visitor's market through `/api/basket`.

Every shared link carries `utm_source=share&utm_medium=<card|sealed|list>`.
The button sends a Vercel `share` event and `ShareArrival` one `share_visit`
event per tab when a shared link brings someone; RiftCompare's growth report
counts both per site. robots.txt allows `/*utm_source=share` (it blocks other
query strings) because X's and Reddit's preview fetchers obey robots.txt.

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
- Engine: the footer carries the exact statement and trademark line; the quick view API sends no Amazon
  search; the Amazon row's button says "Check price" (not "View deal"); /go answers `no-store`.

## 2026-11-02 — Affiliates: the family's shared EPN campaign and TCGplayer link

Owner, 2026-11-02: Cyberpunk Compare uses the affiliate campaigns we already
have. eBay links carry EPN campaign 5339155912 (every Compare site's, from
RiftCompare's account) and TCGplayer links go through RiftCompare's Impact link
(`src/lib/affiliate.ts`, engine); the `cyberpunk-` prefix in `customid` /
`subId1` splits the earnings. The Impact site-verification meta copied from
YGO Compare is removed (it was YGO's), and the Chrome setup prompt has no
affiliate step. The eBay API keyset stays Cyberpunk's own (2026-11-01); the
affiliate campaign is not an API key.

## 2026-11-02 — Region switcher in the hero, with drawn flags

Owner: "the region switcher must be more prevalent on all sites, on the main home page hero, and have the
flags as well". The homepage hero now has a "Prices for" row of every region (flag + name, code on phones;
`MarketChooser`), the header menu shows the flag and code of the region in use (a native select laid
invisibly over them, so it stays keyboard- and screen-reader-friendly), and the price table's region pills
carry flags.

- **Flags are inline SVG (`src/components/Flag.tsx`), not emoji and not image files.** Windows draws a flag
  emoji as two letters ("US"), and image files would be new requests and hosting. No ids or clip paths, so
  a flag works inside a closed menu and many times on a page. The same file is in every Compare Empire
  repo that has a region switcher; keep the copies identical.
- Wording stays region-neutral: "Prices for", "Choose your region", never one country's spelling or name.

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

## 2026-11-02 — 69 stores from the official Cyberpunk TCG store locator

Owner, 2026-11-02: "we need way more stores … 25+ per region, 200+ total". The
official locator (cyberpunktcg.com/stores, 4,392 signed-up stores; its public
`api.netdeck.gg/api/cyberpunk/retailers/stores` search, read from a runner with
our own user agent) gave 2,269 store websites in our markets. `probe-stores.ts`
(now skipping stores already listed) found 113 with a readable Shopify
Cyberpunk collection; every one shows a contact page and a refund policy, none
is on the banned list, and being in the official locator is the "known to
other buyers" sign (TCGEmpire docs/store-vetting.md). A trial import kept only
the 69 whose listings our matcher actually matched; the other 44 held only
Cyberpunk RED RPG, Combat Zone miniatures or merch. Singapore stays at one
store: of the locator's 24 Singapore stores, one has an online shop we can read
and it has no Cyberpunk collection.

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
## 2026-11-03 — The daily Price Duel: a sharing loop, not another push

**Why.** Every growth lever so far (outreach, posts, hubs, widgets, Bluesky) adds a fixed number of
visitors, so traffic grows in a straight line. The share buttons shipped on 2026-11-02 were tapped 14 times
in their first week across all sites and brought 0 visits: nobody shares a price comparison. People share a
score. A daily puzzle that is the same for everyone (the Wordle loop) gives players something to paste into
Discord, group chats and Reddit every day, and each paste is the invitation for the next player.

**What.**
- `/daily`: ten pairs of cards, tap the one worth more at TCGplayer's US market price (`refCents`, never
  converted, never a store price). Puzzle #1 is 2026-11-03 (`DAILY_EPOCH`, never changed: shared results
  carry the number); a new one at midnight UTC.
- No function, no database, no extra build: the page is ISR (a day, like every tool page) and carries the
  next seven days' puzzles; the client picks today's by UTC date. Cards are chosen by a hash of (day, id), so
  a build that adds or drops a card leaves a day's pairs almost unchanged, and a pair's prices are 1.25 to 8
  times apart, so a day's price moves don't flip an answer. Cards under US$1 or over US$2,000 and token sets
  are left out (`src/lib/daily.ts`, `tests/daily.test.ts`).
- The share text is the number, the score, the emoji grid, the streak and the link with
  `utm_source=share&utm_medium=daily`; it names no price, so it spoils nothing. Progress and the streak live
  in localStorage only. Events: `daily_done { score }` and `share { medium: daily }`, read by RiftCompare's
  growth report like every other share.
- Measure: share taps and share visits with medium `daily` in the weekly growth report. Drop it if it brings
  nothing in four weeks.

## 2026-11-03 — The Price Duel as a widget

**Why.** The growth plan's fourth loop: a widget on a creator's or club's page shows our name to their audience,
so it grows with their traffic. Creators want something that changes daily more than a static price badge.

**What.** `/embed/daily` is a script-free HTML widget: today's puzzle number and first pair (art and names,
prices hidden) and one link to `/daily?utm_source=embed&utm_medium=daily`. A route handler reading the date, so
its only cache is the CDN header, held until midnight UTC (`secondsToUtcMidnight`). It reads the same pool as
`/daily` (`src/lib/daily-data.ts`). The snippet is on `/embed` with the iframe and one plain text link.

## 2026-11-03 — The quick view shows the product's own link

**Why.** Owner: "quickview popup should have a link change as well for all sites, instead of using the same link". The
pop-up kept the list page's URL, so a copied or bookmarked link lost the product, and Back left the page instead of
closing the pop-up.

**What.** Opening a quick view pushes the product page's own existing URL (/card/<slug>) with `history.pushState`
(`src/lib/quick-view-url.ts`, the same file on every site). Back closes it and restores the list's URL, Forward reopens it,
closing it (×, Escape, the backdrop) steps back, so the history never fills with pop-ups. "See price history and details"
only hides the pop-up and navigates to the URL already shown, which Next turns into a replace: Back from the product page
goes to the list. The entry copies Next's own history state (`__NA` and the router tree), so the app router passes the
push through and the page under the pop-up never re-renders.

**SEO.** No new URL exists: the link is the canonical product page, which a reload, a share or a crawler gets in full
server HTML. Never a `?view=` or `#` variant (duplicate URLs, extra CDN copies). Pinned by `tests/quick-view-url.test.ts`.
## 2026-11-03 SEO audit: alt text, homepage title brand, ItemLists (engine)

Bill's network SEO audit (homepages only) found empty `alt` on product photos on every engine site and no brand in
Cyberpunk's title ("Cyberpunk TCG Card Prices — Compare 160 Stores": the long game name pushed " | Cyberpunk Compare" past
60 characters, and `fitTitle` then took the bare title). Every product photo, search thumbnail, ad tile and the logo now
has descriptive `alt` (the name). The homepage title ladder tries every candidate WITH the brand before any without, so
Cyberpunk reads "Cyberpunk TCG Card Prices — 160 Stores | Cyberpunk Compare". The homepage lists its shelf and chase cards
as an ItemList and sealed hubs got one like set pages'. Already in place and kept: Product + AggregateOffer on card,
sealed and kit pages, BreadcrumbList on every deep page, Organization/WebSite/FAQPage on the homepage, llms.txt.
hreflang is deliberately absent: the market is picked in the browser on ONE URL per page, so there are no regional
alternates to declare. `tests/seo-audit.test.ts` pins it.

## 2026-11-03 Sealed hero on the homepage (engine option `homeSealedHero`)

Bill: "if sealed products are driving most of our sales on some of our websites then for those websites we must make it
a big part of the home page and attention grab". The growth report for the week to 2026-11-02 says which: YGO Compare
earned A$39.93, A$38.40 of it from `preorders_pinned` eBay (sealed pre-orders); DexCompare and MTG Compare are
sealed-only and already open on sealed; OP Compare's money came from the card quick view and RiftCompare's from cards
and pre-orders together, so neither changes. On YGO the homepage opened with card ad strips and showed sealed fourth.

`SITE.homeSealedHero` (off by default) puts `components/SealedHero.tsx` straight under a shortened title block (on a
phone the header already has search and market, so the hero's paragraph, market chips, search box and button row are
hidden there): the newest booster box as a spotlight with its photo, cheapest store price, a Buy button through `/go`
(`home_sealed_hero`, `home_sealed_preorder`) and a labelled "Ad" eBay line (`home_sealed_hero_ebay`), then six more
boxes and each set on pre-order with its boxes. It replaces the plain sealed shelf. Built by `lib/sealed-hero.ts` from
the same committed data (a few set shards, no new read on any other page), every market's prices sent and the
visitor's picked in the browser like every price island. Store prices only in their own currency; eBay, Amazon and
TCGplayer are never "the cheapest store". A saving is shown only when real: the cheapest store against the middle
in-stock store of that market (3+ stores, 5–45%), or in the US against TCGplayer's market price (3–45%).
`tests/sealed-hero.test.ts` pins it. On for YGO and Cyberpunk (a sealed-first launch); Gundam and Lorcana have no
affiliate sales yet to say either way, so they keep the shelf. Judge it by `home_sealed_*` tags in the growth report.

## Rate us and "What people say", run by RiftCompare (2026-11-03)

Engine change, in all four repos. The owner wanted RiftCompare's rating pop-up on every site, each site's reviews public, and
every written review approved in RiftCompare's admin; star ratings count at once. The site stores nothing: the corner card
(`components/site-reviews/RateCard.tsx`, in the root layout) posts cross-origin to `https://riftcompare.com/api/site-reviews`
(keyed by `SITE.key`, which must be on RiftCompare's list), and the homepage's "What people say" reads the score and approved
reviews from `https://riftcompare.com/api/site-reviews/<key>` in the browser (public JSON, CDN six hours): no function, no data
read, no build step. The card copies RiftCompare's corner card, not its rating drive: never on arrival, after 4 pages and 3
minutes or on return from a store tab, at most three times 14 days apart, always closable; "Rate us" in the footer opens it.
While no ad script is on the page it says "We don't run banner ads, so if this helped, please leave us a review." (owner, same
day). No email asked for, never review markup. RiftCompare's DECISIONS.md, "Every site's reviews, approved in one queue".
