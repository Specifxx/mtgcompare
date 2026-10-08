# MTG Compare

**Magic: The Gathering prices, compared across stores in six markets** — the United States, Australia, the United Kingdom, Singapore, Canada and the eurozone. Every printing (Normal and Foil are separate prices), every Commander and every sealed product, priced daily.

MTG Compare is the Magic sister site of [RiftCompare](https://riftcompare.com) and OP Compare: the same layout, market switcher, price-comparison board and data rules, rebuilt for Magic with its own brand ("Arcane Ink": amethyst and brass, see `docs/BRAND.md`), its own data model, its own database and its own store list.

> Independent fan-made site. Not affiliated with, endorsed or sponsored by Wizards of the Coast. Magic: The Gathering and its card names, art and symbols are property of Wizards of the Coast. Card data and images come from [Scryfall](https://scryfall.com); prices come from TCGplayer (via TCGCSV) and the stores listed on `/stores`.

## What's on the site

| Page | What |
|---|---|
| `/` | Hero search, trending cards, market switch, today's top deals, chase cards, booster boxes, FAQ. Share image: the MTG price guide |
| `/browse`, `/singles`, `/gallery` | The card database: search (Scryfall-style set and number lookup), filters, sorts, pagination |
| `/card/[slug]`, `/card/[slug]/[number]` | One printing: every store's price per finish in your market, cheapest first; eBay listings in their own block; TCGplayer reference; price history; oracle text and legalities; other printings. `/card/<set>/<number>` resolves a Scryfall set code and collector number |
| `/sets`, `/sets/[slug]` | Every set by type, with its card list and sealed products |
| `/sealed`, `/sealed/[slug]` | Booster boxes, bundles, decks, Commander products and more |
| `/price-guide`, `/movers`, `/market` | The sortable guide, weekly risers and fallers, the MTG Compare Index |
| `/commanders`, `/colors`, `/keywords`, `/cards` | Commander hubs, colour identity hubs, keyword hubs, treatment / rarity / type hubs |
| `/deck`, `/decks` | The deck pricer (MTGO, Arena and plain-text lists) and the public deck library |
| `/tools` | Deal Finder (Plus and Premium), Rising Cards and Demand Finder (Premium), Best Basket, Box EV, trade and fee calculators. See `docs/premium-gates.md` |
| `/premium`, `/login`, `/account` | Plus and Premium via Stripe (test mode until the owner decides otherwise); Google / Discord sign-in |
| `/watchlist`, `/portfolio/**`, `/alerts/**` | Watchlist, binder and set checklist, price and release alerts |
| `/stores`, `/blog`, `/guides`, `/release-dates`, `/about`, `/methodology`, `/contact`, `/privacy`, `/terms` | Reference and editorial pages |
| `/admin` | **Admins only** (404 for everyone else): see [Admin](#admin) |

## Where the data comes from

| Source | What |
|---|---|
| **Scryfall** (bulk files) | What a card IS: names, oracle text, colours, legalities, images. Never prices, never `purchase_uris`. Hotlinked images, unmodified |
| **TCGplayer** via [TCGCSV](https://tcgcsv.com) (category 1) | The catalogue of products and the prices: low and market per product and finish |
| **Stores** (`src/lib/stores.ts`) | Shopify, ShadowPOS, Ecwid, BigCommerce and other stores, matched to one exact (product, finish) or not at all (`src/lib/match.ts`) |
| **eBay** | Listing prices from the Browse API, fetched script-side from GitHub Actions only, stored in Neon only, shown in their own labelled block, never ranked with the stores. Off until the secrets exist |

## Architecture in five lines

1. **Public data is files.** The daily import (`import-prices.yml`) publishes the catalogue, prices, offers and history as sharded JSON to a private GitHub repository (`Specifxx/mtgcompare-data`, branch `data`) and moves one pointer. Pages read the files through `src/lib/data/**`; no page needs Neon.
2. **Neon holds private state** (accounts, billing, alerts, collection, inbox, click events, the eBay ledger and eBay data), well under 100 MB.
3. **Code ships weekly.** Production builds only for a commit whose subject carries `[deploy]`; `production-deploy.yml` lands one every Tuesday at 08:00 UTC. Data never waits for it. Preview builds are off. See `docs/RELEASE.md`.
4. **Nothing paid is a file.** Deal Finder, Rising Cards and Demand Finder are computed per request behind an opaque entitlement and cut once in the loader.
5. **A build reads nothing.** No database, no data host, no data-backed prerender.

## Admin

Sign in with an admin account and the account menu shows **Admin**. An admin is `mastermisclick@gmail.com` (built in), or the addresses in `ADMIN_EMAILS` if that is set (it replaces the built-in one), or a user with `User.isAdmin`. Admins count as Premium. Everyone else gets a 404 at `/admin`.

| Page | What |
|---|---|
| `/admin` | Traffic lights (data, eBay, database, deploy age), counts and the tool groups |
| `/admin/data` | What the site serves: pointer, file counts, repository size, failsafes, alarms, from `status.json` (works when Neon is down); re-run the publish |
| `/admin/ebay` | The eBay ledger: calls spent today and per window, quota, mode, 429 latch, tiers, banner age; a manual run that can only lower the budget |
| `/admin/deploys` | Next and last releases, `[deploy]` counts, how much newer the data is than the code; an urgent release with a reason |
| `/admin/database` | Neon size against the 100 MB target, the ten largest tables, the click log |
| `/admin/accounts`, `/admin/subscriptions`, `/admin/premium` | Accounts and grant / revoke (audited), MRR and churn from Stripe (`site=mtgcompare` only), Plus and Premium interest |
| `/admin/clicks`, `/admin/loyalty`, `/admin/lookup`, `/admin/mail` | Outbound clicks by retailer and country, the most active members, one account by e-mail, newsletter and alert status |
| `/admin/inbox`, `/admin/support`, `/admin/store-health` | Price reports, store suggestions, feedback, tickets; scrapers that broke quietly |
| `/admin/demand`, `/admin/rising`, `/admin/decks` | Previews of the paid tools; publish a deck |

The **Run** buttons dispatch a GitHub Actions workflow and need the optional `GITHUB_DISPATCH_TOKEN` (a fine-grained token on this repository with Actions: write); without it each panel links to the workflow page. Scripts: `npm run health:stores`, `npm run audit:inbox`. An optional `ADMIN_TOKEN` lets scripts call `/api/admin/*` with an `Authorization: Bearer` header.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Prisma + Postgres (Neon, private tables only) · Vercel · GitHub Actions.

## Going live

- **`docs/CHROME-SETUP-PROMPT.md`** — one prompt for Claude in Chrome that does the whole setup: Neon, the private data repository and its two tokens, GitHub secrets and variables, Vercel (Production-only variables), the domain, sign-in providers, Stripe (test mode), the first publish and the first deploy, analytics and search consoles.
- **`docs/SETUP.md`** — the same steps written out, with every Vercel and GitHub variable and the free-tier limits.
- **`docs/CHROME-QA-PROMPT.md`** — the walk through the live site once it is up.
- **`docs/RELEASE.md`** — the weekly release, an urgent one, and rollback.

## Local development

```bash
npm install
cp .env.example .env                 # point DATABASE_URL at a local Postgres
npx prisma generate && npx prisma db push
npm run import:bootstrap             # the first dataset, no git and no store stage (see below)
npm run dev
```

`npm run import:bootstrap` writes a complete dataset into `PLANE_DIR` (default `.data/`) from TCGCSV and Scryfall, with no git, no network beyond those two and no store stage. `TCGCSV_CACHE_DIR=<dir> SCRYFALL_CACHE_DIR=<dir>` reuse downloaded files; `BOOTSTRAP_GROUPS=24` is the quick variant (24 groups). Point the site at it with `PLANE_DIR=.data`.

| Command | |
|---|---|
| `npm run import` | The full import (catalogue, stores, aggregates, history, publish) as the workflow runs it |
| `npm run import:catalog` | The catalogue phase only (`IMPORT_STORES=0`) |
| `npm run typecheck` / `npm run lint` / `npm test` | Checks (CI runs all three) |
| `npm run check:ownership` / `npm run decisions:index` | The ownership map and the decisions index |
| `npm run icons` | Regenerate the favicon and app icons from the logo geometry |

The data scripts that have no npm alias are run by hand with `npx tsx`: `scripts/data-rollback.ts <seq|sha>` (point the pointer back), `scripts/data-squash.ts` (squash the data branch history), `scripts/history-rebuild.ts --out <dir>`, `scripts/slug-seed.ts [dir]` (rebuild the write-once slug seed) and `scripts/prune-catalog.ts [dir]`.

## Adding a store

Add an entry to `src/lib/stores.ts` with a hand-assigned, never-reused id (`tests/fixtures/store-ids.json`). Check a candidate first with `npx tsx scripts/probe-stores.ts [--platform=…] <base> <market>`: it runs the real reader and matcher and prints what the import would keep. Never loosen a matcher rule to raise the count.

## Email (built, off until configured)

Price alerts, release alerts, the welcome email and the weekly newsletter send **nothing** until both `RESEND_API_KEY` and `EMAIL_FROM` exist as GitHub Actions secrets (MTG Compare's own Resend account, never on Vercel). Every send runs script-side in Actions. Until then the alert run delivers each trigger in-app and no page promises an email. `tests/no-email-api.test.ts` pins where the provider hosts and key names may appear.

## Click log

Outbound clicks are logged anonymously (`ClickEvent`, no user id), sampled, batched into one insert in the first minute of each half hour, and swept after 90 days. `CLICK_LOG=0` switches it off, `CLICK_SAMPLE_RATE` samples it. `/admin/clicks` reads it.
Redeploy with live Stripe keys [deploy]
