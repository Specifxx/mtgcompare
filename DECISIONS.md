# Decisions

Non-obvious choices, newest at the bottom.

## 2026-10-03 — A purpose-built port, not a fork of RiftCompare

The owner asked for "an identical website except everything is One Piece".
RiftCompare is ~880 source files, most of them Riftbound-specific (domains,
champions, runes, Riftle, the blog and guides, Riot's card formats), wired to
two rotating Neon projects. Forking it and renaming would have carried all of
that into a game it does not describe. Instead OP Compare reproduces the
*experience* — the side rail and header, the market switcher, the card database
with filters, the card page's cheapest-first board, sets, sealed, price guide,
movers, index, deal finder, stores, watchlist — on a smaller codebase built for
One Piece's data, and copies RiftCompare's rules verbatim where they are about
running the site rather than about Riftbound: the deploy gate, the egress rules,
"understated, never wrong" matching, affiliate tagging, FX references marked ≈.

## 2026-10-03 — TCGplayer via TCGCSV is the catalogue

TCGCSV mirrors TCGplayer's One Piece category (68) daily as one static JSON per
group: 87 groups, ~7,300 card printings and ~420 sealed products with card
number, rarity, colour, cost, power, counter, life, attribute, types and card
text. It is the source RiftCompare's Pokémon section uses, needs no key, and an
entire import of it takes seconds. A Card row is ONE TCGplayer product, i.e. one
printing; ids are TCGplayer's.

## 2026-10-03 — No eBay API at all

The Browse API allows 5,000 calls a day for the owner's app and RiftCompare uses
most of them. OP Compare shows eBay only as a tagged search link on the
visitor's own eBay (`ebaySearchUrl`), which costs no quota, and a test fails if
any API host or credential appears in the code.

Superseded by "2026-10-03 — eBay Browse API with OP Compare's own keyset" (below):
OP Compare now has its own eBay application and quota.

## 2026-10-03 — Printings are told apart by tokens, event stamps and set

TCGplayer names a printing with parenthesised tokens ("(Parallel)", "(Manga)",
"(SP)", "[Winner]"). Event groups (Pre-Release, Release Event, Anniversary
Tournament) list stamped reprints under the SAME name and number as the main
set card, so the importer adds the stamp as a token ("Release Event"); without
it 1,500 number+name pairs were ambiguous and a store's "Curiel OP16-004" could
not be placed. Premium Booster and Demo Deck reprints are told apart by their
SET instead: the matcher prefers the set a title names, then the card number's
home set. Ambiguity left after that is skipped.

## 2026-10-03 — A second match path: TCGplayer's exact name + set

BinderPOS-style stores title singles exactly as TCGplayer does, with the set in
place of the number ("Arlong (Alternate Art) [A Fist of Divine Speed]"). Exact
name + set is as unambiguous as a number, and it took one Canadian store from
1,179 matched cards to 4,429. It is a strict lookup — any name+set pair that
names two products is dropped.

## 2026-10-03 — Stores

The first registry was the 114 RiftCompare stores that also list One Piece
singles with card numbers (probed 2026-10-03: ≥20 numbered One Piece listings on
the first page of their One Piece collections). The owner pointed out One Piece
needs its own stores, so 121 One Piece specialists and large One Piece retailers,
found by search and through regional store directories and verified the same
way (English, ungraded, numbered, priced in the market's currency), were added
on top: 235 stores — US 73, CA 57, AU 50, UK 30, EU 24, SG 1. Only Shopify
stores are read (that is the scraper). Stores were left out when their One
Piece stock is Japanese or French behind English titles, when their singles
are graded slabs, or when they charge a currency other than their market's.

Singapore stays thin on purpose. Its One Piece shops mostly sell Japanese
cards, or sell through Instagram and Carousell, or don't run Shopify, so SG
visitors get TCGplayer's price as the ≈ reference and an eBay search link. The
big non-Shopify retailers (TCGplayer's own marketplace aside: Troll and Toad,
CoolStuffInc, Chaos Cards, Magic Madhouse, Cardmarket and others) would each
need a scraper of their own.

## 2026-10-03 — Cardmarket is not an EU source (yet)

Cardmarket's public price files carry no card numbers, and One Piece has many
same-name printings (a card, its Parallel, its Manga, its SP, its event stamps),
so name-only matching would price the wrong printing. RiftCompare's written
permission to use the files was also asked for Riftbound. EU prices come from
eurozone stores; TCGplayer's market price is the ≈ reference.

## 2026-10-03 — Box value, not box EV

Bandai does not publish pull rates. An expected-value number built on guessed
odds would look precise and not be, so `/tools/box-value` puts the box price
beside the set's card value and how concentrated it is — facts a buyer can check.

## 2026-10-03 — Price history starts with the first import

TCGCSV's daily price archive answered 403 from here, so there is no backfill:
history, weekly movers and the index start on the first import, and those pages
say when they will fill in.

## 2026-10-03 — Blog posts are computed, not typed

The owner wants an SEO blog like RiftCompare's. Every post here is a function of
the price database: tables, counts, medians and the sentences that quote them
are built when the page renders (`src/lib/blog/posts/`), and a sentence that
needs a fact prints only when the fact exists. That keeps posts accurate as
prices move and avoids publishing hand-typed figures nobody has checked.
Explanations of the game stay to what the cards and TCGplayer's catalogue show.

## 2026-10-03 — Analytics and search engines

GA4 needs its own property (`NEXT_PUBLIC_GA_ID`; nothing renders without it),
with Consent Mode defaults that deny storage in the EEA/UK/CH. Search Console
reuses RiftCompare's service account (`GSC_SA_KEY`) on a new property; a daily
workflow submits the sitemap and reports indexing. IndexNow reuses
RiftCompare's public key (keys are verified per host). Social-media marketing
was explicitly left out.

## 2026-10-03 — The domain is opcompare.app, and the code defaults to it

The owner's domain is `opcompare.app`. It is the default `SITE_URL` in
`src/lib/site.ts` and in every workflow (`vars.SITE_URL || 'https://opcompare.app'`,
`GSC_PROPERTY` defaulting to `sc-domain:opcompare.app`), so a missing or
mistyped variable can never publish canonical URLs, the sitemap or JSON-LD on
another host. The env vars still override it. The apex is canonical and
`next.config.js` redirects `www.opcompare.app` to it whatever the Vercel domain
settings say. `.app` is on the HSTS preload list, so the site exists only over
HTTPS. Vercel's automatic certificate covers that.

## 2026-10-03 — A title that names another printing rules the plain one out

The matcher asked a title for the words a printing's tag carries, but never
the reverse, so a title naming a printing TCGplayer doesn't list fell through
to the plain card: "Koala (3rd Anniversary Stamp) OP13-081", "Rayleigh
(OP14-108) - Unnumbered Promos", "Boa Marigold [OP07 PRE …] Pre-Release Cards"
and "Baby 5 (OP04-032) (V.2) PRB01" were all priced as the base print. Now a
title's stamp, promo, event and reprint words (`PRINTING_WORDS` in
`src/lib/match.ts`) must also appear in the printing's name, tag or set, a
"(V.2)" is never the plain print, and a PRB code names that Premium Booster. A
Premium Booster title with no printing words means the booster's "(Reprint)".
Replayed over the 328k listings then stored, 99.5% were unchanged, 967 moved to
the printing their title names (mostly PRB reprints and Pre-Release / Super
Pre-Release / Anniversary stamps) and 758 that name a printing TCGplayer doesn't
list are skipped. "(Non-English)" titles are now foreign.

## 2026-10-03 — The set a title names decides; aliases are names (review fixes)

A correctness review replayed every stored offer and found:

- **Mangas:** TCGplayer writes the original-set Mangas "(Alternate Art) (Manga)"
  and the Premium Booster ones "(Manga)". So a store's "Zoro OP06-118 Manga
  Rare" fitted only the PRB-01 print and put OP06 listings on a €2,000 PRB page.
  "Manga" now implies the alternate art on both sides, and the set decides.
- **Named sets:** when a title names a set (by code, with an event suffix like
  "OP03 PRE", or by name) that holds a printing of the card, only printings in
  a named set fit. With no printing words, the named set's "(Reprint)" is the
  printing. "[ST-27-OP09-083]" is the ST-27 reprint, not OP09's card.
- **Untagged strays:** a single plain fit outside the number's own set, in a
  set the title doesn't name, is skipped when the number has other printings.
  ("Monkey.D.Luffy (P-001)" is not the Demo Deck card.)
- **Phrases:** "Red Super Alternate Art" and "Super Leader Alternate Art" are
  keys, and a title must say each as one phrase. A stray "Red" (colour) or
  "Leader" (type) no longer picks a $1,700 printing.
- **Slabs and accessories:** TAG/AGS slabs are graded. Acrylic, magnetic and
  protector cases are accessories. A booster case must be written as a case
  ("Booster Box Case", "Case (12 Boxes)"), so "Booster Box (Case Fresh)" is a
  box and an acrylic box case is never a $25 "Booster Case".
- **Aliases:** "(Galdino)", "(Zala)", "(Grandma Nyon)", "(Navy)" and 30-odd
  more character aliases were read as printing tags, which made base cards
  "promos". `foldNameAliases` puts them back in the name. It only folds a token
  that every printing of the number in its own set carries and that stands
  alone on one of them, so "(Box Topper)" beside its untagged twin stays a
  tag. 97 printings change.
- `/market`'s index loaded the OLDEST 730 days, so it would have frozen after
  two years. 401 Games failed every run on a 5,300-product collection past the
  20-page cap; the cap is now 30 pages.

## 2026-10-03 — Plus & Premium: RiftCompare's model, minus the trial

The owner wants subscriptions "similar to RiftCompare", especially for Deal
Finder. Ported as-is:

- **Sign-in:** Google and Discord OAuth only, with a JWT cookie.
- **Tiers and prices:** Plus $2.99/mo or $23.99/yr; Premium $4.99/mo or
  $39.99/yr.
- **Stripe:** hosted Checkout, the webhook (six events, both payload
  generations, extend-only, `past_due` never entitles), the billing portal, a
  daily reconcile, and no Stripe calls on page loads.
- **Deal Finder:** gated in the query. Signed out sees nothing, a free account
  sees the top 3, a member sees everything.
- **Ad-free:** Plus and Premium hide every `[data-ad-placement]`.

What differs:

- **Premium's tool.** It is the Buy List Planner, RiftCompare's Best Basket
  idea: the cheapest single store and cheapest split for the watchlist, per
  market. OP Compare has no deck watch or demand finder to sell.
- **No paid trial or intro offer.** RiftCompare's $1-for-30-days trial is only
  honest with its trial-ending reminder emails, and OP Compare sends no email.
  The trial is the first thing to add once there is a mailer.
- **Prices live in one place.** They live in `src/lib/plans.ts`, and
  `scripts/stripe-setup.ts` creates the Stripe Prices from that table with
  lookup keys, so there are no price-id env vars to drift. Each Price carries
  `site=opcompare` and its tier, so a plan switch in the portal re-reads the
  tier and an old Price keeps its own.
- **Its own Stripe account.** RiftCompare's reconcile matches every
  subscription in its account by email. An OP Compare subscriber in that account
  who also has a RiftCompare login would be granted RiftCompare Premium. OP
  Compare also ignores any subscription not marked `site=opcompare`, and never
  matches by email.
- **The watchlist stays in the browser** for everyone, so there are no free
  limits to enforce.

## 2026-10-03 — History lives in GitHub, not in a history database

RiftCompare keeps price history in a second Neon project whose transfer
allowance it keeps exhausting. The owner wants OP Compare's public history in
GitHub instead. The import now writes it as JSON (`src/lib/history.ts`):

- one append-only file per day,
- 256 bucket files with each product's last two years (what a chart reads),
- `index.json`.

The import workflow commits these to the `data` branch of the public repo with
its own token. The 7/30-day changes and 90-day high are computed from the files
and stored on the Card rows.

Pages fetch the files from raw.githubusercontent.com, pinned to the commit the
import recorded (`Meta.historyRef`). A pinned URL never changes, so the fetch
cache keeps each file for a month, and GitHub's CDN lag on branch names can't
cache a stale file. Postgres keeps only today's prices: no `PriceDay` or
`IndexDay`, and no second database. The `data` branch carries a `vercel.json`
with deployments off, and main's `vercel.json` repeats it, so history pushes
never trigger a Vercel build. The files are also open data, linked from
/methodology.

## 2026-10-03 — Admin: RiftCompare's tools that fit, and mastermisclick@gmail.com as admin

The owner asked for admin features "the same" as RiftCompare's, with
`mastermisclick@gmail.com` flagged as an admin. Ported what OP Compare has data
for: `/admin` (home counts), `/admin/accounts` (search, sign-ups, CSV, manual
grant/revoke, "sync with Stripe now"), `/admin/subscriptions` (metrics for
`site=opcompare` subscriptions only), `/admin/store-health` and `/admin/inbox`
(price reports, store suggestions, feedback, contact), plus the public forms
that feed the inbox.

- **Who is an admin.** `SessionUser.isAdmin` = `User.isAdmin` or
  `isAdminEmail()`. `src/lib/admin-emails.ts` has `mastermisclick@gmail.com`
  built in, so a fresh deploy with no env var already works, and the address
  isn't something a Vercel typo can lose. `ADMIN_EMAILS` REPLACES the default
  when set (`ADMIN_EMAILS=""` removes every address-based admin), so a set
  value must include the owner's address. Read per call, not at module load.
- **One gate, fail closed.** `requireAdminPage()` / `requireAdminApi()` in
  `src/lib/admin.ts` are the only checks, called first by every page and route;
  `tests/admin.test.ts` walks the tree to prove it. Pages answer outsiders with
  the site's ordinary 404 (and empty metadata, so the title doesn't name the
  area); APIs answer 401/403. Session mutations are POST, same-origin
  (canonical origin only in production, plus `ADMIN_EXTRA_ORIGINS`) and JSON,
  and every one is logged with `adminLog`.
- **`ADMIN_TOKEN` is for scripts, header-only.** RiftCompare's `?key=` links put
  a long-lived secret in URLs, history, logs and Referer, and its two gates
  disagreeing caused bugs. Here the token is accepted only as
  `Authorization: Bearer`, needs 32+ characters, and is unset by default.
- **`/admin` is disallowed in robots,** unlike RiftCompare (which feared a
  Disallow hides the noindex and advertises the path). Outsiders get a 404,
  which is never indexed anyway; the path is guessable; and OP Compare already
  disallows `/account`. Admin pages are also noindex (meta and
  `X-Robots-Tag`), never in the sitemap, and send no GA page views.
- **Uncached reads in `src/lib/admin*.ts`.** Owner-only traffic; no
  `unstable_cache`, nothing under `src/app` imports `@/lib/db`.
- **Store health from `ImportRun.summary`.** The per-store results the import
  already records are the history; no snapshot table, no new cron. The same
  pure rules (`src/lib/store-health.ts`) print a report as a step of every
  *Import prices* run (never failing it).
- **Manual grant and revoke amend the entitlement-writer rule.** Besides the
  webhook and the reconcile, `src/lib/admin-billing.ts` may write
  `premiumUntil`, from an admin session only and audited. A grant only extends;
  a revoke is the one explicit exception to extend-only. Neither calls Stripe,
  so a live subscription re-grants itself, and the UI says so.
  `ADMIN_GRANTS` switches both off if the owner wants.
- **The inbox stores no IP and sends no email.** Rate limits key on a salted
  hash of the IP (or the account), never stored; there is no FK to `User` and
  an email only on contact messages. OP Compare has no mailer, so no copy
  promises a reply.

