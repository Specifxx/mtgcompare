# OP Compare — [opcompare.app](https://opcompare.app)

**One Piece Card Game prices, compared across stores in six markets** — the
United States, Australia, the United Kingdom, Singapore, Canada and the
eurozone. Every card, every Parallel / Manga / SP / Treasure Rare / promo
printing and every sealed product, priced twice a day.

OP Compare is the One Piece sister site of [RiftCompare](https://riftcompare.com):
the same layout, navigation, market switcher, price-comparison board and data
rules, rebuilt for One Piece with its own theme (night-sea navy, Straw Hat red,
straw gold), its own straw-hat logo, its own database and its own store list.

> Independent fan-made site. Not affiliated with Bandai, Eiichiro Oda,
> Shueisha or Toei Animation.

## What's on the site

| Page | What |
|---|---|
| `/` | Hero search, trending cards, market switch, today's top deals, newest set's chase cards, booster boxes, colours, FAQ. Share image: the price guide (see below) |
| `/browse` | The card database: search, filters (price, set, colour, rarity, type, printing), sorts, pagination |
| `/card/[slug]` | One printing: every store's price (and the cheapest matching eBay listing) in your market cheapest first, eBay search, TCGplayer reference, price history, card text and details, other printings, "Report a wrong price". Share image: art, printing and rarity, price per market |
| `/sets`, `/sets/[slug]` | Every set by type, each with its card list, stats and sealed products. Share image: the set's five most valuable cards |
| `/sealed`, `/sealed/[slug]` | Booster boxes, cases, packs, starter decks, double packs, collections — filters, per-pack prices, price board. Share image: the product and its price |
| `/price-guide` | Every printing in one sortable table, prices by set. Share image: the price guide |
| `/movers` | This week's risers, fallers and best value vs 90-day high |
| `/market` | The OP Compare Index (chained, value-weighted) and value by set |
| `/leaders`, `/colors`, `/cards`, `/cards/all` | Leaders by colour, colour hubs, type/rarity/printing hub, A–Z index |
| `/tools`, `/tools/deal-finder` | The tools hub; listings under market price (signed out: a preview; free account: top 3; Plus/Premium: every deal) |
| `/tools/best-basket` | Price a deck or your watchlist delivered, split across stores with measured postage. Free account: the delivered total (5 a day); **Premium:** the store-by-store plan, condition floor, best 1- and 2-store orders. `/tools/buy-list` redirects here |
| `/tools/box-ev`, `/tools/rising`, `/tools/demand`, `/trade`, `/tools/selling-fees` | Box EV calculator (community pull-rate estimates; `/tools/box-value` redirects), Rising Cards, Demand Finder, trade calculator, fee calculator |
| `/deck`, `/decks` | The deck pricer (the bulk pricer; `/bulk-pricer` redirects) and the public deck library |
| `/premium`, `/login`, `/account` | Plus ($2.99/mo · $23.99/yr) and Premium ($4.99/mo · $39.99/yr) via Stripe; Google / Discord sign-in; manage or cancel in Stripe's portal |
| `/stores`, `/stores/suggest` | Every store we read, per market, with today's matched listings; suggest a store |
| `/blog`, `/blog/[slug]` | Data-driven posts (most expensive cards, booster box prices, rarities explained, where to buy, cheaper abroad, budget Leaders, set reviews) — Article schema, RSS at `/feed.xml`. Share image: the title beside three hero cards |
| `/release-dates`, `/authors`, `/editorial-policy` | |
| `/watchlist` | Hearted cards and products (saved in the browser) |
| `/portfolio`, `/portfolio/sets`, `/portfolio/sets/[set]` | **My binder** (free to 50 cards, unlimited with Plus/Premium): what the cards you own are worth in your market with a daily value chart, the replacement cost, CSV import/export (TCGplayer Product ID or card number + printing), and the set checklist with the cost to finish a set. `/c/[token]` is the read-only share link (noindex; cost and notes never shown) |
| `/alerts` | How watchlists and price alerts work (static; honest about whether email is on) |
| `/alerts/action`, `/alerts/manage`, `/alerts/release`, `/unsubscribe`, `/newsletter/unsubscribe` | The pages the links in alert, release and newsletter emails open: a confirm card first, only the button's POST acts, all noindex |
| `/about`, `/methodology`, `/contact`, `/feedback`, `/privacy`, `/terms` | `/contact` and `/feedback` are forms that land in the admin inbox (no email is sent) |
| `/admin` | **Admins only** (404 for everyone else): see [Admin](#admin) |

### Share images (link thumbnails)

Links to OP Compare unfurl as the price guide, drawn from real data
(`src/lib/og/`, 1200×630 PNGs with the site's own fonts). `/` and every page
without its own image show "ONE PIECE PRICE GUIDE" with five real top cards:
art, printing, the cheapest US price, TCGplayer market, number, and store count
(7-day change once a week of moves exists). `/price-guide`, sets, sealed
products, cards and blog posts get their own. A data error never breaks a
share: it draws a data-free fallback card. Rebuilt every 6 h.

## Admin

Sign in with an admin account and the account menu shows **Admin**. An admin is
`mastermisclick@gmail.com` (built in), or the addresses in `ADMIN_EMAILS` if
that is set (it replaces the built-in one), or a user with `User.isAdmin`.
Admins count as Premium. Everyone else gets a 404 at `/admin`.

| Page | What |
|---|---|
| `/admin` | Counts: accounts, current members, new inbox items, stores whose newest read failed |
| `/admin/accounts` | Search and filter accounts, daily sign-ups, CSV export; grant or revoke Plus/Premium by email (audited; a live Stripe subscription re-grants itself) and run the Stripe reconcile now |
| `/admin/subscriptions` | OP Compare's Stripe subscriptions (`site=opcompare` only): MRR, tiers, trials and churn, and how many accounts are entitled in the database |
| `/admin/store-health` | Per-store alerts from `ImportRun` results: failing, stale, empty reads, dropped listings or match rate, implausible prices, currency skips (also printed as a step in each *Import prices* run) |
| `/admin/inbox` | Price reports, store suggestions, feedback and contact messages, with status changes. No IP addresses stored, no email sent |

Scripts: `npm run health:stores` (the store-health report) and
`npm run audit:inbox` (inbox counts, emails masked). An optional `ADMIN_TOKEN`
lets scripts call `/api/admin/*` with an `Authorization: Bearer` header.

## Where the prices come from — and the eBay rule

| Source | What | Markets |
|---|---|---|
| **TCGplayer** via [TCGCSV](https://tcgcsv.com) (category 68) | The whole catalogue (87 groups, ~7,300 printings, ~420 sealed), card text and stats; the cheapest listing (a US offer) and the market price (a reference everywhere, "≈" outside the US) | US + reference |
| **Stores** (`src/lib/stores.ts`) | Shopify stores' One Piece collections, read with Shopify Markets pricing for their own country; ShadowPOS, Ecwid and BigCommerce stores through their own readers (`src/lib/store-import.ts`); every listing matched to one exact printing (`src/lib/match.ts`) | US AU UK SG CA EU |
| **eBay** | **Listing prices** from OP Compare's *own* eBay application (Browse API, its own 5,000 calls a day), searched twice a day by `scripts/ebay.ts` (`ebay-prices.yml`): singles of US$100+ daily, US$20+ (US$50+ in the EU) and sealed of US$30+ every two days; the cheapest matching Buy It Now listing, ranked among the stores by item price, never re-ranked. Off until the GitHub secrets exist. Plus EPN-tagged *search links* on your own eBay everywhere. API hosts and credentials live only in `src/lib/ebay*.ts` (`tests/no-ebay-api.test.ts`). | US UK AU EU (Spain); CA sealed + US-derived singles; SG links only |

Matching follows RiftCompare's rule: *understated, never wrong*. A listing is
matched only when exactly one printing fits its card number (or TCGplayer's exact
name + set), its card name and its printing words; graded slabs, playsets, lots,
live breaks and non-English listings are never matched, and a match far from the
printing's market price is dropped as a probable mismatch.

## Price history is in GitHub

Postgres holds only today's prices. Every import writes the history as JSON
(`src/lib/history.ts`): one file per day, each product's last two years in 256
bucket files, and the index. The workflow commits them to the **`data`
branch**, and pages read them from GitHub pinned to that commit. It's open
data: [`data/history`](https://github.com/Specifxx/OpCompare/tree/data/history).

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind (RiftCompare's themeable token
system, recoloured) · Prisma + Postgres (Neon) · Vercel · GitHub Actions.

## Going live

- **`docs/CHROME-SETUP-PROMPT.md`** — one prompt for Claude in Chrome that does
  the whole setup: Neon database, GitHub branch/permissions/secrets/variables,
  Vercel project, domain and env vars, Google and Discord sign-in, Stripe,
  first import and deploy, GA4, Search Console, Bing and the search workflows.
- **`docs/SETUP.md`** — the same steps written out, with every Vercel and GitHub
  variable, which ones reuse RiftCompare's values, and the free-tier limits.

## Deploys are gated (ported from RiftCompare)

`vercel.json`'s `ignoreCommand` (`scripts/vercel-ignore-build.sh`) skips any
production build whose commit **subject** lacks `[deploy]`;
`.github/workflows/production-deploy.yml` lands one such commit on `main` every
day at 08:00 UTC, after the morning import. Previews always build. RiftCompare
adopted this after per-push builds exhausted its Neon transfer allowance; OP
Compare starts with it.

## Egress rules

Pages never query the database directly: they read the self-cached loaders in
`src/lib/data.ts` (`unstable_cache`, tag `prices`, 6 h TTL, purged by the import).
The catalogue is two compact cache entries (~0.6 MB each, under the 2 MB item
limit). See the header of `src/lib/db.ts`; `tests/nested-cache.test.ts` pins it.

## Local development

```bash
npm install
cp .env.example .env                 # point DATABASE_URL at a local Postgres
npx prisma db push
npm run import:catalog               # catalogue + TCGplayer, ~30 s
IMPORT_ONLY_STORES=cherry,danireon npm run import   # a few stores
npm run dev
```

| Command | |
|---|---|
| `npm run import` | Full import (catalogue, every store, aggregates, history, index) |
| `IMPORT_ONLY_COUNTRY=UK npm run import` | One market's stores |
| `npm run typecheck` / `npm run lint` / `npm test` | Checks (CI runs all three) |
| `npm run icons` | Regenerate the favicon set from the logo geometry |

## Adding a store

Add an entry to `src/lib/stores.ts` (`key`, `name`, `base`, `country`, the One
Piece collection handles, and `currency` only if it charges something other than
its market's currency). The importer also re-discovers One Piece collections
from the store's sitemap each run. Its singles must carry card numbers (or
TCGplayer-style names) in their titles. A store on another platform sets
`platform` (`shadowpos`, `ecwid`, `bigcommerce`, `nopcommerce`, `woocommerce`;
see each reader's header for what `collections` means there). Check a candidate
first with `npx tsx scripts/probe-stores.ts [--platform=…] <base> <market>`: it
runs the real reader and matcher and prints what the import would keep.

## Not ported (yet) from RiftCompare

Trial reminders and inbox replies (and so RiftCompare's $1 trial), the deck
builder, games, AdSense, social/ads marketing, the
mobile app, support tickets, the admin tools that need data OP Compare doesn't
collect (demand, rising snapshots, tier floor, decks, loyalty,
consulting, store partners) and admin `?key=` links,
and Cardmarket as an EU source (its public files carry no card numbers, and One
Piece's many same-name printings make name-only matching unsafe — and the data
permission RiftCompare holds was granted for Riftbound). Plus and Premium need an account.

## Email (built, off until configured)

Price alerts, release alerts, the welcome email and the weekly newsletter are
built and send **nothing** until both `RESEND_API_KEY` and `EMAIL_FROM` exist
as GitHub Actions secrets (OP Compare's own Resend account, never
RiftCompare's, never on Vercel). Every send runs script-side in Actions:
`scripts/alerts.ts` after each import (`import-prices.yml`),
`scripts/email-hourly.ts` hourly (`email.yml`) and `scripts/newsletter.ts` on
Fridays 21:00 UTC (`email-weekly.yml`). Until then the alert run still works:
it advances baselines and delivers each trigger **in-app** (a notification on
the dashboard and a chip on the watchlist), and no page promises an email or
shows an email field. Each run records Meta `email` = on/off, which is what
the site reads. A key that is set but refused fails the run red.
`tests/no-email-api.test.ts` pins where the provider hosts and key names may
appear and that no page or route can call a send function. Setup: `docs/SETUP.md` section 6b.