Skipped, and why: `?key=` admin links (above); delete-any moderation (no user
content beyond the inbox); tier floor (no grandfathered cohort); `/admin/premium`
interest clicks, `/admin/clicks` (GA4 covers them); demand, rising snapshots and
`/rising/[token]` (no counters, and snapshots freeze eBay API data); price
alert, deck and free-limit re-derivation (those features don't exist); email
audiences, win-back, price-drop consoles, support tickets and "report fixed"
thank-yous (no email); the feedback Premium reward (a pricing call for the
owner); the public reviews strip and floating feedback widget (deferred); the
store-health snapshot table and Discord cron (the import step replaces it);
consulting, decks, loyalty and store-partner pages (no such product or data);
the `close-inbox-items` script (the admin UI covers it); zod (validation is
hand-written in `src/lib/inbox-rules.ts`).

## 2026-10-03 — Link thumbnails feature the price guide

The owner wants link thumbnails that are "very good featuring the website and
mainly the price guide", and the launch post goes to Reddit, which shows the
homepage's `og:image`. The old root image was an edge-runtime logo card, every
share image rendered in Noto Sans Regular (next/og's only bundled font, so every
bold weight was ignored), and the card image was never served.

- **The default image is the price guide.** `/` and every page without its own
  image show the lockup, "ONE PIECE PRICE GUIDE", "7,255 cards · 231 stores ·
  6 markets" and five real top cards: art, printing, cheapest US price
  (sorted, as on the page), TCGplayer market, number, and store count.
  `/price-guide` has its own file with the same composition, so it survives a
  change to the default. Sets get their own top five (or the release date
  when unpriced), sealed products the box on a white plate with its price,
  cards their art with printing, rarity and per-market prices, blog posts
  their title beside three hero cards.
- **Rows a reader would call wrong are filtered out.** Unfiltered, the top of
  the guide is a US$50,000 single listing and championship promos.
  `pickGuideRows` keeps $10+ standard/alt/manga/SP/treasure printings from
  booster, extra and premium sets with art, no serial/championship/judge/
  prerelease/stamp/signature variants, at least two US stores, and a cheapest
  price within 0.5–1.2× of market (tighter than the site's 1.5× outlier rule,
  because the first row is what a scroller sees), deduped by name; it relaxes step by step
  and draws the fallback below three rows.
- **STORES until the 7-day column means something.** History started
  2026-10-03, so a "7 DAYS" column would read 0.0% everywhere. The last column
  switches to 7-day change on its own once three of the five rows really moved.
- **Real data, cheaply, and never a 500.** Images read only the cached
  `src/lib/data.ts` loaders (`getCatalog`, `getSiteStats`, `getSealedCatalog`):
  no Offer query, nothing prewarmed. `runtime = "nodejs"`, `revalidate =
  21600`, a 6 h CDN header, US prices (an image has no visitor). Any error,
  empty database or unknown slug draws a data-free fallback with a one-minute
  cache, so a blip doesn't stick.
- **Metadata fixes.** Card and sealed pages set `openGraph.images`, which
  blocked their image files; pages now build `openGraph` with `pageOg()` /
  `pageOgOwnImage()` (`src/lib/og/meta.ts`). The root's `og:url` made every
  page claim to be the homepage on Facebook and LinkedIn; each page now sets
  its own canonical path. Share PNGs get `X-Robots-Tag: noindex`, as on
  RiftCompare.
- **Brand fonts bundled.** Luckiest Guy, Archivo 900, Inter 600/700 and
  JetBrains Mono 700 TTFs (OFL/Apache) in `src/lib/og/fonts/`, traced into
  every image function by `next.config.js`, with a magic-byte check and a Noto
  fallback. Layout keeps a safe area (nothing essential below ~575 px, where
  Reddit and X overlay the domain).

Skipped: share images for `/movers` and `/tools/deal-finder` (phase 2, once a
week of history exists, about 2026-10-10), `/premium`, `/stores` and `/market`
(the default fits for now); per-card alt text; a `scripts/render-og.tsx`
renderer script. Known limits: TCGplayer serves "SAMPLE"-watermarked art for
recent sets (the site shows the same), and platforms cache thumbnails
themselves (Reddit forever per post), so check the live image before posting.

## 2026-10-03 — eBay Browse API with OP Compare's own keyset (reverses 'No eBay API at all')

The owner: "I'm planning to create a new eBay API for opcompare so when that
variable is set we have a new 5000 API quota which we can split by region and
allocate based on card price like riftcompare".

- **A separate eBay application.** Browse quota is per application, so OP
  Compare's own app has its own 5,000 calls a day and nothing is shared with
  RiftCompare. The secret names are RiftCompare's (`EBAY_CLIENT_ID`,
  `EBAY_CLIENT_SECRET`) but live only as GitHub secrets on `Specifxx/OpCompare`.
  Pasting RiftCompare's keys would fail silently, so each run compares eBay's
  used count with our own last-24h spend and warns ("another app is spending
  this keyset") when the gap exceeds 300. Everything is off — a green no-op —
  until both secrets exist; keys set but refused fail the run red after zero
  Browse calls, so a revoked keyset can't hide behind green runs.
- **Budget.** Each run spends `min(EBAY_MAX_CALLS = 2200, liveRemaining −
  EBAY_QUOTA_RESERVE = 600)`; two runs (05:37, 17:37 UTC) is at most 4,400 a
  day, leaving the reserve whatever time eBay's day resets — when the live
  count was read. When it can't be (Developer Analytics fails), the run
  assumes `dailyLimit − our own last-24h spend` remains (see "eBay pass review
  fixes" below), so a third run in one eBay day can't pass the limit either. `spendable` starts
  at 0 (RiftCompare's `Infinity` left un-primed callers unmetered). Numeric
  variables go through `envInt`, so an empty GitHub variable is unset, not 0.
- **Value tiers and floors.** TCGplayer's market price decides: singles of
  US$100+ every 24h, singles from US$20 (US$50 in the EU) every 48h, sealed of
  US$30+ every 48h (kinds `matchSealedTitle` can recognise, never loose packs),
  unpriced products only in a 60-day launch window. RiftCompare's US$5 floor
  would cost ~2,490 calls a day per market. Modelled (×1.25 retry for singles):
  US/UK/AU 910 + 120 sealed each, EU 654 + 120, CA 120 sealed, SG 0 — 3,984 a
  day against 4,400 spendable (`tests/ebay-plan.test.ts` pins it; re-counted
  from the OP Compare database: 388 / 409 + 199 / 76 unpriced / ~140 sealed).
- **Region split.** Fixed shares of each run: US 26%, UK 26%, AU 26%, EU (eBay
  Spain; no pan-EU marketplace) 19%, CA 3%. A market's unused share spills to
  the next-highest-priority pairs anywhere, and the market execution order
  rotates daily so no market is always last when eBay's count runs out.
- **Per-pair writes, not RiftCompare's wholesale replace.** A completed search
  upserts (match) or deletes (no match) that pair's `Offer` row and stamps
  `EbayCheck`; anything else touches nothing, so the pair stays due. A run cut
  short can't remove a live price, which is why ~90% of the quota can be
  planned (RiftCompare needs half its quota as headroom because a truncated
  market is discarded). The alarm is S2 slipping past 60h; the fix is a higher
  `EBAY_MIN_VALUE_CENTS`.
- **CA derived, SG 0%.** A native EBAY_CA singles programme would cost ~910 a
  day; CA singles copy the US listing (`ebay_us`, converted to CAD, postage
  unknown) only when the seller is in the US or Canada. EPN has no Singapore
  programme, so SG keeps its search link.
- **Wider seller-location filter than RiftCompare's.** CN, HK, TW, KR and JP
  sellers are rejected: Japanese One Piece dominates eBay and is often titled in
  English. Count the English listings this costs on the first runs.
- **Matching.** Identity is `matchCardTitle` over the FULL index (or
  `matchSealedTitle`), then plausibility, then RiftCompare's cheap-outlier prune;
  the eBay-only filters (junk words, number ranges, sealed words on a single
  unless its own printing or set names them — Judge Pack, Box Topper, Premium
  Booster) live in `ebay-match.ts`. Queries are the number and one name word,
  with a server-side price floor 5% under our plausibility floor in the market
  currency.
- **Aggregation and UI.** `low<M>` includes eBay; `stores<M>`, homepage stats,
  the Buy List Planner and "hot store" inbox flags don't. A stale eBay row is
  dropped, not shown as sold out. eBay rows rank by item price among the stores,
  with an eBay button, the postage eBay states ("postage at checkout" when
  unknown, never "delivered") and the EPN tag `oc-<mkt>-ebay-<page>-product`.
- **History step.** `lowUS` in the history series steps down on the day eBay
  starts, as RiftCompare's did.
- **Setup order.** The schema sync (`Offer.shippingCents`, `EbayCheck`) runs
  by hand before the release that carries this code: the card and sealed
  loaders select the new column even with eBay off, and only the store import
  syncs the schema while the eBay workflow is gated off. The Marketplace
  Account Deletion route ships first; its two Vercel variables must be set
  before the release that carries it; then the eBay app, its notification
  test, the production keys as GitHub secrets, and a `only_market=US
  max_calls=50` smoke run (docs/SETUP.md §6a). The route must stay deployed
  while the keyset exists.

## 2026-10-03 — eBay pass review fixes (before the keys exist)

A review of the eBay pass (the entry above) found ways to spend the quota for
nothing and ways to show a wrong price. Fixed before any key exists:

- **A failure breaker.** A search that fails without a 429 (4xx, 5xx,
  timeout, network) is charged and its pair stays due, so one broken thing (an
  outage, a keyset not approved for Browse, a filter eBay rejects) would have
  spent the whole 2,200-call budget twice a day on a green run. Ten failed
  searches in a row, or more than half of 50+, now stop the run, which goes
  red (`FailureBreaker`, `ebayRunVerdict` in `lib/ebay-plan.ts`). So does a run
  that spent calls and completed nothing.
- **Spend is always recorded.** A run that throws records `spent` too, and a
  running pass saves it every 100 pairs, so a timeout kill can't hide spend
  from the next run's foreign-spend check.
- **Bounds on the variables.** A negative `EBAY_QUOTA_RESERVE` is 0. An
  `EBAY_MAX_CALLS` above `(liveLimit − reserve) / 2` is lowered to it, so the
  first run after eBay's reset can't take the second run's share. With the
  live count unknown, the budget is `min(cap, dailyLimit − reserve − our
  last-24h spend)`: eBay's current day began less than 24h ago, so our spend
  in it is in that window. This can skip a run when Analytics fails right
  after two full runs; that is the safe direction.
- **Foreign spend is loud.** The warning is a GitHub `::warning` annotation,
  and such a run spends at most 50 calls. It still cannot fire before
  RiftCompare's own pass has spent that day.
- **The plan's real shape.** Simulated over two weeks, the 24h and 48h tiers
  settle into a 4-run cycle of 2,200 / 2,200 / 2,200 / ~800 modelled calls
  (`tests/ebay-plan.test.ts`, "steady state"). The daily average fits, but
  three runs in four plan exactly the cap, so if the real retry rate is above
  25% S1/S2/P1 pairs slip in those runs before the model says. Expected in
  week one; the alarm stays S2 past 60h.
- **Unpriced products need a reference.** With no TCGplayer market price, a
  launch-window product had no price guard at all: a US$3 "Orica" was the
  eBay price of an unpriced OP18 Manga. Now it is searched only when a non-eBay
  offer exists (the cheapest in any market, in USD — RiftCompare's
  `trustedRef`) at or above the tier's floor; that reference sets the server
  floor and the 0.3× (singles) / 0.5× (sealed) guard, and at least 3 listings
  must survive, with a head under half their median dropped.
- **Sibling sets.** A Premium Booster "Manga" or "Alternate Art" has the same
  printing keys as the original set's, so a title naming neither set went to
  the number's home set — and on eBay that is often the cheaper reprint
  (US$1,300 for a US$3,999 OP01-120 Manga). eBay titles must now name the
  target's set when a same-tag printing exists in another set. 53 of the 996
  searched singles are affected; their canonical titles still match.
- **Delivered price.** A US$4.50 item with US$25 postage was "Cheapest" at
  US$4.50. A listing is rejected when postage exceeds max(item price, US$15)
  or the delivered price fails the plausibility ceiling. On equal delivered
  prices, known postage wins.
- **eBay-only wording filters** (`lib/ebay-match.ts`; `match.ts` unchanged):
  country names (Japan, China, Korea, Thai), French (VF, FR, Version
  Française), fakes (Orica, Fan Art, Reproduction, Metal Card, Unofficial);
  slabs without a space or from other graders (PSA10, BGS9.5, ARS 10, ACE 10)
  and eBay's "Graded" condition; lots and quantities; "U Pick"/"Choose";
  damaged, creased, signed and misprinted copies. A word the product's own
  name, printing or set carries is allowed, which is what lets the 12 Wanted
  Posters match at all.
- **Never search what can't match.** A printing whose own canonical title
  ("One Piece {name} {number} ({printing}) {set} {code}") fails the eBay
  screen is skipped at plan time and counted in the log: the Japanese-version
  anniversary promos, Playmat/Binder/PSA Magazine promos and same-tag twins in
  one set (52 printings, ~200 calls a day across four markets).
- **Copy follows the data.** The eBay sentences on the methodology, home FAQ,
  about and editorial pages appear only after a successful eBay run in the
  last 3 days (`getSiteStats().ebayLive`), and the price board's only when it
  shows an eBay row. With no keys the site reads as it did before.
- **Workflow.** The gate is its own job outside the import's concurrency
  group, so an unconfigured run never enters it; the secrets are on the two
  steps that need them, not the job (`npm ci` never sees one).
- **Guards.** `tests/no-ebay-api.test.ts` also covers `svcs.`/`apiz.ebay.com`
  and `SECURITY-APPNAME`, and fails on any import of an eBay module from
  outside `src/lib/ebay*.ts` in any form (dynamic, re-export, require).

## 2026-10-03 — Store matching: SKU numbers, canonical set names, strict DON!!, and the store count

A coverage study replayed every product of today's 235 stores (473,810
listings, variant SKUs included) through the matcher and listed what it missed
and what it got wrong. Each fix below was measured on that replay before it was
adopted, each has its real titles in `tests/match.test.ts`, and none loosens a
rule: every new path still needs exactly one printing to fit.

- **SKU card numbers** (`skuCardNumber`, `matchCardBySku`). BinderPOS-style
  stores title singles "Shanks [Legacy of the Master]" and keep the number in
  the variant SKU ("OP12-007-EN-NF-1", "op17-105-Normal-707116"). A
  numberless title borrows it only when every SKU agrees on one number and no
  SKU is marked JP/CN/KR/FR, and the title must still pick one printing.
  Strict: a title ending in a `[Set]` the catalogue doesn't know is skipped,
  and the matched printing's set must canon-equal it. Without that, 7% of SKU
  matches were wrong ("Helmeppo [Starter Deck: Black Smoker]" priced as the
  OP card, "Blast Breath [Best Selection Vol.1]" as the plain ST04 print).
- **Canonical set names** (`canonSet`). Stores carry TCGplayer's older set
  names: "Starter Deck: Black Marshall.D.Teach", "… Release Event" without
  "Cards", "Super Pre-Release" first or last. The canonical form drops the
  "ST-nn:" prefix and the deck number, puts "super pre release" first and
  drops a trailing "cards"; the name path tries it as a fallback, and a
  title's trailing `[Set]` names a set when the canon forms agree (which also
  stops "Monkey.D.Luffy (ST21-001) [Starter Deck EX: Gear 5]" going to the
  Learn Together deck). A key naming two products is still no key.
- **Strict DON!!** (`matchDonTitle`). A DON!! title must name the set (code or
  name, the longest name winning: "Vol. 2" is PRB-02), say every word of the
  printing's TCGplayer name with Gold both ways, and say nothing the printing
  lacks: "(V.n)", Alternate Art, Manga, Special Foil, Double Pack, or a
  promo/event word. "DON!! Card (Alternate Art) - Romance Dawn" was the
  prototype's one wrong-printing pattern (OP01 has no plain AA DON!!); the
  reverse rule skips it. Exactly one printing must fit.
- **Smaller rules.** "Alternative Art"/"Alt. Art" is the alt key; Full Art
  against Alternate Art is decided by the phrase the title says (only when it
  says one of them, and a Parallel is never dropped); "Binder Set" is a promo,
  not a binder; "(OP07 Special)" and "Special Rare" are SP; a rarity glued to
  the number ("OP06-085UC") and a lone "(112)" beside one set code ("(OP17)")
  are numbers; "OP15 Release Event" is the RE set code.
- **Wrong prices fixed.** "OP08P" (a store's promo/stamp code), "Best
  Selection", "Box Topper" and "Extended Art" are printing words: a printing
  must say them too, so "Robson (OP08-013) OP08P" and "Izo (OP01-033)
  (Extended Art)" are no longer the plain card (~200 listings, now skipped). A
  "Dash Pack" single is not a Booster Pack. The PRB DON!! "<30% of market"
  drop is policy and stays.
- **One pipeline, truthful misses.** `matchStoreProduct` runs number → name →
  DON!! → SKU → sealed for the import and `scripts/probe-stores.ts` alike. A
  miss names the path that got furthest (`sealed-ambiguous`, `don-no-set`,
  `sku-unknown-set`, `name-unmatched`, `not-sealed`) instead of filing sealed
  and name-path misses under the card reason `no-number`, so admin store
  health shows what actually failed. `implausible-price` is unchanged.
- **`stores<M>` counts real stores only.** The aggregate counted every
  non-eBay row, TCGplayer included, while its comment said real stores, and
  the card and sealed pages counted eBay rows as stores. Now `stores<M>` is
  `store:` rows only and the pages count the same (`isStoreSource`). `low<M>`
  is still the cheapest listing of any source, so a tile, the booster-box
  table and the share images say nothing about stores when the low is
  TCGplayer's or eBay's ("Cheapest US listing" rather than "Cheapest of 0
  stores"). The homepage, the where-to-buy table and the share image's
  header count TCGplayer as one of the sellers we track, on purpose, and
  still do.

Measured on the replay (in-stock card printings priced per market, old → new):
US 6,112 → 6,269, AU 5,545 → 5,737, UK 3,651 → 3,845, CA 5,923 → 6,012,
EU 3,609 → 3,646; +672 (printing, market) pairs, of which 169 are over US$20,
203 US$5–20, 166 US$1–5, 130 under US$1. In-stock store offers 162.2k →
175.2k. 356 previously matched listings moved printing, all to the printing
the title names (mostly "Alternative Art" titles that had been priced as the
base card, older starter-deck names, Full Art vs Alternate Art and Dash Pack
singles); 251 were dropped, 199 of them "OPnnP" titles and the rest Best
Selection, Box Topper, Extended Art and Dash Pack listings.

A local full import with the old code and then the new (same stores, an hour
apart) priced in stock: US 6,112 → 6,269, AU 5,545 → 5,736, UK 3,651 →
3,846, CA 5,923 → 6,009, EU 3,609 → 3,646 printings; in-stock store offers
162.2k → 175.1k. With the new count, 703 US printings have a low (TCGplayer)
and no store: `storesUS` is 6,269 where it had read 6,969.

## 2026-10-03 — Plus/Premium surfaces at RiftCompare parity: dialog, header Pricing, nudges, beacons

The owner asked for full functional parity with RiftCompare and "pricing at the
very top". Ported, adapted to One Piece:

- **One dialog, opened from every wall.** `PlanProvider` (root layout) +
  `PlanDialog` + `PlanButton({surface, tier})`. The dialog opens on the LOWEST
  tier that unlocks the wall (Deal Finder: Plus; Buy List Planner: Premium),
  uses the shared `TierComparisonTable`, and its button follows the visitor:
  member → billing portal / tools; Stripe unconfigured → the same "Opening
  soon" /premium shows (unchanged owner state); signed out → `/login?next=
  /premium?go=<tier>-<interval>`, which PricingCards' existing `?go=` logic
  turns into checkout; signed in → the one checkout path (`startCheckout`,
  shared with PricingCards). `checkoutOpen` reaches the layout as
  `stripeEnabled()`, an environment read, never a session read: the root
  layout still never reads the session.
- **Pricing in the header from 400px**, hidden for members (the `oc_adfree`
  hint hides it at first paint, `useMe()` after). To fit, the header shows the
  hat mark without the wordmark below `sm` (390px already overflowed by 25px
  before this change), the right cluster's gap is 2px below `sm`, and the
  desktop links don't wrap. The rail's foot link and the phone menu's pinned
  link are hidden for members too; the avatar menu keeps its entry.
- **/premium:** pricing cards directly under a one-line H1, two columns at
  every width (both buttons in the first 390×844 screen), "Cancel anytime ·
  secure checkout by Stripe", the proof line (renders nothing until the Deal
  Finder track's `/api/premium/proof` answers with ≥ 5), a member view in
  place of the cards (subscription from `/api/premium/subscription`, read
  client-side so the page stays static), "What you get" from `PLAN_FEATURES`,
  the comparison table, a visible FAQ with FAQPage JSON-LD, and Product JSON-LD
  with one Offer per tier. Prices, features and trial policy untouched; no $1
  month, no price-rise banner.
- **Nudges: RiftCompare's rules, unchanged numbers** (`lib/nudge-gate.ts`,
  `nudge-timing.ts`, `nudge-runtime.ts`): the slide-in is for signed-in
  non-members only, while checkout is open, from the 3rd page view, on an
  account ≥ 48 h old (`/api/me` now returns `createdAt`), 12 s after
  eligibility at a quiet moment (no open dialog — `body[data-oc-dialog]` or any
  `[aria-modal=true]` —, no scrolling, no typing), once per session, 7-day
  snooze after a dismissal, 14 days after a click, never after two dismissals.
  Skipped on /login /premium /tools /watchlist /account /admin. The annual
  offer needs a monthly subscription ≥ 2 months old with the yearly Price set
  up. Signed-out visitors get only in-page `InlineSignupPrompt`s (card pages,
  /movers, /price-guide), never a corner card.
- **Switch to yearly** (`/api/premium/switch-to-annual`): same-origin POST,
  Stripe `subscriptions.update` to the tier's yearly lookup-key Price with
  `proration_behavior: "always_invoice"`. It never writes entitlement; the
  webhook/reconcile stamp the new period, extend-only, as for every change.
  503 with a plain message while Stripe isn't configured.
- **CardConversionCta promises only what OP does.** RiftCompare's says "we'll
  email you when it drops"; OP's watchlist is browser-only with no email, so
  the copy says the card joins the watchlist. No `PremiumNudgeCard` ("4 cards
  you watch are underpriced"): it needs a server-side watchlist.
- **Beacons are live, unlike RiftCompare's.** RiftCompare switched its click
  beacon off to save history-DB egress; OP's two tables (`ClickEvent`,
  `PremiumClick`) are one small insert per click into the operational DB and
  are read only by `/admin/clicks` and `/admin/premium` (uncached,
  `lib/admin-clicks.ts`). One global listener (`OutboundBeacon`) reports any
  `a[data-retailer]` click, so new shop links are counted without wiring.
  Rows hold the retailer key, page type, card/sealed slug, market and the
  account id if signed in — never an IP, URL or user agent. Both routes are
  rate-limited per hashed IP, validate against fixed patterns
  (`lib/click-event.ts`, `lib/nudge-surface.ts`) and always answer 204.
  Since "Fixes after the parity integration" below: same-origin only, and
  rows are kept 90 days (the import prunes them).

## 2026-10-03 — Plus/Premium review: Keep, yearly switch in the member card, no year billed to a leaver

A review of the Plus/Premium parity work against RiftCompare changed:

- **The member card on /premium gets RiftCompare's one-click actions.** A
  subscription set to end shows "Keep Plus/Premium" (`/api/premium/resume`:
  same-origin POST, clears `cancel_at_period_end`/`cancel_at`, charges nothing,
  never writes entitlement — the webhook does). An active monthly one with the
  yearly Price set up shows "Switch to yearly" (the existing
  `/api/premium/switch-to-annual`). RiftCompare's intro-coupon branch on Keep
  is not ported: OP Compare has no intro offer.
- **A year is never billed to someone who chose to leave.** The annual offer
  (`annualOfferEligible`) now needs an ACTIVE subscription that is not set to
  end, and `switch-to-annual` answers 409 for one that is. Before, a monthly
  member who had cancelled could be nudged into paying twelve months up front.
- **The annual nudge keeps its timer across navigation** (it depends on "past
  the 1st page", not the view count, as in RiftCompare), and skips /premium
  and /account, which carry the same switch in the page.
- **"Upgrade to Premium" for a Plus member only where it can work:** the
  member card shows it only for a Stripe subscription, and the dialog's Plus
  branch says "Plan changes open when subscriptions do" while Stripe is not
  configured, instead of a billing-portal button that can only fail.
- **/browse gets the signed-out InlineSignupPrompt** (RiftCompare has one on
  its card list), after the pagination; the card page's conversion box is
  hidden at first paint for a returning member (the `oc_adfree` hint).

## 2026-10-03 — Card QuickView and the card page's affiliate layout (RiftCompare parity)

The owner wants RiftCompare's interactions one to one. RiftCompare opens most
card taps in a QuickView popup, highlights eBay and TCGplayer directly under the
price comparison, and pins a buy bar on phones; OP Compare linked every card to
its page, showed TCGplayer's market price as one grey footer sentence with no
link, and sent the card-details TCGplayer link out untagged (no commission).

- **QuickView: one provider, one link component, one cached JSON.**
  `QuickViewProvider` is mounted in the root layout inside `CountryProvider`
  and reads no session and no cookie (the layout rule stands). Every card
  surface links through `CardQuickLink` (`CardTile`, `MoverList`, the price
  guide's rows and stats, set pages, `/cards/all`, the card page's related
  tiles): a real `/card/<slug>` href for crawlers, new tabs and modifier
  clicks; a plain left click opens the dialog; with no provider it is a link.
  Data comes from `GET /api/card/[slug]`, which reads only the self-cached
  `getCardDetail` (the card page's own loader — an open costs a Data Cache
  read, never a query) and is shaped by `quickViewPayload`
  (`src/lib/quick-view.ts`): every market's top five open rows, already
  affiliate-tagged on the server (the partner-id env vars never reach the
  browser), every market's eBay search and the TCGplayer link; ~10 KB, CDN
  10 minutes, market-independent so one response serves everyone and a market
  switch needs no second request. Hover/focus prefetches it.
- **The dialog has an address.** `history.pushState` puts `/card/<slug>` in
  the URL bar without navigating (Next 14.2 patches pushState and copies its
  own state in, so the page underneath is untouched): the link can be shared,
  Back closes, Forward reopens, and visiting the URL renders the full page.
  An open that arrives while a close's `history.back()` is still pending is
  queued until the popstate lands — otherwise that popstate would close the
  new dialog, the "open it again quickly and nothing happens" bug. Links
  inside the dialog are plain anchors (full loads), so no client navigation
  leaves a stray `/card/` entry; any other route change closes it.
- **`Dialog.tsx` (RiftCompare's ui/Dialog, ported)**: portal, refcounted scroll
  lock (with scrollbar-gutter compensation) and `body[data-oc-dialog]`,
  Escape closes the topmost layer only, Tab trap, focus returned to the
  opener, and a click on the empty space around the panel closes it
  (RiftCompare's backdrop sits under the centring wrapper and never got it).
- **Card page order, top to bottom** (RiftCompare's "Pushing eBay clicks"):
  phones get `CardTopBuy` (cheapest open listing + Buy) under the name; the
  board; the **eBay fallback block directly under the board** whenever the
  market has no eBay row ("Search eBay for <card>" in eBay blue, RiftCompare's
  copy, pre-release copy for an unreleased set), else the board's own "More
  listings on eBay" strip; then **`TcgMarketPrice`** ("TCGplayer market price
  · reference", local ≈ figure with the US$ beside it, "Check on TCGplayer →"
  through Impact) in place of the footer sentence; then **`EbayCardBanner`**,
  a card-contextual "Find <card> on eBay" house banner labelled Ad with
  `data-ad-placement`, so ad-free members never see it. The fallback and the
  TCGplayer block are buy paths, not ads, and stay for members. Sealed pages
  get the same fallback and TCGplayer block. A card from an unreleased set or
  with no listing in any market also gets `EbayBuyCta` above the board.
- **One ranking for every buy surface.** `marketRows`/`cheapestBuyRow` are the
  board's rule (in stock, the market's currency, item price first), used by
  the board, the QuickView, `CardTopBuy` and `CardStickyBuyBar`, so the bar
  can never name a different store from the board's #1 row. The sticky bar
  shows only once the top block has scrolled above the viewport and hides
  while the board is on screen; hidden, it is `inert`.
- **Price guide rows** get a TCGplayer button (the card's product page —
  ids are TCGplayer product ids — with its US market price in US$) and an eBay
  search button, built in a small client island from the row's raw fields so
  the long affiliate URLs are not serialised twice per row. The table is
  fixed-layout and drops columns by width instead of scrolling sideways.
- **Click tracking.** Every outbound link on these surfaces carries
  `data-retailer`, `data-page`, `data-card` (slug) and `data-surface`; the GA
  `buy_click` beacon now sends `card` and `surface` too. The Buy List
  Planner's links are tagged on the way out (`tagPlanLinks`), so its TCGplayer
  picks earn like the board's.
- **Price history in the popup** (RiftCompare shows it there too): the API
  adds the card's last 90 days from `getProductHistory` — the card page's own
  series, read from the GitHub history file through the fetch cache, so no
  database — trimmed by `quickViewHistory` to a few hundred bytes. The shared
  `LineChart` gained a `width` (a narrower viewBox draws its labels legibly
  in the popup) and a left gutter sized to its longest label (four-figure
  US$ values were clipped), and stops keying two x labels alike when there
  are only two days (a React duplicate-key warning).
- **Search opens the popup, like RiftCompare's.** A card hit in `CardSearch`
  (click or ArrowDown + Enter) opens its QuickView, so the visitor keeps the
  page and the results; modifier clicks and sealed hits stay links. Card
  links on the leaders, colour, Box Value and blog pages go through
  `CardQuickLink` too.
- **TCGplayer banner** (RiftCompare's `TcgplayerAd`) under the eBay banner on
  the card page: "Shop One Piece singles & sealed" through Impact, labelled
  Ad, `data-ad-placement`. While the phone buy bar shows, `body[data-oc-buybar]`
  adds bottom room so the bar never covers the footer's last lines.
- **Not ported:** RiftCompare's live eBay listing carousel and Graded tab
  (OP's eBay pass stores one listing per pair; more would cost Browse calls
  from OP's own quota — the owner's decision), RiftCompare's one-click
  price-drop alert in the popup (OP has no server-side alerts; the popup's
  Watch button is OP's equivalent), "Add to collection" (OP has no
  collection), and a sealed QuickView.
  `tests/quick-view.test.ts` pins the payload, the ranking and the wiring.

## 2026-10-03 — Deal Finder: RiftCompare's three views; TCGplayer is the reference, never the buy side

The owner wants one-to-one parity with RiftCompare. The parity audit found OP's
Deal Finder broken in the US: `biggestSavings` ranked `Card.low<M>` against
TCGplayer's market price, and `lowUS` is usually the `tcgplayer` Offer row —
TCGCSV's `lowPrice`, TCGplayer's lowest listing of ANY condition. 988 of 1,115
US "deals" (89%) were TCGplayer measured against itself, 40 of the top 60 were
thin promo printings, and the % sort with a 60% ceiling pinned the list to the
ceiling. Ported RiftCompare's Deal Finder (its `lib/arbitrage.ts` rules) instead:

- **Three views, one URL builder.** `?view=` tcg (default, "Underpriced vs
  TCGplayer"), ebay ("Cheapest on eBay", free for everyone, signed out
  included) and vs-ebay ("Underpriced vs eBay"). Every link goes through
  `hrefFor` (`src/lib/deal-finder-href.ts`, ported as is; `mine` has only
  "watch" because OP has no binder).
- **TCGplayer is the reference, never the buy side.** The buy side is each
  market's stores plus eBay (`dealFinderSources`); a URL naming `tcgplayer` is
  dropped (`resolveBuyKeys`). In the US the `tcgplayer` row is used only as a
  VETO: a store or eBay price at or above TCGplayer's own lowest listing is not
  a deal (`scoreVsTcg`). Floors: buy ≥ 300 minor units, ≥ 100 below market,
  ≤ 75% below (a mismatch, not a deal). Sorted by money below market (then %),
  with % as the option. Same data, US: 189 cards instead of 1,115, led by real
  store listings (Kaido OP17-062 Manga at Hobbiesville, US$699 vs US$1,081.63).
  OP's `tcgplayer` row is any-condition (RiftCompare's is cheapest English NM),
  so the veto can drop a store a played TCGplayer copy undercuts; that errs on
  the side of listing fewer deals.
- **eBay on delivered cost.** Deal Finder compares an eBay row on item + stated
  postage, on the item price alone ("+ postage") when none is stated, and a
  stated postage wins a tie. This is Deal Finder's own comparison; the card
  page's price board still ranks every row, eBay included, by item price.
  Canada's eBay rows (`ebay_us`) are US listings with unquoted international
  postage: off the default buy side (selectable, labelled "eBay US + intl
  postage"), and Canada has no eBay comparison. Singapore has no eBay singles
  feed. eBay views explain themselves when eBay isn't being collected
  (`getSiteStats().ebayLive`) and offer eBay searches instead.
- **Cheapest on eBay / Underpriced vs eBay** guards: eBay (or store) ≥ 100,
  gap ≥ 50, gap < 80% of the reference. In the US the Cheapest on eBay
  alternative includes TCGplayer's own lowest listing (buyable there).
- **Data.** `getDealInputs(country)` — one raw query per market, reduced in
  Postgres to `[id, storeMin, tcgLow, ebayCents, ebayKnown]` tuples (US 6,969
  rows ≈ 160 KB), same 72 h freshness as `aggregate()`; `getStoreMins` for a
  picked store subset (Plus); `getDealOffers(country, ≤25 ids)` for the page's
  live listings. Every row shows the LIVE listing's own price, condition and
  link, re-scored with the same predicate and dropped if it no longer
  qualifies. `low<M>` stays the browse/card headline; it is no longer a deal
  input. `biggestSavings`, `DEAL_MAX_SAVING_PCT`, `MAX_GAP_PCT`,
  `savingVsMarket` and `DealList` are gone.
- **Access unchanged** (`dealAccess`): signed out — no query on the gated
  views, a locked preview with eBay searches beside it; free account — the
  first 3 rows of the default ranking and "N more cards on this list" with the
  real total; Plus — every row, store picker, sort, paging, "only my cards".
- **Only my cards** needs the watchlist, which lives in the browser: the
  `?mine=watch` chip renders a client island that POSTs the watched slugs to
  `/api/deal-finder` (Plus only, uncached), which runs the same ranking with the
  filter applied before paging.
- **Homepage** "Today's Top Deals" is RiftCompare's: Biggest savings (the
  default ranking sorted by %, 4 rows + the real total; non-members see 1 and
  "Unlock N more with Plus"; the page carries only that one row and members
  fetch the rest from `/api/top-deals/savings`, see "Fixes after the parity
  integration" below), Price drops
  and — with no demand signal to build Rising Cards from — "Biggest 7-day
  climbs", free. Budget tabs use RiftCompare's per-market thresholds.
- **/market/records** is the free cross-market board: cheapest in-stock STORE
  prices (never TCGplayer's listing or an eBay ask) compared across markets at
  the reference FX rate, ranked by money saved (≥ 5 units, 20–80%), plus 90-day
  TCGplayer-market records (a "high" needs a month of history and a rise).
  `/api/premium/proof` returns `{ country, dealCount }` from the same ranking.

## 2026-10-03 — Tools parity: /tools, the deck price calculator, selling fees and the landing pages

RiftCompare's free tools and SEO pages, ported to One Piece (parity audit §3.5
and §6). What is not obvious:

- **The deck pricer reads the catalogue, not the database.** `/api/deck/price`
  parses (`lib/deck.ts`, pure, `tests/deck.test.ts`) and resolves every line
  against the cached `getCatalog()`; only the resolved printings' offers are
  read, through the cached per-card `getCardDetail()` (at most 80 per request,
  rate-limited per IP). No new query sits on a request path.
- **A number means its standard print.** `4xOP01-120` prices the base print
  (lowest TCGplayer id among standard prints); a Parallel, Manga or SP is chosen
  with the line's printing switch, which writes `#<productId>` into the list so
  the share link and the Buy List Planner get the same printing. `_p1`/`_p2`
  (deck-builder exports) pick the Nth parallel. A name without a number is
  matched to the number with the most printings and shown as a guess; an
  unmatched line is listed, never dropped.
- **Copies are assumed available.** Stores publish in-stock, not quantities, so
  a line of four is four times the store's price, and both /deck and the
  planner say so. eBay rows never fill a deck line (the Buy List Planner's
  rule): many sellers behind one `source`.
- **/deck's "buy each card where it's cheapest" is free; the planner stays
  Premium.** The per-card cheapest store is what every card page already
  shows; the planner's value is the best single-store orders and the condition
  floor. A free account now gets its planner TOTAL (RiftCompare's free Best
  Basket taste): `/api/buy-list` returns only the total and counts unless the
  account is Premium, so no store name, pick or link leaves the server.
- **Minimum condition.** `lib/buy-list-condition.ts`: store rows by their
  recorded grade (unstated = Near Mint, as a store's headline price means);
  TCGplayer's row is its lowest listing across every condition, so it is left
  out at "NM only" and "LP or better" instead of being assumed mint.
- **Selling fees are dated and sourced, or blank.** Rates checked on
  2026-10-03 on the marketplaces' own pages where they loaded: eBay US (13.25%
  of the whole sale to $7,500, 2.35% above, $0.30/$0.40 per order), eBay UK
  private sellers (no final value fee). TCGplayer's help page refused the fetch;
  its 10.75% / $75 cap / 2.5% + $0.30 comes from a 2026 fee comparison citing
  the February 10, 2026 change, and links to TCGplayer's page. Cardmarket, eBay
  Australia and eBay Canada are left for the seller to enter (RiftCompare's
  rule: a stale percentage is worse than none).
- **Keywords come from card text.** `Card.effect` is real (6,674 of 7,255
  printings), so `/keywords` exists: `getCardText()` reads one row per card
  number (DISTINCT ON) and caches only keyword slugs and types, never the text.
  A card "has" a keyword when the bracket appears in its text, including cards
  that gain it; the page says "whose text has". Definitions are short
  paraphrases of the Comprehensive Rules with no rule numbers cited.
- **Store pages count "cheapest" in SQL.** `getStoreStats()` aggregates every
  store row against the market's `low` in one query (live = in stock and
  refreshed in 72 h). Store pages under 10 live listings are noindex and left
  out of the sitemap.
- **Leader pages** link "cards for this deck" by shared type within the
  Leader's colours (every colour of the card is one of the Leader's), a safe
  subset; they are a starting point, not a decklist, and the page says so.

## 2026-10-03 — Tools review: deck prices from store listings, condition floor is Premium

- **A deck line is priced from its store listings, not the catalogue's low.**
  `Card.low<M>` folds in eBay asks (lib/import.ts), so /deck could show an eBay
  price beside a link to a dearer store and count an eBay ask in a "buy at the
  cheapest store" total. `lib/deck.ts storeLows()` takes each market's cheapest
  in-stock store or TCGplayer offer from the card's cached offers; the shared
  link's unfurl prices the same way, so the og:title and the page agree. The
  printing switch's option prices still read the catalogue's low (loading
  every printing's offers per line would multiply the per-card reads).
- **The minimum condition is a Premium control, as on RiftCompare.** A free or
  Plus account's total is any condition (the API ignores a floor it sends) and
  says how many of its cheapest copies are played or TCGplayer's any-condition
  low (`cheapestGrades`). Premium starts on "LP or better" and the last choice
  is remembered in the browser. /api/buy-list is rate-limited per account.
  RiftCompare's "5 free totals a day" is not ported: OP's rate limiter is
  per-instance memory, so a daily cap would not hold.
- **/deck gained RiftCompare's search-to-add and "find it" for unmatched
  lines**, through /api/search's hits and an `add: {slug}` on /api/deck/price
  (the server turns the slug into the canonical list line).
- Paged facet and keyword pages carry their own `?page=N` canonical and og:url;
  a store page with nothing matched is noindex like a thin one; fee deductions
  and losses read "−$1.50", never "$-1.50".

## 2026-10-03 — Search, recently viewed, chart, filter chips, watch drawer and blog shop strip (RiftCompare parity)

Ported from RiftCompare's SearchBar, RecentlyViewedRail, PriceChart/Sparkline,
Filters/ActiveFilters, WatchlistDrawer and ArticleShopStrip, adapted where OP
Compare's data or rules differ.

- **Search matching** (`lib/search.ts`, pinned by `tests/search.test.ts`).
  Punctuation is a space and quotes split words, so "Monkey.D.Luffy",
  "monkey d luffy" and `Eustass"Captain"Kid` → "captain kid" all match; a
  squashed query ("monkeydluffy") matches the squashed name. A query word must
  match the START of a word in the card's text (name, number, printing,
  rarity, type, set); four letters or more may also match inside a word. This
  is stricter than the old substring rule on purpose: "nami sp" used to hit
  every name with "sp" inside it. A card number anywhere in the query narrows
  by the remaining words ("OP05-119 manga"). Nicknames (big mom, blackbeard,
  doffy, akainu …) are tried IN ADDITION to the typed words, mapped to one
  distinctive printed-name word ("big mom" → "linlin" finds Charlotte Linlin
  and Kaido & Linlin), so an alias can add results but never remove one.
  Ranking weights are unchanged (value still beats print type), with a bonus
  for words that hit the name. A query with no match gets up to three real
  names within a small edit distance ("Did you mean"), closest first, then the
  name with most printings — never invented names.
- **No match → eBay search.** As on RiftCompare: an affiliate eBay SEARCH for
  the typed words on the visitor's own eBay, labelled as a search with a
  paid-link line. No listing is claimed.
- **Recently viewed and recent searches** are localStorage only
  (`lib/recently-viewed.ts`, 12 cards, 5 searches, defensive parsing). The
  card page records through ONE island (`<RecentlyViewed record>`), which also
  shows the rail; the search box shows both when empty, the watchlist page the
  rail. QuickView should also record (integrator: call `pushRecentCard` from
  QuickView's open, as RiftCompare does).
- **Interactive chart without breaking LineChart's props.** Pages pass a
  `format` function, which cannot cross into a client component, so the
  server half formats every point and each range's axis ticks and the client
  island (`LineChartInteractive`) only draws. Range tabs are offered only when
  the history is longer than the range. History holds US market and US low
  only, so there are no per-market series to show; the chart does not invent
  them.
- **Sparklines read history files, not the database.** `getSparklines` (the ux
  block at the end of `lib/data.ts`) reads the same GitHub bucket files as the
  card chart, one per distinct bucket, capped at 48 ids, through the fetch
  cache; no `unstable_cache`, no Prisma. Used on /movers (hidden in the
  three-column layout between lg and 2xl, where it would crush names) and in
  the watchlist page and drawer.
- **Filters apply instantly, URL is the state.** `BrowseFilters` is a client
  form with an optimistic copy of the query string (RiftCompare's pattern);
  `FilterChips` removes one filter per tap. Both write the one canonical query
  from `lib/filter-chips.ts` (fixed key order, CSV multi-values, defaults and
  `page` dropped; old repeated-key links still parse). It stays a real GET
  form, so without JavaScript the bottom button submits it; with JavaScript
  that button is the phone's "Show results". Price boxes apply on Enter or
  blur. /cards is a hub of links into /browse, so the chips live on /browse.
- **Watch drawer, no sign-in wall.** OP Compare's watchlist is browser-only,
  so the drawer (header heart with a count, `WatchDrawer.tsx`) shows the list
  directly, where RiftCompare's asks to sign in; the copy promises no
  price-drop email because OP Compare sends none. It is self-contained (no
  provider in the root layout, which still reads no session); anything can
  open it with `openWatchDrawer()`. /watchlist stays the deep link.
- **Blog shop strip from the post itself.** Posts are built from data, so the
  strip reads the post's unrendered React tree (`components/blog/mentions.ts`)
  for the cards and products it names — CardLite props and /card or /sealed
  links — in order of first mention, hero cards first, capped at six cards.
  Each row shows the live cheapest price in the reader's market and an
  affiliate eBay search ("Search eBay", never "Buy"). No list to maintain.
- **/search?q=** redirects to /browse?q=, the results page the WebSite
  SearchAction already names.

## 2026-10-03 — UX parity review fixes

- **Enter in a /browse price box now applies it.** With JavaScript the filter
  form has no submit button (the bottom bar becomes a `type="button"` "Show
  results"), and a form with two text boxes and no submit button gets no
  implicit submission, so Enter did nothing. The price boxes now handle Enter
  themselves; blur still applies too.
- **Market adjectives take the right article.** "a Australian listing" read
  wrong in the filter panel, its chip and on /sets. `withArticle()`
  (`lib/filter-chips.ts`) gives "an Australian" and "a US / UK / European".
  The price chip reads "From A$5", "Up to A$20" or "A$5–A$20" instead of an
  infinity sign or a zero.
- **The blog shop strip finds products in tables and the summary.** The box
  post names its boxes in the summary and in `SimpleTable` rows (arrays of
  cells holding links), which the first walk skipped, so a post about boxes
  showed only singles. Every prop is now walked for links and card objects,
  and the strip is titled "Shop this post" when it lists products.
- Small fixes: tabbing out of the search box closes its list; the watch
  drawer's focus trap pulls focus back in after an unwatched row disappears;
  the watchlist puts the printing on the sub-line so a long name cannot hide
  it on a phone; chart range tabs are 44px tall on touch screens, as on
  RiftCompare.

## 2026-10-03 — Integrating the five parity tracks

The premium, quickview, deals, tools and ux branches were merged in that order,
keeping both sides of every conflict. The calls that were not mechanical:

- **Layout nesting:** CountryProvider > QuickViewProvider > PlanProvider, so a
  QuickView's buttons can open the plan dialog and every corner nudge still
  yields to the QuickView's `aria-modal`. No session read was added.
- **/leaders rows** open each Leader's own page (tools), not a QuickView;
  the card links on `/leaders/[slug]` are CardQuickLinks instead.
- **Card search** keeps the ux rewrite: each card row is a CardQuickLink and
  Enter clicks the row's anchor, so QuickView opens with no search-specific
  QuickView code.
- **The chart** keeps the ux interactive chart (it already measures real
  pixels and sizes its gutter); QuickView's `width` is only the width drawn
  before the wrapper is measured.
- **Buy List route** keeps the tools version (it tags links with the planner's
  `tagPlanLinks` and adds each basket's store label); its rows
  carry quickview's `data-card`/`data-surface` and PlanButton's
  `gate:buy-list` surface.
- **Premium proof:** `/api/premium/proof` answers `{country, deals, dealCount}`
  (one number, two names) and PremiumProofLine reads `deals`, falling back to
  `dealCount`. The default list counts eBay listings too, so the proof line no
  longer says "at a real store".
- **Deal Finder's "N more cards"** goes through Upsell's MoreWithPlan with the
  real count; there is no second count line.
- QuickView records the card in "recently viewed" when it opens, as the card
  page does. Home trending links open QuickView. The card page's card number
  no longer breaks at its hyphen. "a {adjective} store" copy uses withArticle.

## 2026-10-03 — Fixes after the parity integration

Verification of the integrated branch found these; the calls that were not
mechanical:

- **Lists close in the bubble phase.** The search dropdown's rows, its
  recently viewed chips and the watchlist drawer closed in `onClickCapture`,
  which unmounted the row before CardQuickLink's `onClick` ran, so a mouse
  click or tap followed the href instead of opening QuickView (Enter worked,
  because it clicks the anchor itself). They close in `onClick` now, after the
  link has handled the click; `tests/quick-view.test.ts` forbids
  `onClickCapture` in those three files.
- **The homepage's Plus rows are limited on the server.** The page used to
  carry four "Biggest savings" rows and hide three in the browser, against
  "gated rows are limited in the QUERY". `getTopDeals` now returns one savings
  row plus the real total (the cached HTML is still the same for everyone),
  and a member's browser asks `/api/top-deals/savings` (session + `isPremium`
  per request, uncached, backed only by the self-cached loaders) for the four.
  This departs from RiftCompare, which hides rows in the browser.
- **Beacon retention: 90 days.** `ClickEvent` and `PremiumClick` had no
  pruning. The import (twice a day) now runs `pruneBeacons` (non-fatal), the
  admin reports read only the last 90 days (no all-time scan), and both beacon
  routes refuse cross-site posts (`sameOrigin`). OP Compare has no account
  deletion yet; when it gets one, it must null `userId` on both tables.
- **A link names its card.** OutboundBeacon prefers the anchor's `data-card`
  to the page path, so clicks from Deal Finder, the deck pricer and a QuickView
  opened on another page are attributed to the right card; Deal Finder's and
  the deck pricer's links now carry `data-card` and `data-surface`.
  `/admin/clicks` links a sealed slug to `/sealed/`.
- **`/deck?list=` metadata** shares `/api/deck/price`'s per-IP budget (40 a
  minute) before its card loads, and unfurls generically past it, rather than
  pricing from the catalogue's low (which counts eBay and would quote a
  different total than the page).
- **Header "Pricing" stays a link to /premium**, as RiftCompare's is; opening
  the plan dialog there instead is the owner's call.

## 2026-10-03 — Wave-2 schema: watch/alert/collection/deck/support/eBay-panel tables, additive

Wave 2 makes OP Compare a one-to-one copy of RiftCompare's member features,
and every track codes against one schema, landed first and then frozen (the
foundation track owns `prisma/schema.prisma` for the whole wave).

- **Added, all additive** (`prisma db push`, no backfill): `PriceAlert`,
  `AlertMute`, `SealedWatch`, `DeckWatch`, `Notification`, `CollectionCard`,
  `Counter`, `NewsletterSubscriber`, `SetReleaseAlert`, `PublishedDeck`,
  `RisingSnapshot`, `SupportTicket`, `EbayListing`, `EbayGradedListing`; on
  `User` the activity, country, signup-source, share-id, basket-prefs and
  welcome-email columns and the relations; on `Card` `searchCount`,
  `viewCount`, `lastViewedAt`; `ClickEvent.entry`, `PremiumClick.source`,
  `Feedback.email`.
- **RiftCompare's shapes with OP's ids.** `Card.id` and `Sealed.id` are Int
  TCGplayer product ids, `User.id` a cuid, the default market `"US"`. A sealed
  watch keys on `Sealed.id` (RiftCompare: a group key), a published deck on a
  leader card id plus a `leaderSlug` of name and number.
- **`PriceAlert.userId` is nullable** so the anonymous (email-only) watch can be
  enabled later; a signed-in watch carries the account's email. The unique key
  is RiftCompare's `(email, cardId, market)`.
- **Email is off until configured, and the schema says what was delivered.**
  `lastNotifiedAt` is set only when an email was actually sent;
  `lastFlaggedAt` when an in-app `Notification` was written instead;
  `confirmSentAt` is the outbox stamp for a confirmation.
- **`Feedback.email` reverses "keeps no email" for Feedback only.** It is an
  optional reply address the visitor types, never shown publicly (RiftCompare
  has it). Price reports and store suggestions still keep none;
  `tests/inbox.test.ts` pins both halves.
- **Card view/search counters are a per-request write** — one `UPDATE` per
  counted view — the documented exception to "no per-request writes", for
  RiftCompare's popularity ranking. The tools track owns the counting and its
  throttle.
- **Still no history in Prisma.** Price, demand and rising history stay files
  on the `data` branch. Not added (deferred): trial columns,
  `UserDigestOptOut`, `AnnouncementOptOut`, `EbayAuctionListing`.
- The eBay panel tables are written ONLY by `scripts/ebay.ts` after a
  completed search (CLAUDE.md, eBay); pages read them through `data.ts`.

## 2026-10-03 — Wave-2 design tokens, fonts and the main container (RiftCompare parity)

Owner: "the font and everything needs to be the same". OP Compare now carries
RiftCompare's design system byte for byte, with one deliberate difference.

- **Fonts are RiftCompare's.** Inter (body, preloaded), JetBrains Mono
  (numerals, not preloaded) and Fraunces 600/700/900 for h1–h3 and
  `.rb-eyebrow`, as next/font variables on `<html>`; `<body>` is
  `min-h-screen bg-ink-950`. Archivo (as `--font-riftbound`, RiftCompare's
  variable name, kept so the CSS stays one diff) is the homepage's own import
  under `.rb-display-sans` (the design track adds it). Luckiest Guy and the
  `font-brand` family are gone from the site; they stay only in the share-image
  fonts (`src/lib/og/fonts`, pinned by CLAUDE.md).
- **Tokens are RiftCompare's.** `tailwind.config.ts` and `globals.css` are
  copies of RiftCompare's: graphite ink neutrals, the #f4f6f8 light theme, gold
  #caa85a, up/down, every chromatic shade, the motion tokens
  (`src/lib/motion-tokens.ts`: 120/200/320/150 ms, one ease-out curve, the z
  scale with menu 95 and modal 120), the `.pg-*` price-guide classes, the
  coarse-pointer 48px floor and the reduced-motion block kept last.
- **The one difference: the brand ramp stays Straw Hat red** (500 #d92b33, 600
  #b11f27, 400 themed 255 107 107 / 176 22 30). Red takes WHITE ink (white on
  #d92b33 is 4.8:1, near-black about 4.4:1), so `.btn-primary` is
  `bg-brand-500 text-[#ffffff] hover:bg-brand-600` (RiftCompare: dark ink,
  hovering lighter), the light-mode dark-ink and hover overrides for it are
  dropped, and an unlayered `.bg-brand-500.text-ink-950 { color: #fff }` lets
  RiftCompare markup that writes dark ink on a brand fill (the current page
  cell, an active menu link) be copied verbatim. The owner may still choose
  RiftCompare green; then this paragraph and the brand hexes are the whole diff.
- **Retired OP-only vocabulary.** The `straw` token became RiftCompare's `gold`
  (RiftCompare uses gold for its Plus/Premium surfaces as well as foil), and
  `.eyebrow` → `.rb-eyebrow text-slate-500`, `.link` → `text-brand-400
  hover:underline`, `.prose-op` → RiftCompare's article and about-page classes
  (`src/components/prose.ts`), `.data-table` → RiftCompare's plain table
  classes, `.btn-straw`, `--hero-sea`, `.sea-grid` and `animate-bob` deleted.
  `brand-300` stays undefined, as on RiftCompare.
- **Theme: RiftCompare's cookie.** `src/lib/theme-shared.ts` (a `theme` cookie,
  one year, Lax; the boot script always stamps `data-theme`) replaces
  `src/lib/theme.ts`; the boot script moves an old `op:theme` localStorage value
  into the cookie once and removes it. `ThemeToggle` is RiftCompare's (icon and
  row variants, an `oc:theme` event, the theme-color meta kept in step). The
  default is LIGHT, not RiftCompare's dark (see "Light theme is the default"
  below): `<html data-theme="light">`, `resolveThemeMode` falls back to light,
  dark only from the cookie or a migrated `op:theme` of `dark`, and
  `viewport.themeColor` is the light page colour #f4f6f8.
- **ui primitives are RiftCompare's** (`src/components/ui/{Dialog,EmptyState,
  SegmentedTabs,Skeleton,Toast,Tooltip}.tsx`), with OP's `data-oc-dialog` body
  flag. Wave 1's `components/Dialog.tsx` is a thin re-export (default z
  `overlay`, as QuickView sits on RiftCompare), and PlanDialog uses the shared
  refcounted scroll lock, modal flag and topmost-only Escape, so a plan dialog
  opened over QuickView releases neither early.
- **The layout owns the container.** RiftCompare's shell: a "Skip to main
  content" link, `<div class="pl-[var(--sidenav-w)]"><main id="main-content"
  class="container-app min-w-0 py-6">`, and the footer ad zone in its own rail
  wrapper. Every page dropped its outer `container-app` and `py-*`; a full-bleed
  band uses RiftCompare's CinematicHero breakout (`left-1/2 -mt-6 w-screen
  translate-x-[calc(-50%-var(--sidenav-w)/2)]` with the rail reserved inside).
  The admin bar became a hairline at the top of the content column.
- **Not done here, on purpose:** the header, rail, phone menu, footer, logo,
  CardTile, homepage and 404 bodies are the design track's. The root layout
  still reads the country cookie (`getCountry()`) until that track moves the
  market to the client as RiftCompare does.

## 2026-10-03 — Wave-2 free limits, shared limit modules and the watchlist store

- **Free limits: 10 watched cards, 50 portfolio cards.** This REVERSES "The
  watchlist stays in the browser for everyone, so there are no free limits to
  enforce" (Plus & Premium entry above), because the owner asked for
  RiftCompare parity ("all the premium features"). The numbers and the rules are
  RiftCompare's (`src/lib/free-limits.ts`): only adding a NEW card is refused at
  the limit, nothing held is ever lost (grandfathering), any paid tier is
  unlimited and never counted, and the refusal is a structured 402. The
  enforcement lands with the member and collection tracks' routes. Flagged for
  the owner.
- **One home for tier numbers.** `src/lib/tier-limits.ts` holds every tier
  constant another wave-2 track enforces (`FREE_RISING_ROWS` 3,
  `FREE_DEMAND_ROWS` 10, `PREMIUM_DEMAND_ROWS` 25, `FREE_BASKET_TOTALS_PER_DAY`
  5, `SET_GAP_CHUNK` 200) and re-exports `FREE_DEAL_ROWS` and the free-limit and
  alert numbers (`src/lib/alert-limits.ts`: 25 Plus targets, 10 Premium deck
  watches, 10 Plus sealed watches with a hard cap of 200). No other module
  redeclares them.
- **Sealed watches are checked "twice a day"** (OP's import cadence, not
  RiftCompare's four reads) and **no market has an at-RRP alert**
  (`SEALED_RRP_MARKETS = []`) until OP Compare has an MSRP table.
- **`src/lib/use-watchlist.ts`** is RiftCompare's module-level store (one
  shared promise, subscribers, optimistic watch/unwatch with rollback, the
  free-limit 402 handed to `onLimit`, `invalidateWatchlist`) with OP's ids
  (numbers) and a second, signed-out branch: the watched set is the card items
  of localStorage `op:watchlist` (WatchButton's format), written by
  watch/unwatch with no request at all. A card counts as watched by id or, for
  older local items that carry none, by slug. Signed in, it reads
  `/api/alerts/watchlist?ids=1` (the member track's route; until then a 404 is
  an empty list). The merge of the local list into the account is the member
  track's. Unlike RiftCompare's, a subscribed store also follows `oc:me`
  (fired by `invalidateMe()` on sign-in, sign-out and plan changes): it drops
  its state and loads again, so the header count and every heart switch
  between the local and the account list without a reload, even where a caller
  forgets `invalidateWatchlist()` (the account menu's sign-out did).
- **`trackEvent` sends to GA4 only** (`src/lib/analytics.ts`) and is a no-op
  without `NEXT_PUBLIC_GA_ID`; RiftCompare also mirrors to Vercel Analytics,
  whose custom events are billed.
- **`getEmailStatus()`** (`data.ts`, block `wave2:foundation`) reads Meta key
  `email`, cached like `getHistoryRef`; anything but `"on"`, and any read error
  (caught outside the cache), is `"off"`. Pages decide what to promise from it.

## 2026-10-03 — Egress: the wave-2 per-user libraries

The accounts exception in CLAUDE.md now names
`src/lib/{watchlist-server,collection-server,collection-share,set-owned,
notifications,sealed-watch,deck-watch,published-decks-server}.ts`: per-user or
per-request, uncached, `select`-limited, called only from `/api/*` routes and
account pages (`/watching`, `/dashboard`, `/profile`, `/portfolio/**`,
`/c/[token]`), never from the root layout or a public page. The rule that made
the exception safe still holds: nothing under `src/app` imports `@/lib/db`.
`tests/app-no-db-import.test.ts` now checks every import shape (alias,
relative path, re-export, dynamic `import()`, `require`) and that the root
layout imports none of the per-user libraries.

## 2026-10-03 — Light theme is the default

**Decision.** OP Compare now opens in the light theme. The root layout renders
`<html data-theme="light">`, and the boot script switches to dark only when the
visitor has chosen dark with the toggle (`op:theme` = `dark`). Dark stays fully
supported.

**Why.** The owner asked for light by default. This departs from RiftCompare,
which defaults to dark; the wave-2 design port (RC's `theme-shared.ts`) must
keep light as the default when it replaces `src/lib/theme.ts`.

Kept through the wave-2 theme port (2026-10-03): RiftCompare's
`src/lib/theme-shared.ts` replaced `src/lib/theme.ts`, and its default was
flipped to light (`DEFAULT_THEME`); `tests/theme.test.ts` pins the light
fallback, the server-rendered attribute and the light theme-colour.

## 2026-10-03 — "N stores" counts TCGplayer again (never eBay)

**Decision.** Every store count (`Card.stores<M>`, the card and sealed pages'
"In stock at", the tiles) counts each in-stock seller the price comparison
shows except eBay: every tracked store plus TCGplayer. `isStoreSource()` is
`!source.startsWith("ebay")` and the aggregate filter is `NOT LIKE 'ebay%'`.

**Why.** The owner saw a card listing Wulf Gaming and TCGplayer in its
comparison while the header said "1 store". RiftCompare's `computeMarket`
counts every in-stock retailer in the comparison, TCGplayer included. This
reverses the stores-only count from "Store matching: SKU numbers, …" earlier
today; eBay stays out per CLAUDE.md ("never counted as a store").

## 2026-10-03 — Workflows push the schema through `scripts/db-push-safe.sh`

**Decision.** The import and eBay workflows run `scripts/db-push-safe.sh`
instead of a bare `prisma db push`. It retries with `--accept-data-loss` only
when every warning Prisma prints is "A unique constraint covering the columns …
will be added"; any other warning (a dropped column or table, a type change) still
fails the run.

**Why.** The wave-2 schema adds `User.collectionShareId @unique`, a new nullable
column whose rows are all NULL. Postgres lets any number of NULLs share a
unique index, so nothing can be lost, but Prisma still demands the flag, and the
first import after the merge failed before touching the database. Passing the
flag unconditionally would also let a real drop through unattended.
## 2026-10-03 — More stores: 119 Shopify + ShadowPOS/Ecwid/BigCommerce adapters

**Decision.** The registry grows from 235 to 386 stores: 119 Shopify stores
from a third, per-market verification pass, 30 ShadowPOS stores (US), one
Ecwid store (Mighty Toys, AU) and one BigCommerce store (Grand J Games, AU).
`StoreInfo` gains `platform` (omitted = `shopify`) and, for Ecwid,
`ecwidStoreId`; `fetchStoreListings()` (lib/store-import.ts) picks the reader.
Every reader returns the Shopify listing shape plus the listing's own URL, so
each listing goes through the same `matchStoreProduct`, best in-stock variant,
market-currency, plausibility and 72 h staleness rules; a read that fails
keeps the store's existing rows, as a failed Shopify collection does, and says
why (`note`, shown on /admin/store-health with the platform).

- **Shopify: 127 verified lines, 120 stores.** Seven RiftCompare-overlap lines
  duplicated the market files by host and myshopify domain and were registered
  once. Manathril (US) was then removed: 3 listings in stock, and its sold-out
  rows priced at ~30% of TCGplayer's market (78 refused as implausible).
  Added per market: US 40, CA 51 (incl. La Crypte), AU 12, UK 7, EU 9. The
  Shopify reader's page cap rose from 30 to 40 × 250: Card Brawlers' One Piece
  collection is 7,355 products, exactly past the old cap.
- **ShadowPOS** (lib/shadowpos.ts): `/api/advanced-search?game=onepiece&
  inStockOnly=true`, the storefront's own search, 100 products a request; the
  title is TCGplayer's ("Absalom (OP06-081 — Alternate Art)") and the set
  name goes in trailing brackets, the shape the matcher already reads. The
  payload states no currency, so the reader refuses a non-US store
  (tests/stores.test.ts pins that every ShadowPOS store is US). The shops share
  the platform's servers: at most two are read at once, pages a second apart.
  Evolution Games (evolutiontcg.com, TX) is `evolutiongamestx`, not the UK
  `evolutiontcg`; the two Lotus Games are different shops (CT, MT).
- **Ecwid** (lib/ecwid.ts): app.ecwid.com/api/v3 with a public token read from
  the storefront HTML on every run (the first one /profile accepts; on Mighty
  Toys that is an app's public token, which Ecwid publishes for client-side
  catalogue reads), sent as a Bearer header. /profile's currency must be the
  market's or nothing is read. The store's own robots.txt disallows its `/api/`
  path (Ecwid's generated list); the API host's robots.txt is empty.
- **BigCommerce** (lib/bigcommerce.ts): the server-rendered category page,
  `?limit=100&page=N` (Grand J Games: ~50 requests for ~5,000 singles), title,
  price text ("22.00$ AUD", any other ISO code is refused) and the "Add to
  Cart" / "Out of stock" button. Its URLs end in TCGplayer product ids; that
  is not used — the title goes through the matcher like every other.
- **WooCommerce** (lib/woocommerce.ts): ported from RiftCompare (Store API,
  `currency_code` checked per product, a variable product's top price as Near
  Mint) and tested, but **no store registered**: the only One Piece candidates
  were collectstoys.com (French-edition set names, English not established)
  and kadomart.com.au (SiteGround captcha on the first request).
- **nopCommerce** (lib/nopcommerce.ts): built and tested — category pages with
  the store's own "Stock Status = In Stock" filter (`?specs=<id>`), every price
  required to carry the market's symbol — but Unicorn Cards (UK) is **not
  registered**: it prices in the visitor's location's currency (a US runner is
  served USD), and the currency switch (/changecurrency) is disallowed by its
  robots.txt. Only curl's and Googlebot's user agents get GBP; we do not
  impersonate either.
- **Skipped**: GameNerdz (BigCommerce, ~6,000 numbered URLs): its category
  grid is rendered client-side (StorePass), so reading it means one product
  page per card, ~6,000 requests a run. The same goes for the sitemap +
  JSON-LD stores (chobanovgamesltd.com, cardgamecorner.com — which also asks
  ClaudeBot for a 10 s crawl delay — card-z.com, tcg-cards.nl, magictime.it,
  asheretrocollectibles.com) and nakamagames.com (PrestaShop, language only on
  the product page). gate-to-the-games.de (JTL) stocks English OP01–OP03 only,
  mixed with Japanese pages. None is polite and bounded at twice a day.

**Measured** (local full import against the same TCGCSV catalogue, before →
after; "printings" = cards with an in-stock store listing updated in the last
72 h):

| Market | Stores in registry | Stores with stock | Printings in stock | In-stock store offers |
|---|---|---|---|---|
| US | 73 → 143 | 73 → 143 | 6,269 → 6,451 | 52,306 → 83,948 |
| CA | 57 → 108 | 57 → 108 | 6,014 → 6,355 | 54,071 → 99,234 |
| AU | 50 → 64 | 49 → 63 | 5,737 → 5,826 | 43,889 → 55,158 |
| UK | 30 → 37 | 29 → 36 | 3,847 → 3,886 | 11,907 → 13,549 |
| EU | 24 → 33 | 22 → 31 | 3,645 → 3,787 | 12,983 → 21,225 |
| SG | 1 → 1 | 0 → 0 | 0 → 0 | 0 → 0 |

ShadowPOS: 16,198 listings read, 14,478 matched, 14,429 in stock (49 US
printings are in stock only there). Grand J Games: 4,981 read, 3,984 matched,
2,354 in stock. Mighty Toys: 746 read, all matched, 318 printings (it lists
copies as separate products). Every new store matched at least 16 listings; the
full import took 13 minutes (8 before). PokéBox (AU, an existing store) failed
on a different collection in each of the two runs; it also failed in two
earlier runs today, so it is not this change.

## 2026-10-03 — Wave 2 design track: RiftCompare's chrome, card tile and homepage

**Decision.** The header (`NavbarShell` + a server `Navbar`), the desktop rail
(`SideNav`), `nav-groups.ts` in RiftCompare's shape, the phone menu
(`MegaMenuProvider` + `CinematicNavMenu`), the ⌘K launcher, the account menu
(`UserMenu`), `CountrySwitcher` / `CountryHeroToggle` / `RegionToggle`, the
footer, `BrandLogo`, `Breadcrumbs`, the card tile, `Pagination` /
`SortSelect` / `PageSizeSelect`, `Reveal` / `CountUp` / `template.tsx` /
`RouteLoading`, the 404 and error pages, `AuthForm`, consent-gated analytics
and the feedback widget are RiftCompare's markup and classes, rebranded. The
homepage is RiftCompare's page section for section, and `/au /uk /ca /sg /eu`
are its region homes. `MobileMenu`, `CountrySelect`, `MarketPills`,
`AuthButtons`, `Wordmark` and `BrandLockup` are gone.

**Deliberate differences from RiftCompare.**
- *Brand.* `BrandLogo` masks `/logo-mask.svg` (the straw hat with the band cut
  out, so it still reads as a hat in one colour) with the red ramp
  `#ff6b6b → #d92b33`. Every active fill on red (the phone menu's current
  link, the current page, the region toggle) uses white ink.
- *Pricing in the header* stays hidden for Plus/Premium accounts (wave 1's
  rule), through `HeaderPricingLink` (a `PremiumNavLink`).
- *The rail* highlights only the most specific matching link. RiftCompare's
  prefix test lit `/cards` and `/cards/all` (and `/market` + `/market/records`)
  at once; OP Compare has more nested rail links.
- *No games, no "For stores", no Riftbound-only pages* in the nav. Routes the
  other wave-2 tracks build (`/watching`, `/dashboard`, `/portfolio`,
  `/tools/best-basket`, `/guides`, …) are linked now;
  `tests/nav-routes.test.ts` lists them in `IN_FLIGHT` and fails once one of
  them exists, so the integrator empties the list after the merges.
- *The country picker* has no UK GBP→EUR display toggle, and the signed-in
  `preferredCountry` sync is not ported (`/api/me` carries no market yet).
- *Consent.* OP Compare has no CMP, so `useConsent()` takes the no-CMP path
  (grant after 2.5 s) for Vercel Analytics only. Unlike RiftCompare it does not
  push a gtag consent update on that path: OP Compare's region-scoped GA
  defaults (analytics denied in the EEA, the UK and Switzerland) must stand when
  nobody was asked. GA4 now sends page views only from `GAPageViewTracker`
  (`send_page_view:false`), never on `/admin`. Speed Insights is not shipped.
- *Login.* `AuthForm`'s perks are what a free account really gets here
  (Watchlist, Binder, Top 3 deals) and no line promises an email. OP Compare
  was always OAuth-only, so the "signed up with a password before?" note is
  dropped. The Plus/Premium dialog's signed-out state embeds `AuthForm`
  (`compact bare`), so a visitor signs in without leaving the dialog.
- *Feedback.* `/api/feedback` takes the widget's optional reply address
  (validated, stored in `Feedback.email`, never public). It is a manual reply
  address, like the contact form's, not an email capture for sending.

**The static root layout.** The layout no longer calls `getCountry()`: the
chrome renders for `DEFAULT_COUNTRY` and `CountryProvider` resolves the
market on the client from the `country` cookie, its localStorage mirror, then
one `/api/geo` call (RiftCompare's model). A visitor whose stored market
disagrees with the region home they open is sent to their own. Pages that
price server-side still call `getCountry()` themselves; `CardTile` takes their
`country` as a prop, and falls back to the provider's market on the static
pages.

## 2026-10-03 — The homepage: one cached HTML for six markets

**Decision.** `/` (and each region home) is ISR, hourly, with no cookie or
session read. It carries every market's hero stats and Today's Top Deals and
the client shows the visitor's. The data is composed from the cached loaders
in `data.ts` (block `wave2:design`): `getHomeStats()` reuses `getSiteStats()`
and the catalogue (no new query), stores = in-stock `store:*` sources plus
TCGplayer in the US, never eBay.

- **"Most popular" needs a real counter.** `getPopular()` reads the most
  searched cards (`Card.searchCount`, written by the tools track). Until six
  cards have a count, the tab is labelled "Chase cards" (the newest booster's
  most valuable printings) and nothing says "most searched".
- **"Recently updated"** diffs the two newest daily history files
  (`history/days/*.json`, already in the fetch cache) on TCGplayer's market
  price, with RiftCompare's outlier guard (+300% / −80%) and a US$1 floor at
  both ends, where a few cents read as a huge percentage.
- **"Biggest movers"** is TCGplayer's 7-day change, one worldwide figure.
- **"Explore the database"** shows the twelve newest booster and extra-booster
  sets (two rows of six) with New / Coming soon chips, then the six colours;
  every other set is one link away.
- **FAQ claims are built from constants** (`src/lib/home-faq.ts`): the markets
  and currencies from `COUNTRY_LIST`, the cadence from `IMPORT_CADENCE`, and eBay
  listings only while the eBay pass is live. `tests/home.test.ts` pins them.

## 2026-10-03 — The watchlist moves into the account (wave 2, member track)

**Decision.** A signed-in visitor's watchlist is RiftCompare's: one
`PriceAlert` row per (card, market) written by `/api/alerts/watchlist`
(`src/lib/watchlist-server.ts`), shown at `/watching` and in the header
heart's right-hand drawer. The free limit (10 distinct cards) is enforced
there: a NEW card on a free account at the limit is a 402 that opens the
upgrade panel beside the heart that was tapped. Target prices ("Notify me at
$__") are Plus (25) and Premium (unlimited). Sealed watches are Plus (10) and
Premium (hard cap 200), keyed by `Sealed.id`.

- **Signed out keeps its hearts.** RiftCompare's signed-out heart asks for an
  email; OP Compare cannot honour one (no mailer), so a signed-out heart saves
  in this browser (`op:watchlist`) with a toast, and the drawer shows that list
  under "Sign in to sync and get alerts".
- **The merge on sign-in.** On the first signed-in load, `use-watchlist.ts`
  posts the local CARD items to `/api/alerts/watchlist/merge`, which resolves
  them through the cached catalogue (unknown slugs skipped), imports at most
  200 and GRANDFATHERS them — no free-limit check on the import, so nobody
  loses a heart by signing up; the limit applies to adds after it. On success
  the card items leave localStorage and `op:watchlist-merged` records the
  account; a failed merge leaves them for the next load. Any later local card
  items (a sign-out and back in) are merged the same way rather than stranded.
  Sealed items stay local for a free account (sealed watches are Plus) and are
  listed under "Sealed — saved in this browser" on `/watching`.
- **The start price is never eBay.** `startPriceCents` is seeded from the
  cheapest in-stock, fresh (36 h) `store:%` or `tcgplayer` Offer for the pair —
  never `Card.low*`, which includes eBay (`src/lib/watch-baseline.ts`,
  `baselineWhere`). To be replaced by the collection-alerts track's
  `alert-price` helper at integration if it lands.
- **Deal Finder "only my cards" and the basket's watchlist source** read the
  account's watches server-side (as RiftCompare's `readUserCardIds` does), plus
  any slugs still in the browser.
- `/watchlist` and `/account` are NON-permanent (307) redirects to `/watching`
  and `/profile`; robots.txt no longer disallows them — the personal pages carry
  a noindex meta instead, which a Disallow would hide.

## 2026-10-03 — Alerts are in-app until a mailer exists; the heart wears a dot

**Decision.** Every member surface promises an email only when
`getEmailStatus()` is "on" (`/api/me` carries it as `emailOn`; the card page
reads it directly). While it is off: the drawer says "we'll flag it here", the
target field says "We'll flag it on your watchlist when a store has it at $X or
less", `/watching` shows live "At your target" and "New low since you started"
chips (computed from the cached price the row shows), the pause banner and
snooze chips are hidden, the price-drop CTA says "Watch this price — we'll flag
it on your watchlist when it drops (Plus: at your own price)" and offers no
email-only door. The alert run's `notify()` rows are the delivery: a "Recent
alerts" panel on `/dashboard` (last 10, mark read) and a small brand dot on the
header heart while any is unread.

**Why.** RiftCompare delivers by email and removed its notification bell; with
email off, OP Compare's notifications are the only delivery, so they need a
surface. The dot is an OP divergence, flagged for the owner. The unread count
rides `/api/me` (one indexed count, signed in only) and refreshes on window
focus — never a 60-second poll.

## 2026-10-03 — Plan changes happen in the app; the portal keeps its switch

**Decision.** `/premium`'s member card is RiftCompare's SubscriptionActions:
"Upgrade to Premium" (`/api/premium/upgrade`, `proration_behavior:
always_invoice` — the prorated difference is billed now and the tools unlock at
once), "Switch down to Plus" (`/api/premium/downgrade`, `create_prorations` —
the unused part is credited to the next invoice; takes effect now), "Switch to
annual" and "Keep <Tier>" (`/api/premium/resume`). Each route acts only on the
caller's own active OP Compare subscription (`ourSubscription()` refuses
anything not `site=opcompare`), is idempotent on the tier read from the live
Price, keeps the subscriber's interval, and never writes `premiumUntil`: the
webhook restamps it from `customer.subscription.updated`. The quoted price
follows the interval (`plan-switch-price.ts`, from `/api/me`'s `interval`,
one memoised, time-boxed Stripe read per Plus customer, `billing-state.ts`).

**The portal.** RiftCompare turned plan switching OFF in its portal because a
portal switch skipped its intro coupon and ended trials. OP Compare has neither,
so `scripts/stripe-setup.ts` leaves `subscription_update` on for self-service.
One difference to know: the portal prorates an upgrade with
`create_prorations`, so an upgrade made THERE unlocks Premium at once but bills
the difference at renewal, whereas the in-app button bills it now. Owner's call
whether to turn the portal switch off.

## 2026-10-03 — Sign-in is a step inside checkout; checkout is attributed

**Decision.** Every signed-out "Get Plus/Premium" (the cards, the Plan dialog)
goes to `/premium/start?tier=&plan=&src=&back=`, which IS the sign-in step
(provider buttons with `next=` itself) and, signed in, opens Stripe through
`/api/premium/checkout` (CheckoutLauncher, one session per mount). Old
`/premium?go=plus-year` links forward there. The checkout route accepts the
surface that sent the buyer (validated by `isPlanClickSurface`, remembered in
sessionStorage across the OAuth round trip, `src/lib/premium-surface.ts`) and a
`back` path (`sanitizeBackPath`, with funnel loop guards), stamps both on the
Session and subscription metadata, returns to `back` on cancel, and records a
`PremiumClick{source:"checkout"}` row — `/admin/premium` shows "Started
checkout by surface". `/premium/welcome` checks `metadata.kind === "oc_premium"`
and the owner before confirming, lists "Just unlocked" from TIER_COMPARISON and
sends the member to `/dashboard` (the new sign-in fallback) or back.

## 2026-10-03 — The tier table is RiftCompare's eighteen rows

**Decision.** `TIER_COMPARISON` (`src/lib/plans.ts`) is RiftCompare's
`TierRow[]` with all eighteen rows, every number the enforced constant from
`src/lib/tier-limits.ts` (now the home of `FREE_DEAL_ROWS`, re-exported by
plans.ts, so the table can import the constants without an import cycle), and
the pricing cards carry RiftCompare's four bullets each. Prices are unchanged.
OP wording: "OP Compare Index"; the sealed row promises restock and price
alerts "checked twice a day" with no at-RRP claim (no MSRP table); the deck
watch "alerts" rather than "emails".

**Caveat for the owner.** Several rows describe tools other wave-2 tracks are
building in parallel (portfolio and set tracker, Rising Cards, Best Basket's
plan, Demand Finder, the deck watch). The plan put all eighteen rows in now for
parity; until each track merges, those rows describe features that are not yet
live on this branch.

## 2026-10-03 — Attribution, activity and the referral capture (reward off)

- **Sign-up source.** `?src=` on a sign-in link (and RiftCompare's
  `markSignupSource` click cookie, `oc_signup_src`, 30 minutes) is whitelisted
  (`signup-source-shared.ts`) and stamped as `User.signupSource` on a NEW
  account only. `/admin/accounts` shows sign-ups by source.
- **Entry bucket.** The tab's first-touch traffic bucket (reddit, search,
  email…; `utm_source` wins) rides every outbound click as `ClickEvent.entry`;
  `/admin/clicks` breaks clicks down by it. Reddit is the owner's channel.
- **Activity.** `lastActiveAt` / `activeDays` are stamped from `/api/me` and the
  account pages, at most once per 30 minutes or on a new UTC day, never awaited
  (RiftCompare buckets by Sydney day; OP is UTC throughout).
- **Referral.** `?ref=<userId>` is captured (`oc_ref`, 30 days) and applied on a
  new account, but `REFERRAL_PREMIUM_DAYS` defaults to **0**: a referral grant is
  an entitlement write, and CLAUDE.md allows only the webhook, the reconcile and
  the admin routes to make one. Turning it on needs the owner's approval AND a
  CLAUDE.md amendment; the grant is then extend-only (`grantedUntil`) and
  logged like an admin grant. The "Invite a friend" card on `/profile` stays
  hidden at 0.

## 2026-10-04 — Wave-2 tools: Best Basket, Box EV, demand, rising, deck library and deck watch

**Decision.** The tools track ports RiftCompare's tools one for one.

- Best Basket replaces the Buy List Planner. The optimiser, the minimum-condition
  floor and the postage display are RC's. Postage comes from the committed
  `src/lib/shipping-rates.json`, measured per store by
  `scripts/probe-shipping-rates.ts`; an unmeasured store uses the market's
  dearest measured one-card tracked rate and is flagged "estimate". eBay and
  TCGplayer-reference rows never enter a basket (`tests/basket-sources.test.ts`).
- The shipping refresh workflow (`.github/workflows/shipping-rates.yml`) runs
  monthly at 03:17 UTC and on dispatch, and uploads the rebuilt snapshot as an
  artifact. It never commits or opens a PR (the stricter of two ported tests
  wins); the owner commits the file.
- `/tools/box-value` (which summed one copy of every printing) is replaced by
  `/tools/box-ev`, a real expected value. Every rate in `pack-composition.ts` is
  `sourced: false`, set low on purpose, and the page says they are community
  estimates.
- Demand snapshots and `history/rising.json` are files on the `data` branch,
  written by the import's history step, never Prisma tables.
- The public deck library, the deck price watch (Premium, 10 lists) and the card
  view and search counters follow RC. The counters are the one public write to
  `Card` (bots dropped, per-IP caps), the same exception RC records.
- Plan-click surfaces stay `[a-z-]` scoped: `gate:basket-limit`, `inline-deck`,
  `inline-published-deck`.

**Why.** The owner asked for a copy-paste of RiftCompare with only branding and
cards changed.

## 2026-10-04 — My binder, the set checklist and the share link (RiftCompare parity)

The owner asked for RiftCompare's portfolio, set tracker and share link
("all the premium features"). Ported from RiftCompare's `portfolio/**`,
`getPortfolio`, `set-scope`, `set-gap`, `collection-csv` and `share` with One
Piece's own data; the names are "My binder" on the page and `portfolio` in the
code and URLs.

- **A card is one printing.** `CollectionCard.cardId` is `Card.id` (the
  TCGplayer productId), so owning the standard Shanks OP01-120 does not tick its
  Parallel or its Manga, and the quick-add and the CSV take a printing, never a
  guess. The foil toggle is hidden (`Card.finish` decides it). Free accounts hold
  50 cards (`FREE_PORTFOLIO_LIMIT`, the reversal recorded under "Wave-2 free
  limits"), Plus and Premium are unlimited; the cap of 999 copies per card and the
  2,000-row read cap are RiftCompare's.
- **The value is the visitor's market.** `Card.low<MKT>` × the condition
  multiplier × quantity, with 7-day and 30-day deltas. The chart walks back from
  today's local total with `marketUsd` ratios (falling back to `lowUsd`) from the
  new `history/recent/<bucket>.json` files (last 120 days per bucket, written by
  the import beside the full bucket files, read by `getRecentHistory` pinned to
  `Meta.historyRef`, falling back to `products/<bb>.json` before the first
  import writes one). `METHODOLOGY_BREAKS` is empty: OP Compare's index has had
  no re-basing. The chart says "daily since 2026-10-03, movement from TCGplayer
  market prices (US), shown in your currency" because that is exactly what it is.
- **Set checklist scopes are One Piece's.** "Base set" is the standard and reprint
  printings, Leaders included, DON!! excluded; "Every printing we track" adds
  Parallels, Manga, SP, Treasure Rares, special foils and DON!! cards. A promo
  printing in a booster group is in neither. Progress counts only cards with a
  store price, a pre-release set shows "N revealed" with no denominator, and the
  missing list reads `1 Shanks OP01-120 (Parallel)`. `getSetChecklist` reads one
  grouped Offer query (in stock, under 72 h old, real stores and TCGplayer,
  never eBay).
- **CSV keys.** A TCGplayer `Product ID` / `TCGplayer Id` column is exactly
  `Card.id`; otherwise a number plus a printing column; a bare number matches only
  when exactly one printing carries it, else the row is skipped with a reason
  (the matcher rule: an ambiguous listing is skipped, not guessed). The export
  (`opcompare-binder-YYYY-MM-DD.csv`) writes `printing` and `tcgplayer_id` and
  round-trips. 500 KB, a write budget and limit ordering as on RiftCompare.
- **Replacement cost is before postage until Best Basket lands.**
  `/api/portfolio/replacement` prices each held copy at its cheapest real-store
  or TCGplayer listing in the visitor's market and labels the total "before
  postage"; the store-by-store plan is Premium's, through the tools track's
  `planBasket` (the integrator swaps it in). Never eBay.
- **The share link has no image of its own.** `/c/<token>` is noindex/nofollow,
  valued in the viewer's market, with the token from `crypto` random, the
  projection selecting fields by name so cost basis and notes can never appear,
  and rotation as the only revocation (the old token 404s). It uses the root
  fallback share image (CLAUDE.md "Share images": a per-user image would be a
  loader and a render for every share, with the owner's collection in a public
  PNG).

## 2026-10-04 — Email: OP Compare's own Resend account, script-side, off until configured

Everything RiftCompare emails (alerts, release alerts, the welcome email, the
weekly newsletter) is ported, and **all of it is dark until the owner adds both
`RESEND_API_KEY` and `EMAIL_FROM` as GitHub Actions secrets**. It follows the
eBay keyset discipline (CLAUDE.md "The eBay API"):

- **Script-side only.** Sends run in `scripts/alerts.ts` (after each import),
  `scripts/email-hourly.ts` (`email.yml`, minute 23, its own concurrency group)
  and `scripts/newsletter.ts` (`email-weekly.yml`, Fridays 21:00 UTC). A request
  never sends: the newsletter and anonymous-watch routes write a row
  (`welcomeSentAt` / `confirmSentAt` null) and the hourly outbox sends, under
  the same caps. The provider hosts live only in `src/lib/email.ts`, the key
  names only there and in `email*.yml` / `import-prices.yml`; no `src/app` file
  imports the mail module or a module that sends; the newsletter's signup half
  is `lib/newsletter-signup.ts` so a route imports no sending code
  (`tests/no-email-api.test.ts`, modelled on `no-ebay-api`).
- **Off is a green no-op, refused is red.** `isEmailEnabled()` needs both
  secrets. Off, every runner records Meta `email` = `off` and exits 0 having
  claimed and stamped nothing (so the first run with email on still finds every
  pending row). A key that is set but refused by the provider (401/403) records
  `off` again and exits 1. The runners record Meta `email` first;
  `getEmailStatus()` is what every page reads, so **no sentence promises an
  email and no email field renders while it says off** (`EmailOnly` wraps the
  footer, `/movers` and article newsletter forms and the release-alert forms).
- **Alerts are delivered in-app while email is off.** The alert run still does
  its work: every trigger an account would have been emailed writes one
  Notification (the member track's `notify()`) and `lastFlaggedAt`, and the
  baselines advance exactly as after a send. `lastNotifiedAt` and
  `lowestEmailedCents` are NEVER written by a flag (they mean "an email was
  sent"); the weekly cap and the 20 h paid cooldown read the later of the two
  stamps so the in-app cadence matches the email one; the send budget, the
  per-run caps and `AlertMute` (a pause of email) do not apply to in-app
  delivery. An anonymous watch has nowhere in-app to go, so it is held, baseline
  kept, until email is on (and the anonymous form that creates one is itself
  hidden: it needs email on AND `NEXT_PUBLIC_ANON_ALERTS=1`, the owner's call).
- **Every alert email** carries a plain-text part plus `List-Unsubscribe` and
  `List-Unsubscribe-Post`. The one-tap links (stop, snooze, target) are signed
  with a key derived from a NEW shared secret, `EMAIL_LINK_SECRET` (label
  `alert-action:v1`, 32+ characters), failing closed when unset: never
  `AUTH_SECRET`, which does not go into Actions. A GET of an action link only
  redirects to a confirm card; only its POST acts, so mail scanners are harmless.
  The inbox's own Unsubscribe pauses (`AlertMute`, watchlist kept) and never
  deletes.
- **Resend's 100 a day is the binding constraint**, so the budget is RiftCompare's
  (`ALERT_DAILY_BUDGET` 50 distinct addresses per rolling 20 h, the free run at
  most 35, first-contact 20, first-price 25, paid cap 30, 30 confirmations a
  day) and the welcome email has no trial variant (OP Compare offers none; its
  copy names only what ships, from `free-limits.ts` and `plans.ts`).

## 2026-10-04 — The alert engine over Offer rows

RiftCompare's price-alert rules, unchanged in logic, over OP Compare's schema
(`scripts/alerts.ts`, modes `free` / `paid` / `baseline`, an `ImportRun` row of
kind `alerts`, red only for a refused key):

- **The alert price** (`lib/alert-price.ts`) is the cheapest in-stock Near Mint
  (or unstated-condition) copy at a real store (`source` starting `store:`) or
  TCGplayer's cheapest US listing (`tcgplayer`), updated within 36 h; states
  priced, sold out or unknown (a row 36–72 h old, or up to 14 days, still claims
  stock, so an outage is never read as a sell-out). **Never `ebay*`, never
  `Card.low<M>`** (which includes eBay). The below-market trigger reads
  `Card.marketUsd` converted with OP's fx table; the US guard is TCGplayer's own
  cheaper listing. Postage is not known for OP stores, so an alert says "item
  price, postage extra" and never "delivered".
- **Rules** (all RiftCompare's, constants quoted by `/alerts` and pinned by
  tests): free new low ≥5% and ≥50 minor units against the emailed watermark or
  the drop anchor, one email a week; first price and pre-order; restock after
  ≥20 h sold out across 2 runs; a paid target (re-fires only a further 10%
  down, re-arms above the target); below market ≥15%; a 40% outlier low held one
  run; snooze; pause.
- **Workflow.** `import-prices.yml` runs, after a successful import only
  (`!cancelled() && steps.import.outcome == 'success'`): free then paid after the
  07:07 import, paid only after 19:07, and on a manual dispatch the `alerts`
  input (`none` the default, `baseline` after a matcher change moves every
  baseline and sends nothing, `free` recovers a missed 07:07 run). Deck watches
  run in the paid mode through the tools track's `runDeckWatches` (loaded by
  name, skipped if absent), then the sealed watches and the release alerts, all
  under one shared send cap.
- **Sealed watches** are checked "twice a day" (the import cadence), restock
  after ≥5 h sold out at every real store, 6 h restock cooldown and 24 h for the
  rest, real stores only (never eBay, never the TCGplayer reference row), and no
  at-RRP alert until there is an MSRP table.

## 2026-10-04 — Release alerts and the weekly newsletter

- **Release alerts** are generalised over every set whose `releasedOn` is in the
  future or within 30 days (RiftCompare's was one hard-coded set). A signup is
  one field, no account: singles once a `store:%` in-stock Offer exists in its
  market (a card-page signup waits for that card's first store price), and a
  restock of a sold-out presale product while the set is unreleased. At most two
  emails per address per set and 40 a run; unsubscribe is POST-only. The forms
  render only while email is on (`ReleaseAlertSlot`) on `/release-dates`, set
  pages, presale sealed pages and unreleased card pages.
- **Newsletter.** One edition per ISO week (`editionKey`), stamped per subscriber
  only after a successful send, so a re-run resumes. Movers are OP Compare's own
  (TCGplayer market against 7 days ago, `Card.change7d`, US$1+ cards; "best
  value" is under the 90-day high), read once per run by one narrow uncached
  query (a script has no Next.js cache) and the same for every market, each
  market's edition adding its own cheapest listing; "new One Piece cards this
  week" is `Card.firstSeen` in the last 7 days. No Index, peaks or articles
  sections: each would need a cached loader the script cannot call, and every
  figure that is there comes from rows the site shows. The sponsor slot is
  built with an empty booking list (a labelled "sponsor this newsletter" line
  until the owner adds one).

## 2026-10-04 — Catalogue parity (wave 2): what was ported, and where OP differs on purpose

The card, sealed, price-guide, set, market, movers, guide, ad, support and
release-date surfaces were brought to RiftCompare's feature set, ported from its
files with the copy rebranded. The choices that are not obvious:

- **Rendering model kept.** OP's card, sealed and `/sealed` pages render per
  request (`getCountry()` over cached loaders), so every port is a server
  component that takes `country`; nothing moved to RiftCompare's market-neutral
  ISR. `CardMarketsTable` is therefore a server component, not a client one.
- **The card "About" narrative is written for One Piece, not translated**
  (`src/lib/content/card-narrative.ts`). It keeps RC's rule (a sentence is
  emitted only when the data on that render backs it) and branches on Leader /
  Character / Event / Stage / DON!!, printing against standard print, TCGplayer
  market against cheapest listing, cross-market spread, 7/30-day move, 90-day
  high and set percentile. It runs 250-450 words on a fully priced card, not RC's
  ~1,000: padding to reach the number would be the failure mode the module exists
  to avoid. Tests assert no claim without data and different skeletons.
- **Title ladder**: drops the set name first, then the set code, then the long
  variant ("Manga · Alternate Art" becomes "Manga"), then "Price". Never the card
  number or the printing word; when nothing fits the SHORTEST rung ships.
- **eBay listing panels cost zero extra Browse calls.** `BrowseItem` gained
  `image`, `writePair` writes `EbayListing` (first 8 survivors, headline pick
  first) and `EbayGradedListing` in its existing transaction after a completed
  search only, and the run sweeps both at 72 h. Graded slabs reuse the raw
  matcher minus the slab words (`screenGraded`), need a known grader, and are
  dropped below half the raw reference; they never become an Offer and never join
  a comparison. `ebay-plan` and `no-ebay-api` are unchanged. CLAUDE.md's eBay
  section now says the panels are display-only.
- **Store postage.** `StoreInfo` gained `shippingCents`, `freeOverCents` and
  `policyUrl`. Only `policyUrl` is filled: 192 of 235 stores returned HTTP 200 on
  `<base>/policies/shipping-policy` on 2026-10-04 (`STORE_POSTAGE_CHECKED`). No
  flat rate or threshold is seeded, because none could be verified from a policy
  page without reading prose, so rows still say "postage at checkout" with a
  "shipping policy" link.
- **History files carry every market (v2).** A bucket point is
  `[day, market, lowUS, lowAU, lowUK, lowSG, lowCA, lowEU]`, each low in its own
  currency; day files are v2 too. The reader pads v1 points (US only), so an old
  checkout still reads, and `chartSeries` returns `lows`. The card and sealed
  charts show the visitor's market line plus TCGplayer's market price converted
  at the indicative rate, titled "Price history (AUD · lowest price)", and say
  when a market's history starts. Non-US history begins at the first v2 import:
  nothing is back-filled.
- **/sealed filters are the URL.** `q`, `min`, `max`, `stock`, `promo`, repeated
  `kind` and csv `set` (OP's param names), applied by `lib/sealed-query.ts`; the
  page is `noindex,follow` when filtered. "In stock at MSRP" is not built: OP has
  no verified MSRP table and none was invented (`lib/msrp.ts` does not exist).
  "Sold out at every store we track" is one SQL read (`getSealedSoldOut`): every
  non-eBay row in the market fresh inside 72 h and none in stock.
- **/price-guide reuses /browse's filters** (`parseBrowse`/`runBrowse`,
  `BrowseFilters`, `FilterChips`) so the same filters give the same cards on both
  pages; the guide adds its own sort list (including 30-day and most stores),
  page sizes 50/100/200, a `?market=` override ("Prices for X from this link ·
  Use my market") and a 30-day column only when at least half the priced rows
  have one. The plain guide and a single set are indexable; everything else is
  `noindex,follow`.
- **/market**: `computeStats` ported pure over OP's chained index; the table
  ships the top 200 cards, breadth counts the whole US$1+ basket. The label is
  "US$ · TCGplayer market". No Dataset JSON-LD: there is no public index JSON.
- **Guides.** `Post` gained `category` and `faq`; the rarities and where-to-buy
  posts are guides at `/guides/[slug]` with a permanent redirect from `/blog/...`
  (done in the page, not `next.config.js`, which the tools track owns). Guides
  and blog share `ArticleView`.
- **Ads.** `AdSlot` shows a first-party house promo by default and a real AdSense
  unit only when `NEXT_PUBLIC_ADSENSE_CLIENT_ID` is a valid id; unlike RC it never
  throws in production. The loader and `/ads.txt` exist only with the id.
  `TcgplayerAd` renders only for owner-supplied creative ids in
  `NEXT_PUBLIC_TCGPLAYER_CREATIVES` and draws OP's own creative, not Impact's
  hosted image, which is seasonal art.
- **Support tickets**: `/api/support` goes through the public form gate (3 an
  hour per IP, 5 a day per account), numbers come from `Counter` inside the
  insert's transaction, shown as `OC-<n>`; no email is sent. The admin editor
  posts with POST (CLAUDE.md: admin mutations are POST); PATCH is the same handler.
- **Release calendar**: all-day events (the date is a listing date, not an
  announced hour), RFC 5545 escaping and octet-aware folding, tested.

Not done here, by design: SetOwned ticks and ReleaseAlertSignup
(collection-alerts), MostSearchedStrip and NewsletterSignup on `/movers` (tools,
collection-alerts), PriceWatchButton and SealedWatchButton (member). The call
sites use the wave-1 `WatchButton` until those merge.

## 2026-10-04: Wave-2 integration, and what the merge had to decide

The five wave-2 tracks were merged in plan order (design, member, tools,
collection-alerts, catalogue). Where two tracks edited the same file the rule
was: the design track's chrome and component APIs win (`Breadcrumbs trail`,
`Pagination totalPages/params/basePath`, `AuthForm`, the static layout), and each
other track's behaviour is mounted into it. Decisions the merge made:

- **One sign-in form.** `AuthButtons` is gone; `/login`, `/premium/start`, the
  Plus/Premium dialog and the price-alert modal all render `AuthForm`. It now
  stamps the sign-up surface (`src=`, whitelisted by `parseSignupSource`) on the
  OAuth link, so the member track's attribution survives the design track's form.
- **Best Basket owns the binder and Finish-a-set sources.** `BASKET_COLLECTION_SOURCES`
  is on. `source=set` is named by the set's SLUG (what the set tracker links with),
  priced from the tracker's own readers (`getSetChecklist`, `ownedBySet`) and ranked
  by the cheapest copy at the member's floor among stores whose postage we can price,
  read from the cached `getBasketListings` (no new query).
- **Replacement cost is delivered.** `/api/portfolio/replacement` now runs
  `optimizeBasket` over the same listing reader as `/api/basket`, so postage is
  counted once per store; the interim item-only split (`portfolio-replacement.ts`)
  is deleted.
- **One entitlement writer file.** The referral reward (off by default) writes
  through `grantReferralDays` in `admin-billing.ts`, extend-only; `referral.ts`
  no longer touches `premiumUntil`.
- **Shipping snapshot.** The 151 stores added after the 3 Oct snapshot are listed
  as `unmeasured` (priced as estimates, marked "est.") until the shipping-rates
  workflow measures them; the size guard moved from 120 KB to 200 KB.
- **History v2.** Readers written before the catalogue track's per-market points
  (`recentMoves`, `recentOf`, the portfolio and rise predictors) accept the wider
  point shape; `recentOf` keeps the file's own version.

## 2026-10-04: QA fixes after the wave-2 review

What the review found, and what was decided (items not listed were fixed as written).

- **Page titles are RiftCompare's.** Every `<h1>` that exists on both sites now
  carries RC's className verbatim (`text-2xl font-extrabold`, weight 800, with
  RC's `sm:` step where it has one). OP's `text-3xl sm:text-4xl` without
  `font-extrabold` fell through to the global h1 weight of 900. The card and
  sealed headers also use RC's row (title `flex-[1_1_12rem]`, Watch and Share in
  one `shrink-0` group, icon squares below `sm`), and `ShareButton` is RC's file.
- **No "Add to collection" bar on the card page.** RC has none there (adding is a
  QuickView and portfolio action), so the bar is gone from `/card/[slug]`; it stays
  in QuickView. The signed-out QuickView add no longer fires a request that can
  only answer 401. A holding's "Foil" mark is gone too: with no foil toggle,
  `isFoil` is the card's own TCGplayer finish, and 969 standard cards are Foil-only
  there, so the mark was on most of a binder and said nothing.
- **/price-guide follows RC's order:** stats, Prices by set, filters and table,
  Read next, "How to read this price guide", FAQ, then OP's ad and sign-up
  prompt. The set table is long (every released booster set); RC's is shorter, and
  we kept the full list because it is the page's set index.
- **Signed-out member pages are a real 307.** `/watching`, `/portfolio`,
  `/portfolio/sets` and `/portfolio/sets/:set` have a `loading.tsx`, so their own
  `redirect()` ran after the shell was flushed, and swapping it threw React error
  #310 in production (inside Next's own app router, `useMemo` after
  `useUnwrapState`; it needs the redirect to land while the stream is open, so
  dev never shows it). Two layers now: `next.config.js` redirects a visit with no
  `oc_session` cookie (307, exact path in `next`), and a `layout.tsx` for each of
  `watching` and `portfolio` (outside the segment's Suspense boundary) redirects an
  expired or invalid cookie. Reproduced with a junk cookie on a production build:
  7 of 12 loads threw before the layouts, 0 of 12 after. The portfolio layout
  cannot see the sub-path, so a stale-cookie visit to a set page returns to
  `/portfolio` after sign-in. The pages keep their own checks.
- **Box EV gives no verdict it cannot back.** Under half of the paying pools'
  cards priced (a set that has just come out) reads "too few cards priced", never
  "price is well above EV"; a positive ratio where chase pools carry 90% or more
  of the EV (one US$4,800 Parallel in a 1-in-12 pool) says a typical box lands well
  below it, and is not green. The community pull-rate defaults are unchanged and
  still the owner's call (`lib/pack-composition.ts`).
- **Sealed.** The search box applies after a 350 ms pause (RC has no text search
  there; the checkboxes were already instant). A signed-in free account gets RC's
  Plus lock on a sealed product instead of a browser heart that says "Watching"
  while the alert run never sees it; signed-out visitors keep the browser heart.
- **eBay is named only while it is live.** The home title, description and share
  copy say "+ eBay" only when `getSiteStats().ebayLive`; the tier table's first row
  reads "Compare prices across every store". The card page's "Also available on
  eBay" panel stays (it is a working affiliate search link, and says so).
- **No email promise while email is off.** The unsubscribe and manage pages say
  "reply to one" only when `getEmailStatus()` is `on`.
- **Referral reward removed, not switched off.** `REFERRAL_PREMIUM_DAYS` made a
  public OAuth sign-up an entitlement write (the code was a public `User.id`, with
  no per-referrer or per-day cap). `grantReferralDays`, the env switch and the
  profile card are deleted; attribution (the cookie and a log line) stays.
  Bringing a reward back needs the owner's approval, a CLAUDE.md amendment naming
  the writer, caps, and an account-age check.
- **Basket listings are cached per market and 32-id bucket,** not per pasted
  list. The key space is the catalogue's id range divided by 32 whatever anyone
  pastes; a bucket holds at most 32 cards x about 75 sources. The wrapper
  `getBasketListings(country, ids)` is not cached and filters the buckets.
- **CLAUDE.md names `/tools/best-basket` and `/alerts/action`** among the pages
  that may call per-user libraries (a member's own deck watch and remembered
  minimum condition; a signed action token), and `tests/app-no-db-import.test.ts`
  pins the set.
- **Hardening.** `sameOrigin` on the session mutation routes that lacked it (deck
  watches, decks, basket, checkout, alerts subscribe); per-user limits on
  `/api/me`, collection edits, notification read and plan upgrade, and a per-IP
  limit on the unsubscribe GET (all per instance, soft, like the rest); CSV
  export prefixes a text cell that starts with `= + - @` with an apostrophe
  (the importer reads no text column, so nothing strips it).
- **Not changed.** The tier lineup in `plans.ts` is the owner-confirmed copy of
  RC's eighteen rows (prices are untouched); the Stripe product text follows it on
  the next `stripe-setup` run. The shipping-rates workflow only uploads an
  artifact, and its header now says so.

## 2026-10-04 — Launch offer: the first 50 accounts get 30 days of Premium free

**Decision.** A popup invites signed-out visitors to create a free account, with
a live counter ("13 of 50 free months left"). The first 50 NEW accounts get 30
days of Premium, no card. When the counter reaches 50 the popup disappears.

**How.**
- *The grant* is `claimLaunchPromo()` (`src/lib/launch-promo.ts`), called once
  from `upsertOAuthUser` for a row that was just created. One transaction: an
  `INSERT … ON CONFLICT DO UPDATE … WHERE value < 50 RETURNING` on the `Counter`
  row `launch-promo`, then the `premiumUntil` write. Concurrency is safe by
  construction (60 simultaneous claims against the local DB granted exactly
  50), a failed grant gives its slot back, and a failed promo never fails a
  sign-in. It stacks like an admin grant (max(now, current) + 30 days), takes the
  tier "premium" only for a lapsed or free account, and never touches Stripe.
- *The popup* (`LaunchPromoPopup`, mounted once in the root layout, client-only,
  no session read) uses the nudge machinery: signed-out visitors only, from the
  2nd page view, 8 s after it became eligible, never over another dialog or
  while typing, once per visit, 3 days' rest after a dismissal and gone after
  three, never on /login, /premium or account pages. It reads the counter from
  `/api/promo` (`getLaunchPromo()` in `data.ts`, 30 s cache, fails closed to "none
  left") only once it could actually show.
- *The welcome* toast says the 30 days have started (`?promo=1` from the OAuth
  callback, stripped like `?welcome=`).

**Entitlement rule amended.** CLAUDE.md's list of Premium writers gains this
one claim (owner's request). It is not a trial policy change: subscriptions,
prices and the Stripe flow are untouched, and Premium shows "Opening soon" for
purchases until Stripe is set up regardless.

**Known limits.** One person with several Google accounts could take more than
one slot; the cap (50 × 30 days) is the whole exposure. Accounts that existed
before this shipped do not qualify. To end the offer early, set `LAUNCH_PROMO_ENABLED = false` in
`src/lib/launch-promo-shared.ts`: grants stop and the popup disappears together.

**Also fixed.** `anyDialogOpen()` treated the always-mounted, aria-hidden phone
menu (`[aria-modal="true"]`) as an open dialog, which silenced every corner nudge,
the Premium slide-in included, since the wave-2 design merge. It now ignores
aria-modal elements inside `aria-hidden` or `inert`.

## 2026-10-05 — Outbound click tracking removed

**Decision.** The site no longer records outbound shop clicks. Removed:
`OutboundBeacon` (the one global click listener in the root layout), `/api/click`,
`src/lib/click-event.ts`, `/admin/clicks` (page, nav link and dashboard tile),
the "Outbound clicks by store" panel on `/admin/demand`, and the ClickEvent
retention step in the twice-daily import.

**Why.** Every outbound click was one database write through a serverless route,
and with the traffic the site now gets that cost Neon network credits. The owner
asked for it gone from the website and the admin.

**What stays.**
- GA's `buy_click` (client-side, sent to Google, not to our database) is the one
  count of outbound clicks, with the same `data-retailer` / `data-card` /
  `data-surface` attributes on the links.
- The Plus/Premium interest beacon (`/api/premium/click`, `PremiumClick`,
  `/admin/premium`) is a different, low-volume signal and is untouched.
- The `ClickEvent` model stays in the schema as a retired table (nothing reads
  or writes it), so the schema push never has to drop a table; its old rows are
  still in the database until someone drops it by hand.
- `tests/no-outbound-click-tracking.test.ts` fails if any code touches the table
  or the route comes back.

## 2026-10-05 — A bare "Name [Set]" title yields to the SKU number

**Report.** A wrong-item price report (Rhystic Nostalgia Gaming, AU): looking at
OP16-015, the store link went to OP16-052, "a few other stores have the same
issue". Cause: the store lists FIVE different cards under one title,
"Monkey.D.Luffy [The Time of Battle]" (handles `-the-time-of-battle`, `-1`
… `-4`; SKUs OP16-015, -052, -095, -022, -034). The name path knew exactly one
catalogue key for that title (OP16-015's plain TCGplayer name), took every
product, and the cheapest (the OP16-052 copy at A$0.50) won the offer.

**Rule.** `matchStoreProduct` ranks the SKU number above the name path: a name
match is refused when the product's SKUs agree on a different card number, and
the SKU path then picks the right card (or misses). In the import, products
whose bare title is shared by several of one store's name-path matches (no SKU
number to tell them apart) are all skipped as `name-duplicate-title`.
Understated, never wrong. A real-title test is in `tests/match.test.ts`.

## 2026-10-05 — Language tags, a universal SKU check, and Vercel buy-click events

**Report.** The Card Spot (AU) priced a Japanese OP16-118 as the English card.
The title ("OP16-118 Portgas D.Ace - One Piece TCG") carries no language; the
Shopify `tags` ("Japanese") and body do.

**Rules (all price paths, now and for future imports).**
- `foreignByTags` (tags / product_type: Japanese, Chinese, Korean, Thai,
  French, German, Italian, Spanish, Portuguese) is a miss `foreign`; the import
  passes each product's `tags` and `product_type` to `matchStoreProduct`.
- Whatever path matched, a product whose SKUs agree on a card number different
  from the matched card's number is a miss `sku-number-mismatch`.
- The shared-title guard counts ALL of a store's products by trimmed lowercase
  title, not only name-path matches; a name match with no SKU number whose
  title is shared is a miss `name-duplicate-title`.

**Buy-click events.** Outbound clicks are measured with Vercel Web Analytics
custom events: `track("buy_click", {retailer, network, page, surface, card})`
from a capture-phase listener on `a[data-retailer]` inside the consent-gated
analytics mount (`src/lib/buy-click.ts`). Nothing reaches our server or the
database, so no Neon transfer. Custom events need a Vercel Pro plan; see
Analytics → Events. The GA `buy_click` event is unchanged.

## 2026-10-05 — The eBay chase strip, site-wide

The homepage and the main hubs (price guide, movers, market, sets, sealed,
articles) carry `EbayChaseStrip`: the twelve dearest chase printings, six shown.
A tile is the live eBay listing in the visitor's market when the script-side
eBay pass has a fresh one, otherwise the card's art linking to an affiliate eBay
SEARCH for it, so the strip works before the eBay keys exist. The market is
picked client-side (`useCountry`), so the host pages stay static. One cached
loader (`getChaseStrip`), no eBay call from a page, labelled "Ad", disclosure
beneath, `data-ad-placement` so ad-free members never see it. Pinned by
`tests/ebay-chase-strip.test.ts`. The footer eBay box and the card-page banner
are unchanged.

## 2026-10-07 — Rising Cards and Best Basket become Premium tools

**Owner's call.** Demand Finder, Rising Cards and Best Basket are Premium
features.

- **Demand Finder** was already Premium (the top 10 most searched this week
  stay free, here and on /movers). Unchanged.
- **Rising Cards**: the full ranking now needs Premium (`isPremium(user,
  "premium")`); Plus drops to the same top-3 preview a free account sees.
  The gate's plan button asks for Premium.
- **Best Basket**: Premium only. `/api/basket` answers 403 `{ premium:
  "required" }` to anyone else before any rate limit or read; the free and Plus
  delivered-total preview (five a day) is gone, as are its rate limits. The
  page renders the tool only for Premium and shows a Premium wall otherwise;
  the deck pricer stays free.
- `TIER_COMPARISON`, `PLAN_FEATURES`, the dashboard tool list, the /tools hub
  and the deck pages' signup prompts say the same. The admin demand and rising
  pages and the daily demand snapshot files (data branch, `history/demand/`)
  were already in place.

## Preview deployments are off; production ships weekly or on request — 2026-10-08

The owner asked for no preview deployments and production only on the weekly schedule unless they say they want one now. OP Compare built every preview ("previews are not gated"); with no human reviewing previews it only spent build minutes and, on a Pro team, preview builds that read data. `scripts/vercel-ignore-build.sh` now skips every preview and development build; a preview happens only when the commit subject carries `[preview]`, which is added only when the owner asks. An unreadable commit message never builds a preview (production still fails open, since "never deploys" is worse than "deploys too often"). `[deploy]` stays production-only. Rejected: a `vercel.json` `git.deploymentEnabled` map per branch (it needs one entry per branch name and the Annex's data-branch entries already show how that rots) and turning off the GitHub integration (it would also stop production).

## The product-name grammar is ported at C0, with a dash layer and a gated source-set token — 2026-10-08

2026-10-08. `parseTcgName`, `labelOf`, `setDisplayName`, `setCodeOf`, `parseSealed`, `cleanEffect` and `largeImage` (src/lib/catalog.ts) are real code at C0, not stubs. The token classes, their order and the greedy longest-phrase consumption are those of `design/magic-tools/parse_name.py`; the treatment keys are the closed vocabulary of `constants.ts` (`TREATMENT_BY_SYNONYM`, prefix synonyms such as "neon ink*" take the rest of the token), because the reference's own key table differs from it.
Three things the reference does not have were decided here. (1) A " - tail" is classified once, in this order: event ("1996 Bertrand Lestree"), pack ("Clear Pack"), "Thick Stock", "Full Art" / "JP Full Art", emblem, a language word, treatment words only, a basic land's variant word ("Forest - Guru"), else "reskin?". "reskin?" means only "possibly a flavor-name pair": which side is the oracle name is the Scryfall join's decision, never the grammar's. `base` drops the tail of the first five kinds and keeps it for the rest, because there it is part of the name; `core` always keeps it (the slug input is unchanged).
(2) A token equal to a Scryfall set code is the source set (`src`) only in bucket kinds (promo, promo-pack, list, secret-lair, gold-border), and an exact treatment synonym wins over a code: "(CE)" is Collector's Edition, "(Man)" in Alliances is an art word, "(4ED)" in World Championship Decks is the source. "WAR Bundle" is the Bundle key plus `src`, as 3.3 says.
(3) Whatever the vocabulary does not know stays as text in `words` (one entry per token, in name order) and reaches `Card.label` through `labelOf`; there is no "raw:" key. A language word sets `lang` and adds its `lang-*` key when there is one. The exact text of a placing ("3rd Place") and of a special foil stays in the label.
Evidence: the 57 fixtures parse as their `rule` column says; `check-catalog` still reports 0 of 57 fixture mismatches and 111,839 slugs with 3 collisions; on the 3,003 distinct parenthesised tokens of the real singles 2,944 get the reference's class and the 59 others differ only where the closed vocabulary has no key ("Art Series", "Emblem", "Oversize", "Mythic Edition") or has a different one ("Phyrexian" is an art key, special foils share `otherfoil`); 1,544 of 111,839 names keep unknown words (597 distinct), parsed in 0.8 s. Reversal: change the table in constants.ts (append-only) or the order in `parseTcgName`; the fixtures and a real title per rule go in `tests/catalog.test.ts`.
Superseded in part by `WP01a-name-grammar-families.md`: the source set is also read in the kinds deck, unset and oversized and only in upper case, and the 59 differing tokens of the evidence below are 28 on a re-run. The rest stands.

## C0 places the check scripts one directory deeper, so their paths and one test helper follow

2026-10-08. `checks/*` of the contract tree land as `scripts/contract-checks/*` (Annex H). Their relative imports (`../src/...`, `../tests/...`) and the one place that reads `removed.json` were written for the old depth, so C0 rewrites the specifier prefix only (and gives `frozen-imports.cjs` both locations of the table). `tests/helpers/import-graph.ts` now treats any file under `src/lib/data/` as the data leaf whatever the import is spelled, because the relative form (`"../data"`, 33 files) made `public-no-neon` count the stub definitions (12 false offenders) and hid 12 data routes from `build-no-data`. Baseline at C0: build-no-data 68, public-no-neon 8. Every item is listed in `requests/AMENDMENTS.md` (C0-1 to C0-9) with the numbers.

## The SEO facets are derived from the vocabulary, with an authored intro for each page — 2026-10-08

2026-10-08. `src/lib/facets.ts` no longer has a hand-kept list. `TREATMENT_FACETS` is the non-hidden entries of `TREATMENTS` (61 pages, slug = key, `/cards/treatment/[key]`), `RARITY_FACETS` the eight rarities (`RARITY_SLUGS`: mythic, rare, uncommon, common, special, promo, land, token), `TYPE_FACETS` the ten primary types (`/cards/type/creature`, key = `PrimaryType`, the value `getFacetCounts` counts). A key appended to `TREATMENTS` is a page the same day, and `tests/tools-pure.test.ts` fails until `TREATMENT_INTRO` has a sentence for it (the OP test could not fail, its list was hand-kept). Every intro is written from the catalogue's own names (Showcase Scrolls is The Lord of the Rings, Silver Scroll Foil is Mystical Archive, Mana Foil is Foundations, Concept Praetors are Phyrexia: All Will Be One) and states no ruling.
The OP names stay where the meaning survives so importers keep compiling: `PRINTING_FACETS` is `TREATMENT_FACETS`, `printingFacetHref` is `treatmentFacetHref`, `UNFACETED_PRINTINGS` is `UNFACETED_TREATMENTS`. `leaderSlug` is gone (there is no Leader; a commander page is addressed by its Oracle slug, 4.1), which turns its four importers red until WP06, WP11 and WP15 rewrite them: that is the intended signal (AMENDMENTS 2026-10-08). `standard` has no page: it is every card without a treatment. The keyword extraction that `tests/tools-pure.test.ts` pinned for OP's bracket keywords moves to WP08 with `keywords.ts` (REQ-WP01a-1).

## The families the closed vocabulary leaves outside the reference grammar are decided one by one — 2026-10-08

2026-10-08. `design/magic-tools/parse_name.py` classifies the parenthesised tokens of a TCGplayer name with its own key table; `constants.ts` is the vocabulary that is persisted, so it wins wherever the two differ. Re-run on the 3,003 distinct tokens of the 111,839 real singles, 2,975 get the reference's class and 28 differ (the C0 note counts 59 with a class mapping that could not be reproduced; the 28 are the whole of today's difference). Each family is now a row of `tests/catalog.test.ts` with real product names:
- **Class words, no key:** "(Art Series)" 54 products, "(Oversize)" 32, "(Emblem)" 19. The class (`productClass`: group kind, Scryfall layout or `oversized`, rarity T) already says it, a key would only duplicate it and add three pages to `/cards/treatment`. The word stays in `Card.label` and in `words`.
- **Japan:** "Japan Junior Tournament" 11, "Hobby Japan Reprint" 5, "Japan 4/29/99" 1 are events and reprint lines, not the Japan Showcase art key (`jp`): label text. "Japanese Promo / Alternate Art / Exclusive" (7) and "Chinese Simplified / Traditional" (2) become the language key plus the rest as text ("Japanese · Promo").
- **Keys that exist and the reference lacked, kept:** Schematic (126), No PW Symbol (121), Phyrexian as an ART key (38), Showcase Scrolls as `scroll` (349), IE (301, the reference read it as Collector's), "Borderless Poster" and "Sketch Showcase" as one key, Archenemy and Planechase 2012, the six special foils as `otherfoil` with their exact text in the label, WPN and Launch Party with the rest of the token as text.
- **No key added:** nothing in the 3,003 tokens that appears often enough and means one thing; 589 distinct words stay text (artists, events, version marks), 1.3% of names, as the contract designed. the treatment vocabulary of `constants.ts` is unchanged, so the 74 keys, the 128 synonyms and every published `treat` string keep their meaning.
Two real bugs of the C0 port are fixed: a language key found inside a longer token ("Chinese Simplified") now sets `ParsedName.lang`, and the source set (`src`) is also read in the kinds `deck`, `unset` and `oversized` (the Duel Decks Anthology "(EVG)", "(GVL)", "(JVC)", "(DVD)", Unglued "(UGL)", oversize "(AFR)", "(M10)": 47 products whose set code was text), in its printed upper-case form only, so "(Man)" in Alliances is still an art word. 1,544 names with unknown words become 1,497. `labelOf` keeps the text of hidden keys ("No PW Symbol", a language) because `hidden` means "no filter page", and two products that differ only there must not read the same.
Evidence: `tests/catalog.test.ts` (57 fixtures, 45 family rows, and with `MTG_LAB` all 111,839 names); reversal: change `SOURCE_KINDS` in catalog.ts or append a key to `TREATMENTS` and its pin in `tests/constants.test.ts`.

## `db-push-safe.sh` applies `prisma/sql/post-push.sql` after every push (R20) — 2026-10-08

2026-10-08. `prisma db push` resets what Prisma cannot model, and the private schema has one such thing left now that the public tables are files: the fill factor of `CardStat`, the sampled view and search counters that are rewritten all day (`ALTER TABLE "CardStat" SET (fillfactor = 85)`, so updates stay in the page). The header of `post-push.sql` promised that the script runs it; the script (OP's, which only knew the added-unique-constraint exception) did not. It now runs it after the plain push and after the retry that waves through an added unique constraint, with `prisma db execute --file` first and `psql -v ON_ERROR_STOP=1` as the fallback, and a failing post-push fails the run. The file is idempotent and may only contain storage parameters of tables that exist (`tests/schema-private.test.ts`).
Evidence: against a scratch database (`mtgcompare_wp01a`) the script created the 28 tables and the reloption read back `{fillfactor=85}`; a second run changed nothing. Reversal: delete the `post_push` calls; the fill factor is a performance setting, nothing breaks without it.

## An Intro Pack is a Starter Product, not a Booster Pack — 2026-10-08

2026-10-08. `SEALED_RULES` put a product in "Booster Pack" as soon as its name had the word "pack", before it looked for starters, so the 172 Intro Packs of the 2010s ("Eldritch Moon - Intro Pack - Shallow Graves": a 60-card deck, two boosters and a guide) were counted as booster packs: 22% of the 768 "Booster Pack" products of the 2026-10-07 snapshot. Sealed pages, the Box EV pools and "cheapest pack of a set" would have read a deck price as a pack price. One rule is inserted before "Booster Pack": `\bintro pack\b` gives "Starter Product". Counts over the 3,712 sealed products: Booster Pack 768 to 596, Starter Product 510 to 682, the other nine kinds and the 48 "Other" unchanged. Theme Boosters and Play, Promo and Set Booster Packs stay booster packs (they are packs of cards). `sealedKind` is a pure function re-run on every import, so nothing persisted changes meaning. Evidence: `tests/constants.test.ts` (four real names), a sweep of all 3,712 names with the old and the new rules. Reversal: delete the rule.

## Tests that need the research snapshot skip unless `MTG_LAB` names it — 2026-10-08

2026-10-08. The 118,601 Scryfall printings (79 MB), the 111,839 singles and the 454 TCGCSV groups are research data, too big to commit (`tests/fixtures` carries only the 57 products and the 454 groups). The tests that sweep them (`catalog` for the collision count and the grammar invariants, `legalities` for the 23 Scryfall keys, `resolve` for the one-or-two products of a locator) run when `MTG_LAB=<snapshot directory>` is set and otherwise skip with that message; they never fail for a missing file and never fall back to a path outside the repository. Everything else in those files runs on inline real data (real product names, real Scryfall `legalities` objects, real oracle type lines and keywords). The check scripts of `scripts/contract-checks/` take their big inputs as arguments (`check-catalog.ts --fixture-base=<dir>`, `check-policy-snapshot.ts --snapshot=<file>`, `count_indexable.py <file>`) instead of the environment variables the contract tree used (`FIXTURE_BASE`, `POLICY_SNAPSHOT`), which `tests/env-names.test.ts` flags as unlisted reads; without the file they print SKIPPED and exit 0, so `npm run check:pure` works on a machine that has no lab. They name no default path either (the contract tree's copies pointed at the scratch directory of the session that built it, which has no business in a public repository): the real-data walk passes `--fixture-base` and `--snapshot`.

## A TCGCSV copy older than the published day is refused (F0) — 2026-10-08

2026-10-08. The gate (S0) compares the source stamps with the pointer for equality only. A stale mirror or a re-run from an old cache directory would publish yesterday's prices under a pointer whose `priceDay` moves BACK, and the site would read them as today's (the pointer reader's lagging-CDN rule keeps a newer memo, but a newer `seq` with an older `priceDay` is what it is designed to accept). `buildPhase` (catalog) now throws F0 when `priceDay < prev.priceDay`. The market index in `hist/index.json` and the per-unit series already refuse an older day (`appendDay`, and the index now keeps its last row).
Cost: a deliberate backfill of an older day needs `IMPORT_FORCE` plus a rollback of the pointer first (not offered).
Evidence: tests/import-idempotent.test.ts "S10 rules" (an older day leaves series and index as they were).

## import:bootstrap writes the published tree to a directory, with no git, no network and no store stage — 2026-10-08

2026-10-08. M1 needs a dataset the reader serves before any data repository exists. `scripts/bootstrap.ts` runs S1..S7 and S10..S12 through the same `buildPhase` the Actions job uses, into `PLANE_DIR` (default `.data`, gitignored): `v1/**`, `latest.json` (ref = the sha-1 of the manifest, repo `local/dir`) and `status.json`. It validates like the publisher (phase-aware validator plus the write-once rules), and re-running it over the same directory is the idempotent re-run of Annex C check 15: the same price day writes byte-identical shards and moves only `status.json` (written 1, unchanged 7,244 on the 2026-10-07 data). The first run is a history cut (the base is written, the tail empty); a later cut follows the Sunday-every-28-days rule.
Cost: nothing is tagged, pushed or verified through raw; the platform checks of 12.14.1 stay unverified here.
Evidence: 7,245 files, 71.0 MB in 36 s on the full data (454 groups, 109,465 paper printings), 0 validator problems; tests/import-idempotent.test.ts.
Reversal: none needed; a data repository replaces the directory by running `scripts/import.ts`.

## A day whose history was skipped (F7) keeps the change figures of the last recorded day — 2026-10-08

2026-10-08. F7 (under 80% of the tracked units priced, or over 30% of them moving more than 50%) skips the history append and leaves every `hist/*` file as it was. The px rows of that day were then written WITHOUT their change columns (c7, c30, hi90), because those come from the history stage: measured on nine ordinary mini days followed by a half-priced one, every tracked unit lost its figures and `mv/up-*`, `mv/down-*` went from 40 rows to 0, so the movers pages, the `rising` sort of the browse index (`ix/p` `t` rows) and the arrows of the home page were empty for a day, although the only thing wrong with the source was a half-empty price file.
`writeCatalogueFiles` now carries the change columns of the previous px row for the finishes that are still tracked whenever the history stage produced no figures (`carryStats`); the sealed rows carry their `change7d` the same way, and `mv/recent.json` was already kept. A unit that is unpriced that day is still not listed as a mover (it has no price to list).
Cost: for one day the change figures describe the last recorded day while the price beside them is today's; the run record and `guards.priceSanity` already say the history was skipped.
Evidence: tests/import-idempotent.test.ts "an F7 day keeps the change figures of the last recorded day" (fails without `carryStats`).

## ix/f lists only offers whose store run is at most 72 hours old — 2026-10-08

2026-10-08. The flat offers of the Plus store picker (`ix/f`: uid, market, store, price) carry no run time, so the reader cannot apply the freshness rule to them the way it does to `of` rows (through `ss/runs.json`). The writer built them from every `of` row with the in-stock bit, so a store whose site had been down for four days kept its offers in the picker at their old prices, while `un` and `ix/s` (which `aggregate` computes with the 72-hour rule) already said "no store has it".
`writeBrowseIndex` now takes the rule as a predicate built from `ss/runs.json` and the run's clock (`ctx.offers.asOf`, else now): an offer is flat-listed only when its (store, market) run is at most `STALE_HOURS` old. `of` rows and `ss/runs.json` are unchanged, so the pair's rows return the moment the store is read again.
Cost: a re-run of the same day after an offer crossed the 72-hour line changes `ix/f` (a real change, not noise).
Evidence: tests/import-failsafe.test.ts "a vanishing store" (8 flat rows at 0, 24 and 47 hours, 0 at 73 hours, 3 after a good read; fails with the old filter).

## S10 rules the tests pin: retried day, cut-day re-run, half-priced day — 2026-10-08

2026-10-08. Four rules of the history stage, each with a test.
(1) `appendDay` is the only append: the same price day twice replaces the last point, a missed day is a null run, an older day is refused.
(2) A re-run of the cut day is still the cut day (the base is rewritten, the tail stays empty), so a retry of the Sunday run does not turn the cut into an append.
(3) F7: under 80% of the tracked units priced, or over 30% of 100 or more compared units moving more than 50%, skips the history for that day and leaves every history file untouched; prices still publish and the next day's append makes a null gap.
(4) The market index chain refuses a day older than its last row.
Evidence: tests/import-idempotent.test.ts. A 60-day property test (40 seeds, about 3,000 runs) kills the run after S10 and runs it again, retries a finished day, corrects a day's prices, skips days, has half-priced days and moves units in and out of tracking, and compares every decoded series and the index with a model.
Mutation-tested: making S10 append a retried day as a new day fails it and "S10 rules".

## ix/k carries the Scryfall id of a row only where the list tile needs it — 2026-10-08

2026-10-08. The first bootstrap of the full data failed the validator with FILE_TOO_BIG: every `ix/k-<n>.json` (8,192 rows) was 1.04 to 1.25 MB against the 1,000,000-byte cap, and the `sid` column (36 characters per row) was 31% of the file. A list tile reads the Scryfall id only when it is the image: when the row has no TCGplayer scan (`CARD_FLAGS.TCGIMG` unset) or a back face exists (`DFC`). Everywhere else the card page reads `cat[15]`, which is untouched. So `sid` is written only for those rows (a sparse object `{ "<row>": id }`, the shape `IxK.sid` already had).
Cost: a reader that wants the Scryfall id of ANY listed row must read the card's bucket file. WP02's browse index already behaves that way (tests/plane-reader.test.ts reads the tile image from `sid` or the TCGplayer product id).
Evidence: after the change the 13 ix/k files are 0.6 to 0.9 MB (largest 895.2 KB, budget 950), `check-plane-tree` reports 0 problems; the whole tree is 7,245 files, 70.9 MB raw, 23.3 MB gzip.
Reversal: raise the chunk size down to 6,144 rows (more files) or the cap (not an option: contract 12.7).

## The join counter `id` counts id AND etched links — 2026-10-08

2026-10-08. Annex C check 2 compares the id-link count with 100,688 (within 1%). That number is the products whose `tcgplayer_id` OR `tcgplayer_etched_id` is a Scryfall printing: 99,467 by id plus 1,218 by etched id on the 2026-10-07 data (100,685 reported, 3 short of the research's count because the importer keeps only paper rows and refuses a printing another product owns). `summary.magic.join.id` therefore reports id + etched; `join.etched` still reports the etched ones alone, so nothing is lost. The chain of the join is unchanged: the first hit wins, `LINK.ID` and `LINK.ETCHED` are still stored per row.
Cost: a reader of the summary must not add `id` and `etched` (they overlap). The status record shows `etched` separately.
Evidence: bootstrap over the full 2026-10-07 TCGCSV and Scryfall files: join {"id":100685,"etched":1218,"fallback":126,"variant":1564,"oracle-name":138,"none":9326}; the unjoined class-0 catalogue rows are 147 of 98,876 (0.15%); shared ids 1,187 clean pairs and 16 odd, 2 etched anomalies, 28 finish conflicts. tests/import-join.test.ts.
Reversal: report the two counters apart (one line in `importCatalog`).

## The manifest does not list status.json — 2026-10-08

2026-10-08. `v1/manifest.json` lists the path, bytes and sha-256 prefix of every file for the verification step (50 random files through raw after commit A) and the watchdog (20 random files hourly). `publisher.ts manifestOf` listed every file but itself, including `v1/status.json` as it stood in the checkout, i.e. the PREVIOUS commit's copy; the new status is written after the manifest (it carries the manifest's own hash). Every publish after the first therefore pinned a stale hash, and a draw of status.json (about 5% per run) would fail verification and kill the publish after commit A. Local tests cannot see it because `verify` only runs against github.com.
Fix: the manifest lists every file except `manifest.json` and `status.json`.
Evidence: found while asserting that a forced re-run of the same day changes only `status.json` (tests/import-idempotent.test.ts, the bare-repository test): with the fix the diff is `status.json`, `v1/status.json`; before it also moved `v1/manifest.json`.

## Oracle rows are built after the catalogue selection, for the oracles a catalogue row references — 2026-10-08

2026-10-08. The first draft created an Oracle for every Scryfall card a product joined to: 33,607 on the 2026-10-07 data, over the 33,600 of Annex C check 1, including oracles of products that are not catalogue rows (tokens, art cards, unlisted printings) and so would never have a page. Oracles are now built after S5 (selection), only for the oracles some catalogue row references: 33,435. Write-once: an oracle's ordinal and slug come from the previous tree's uuid map (`or/` rows) when there is a tree; new oracles go oldest-first (earliest release owns the bare slug), ordinals continue after the highest ever published, in slug order. A card row is created with `oracleNo: null` and filled in afterwards.
Found by test: with a tree, an unknown Scryfall id next to a published bare slug is a NEW oracle (it takes `<bare>-<uuid8>`); the slug-only fallback (inherit the bare slug) applies only when no tree is available, i.e. a PrevState restored from the branch `state`. Before, a namesake with an older release was handed the published bare slug AND its ordinal (two oracles, one slug).
Cost: the oracle count follows the catalogue (a card that becomes unlisted keeps its published oracle row; ordinals are never reused).
Evidence: tests/import-slug.test.ts "oracle slugs" (the namesake case), "a state restored from the branch state"; Annex C check 1 oracles 33,435.

## Phase 2 reads the status record phase 1 left: the store memory comes from the newest run that read the store, and a tripped F10 is counted once a day — 2026-10-08

2026-10-08. Phase 2 starts from the branch head, whose `status.json` is the one phase 1 of the SAME day just wrote. Two rules of `buildPhase` read it as if it were yesterday's:
(1) F2c (a store read whose matched count fell under 50% of the last one is held) took its memory from `status.runs[0].stores`. When phase 2 starts, `runs[0]` is today's phase 1, which has no store results, so the memory was empty and the guard never fired in the daily flow; the unit test chained two phase-2 runs and could not see it. The memory is now, per (store, market) pair, the `matched` of the newest run that has that pair, so a phase-1 record in front and a manual run of three stores in between forget nothing.
(2) `config.guardTrips.flagChange` was `previous + 1` whenever the carried-over `guards.flagChange` was set. Phase 2 carries phase 1's guards, so a tripping day was counted twice (phase 1 and phase 2) and F10's "third consecutive trip is accepted" would have arrived on the second day. Phase 2 now carries the count; only phase 1 counts. A forced second phase-1 run of the same tripping day still counts again (a per-day marker would need a new status field).
Evidence: tests/import-failsafe.test.ts "F2c" (a catalog run is put in front of the record; fails with the old lookup) and "F10 trips are counted once a day" (fails with the old count).

## The store stage hands its listings to aggregate through ctx.offers (OfferStage) — 2026-10-08

2026-10-08. The frozen `importStores(ctx, opts)` returns only `StoreResult[]`, and `aggregate(ctx, stores)` needs the listings. Rather than let S8 write files (a second writer of `un/`/`of/`) or stash state in module globals, `ImportContext` gets an optional `offers: OfferStage { cards, sealed, reads, asOf }` that scripts/import.ts creates empty and `importStores` fills. `reads` has one row per (store id, market) pair the stage READ: `ok: true` replaces the pair's rows, anything else keeps them and the pair's run row (rows older than 72 h read out of stock via `ss/runs.json`). F2c (a read whose matched count fell under 50% of `status.runs[0].stores[].matched`) flips such a pair to `ok: false` in scripts/import.ts, so the stage does not need to know the last run. One row per (unit, market, store): in stock first, best condition, lowest price, lowest path. The offer budget (450,000 rows) prunes whole units, cheapest first.
Cost: WP04 must push into the stage (REQ-WP01b-3); until it does, phase 2 publishes nothing new and stays `catalog`.
Evidence: tests/import-failsafe.test.ts "a vanishing store", "F2c", "aggregate" (fake stage over the 57 real products).
Reversal: return the listings from `importStores` (a signature change of a frozen item).

## Home "popular" shows the printing a player buys — 2026-10-08

2026-10-08. hm/home.json `popular` took each oracle's representative printing from `repOf`, which ranks the TOP flag and then the dearest price: Sol Ring came out as a serial-numbered Commander printing at US$2,750 and Command Tower as a Surge Foil. `popular` now maps each EDHREC-ranked oracle to its cheapest plain printing: class card, no treatment, not serialized, promo, etched or foil-only, a Normal price above zero, and a set of kind expansion, core, masters or commander. The dearest representative stays as the fallback when an oracle has none. `chase` keeps the dearest printing, which is its point.
The tiles also carry change7d, the label and the printing key, and `dealsFree` rows the set code, number, flags and head finish, as additive trailing elements inside v1 (readers ignore what they do not know).

## import-prices.yml: a cron run has no inputs, so conditions never compare them with false; the alerts read a checkout in .data — 2026-10-08

2026-10-08. Phase 2 and the alerts step were conditioned on `${{ inputs.stores != false }}` and `${{ inputs.alerts != false }}`. On a `schedule` event there are no inputs: `inputs.stores` is null, and GitHub compares values of different types as numbers (null is 0, false is 0), so `null != false` is FALSE and both steps would have been skipped on every scheduled run, that is, on every real run. Only a manual dispatch would have published stores. The conditions now name the event: `github.event_name != 'workflow_dispatch' || inputs.stores` (a schedule runs the step; a manual run runs it unless the box is unticked).
The contract says the import "leaves the verified tree in .data/v1 for the alert and digest steps", but the publisher clones into `PLANE_WORK_DIR` (outside the Actions cache, decisions/WP01b-work-root-outside-the-cache.md), so nothing created `.data`. A step runs `scripts/plane-checkout.sh .data` before the alerts: it fetches the POINTED commit (also correct on a retry that published nothing), costs about 15 s, and `plane-checkout.sh` already names the alerts as a consumer.
Evidence: tests/plane-workflows.test.ts "import-prices.yml: a cron run has no inputs" (fails when either condition goes back to `inputs.x != false`, or the checkout step is removed or moved after the alerts).

## SCRYFALL_MODE=off does not publish a prices-only day yet — 2026-10-08

2026-10-08. Contract 6.3 allows a run without Scryfall (F4: the join is skipped, prices still publish). The importer refuses instead: with `SCRYFALL_MODE=off`, or a Scryfall that cannot be reached, `importCatalog` throws and the previous publish stays live. A prices-only day needs the card rows of the previous tree to be kept and re-priced without a join (no new products, no oracle changes), and that path is not written; publishing a catalogue joined to nothing would unlink 100,000 rows and, by the write-once rules, could never be undone.
Cost: a Scryfall outage longer than a day leaves prices a day old (the watchdog's STALE_36H alarm fires at 36 hours). The Actions cache of the slim Scryfall file (`scryfall-slim-<updated_at>.ndjson.gz`) covers a short outage, since an unchanged bulk listing is read from it.
Reversal: build the re-price path from `snapshotFromTree` (it already exists for phase 2) and let `buildPhase` use it when Scryfall is off.

## Sealed products get the same two-step absence as cards: GONEP (4), then GONE (2) — 2026-10-08

2026-10-08. A card absent from one complete TCGCSV day is `GONEP` and stays listed; absent from the second it is `GONE` (unlisted, untracked, row and slug kept). Sealed products had only `GONE`, which would unlist a Booster Box on one bad day. `SEALED_GONEP = 4` is an additive bit of the sealed list row's flags; `SEALED_FLAGS.GONE` is unchanged. A returning product clears both. A sealed product of a HELD group (F2b) keeps its flags.
Evidence: tests/import-failsafe.test.ts "an absent product is GONEP on the first complete day ... a sealed product follows the same two steps" (Secret Lair Deadpool bundle 686671).
Reversal: drop the bit; sealed products go GONE after one day.

## slug-seed.json also records an oracle that carries a suffixed slug without a namesake in the tree — 2026-10-08

2026-10-08. The seed holds what the sources cannot reproduce: set tokens, the `-p<id>` collision slugs and the oracles that share a bare slug.
A published oracle `the-superlatorium-0319b2d1` whose namesake is not in the catalogue was left out, so a rebuild from nothing would have published it as `the-superlatorium` and moved a URL.
`seedOf` now records every oracle whose slug ends in its own `-<uuid8>` as well as every owner of a shared bare slug.
On the 2026-10-07 data the seed holds 439 set tokens, 2 collision slugs and 73 oracles (it was 72).
A rebuild from nothing with it reproduces every card slug, set token and oracle slug of the published tree; the ordinals are the rebuild's own (only the `state` branch remembers them).
Evidence: tests/import-slug.test.ts "data/slug-seed.json ... a rebuild from NOTHING reproduces every card slug".

## A failed push of the second copy (branch state) is a warning in the run log, not silence — 2026-10-08

2026-10-08. The publisher pushes the write-once state and the daily history delta to the append-only branch `state` after the pointer commit, best effort: a failure never fails or delays a publish. The contract says the watchdog's alarm is the net, but `status.ts` has no alarm for it and `scripts/import.ts` passed no `onStateBackupError`, so a backup that failed every day (a token that lost the right to create branches, a protected branch) would have been invisible until the day `data` was lost.
`runImport` now logs `::warning::the second copy on branch state was not pushed (...)` with the cause (an Actions annotation on the run). The publish outcome is unchanged. An alarm in `computeAlarms` (WP01a's `status.ts`) remains the right net and is asked for in REQ-WP01b-7.
Evidence: tests/import-idempotent.test.ts "the second copy on branch state is best effort and never silent" (a bare remote whose pre-receive hook refuses refs/heads/state: the day still publishes, the warning names the refusal).

## The store stage is skipped only when its module does not exist; a module that is there and broken fails the run — 2026-10-08

2026-10-08. `scripts/import.ts` loads `src/lib/store-import.ts` (`importStores`) and `src/lib/stores.ts` (`storeByKey`) by name, because they belong to WP04 and arrive after the importer. The first version swallowed EVERY error of those imports, so a syntax error, a missing import of its own or a throw at load time in the store stage would have left phase 2 skipped every day behind a green workflow ("the store stage is not available: the day stays at phase catalog"), with stores a day, then two days, then three days old and no red run to say so.
`loadStoreStage` now treats only "Cannot find module <that module>" (the FIRST line of Node's message names the module that is missing; a missing import of the stage's own shows its path in the require stack, not in the first line) as "no store stage yet". A stage without an `importStores` export (the OP baseline of `store-import.ts`) is also "no store stage". Everything else rethrows and the job ends red.
Cost: a WP04 commit that breaks `store-import.ts` turns the daily workflow red at phase 2 instead of quietly shipping phase 1 only; phase 1 is already live by then (its pointer is committed), so readers lose nothing.
Evidence: tests/plane-workflows.test.ts "the store stage is loaded by name" (absent, empty, good, a stage that imports a missing module, a syntax error, a throw at load, a broken registry).

## meta/buckets.json `tracked` lists the buckets of the units px tracks, in every phase — 2026-10-08

2026-10-08. REQ-WP02-4: the list was built from the `un/` files, so a catalog-phase tree (the bootstrap, the first publish before the store stage) listed none although `hist/p` existed for 28,531 units, and a reader that trusts the list skips those history files. It now lists `cardBucket(id)` of every px row with TRACKN or TRACKF; `reconcileStoreFamilies` and the validator (code BUCKETS) use the same definition; an EMPTY list stays legal ("not computed": the readers rule nothing out), so the generator's catalogue trees (tests/helpers/plane-tree.ts, WP01a) remain valid until REQ-WP01b-6 is done.
Also REQ-WP02-5: `ix/p` `t` rows only for units with a change figure; a tracked unit with none reads "unknown", not 0.0%.
Evidence: tests/import-idempotent.test.ts "nine price days" (the list equals the px-derived one on each of 9 days; a unit that entered tracking on day 9 has no t row), tests/plane-validate.test.ts.

## A tracked unit whose card lost its price rows keeps TRACK and HAS — 2026-10-08

2026-10-08. C11 rule 7 says a class-0 row with no price on either finish keeps its previous LISTED and TRACKN/TRACKF bits (a price outage is unknown, not zero). The validator's `PX_TRACK` refuses a tracked unit without HASN/HASF. Both hold only if the HAS bit is kept with the TRACK bit: the importer now sets HASN (HASF) when it keeps TRACKN (TRACKF) for an unpriced row. Without it a single tracked card (a product TCGplayer stopped pricing for a day) made the validator refuse the whole publish, a day of stale prices for 99,000 rows.
Cost: the px row says "has a Normal finish" with a null price; the readers show no price for it (the unit's history gets a null day, `appendDay`).
Evidence: tests/import-failsafe.test.ts "F7: a day whose tracked units are mostly unpriced" (failed with 14 PX_TRACK problems before).

## The watchdog finds a crashed publish by its tag, not by the head of the branch — 2026-10-08

2026-10-08. A publish that dies between data commit A and the pointer commit B leaves a `data <day> <seq> <phase>` head that no pointer names. The first watchdog looked at the head's subject; the watchdog's own status commit (or a squash, or a rollback) lands on top of it within the hour and the alarm vanished. Commit A and its tag `d-<day>-<seq>` are pushed together, so `git ls-remote --tags` says whether a tag with a seq past the pointer's exists, with no object downloaded; only then is that one commit fetched for its age. An alarm needs 30 minutes of age, so a publish still verifying does not trip it; a retry reuses the tag and the same seq, so it clears.
Not verifiable here: the host probes (raw, contents API, token-expiry header), the sampled manifest check and the API-created squash need github.com; their request shapes are asserted with a fake fetch (tests/plane-workflows.test.ts).
Evidence: tests/plane-workflows.test.ts "watchdog: a data commit that no pointer names".

## The clones of the data repository live in PLANE_WORK_DIR, not in the Actions cache directory — 2026-10-08

2026-10-08. `IMPORT_CACHE_DIR` (default `.cache`) is what the Actions cache saves: the slim Scryfall file (about 80 MB) and the phase-1 to phase-2 match index.
A shallow clone of the data repository is 100 MB or more and is rebuilt every run; under the cache directory it would be uploaded as cache every day.
`workRoot()` is `PLANE_WORK_DIR` or `<os tmp>/mtgcompare-plane`; the publisher, the squash, the rollback, the watchdog and the state restore each use a subdirectory of it.
Cost: none; a developer who wants to inspect a clone sets the variable.
Reversal: none; the two names are in the environment table (REQ-WP01b-2).

## The browse index loads in 6 rounds, serves the whole of CardQuery, and reads its masks once — 2026-10-08

2026-10-08. Three changes to `plane/browse-index.ts`, all measured on the real 98,991-row tree. (1) `load` requested the chunk files one chunk after another (19 rounds, 7.3 s with 350 ms per raw miss); it now requests `dict`, `odict`, every `k`/`p`/`s` chunk and the oracle chunks at once and lets the reader's in-flight cap (8) pace them: 44 requests, 14.3 MB, 6 rounds, 2.7 s, which is the 2.5 to 3.5 s of 12.7.4. `ix/s` is a phase-2 family and may be absent before the first store stage, so a missing store chunk reads as "none" instead of failing every list page.
(2) `query` ignored `treats`, `keyword`, `format` and `includeHidden`; they are implemented (ANY-of words of the row's treatment string; a whole keyword token; playable or not playable by the oracle's legality string; art-series and oversized sets are out unless `includeHidden` or `setIds` names the set). `q` (free text, resolved by the search planner of WP07) is not interpreted here and `rootId` throws (a family is read from the card's own bucket); a filter that needs the oracle columns throws on an index loaded without them instead of answering from empty arrays.
(3) `PRICE_MASK.X` read inside the 99,000-row loops compiled to a module getter call per row; binding the masks once at module level took the default list from 7.8 ms to 3.2 ms (original reference code 2.8 ms) after the new filters had made the function too large for V8 to inline the getter.

`getBrowseIndex` loads the store AND oracle columns by default (2.7 MB of the 14.7) and an index that holds more serves a request for less; options only opt out. Load from a warm directory 230 ms, heap +17 MB, RSS +63 MB (+76 MB after the orders); first query of a sort builds its order (50 to 130 ms, once per instance), then 1.8 to 6.5 ms.
Reversal: none needed; the contract's reference code is the starting point of every line that was not touched.

## getCardsByIds: files for up to 9 buckets, the index for more, and only the unlisted ids go back to files — 2026-10-08

2026-10-08. Contract 7.6 sets the switch at 9 distinct buckets (a clustered 1,500-card collection needs 49 buckets, a random 300-card one 738 files). Above it the ids are looked up in the browse index (listed rows, one memory lookup each, 300 cards from 300 buckets in 2.8 ms); the ids the index does not hold are unlisted or gone rows, and they are read from their buckets only if THEY fit in 9 buckets, otherwise they are absent from the map ("misses are absent"). A bucket the `meta/buckets.json` list rules out costs no request, which makes `cardExists` for a dead id free. `stores` defaults to true (a consumer that forgot to ask would silently show no store price, which is worse than the `un` file); `{ stores: false }` skips it. An optional `unit` shows every card in one finish: `getRecentlyUpdated` needs it, because the 24 largest moves are units (a Foil move must not be drawn with the Normal price).
This is an additive change to a frozen signature, recorded in requests/AMENDMENTS.md.
A card read from the index and the same card read from its buckets are equal in every field a tile shows (tests/plane-reader.test.ts compares real products both ways; reading back the 16,778-card dataset `bootstrap` wrote, the only differences are `scryId`, which the writer puts in `ix/k` only where the Scryfall scan is the image or a back face exists, and `change7d`/`change30d` of 5,013 tracked units without history, REQ-WP02-5).
Cost: a collection of 300 cards pulls the 14.7 MB index into the instance once per publish; the alternative, 738 files, is 5.9 MB per request.

## A build reads no data in any mode, and the database client cannot reach a database during one — 2026-10-08

2026-10-08. Annex C check 24 (`next build` with both origins unreachable exits 0 and prerenders nothing) is enforced at three layers. (1) `HttpPlane.read` throws `PlaneError("build")` while `NEXT_PHASE` is `phase-production-build` (the contract's guard, unchanged). (2) `getDataRef()` and therefore `planeSource()`, `planeJson()` and every loader throw the same error in the DIRECTORY mode (`PLANE_DIR`) too: a development directory is not a licence for a build to read data, and a CI job that set `PLANE_DIR` and ran `next build` would otherwise prerender real rows. (3) `src/lib/db.ts` points the Prisma client at `postgresql://build:none@127.0.0.1:1/none` while the phase is the build, so a stray query fails with a refused connection instead of reading the real Neon project; outside the build the client is built exactly as before. A proxy around the client was rejected: Prisma's own client is a proxy, and wrapping it changes `this` inside `$transaction`.
Cost: none at run time.
What it does not do: it cannot stop a page that catches the error and bakes an empty list (`build-no-data` rules A to D, WP19, keep data-backed routes `force-dynamic` so no page is prerendered at all).
Evidence: tests/plane-reader.test.ts ("the build reads NOTHING, in the directory mode too": six loaders reject with reason `build`, and the next request is served again).

## The card page reads 3 rounds on a warm instance, not 2: the oracle shard depends on the catalogue row — 2026-10-08

2026-10-08. `getCardDetail(slug)` reads, after the pointer: round A `slug/<h>`, `meta/sets.json`, `ss/runs.json`, `meta/buckets.json`; round B `cat/<b>` and `px/<b>`; round C `un/<b>`, `of/<b>` (only when the `px` mask says a finish is tracked AND the bucket list says the bucket holds tracked units), `or/<n>` and `meta/scrysets.json`. Contract 7.4.3 says "two network rounds"; the floor is three because `or/<oracleNo % 512>` needs `oracleNo`, which only the `cat` row carries, and `cat` needs the product id the slug shard returns.
Speculative `un`/`of` reads in round B would not remove a round (the oracle read still follows `cat`) and would add about 16 KB to the 71% of card pages whose card is untracked, so they are not made. 
The family (the other products of the same Scryfall printing) costs nothing for a card with `rootId` 0 (the root carries its own id, so every member of a family has a non-zero `rootId`). Otherwise the candidates are the rows of the card's own bucket, the root, and the ids the set + number shard (`sc/<h>`) lists for the printing, and only the buckets that hold a candidate are read, because a Foil Etched twin sits in another TCGplayer group (Counterspell Modern Horizons 2 is 238617, its etched product 240803: 8 buckets apart). `rootId` alone is not enough: it lets a member find the root but gives the root no way to find its members, and the base page must link its etched twin (Annex C check 5). Reading back the dataset `bootstrap` wrote, every family is symmetric (0 asymmetric pairs over all 16,778 cards; the first version without the shard had 262).

Evidence, measured on the real tree through the HTTP chain with 350 ms per raw miss (12.6.1 says 0.23 to 0.71 s):
The One Ring (Lord of the Rings 246, two tracked finishes, 17 offers) 11 requests including the pointer, 174 KB, 1.41 s cold; Lightning Bolt (Alpha) on the same instance 6 requests, 184 KB, 1.06 s; a repeat of either 0 requests, 1 ms; the chart adds `hist/p` and `hist/t`, 2 requests, 4 KB.
A missing set row is a `PlaneError` (a data defect), an unknown slug is `null` and a miss is never remembered.

## The browse index keeps the store-only minimum (`smin`) and tiles carry the published decimals — 2026-10-08

2026-10-08. (1) The record gives the engine the Deal Finder's inputs, and the lab engine that measured the 1 to 3 ms rankings (dataplane-lab/src/engine.ts) kept three columns per unit and market: `low`, `stores` and `smin`. The reference `browse-index.ts` of the contract tree dropped the third. Without it the Deal Finder cannot be written from the index: the US `low` includes TCGplayer's own listing, and OP's predicate (`scoreVsTcg`; "a row TCGplayer's own lowest listing already beats is not a deal") needs the cheapest STORE price. `ix/s` rows carry it at positions 14 to 19 (`-1` = none); `BrowseIndex.load` now fills `smin` (n x 12 Int32, +4.7 MB of heap at 98,991 rows, same index as `low`) and `rowOf(id)` maps a product id, e.g. the `uid >> 1` of an `ix/f` flat offer, to its row. Reading `ix/f` for the store picker stays WP13's.
(2) The change columns are Float32Arrays; a tile built from the index carried 1.2999999523162842 where the bucket path carries 1.3 (358 of 2,676 sampled real rows differed). `rowFor` rounds to the published decimal. After both changes the only differences between an index tile and a bucket tile on the real tree are the columns that exist in one path only: `high90Usd` (no index column) and `scryId`.
Reversal: drop the column; Deal Finder then reads `ix/s` itself.
Evidence: tests/plane-engine.test.ts ("the engine carries the store-only minimum..."), tests/plane-reader.test.ts ("the change figures of a tile are the published decimals on both paths").

## Loader tests run on the 57 real products of Annex A, and on the lab's 9,488-file tree when it is present — 2026-10-08

2026-10-08. The contract's own plane tests use a synthetic tree (700 cards named "Card 1000"), which is right for the publisher and the validator but not for a loader whose job is to show Magic cards. `tests/helpers/data-source.ts` therefore builds a published tree from `tests/fixtures/magic-products.json`: the real TCGCSV product ids, names, groups and 2026-10-07 prices and the real Scryfall ids and oracle ids of the 57 products (Counterspell Modern Horizons 2, Birds of Paradise 7th Edition, Living Artifact at $203,067.70, the Foil Etched Ezio, Fire // Ice, Delver of Secrets...). Every column is a column of the fixture or a deterministic function of it; what the fixture does not carry is left empty and never invented (no oracle text, no legality: "?" is the unknown, no change figures, no history, no store offers).
History uses the contract's `miniFull` tree because the test is about the base + tail merge, not about prices.
With `PLANE_SAMPLE_DIR` set to the upgraded lab tree (`materialize.ts` in the build notes: `upgradeLabTree` written to disk) the same loaders run on all 98,991 rows (tests/plane-reader.test.ts, tests/plane-engine.test.ts, tests/plane-budget.test.ts); without it those cases skip and say so.
Two things the lab tree showed: its `mv/*` rows have the old 6 columns (the final MoverRow has 10), so the proof widens them; and the fixture's two `sealed` products are rows of `sl/list`, never of `cat`.

## resolveOracles: the full name wins, a face or reskin name resolves only when it is unique — 2026-10-08

2026-10-08. A deck line or a CSV row names a card by what the player types: "Fire // Ice", "Fire", "Delver of Secrets", a Universes Beyond reskin. `resolveOracles` indexes every `nm/<k>` row under its folded FULL name (strong) and, separately, under its front face, each face of a " // " name and its reskin name (weak). A key is answered by the first chunk (hottest first) that has it as a strong key; a key that is only a weak key is answered when exactly one oracle carries it across all chunks, and is dropped when two do ("an ambiguous listing is skipped, never guessed", the rule of the matcher). The result is keyed by the folded key.
Cost: an unresolved key reads all five name chunks (2.7 MB, memoised per parsed file after the first), 143 ms cold on the real tree.
Evidence (real tree): "sol ring", "lightning bolt", "the one ring" and "fire ice" resolve; "fire" resolves to Fire // Ice only because no other oracle has that face name; "delver of secrets" resolves to Delver of Secrets // Insectile Aberration by its front face.
Reversal: drop the weak map; callers then pass full names.

## One render reads one publish: the data pointer is pinned per request — 2026-10-08

2026-10-08. `getDataRef()` (plane/runtime.ts) is wrapped in React's request-scoped `cache()` when the bundle has one (the react-server build of Next: server components, route handlers' renders, `generateMetadata`, image routes), so the FIRST pointer read of a render is the pointer of all of it: the card page's slug shard, `cat`, `px` and `or` can never come from two publishes, and the `ref` an `unstable_cache` ranking key carries is the ref the rows were computed from. Outside a request (a plain Node process, a test, an Actions job, a route handler without the dispatcher) `cache` is absent or a pass-through and the instance memo of 20 seconds decides, which is the contract's stale-while-error layer (7.4) and is unchanged.
The alternatives were an AsyncLocalStorage opened by middleware (an Edge-runtime hop on every page for a property React already provides) and no pinning at all (a pointer that moves mid-render mixes a new `px` bucket with an old `or` shard: harmless for prices, wrong for a family that changed). The lookup is by name (`React["cache"]`), so a bundle or a Node version without it degrades to the memo instead of failing the build. Memos of derived shapes (the set maps, the bucket list, the browse index) are keyed by `ref:seq:publishedAt` (`memoKey`), not by the ref alone: a development directory is re-imported under one ref and must be seen, while on the HTTP path the three parts name one publish.
Reversal: delete the wrapper in `runtime.ts`; every loader keeps working on the memo.
Evidence: tests/plane-reader.test.ts ("data does not wait for a deploy": the pointer moves under a running instance and the next read shows the new price with no reset); the HTTP-chain proof on the real 9,488-file tree (warm read 0 requests, pointer request `no-store`, pinned requests `revalidate 2592000`, no tag, token header).

## getCatalogStats().pricedByMarket knows only the US figure until the publisher writes the counts — 2026-10-08

2026-10-08. The contract says `getCatalogStats` is "P status.json counts + meta/sets.json", but `status.json` `counts` carries no per-market figure and no published file does: a count of cards with a store price in AU, UK, SG, CA or EU exists only as the sum of `un` rows, and reading 1,228 `un` files for a stat is the cost the plane exists to avoid. The loader returns the US figure (every listed card has a TCGplayer price, so it is `counts.listed`), reads `counts.pricedByMarket` (MARKETS order) as soon as the publisher writes it, and is 0 for the other markets until then.
Nothing imports the field today (the home stats come from `hm/home.json` and `ss/runs.json`, WP18).
The request for the column is REQ-WP02-2 to WP01a; the reader tolerates its absence, so no package waits.

## The reader takes every file from the repository the pointer names, so a rotation needs no deploy — 2026-10-08

2026-10-08. Contract 12.5.7 answers the data repository's growth with a rotation: the publisher pushes the whole tree to a new empty repository, writes `pointer.repo` into the OLD repository's `latest.json` (which stays tiny) and "the site follows the pointer; no deploy, no environment change". The reader built from the reference code ignored the field: `runtime.ts` created one `HttpPlane` for `PLANE_REPO` and asked it for every pinned file, so the first pointer that named a commit of the new repository would have turned every page into a 503 (the sha does not exist in the old repository, and the previous-ref fallback is a sha of the old one too).
The pointer is still read from `PLANE_REPO` (it never moves); every pinned file is read through the `HttpPlane` of `ptr.repo`, created on first use, with the newest two kept (a request still pinned to the old pointer finishes on the old repository, and the memory stays at two LRUs). `planeSourceAt(ref, prev, repo?)` takes the repository for the warm call, which passes the pointer's. `PLANE_TOKEN` must be able to read the new repository: rotating is "widen or replace the token, then run data-hook", already the runbook of 10.42.
Cost: none until a rotation; then one cold LRU. Reversal: use `env.repo` in `planeFor`.
Evidence: tests/plane-reader.test.ts ("a rotation needs no deploy": the pointer comes from PLANE_REPO, every file request names the pointer's repository; the test fails when `planeFor` ignores `ptr.repo`).

## /api/data-warm warms the NAMED commit; /api/data-status reports this instance after looking at the pointer — 2026-10-08

2026-10-08. The publisher sends `POST /api/data-warm { ref }` right after the pointer commit, but `raw.githubusercontent.com` serves `latest.json` from a 5-minute CDN copy, so the instance may still believe in the previous publish. The route therefore warms the commit it was NAMED (pinned URLs are immutable and available at once): the hot set of `hotSet(rows)` (63 files, 14.8 MB on the real tree, 0.3 s from a directory) read through the pinned reader so the regional Data Cache and the instance LRU hold them, then it makes the instance look at the pointer again (`refreshPointer`, so the 20-second memo does not decide) and, only if the pointer already names the ref, builds the browse index. A file that does not exist yet (`ix/s` before the first store stage, `pv/*` before the first demand snapshot) is counted as `absent`, not `failed`; `ok` means no failures. Authorisation is `Bearer $CRON_SECRET` with a constant-time compare and fails closed when the secret is unset. `GET /api/data-status` first reads the pointer (a cold instance has none in memory, and the publisher polls until the site serves the new commit), then answers counts and names only, `private, no-store`. `/api/revalidate` now purges exactly `NEON_TAGS` (`published-decks`, `rising-snapshots`, `ebay-banner`, `rank`): published data is never purged.
Fix found by the HTTP proof: `planeHealth().stale` was `source === "stale"` of a `peek()` that never returns it, so a failing origin could never show; it is now "a last good pointer is held and the last origin attempt failed".
Evidence: tests/plane-neon-path.test.ts (401 without or with a wrong secret, the named ref is warmed, malformed ref falls back, tags purged in order) and the proof run (host down: warm card still served with 0 requests, uncached card 503, cached card still served after the memo expired; token rejected: `tokenRejected` true while the last pointer is kept).

## The finish of a store listing is decided per variant; a Foil tag never decides; two foils the title cannot tell apart are a skip — 2026-10-08

2026-10-08. TCGplayer models a finish two ways: one product with Normal and Foil rows (43% of singles) or a separate foil-only product (`Surge Foil`, `Foil Etched`, `Rainbow Foil`). A store models it a third way: variants (`Near Mint`, `Near Mint Foil`), SKU suffixes (`-NF`/`-FO`, `Normal`/`Foil`, `-nm-f`) or the title. So the finish is part of the key and is decided PER VARIANT, in this order: the variant's own words and its SKU suffix, which must agree (else `finish-conflict`); then the title (`Foil`, `Non-Foil`, `Foil Etched`, a foil pattern word is foil by definition); and only for a store that prints Foil on every foil product (`explicitFoil`) or a product whose OTHER variants carry foil words (`siblingTitles`) is an unmarked variant non-foil. Otherwise `finish-unknown`. The product that sells the finish is picked after the key: exactly one product at the key must sell it (`finish-not-offered`, `ambiguous`). One product with Normal and Foil variants therefore yields TWO offers (`matchStoreVariants`), which `collapseOffers` reduces to one row per (product, finish).
A Foil TAG never decides: 40 of the 67 usable stores tag more than 30% of their products Foil (cgrealm 98%, 89% with foil variants). An Etched title makes a Foil variant the etched finish and the etched product is the only one that sells it; a plain Foil variant never takes an etched product.
Two products at one (set, number) that both sell the foil, with a title that names no treatment, are a skip (`Godless Shrine [Edge of Eternities]`: the plain card and the Promo Pack share the set name), and so is a numberless title whose SKU number is a Surge Foil's while another product states exactly what the title says (`Gleaming Splendor (Borderless) [The Hobbit]`, SKU `HOB-275`, the store's foil at the price of #239): the foil cannot be placed.
Evidence: 6,651 US offers (listing, product, finish) of the corpus: 98.18% within 0.3x to 4x of the TCGplayer market of the finish matched (median 1.07x; the prototype, finish chosen per listing, 98.3% of 6,398); of the 90 listings where the prototype and this matcher both matched but disagreed, all checked by hand, 68 are titles that say Surge, Confetti, Ripple, Galaxy, Rainbow or Etched foil, which the prototype put on the plain product's foil; 8 begin `Foil` (it chose the non-foil); in the other 14 this matcher gives a product's Normal and Foil variants two offers, or skips a foil that two products sell. `tests/match-finish.test.ts` (32 tests).

## Store listings: a SKU, a SET-NUM, a number plus a set name or a name plus a set is the key; the name, set and treatment gates run before the finish — 2026-10-08

2026-10-08. A store listing is matched to ONE (product, finish) or to nothing (`matchStoreProduct`, `src/lib/match.ts`). The key, first that exists wins: (1) the structured SKU of the variant (`SLD-7181-EN-NF-1`, `MTG-FIN-353-HASH-2`, `FDN258Normal`, `cc-hob-...-249-nm-f`, `SIN-MTG-MH3-80-ENG-NM-NF`, `MTG-EN-TLA-318-NO-1`, `MTG-WHO-245-1`); (2) SET-NUM in the title (`[USG - 321]`, `(FIN-353)`, `- #112 MID`); (3) number plus set name (`Snap 66 - Dominaria Remastered`); (4) name plus set (`Carnivorous Cultivator (Extended Art) [Reality Fracture]`). A name alone is never a key (83% of printings share their name). A set code resolves through Scryfall's code, then TCGplayer's group abbreviation (`[BABP - 278]`, `MTG-EN-AC2-36-NO-1`) and a store's own set labels (`STORE_SET_ALIASES`).
Three gates run on the candidates of the key and never guess: the card name the title states must be one of the product's names (this alone catches Italian names under English codes, `Affluente Magmatico [SOC-387]`); a set the title names must be the product's set; the treatment words. A number- or SKU-keyed title may leave a treatment out (the number decides) but may not state one the product lacks; a name-keyed title must state exactly what the product's NAME states (`MatchRow.label`), because that is the only thing separating `Borderless` from `Borderless · Surge Foil`. A bracket the vocabulary cannot read (`Enchanting Tale Showcase`) is a skip, not an ignored word. Two keys that disagree (`FRA-451` in the SKU, `0415` in the title) are `sku-title-disagree`, and a product whose variants carry two numbers is `sku-numbers-disagree`.
A SKU with extra segments (`MUL-5-SERIALIZED-EN-FO-1`, `M3C-218-RIPPLE-EN-FO-1`) names the BASE card's number and a treatment: when that number finds no card the title is read instead and the extras still count as treatment words.
Cost: 3,767 of the 15,145 matched card listings are keyed by the title, 498 by name plus set; the rest by SKU. Stores that print neither a SKU nor a number nor a set (2,906 in the prototype, 961 now) stay unmatched. Reversal: none wanted; a gate is loosened only with a real title (CLAUDE.md, Matching store listings).
Evidence: `tests/match.test.ts` pins the 48 titles of stores-brief Appendix B and 204 more real listings; 19,993-listing corpus: 15,145 card listings matched (75.7%, prototype 63.3%), 67 ambiguous (0.34%, prototype 0.6%), 21 sku-title-disagree, 549 name-mismatch.

## The matcher takes four optional MatchRow fields, is asked once per variant, and runs degraded without the label — 2026-10-08

2026-10-08. The frozen `MatchRow` has no field for what a product's NAME states or for TCGplayer's group abbreviation, and both are what a store copies. Four optional fields are added (amendment W03-2): `label` ("Borderless · Surge Foil"; `treat` also holds what Scryfall implies, a Secret Lair frame is `inverted` and no store writes it), `abbr` ("ppsos", "ac2": `[BABP - 278]`, `MTG-EN-AC2-36-NO-1`), and `scryId` / `starScryId` for the feed adapters (never read here). Without `label` a name-keyed title must state every key of `treat`, without `abbr` those sets do not resolve: fewer matches, never another product on 19,993 listings (0 disagreements where both match). But the degraded mode is less safe in two ways: 57 listings match only without the label (a plain title beside a Promo Pack of the same set name is `ambiguous` with labels, Appendix B's `Godless Shrine [Edge of Eternities]`) and the Surge Foil / plain foil swap of `Gleaming Splendor` is not detected. The importer (`matchRowsOf`, `matchRowsFromTree`) does not fill them yet: REQ-WP03-1 to WP01b, `soon`, and the first real import should not run before it.
The caller asks once per VARIANT (`matchStoreVariants` is the loop): the variant's own SKU first, the siblings' SKUs after (a German sibling's SKU never rejects the English variant, two numbers reject all), `siblingTitles` for the unmarked-beside-marked rule, `explicitFoil` from the registry. `StoreMatchIndexes` loses `dons` (`buildDonIndex` is gone: no Magic equivalent); REQ-WP03-2 to WP04 for `scripts/probe-stores.ts` and `tests/store-platforms.test.ts`.
Cost: `buildCardIndex` on the 99,079 listed products takes 1.1 s and adds 63 MB to the 93 MB of the rows themselves, a corpus listing (all its variants) 0.26 ms; the index is in memory, built from the files the importer already holds, and nothing in this module reads a database.
Reversal: make `label` required in `MatchRow` once WP01b has filled it (one word in the interface and one `?? null` less).

## Sealed, accessory, token, graded and proxy words are judged on what is left of the title once the card and its set are taken out — 2026-10-08

2026-10-08. Magic card names carry the words that mark everything else a store sells: `Booster Tutor`, `Gift of Orzhova`, `Tin Street Hooligan`, `Case of the Locked Hothouse`, `Nim Replica`, `Theorist's Proxy`, `Bastion Protector`, `Slab Hammer`, `Admiral Beckett Brass`, and one set code, `MAT`, is a word (March of the Machine: The Aftermath). The title is read once, the card's name (the lead, or the name the reading found), the set texts and every `CODE - NUM` token are taken out, and only then are the grading, proxy, accessory, art-card/token and sealed words looked for. A sweep of the catalogue (77,751 card-and-set titles in the `[SET - NUM]` dialect) rejects none; before this rule it rejected 7 (`Slab Hammer`, five `Admiral Beckett Brass`, `Beckett Mariner`) and every `[MAT - 187]` (3 corpus listings). The language words keep their rule on the whole title, except `Phyrexian` (a card-name word) and the Japan showcase frames (`Japan Showcase Fracture Foil` is an English printing): of the 76 corpus listings the prototype dropped as foreign and this matcher matches, 55 carry `Phyrexian` and 13 `Japan Showcase`, the other 8 are English variants of products tagged Japanese or Italian. A variant in another language is a miss, a product that sells English and German keeps its English variants; a foreign TAG rejects only a variant that does not state English itself. Phyrexian, Hebrew, Latin, Greek, Arabic and Sanskrit are languages when a VARIANT says so.
A title that names a sealed product is answered from the day's sealed list (`path: "sealed"`, finish N), not rejected as the prototype did: its words (noise, pack counts and the game prefix dropped, `display` read as `box`) must equal those of exactly one product of the same kind. 1,128 corpus listings; 97.7% of the 221 US ones are within 0.5x to 3x of the sealed market (`plausibleSealedPrice`; the five outside are a $0.00 row, two $5.00 set boosters, a collector pack at 0.47x and a box titled `Play Booster` at 27x, which the guard drops).
Known skips, deliberate: promo cards whose name carries `Bundle` (`The One Ring (Borderless) (LTR Bundle)`, 6 corpus listings) read as sealed and find no product; a BinderPOS SKU extra that spells a treatment but is the first word of the card (`SLD-1011-MANA`, Mana Confluence) states `Mana Foil` and is a skip.

## Store spellings of a set the catalogue does not carry are eight entries of `STORE_SET_ALIASES`, learned from SKU consensus, not a JSON file — 2026-10-08

2026-10-08. A store writes `[The Lord of the Rings: Tales of Middle-Earth Commander]` where TCGplayer says `Commander: The Lord of the Rings: Tales of Middle-earth`; the stores-brief (5.6) asked for a `store-set-aliases.json` "produced by the probe script from SKU consensus (alias text -> set code seen in >= 3 listings, 95% agreement) and reviewed by hand". The 372 corpus listings whose trailing label did not resolve concentrated in ~40 labels; this module carries the eight that survive the rule, as a constant (`STORE_SET_ALIASES` in `src/lib/match.ts`): LTC (57 listings), AFR `Dungeons & Dragons: Adventures in the Forgotten Realms` (21), GK1 and GK2 `Guilds of Ravnica Guild Kit` / `Ravnica Allegiance Guild Kit` (13, 4), TMC (9), MAR `Marvel Eternal-Legal` (11), CEI `International Collectors' Edition` (5, which is not CED) and SLD `Secret Lair Drop Promos` (12). A file would need a loader and an owner line for nothing: the module is the only reader and the importer already imports it. Other spellings are generated, not listed: a leading `Dungeons & Dragons` / `Universes Beyond` / `Magic the Gathering`, a trailing rarity word, `X Commander` for TCGplayer's `Commander: X`, `X Prerelease Promos` for `X Promos`, `X Special Guests` for the one Special Guests group.
Rule: an entry needs at least three real listings that agree with a structured SKU at 95% or more, and a pinned real title in `tests/match.test.ts` (the alias test fails for an entry without one, and for an entry whose code the catalogue does not have). An entry is never added to raise the match count; an unknown label stays a skip (`name-setname-not-in-catalogue`, 259 corpus listings).
Reversal: move the constant to `data/store-set-aliases.json` and read it in `buildCardIndex`; the test keeps its shape.

## A title that names The List is The List's product or nothing; "Traditional Foil" is a finish, not a language — 2026-10-08

2026-10-08. Two rules found by replaying the whole catalogue (99,079 products, 148,058 sellable (product, finish) units) through the matcher in the dialects stores and sellers use (`Name (Label) [SET - NUM]`, `Name (Label) [Set Name]`, a BinderPOS SKU beside the bare TCGplayer name, a free-text eBay title), asking for the product the title was built from. Store path: `SET - NUM` 140,110 right, 7,948 skipped, 0 wrong; SKU beside the TCGplayer name 145,199 right, 1 wrong (`Sakura-Tribe Elder (Junior Super Series)`, a label that is also a set name, see below). The free-text path (`matchCardTitle`, the eBay pass) was wrong 4,941 times in 98,876.
The List (`PLST`) numbers its cards `<set>-<number>` (`cm2-14`), so `Artisan of Kozilek The List PLST CM2-14` looked up `(cm2, 14)` and answered the ORIGINAL Commander Anthology II printing, 4,933 products whose TCGplayer market is another price. `matchCardTitle` now looks the pair up at `(plst, "<set>-<number>")` when the title names The List (by name or by the code) and offers nothing else; no such List card is `name-mismatch`. The store path already skipped these (gate 2, `set-conflict`, the pinned `Urza's Saga (MH2-259) [The List]`). The round trip is now wrong 8 times in 98,876 (five `Tamiyo's Journal` entries whose numbers differ by a dagger, three synthetic `NULL` set codes).
`traditional` and `simplified` were read as Chinese language words, so a variant `Near Mint / Traditional Foil` (Wizards' name for a regular foil, used by the Secret Lair Drop Series: nine corpus titles say `Traditional Foil Edition`) was a `language-option` miss and `bestVariant` dropped it. Chinese stays a language by `chinese`. No corpus listing changes (16,273 matched before and after); a variant that says `Traditional Foil` now matches.
Left, deliberate: a label that is also a set name (`Future Sight` is a frame of three products and a set; `Junior Super Series`) is read as the set first, so `Pact of Negation (Future Sight) [Mystery Booster 2]` resolves to the Future Sight set's card. Three products of 99,079; fixing it needs a rule for a title that names two sets, and "the longest name wins" is what keeps `Modern Horizons 2` from being `Modern Horizons`. Tests: tests/match.test.ts (The List, languageOfVariant, bestVariant, the bare-index property), tests/match-finish.test.ts (Traditional Foil).

## Magic keywords come from Scryfall's list, not from rules text — 2026-10-08

One Piece keywords were bracketed text ([Rush]) found by a detector. Magic keyword abilities are plain words, and Scryfall already publishes `keywords` per Oracle card, carried in the plane as hyphenated tokens (`first-strike`) and counted in ix/o. A keyword page therefore lists oracles by that list; rules text is never scanned for a count (a regex finds "flying" inside "creatures with flying" and reminder text alike).
`KEYWORDS` (~85 definitions, evergreen / ability / action) is a hand-written paraphrase of the Comprehensive Rules, shown on a page when its slug exists; any other Scryfall keyword still has a page, with its name and count. `cardKeywords()` takes the oracle's list (authority) or, for text with no list, whole-word names. `KeywordText` links the same names in oracle text, with a tooltip; a word without a page is never linked.
A keyword on fewer than `KEYWORD_INDEX_MIN` (5) oracles is noindex and out of the sitemap. A card that only grants a keyword counts, and the copy says so.
Counts are oracles with a LISTED class-0 printing, ordered by EDHREC rank (published column), then ordinal.

## Taxonomy hubs read the browse engine, not a card list — 2026-10-08

The hubs (/cards, /cards/rarity|type|treatment, /colors, /cards/name/[oracleSlug], /singles) stop scanning `getCatalog()` and ask the engine: `getCardPage` for a group's printings (market-sorted, MARKET only, so a low-only listing never ranks) and `getFacetCounts` (one memoised pass per data commit) for every count. Median columns are gone: a median needs every row, and a page of 48 must not read 100,000.
The engine serves 100 pages of 48; a group larger than that (commons, creatures) says so and points at /browse to narrow by set. Each route is `force-dynamic` and has no `generateStaticParams`.
/colors/[color] is EXACT: a mono-colour page lists cards of exactly that colour, colorless is no colour, multicolor is two or more, so the seven counts add up and a gold card is on one page. Rows with no joined Scryfall card have no colour and are on none.
/cards/treatment/[key] replaces /cards/printing/[printing], which stays as a permanent redirect for a valid key. A treatment with no listed printing (embossed, silverfoil) is a 404, not a thin page; `isIndexableTreatment` is the shared predicate.
The oracle hub is indexable only with at least two listed printings and one non-THIN (`isIndexableOracleHub`); otherwise it renders as noindex. Pages past the first are noindex, follow.

## Box EV: the published booster structure, nothing estimated — 2026-10-08

OP Compare's calculator ran on community pull-rate estimates because Bandai publishes none. Wizards of the Coast publishes the slot structure of its boosters, so MTG Compare's `src/lib/pack-composition.ts` is a per-booster slot table (count, pools, weights) and `src/lib/box-ev.ts` multiplies it by pool averages. Only the Play Booster is modelled as sourced: 14 playable cards, 7 commons, 3 uncommons, a rare slot that is a rare 6 times in 7 and a mythic once, a land slot, and two wildcard slots (Nuts & Bolts #16, magic.wizards.com/en/news/making-magic/nuts-and-bolts-16-play-boosters). The Draft Booster table is the long-standing 10/3/1 layout and is marked `sourced: false`.
The wildcard slots can be any rarity and any treatment and Wizards publishes no split, so they are listed, shown as "not valued" and add nothing until the visitor sets a rate. The chase pools (Booster Fun by rarity, special foil/etched/serialized) therefore start at rate 0: the EV errs low, never high. Collector, Set, Jumpstart and Commander products vary per set and are not modelled (`boosterTypeOf` returns null); the sealed page shows the contents text of the store catalogue.
Pools are rarity x treatment (Common, Uncommon, Rare, Mythic, Land, AltCommon, AltRare, AltMythic, SpecialFoil), classified from `Card.treat` by the closed treatment vocabulary; promo, edition and language treatments and tokens are not pack pulls. Values are the headline-finish market price; the foil premium of a standard card is not priced (REQ-WP09-1).

## Sealed products are published files; MSRP stays empty until verified — 2026-10-08

`src/lib/data/sealed.ts` reads `sl/list-<k>` (memoised per data commit, M), `slug/<h>` (the `z` part), `sl/d/<h>` and `ss/runs.json`; there is no database and no `unstable_cache`. Offers go through the same live-offer rule as cards (`liveOffersFrom`, one implementation), with a synthesised TCGplayer row from the list row's `lowTcg`; all finishes are "N". A GONE row stays in `byId` (a watch on a retired product keeps resolving, `getSealedByIds`, `getSealedDetail`) and out of every list. `getSealedAll` is an added export: /sealed filters the list in memory by the visitor's market, as before. Images and TCGplayer URLs are derived from the product id, never stored.
The sealed alert pass (`sealed-alert-read.ts`) reads the watched products' detail files through the same loaders (six at a time) instead of the removed `Offer` table; real stores only, never the TCGplayer row (REQ-WP09-2 asks the alert harness for a reader).
/sealed hides Secret Lair drops (1,079 of ~3,700 products) unless `lair=1` or their kind is picked, the Magic counterpart of OP's hidden tournament promo packs. `src/lib/msrp.ts` ships an empty table: a row needs a Wizards or first-party announcement and a check date (tests/msrp.test.ts), so no "at RRP" figure is shown until the owner supplies verified rows.
The pre-order page (WP20) reads `getSealedPage({ presale: true })`.

## A deck line without a set is priced at the CHEAP printing, and a finish is part of the line — 2026-10-08

2026-10-08. A pasted list says "4 Lightning Bolt" far more often than it names a printing, and Magic has 100+ printings of a staple. OP's rule (the printing with the most copies of the name, ties to the lowest id) does not exist here; the lowest id is the oldest, dearest, often non-Normal one. The resolver (`lib/deck-price.ts resolveDeckLines`) therefore asks the browse index for the card's listed printings and takes the one the importer flagged `PRICE_MASK.CHEAP` (the cheapest regular Normal printing: no serialized, gold-border, silver-border or Foil Etched product), falling back to `basePrinting()` over the same list when the flag is absent. THIN printings are valid targets (the catalogue floor is one cent). Order of evidence on a line: `#<productId>`, then (set, collector number) through `resolveBySetNumber` (a base product, its Foil Etched twin and a stamped variant share a number; `pickFromSetNumber` takes the twin only for `*E*` and flags several ordinary products as ambiguous), then the card by name: the cheapest regular printing in the set the line names, else the CHEAP printing. A number that belongs to another card never prices it (`nameAgrees`), a set the card was never printed in falls back with `setMissed`.
The finish is read from the line (`*F*`, `*E*`, "(foil)", "(etched)"); an unmarked line is Normal, or the only finish the product has (Sol Ring in Buy-A-Box Promos is Foil only); a Foil the printing lacks falls back to Normal with `finishAdjusted`. A deck line is a UNIT, (productId, finish), end to end: the price, the repeated-line merge, the basket and the watch.
A bare name says nothing about the printing, so the Pauper "printing is not a common" note and the Pauper Commander rarity test are applied only to lines that name one.
Cost: one browse-index load per instance (the index is memoised per pointer); on the 99,079-card tree the first deck priced in a fresh process takes 0.46 s (the index load included), later ones 50 to 230 ms (the 70-line Atraxa list: 227 ms). Evidence (published data of 2026-10-07): the Modern Boros burn list costs $243.24 at the CHEAP printings and $2,797.11 at the lowest-id ones, the Pauper burn list $34.62 against $2,598.71, the Atraxa list $479.81 against $1,503.55; the lowest-id printing is dearer for 18 of 22, 12 of 16 and 65 of 70 cards.
Reversal: a stored `#id` pin on every line (the canonical text already writes one where set and number would not find the product again).

## Commander legality is read from the published oracle row; unknown is judged as nothing, and the partner rules read the card's text — 2026-10-08

2026-10-08. `checkDeck(format, entries)` is pure and takes the facts of `OracleMini` / `OracleDetail` (type line, WUBRG identity, the 22-character legality string, `ORACLE_FLAGS`); nothing is fetched by it. A card that is banned or not legal in the format is an error with its name ("Banned in Commander: Mana Crypt."), an unknown status ("?") or a card whose facts could not be read is only listed under `unchecked` (contract 3.2 rule 7: unknown is never "not legal"). Who may lead: Commander, Duel and PreDH read `ORACLE_FLAGS.COMMANDER` (3,467 oracles, decided by the importer); Brawl also takes any legendary creature or planeswalker; Oathbreaker needs a planeswalker plus an instant or sorcery whose identity fits; Pauper Commander a creature that is legal there (it was printed at common) or was printed at uncommon. Scryfall marks an uncommon-only creature NOT legal in the 99 (Ravenous Chupacabra, Kor Firewalker); no oracle of the data of 2026-10-07 is `restricted` in Pauper Commander (`restricted` occurs only in timeless, vintage, duel and tlr), so the oracle row cannot say which creatures may lead. `checkResolved` therefore reads the printings of a commander that is a creature and not legal (`commanderNeedsPrintings`, at most 14 reads, none in any other format) and the lowest of common and uncommon among them is the entry's rarity; `checkDeck` does not hold the commander slot to the legality of the 99, and the same card among the 99 is refused by name. A sideboard commander of a bare-name Pauper Commander list is not inferred (the sideboard has no printings read): add a Commander section. The deck's identity is the union of its commanders' (Oathbreaker: the planeswalker's) and every other card, the companion included, must fit it.
Partners are decided from the commanders' oracle text and kebab-case keywords, which `checkResolved` loads for the commander zone only (`getOracleBySlug`, at most 14 oracles per request): plain Partner with plain Partner, the same "Partner - <variant>", "Partner with <name>" only with that name, Friends forever, "Choose a Background" with a Background, "Doctor's companion" with a Time Lord Doctor. `ORACLE_FLAGS.PARTNER` alone cannot tell these apart. MTGO and Moxfield exports file the commander in the sideboard: with no commander in the zone, `inferCommanders` moves the one card (or the legal pair) that can lead there and the report says so.
Real data decided details: Sol Ring is banned in Legacy, Duel Commander and Oathbreaker and restricted in Vintage (so the Atraxa deck is refused in Duel Commander, by name), Monastery Swiftspear is banned in Pauper, Chain Lightning is not legal in Modern, Dig Through Time is banned in Modern.
Limit: a card resolved by set + number or pin is matched to its oracle by NAME (`resolveOracles`: a full name, or a face that exactly one oracle carries); a front face two oracles share leaves it unchecked, never wrongly checked. A loader by oracle number would remove the limit (not requested: it has not happened on the 70-line deck).

## The deck engine holds no catalogue in memory; the deck watch prices units through the loaders and the offer reader — 2026-10-08

2026-10-08. OP resolved a list against `getCatalog()` (the whole catalogue, in memory, built once per instance). Rule 1 and the egress rules forbid it for 99,079 cards, so `indexCards`, `resolveDeck`, `resolveLine` and `deckIndex` are gone. `resolveDeckLines(lines, data)` reads, per list: the exact products (`getCardsByIds`), the (set, number) pairs (`resolveBySetNumber`), the oracles of the names (`resolveOracles`), the printings of those oracles (`getBrowseIndex().query`) and the unit view of each chosen printing (`getCardsByIds(ids, { unit })`); store offers come from `readLiveOffers` (offer-read.ts, the freshness rule in one place), eBay never. The data layer is injected (`DeckData`), so a script or a test supplies its own. `pricedCard`, `deckTotals` and `deckUnitCards` price a stored deck now.
The deck watch (Premium, script-side) keeps OP's behaviour: after every import `runDeckWatches` prices each saved list as Best Basket does (`basketUnits` -> `loadStoreListings` -> `optimizeBasket` with the saved region and minimum condition) and alerts on a target met or a material drop (5% and a whole unit), with the watermark rules, snooze, lapsed-owner and per-account cap of OP. A basket item is a unit (uid = productId * 2 + finish): a Foil copy has its own listings and a Normal listing never fills it. The shipping/basket modules are imported lazily inside `priceDeckList`, so the watch routes load without the store registry. In the US the TCGplayer low of a unit is a listing of its own (`includeTcgplayer`), so a deck of cheap, untracked cards still has a total.
Cost: pages and routes that only create or list watches load no catalogue and no price file; a run reads the files of the cards on each list. Reversal: none wanted.

## A published deck is a Commander-style deck filed under its commander's Oracle slug; the stored lines are units — 2026-10-08

2026-10-08. OP filed decks under a Leader; here `PublishedDeck` holds `commanderCardId`, `commanderName`, `commanderSlug` (the Oracle slug: `/decks/commander/atraxa-praetors-voice`), the optional partner, the WUBRG `identity` the deck was held to, the canonical `list` text, `lines` ([{ cardId, qty, finish? 0 | 1 }]: the commander slot and the main deck; a sideboard or companion stays in the text), `cardIds` and `publishedTotals` (the US/other-market total on the day). The 24-hour cap, burst limit, honeypot and no-links rules of OP's route are unchanged.
A deck is publishable when it breaks none of its format's rules (`PUBLISH_FORMATS` = the Commander-style formats whose size is confirmed: Commander, Duel, PreDH, Pauper Commander, Brawl, Standard Brawl, Oathbreaker), has a commander, and leaves at most 3 lines unmatched. Resolution is `prepareDeckWith`: the same resolver as /deck, so the stored printings and finishes are the ones the builder showed; unmatched lines are never stored as cards. Prices are NOT stored beyond the day's total: a page prices a deck now from `getCardsByIds` (`deckUnitCards` + `deckTotals`), so an import moves every total without a deck read.
`getPublishedDeck(slug)` returns `PublishedDeckPage` (the library row plus format, partner name, description and list): one cached read for a deck page (AMENDMENTS W10-1). The three loaders are the only Neon-backed reads a public render may make besides the commander page and the sitemap (7.13); each THROWS on a failed read inside `unstable_cache`, so an empty library is never stored, and the page catches outside.
Evidence: tests/published-decks.test.ts publishes the real Atraxa 100 and the Thrasios + Tymna pair through the real resolver over real printings, and refuses a Lightning Bolt (identity), a Mana Crypt (banned), a second Sol Ring, 99 cards, no commander and 4 unmatched lines, each with its reason.

## A star collector number is the Foil unit, Arena's DAR is dom, and a real card name is never read as a total or trimmed of its hyphen — 2026-10-08

2026-10-08. Found by running the parser over all 33,435 oracle names of the dataset of 2026-10-07 (the test "every one of the 33,435 oracle names survives the parser" now pins it) and over lists that name a star number. Three corrections to `lib/deck.ts parseDeckList`:
A number with a star ("231★") is the star printing, which is the Foil unit of its product (contract 3.2 rule 4: 1,187 products carry a star `fnum`; 603 more have a star `number`, 598 of them Foil only). A list that gives the number as the card prints it means the Foil: "1 Birds of Paradise (7ED) 231★" is $3,980.75, not the $22.89 Normal it priced as before. An explicit "(nonfoil)" still wins, a product without a Foil row falls back to its Normal with `finishAdjusted` (five products have only a Normal with a star).
MTG Arena writes Dominaria as "DAR"; Scryfall, the dataset and every other exporter write "dom" (the dataset has no "dar"). The parser maps it, so "1 Llanowar Elves (DAR) 168" is the Dominaria printing and not a missed set; it is the one Arena code that differs.
"Total War" (Legends) was dropped as a "Total: 75 cards" line, and the Un-set names that end in a hyphen ("Bat-", "Half-Orc, Half-", "Robo-") lost it to the separator trim. A total is "Total" followed by a colon, a count or "cards"; a hyphen with no space before it belongs to the name; a hyphen after a space, a comma, a colon or a bar around a name is still a separator. The one name the parser still splits is "Hazmat Suit (Used)" (it reads as a set), which the resolver asks again with the parenthesis put back.
Reversal: delete the three lines; no stored data depends on them.

## A list has zones, the parser reads every export it is given, and every format of the legality string has one rule row — 2026-10-08

2026-10-08. `parseDeckList` returns lines with a `zone`: main, side, commander, companion or maybe (dropped unless `keepMaybe`). Zones come from headers ("Deck", "Sideboard (15)", "SIDEBOARD:", "Commander", "Companion", "Maybeboard"), from `SB:`, from Archidekt's `[Commander{top}]` / `[Maybeboard{...}]` categories and TappedOut's `*CMDR*`, and, with no header at all and exactly ONE blank line between two blocks, from MTGO's layout (the second block is the sideboard; two or more gaps are spacing). Type groups ("Creatures (12)"), totals, comments and Arena's "About / Name ..." block are never cards. A card name that ends in a parenthesis ("Hazmat Suit (Used)", "B.F.M. (Big Furry Monster)") is read whole where it has spaces and asked again with the parenthesis put back where it looks like a set code. `DECK_LINE_CAP` 200 and `QTY_CAP` 99 stay (a 100-card Commander list is 70 lines): there is no deck-size tier in `tier-limits.ts` to review.
Rules live in ONE registry, `DECK_FORMATS` in `lib/commander-rules.ts`, one row for each of the 22 keys of `FORMATS` (family constructed / commander / brawl / oathbreaker / gladiator; min, max, sideboard, copies). Constructed formats are 60 + 15 with four copies (a restricted card in Vintage and Timeless: one); Commander, Duel Commander, PreDH, Pauper Commander, Brawl (Historic Brawl) and Gladiator are 100 singleton; Standard Brawl and Oathbreaker 60; Competitive Brawl and TLR are `verified: false`: legality and copies are checked, the size is not. Basic lands (any "Basic" type line, snow and Wastes included) and "a deck can have any number of / up to N cards named" cards (read from the oracle text of the cards over the limit, at most 14) are exempt.
Why not reuse OP's `checkDeck(cards)`: its one-Leader/50-card shape is a different game. Evidence: 118 tests on real exports (Arena, MTGO, Moxfield, Archidekt, TappedOut, TCGplayer Mass Entry) and three real decks (a Modern Boros burn 60 + 15, a Pauper burn 60 + 15, an Atraxa 100).

## Commanders replace Leaders; the deck pages are per-request — 2026-10-08

Date: 2026-10-08

/commanders, /commanders/[slug] and /decks/commander/[commander] replace OP's /leaders and /decks/leader/[leader], with no redirects (a new domain has no inbound links to keep). Which cards are commanders is not computed in the page: it is the published ORACLE_FLAGS.COMMANDER bit (a legal Legendary Creature, a Legendary Vehicle or Spacecraft with power and toughness, or "can be your commander" text), read from ix/o by `getCommanderPage` and memoised once per data ref; names come from nm and the rules text of the visible page from or/. The colour filter keeps commanders whose identity fits INSIDE the chosen colours, the way a deck is built. Unknown legality renders as nothing.

The three deck pages are `force-dynamic` with no `revalidate` and an empty or absent `generateStaticParams` (REQ-WP10-11): the library is the one cached Neon entry under the decks tag, and a deck is priced NOW from `deckUnitCards` (unit view per finish), never from a stored total. A deck is filed under its first commander only; a partner is shown on the deck page. The budget build compares printings of the same card in the same finish (one `getCardPage` per oracle and finish).

`DecksUsingCard` is a client panel that loads `GET /api/decks?card=<id>` (REQ-WP11-1 to WP10): a public render never wakes Neon for it (contract 12.12). The deck builder sends a `format` (default: automatic, Commander when the list has a commander section) and shows `DeckReport.issues` in order; a "note" is not a fault.

## The eBay chase strip sits immediately under the hero on the home page and on every regional home — 2026-10-08

2026-10-08. The owner asked (REQUIREMENTS section 5) for the eBay chase strip directly under the hero. `src/app/page.tsx` renders `<CinematicHero />`, then `<EbayChase page="home" heading="Chase cards on eBay right now" />`, then `EditorialHub`, `HomeTopDeals`, `PriceGuideCallout` and `HomeSections`; `RegionHome.tsx` does the same with the strip inside `<CountryLock country={region}>` so a visitor on `/au` sees AUD and the Australian eBay market whatever their cookie says. tests/home.test.ts pins the order for the page and for RegionHome by position in the source, so a later edit cannot slide another section between the hero and the strip. The strip stays display-only: the page never calls eBay (`EbayChase` reads the cached `getChaseStrip` loader and renders nothing on any error), and no eBay row enters a ranking, an alert or a basket.
`CountryLock` is a new export of `CountryProvider.tsx`: a context override that pins country and currency for its subtree and keeps the parent's `setCountry`, so the header switcher still works and nothing outside the lock changes. It avoids touching WP05's `EbayChase` for a region prop.
Cost: the region page now has one more section above the fold; the carousel and the deals moved down one slot.
Reversal: if the owner prefers the strip lower, move the line and the test together.
Evidence: tests/home.test.ts "the homepage uses RiftCompare's display face and order, with the eBay chase strip IMMEDIATELY under the hero" and "every region home puts the same strip directly under its hero, with the market locked to the region".

## The outbound click log is back, as a batched anonymous insert in the half-hour window — 2026-10-08

2026-10-08. OP deleted its click log on 2026-10-05 because every click was a database write. Contract 10.32 and REQUIREMENTS 9 and 11 restore it, and the shape answers the objection: a click is a small `POST /api/click` that always gets an empty 204 (`no-store`); it is appended to a bounded buffer in the instance (`ClickBatcher`, frozen in plane/view-beacon.ts) and written by `flushClicks` as ONE `createMany` inside the first minute of a wall-clock half hour, the same window the card-view counter uses, so views and clicks together wake the database at most 48 times a day however many instances run. A 90-day `deleteMany` sweep rides the same flush once a day. A row is retailer, page, slug, country (the visitor's `country` cookie, else Vercel's geo header) and the entry bucket; `userId` is always null, no IP, no URL, no referrer. The route refuses a foreign origin, a body over 2 KB, a retailer that is not a key (it is rejected, never cut to fit), a crawler or an empty user agent, and more than 120 clicks per IP and hour (`rateLimit`). `CLICK_LOG=0` switches it off, `CLICK_SAMPLE_RATE` samples it; the three env names are read in `src/app/api/click/route.ts` only (tests/fixtures/env-names.json) and handed to `src/lib/click-event.ts` as plain settings.
Cost: rows in an instance that is frozen before the window are lost, which a sampled analytics log accepts; the browser side (`OutboundBeacon`, a capture-phase listener on `a[data-retailer]` using `navigator.sendBeacon`) sees only anchors that carry the retailer key.
Reversal: tests/no-outbound-click-tracking.test.ts (WP06's) pins OP's deletion and fails by design until WP06 removes it (REQ-WP15-4).
Evidence: tests/outbound-clicks.test.ts, 15 tests (parse, country, same origin, config, bots, one insert per window, 48 wake-ups a day, a failing insert and the sweep, the route's 204 and its source rules).

## Consent Mode v2 defaults are written once, in the head, before any Google tag — 2026-10-08

2026-10-08. OP's `GoogleAnalytics` carried the consent defaults inside its own script, so any other Google tag (the AdSense loader) depended on the order of two scripts to see a default at all. `consentDefaultsScript(adsense)` in `src/lib/ga.ts` is now the only text of the defaults and `<ConsentDefaults />` renders it as the first script of the head, before `<GoogleAnalytics />`, only when GA or AdSense is configured. Defaults (P32): a region-scoped default denies ad_storage, ad_user_data, ad_personalization and analytics_storage in `CONSENT_REGIONS` (the EEA, the UK and Switzerland), a second default for everywhere else grants analytics_storage and keeps the three ad signals denied, and `ads_data_redaction` is set; the first carries `wait_for_update` of 3000 ms only when AdSense is configured (at least `CMP_GRACE_MS` 2500, so the consent platform has time to answer) and 500 ms otherwise. `PrivacySettingsLink` in the footer re-opens the consent platform (`googlefc`) when it is loaded and falls back to `/privacy#advertising`, so a visitor can always change the choice.
Cost: one more tiny inline script; outside the listed regions measurement runs from the first page view while ads stay denied until the consent platform (or the visitor) grants them.
Evidence: tests/site-chrome.test.ts "Consent Mode v2 defaults (P32)" runs the emitted script in a `vm`, checks the two defaults and the two wait values, that GoogleAnalytics no longer repeats the call and that `<ConsentDefaults />` sits in the head ahead of `<GoogleAnalytics />`.

## The home page reads hm/home.json and the market files, with bounded hydration until the publisher appends the missing fields — 2026-10-08

2026-10-08. OP's home read a Postgres catalog with a view counter; MTG's reads published files: `getHomeBoard()` (`hm/home.json`, one `memoByRef` entry per pointer), `getHomeFeed()` / `getPopular(n)` (the same file), `getMarketOverview()` (`mk/overview.json`) and `getMarketRecords()` (`mk/records.json`). "Popular" is the EDHREC rank the importer publishes, so there is no view counter and no `popularKind` threshold on the home any more; the carousel tabs are Popular, Chase cards, Biggest movers, Recently updated. The contract's tile rows lack three display fields (a printing label, the 7-day change, and set and number on a deal row). The reader tolerates additive trailing elements (`change7d`, label, printing; `sc, number, flags, headFinish` on deals) and until the publisher appends them it hydrates the few tiles it needs through `getCardsByIds(ids, { stores: false })`, at most 8 ids per call and never the browse index. A missing field degrades to a tile without the figure, never an invented one.
Cost: up to eight small card-file reads per cold home render; the CDN header and `memoByRef` hold them for the pointer's life. Asked of the owners of the formats: REQ-WP15-1 (WP01a: row shapes) and REQ-WP15-2 (WP01b: the publisher).
Reversal: when the trailing elements are published the hydration branch is dead code and can go; the tests keep both paths.
Evidence: tests/home.test.ts "getHomeFeed ...", "market views ...", "topDealsOf ..." with real fixture products; the same loaders against the real 2026-10-07 tree in .data.

## Navigation links carry a plan chip derived from FEATURE_RULES, never typed — 2026-10-08

2026-10-08. Premium must read correctly in the chrome: a link to a paid tool says which plan opens it. `NavGroupLink.plan` is filled from `FEATURE_RULES[...].minTier` in `src/lib/premium-gates.ts` (Deal Finder, Rising Cards and Demand Finder today) and every renderer (SideNav, CinematicNavMenu, CommandLauncher, FooterNav) prints `<TierBadge tier={l.plan} />` after the label. If WP18 moves a tool between plans, the chip follows; nothing in the nav says "Premium" by hand. The Deal Finder copy on the home says what is true: the top three are free, all of them are Plus and Premium. The nav also gains the new entries (`/preorders`, `/creators`, `/embed`, `/commanders`, colour and treatment terms) with the MTG search keywords; `tests/nav-routes.test.ts` stays red until the packages that own those pages have built them.
Cost: the chip adds width to three labels in each menu.
Evidence: tests/nav-search.test.ts (the new keywords rank their page first) and tests/sidenav.test.ts (the MTG labels).

## An optional read on the home page and in the static sitemap section falls back on any failure, including a throw before the promise exists — 2026-10-08

2026-10-08. Review of WP15. `loadHomeData` chained `.catch(() => [])` on the movers and recently-updated loaders, and the `static` sitemap section did the same for the keyword index, the deck library and the store stats. A `.catch` only sees a rejected promise: a loader that throws while it is being called (today every unimplemented stub, tomorrow any non-async function or a failure in its argument handling) escaped it, and the home page and `/sitemaps/static-0.xml` answered 500 and 503 for want of a tab or a few hub URLs. Measured on the real 2026-10-07 tree before the change: `static-0.xml` was a 503 with the three loaders stubbed. `soft()` in `home-data.ts` and `optionalRead()` in `sitemap-sections.ts` run the read inside `Promise.resolve().then(read)`, so a rejection and a synchronous throw both give the fallback. The data that is not optional (`getHomeBoard`, `getHomeStats`, `getSets`, the plan) still fails the page, which is the 503/stale-while-error path of contract 12.7.
Two smaller review fixes ride with it. The plan chip of a paid tool on the phone menu's ACTIVE row (a solid amethyst fill) turns white on a darkened chip, because the brass Premium chip is 2.1:1 there; `tests/site-chrome.test.ts` computes both ratios from the tokens. The six chips under the hero search say "Popular", not "Trending": they are the EDHREC order of hm/home.json, which is evergreen staples, and the repository's rule is that no list claims a signal we do not measure.
Cost: one extra microtask per optional read. Reversal: none wanted; the reads that must fail a page do not use the helper.
Evidence: tests/sitemap-sections.test.ts "an optional read of the static section ...", the route source pins, and `GET /sitemaps/static-0.xml` against the real tree (146 URLs, 200, with the three loaders stubbed).

## postTitle(post, pricesAt) in seo.ts stands in for the old per-post title helper until the editorial package settles it — 2026-10-08

2026-10-08. OP's feeds, the news sitemap and the editorial hub built a post title by handing `Post.title` a catalogue (`cat.pricesAt` puts the month into a title). MTG has no catalogue object on those routes, only the pointer's `priceDay`. `postTitle(post, pricesAt)` in `src/lib/seo.ts` takes that day as an argument (the routes read it from the pointer, the hub from `updatedAt`), hands `Post.title` the one field titles read, `{ cat: { pricesAt } }`, and falls back to now when there is no day. `feed.xml`, `feed.json`, `news-sitemap.xml` and `EditorialHub` call it; each route is `force-dynamic` with `publicDataHeaders`, and no loader is called inside an `unstable_cache` callback. The adapter goes when the editorial package gives `Post.title` a smaller context.
Open: the slugs `COUNTRY_GUIDE_SLUGS` (`where-to-buy-magic-cards`) and `CHEAPER_ABROAD_SLUG` (`are-magic-cards-cheaper-abroad`) point at guides that WP17 has not published yet, so tests/home.test.ts "every editorial pick resolves to a real post" is red by design (REQ-WP15-5).
Evidence: tests/news-sitemap.test.ts "postTitle ..." case.

## The sitemap is an index and sections read from the published plan; the section count is the number of FILES — 2026-10-08

2026-10-08. `/sitemap.xml` is a sitemap INDEX and `/sitemaps/<kind>-<n>.xml` (kinds `static`, `sets`, `sealed`, `commanders`, `names`, `cards`) are route handlers, not a metadata `sitemap.ts` (the build-reads-no-data rules forbid a metadata route that reads the plane, and a build would otherwise bake 35,000 URLs in). `sm/plan.json` counts the section FILES the importer wrote; `static` is always 1 and is composed from code (the fixed page list, the regional homes, the colour, rarity, type and treatment hubs, posts, authors, keywords with at least 5 cards, decks, stores). A child asks `getSitemapSection(kind, n)` for slugs only; a section outside the plan, an unsafe slug (`isSafeSlug`) or a bad index is a 404, a plane failure a 503 with `retry-after`. Every child carries `<lastmod>` = the pointer's `priceDay`, because that is the one date the published data truly has per section; a per-URL lastmod would be invented. THIN rows and `?finish` URLs are never listed (the importer writes only `isIndexable` rows; the route never adds a query string).
IndexNow used to submit the child sitemap URLs themselves; it now follows the index and by default sends only `static`, `sets`, `sealed`, `commanders` (the hubs and the releases: about 7,600 URLs on the real tree, 399 sets, 3,712 sealed products and 3,467 commanders, capped at IndexNow's 10,000 per run) at 23:15 UTC after the daily publish, so the 35,000 card pages are not pushed every night; `--sections=` and `--max=` widen it by hand. The Search Console job submits the index and each child.
Cost: a card's own lastmod is the day, so a crawler cannot tell a changed page from an unchanged one; the price day moves for every priced page anyway.
Evidence: the real 2026-10-07 tree has `plan.json` {"cards":4,"names":2,"sets":1,"sealed":1,"commanders":1,"urls":{"cards":35015}}, every file within 10,000 and every slug safe (tests/sitemap-sections.test.ts "the real bootstrap tree"); 15 tests there.

## Brand: Arcane Ink (amethyst on indigo ink, brass accent), dark by default, no Wizards mark — 2026-10-08

2026-10-08. MTG Compare's identity is "Arcane Ink": near-black surfaces tinted toward indigo (hue about 245), a lavender-grey text ramp, one amethyst brand colour (`#9140da` fill, `#c394f4` link shade in the dark theme, `#6a24b0` in the light one) and the brass `gold` that still means Premium and foil. The token NAMES are OP Compare's (`ink-*`, `brand-*`, `slate-*`, `gold`, `up`, `down`, the chromatic text shades), so no component changes; the VALUES are new, in `globals.css` and `tailwind.config.ts`, and `tests/theme.test.ts` pins them value for value and re-proves WCAG AA on every surface in both themes (white ink on the amethyst fills 5.3:1 and 7.0:1). Two tokens are added for the frozen rarity table of `constants.ts`: `orange-300` (Mythic text) and `fuchsia-300` (Special text; stock Tailwind fuchsia-300 reads 1.9:1 on the light theme's white cards), each themed in both palettes. The scrollbar colours of both themes follow the ink ramp (the spec had left OP's blue-grey ones).
The default theme is DARK (RiftCompare's choice; OP Compare chose light on the owner's request for that site). It needs five coordinated pins (`DEFAULT_THEME` and the boot script's fallback in `theme-shared.ts`, `<html data-theme>` and `viewport.themeColor` in `layout.tsx`, ThemeToggle's initial state, the tests); flipping it is the owner's call and touches exactly those spots. The amethyst sits in the one large unused arc of the hue wheel (green is Rift, red is OP, blue is eBay and TCGplayer, `up`/`down`/`gold` are semantic) and stays 9 degrees of hue from Scryfall's own purple but much lighter and brighter (open question, brand-spec.md 11.9).
The mark is two overlapping rounded rhombi, amethyst and brass, the overlap in ivory: a comparison, original and abstract. `scripts/gen-icons.ts` writes every icon from one pair of path strings (`MARK_PATHS` in `components/Logo.tsx`), including the one-colour `logo-mask.svg` that `BrandLogo` masks, so nothing drifts; it is deterministic (re-running reproduces the committed files byte for byte). No mana, set or Planeswalker symbol, no card frame, no Wizards logotype anywhere in the chrome, icons or share images; card art is shown whole and unaltered. The share-image title face is Cinzel Black (OFL, bundled as a static TTF with its licence) in place of the comic Luckiest Guy.
Cost: three new files outside the plan's list (the maskable icon, Cinzel and its licence; REQ-WP16-11). Evidence: brand-spec.md (contrast table, three directions compared), the icons and every share composition rendered through the real ImageResponse and looked at.

## Which printings the price-guide share image shows: the card, once, in a main set, with its foil word — 2026-10-08

2026-10-08. OP's rule ("the top of the price guide minus what a reader would call wrong") needs Magic's vocabulary. `pickGuideRows` takes the first page (100) of the guide's default sort, keeps a card only when it has a scan on either host, a TCGplayer MARKET of at least US$10 (never a thin low: a single US$20,000 serialized listing cannot lead), a US listing, a set of kind expansion, core or masters (`MAIN_SET_KINDS`), and a printing that is not a promo, serialized or foreign-language one (treatment kinds `promo`, `serial`, `language`, the PROMO and SERIAL flags, and a short text rule for what the closed vocabulary cannot see). It then keeps listings within 0.5-1.2x of the market with two or more stores, relaxes to one store, then to no band, and takes ONE printing per Oracle card (one row of five Lightning Bolts), sorted by the cheapest US price. Fewer than 3 rows draw the data-free fallback.
Real case that decided the band: Black Lotus of the 30th Anniversary Edition has a market of US$3,299.99 and one store asking US$5,999.99 (1.82x), so it would have topped the image on a mis-listing; it only appears when nothing else qualifies, and then as the market, with the ask on a second line (`ogPriceLines`). Alpha Counterspell asks 1.32x its market, so the Beta printing is the card's row. The unit shown is the card's headline (Normal first); a foil-only or foil-headline unit says so in its badge (`Standard · Foil`, `Borderless · Facet Foil`) so a foil price is never read as the plain card's (7th Edition Birds of Paradise: US$22.89 Normal, US$3,980.75 Foil).
Reversible: the sets, treatment kinds and the 1.2x band are constants at the top of `src/lib/og/select.ts`, each pinned by a real product in tests/og.test.ts (TCGCSV 2026-10-07).

## Share images render per request from the published data (force-dynamic, no revalidate), art whole — 2026-10-08

2026-10-08. Every `opengraph-image.tsx` now exports `dynamic = "force-dynamic"` and no `revalidate`. OP's `revalidate = 21600` made the param-less routes (`/`, `/price-guide`) prerender at `next build`; the images now read the published data, so a build that prerendered them would read the data host and bake a degraded image for the window (tests/build-no-data.test.ts rules A and B; WP16 was 9 offenders there, now 0). Freshness is unchanged: `OG_CACHED` (`s-maxage=21600, stale-while-revalidate=86400`) keeps an image 6 h at the CDN and a fallback one minute, and `ogArt` still caches each scan for a week in the Data Cache.
The loaders are the data layer's, never Neon except for the two images of user content: `getCardPage({ sort: "value", per: 100 })` + `getSetIndex()` + `getHomeStats()` (home, /price-guide), `getSetBySlug` + `getSetHighlights` + `getCardsByIds` (+ `getSealedBySet` for an unreleased set), `getSealedDetail`, `getCardLookup`; the deck image reads `getPublishedDeck` and the Rising image `getRisingSnapshot` (both Neon-backed, any failure draws the fallback). A store count comes from `getHomeStats().liveStoresAll` and is LEFT OUT of the image before the first store run: OP fell back to the registry size, which in MTG would be 67 seed stores that no probe has admitted yet (10.26), so the image would claim stores that price nothing.
Card art is `imageFor(c, "og")`, the one size that is a JPEG on both hosts (satori cannot decode WebP), drawn with `object-fit: contain` in 5:7 boxes so Scryfall's rule "never crop or clip the copyright and artist line" holds even if a box is a pixel off; the blog fan keeps the front card whole.
Cost: `public-no-neon` stays at 1 file for WP16 until `deckOg` and `risingOg` move to modules of their own (REQ-WP16-10 (d)). Evidence: tests/og.test.ts (36 tests, every composition rendered to a PNG with the bundled fonts); the images rendered with real TCGplayer and Scryfall art (Ancestral Recall, Time Walk, Sol Ring, The One Ring, Birds of Paradise, a Play Booster Display) and looked at.

## Site identity in one file: placeholder domain and contact, sister sites, the Wizards sentence once — 2026-10-08

2026-10-08. `src/lib/site.ts` holds the name (`MTG Compare`, short `MTGCompare`), tagline, description, `SITE_URL`, `CONTACT_EMAIL`, `DISCORD_URL`, the sister sites and the legal strings. `SITE_URL` defaults to `https://mtgcompare.app`, a PLACEHOLDER: on 2026-10-08 the domain answered `DEPLOYMENT_PAUSED` from Vercel (it may already belong to someone) and `mtgcompare.com` is a live, unrelated "MTG Compare UK" site in the same niche; the name collision and the domain are the owner's decisions (brand-spec.md 11.1-11.2), the default only makes sure a missing env var never publishes canonicals on another host (tests/domain.test.ts). `CONTACT_EMAIL` defaults to `contact@mtgcompare.invalid`: the `.invalid` TLD can never deliver, so nothing reaches a stranger; the real address is `NEXT_PUBLIC_CONTACT_EMAIL`. This differs from contract 10.21 and `tests/fixtures/env-names.json`, which name `contact@mtgcompare.app`: that placeholder sits on the very domain that may belong to someone else, so every mailto on About, Contact and the footer would write to a stranger until the owner sets the variable (only the default text of the row changes; the variable, where it is read and its flag do not).
The Fan Content sentence (`FAN_CONTENT_DISCLAIMER`, the policy's own template with the site's name), the unofficial-fan-site notice, the Scryfall attribution and `SISTER_SITES` (RiftCompare, OP Compare; `SISTER_SITE` stays the first entry so About and the footer compile) are exported once; the footer, About and Terms import them instead of retyping them. The sentence says "permitted under the Fan Content Policy": whether a site with a paid tier may say so is the owner's open question with Wizards (contract 10.10); the constant does not decide it. The share images' host line follows `SITE_URL`, so a domain change edits nothing else.
Cost: the OP Compare entry of `SISTER_SITES` is the one remaining hit of the legacy-vocabulary scan in WP16's files (REQ-WP16-10 (c)). Reversible: one constant and one `sed` over the files that name the domain.

## Seven editorial posts, built from bounded loaders — 2026-10-08

The nine One Piece posts became seven Magic ones: most expensive cards, which sets hold the value, the newest set's chase cards, booster box prices, rarities (guide), where to buy (guide) and cheaper abroad (guide). The budget-alt-arts and cheap-leaders posts were deleted rather than ported: neither has a Magic equivalent the data can carry (the first is a printing-class story that a market-price ranking already tells, the second would have needed the whole catalogue to find "cheap staples"), and "publish fewer pages than feels natural" was the brief after RiftCompare's low-value rejection. Slugs are those `src/lib/seo.ts` names for the region homes (`where-to-buy-magic-cards`, `are-magic-cards-cheaper-abroad`); both are guides.

`PostContext` no longer holds the catalogue. `postContext()` in `src/lib/blog/context.ts` runs a fixed set of bounded loaders (the dearest 100 cards, the dearest foils, rarity counts from four in-memory queries per rarity, 16 set boards, the Booster Box list, the cross-market gaps of the six markets) and never calls `getCatalog()`; so blog and guide pages and their share images work in a production deployment, where the shim refuses to run. `Post.title` still takes `{ cat: { pricesAt } }`, so feeds, sitemaps and the 404 can title a post without building it. A post sentence that needs a fact prints only when the fact exists; no number is typed.

Analyses that needed a whole-catalogue scan (median price ratio per market, the below-market share by price band, set-by-set top-five shares for every set) were dropped or narrowed to the 16 most valuable sets; the cross-market post uses the published store-only gaps (`getMarketRecords`) instead of a computed median.

## Trust pages quote the constants, not their own copy — 2026-10-08

About and Terms render `UNOFFICIAL_FAN_SITE_NOTICE`, `FAN_CONTENT_DISCLAIMER` (the Fan Content Policy sentence, verbatim, typed once in `src/lib/site.ts`) and `DATA_ATTRIBUTION`; Methodology names Scryfall and TCGplayer through `DATA_ATTRIBUTION` and `SCRYFALL_URL`. Cadence is quoted from `release-schedule.ts` (`RELEASE_COPY`) and said in words everywhere else ("once a day"); no hour of the day is typed in a page, as `tests/trust-pages.test.ts` requires. Privacy names the renamed cookies (`mc_session`, `mc_auth`, `mc_adfree`), gives its analytics section `id="advertising"` for the footer's "Privacy settings" link, and says that card data and images come from Scryfall. Nothing on the pages claims the price history is public open data: the data repository is private. Scryfall's terms are still unverified before launch (scryfall-terms.md); nothing paywalls Scryfall data.

## The billing scripts (parity P24) are read-only, take arguments, and the audit has no FIX mode — 2026-10-08

2026-10-08. `scripts/diagnose-billing.ts <email>`, `scripts/audit-premium-vs-stripe.ts` and `scripts/funnel-report.ts [weeks]` are RiftCompare's three scripts on MTG Compare's model (no trial, a date and a tier on the User row, `isOurSubscription` as the filter). RiftCompare's audit has a `FIX=1` mode that stamps `premiumUntil`, `premiumTier` and `stripeCustomerId`; here it does not exist, because the entitlement writers are four (the webhook, the daily reconcile, the admin grant and revoke routes, the launch promotion) and a maintenance script is not one of them (CLAUDE.md, "Plus & Premium"). The audit reports a shortfall, a tier mismatch, a renewal that cannot find its row and a paying customer with no account, by id only (CI logs are retained), exits red on any, and names the repair: the Stripe reconcile (`POST /api/admin/stripe-reconcile` or the daily cron), which is extend-only. The e-mail of a customer is looked up only to say whether an account with it exists, never printed or written. The funnel report buckets accounts, plan clicks, checkout starts, subscriptions by tier and interval, cancellations and lapsed entitlements by ISO week, plus sign-up sources, their 7-day activation and the surfaces that led to clicks and checkouts. The targets are arguments, not environment variables, because every variable the code reads is a row of Annex B (tests/env-names.test.ts). Verified against a scratch database (mtgcompare_wp18) for the Postgres half of the funnel report; the Stripe halves type-check but could not be run (no Stripe account exists yet).
Reversal: a FIX mode would need an owner's amendment to the entitlement-writer rule first.

## The three paid tools have one gate, one mint, and copy written from the same table — 2026-10-08

2026-10-08. Deal Finder is Plus and Premium; Rising Cards and Demand Finder are Premium only (owner, addendum 10). `src/lib/premium-gates.ts` is the only module that says who gets how many rows of them; nothing else compares a tier. Three things follow in WP18's files. (1) The Entitlement a paid loader takes is minted by `entitlementOf(user)` in `src/lib/premium.ts` (an admin is `premium` because `tierOf` says so; no user is signed out) and, for a request, by `currentEntitlement()` in `src/lib/auth.ts`, which is `entitlementOfRead(getCurrentUser)`: a read of the user that throws (Neon down) is a signed-out viewer, never Premium and never an error page. The contract's prose puts the mint in `src/lib/data/entitlement.ts`; that file would need a barrel line and an owner, so the mint sits next to `tierOf` (requests/AMENDMENTS.md W18-1). (2) The three paid rows of `TIER_COMPARISON` are written from `gateMatrix()` (same strings as before: `Top 3` / `Full list + only my cards`; `Top 3` / `Top 3` / `Full list`; `Top 10 searched` / tick), `dashboard-tools.ts` reads the tier and the free taste from `FEATURE_RULES`, `login-context.ts` and the FAQ read the row constants, and /premium prints a "three paid tools" table from `paidToolRows()` (plans.ts, also what docs/premium-gates.md should print); `tests/tier-comparison-rows.test.ts` reads the cells back into numbers and fails when a row and the gate disagree. `dealAccess()` stays as a thin wrapper over `accessFor` until the Deal Finder page moves. (3) The upgrade asks follow the tool: the Rising Cards nudge opens the Premium plan, the Deal Finder nudge the Plus plan, the welcome page lists Rising Cards and Demand Finder only for Premium, the Plus bullet is "Deal Finder in full, no watchlist or portfolio limit", and the member quick links on /premium open a paid tool only where `accessFor` says `full` (a Plus member sees Deal Finder, not Rising Cards or Demand Finder). Premium sells only our analytics: the page says names, images, prices, charts and search stay free (contract 10.8).
Evidence: tests/premium-gates.test.ts (9), tests/tier-comparison-rows.test.ts (6), tests/premium.test.ts (entitlementOf, failed read), tests/premium-surface.test.ts (the three `gate:*` surfaces are valid beacon surfaces), tests/premium-tiers.test.ts (the quick links). Reversal: change a constant of tier-limits.ts or a `minTier` in premium-gates.ts; the table, the dashboard, the login line and /premium follow, and the test names what moved.

## The personal nudge counts from the account's own ids; the sign-up popup stays off the buy path until a buy click — 2026-10-08

2026-10-08. Two small conversion rules (parity P28, P43). The personal Premium nudge ("4 cards you watch are underpriced right now") cannot read a ranking file any more (nothing paid is a file) and OP's `getDealRankById` is gone. `getPremiumNudge(userId, country, who?)` asks the Deal Finder loader for the positions of the account's own watched units (`getDealRanksOf`, requested from WP13 as REQ-WP18-1, looked up at run time) and falls back to the account's own slice (the free top 3), which can only undercount. It reveals counts, whether a card is in the free top 3 and one example name, never a price or a rank; Rising Cards is not folded in (its picks beyond the preview exist only behind the gate), and its line now sends a free account to Premium, not Plus. `src/lib/buy-intent.ts` is the shared signal between OutboundLink and the launch popup: `registerBuyLink()` on mount, `markBuyClick()` after the `buy_click` event, `buyPathClear(buyLinks, bought)` as the rule. LaunchPromoPopup asks `useBuyPathClear()`: a page with a buy link is left alone until the visitor has clicked out to a store this session, the one moment an ask cannot cost a buy_click; a page without one (home, price guide) is asked as before. Until WP06 wires the two calls (REQ-WP18-8) `buyLinksOnPage()` is false and nothing changes. The flag is per tab session (`mc_bought_this_session`); private mode fails to "not bought", the safe direction.
Reversal: delete the `buyPathClear &&` term in LaunchPromoPopup. Evidence: tests/buy-intent.test.ts, tests/premium-nudge.test.ts.

## `data/site.ts` reads no plane file itself; a price report is checked against the published catalogue — 2026-10-08

2026-10-08. `getSiteStats`, `getHomeStats`, `getApprovedReviews` and `getLaunchPromo` are composed from loaders that already own their files (`getStoreStats`, `getCatalogStats`, `getPlaneStatus`) plus three small Neon reads, so `site.ts` imports nothing from `./plane`: a module that reads the plane may hold no `unstable_cache` (nested-cache RULE 5), and the Neon bits need one. TCGplayer is added as the US "store" row (OP and RiftCompare count it, `countsAsStore`), eBay never; "prices updated" is the publish time of `status.json`, else the catalogue's price day. `getHomeStats` takes `pricedByMarket` from `getCatalogStats` rather than guessing it from the run file, and never touches Neon. The Neon bits are N-kind entries whose callback only queries Neon and whose failure throws inside (nothing empty is stored): `ebayLive` (an OK `ImportRun` kind `ebay` within 3 days; false when Neon is down), the approved reviews (6 h, `[]` on error, the select never includes the reply e-mail), the promo counter (30 s; an error reads as "none left", so the popup hides).
A wrong-price report (`createPriceReport`) no longer needs `Card`, `Sealed` or `Offer` tables: the product must exist in the published catalogue (`cardExists` / `sealedExists`), the price we showed is read server-side from the published offers with `readLiveOffers` for the unit (never from the request; singles only, never an eBay row), the report carries the `finish` (0 Normal, 1 Foil; absent means Normal) and keeps `listingTitle` null (offers publish no title). If the catalogue cannot be reached the visitor gets a 503 and their rate-limit slots back, not "Unknown product". Evidence: tests/launch-promo.test.ts (site loaders, real store sizes from the probe), tests/inbox.test.ts (`pickShownOffer` over a real Counterspell product, 238617). Open: ReviewsSection is still a server component on the public home page (the ratchet counts it); it needs `/api/reviews` (REQ-WP18-7).

## MTG Compare bills through its own Stripe account; the names are `mtgcompare`, and the owner alone sees Stripe's setup messages — 2026-10-08

2026-10-08. The account is a NEW one inside the owner's RiftCompare organisation (REQUIREMENTS section 2), so nothing of RiftCompare's Stripe is read or written. `STRIPE_SITE` is `mtgcompare` (also the guard `isOurSubscription` applies to a Price or a subscription), the lookup keys are `mtgcompare_{plus,premium}_{month,year}`, the Checkout metadata `kind` is `mc_premium` (matched by the webhook and the welcome page), the portal configuration is found by `metadata.site`, the products are "MTG Compare Plus" and "MTG Compare Premium" with the statement descriptor `MTGCOMPARE` (set and kept by `scripts/stripe-setup.ts`). Prices stay Plus $2.99 / $23.99 and Premium $4.99 / $39.99, no trial, the launch promotion unchanged (first 50 new accounts, 30 days, one atomic capped claim): the owner's call, CLAUDE.md. The account's brand colour `#9140da` and icon `<SITE_URL>/icon-512.png` are Dashboard settings with no API for one's own account, so the script only READS them and prints what is off. Webhook events are the same six as OP's; `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are fresh. Cookies and storage keys are `mc_*` (rename-table.md); the support ticket prefix is `MC-`.
One deviation from OP: a Stripe error that names a Dashboard step (a new account without a business name, a portal not saved) carries a stripe.com URL. The checkout and portal routes return that message to an ADMIN only (`checkoutErrorText`), where `StripeErrorNotice` turns it into a button that links stripe.com addresses and nothing else; a visitor gets the generic line. Evidence: tests/buy-intent.test.ts, tests/checkout-params.test.ts, tests/premium.test.ts. Until Wizards or counsel have said whether a subscription may sit beside Fan Content (contract 10.10) the account should stay in test mode.

## The audits: egress budgets per statement shape, a data audit over the pointed commit, a database audit; each a green no-op without its secrets — 2026-10-08

2026-10-08. Neon holds private state only, so `egress-audit.yml` (Sunday 03:00 UTC, when no import, eBay pass or release runs) does three things: counts `[deploy]` commit SUBJECTS of the last seven days and fails above two (the weekly release plus one urgent; RiftCompare's RM9 had 16 in four days and nothing counted); samples `pg_stat_statements` and compares every statement shape with `QUERY_BUDGETS` in `scripts/audit-egress.ts` (rows per call always, calls per day only on a window of a day or more, a short window warns); and reads the data repository's size, freshness and API quota (`audit-publication.ts --remote`). A retired table (Card, Offer, PriceHistory...) coming back, a table outside the 28 private ones, a sequential scan of a big table and an estimated day above 60% of an even share of 5 GB are findings; platform noise and the audit's own reads are counted, never budgeted. `data-audit.yml` (00:20 UTC daily, after the last publish retry) checks out the POINTED commit, not the branch head, and runs the validator, sizes against FILE_BUDGETS, identity (C1, C3, C9, C11, C14) against the previous publish, price consistency (one price, six copies) and history. `db-audit.yml` (Monday 03:30 UTC): footprint against 100 MB, retention (clicks 90 days, eBay rows 72 hours), the eBay ledger against its cap, the launch-promo counter, tiers and the orphan sweep of every user-row product id against the published catalogue. All three have their own concurrency group, are read-only and cannot delay a publish; each prints "green no-op" and passes when its secret is missing; a failure posts to OPS_WEBHOOK_URL when that optional secret exists.
Evidence: audit-egress run against a real PostgreSQL 16 with `pg_stat_statements` (cumulative and `--sample=1`: it flagged an unbounded `select * from "ClickEvent"` at 3,000 rows a call and a recreated `Card` table); db-audit against a scratch database and the 99,079-card M1 tree; the data audits against the M1 bootstrap tree; the pure parts in tests/history-egress.test.ts, tests/publication-guard.test.ts, tests/db-migration-guard.test.ts.

## The CI build job proves the build needs neither Neon nor the data host, and the SEO gate starts report-only — 2026-10-08

2026-10-08. `ci-build.yml` (every pull request and push to main) runs `npm run build` with `DATABASE_URL=postgresql://nobody:x@127.0.0.1:1/none`, `PLANE_REPO=nobody/none` and `PLANE_TOKEN=x`: a build that exits 0 proves Annex C check 24. `scripts/smoke-pages.ts --check-build` then reads `.next/prerender-manifest.json` and fails if any route of headers.json's page lists was prerendered (the DP-01 failure: a data page baked with "degraded plane read"). The server starts with `PLANE_DIR` = the golden mini tree (`smoke-pages.ts --write-tree`) and the same unreachable DATABASE_URL, and the smoke test, `status-check.ts` (an unknown card, set, sealed product, commander, store is a real 404, not a soft 404 and not a 503) and a gate fetch the pages: that is check 23, public pages with Neon down. The job names no secret and no variable (a test fails if one appears), so it cannot reach a real database even by mistake. `seo-gate.ts` and `crawl-check.ts` are `continue-on-error` and write a job summary: their thresholds (150 words, unique titles, price band) were written before a rendered MTG page existed; delete the flag when they have run clean on main a few times. `seo-preview-gate.yml` runs the same on a Vercel `deployment_status`, Production included, because `claude/*` branches get no preview.
Cost: a full build and a server start on every pull request (a 30-minute job ceiling; the real duration is unmeasured until the first run). Reverse: none; the gate is the point of the weekly release.
Unverified here: `next build` itself (the tree is red at C0 by design, so the job's build step cannot pass until the packages land); every script and the pure parts were run.

## The comment stripper of the scans respects strings, templates and regular expressions — 2026-10-08

2026-10-08. Every source scan (legacy vocabulary, environment names, cache rules, the new ratchets) first removed comments with three regular expressions. A header of `"*/*"` (the Accept value in src/lib/scryfall.ts) is the two characters `/*` to the regex, so it opened a "block comment" that ran to the next `*/`, forty lines later, and everything in between was invisible to every scan: 151 of the 985 files of src, scripts and tests lost code, among them src/lib/data/plane/validate.ts, scryfall.ts and InboxActions.tsx, and `process.env.SCRYFALL_BACKOFF_MS` was "not read anywhere". `stripComments` in tests/helpers/ratchet.ts is now a small scanner (strings, template literals with `${}` nesting, regex literals, `://` in a URL) that keeps line breaks so line numbers do not move; `stripNonCode` in cache-scan.ts and the env test use it, and tests/legacy-vocab.test.ts pins the shapes that broke the old one.
Cost: a scanner where there were three one-liners; JSX text with an apostrophe makes it treat the rest of that line as a string (it ends at the newline, and the line is kept verbatim, so the worst case is a comment left in place).
Evidence: tests/legacy-vocab.test.ts "the comment stripper keeps code that looks like a comment"; the re-run of the ratchets after the change raised no owner's count.

## The environment table also counts reads through an `env` parameter, and has a retired-names list — 2026-10-08

2026-10-08. Annex B says "every `process.env.NAME`" is a row. The scripts and libraries the importer shares take `env` as an argument (so tests can pass their own), and read `env.PLANE_REMOTE`, `d.env.GITHUB_TOKEN`, `env.ADMIN_EXTRA_ORIGINS`: the first scan could not see them, and OP's 65 names included several that the table never had. tests/env-names.test.ts now scans `\benv\.NAME` and `env["NAME"]` too; that added ADMIN_EXTRA_ORIGINS, PLANE_REMOTE, PLANE_WORK_DIR, IMPORT_CACHE_DIR, TCGCSV_LAST_UPDATED, SCRYFALL_BACKOFF_MS, the platform values (VERCEL, CI, GITHUB_ACTIONS, GITHUB_REPOSITORY, GITHUB_TOKEN, GIT_CONFIG_*), TARGET_DATABASE_URL (the maintenance task) and the two dev-tooling names of gen-ownership.ts, and widened three `where` lists to the files that really read them (SCRYFALL_MODE, BOOTSTRAP_GROUPS, ALERT_DAILY_BUDGET). The fixture is 138 rows (Annex B's 120 plus 18). The fixture carries `retired` (name -> replacement): EBAY_AFFILIATE_CAMPAIGN, TCGPLAYER_IMPACT_LINK, HISTORY_DIR, HISTORY_LOCAL_DIR, HISTORY_RAW_BASE, HISTORY_REF, STRIPE_SITE (PREMIUM_DATA_KEY is deliberately NOT listed: tests/plane-no-premium.test.ts forbids the name in any env table, and the table test asserts it is not a row); none may be read, named by a workflow, listed in .env.example or come back as a row, and the failure prints the replacement.
Cost: a new reader of an environment variable must add a row first (that is the point). Reverse: none planned.
Evidence: `node --import tsx --test tests/env-names.test.ts`; the remaining reds are WP06 (affiliate.ts), WP05 (ebay-prices.yml) and WP21 (.env.example).

## Ops alerts are one incoming webhook posted by one script, never a bot — 2026-10-08

2026-10-08. Parity P39 asked for a Discord channel for store-health and freshness alerts; S09 says the Pokemon Discord app was built and removed. The answer is `OPS_WEBHOOK_URL`, an optional Actions secret that is a Discord OR Slack incoming-webhook address (the payload shape is chosen by the exact host; anything else gets a Slack-compatible `{ text }`), and `scripts/ops-webhook.ts` as the only code that names it, called as the LAST step of a workflow (`--file report.txt --tail 25 --url <run>`). Rules: https only; every line is redacted (webhook addresses, tokens, connection strings, bearer headers, e-mail addresses) before it leaves the runner, because a log line quoted into an alert is where secrets get published; `allowed_mentions` is empty (an alert never pings @everyone); one retry, only on 429, after the wait the host asked for (at most 5 s); never throws, and an alert that cannot be delivered is a log line, not a red job; unset, it prints what it would have said. Nothing under src/app or src/components imports src/lib/ops-webhook.ts, and no other file may call a Discord API route (tests/no-email-api.test.ts holds it next to the mail rule).
Cost: no interactive commands, no daily post. Reverse: a bot would need a gateway process Actions cannot host.

## What may be committed: no eBay item data, no personal address, no credential, no data; the published tree gets the same scan — 2026-10-08

2026-10-08. tests/publication-guard.test.ts scans every file git would commit (tracked plus untracked and not ignored) for eBay item URLs, Browse item ids and listing photos with a real hash (a made-up `g/abc` path in a fixture is not one), for e-mail addresses (allowed: the admin default, reserved example domains, `.invalid`, one-letter test domains, GitHub's, this site's placeholder domain, and three made-up gmail aliases that the plus/dot normalisation tests use), and for credentials (GitHub, payment, cloud, chat and mail tokens, webhook addresses, a connection string with a password for a host that is not loopback). Per owner, as a ratchet: the baseline holds the previous owner's personal address in a comment of alert-mute.ts and two OP Compare mailboxes (WP14, WP21 requests filed). The source repository holds no env file, no dump, no price history, no file over 1,000,000 bytes and, under data/, only slug-seed.json. The same three scanners run on the golden tree and, when one is on disk, on the real published tree with the validator in the phase its pointer names, next to the publisher's own FORBIDDEN_TEXT.
Why a second scan when validate.ts has one: the validator guards the data repository at publish time; this guards the SOURCE repository, which the validator never sees, with the same definition of "clean".

## Cross-cutting rules are per-owner ratchets, and the baseline only ever goes down — 2026-10-08

2026-10-08. The new quality tests (site-claims, trust-pages, internal-links, canonical-host, indexability-fail-open, affiliate-priority, revalidate-paths-exist, no-get-catalog, publication-guard, history-egress) read the files of every package, most of them still the One Piece code, so none of them can be a plain assertion without turning forty owners' work red for a reason that is not theirs. Each reports its offenders PER OWNER through `ratchet(id, files)` (tests/helpers/ratchet.ts, owner from docs/ownership.json) and fails only when an owner's count rises above its key in tests/fixtures/ratchet-baseline.json; `RATCHET_STRICT=1` (M2) requires zero. A rule whose offender is a missing page of a LATER wave (the Commander deck route, the www redirect) is recorded the same way against the owner of the file that points at it.
The baseline is written by `scripts/ratchet-baseline.ts`. New: `--lower` rewrites it LOWERING keys only (a key falls to the owner's current count and is dropped at zero, where `<id>/*` = 0 takes over; a ratchet the baseline has never seen is recorded at its first measurement; no key is ever raised, so an owner that gained an offender stays red). A package asks for a lower key by running it, or by filing a request.
Cost: a ratchet at its baseline hides nothing, but it also does not fail; the counts are the to-do list and `--check` prints them. Reverse: delete the baseline key of a rule once its count is zero and strict.
Evidence: `npx tsx scripts/ratchet-baseline.ts --check` (40 ratchets at this commit); `--lower` took WP16, WP18 and WP15 to zero on 14 keys without touching any other.

## "Could not read" is a 503, and what the sitemap submits is checked against the catalogue — 2026-10-08

2026-10-08. RiftCompare's set gallery noindexed itself when a count fell back to 0 on a database error. The published-data equivalent is a transport failure turned into "no pages": a sitemap that answers 200 with nothing, or a page that swallows a loader's error and then decides `index: false`. tests/indexability-fail-open.test.ts pins three things: the sitemap index and its sections answer 503 + Retry-After + no-store when the data host is unreachable and nothing is in the instance (shown with a rejecting fetch, 170 ms, no network), 404 only for a section that is really not in the plan, 200 with `<sitemapindex>` / `<urlset>` from a readable tree; every URL of the cards sections in the real tree has a catalogue row that is LISTED and not THIN (sampled, Annex C check 17); and a ratchet on pages that swallow a published-data loader's error and decide to suppress indexing in the same file (a Neon panel may degrade quietly: tests/helpers/import-graph.ts NEON_LOADERS is the shared list). A MISSING `sm/plan.json` in a readable tree is a true answer (static pages only), not a failure; that is why the unreachable case is tested with a failing transport and not an empty directory.
Evidence: `src/app/stores/[slug]/page.tsx` swallows `getStoreStats()` and then sets `robots: { index: false }` when the store is missing from the result (WP04's count of 1).

## Growth surfaces: launch scope — 2026-10-08

The launch cut of WP20 ships the embeds (card price badge, market index, release countdown, all server-rendered HTML with `frame-ancestors *` and no script), the store badge, copy-as-post text, the llms mirrors (read from plane loaders, never the catalogue shim, `force-dynamic`) and the AI-crawler robots policy (answer/search bots allowed, training-only bots blocked; sitemap index plus news sitemap only). `config/security-headers.js` exempts `/embed/*` from X-Frame-Options; next.config.js (WP21) must `require` it.
Deferred: the pre-order page, `/llm/*` mirrors, extra share images and `/api/og`.

## The admin console: nine OP pages, eight new panels, and Run buttons that are optional — 2026-10-08

2026-10-08. Beyond OP's pages the console has `/admin/data` (publication status from `status.json` and the pointer, not Neon: it renders when Neon is down), `/admin/ebay` (the ledger the eBay job wrote), `/admin/deploys`, `/admin/database` (Neon against the 100 MB target), `/admin/clicks` (ported from RiftCompare over `ClickEvent`), `/admin/loyalty`, `/admin/mail` and `/admin/lookup`. Every page calls `requireAdminPage()` first and every route `requireAdminApi()` first (`tests/admin.test.ts` walks the trees); the traffic lights are the pure functions of `src/lib/admin-alarms.ts` and an input that cannot be read is grey, never green. The three dispatch routes (`ebay-run`, `deploy-run`, `publish-run`) are `workflow_dispatch` calls through `src/lib/admin-dispatch.ts`, the only file that reads the OPTIONAL `GITHUB_DISPATCH_TOKEN` (a fine-grained token on this repository with Actions: write; never an eBay credential, never a client prop). Without it a panel shows a link to the workflow page. The eBay run is refused inside the daily import window (21:05 to 23:30 UTC) and while the ledger is latched, and can only lower the run's budget: the script computes `min(budget left, quota - reserve)` itself.
Rejected: a Vercel cron or a page that calls eBay (pages never do), and a stored token in the database. `/admin/ebay` and `/admin/mail` read through adapters in `src/lib/admin-db-footprint.ts` until WP05 and WP14 ship their own readers (REQ-WP21-1, REQ-WP21-2).
Not ported on purpose: Rift's consulting bookings, win-back and premium-offer campaigns and store-partner reports (Rift products with no Magic equivalent).

## The Magic data contract, the premium matrix and the brand spec ship as docs — 2026-10-08

2026-10-08. DECISIONS entries and CLAUDE.md cite numbers and rules whose source was a planning document outside the repository. Three documents are now copies the repository owns: `docs/magic-data-contract.md` (the adopted data rules: finish in every key, market ranks, etched, shared ids, slugs, the floors, the published formats), `docs/premium-gates.md` (the who-sees-what table written from `gateMatrix()`, plus what Premium never gates) and `docs/BRAND.md` (the Arcane Ink brand spec: the three directions compared, contrast table, tokens and the owner's open questions). `docs/RELEASE.md` is the release runbook (weekly cadence, urgent release, rollback, previews off).
The brand spec's open questions are the owner's to settle before a launch: the name collision with the live "MTG Compare UK" site, the domain (mtgcompare.app answered DEPLOYMENT_PAUSED on 2026-10-08), dark versus light default, the Wizards Fan Content wording against a paid tier, "MTG" in the name, social handles and the contact mailbox, and the amethyst's resemblance to Scryfall's purple.

## `.env.example` and the setup prompts are generated from, and checked against, the environment table — 2026-10-08

2026-10-08. OP kept `.env.example` and the setup prompts by hand and they drifted (retired variable names survived for weeks). The table of every variable the code reads is `tests/fixtures/env-names.json` (contract Annex B; `tests/env-names.test.ts` fails when code reads a name that is not a row). `.env.example` now lists every non-platform row, grouped as the table groups them, with where it lives (Vercel Production only, GitHub Actions, or local), commented out unless a local run needs it, and never a real secret. The env table inside `docs/CHROME-SETUP-PROMPT.md` was verified by script against the same file in both directions (every Vercel and GitHub name in the prompt is a row; every secret and variable a workflow names appears in the prompt). Vercel variables are Production-only (previews are off).
Cost: a new variable is a row first; the strict test (`ENV_STRICT=1`) also demands `.env.example` list it.
Evidence: `ENV_STRICT=1 node --import tsx --test tests/env-names.test.ts`.

## Code ships weekly (Tuesday 08:00 UTC); data never waits for a release — 2026-10-08

2026-10-08. RiftCompare and OP Compare release once a day, and RiftCompare measured `[deploy]` on 16 commits in four days. MTG Compare publishes its data (catalogue, prices, offers, history) to a private data repository every day and moves one pointer, so a deployment is only needed for CODE. `production-deploy.yml` therefore lands one `[deploy]` commit a week, Tuesday 08:00 UTC (`RELEASE_CRON` in `src/lib/release-schedule.ts`; `tests/deploy-cadence.test.ts` pins the workflow, the constant, CLAUDE.md and the README together), and "Run workflow" (or `/admin/deploys` with the optional dispatch token) releases at once for a change that cannot wait. A week-old deployment serves today's prices; `/admin/deploys` prints the proof (the data is N hours newer than the newest release). "Push to prod" still means land on `main` and ride the next release; `[deploy]` in a subject is added only when the owner says the release is urgent.
Cost: a code fix waits up to six days unless the owner asks; `NEXT_PUBLIC_*` values are inlined at build time, so changing one needs a release. Alarm: more than two `[deploy]` subjects in a rolling week is red on the console (`releaseBurst`), a deployment older than eight days is amber (`deployLevel`).
Reversal: change `RELEASE_CRON`, the workflow cron and the pinned wording together; the test fails if one is missed.

## Non-Shopify fixtures are payload shapes with Magic rows — 2026-10-08

Decision: no seed store runs Ecwid, BigCommerce, nopCommerce or WooCommerce (67 Shopify, 13 ShadowPOS), so there is no Magic storefront of those platforms to capture. The fixtures of tests/fixtures/stores keep the markup, field names, pager and stock buttons captured from live storefronts on 2026-10-03 and carry Magic listings in them (Counterspell 5503, Scalding Tarn 238610, The One Ring 487805), priced from the TCGCSV snapshot of 2026-10-07 at the site's exchange rates; the ShadowPOS fixture is a real Magic capture (three listings of one page, whitespace collapsed). The readers stay: a store on those platforms can be added by a registry row and a probe.
Consequence: store-platforms.test.ts proves the parsers and that their titles reach the matcher, not that a particular store's titles match. A title that states no finish ("Counterspell [TMP - 57]") is skipped as `finish-unknown`, which is the matcher's rule, and the BigCommerce test pins it.

## Store health reads the published store runs, not an Offer table — 2026-10-08

Decision: `/admin/store-health` and `scripts/store-health.ts` take the offer columns (rows held, rows in stock, the time of the last COMPLETED read) from `ss/runs.json` through `planeJson` (`offerStatsOf` in admin-health.ts); the history of each store's reads (products, matched, misses) still comes from `ImportRun.summary.stores[]` in Neon, as before. With Neon down the page shows the error it always showed; with the data host down it keeps the history and loses the offer columns. A new mild alert, `not-admitted`, says that an unverified store did not pass admission (amber, not red): it is not broken, it is not published yet.
Why: the Offer table is gone from the private schema (public data is files); `ss/runs.json` already carries per pair the counts and the time the aggregate stage needs, so nothing new is published. `STALE_HOURS` is the one constant of constants.ts (store-health.ts re-exports it).
Open: `readPublicationStatus` does not expose `status.json runs[].stores`, so there is no history fallback when Neon is unreachable (REQ-WP04-1 to WP02).

## The store registry: 80 stores and two feeds, every one unverified until a read admits it — 2026-10-08

Decision: `src/lib/stores.ts` holds the registry with the hand-assigned, never-reused ids of `tests/fixtures/store-ids.json`: 8 Card Kingdom and 9 Mana Pool (platform `feed`, off), 10..76 the 67 seed stores of the store brief (all Shopify, in the brief's order), 77..89 the 13 ShadowPOS stores. The rows live in `src/lib/store-registry-seed.ts` (name, origin, market, the one collection handle the 2026-10-07 probe picked); every row is `status: "unverified"`. `mythicstore` and `cgrealm` carry `currency: "CAD"` (the importer refuses a store whose currency differs from its market's, so they are listed and never priced). `chonkycollectibles`, named in the brief's flag list, is not one of the 67 usable stores, so it has no row: nothing was invented.
Fixture: the three ShadowPOS keys `haikugaming.com`, `thecleverkobold.com` and `darksidegames.com` of the contract's fixture were host names, not keys (the probe keyed them by host; OP's registry and `shipping-rates.json` say `haikugaming`, `thecleverkobold`, `darksidegames`, and `tests/stores.test.ts` requires `[a-z0-9]+`). The ids 87..89 are unchanged and were never published, so the keys were corrected in the fixture.
Admission (10.26) is applied by the importer itself, on every read: an unverified store is published only when that read matched at least 20 in-stock listings of tracked units (and, for Shopify, `/meta.json` states the market's currency); otherwise the store result says `not admitted: N matched in-stock listings (needs 20)`, no read is recorded and its previous rows stay. Marking a store `verified` (`scripts/probe-stores.ts` prints the verdict) only skips the check; nothing breaks if nobody does. Cost: the first read of a thin store publishes nothing.
`explicitFoil` is set on no store: the brief measured the finish conventions but not which stores print Foil on every foil product, and a wrong flag prices a foil as the Normal card. The probe prints a candidate per store; the matcher already reads an unmarked variant beside marked ones as non-foil.

## The store stage at Magic scale: stream, budget, stop early — 2026-10-08

Decision: `importStores` (src/lib/store-import.ts) matches every product as its page arrives and never holds a store: the biggest singles collection is 171,272 products (Boutique La Pioche), a full pass about 10,500 pages of 250. Four stores run at once, a request delay (300 ms) apart per store, a store has a page budget (`maxPages`, default 700 = 175,000 products) shared by its collections, and the stage has a 100-minute budget inside the 180-minute job: a store not yet started when it runs out is left alone (its rows age out after 72 hours), a store in flight is a FAILED read (`ok: false`, rows stay).
Collections: sitemap discovery keeps `/magic|mtg/` handles, drops the accessory, foreign-language, graded, token and art-series handles (OP's `SKIP_HANDLE` plus the brief's additions), reads in-stock singles handles first, then the configured one, and skips an all-products handle once an in-stock one with >= 100 products was read. Sealed handles are read last with 8 pages a store (2,000 products): the sealed pages quote them, the crawl does not depend on them.
ShadowPOS reads `game=mtg&orderBy=price-desc&inStockOnly=true` 50 a page (about 1.6 MB) and stops after the first page whose dearest listing is under 0.3 x (track floor x its exit ratio): below that no offer of a tracked unit is plausible. The matcher is asked once per variant (`matchStoreVariants`), the answers of one (product, finish) compete (`offerDraftOf`: best in-stock condition, then cheapest, else the cheapest price as an out-of-stock offer), `collapseOffers` reduces across listings, and `matched` counts LISTINGS with at least one matched variant. The F2c hold (matched under 50% of the last run) stays in scripts/import.ts.
Honest identification: the scrape user agent is `MTGCompare/1.0 (+https://github.com/Specifxx/mtgcompare; price comparison)` and `From` is sent only when `NEXT_PUBLIC_CONTACT_EMAIL` is a real address. Unmeasured: how many stores answer an honest agent from GitHub's IP ranges (Cloudflare); the first production run says, and `scripts/probe-stores.ts` shows it per store.

## Affiliate ids come from NEXT_PUBLIC_* and have no default — 2026-10-08

Decision: `src/lib/affiliate.ts` reads `NEXT_PUBLIC_EBAY_CAMPAIGN_ID` and `NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK` at call time (`ebayCampaignId()`, `tcgplayerImpactLink()`), and nothing else. Unset, every eBay and TCGplayer link renders plain: no `campid`, no `customid`, no Impact wrapper, and `isPaidLink` is false. The attribution prefix is `mc-` (EPN `customid`, Impact `sharedid`).
Why: the OP code read server-only variables and fell back to Rift's account, so every client-built link paid Rift once the owner set MTG's own ids (affiliates-banners-brief 0.2: server HTML right, every recomputation wrong). A default would again book MTG traffic on another site's account silently.
Consequence: a `NEXT_PUBLIC_*` value is inlined at build, so changing an id needs a release. Magic's eBay query builder is `magicEbayQuery` ("MTG" once; only an explicit "mtg" or "magic the gathering" counts as already named, so the set "Magic 2011" still gets the prefix); `onePieceEbayQuery` stays as a deprecated alias until the other owners' components import the new name.

## The card page prices one unit and shows both buy paths together — 2026-10-08

Decision: the card page reads `getCardDetail` and the page lists through `getCardPage` (no `getCatalog`, which refuses in production). `?finish=foil|nonfoil` picks the unit; the default is the headline finish. Offers, history (`getUnitHistory` with the finish), the TCGplayer link (`tcgplayerUrl(id, finish)`) and the eBay query all follow the selected finish; the finish tabs link to `/card/<slug>?finish=...` and the canonical stays the bare URL. A `CardBuyPair` (Buy on TCGplayer, highlighted Buy on eBay) sits under the header at every width, in the QuickView, and in the sticky phone bar, so no card is ever without both. eBay is a search link ("Search eBay" before release, "Buy on eBay" after) and never an offer row.
Why: REQUIREMENTS 4 and contract 8.2 (a price belongs to a (product, finish); highlighted eBay CTA beside every TCGplayer button), and the shim's production refusal.
Also: `/card/[slug]/[number]` resolves a Scryfall set code and number (`resolveBySetNumber`): one match redirects, several are listed, none is a 404; `[slug]` holds the set code because sibling dynamic directories must share a name. The view counter now resolves a slug to the product id and writes CardStat through `ViewBatcher` (sampled 1 in 10, one statement per half hour).

## The binder import names a product or says why not — 2026-10-08

Decision: a CSV line is matched by TCGplayer Product ID, else by set (a code or a name) plus collector number (`nkey`: "029/281" is 29, "231★" is 231, "KHC-29" stays). A number with no set is skipped (a number is shared by hundreds of sets), two ordinary products sharing a set and number are skipped with "add the TCGplayer Product ID", and a language other than English is skipped (every listed product is English). Finish words: Foil, Etched / Foil Etched, Normal / Nonfoil, blank = Normal; Etched looks for the etched twin of the printing and falls back to the Foil of the base card with a warning. The pasted list uses the deck parser and resolver (REQ-WP10-3) and imports only a pinned `#id` or a set and number: a bare name resolves to the CHEAP printing, which is rarely the one owned, and a set without a number to its cheapest printing, so both are reported, not imported. The CSV column names of TCGplayer, Moxfield, Deckbox and ManaBox are UNVERIFIED against a fresh export of each; the header names used are those of their documentation and sample files.
Consequence: an import never silently misvalues a binder; the skipped list carries the reason of every line.

## A binder row is a unit, valued at the market price of its finish — 2026-10-08

Decision: a `CollectionCard` row is a product in one finish (`isFoil` true is the Foil unit of the SAME product, its own price and history). Every write (add, patch, paste import, CSV import) goes through `track.ts normalizeFoil(mask, wanted)`, so the only finish a product has is forced; the owner's unmarked ask is Normal. The row's `setId` is written from the published data at the same time (there is no foreign key, and the per-set views filter on the column). A copy is valued at the TCGplayer MARKET of its finish, converted to the visitor's currency, times the condition multiplier. A unit with no market (a single thin listing, "low only") is UNPRICED in the total, never valued at its asking price: Shivan Dragon's Foil has one $897 listing and no market, and a $203,067.70 low-only Living Artifact would otherwise move a binder total. The value chart and the 7-day chips read one series per unit (`unitKey`), so a Foil copy never borrows the Normal history.
Consequence: the old "followed the card's own finish" rule is gone from collection-server.ts, holdings carry `finish` and `finishLabel`, the share page and the CSV carry the finish, and the replacement-cost route still prices per product (REQ-WP12-4 to WP13).

## The set checklist lists every printing of the set, scoped by treatment — 2026-10-08

Decision: `getSetChecklist(setId, market)` reads the published board (`st/<setId>[-k].json`, up to 6,000 rows) and returns EVERY listed class-0 row of the set, THIN rows included (a THIN page is noindex, not absent), so a tracker can be completed; tokens, art cards and helper cards are other checklists. Cost and stock come from the board's per-market aggregate of the headline unit (TCGplayer counts in the US); eBay is not published, so `otherSource` is always false. Two scopes: "base" is the plain printings (no treatment word: no Borderless, Extended Art, Showcase, Retro, Foil Etched, stamp or language), "all" adds every treated printing. A promo treatment (prerelease, bundle, Buy-a-Box, stamped ...) inside a set that is not a promo set (promo, promo-pack, list, secret-lair) is in neither: it is a different ownership question. Inside a promo set the promo word is that set's plain printing. A printing is owned if ANY row exists for it, whatever the finish and condition.
Consequence: the checklist is read for one set at a time; the `/portfolio/sets` index reads a board only for the sets the account holds cards in (40 at most) and lists the rest as links, because Magic has hundreds of sets (a full index would read hundreds of boards per request).

## Best Basket prices units, not products — 2026-10-08

Date: 2026-10-08

A Magic price belongs to a (product, finish), so a basket line is a unit: `cardId` in `BasketCard`, in `loadStoreListings` and in the plan is `String(productId * 2 + finish)`, the key the `of/<bucket>` offer tuples carry (contract 8.2). A foil and a normal copy of one card are two lines and are priced at their own listings.

Where the client sends product ids (the card picker, the watchlist, a set to finish) the server turns each into its HEADLINE unit with `unitsFor` (Normal first); the binder carries the finish of each holding; a pasted list goes through the one resolver (`resolveDeckLines`, `basketUnits`), so a list is priced exactly as the deck watch re-prices it. `getBasketListings` reads at most 40 units a call, cheapest 60 listings per unit, stores plus TCGplayer's own low in the US, never eBay; the tuple carries the CONDITIONS index and `loadStoreListings` maps it to the label at its door. A bare name on a pasted line is priced at the cheapest printing and the page says so. Best Basket stays Premium only.

The postage snapshot (`shipping-rates.json`) keeps the checkout measurements of the 41 registry stores already probed (38 measured, 3 that post nowhere) and lists the other 41 as "unmeasured" (priced on the market's dearest measured rate, flagged as an estimate) until `shipping-rates.yml` walks the registry; the probe's single-product tell and handle filter are Magic's (set code and collector number, `isMagicSinglesHandle`).

## Deal Finder: the ranking is computed per request and cut once, in the loader — 2026-10-08

Date: 2026-10-08

Deal Finder is a Plus and Premium tool (owner addendum 2026-10-08, section 14). Signed out sees the real count and no row, a free account the top 3 rows of the default ranking, Plus and Premium (and an admin) everything, with the store picker, sort, paging and "only my cards" (the watchlist and, new on this site, the binder, parity P29). "Cheapest on eBay" stays free for everyone.

`getDealList(country, query, who)` in `src/lib/data/deals.ts` reads `who` through `accessOf`, ranks the units from the published browse columns (`ix/k`, `ix/p`, `ix/s`; `ix/f` only for a store picker) under the tier-neutral key `deal-rank-v1` (data commit, market, sort, store set; never a tier), filters "only my cards" before paging, and cuts with `sliceRanking`. Below full access every refinement is coerced to the default view before the ranking is read and `coerced` is set: `/api/deal-finder` answers 402, a shared link still opens. The page asks `rowLimit` first, so a signed-out request does not even query the ranking. Nothing paid is a file: the published count (`hm/home.json` `dealCounts`) is a number, not a row.

The buy side of the TCGplayer comparison is stores only. eBay rows are Neon rows (`EbayBest`, display-only), read through a five-minute process memo; the two eBay views rank from them against the index's cheapest store price and are never part of `deal-rank-v1`. A pure `cutDealList` and `rankFromIndex` hold the logic so the tests run it on real products without a Next cache.

## Alerts, mail and newsletter ported: cadence copy follows schedule.ts, finish is in the alert key — 2026-10-08

2026-10-08. The alert, digest and newsletter logic is game-agnostic and was ported with brand copy only. Three points are not obvious.

- Alert, watchlist and sealed-watch rows hold plain product ids plus a finish (0 Normal, 1 Foil); card names are resolved at send time through the data loaders (`getCardsByIds`, `readLiveOffers`), never through Prisma relations.
- Copy that mentions how often prices are checked reads the constants of `src/lib/schedule.ts` (one daily import), so it cannot drift from the real cadence.
- Mail is script-side only and stays off until both mail secrets exist. The release-day blast and the support/contact confirmations are gated on `isEmailEnabled()`; no page imports a sender.
- The personal address that appeared in a masking example in `alert-mute.ts` is replaced by `someone@example.com`; `ics.ts` carries Magic release copy only.

## Integration pass: copy follows the one-publish-a-day clock, and four pinned lists were repointed — 2026-10-09

2026-10-09. The first integration run of the port found the tests red for reasons that were stale pins or leftover copy, not behaviour. Decided: (1) page copy that quotes a price cadence says "once a day" (the import publishes once a day, `src/lib/schedule.ts`); "twice a day" was OP Compare's figure and `tests/site-claims.test.ts` rejects it. (2) The methodology page states the eBay plan as `src/lib/ebay-plan.ts` has it (four runs a day, singles from US$10, tier A from US$50 daily, the rest every three days), as `tests/ebay-plan.test.ts` pins. (3) `/preorders`, linked from the nav and listed in the sitemap, is a permanent redirect to `/release-dates` until a pre-order price page exists; a nav link must never 404. (4) Repointed, not loosened: the mail-key allow-list now names `release-day-email.yml` (it sends); `ClickEvent` may be read by any uncached `src/lib/admin*.ts`; `/cards/all` lists card names (oracle pages), so it has no `/card/` link to open in a QuickView; the colour hubs reach `CardQuickLink` through `CardLinkGrid`. (5) The mail workflows no longer fall back to `DATA_REPO_TOKEN`: a reader holds `PLANE_TOKEN` (read-only) and only the writers hold the write token. The env table gained the release-day and `EMAIL_STATUS` rows and the read-only checkout names in `ebay-prices.yml`.
Cost: the mail workflows need a `PLANE_TOKEN` Actions secret before they can read published data.
Reversal: a pre-order page replaces the redirect; the token fallback is a one-line change plus `tests/plane-workflows.test.ts`.

## The plane moves into Neon: published data is a table, GitHub is the opt-in backend — 2026-10-09

Date: 2026-10-09

Owner decision, 2026-10-09. The first full import reached the publish step (catalogue 99,076 rows, 28,517 units) and failed at the final `git push`: the Actions secret `DATA_REPO_TOKEN` is empty, and a fine-grained token for the private data repository could not be made available at launch. The site was built and had no data. The owner chose to put the published data in Neon instead, with an automated workaround that needs no new secret and no owner action: `DATABASE_URL` already exists in Actions and in Vercel Production.

What changed, and what did not. The plane CONTRACT is untouched: files under `v1/`, JSON of at most 1,000,000 bytes, the validator before anything is visible, the write-once rules, `manifest.json`, the pointer written last, a sha-addressed tree, the loader API of `src/lib/data`. Only the transport changed. The default backend is `neon` (`src/lib/data/plane/backend.ts`); `PLANE_BACKEND=github` selects the private repository again, and a `PLANE_REMOTE` named by hand (the drills) can only mean git.

- **Storage.** One raw-SQL table, `"PlaneFile"(path text primary key, sha text, body bytea /* gzip */, "updatedAt")`, created by the publisher with `CREATE TABLE IF NOT EXISTS` (`plane/neon-store.ts`). It is deliberately NOT a model of `prisma/schema.prisma`: a model would put a migration step into CI and the build. Rows: `v1/<rel>` (the data files), `latest.json` (the pointer), `status.json`, `state/*` (the write-once state backup and the history deltas, 400 days), and `stage/*` while a publish is in flight. Only the CURRENT tree is stored (about 7,600 files, 23 MB of gzip measured on the bootstrap tree); history day files are plane files like any other.
- **Publish.** `publisher-neon.ts` runs the same protocol as the git publisher with the same shared code (`publish-common.ts`): pull the current tree into the scratch directory, build, validate (phase-aware, fail closed), then upload ONLY the files whose sha changed under `stage/<path>` in batches of 150 rows or 6 MB (one transaction each), read the staged shas back, and flip in ONE transaction: delete the superseded and removed rows, rename the staged rows into place, write `status.json` and `latest.json` LAST. A reader therefore sees the previous tree or the new one, never half of one; a crash or a failed batch anywhere before the flip leaves the old tree serving and `stage/` rows that the next publish clears. A refusal writes the status row only. Unchanged files are never rewritten. The ref of a publish is a 40-hex digest of the manifest and the sequence; `pointer.repo` is `neon/plane`. Bulk writes use the direct URL (`directDatabaseUrl()` in `src/lib/db.ts`: the same `-pooler` rewrite as `maintenance.yml`), the reader the shared pooled client.
- **Read.** `plane/neon-reader.ts` implements the same `PlaneSource`. NO `unstable_cache` and no Data Cache on this path (CLAUDE.md): the egress and latency controls are in the instance. The pointer row is re-read at most every `PLANE_POINTER_TTL_S` (60) seconds, single-flight, and the last good pointer keeps serving when Neon errors; `v1/manifest.json` is read once per pointer and tells a read which cached copy is current BEFORE any query, so an unchanged file survives a publish in the LRU (keyed by path and sha, `PLANE_LRU_MB`, 120 by default) and a path the manifest does not list is `missing` with no query; concurrent reads of one path share one query, at most 8 in flight; the browse index and every derived shape are built once per instance per pointer (`memoByRef`, unchanged). A build reads nothing (`PlaneError("build")`, and Prisma is imported lazily so a build, a `PLANE_DIR` run and a GitHub-backend run never load it). With Neon down a page renders as far as the LRU holds it and then fails the way an unreachable data host did.
- **Rules reversed.** CLAUDE.md said public data is not in Neon and that a public page's server render never reads Neon. Now: the PUBLISHED PLANE is in Neon and is read from the server render, through `src/lib/data/plane/**` and nowhere else. The SQL is confined to `neon-store.ts` (`tests/plane-neon-path.test.ts`, `tests/history-egress.test.ts`), which imports the client lazily; nothing under `src/app` imports `@/lib/db` (`tests/app-no-db-import.test.ts`, unchanged); the Neon-backed PRIVATE loaders (eBay panels, decks, reviews, the promo) still never run in a public render (`tests/public-no-neon.test.ts`, unchanged); private, paid and eBay data are still never in the plane (the validator and `tests/plane-no-premium.test.ts`, unchanged).
- **Jobs.** `scripts/plane-pull.ts` materialises the current tree into `.data` (`v1/`, `latest.json`, `status.json`); `scripts/plane-checkout.sh` calls it unless `PLANE_BACKEND=github`, so every `Check out the pointed tree into .data` step keeps its shape. The watchdog runs the same alarm rules over the rows (no host probes, no token, table size instead of repository size); `audit-publication --remote` audits the rows and the table against Neon Free's 512 MB; `data-squash` is a green no-op (there is no history to squash); `data-rollback` refuses with an explanation (there is no older tree; fix the cause and re-run the import with `IMPORT_FORCE=1`; the validator already refuses a bad tree before it is visible). The egress audit knows `PlaneFile` (budgets `plane-read`, `plane-write`); `db-audit` subtracts it from the private footprint.
- **Variables.** `PLANE_BACKEND` and `PLANE_POINTER_TTL_S` are new; `PLANE_REPO`, `PLANE_BRANCH`, `PLANE_TOKEN`, `DATA_REPO_TOKEN` and `PLANE_ALLOW_PUBLIC` are optional and read only with `PLANE_BACKEND=github`. `ci-build.yml` sets no `PLANE_*` at all; its closed `DATABASE_URL` is now the only origin there is, so a green build still proves the build needs neither.

Cost, stated plainly. (1) Neon Free allows 100 CU-hours a month and the plane read now wakes the database from public traffic, which DP-03 had refused; the controls are the 60-second pointer memo, the sha-keyed LRU (a warm instance asks Neon for almost nothing), the CDN headers of the pages, and `PLANE_POINTER_TTL_S`, which can be raised to let the compute suspend between visits. If the compute-hours run short, raise it first. (2) Storage: about 25 MB of the project's 512 MB, plus 17 MB a year of history deltas; `/admin/data` and the audits alarm at 400 MB. (3) There is no per-commit history and no rollback; a bad publish is prevented (validator), not undone. (4) The Data Cache no longer holds the plane, so a cold instance pays its first reads in Neon queries (about 60 files for the hot set, warmed by `POST /api/data-warm`).

Reversal. Set `PLANE_BACKEND=github` in Vercel (Production) AND in Actions, create the private repository, the two tokens and `PLANE_REPO` as `docs/SETUP.md` section 2 describes, and run Import prices; the first publish builds into an empty branch, and every slug, ordinal and set token is kept by `data/slug-seed.json` (regenerate it first with the `slug-seed` maintenance task, which reads the Neon plane). Nothing else changes: no code, no test, no loader. The `PlaneFile` table can then be dropped.

Unverified until the first run with real services: the real Neon pooler and direct endpoint behaviour with Prisma raw bytea writes, the wall time of the first full publish from an Actions runner, and Vercel's behaviour under the new read path. Locally the whole path runs against PostgreSQL 16 (`tests/plane-neon-backend.test.ts`: publish, sha round trip, atomicity under a simulated crash mid-upload and before the flip, unchanged files not rewritten, stale-while-error, the real loaders).

## Back to GitHub for the plane; 324 new stores; the reader respects Shopify's window — 2026-10-09

2026-10-09. Three owner decisions on launch day, recorded together because they ship together.

- **The plane is back on GitHub.** Neon held the published tree for one day. Each cold Vercel instance pulled about 40 MB of plane files from Neon, so the free 5 GB transfer allowance would last roughly 125 cold starts, and every daily publish wrote about 23 MB more. The owner created the data repository and the two tokens; `PLANE_BACKEND=github` is set in Vercel and in Actions, the import published both phases to the data branch, and production reads `raw` with the 30-day Data Cache. `PlaneFile` stays declared in `prisma/schema.prisma` so a schema push never drops it; its rows are now unused and can be truncated. The Neon backend remains the code default for a fresh setup.
- **The Shopify reader.** `products.json` serves at most 25,000 products of one collection (page 101 at 250 answers HTTP 400 "Page * Limit exceeds the 25000 limit"). 21 registered stores failed on that alone, 12 more on a first 429 with no backoff. The reader now treats the window as the end of the collection (not a failed read), honours Retry-After with bounded backoff, retries transient 5xx, and stops per-set sub-collections after one page when a whole-singles collection was read. 18 registry rows that pointed at one set or a promo list now point at the store's whole singles collection.
- **324 new stores** (ids 90 to 414; 246 was assigned and withdrawn before any publish and is retired). Found by web searches and directories in each market and the sister sites' registries; each admitted by a batch probe of 2 pages with the real reader and matcher against the published catalogue (at least 20 matched in-stock listings of tracked units, the market's currency): US 149, CA 115, AU 34, UK 15, SG 7, EU 4. Stores on platforms without a reader (TCGplayer Pro, Crystal Commerce and others, 54 found) are left for a future adapter. Every new store is "unverified" and still has to pass admission on the production read; its postage is "unmeasured" until the shipping probe runs. To read about 400 stores inside the job, `STORE_CONCURRENCY` is 12 (each store is still read one request at a time with its own pacing) and `STAGE_BUDGET_MS` is 140 minutes; offers beyond `OFFER_ROWS_BUDGET` are pruned by unit value as before, so the published files keep their budgets.
- **Launch fixes** (the Reddit research found them): TCGplayer banners land on TCGplayer's Magic search; a card name opens its ordinary printing (main set kind, no treatment, not serialized, cheapest MARKET), `/browse` searches default to Best match, and the importer writes the same pick into `nm/`; a Stripe test key keeps checkout closed (buttons disabled, "Checkout opens soon", the route admits admins only); Box EV opens on the newest released set; leftover sister-site copy is gone.

Reversal: `PLANE_BACKEND=neon` (and a redeploy) returns the plane to Neon; `STORE_CONCURRENCY` and `STAGE_BUDGET_MS` are constants in `src/lib/store-import.ts`; a store leaves the registry by moving its id to `RETIRED_STORE_IDS`.

## eBay spends from the first run: observe-only is opt-in — 2026-10-10

2026-10-10. The owner asked for the eBay prices to run at 1,000 calls a day. `DEFAULT_EBAY_CONFIG.observeOnly` is now `false`, so the pass spends as soon as the keyset secrets exist, without a variable to flip; `EBAY_OBSERVE_ONLY=1` still turns it back into quota reads only. Nothing else in the arithmetic moved: the daily budget is 1,000 (`EBAY_DAILY_CALL_BUDGET`), the three banner-only runs plan at most 70 calls each and the 23:37 main run takes the rest of the day's allowance, and every run is still `min(ledger allowance, live remaining - Rift's reserve, run share, EBAY_MAX_CALLS)` (Rift first, fail closed). Found while checking: every scheduled run since launch skipped at the gate because the Actions secrets `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` are empty; `docs/CHROME-EBAY-PROMPT.md` sets them (shared mode: Rift's Production keyset) and the variables.

Reversal: set `EBAY_OBSERVE_ONLY=1` (quota reads only) or `EBAY_API_ENABLED=0` (no call at all).

## The eBay panel and chase routes exist; eBay is "live" only after a real search; crons and releases name what started them — 2026-10-10

2026-10-10. The owner asked whether every eBay price was live. An audit (code and the live site) found that none could be:

- **The two routes the islands fetch never existed.** `EbayCardPanel` (every card page, the Listings tab of every sealed page) fetches `/api/ebay/panel/<productId>` and `EbayChaseStrip` (home, the region homes, hubs, set pages, browse, articles) fetches `/api/ebay/chase`; both answered 404 on the live site, so both islands showed plain search links whatever Neon held. No commit ever had them. They now exist: force-dynamic GETs that read through the self-caching `getEbayPanel` / `getChaseBanner` (six hours, tag `ebay-banner`), one market-independent JSON per product (the island picks the visitor's market), `public, s-maxage=600, stale-while-revalidate=3600`. The panel route asks Neon only for a product the pass can have searched, a tracked single (`cls 0`, `tracked != 0`) or a published sealed product, checked with two pinned plane reads, so an unknown or untracked id never wakes the database; it answers `[]` with a one-hour CDN entry instead. `EbayBest` stays server-side. `tests/ebay-routes.test.ts` pins both routes and now checks every `/api/...` path a page or component names against the route files.
- **`ebayLive` waited for any ok run; now it waits for a search.** Observe-only, reserve, budget and quiet-check stops all finish `ok` with nothing searched, so the copy that says we collect eBay prices (home title, FAQ, methodology, Deal Finder) would have switched on with zero rows. It now needs an ok `ImportRun` of kind `ebay` within three days whose summary has `completed > 0` (`completedSearches`, `src/lib/data/site.ts`).
- **The run's purpose comes from its cron line.** `scripts/ebay.ts` never passed a schedule, so the clock decided: GitHub started the crons three to seven hours late (the 23:37 main pass ran at 03:02 on 10-09 and became a banner run; a 16:37 run past 22:00 would become a main one), and a daytime dispatch was a 70-call banner run. `ebay-prices.yml` now sets `EBAY_SCHEDULE` from `github.event.schedule` and the existing `purposeOfSchedule` decides: `37 23 * * *` is main, the other crons banner-only, a dispatch main. A local run without the variable keeps the clock rule.
- **The purge URL falls back to the site.** `REVALIDATE_URL` was never set in Actions, so no run purged `ebay-banner` and new rows waited up to six hours; the eBay job now uses `vars.REVALIDATE_URL || vars.SITE_URL`.
- **The weekly release never ran.** `production-deploy.yml` checked out and pushed `main`, a branch this repository has never had (the production branch is the default branch), so every Tuesday run would have failed at checkout. It now uses `github.ref_name`: the default branch on a schedule.
- **Copy.** The methodology page and Deal Finder promised daily US$100+ and every-other-day US$20+ refreshes in every market; the plan searches the top few hundred US cards daily, the next several hundred every three days, a short chase list in the UK, Australia and the EU, and sealed products as the budget allows. "Underpriced vs TCGplayer" never includes eBay (`isEbay: false`), and its description and FAQ no longer say it does.

Not changed, and open: coverage is a subset by design (tier C and names under US$10 get no calls, Singapore none), tier B and sealed refresh every 72 h while the panel hides rows older than 48 h, and the sealed class is costed for one market but searched in five. `EBAY_OBSERVE_ONLY=1` is still a repository variable; until the owner removes it every run makes zero Browse calls.

Reversal: delete the two route directories (the islands fall back to search links); `return Boolean(run)` in `loadEbayLive`; drop `EBAY_SCHEDULE` from `ebay-prices.yml`; `ref: main` in `production-deploy.yml` once a `main` branch is the default.
