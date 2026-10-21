# Reviving DexCompare on Vercel + Neon

DexCompare now deploys from **`apps/dexcompare-sealed`** (sealed products only).
Everything below uses free tiers. It takes about 30 minutes, most of which is
waiting for the first import.

## Where the data lives (2026-10-16): DC2, and the public data files

**The site reads no database.** After every import (`dexcompare-sealed-import.yml`, twice a day; `dexcompare-ebay-import.yml`,
daily) the job exports every public table to `data/public/` (`scripts/export-public-data.ts`, ~25 MB of JSON, one row per line)
and commits it to `main` (`scripts/publish-public-data.sh`). Since 2026-10-17 ONE release a day puts new prices live: the 20:47
UTC sealed import's commit, whose subject carries `[deploy]`, the only thing production builds (`scripts/vercel-ignore-build.sh`).
The 08:47 import's commit, the eBay import's and every code commit ride it; a manual import run, the schema sync and "DexCompare
release" (`dexcompare-release.yml`) release out of turn. The import no longer purges anything first: the deploy does.

**Caching (2026-10-17).** Every data page is `force-dynamic` and Vercel's CDN keeps each response for a day (`next.config.js`
`CDN_PAGES`, `Vercel-CDN-Cache-Control: public, s-maxage=86400, stale-while-revalidate=86400`), never ISR. An ISR write is
billed per 8 KB of the page and every release empties the ISR cache, so ISR wrote each visited page again after every release:
about twenty times the cost of rendering it. The CDN copy is free to keep and a release empties it too. It is safe only because
no page reads a cookie, a header or the session (`tests/cache-ttl.test.ts`). Vercel builds the release, the build bundles the files,
and every page, the browse index and the eBay strips read them through
`src/lib/public-data/` (RiftCompare's query engine, ported). `PUBLIC_DATA_MODE` (Vercel, optional): `files` (default), `fallback`
(database first, files if it cannot answer) or `db` (the database only, as before). A read the files cannot answer exactly falls
through to the database and logs `[public-data:unsupported]`; `scripts/check-public-data.ts` compares every loader both ways and
must report no difference but the order of ties.

**The database is DC2**, a separate Neon project, used by the importers only (so its compute wakes for imports and nothing else):

| Where | Name | Value |
|---|---|---|
| GitHub (secret or variable) | `DC2` | the DC2 connection string (pooled or direct: the jobs use its direct host) |
| Vercel | `DC2` | the DC2 connection string (only a fallback for a read the files cannot answer) |

`DEXCOMPARE_SEALED_DATABASE_URL` / `DATABASE_URL` (the old project) are used only while `DC2` is unset.
`dexcompare-migrate-dc2.yml` copied the old project into DC2 once (pg_dump, every table's row count checked) and published the
first snapshot. Once the site has run on DC2 for a few days: delete the old Neon project, and the `DEXCOMPARE_SEALED_DATABASE_URL`
secret and Vercel's old `DATABASE_URL` with it.

## 1. Neon — a new, separate database

Don't reuse an old DexCompare database, and don't share Rift Compare's projects:
each Neon free project has its own 5 GB/month transfer allowance, and this
site should never be able to eat into Rift Compare's.

1. [console.neon.tech](https://console.neon.tech) → **New project**.
   - Name: `dexcompare`. Postgres 16 or 17.
   - Region: **AWS US East (N. Virginia)** — the same place Vercel runs
     functions by default (`iad1`), so page renders are one short hop.
2. On the project dashboard → **Connect**. Copy two strings:
   - **Pooled** (the "Connection pooling" toggle ON; the host contains
     `-pooler`) → this goes to **Vercel**.
   - **Direct** (toggle OFF) → this goes to **GitHub Actions**.

There's nothing to create by hand: the first import creates the tables.

## 2. GitHub — secrets for the import job

Repo **Specifxx/CompareEmpire** → Settings → Secrets and variables → Actions.

**Secrets** tab:

| Name | Value |
| --- | --- |
| `DEXCOMPARE_SEALED_DATABASE_URL` | the Neon **direct** string |
| `DEXCOMPARE_REVALIDATE_SECRET` | a long random string — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep it for step 4. |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | the Production keyset (App ID / Cert ID) of DexCompare's own eBay application. Used **only** by the daily eBay import (below), never by Vercel. |
| `PSI_API_KEY` | optional: a Google Cloud API key with the PageSpeed Insights API enabled, for the weekly PageSpeed check (see "PageSpeed check"). Without it that job skips cleanly. |

**Variables** tab: `DEXCOMPARE_SITE_URL` = `https://www.dexcompare.app` — the
canonical origin with `www`, exactly as in Vercel below. The import job POSTs
`/api/revalidate` there and then reads `/sitemap.xml`; through the apex→www
redirect the POST would lose its `Authorization` header and the job would
report "Page refresh: failed: HTTP 401".

> Use the new secret name. The old singles app's paused workflows read
> `DEXCOMPARE_DATABASE_URL`, and some of them reset the database they point at.

## 3. Merge, then run the first import

1. Merge the `claude/peaceful-euler-bplz47` branch into `main`. GitHub only
   runs **scheduled** workflows from the default branch.
2. Actions → **DexCompare sealed import** → **Run workflow** (branch `main`,
   leave "only" blank). The first run creates the tables and reads every store
   (about 20 minutes).
   The job summary shows stores read, offers per region, and any store that
   failed (its rows are simply kept until the next run).
3. After that it runs by itself at 20:47 and 08:47 UTC.

## 4. Vercel — point the DexCompare project at the new app

In the existing **dexcompare** project (or a new one importing
`Specifxx/CompareEmpire`):

1. Settings → **General**
   - **Root Directory**: `apps/dexcompare-sealed`
   - Framework Preset: Next.js · Node.js Version: 20.x
2. Settings → **Git** → Production Branch: `main`.
3. Settings → **Environment Variables** (Production and Preview):

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the Neon **pooled** string |
   | `NEXT_PUBLIC_SITE_URL` | `https://www.dexcompare.app` — with `www`, no trailing slash |
   | `REVALIDATE_SECRET` | the same value as `DEXCOMPARE_REVALIDATE_SECRET` |
   | `NEXT_PUBLIC_OPERATOR` | who runs the site, as it should read in the Terms and the footer ("Operated by …", shown only when it differs from the site name): a trading name or a person. Optional; until it is set the site name stands in. The code never invents an entity or an address. **Owner action**: set it. |
   | `NEXT_PUBLIC_CONTACT_EMAIL` | optional; default `riftcompare@gmail.com`. Keep it a mailbox someone reads: the contact page promises a reply. **Owner action**: set a branded forwarding address (e.g. hello@ on the site's domain) so stores and visitors see DexCompare's name; the footer links to `/contact`, never a mailto. |

   `NEXT_PUBLIC_SITE_URL` is the origin every canonical, hreflang, JSON-LD,
   robots and sitemap URL is built on. The code defaults to
   `https://www.dexcompare.app` and normalises what it is given (trailing slash
   stripped, anything unparseable ignored), and a production build whose value
   does not match the domain Vercel is deploying to prints a loud `[site]`
   warning in the build log — but never fails the build. (2026-09-28: the live
   site said `dexcompare.com` everywhere because this variable was wrong.)

   **Delete** the old app's variables: the old `DATABASE_URL` (a dead Neon
   project), `ANTHROPIC_API_KEY`,
   `GEMINI_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `AUTH_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_HILLTOPADS_SRC`, …
   None are used any more. **Also remove `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` from Vercel**
   if they are there (they were, for the earlier on-demand listings): the website no longer calls
   eBay, so it needs no eBay credential, and keeping them there only widens who could read them
   (least privilege). They live in GitHub Actions now (see "eBay listings: the daily import").

   Scoped to Preview as well, `DATABASE_URL` gives a preview deployment the
   **production** database. That is why previews are off (below) and why a
   preview build reads no database at all.
4. Deployments → **Redeploy** the latest `main` commit (untick "use existing
   build cache"). The build does not need the database to be filled.

The old app's Vercel crons (price alerts, newsletter) disappear with this
deploy: the new `vercel.json` defines none. Its `ignoreCommand`
(`scripts/vercel-ignore-build.sh`) decides whether a push builds at all:

- **Production** (`main`) builds when the pushed commit changes something under
  `apps/dexcompare-sealed`, and skips otherwise (every production build empties
  the page cache, so pushes to the other apps shouldn't trigger one).
- **Preview deployments are off** (the owner, 2026-10-14). A push to any other
  branch builds nothing unless its commit SUBJECT carries `[preview]` (any
  case) and the commit changes the app; put the marker in only when a preview
  is wanted. Before, every push of a branch touching the app built a preview
  that prerendered the eight sitemap files against the production database.
  A preview that is asked for still reads no database at build: its sitemap
  files are written without products (`src/lib/build-env.ts`), and its pages
  read the production database only when someone opens them, like any ISR page.

`tests/vercel-ignore-build.test.ts` pins both. If a deploy shows **"Canceled by
Ignored Build Step"** when you wanted it, push any change under
`apps/dexcompare-sealed` (on a branch: with `[preview]` in the subject), or
clear Settings → Git → Ignored Build Step for that one deploy.

## 5. Domains

Vercel project → Settings → **Domains**:

1. Add `www.dexcompare.app` and make it the primary: it is what
   `NEXT_PUBLIC_SITE_URL` says, so it is what every canonical URL says. The old
   DexCompare project may already hold the domains; if so, confirm they are
   attached to this project.
2. Add `dexcompare.app` set to **Redirect to `www.dexcompare.app` (308
   permanent)**. One host serves pages; the other only redirects. Whichever way
   round you choose, `NEXT_PUBLIC_SITE_URL` (Vercel), `DEXCOMPARE_SITE_URL`
   (GitHub) and the primary domain must agree.
3. Follow Vercel's DNS instructions at your registrar if it shows any.
   `.app` domains are HTTPS-only (HSTS-preloaded), which Vercel handles.

Old URLs like `/sealed`, `/sets/<set>` and `/stores` redirect to the Australian
pages; old single-card pages return 404 so Google drops them. Upper-case region
prefixes (`/AU`, `/AU/sets`) 308 to the lower-case page (`src/middleware.ts`);
any other unknown path (`/foo`, `/Au`) is a plain 404.

## 6. Search Console

Add the `www.dexcompare.app` URL-prefix property (or a domain property for
`dexcompare.app`; DNS verification, or set `GOOGLE_SITE_VERIFICATION` in Vercel
to the HTML-tag token and redeploy), then submit
`https://www.dexcompare.app/sitemap.xml`.

That URL is a **sitemap index** (`src/app/sitemap.xml/route.ts`) listing
`/sitemap/0.xml` (the static pages, every active store page and, per region, `/deals`, `/cheapest-packs`, `/this-week`,
`/guides` and each guide offered there, plus the one region-less guide, `/guides/pokemon-booster-box-prices-by-country`) and `/sitemap/1.xml` …
`/sitemap/7.xml`, one per region in the order AU, US, UK, CA, NZ, EU, SG
(`src/lib/sitemap.ts`): a region's type pages, set pages and every product at
least one store there has in stock or two stores list. Each file carries the
market's last import as `lastmod`. If a query fails while a file is being
regenerated, the request errors and ISR keeps the previous copy — a sitemap is
never cached with its products missing (the old single sitemap was, for 24
hours at a time). The import job checks the live index after every full run
and goes red if the regional sitemaps total under 1,000 product URLs
(`scripts/import.ts`, `checkLiveSitemap`; a full import lists ~8,000).

**After a release that adds pages** (the growth release added deals, cheapest per pack, this week and the guides in
every region), resubmit `sitemap.xml` in Search Console (Sitemaps → the entry → resubmit) so the new URLs are read
soon. Store pages with nothing listed, or whose store is dormant, are `noindex` and left out of the sitemap.

## 7. Google AdSense

On by default with the owner's publisher ID, `ca-pub-6842128782879909` (`DEFAULT_ADSENSE_CLIENT` in `src/lib/adsense.ts`).
`NEXT_PUBLIC_ADSENSE_CLIENT` in Vercel overrides it (`pub-…` or `ca-pub-…`), and `off` switches AdSense off; it is read at
**build** time, so redeploy after changing it.

1. Site-wide this gives: the `google-adsense-account` meta and the AdSense script in every page's `<head>` (what AdSense's site
   review checks), `https://www.dexcompare.app/ads.txt` with Google's authorised-seller line, and the AdSense paragraphs on
   `/privacy` (cookies, opt-outs) and `/about` ("how we make money").
2. In AdSense → Sites, add `dexcompare.app` and press **Verify** / **Request review**. The landing page (`/`) is what the reviewer
   reads first: its original text (what the site is, how it compares, the buying guides, the questions answered in full) sits in
   the first screens of the server HTML, and its one eBay unit is last.
3. Nothing to set in Vercel for this: the ID is in the code.
4. Consent: AdSense → Privacy & messaging → create the **European regulations (GDPR)** message (Google's own certified consent
   banner, served by the same script; no code needed) before ads serve in the UK, EEA and Switzerland. Add the **US state
   regulations** message too.
5. Once approved: AdSense → Ads → By ad unit → **In-article** → create one, copy its `data-ad-slot` number into
   `NEXT_PUBLIC_ADSENSE_SLOT_GUIDE` and redeploy. Each guide then carries one labelled in-article unit two sections after its eBay
   strip (`adsenseIndex` in `src/content/guides/kit.tsx`), `data-ad="adsense-guide"`, so the viewport sweep counts it.
6. **Auto ads**: leave them off at first. They place ads anywhere, including product pages, where the eBay units already sit at
   the density ceiling (see "Ad rules" below). If you try them, exclude product pages (AdSense → Ads → Overview → Edit → Page
   exclusions: `/*/p/*`) and re-run the viewport sweep.

## Social share cards

Each region home (`/au`, `/us` …) and each guide (the by-country one included) has its own 1200×630 share card, drawn at build
from the registry (`src/lib/og-card.tsx`; routes `/og/<region>` and `/og/guides/<slug>`; no database). It is the thumbnail Reddit, Discord and X
show for a link. To preview one, open `https://www.dexcompare.app/og/au`. Reddit caches a link's thumbnail when it is first
posted, so check the card before posting.

## Security headers

`next.config.js` sends HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy` and a **report-only**
Content-Security-Policy. Report-only never blocks anything: a violation shows
in the browser console as `[Report Only] Refused to …`. Before ever switching
it to an enforcing `Content-Security-Policy`, browse the landing page, a region
home, a product page and a store page with the console open and make sure it
is silent — product photos are hotlinked from ~250 store CDNs (`img-src
https:` covers them) and Vercel Analytics posts to `/_vercel/insights` on the
same origin. Google AdSense's hosts (`*.googlesyndication.com`, `*.doubleclick.net`, `*.google.com`) are allowed in script,
connect and frame sources for when it is switched on.

## Ad rules (the growth release, 2026-10)

The owner approved these changes to the site's own advertising rules; `src/lib/ebay-ads.ts` (its header), README.md
("eBay listing strips") and the About page ("How DexCompare makes money") say the same.

**Changed**

1. **No sticky or overlay unit, with one exception**: the phone product buy bar (`product-sticky`): at most 64 px plus the
   safe area (under 8% of an 844 px screen, far below the Better Ads 30% limit), slides in with a CSS transform (CLS 0),
   shows only after the best-price card or the sold-out box has scrolled away, hides while the price table, any other unit or
   the footer is visible, can be dismissed for the session, is keyboard-reachable and sets scroll-padding; it only repeats what
   the top of the page offers, labelled "Ad" or "affiliate link". Because it hides whenever another unit is visible, the
   one-unit-per-phone-viewport rule still holds literally.
2. **eBay prices outside the table**: the sold-out box (`listings-soldout-best`) and the Marketplaces panel
   (`listings-marketplace`, only when the best-price card is not already eBay) may show the product's own new eBay listing,
   client-only, through the same request as the price-table row, with its age and "Ad". 61% of product pages are sold out, and
   their only exit was a TCGplayer button priced in US$.
3. **Sold-out page order**: the eBay box in the sold-out callout is the first-screen unit; the product's strip moved below the
   price table and the in-stock alternatives (`soldOutAdPlan` keeps them at least 960 px apart).
4. **The Marketplaces panel's eBay row** is an eBay-blue button on every product page (it was a red text link unless popular).
5. **`.btn-ad`** is filled eBay blue (#3665f3, hover #2a50c8, white text 4.9:1) instead of a grey outline: eBay's own button
   colour, distinct from the site's red. Every unit keeps its "Ad" label. Owner to confirm against the EPN brand guidelines.
6. **In-feed tiles**: one after every 16 products, at most two per grid, never within the last eight, on the browse, set, type
   and deals grids (it was one tile, after the 12th product, on `/sealed` only); each a different listing (the sealed feed's 7th
   and 8th) that no strip shows; the first at least 12 products after the strip; from md up only with 24 products after it.
   `MAX_FEED_ROWS` stays 8, so the importer did not change.
7. **The highlight button** extends from hot sets to every released set's page ("Shop <set> sealed on eBay", `set-sealed`),
   inside the existing strip's top line. Hot sets keep `hot-set`; the "Popular set" chip stays hot-only. No new unit.
8. **Region home order**: the sealed strip (with the hot button) right after the deals rail, the chase strip after the
   booster-box rail. Still two units, at least a viewport apart, and no pre-footer strip.
9. **New pages and search**: deals, cheapest per pack, this week and every guide carry exactly one strip of their own (plus grid
   tiles where a grid is long enough); US-only labelled TCGplayer searches on set pages and guides; a search result list gets one
   query-matched box (`browse-search`) in the slot the unfiltered list's strip used.
10. **`/api/ebay` edge cache**: an hour with stale-while-revalidate, instead of 5 minutes (see "Edge cache and the kill switch").
11. **A density ceiling**: ad-unit height ÷ main content height at most 25% per page, at 390 and 1440 wide, checked by the
    viewport sweep (README.md). A ceiling, never a target.
12. **Pre-order pages: marketplaces pinned on top** (the owner, 2026-10-16: "make sure the eBay links stay at the very top,
    alongside the TCG ones, and everything else is priced in order"). Each product's price list on `/<region>/preorders/<set>`
    opens with a labelled "Marketplaces" group: eBay first (`preorders-ebay`: the region's eBay Buy It Now SEARCH for the
    product, eBay blue, "Ad", worded "Search on ebay.com.au, not a price we checked": the importer refuses eBay pre-sales of an
    unreleased set, so there is no listing to price), then TCGplayer (`preorders-tcgplayer`: in the US its offer with its price
    and stock; elsewhere its US$ offer, labelled "US marketplace, prices in US$", or a search). Neither is numbered, badged,
    counted as a store or compared with a price. Below them come the stores alone, numbered in price order (open pre-orders
    cheapest first, "Cheapest store" on #1, sold out and not checked last, `preorders`); TCGplayer left the store ranking there.
    The group is part of each price list, like the product page's `listings-offer-row`: the viewport sweep treats it as the
    comparison, not a unit. The product page's table is unchanged.

**Unchanged**: an "Ad" or "affiliate link" label next to every unit and link; `rel="sponsored nofollow noopener noreferrer"` on
every paid link; store links plain, and commissions never change the store order; at most ONE unit per phone viewport and TWO
per desktop viewport (the header's eBay item counts as one); no pop-ups, interstitials, auto-redirects or countdowns; eBay listing
data never in server HTML, JSON-LD, meta, OG or the sitemap, only through `/api/ebay` within the 26-hour bound with its age shown;
eBay's affiliate URL exactly as returned, Buy It Now only, condition shown, eBay's images unmodified; no statistics derived from eBay
data on the server; no eBay unit on the About, Terms, Privacy or Contact pages; the price table's eBay row and the best-price swap
rules as they were; no incentivised clicks; no price-history wording.

**Not adopted** (from the 2026-10 audits): two units per phone viewport or a 25% density *target* (it would trade the site's
welcoming feel and Core Web Vitals for marginal clicks); `MAX_FEED_ROWS` 12 and a third tile per grid (an importer change);
eBay buttons in release-calendar rows (the owner removed text call-to-action rows there); a per-store affiliate hook (no store
programme has been joined yet); pinning the eBay row to the top of the product page's price table (it would break the honest ranking; the pre-order page's pinned
marketplace group, item 12, sits above the ranking and outside it, so the store order stays honest).

**Licence trade-offs the owner accepted** (eBay API License Agreement; details and how to revert each in "eBay's rules, and how
each is met"): **8.1(b)(2)**, eBay content mixed with other content: the price-table row and the best-price card (2026-10-11),
widened by the sold-out box's price, the Marketplaces panel's price and the buy bar that repeats them; **8.1(c)**, listing age: the
daily import (26-hour bound) instead of six hours, now shown on more surfaces, with the six-hour compliant mode unchanged;
**8.1(d)**, derived information: only the best-price card's per-pack price and median/MSRP comparison, computed in the browser.

## Click events (Vercel Web Analytics)

Every outbound buy link — to a store, TCGplayer or eBay — sends one custom
event, `buy_click`, with exactly two properties:

| Property | Example values |
| --- | --- |
| `retailer` | `Pokebox (AU)`, `TCGplayer`, `eBay (ebay.com.au)` |
| `placement` | every value of `PLACEMENTS` (`src/lib/affiliate.ts`), each in the table below: e.g. `product-best`, `product-table`, `product-sticky`, `soldout-ebay`, `listings-set-feed`, `browse-search`, `preorders` |

The eBay units each have their own placement, and Vercel's `buy_click` ({retailer, placement}) says which
surface earned. **EPN's `customid` report is coarser for listing tiles**, on purpose: eBay's spec says to use the
`itemAffiliateWebUrl` it returns exactly as returned, so the browser does not edit the stored URL, and one stored
URL serves every surface that shows the feed. The importer therefore asks eBay (header `X-EBAY-C-ENDUSERCTX`,
`affiliateReferenceId`) for a sub-id **per feed**, which eBay copies into the URL's `customid`:
`dex-<market>-<feed kind>`, with market `us`, `au`, `uk`, `ca` or `eu` (NZ buyers are served `au`, SG buyers `us`) and
feed kind `chase`, `sealed`, `type`, `set` or `item`: for example `dex-us-chase`, `dex-au-item`, `dex-uk-set`. So EPN
splits earnings by marketplace and feed kind (25 values); the surface within it (home, set page, footer...) is in
the Vercel event. Our own SEARCH links (the header item, the compact "search eBay" CTA, the product page's marketplace
rows) are built by us and still carry `dex-<region>-<placement>` (at most 60 characters). Every strip tile, its
compact "search" CTA and the in-feed tile report under the strip's own placement:

| Placement | Where |
| --- | --- |
| `header` | the "eBay" item in the header (desktop nav, xl and up only, region pages only): a search link |
| `listings-home-sealed` | region home: the sealed-Pokémon strip right after the "Cheaper than most stores today" deals rail (the first unit on the page); it carries the hot-set button (`hot-home`) |
| `listings-home` | region home: the chase-card strip after the "Booster boxes in stock" rail (at least a viewport below the sealed strip; the home page has no pre-footer strip) |
| `listings-landing` | the root landing page (`/`): one strip, on the region the browser suggests once it has mounted (US until then), labelled with that region's eBay site; same height whichever region, so it never shifts |
| `listings-product` | product page, in stock: the product's own listings, on every product page (cascade: its type's, then, for box-class types only, generic sealed) directly below the offer table where the table is long enough to sit a screen below the marketplace panel, else at the bottom of the page in place of the pre-footer strip where the page has room; none on a page too short for either (`productAdPlan` in `src/lib/ebay-ads.ts`) |
| `listings-product-soldout` | product page, sold out: the same strip, now BELOW the price table and the "In stock instead" row (it used to sit directly under the callout, whose eBay box is now the first-screen unit), placed by `soldOutAdPlan` at least 960 px below the sold-out box's eBay unit, or at the bottom, or not at all on a page too short for it |
| `soldout-ebay` | product page, sold out: the eBay box inside the sold-out callout, the page's first-screen unit. The server HTML is a full-width eBay-blue "Find it on <eBay site> ↗" search for the product (and the box stays that search without a listing, on pre-orders and in NZ/SG); TCGplayer is the secondary button under it, with the affiliate note |
| `listings-soldout-best` | product page, sold out: the same box once the browser has the product's own NEW listing (through the price table row's request, `useEbayPick`: no extra fetch): "On eBay from <price> <shipping> · updated <age>", "View on eBay ↗" to the listing exactly as eBay returned it, labelled "Ad". The two states are stacked in one space, so the swap never shifts the page |
| `listings-set` | set page: the set's chase cards (cascade: generic chase cards), on a row of its own after the first four products; on every RELEASED set its top line carries the "Shop <set> sealed on eBay" button (`set-sealed`; `hot-set` for a hot set) |
| `listings-type` | type page: the type's listings (cascade: generic sealed), on a row of its own after the first four products |
| `listings-browse` | `/<region>/sealed`, page 1 only (unfiltered list): the sealed strip on a row of its own after the first four products |
| `listings-browse-feed`, `listings-set-feed`, `listings-type-feed`, `listings-deals-feed` | in-feed listing TILES in the product grids of `/<region>/sealed` (every page), set pages, type pages (the in-stock grid) and `/<region>/deals` (the first section's grid): one real listing as a labelled sponsored card the size of a product card after every 16 products, at most two per grid, never within the last eight, the first 12 products below the grid's strip. From md up a tile also needs 24 products after it (a whole row tall beside two or three cards, it would push a short page over the 25% density ceiling): 24-39 products, one tile on phones only; 40-55, one everywhere and a second on phones; 56 or more, two. Each is the sealed feed's 7th / 8th listing, which no strip or pre-footer strip on the page shows (`src/lib/ebay-ads.ts` feedSlots, tileSource). Invisible and reserved until its listing is known (no shift); with none, removed while below the viewport |
| `listings-deals` | `/<region>/deals`: the sealed strip on a row of its own after the first four products of the first section |
| `listings-packs` | `/<region>/cheapest-packs`: the sealed strip after the overall top-10 table |
| `listings-digest` | `/<region>/this-week`: the sealed strip after "Releasing soon" |
| `listings-guide` | a guide (`/<region>/guides/<slug>`): its one strip, after the first data block (the guide's own context: generic sealed or its type's feed) |
| `browse-search` | `/<region>/sealed` with a search query and results: ONE query-matched box after the first four results (the slot the unfiltered list's strip uses, so a search page never has more units than the unfiltered one): "See "<query>" on eBay — Buy It Now ↗" and, in the US, "Search TCGplayer ↗" (Impact `sharedid`), with "Ad" and the affiliate note. Client-only: the query never reaches cached HTML or the database. Zero results keep `browse-empty` |
| `listings-offer-row` | product page: the eBay ROW OF THE PRICE TABLE (the owner's call, 2026-10-11: DexCompare compares websites, and eBay is one). The product's lowest-priced OWN eBay listing (never its type's or generic listings; never one under 40% of the cheapest store price, where the stores price in the eBay site's currency), ranked by its price among the in-stock stores (a tie stays with the store; NZ/SG, whose listings are in A$/US$, after the in-stock stores), tinted (the sponsored tint, an eBay-blue edge), labelled "Ad", eBay's blue "View on eBay" button, "updated N h ago" on the row; with no listing it is an eBay search for the product after the in-stock stores (that is also the server HTML: the listing is fetched as the page runs and then moves to its rank). The table shows 8 rows (the eBay row ranked among them) and puts the rest in two server-rendered drawers, split after ranking so the visible height never changes. When it is a NEW listing cheaper than every in-stock store (not on a pre-order product) it IS the best price (the owner's call, 2026-10-11): "Best price" on it, "Best store price" on the cheapest store, and the best-price card shows it (`listings-best-price`). Never counted in the store count or the median, never in JSON-LD, meta, OG, the sitemap or the "from" prices elsewhere |
| `listings-best-price` | product page: the best-price card's eBay button, when the product's eBay listing (the price-table row's) is NEW and cheaper than every in-stock store, and the product is not a pre-order: the TOP of the card turns to it (its price, per-pack price, "Best price in stock · <shipping>", "eBay · Ad · updated N h ago · vs <cheapest store price> <store>", and the median/MSRP badges for it, on one line, only where the store's card has them). Below the rule the card stays the stores' facts ("up to … — you save …", median, "best store price … MSRP"). Not in NZ or SG (A$/US$ listings are not compared). The server HTML is the store's card; the swap happens in the browser, the two tops stacked in one space of fixed lines (no layout shift); the Marketplaces panel keeps its TCGplayer row on such pages |
| `product-marketplace` | product page: the Marketplaces panel's rows, a TCGplayer row and an eBay row that is the eBay-blue `.btn-ad` button on EVERY product page (it was a red text link unless the product was popular): a search for the product. The "Popular set" chip of a hot product stays outside the link |
| `listings-marketplace` | product page: the Marketplaces panel's eBay row once the browser has the product's own NEW listing AND the best-price card is not already showing eBay: "eBay · from <price> · updated <age>", to the listing exactly as returned, labelled "Ad". Same height in both states; otherwise the row stays the `product-marketplace` search |
| `product-sticky` | product page, phones only (below lg): the BUY BAR at the foot of the screen, the site's only sticky ad unit. At most 64 px plus the safe area; it slides in (a transform: no layout shift) only after the best-price card or the sold-out callout has scrolled above the viewport, and hides while the price table, any other `[data-ad]` unit or the footer is in view, so a phone screen still never shows two units; the visitor can dismiss it for the session; it sets `scroll-padding-bottom` so it never covers a focused element. It repeats the top of the page: in stock, the cheapest store's price and button (with "affiliate link" when that is TCGplayer); where the card shows the eBay listing, its price, "Ad" and the listing; sold out, the callout's eBay action (the listing or the search), with "Ad" |
| `listings-store` | store directory and store pages: the chase strip, after the list (it replaces the pre-footer strip there) |
| `listings-releases` | release calendar: the closing strip (it stands in for the pre-footer one) |
| `listings-footer` | every other content page: the slim four-tile strip above the footer (the feed the page's own strip is not: sealed under a set, store or release page, chase elsewhere; none on a region home, which has two strips of its own, and none where a page renders `<NoPreFooter/>` because it is too short for it beside its own units) |
| `listings-notfound` | the 404 page: a slim strip (on the eBay site of the region in the URL, US outside one) |
| `hot-home`, `hot-set`, `hot-product` | the highlighted eBay search button of a popular set or product (`src/lib/popular.ts` HOT_SETS, 30th Celebration first): inside the top line of the region home's sealed strip (`hot-home`), a hot set's strip (`hot-set`) and a hot product's strip (`hot-product`), and the compact CTA those strips become (a search link, `dex-<region>-hot-<surface>`); a highlighted strip's CTA clicks report under its hot placement |
| `set-sealed` | every RELEASED set's page that is not a hot set: the "Shop <set> sealed on eBay" button inside the top line of the set's strip, and the compact CTA it becomes (a search link, `dex-<region>-set-sealed`); hot sets keep `hot-set`, pre-order sets have none. Part of the strip, never a unit of its own |
| `set-tcgplayer`, `guide-tcgplayer` | US only: the labelled TCGplayer search ("Shop <set> on TCGplayer ↗ · affiliate link") in a set page's hero card, and "Search <topic> on TCGplayer ↗ · affiliate link" in a guide's closing "Where to buy" section (Impact `sharedid` `dex-us-set-tcgplayer`, `dex-us-guide-tcgplayer`) |
| `product-best`, `product-table`, `product-soldout`, `browse-empty`, `store-page` | the page's own store/TCGplayer buttons: the best-price card's button, the price table's rows, the sold-out callout's TCGplayer button (now the secondary choice under the eBay box), the browse page's "nothing matches" eBay/TCGplayer box, and a store page's "Visit" link |
| `preorders` | a pre-order page (`/<region>/preorders/<set>`, `src/lib/preorder-guides.ts`): the STORE buttons of each product's price list, the stores alone, numbered in price order (TCGplayer moved to `preorders-tcgplayer` on 2026-10-16) |
| `preorders-ebay` | a pre-order page: the eBay row pinned at the very top of each product's price list, in its "Marketplaces" group (`PreorderMarketplaces` in `src/components/Marketplaces.tsx`): the region's eBay Buy It Now search for the product (an unreleased set's eBay listings are pre-sales the importer refuses, so it is a search, never a price), eBay blue, "Ad"; unnumbered and never compared |
| `preorders-tcgplayer` | a pre-order page: the TCGplayer row under it in the same group: in the US TCGplayer's own offer (price, pre-order or sold out), elsewhere its US$ offer (labelled "US marketplace, prices in US$", one read of the set's TCGplayer offers) or a TCGplayer search; "affiliate link"; unnumbered, never a store, never compared with local prices (Impact `sharedid` `dex-<region>-preorders-tcgplayer`) |

When a strip has nothing to list (no import yet, a kill switch, rows older than the age bound) it is a single
compact row: the eBay wordmark, "Ad", and a "Search Pokémon sealed on eBay" button (under the same
placement). There are no text-only banners, chip rows or "Still deciding?" rows any more.

- Custom events need the **Pro** plan with Web Analytics enabled (Vercel
  project → **Analytics** → Enable). **Hobby records page views only**; the
  events are simply dropped, and nothing breaks.
- Pro keeps **two properties per event** (extra ones are dropped), which is
  why `buy_click` has exactly `retailer` and `placement`. Don't add a third.
- To see them: Vercel project → **Analytics** → **Events** → `buy_click`,
  then break down by `retailer` or `placement`.
- Money is reported by the networks, not Vercel: eBay Partner Network reports
  by `customid` and TCGplayer's Impact dashboard by Shared ID (`sharedid`). TCGplayer's and eBay's search links carry
  `dex-<region>-<placement>`; eBay listing tiles carry `dex-<market>-<feed kind>` (see above).

No environment variables are needed. Optional overrides:
`NEXT_PUBLIC_EBAY_CAMPAIGN_ID` and `NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK` (the
built-in defaults are the live campaign and deep link).

## Monthly money check (10 minutes)

Once a month, the same three reports, in this order (they need Vercel Pro with Web Analytics: on Hobby the clicks are not
recorded at all):

1. **Vercel → Analytics → Events → `buy_click`**, last 30 days. Break down by **`placement`**: clicks per surface (the table
   above). Then by **`retailer`**: stores vs `eBay (…)` vs `TCGplayer`, and which stores get the most clicks (the list to approach
   first if store affiliate programmes are ever joined). Note any placement with no clicks at all.
2. **eBay Partner Network → Campaign Manager → Reports**, the same 30 days, by **custom ID** (`customid`): our search links report
   as `dex-<region>-<placement>` (`soldout-ebay`, `product-marketplace`, `set-sealed`, `hot-*`, `browse-search`, `header`, the
   compact CTAs); listing tiles as `dex-<market>-<feed kind>`: `item` (the product page's table row, best-price card, sold-out
   box, panel price, buy bar and product strip), `sealed` (most strips and every grid tile), `chase`, `type`, `set`. Clicks,
   earnings, earnings per click.
3. **Impact → Reports → Performance by Shared ID** (`sharedid`) for TCGplayer: `dex-us-product-best`, `dex-us-product-table`,
   `dex-<region>-product-marketplace`, `dex-<region>-product-soldout`, `dex-us-product-sticky`, `dex-us-set-tcgplayer`,
   `dex-us-guide-tcgplayer`, `dex-us-browse-search`.

Put each surface's clicks (Vercel) next to what it earned (EPN, Impact) and compare with last month. What to do when a surface
underperforms:

* **No clicks** where the surface should render: open a page that has it (the table says which) and check the unit is there
  (`[data-ad="<placement>"]`, or the kill switch / empty feeds turned it into the compact search row: `scripts/ebay-budget.ts`).
* **Clicks but no earnings for two months**: check one link's `campid` (5339155912) and `customid`, and that EPN still lists the
  campaign as active; for TCGplayer, that the link goes through `partner.tcgplayer.com/c/7385758/…`.
* **Few clicks and little money**: prefer removing or moving that unit over adding density elsewhere; the density ceiling and the
  one-unit-per-phone-screen rule are not targets. A surface that earns well is a reason to look at why (format, position), not to
  repeat it.
* Write the month's numbers down (surface, clicks, earnings) wherever the owner keeps them: Vercel keeps events for a limited time
  and the networks' reports are the record.

## eBay listings: the daily import

The image strips on the site ("Chase cards on eBay", "Sealed Pokémon on eBay", "<Set> chase cards on
eBay", "<Product> on eBay") show **real eBay listings**: photo, title, price as eBay returns it, shipping,
and how old the data is, each tile an affiliate link. They are **imported once a day** by a GitHub Actions
job (`.github/workflows/dexcompare-ebay-import.yml`, `scripts/ebay-import.ts`) with DexCompare's own eBay keys
and stored in two small tables; the website only **reads** them. Scraping eBay is a Terms violation and eBay
blocks it; the Browse API is the only compliant source. **Every product page asks for its own listings**, which come
first from the **catalogue sweep** (below): broad searches paged 200 listings a call, each listing handed to the
product the repo's classifier says it is, so one call can feed dozens of products, cheap ones included.

> **READ THIS FIRST: the 5,000 calls/day limit belongs to the eBay APPLICATION (the keyset), not to this site.**
> The database counter (`EbayCallDay`) counts only the searches THIS importer makes; it cannot see the owner's other site if that site uses the
> same App ID / Cert ID, and eBay's own counter (which a 429 comes from) adds the two. If both sites run on one keyset, either
> **(a) create a separate eBay application (a separate keyset) for DexCompare** and put its id and secret in `DEXCOMPARE_EBAY_CLIENT_ID` /
> `DEXCOMPARE_EBAY_CLIENT_SECRET` (the recommendation: each site then has its own 5,000), or
> **(b) agree each site's share of the 5,000 and set `EBAY_DAILY_CAP` to that share on BOTH sites**. This site's default, **2,500**, is also the
> importer's hard maximum: it is DexCompare's half of a keyset shared with the owner's other site, so that site must be capped at 2,500 too. Since
> the catalogue sweep, the daily run spends close to its whole 2,500 every day, so the split is no longer theoretical. Until one of these is done, a busy day on the other site can exhaust the shared limit
> and this import will meet 429s (it stops the run and keeps the previous rows). The importer prints its running total against the caps in
> the log (before the first search and every 250 searches), and `scripts/ebay-check.ts` prints eBay's own count and reset time for the
> keyset, which includes the other site's calls: compare the two numbers after the first live run.

```
GitHub Actions, once a day (secrets live here only)        Vercel (Next.js, ISR)
scripts/ebay-import.ts                                      pages stay static; a strip fetches, near the viewport,
  ├─ 1. fixed feeds: chase, sealed, types, sets             GET /api/ebay/<region>?c=<context>
  ├─ 2. catalogue sweep: broad searches, 200 a call,          └─ reads ≤ 8 rows of EbayListing (no eBay call,
  │     each listing to the product it IS                         no token, no secret), never older than
  │     (US, UK, EU first; hot sets first in each)                EBAY_LISTING_MAX_AGE_HOURS (default 26)
  ├─ 3. per-product searches for what the sweep missed:
  │     hot-set products (US, UK, EU), then the eligible
  │     ones, with what is left
  ├─ reserve each Browse call in the DB first
  ├─ search (3 at a time), normalise, filter
  └─ REPLACE each feed's rows (one transaction)
```

### Why daily, and the licence risk (read this)

**The owner chose a once-a-day import knowingly.** eBay's API License Agreement (https://www.edp.ebay.com/join/api-license-agreement,
section **8.1(c) "Age of Displayed eBay Content"**; the page numbers its sections automatically, so quote the headings too: 8 "EBAY CONTENT",
8.1 "Using and Displaying eBay Content", (b) "Public Display", (c) "Age of Displayed eBay Content", (d) "Prohibited Use and Derivation of
Information"; re-read on the live page 2026-10-08) says, in **two prongs**:

> **Prong 1, listing information (6 hours):** "Displayed item listing information may not be more than six (6) hours older than information displayed on the eBay Site,"
>
> **Prong 2, other eBay Content (24 hours):** "and other eBay Content must be no more than twenty-four (24) hours older than content displayed on the eBay Site."
>
> **Disclosure:** "If your displayed item listing is not as current as the listing on the eBay Site, you will disclose in your Application ... how much older your displayed item listing is than the same listing on the eBay Site."

A daily import **does not meet prong 1**, and the default 26-hour bound is also beyond prong 2's 24 hours for the other content (titles,
photos): the strips never show anything older than 26 hours, and the compliant mode below brings both inside their limits (a bound of
`24` meets prong 2 alone, at the cost of the two hours of slack for a late GitHub run). Two more clauses bear on it: 8.1(b)(1) "When the eBay Content is
no longer publicly available, you must delete it from your Application" (the importer keeps a feed's previous rows when a refresh comes back
empty, the owner's rule that a blip must not blank a strip; the bound deletes them within 30 hours), and 3.1(b) "All intermediate copies must be
deleted when they are no longer required for the purpose for which they were created". eBay could act on the keyset (a warning, a limit, a
suspension; the Growth Check that raises call limits also reviews compliance). What is done about it:

* **Disclosure, everywhere**: every strip shows "Updated 9 h ago" (rounded up, never fresher than it is) and
  says "Listings are imported from eBay about once a day (updated 9 h ago), so price and availability may have
  changed; check eBay" (the cadence words follow the age bound the route reports: "several times a day" in the compliant mode). The About,
  Terms and Privacy pages say the same. That satisfies the disclosure half of the Age clause.
* **A hard bound**: a listing older than `EBAY_LISTING_MAX_AGE_HOURS` (default **26**) is never shown. The route
  never returns such a row, and the browser re-checks the bound the route reports (every minute and when a tab comes
  back), so a tab left open for a day drops to the plain search link.
* **Deleted when no longer needed (3.1(b), 8.1(b)(1))**: each import run purges rows older than the bound + 4 hours at its start
  and end, and the twice-daily store import (`scripts/import.ts`) does the same with one `DELETE` through the SAME helper
  (`purgeCutoff` in `src/lib/ebay-context.ts`, reading the same `EBAY_LISTING_MAX_AGE_HOURS`), so a stopped eBay job
  cannot leave old listings behind and the two can never disagree. A refresh REPLACES a feed's rows in one transaction: nothing is appended, no
  history is kept. A failed or empty refresh keeps the previous rows until the bound.
* **Reversible**: see the switch below (the cron, one variable in two places, and the run cap; the strips' wording follows by itself).

### The switch to compliant mode (six hours)

Three settings; nothing else changes. The strips already say how old they are, and **their wording follows the bound by itself**: the route
reports the bound it applied (`maxAgeMs`) and the strips say "imported from eBay several times a day" instead of "about once a day" when
it is 12 hours or less, so the copy stays true in either mode (the About, Terms and Privacy pages say "once a day, in the default setting").

1. **The cron** in `.github/workflows/dexcompare-ebay-import.yml`: `"37 8 * * *"` becomes `"13 */4 * * *"` (every four hours, six runs a day; all six fall
   inside one Pacific budget day in summer and in winter).
2. **`EBAY_LISTING_MAX_AGE_HOURS=5.5`**, set in **two** places that read it:
   * **Vercel** (the route reads it and tells the browser; a changed environment variable needs a redeploy),
   * the **GitHub repository variable** `EBAY_LISTING_MAX_AGE_HOURS` (Settings → Secrets and variables → Actions → Variables): the eBay import and,
     through the same variable, the store import (`dexcompare-sealed-import.yml`) read it for their purges.
3. **Lower `EBAY_RUN_CAP` to `380`** (GitHub variable). Six runs of 380 searches are 2,280 a day, under the 2,500 daily cap with 220 to spare for a
   manual run; the default 2,500 would use the whole day in the first run and the later ones would stop at once. 380 searches a run cover the
   generic, type and set feeds (265) and 115 pages of the catalogue sweep (it takes what the fixed feeds leave, up to `EBAY_SWEEP_CALLS`), which
   leaves next to nothing for per-product searches: a product page shows what those sweep pages found for it, else its type's strip. (The
   2026-10-11 probe's 60 sweep pages found two or more listings for 590 product keys, and at least one for 1,350.) (Retries count inside the run cap, so 380 is a hard ceiling;
   six runs of 416 would use all but 4 of the daily cap.)

The skip-fresh window is `min(2 h, a quarter of the bound)`: 1.4 h in compliant mode, so a four-hourly run always buys every feed again. Switching
back is the same three settings in reverse. Raising the call limit (the eBay Application Growth Check, below) is what would let a compliant mode
also cover every product.

### What to set up

1. **A Production keyset for DexCompare's own eBay application** (developer.ebay.com → Application Keys → Production:
   "App ID" is the client id, "Cert ID" the secret; a Sandbox keyset does not work: the code only calls `api.ebay.com`).
   The Buy APIs are access-controlled: if the token works but searches answer 403, the keyset has not been granted Buy API
   access yet (apply from the application's page; eBay's Partner Network questionnaire, up to 10 business days). The 5,000
   calls/day default limit is **per application**: if DexCompare's keyset is also the other site's, the two share it (see the box above).
2. **GitHub secrets** (Settings → Secrets and variables → Actions → Secrets): `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET`
   (the names the owner set), plus the existing `DEXCOMPARE_SEALED_DATABASE_URL`. `DEXCOMPARE_EBAY_CLIENT_ID` /
   `DEXCOMPARE_EBAY_CLIENT_SECRET` are accepted too and win when set (to give this site a different keyset from a shared
   one without renaming anything). The secrets are passed to the **import step only**.
3. **Optional repository variables** (Variables tab): `EBAY_DAILY_CAP` (default 2500, also the maximum: this site's share of the keyset,
   see the box above), `EBAY_RUN_CAP` (2500), `EBAY_LISTING_MAX_AGE_HOURS` (26), and `NEXT_PUBLIC_EBAY_CAMPAIGN_ID` **only if** you override the
   EPN campaign id: the importer enforces
   its own value (default `5339155912`) on every URL it stores and asks eBay to tag the URLs with it. The website no longer compares a listing's
   campaign id with its own build's (it checks only that an eBay item URL carries a numeric `campid`), so an override in Vercel alone can no longer
   blank the strips; it changes only the site's own search links. The simplest course is to override neither.
   `EBAY_SWEEP_CALLS` (default 2100, clamped to 0..2500) is how many of a run's calls the catalogue sweep may spend (the per-product searches
   get what it leaves); the workflow passes the repository variable of that name to the importer. With the run cap equal to the daily cap, the scheduled run may spend the whole day: to keep room for a manual re-run on the
   same Pacific day, set `EBAY_RUN_CAP` lower (2,200 leaves 300).
4. **Merge to `main`** (GitHub runs scheduled workflows from the default branch only). The schedule is 08:37 UTC daily: **after** eBay's
   daily counter resets (midnight Pacific = 07:00 UTC in summer, 08:00 in winter), so the scheduled run is always the first run of its
   budget day and gets the full run cap, whatever manual runs were made the day before. (An earlier slot, before the reset, was the LAST
   run of its day: a manual "run it now" earlier that day left it only the 400-call slack, and most product strips went dark for ~18 h.)
   It is also a good time for the audience: 09:37 / 10:37 in the UK / central Europe, 19:37 in Sydney, 04:37 in New York, 01:37 in Los Angeles.
5. **Run it now**: Actions → **DexCompare eBay import** → **Run workflow**. Inputs: `only` (a comma-separated
   subset of `chase, sealed, types, sets, sweep, items`; the input's own description predates `sweep`, which it accepts too), `force` (buy every feed again; a normal run does not re-buy a feed whose rows are less than 2 hours old, so an accidental second dispatch, or a re-run after a failure, spends nothing on what is already fresh), `dry_run` (prints the plan and the expected calls: no eBay call, no
   database write), `probe` (measures the catalogue sweep instead of importing: about 60 Browse calls, each reserved against the daily cap,
   match counts and sample titles in the log, **no listing written**; see "The catalogue sweep"). The job runs `prisma db push` first (two new tables, no data loss), and the importer creates the
   tables itself if they are missing. Without the eBay secrets the job writes a skip message to its summary and exits 0.
   A full run makes about 2,500 searches, three at a time (the sweep's pages carry 200 listings each; the job's timeout is 90 minutes). **A manual run prints its budget before the first search**:
   the Pacific budget day, how many Browse calls are reserved so far today and how many are left of the daily cap, the most searches
   this run may make (and which limit that is: run cap, daily room or `--max-calls`), what the plan buys per bucket (the sweep's share, and
   that the per-product searches get what it leaves), how many feeds it
   skips as fresh, and when it stops early; then a progress line every 250 searches (this run's searches and today's total against the
   caps). Its summary shows calls used today, feeds refreshed/failed/skipped per bucket, how many eligible keys the sweep covered (so were
   not searched one by one), items stored, a **Sweep** table per marketplace (products, pages, listings, matched, products found, item feeds
   written, and each query's pages and why it stopped), item feeds in the database, and the oldest row's age. Use `dry_run` first to read
   the budget and the plan without spending anything (the sweep's coverage shows only in a real run).
6. **Vercel needs nothing eBay-related.** `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` are no longer read by the site: remove
   them from Vercel (least privilege). Optional there: `EBAY_LISTINGS=off` (a kill switch: the route answers empty and the
   strips become the plain search row) and `EBAY_LISTING_MAX_AGE_HOURS` (the age bound; default 26). Both need a redeploy, and
   **the edge may keep serving the previous answers for up to an hour** (see "Edge cache and the kill switch").
7. **Check the keys** (prints the token status and, per marketplace, how many listings two searches would keep; counts
   only, never the secrets; 10 calls, not recorded in the daily counter):

   ```bash
   cd apps/dexcompare-sealed
   EBAY_CLIENT_ID=… EBAY_CLIENT_SECRET=… npx tsx scripts/ebay-check.ts            # all five marketplaces
   DATABASE_URL=… npx tsx scripts/ebay-budget.ts                                  # read-only: today's counter, feeds, their ages, rows
   DATABASE_URL=… npx tsx scripts/ebay-import.ts --dry-run                        # the plan and the capacity model, no network, no writes
   DATABASE_URL=… EBAY_CLIENT_ID=… EBAY_CLIENT_SECRET=… npx tsx scripts/ebay-sweep-probe.ts --pages 2 --max-calls 60
                                                    # the probe (what the workflow's `probe` runs): ~60 reserved calls, writes no listing
   ```

### How it works

* **Feeds.** A feed is up to 8 stored listings (a strip shows six, the slim one four, a product grid's in-feed tiles the sealed feed's seventh and eighth), keyed `<marketplace>|<kind>[:<arg>]` in `EbayListing`:
  `EBAY_US|chase`, `EBAY_AU|sealed`, `EBAY_GB|set:surging-sparks`, `EBAY_US|type:booster-boxes`, `EBAY_US|item:<productId>`.
  Marketplaces: au+nz share `EBAY_AU`, us+sg share `EBAY_US`, uk `EBAY_GB`, ca `EBAY_CA`, eu `EBAY_DE` (NZ and SG have no
  affiliate programme of their own). Rows hold the title, the eBay photo URL (upgraded from `s-l225` to `s-l500`), the
  price exactly as eBay returned it, the first shipping option, the condition and the affiliate URL; `EbayCallDay` holds one
  counter per budget day.
* **The route** `GET /api/ebay/<region>?c=<context>` reads the rows for the feeds a context maps to and answers with the
  first feed that has at least two live rows (a CASCADE): `item:<slug>` → the product's feed, then its type's, then sealed;
  `set:<slug>` → the set's feed, then chase; `type:<slug>` → the type's feed, then sealed; `chase` and `sealed` stand alone. Generic
  sealed (boxes, ETBs, UPCs) stands in only for the box-class types (`ALWAYS_TYPES`: booster boxes, ETBs, cases, UPCs, Build & Battle
  Stadiums): a pack, tin or blister page never borrows box listings, it shows the compact search row. **Every product page asks for
  `item:<slug>`**, whatever its price: the sweep writes item feeds for cheap products too.
  One indexed query (a unique-index lookup of the product first, for `item:` only). The response is
  `{ feed, items, fetchedAt (the OLDEST row used), maxAgeMs, reason? }`: whitelisted fields only. Region and context are
  whitelists (a product slug is checked against the database), the SQL is parameterised, an unknown product or a missing
  table answers "empty" with no error text. CDN cache: an hour, then stale-while-revalidate (10 minutes for an empty answer; see
  "Edge cache and the kill switch").
* **The strips** (`src/components/EbayStrip.tsx`): the server-rendered page holds only the compact search row inside an
  invisible, strip-sized box (no layout shift); within about 300 px of the viewport the strip fetches and replaces it. Six
  tiles (four in the slim strip above the footer; a scroll-snap row inside itself on phones), the whole tile one sponsored
  link, a thumbnail that hides its tile if it fails to load, shipping called out ("Free shipping" in green, or "+ A$12.00
  shipping"), the condition when it is not new, and the disclosure under the row. A product page's own listings say "Lowest price first,
  before shipping" (they are stored in that order). **New Zealand and Singapore** are served the Australian and US feeds, whose shipping was
  priced to Australia and the US (and the items may not ship to NZ or SG at all): their tiles make **no shipping claim**, only "Shipping on eBay"
  (never "Free shipping" or a cost), and the disclosure under the strip says "These are eBay Australia listings ... delivery to New Zealand is not
  shown here" (eBay US / Singapore for SG).
* **Placement rules** (`src/lib/ebay-ads.ts`, tested): at most one unit in a phone viewport and two on a desktop one (the
  header's own "eBay" item is always one of the two on xl and up). On set, type and browse pages the strip sits on a row of its own **after
  the first four products** (one row on a desktop, two on a phone), not above them: at the top it filled half the first screen, pushed the
  list below the fold and became the page's largest paint on a slow phone. Store directory and store pages carry theirs after the list. A region's
  home page carries two strips (chase cards under the stats row, sealed after the first rail) and no strip above the footer: a feed holds 8
  listings, too few for a third unit of four tiles the page does not already show.
  The in-feed listing tiles sit in the product grids of the browse, set, type and deals pages (ad-labelled, framed cards the size of
  a product card, every 16 products, at most two): there an eBay listing is a neighbour of the products the page lists; it is not a
  table row and is visibly marked, but if eBay's "visually isolated" reading is strict, drop the `tiles` prop from those
  `<ProductGrid>`s (the grids then render none). On a product page: sold out, the callout's eBay box is the first-screen unit and
  the strip sits below the price table and the in-stock alternatives (`soldOutAdPlan`); in stock, below the offer table where the
  page is long enough, else at the bottom in place of the pre-footer strip. A page too short for its units drops the pre-footer
  strip (`<NoPreFooter/>`).

### Edge cache and the kill switch

`/api/ebay` answers are cached at Vercel's edge (`src/lib/ebay-route.ts`):

| Answer | `Cache-Control` | Meaning |
| --- | --- | --- |
| listings | `public, max-age=60, s-maxage=3600, stale-while-revalidate=82800` | browsers 1 minute; the edge 1 hour, then it may serve that copy while it fetches a fresh one, for up to 23 more hours |
| empty, failed or rejected | `public, max-age=30, s-maxage=600` | browsers 30 s; the edge 10 minutes; never served stale |

It was 5 minutes (60 s for an empty answer). The rows change once a day, and every product page asks for its own `item:<slug>`
context, so most of that long tail missed the edge and read Neon (two small queries, ~5 KB) on nearly every view. What the longer
cache means:

* **A fresh import reaches a given edge within about an hour** (the first request after the hour may still get the old copy while
  the edge refreshes it). Nothing unsafe is shown meanwhile: the browser checks every answer, a stale copy included, against the
  age bound it carries, so no listing older than 26 hours (5.5 in compliant mode) is ever displayed; a copy whose rows crossed
  the bound shows the compact search row until the edge has the new one.
* **The kill switch takes up to an hour too.** `EBAY_LISTINGS=off` (and a changed `EBAY_LISTING_MAX_AGE_HOURS`) needs a redeploy;
  Vercel normally serves a new deployment from a cache of its own, so the redeploy usually takes effect at once, but plan on **up
  to an hour** before no edge or browser shows listings (a tab already open keeps what it loaded until the age bound or a reload).
  If it must be immediate, also purge the CDN cache in the Vercel dashboard where the plan offers it.
* To go back to the short cache, change `GOOD` and `SHORT` in `src/lib/ebay-route.ts` (and their exact strings in
  `tests/ebay-route.test.ts`).

### The catalogue sweep

**Why.** One search per product costs one Browse call per (marketplace, product), and there are far more keys than calls: that plan
reached 1,735 of the 7,701 eligible keys a day (capacity model below), and on 2026-10-10, 762 of its 1,735 searches (**44%**) came back
with nothing (the query required "sealed", which many sealed listings never say; it no longer does), so 973 products got listings of their
own. Every other product page showed its type's strip, and packs (never eligible) and anything under US$25 were never searched at all.
The sweep turns it round: **one call can feed dozens of products.**

**What it does** (`src/lib/ebay-sweep.ts`). Per marketplace it pages 30 broad searches (`SWEEP_QUERIES`: "Pokemon elite trainer box",
"Pokemon booster box", "Pokemon tin", "Pokemon premium collection", "Pokemon battle deck"…) **200 listings a call** (eBay's maximum,
paged by `offset` to eBay's 10,000-deep limit), round-robin (page 1 of each, then page 2 of each that is still finding listings…), and
runs every listing through the repo's own classifier (`identify()`, the one the store import files products with) to hand it to the
product it IS:

* a set product (booster box, ETB, bundle…, a UPC with a canonical key): the listing's group key is exactly the product's;
* a collection, tin, blister or deck: the same type, sets that do not disagree, every identifying word of the product in the title, and
  no other word that names some product of that type anywhere in the catalogue (seller filler such as "fast" or "NIB" is fine; "mini",
  "super" or another Pokémon is not: that listing is a different product); the most specific product wins and a tie is refused;
* never: several units ("10-Pack", "Full Set", "All 3"), a variant left to chance ("Assorted", "chosen at random"), Japanese product
  naming, damage notes, a used condition or a price under the type's floor, on top of what the item feeds already refuse (singles, lots,
  pre-sales, other languages, converted prices).

A product keeps up to 8 listings, de-duplicated, **lowest price first**, and one found with **one or more** gets an item feed
(`EBAY_US|item:<productId>`: the same feed a per-product search writes, so the route, the strip and EPN's `dex-<market>-item` are
unchanged), cheap products included. A query stops at the end of its results (`end`), after two pages in a row that added nothing to a
product with fewer than six listings (`dry`, never before its second page), at the 10,000-deep limit (`depth`), when its marketplace's
share is spent (`budget`) or on an error. The sweep's calls are shared between marketplaces by how many products each lists x its audience
weight (with a floor of about 8% each), in the order US, UK, EU, AU, CA; what one leaves unspent goes to the next, and each marketplace
starts with its **hot pass** (see "Priorities: markets and hot sets" below). Every page is one Browse call **reserved in the database
before it is made**, through the same strict run cap, retry allowance and circuit breaker as every other search. Feeds are written 100 to a
transaction (`replaceFeeds`: the feeds' advisory locks in sorted order, one `DELETE`, one `INSERT`), and what the pages found is written
even when the run stops part-way (every row is a real, current listing). A marketplace with many item feeds refreshed within the
skip-fresh window (at least 50, or a quarter of its products if that is more: a re-run, an overlapping run) is not swept again unless `force`.

**A run, in order:**

1. the fixed feeds: chase, sealed, types, sets (265 calls);
2. the sweep, marketplace by marketplace (US, UK, EU, AU, CA), up to `EBAY_SWEEP_CALLS` (default **2,100**) of what the fixed feeds leave,
   each marketplace starting with the hot sets' own searches (at most half its share);
3. per-product searches ("Pokemon <cleaned name>") **only for products the sweep did not cover**, with whatever is left of the run cap
   (about 135 at the defaults when the sweep spends its whole share, more when its queries stop early): first the **hot-set products of
   the US, UK and EU** (any type, any price), then the eligible keys, most valuable first.

Defaults: `EBAY_DAILY_CAP` **2,500** (also the maximum; this site's share of the keyset, see the box at the top), `EBAY_RUN_CAP` **2,500**,
`EBAY_SWEEP_CALLS` **2,100** (new, optional repository variable; it was 1,800 on the first run, when the 408 per-product searches after the sweep found listings for only 150 products against the sweep's 4,673 from 1,800 calls).

**The probe** (`scripts/ebay-sweep-probe.ts`, the workflow's `probe` input): about 60 Browse calls (20 pages on EBAY_US, 10 on each other
marketplace), each reserved against the daily cap like the importer's; it prints per marketplace the pages, listings, how many matched,
the products with ≥ 1, ≥ 2 and ≥ 6 listings, why each query stopped, and sample titles that matched or did not, and **writes no listings**.
Its run of 2026-10-11:

| Marketplace | Pages | Products with ≥ 1 listing | With ≥ 2 |
| --- | ---: | ---: | ---: |
| EBAY_US | 20 | 430 | 208 |
| EBAY_GB | 10 | 266 | 121 |
| EBAY_AU | 10 | 303 | 130 |
| EBAY_CA | 10 | 197 | 70 |
| EBAY_DE | 10 | 154 | 61 |
| **all** (product keys) | **60** | **1,350** | **590** |

So 60 sweep calls would have written 590 item feeds, against 973 from 1,735 per-product searches the day before. **Canada is lower by
design**: 65% of EBAY_CA's listings carried prices eBay had converted from USD (US sellers), and the importer refuses a converted price
(prices are shown exactly as eBay returns them, in the marketplace's currency). **The EU (EBAY_DE) is lower** because about half its
listings were German- or Japanese-language product, which the classifier refuses. eBay's own totals explain the query list: a bare
"collection" matched about 803,000 US listings and "deck" 179,000, mostly loose-card lots, so collections and decks are searched by the
words their products use ("premium collection", "battle deck"…).

**The first full run** (2026-10-11, workflow run 38120236337: 2,473 of 2,500 calls, 14 minutes, 1,800 of them sweep pages):

| Marketplace | Products | Sweep pages | Listings read | Matched | Item feeds written |
| --- | ---: | ---: | ---: | ---: | ---: |
| EBAY_US | 2,538 | 561 | 112,054 | 24,173 | 1,402 (55%) |
| EBAY_AU | 2,339 | 321 | 64,100 | 7,681 | 880 (38%) |
| EBAY_GB | 2,169 | 322 | 64,396 | 10,789 | 967 (45%) |
| EBAY_CA | 3,526 | 403 | 80,499 | 3,410 | 907 (26%) |
| EBAY_DE | 1,593 | 193 | 38,228 | 2,251 | 517 (32%) |

Item feeds in the database went from 983 (the day before) to **4,886**; the 408 per-product searches that followed found listings for 150
products. A sample of 280 live product pages read straight after: 64% showed the product's own listings, 15% its type's, 21% nothing (a
product eBay does not list in that marketplace, of a type with no type feed). Six US queries stopped at eBay's 10,000-deep limit while still
finding products, so the series-narrowed queries were added, and the sweep's default share went from 1,800 to 2,100.

How many products a full sweep covers is known only from a live run: read the run summary's **Sweep** table. `--dry-run`
shows the sweep's share of the cap and the per-product pre-plan, not the sweep's coverage. Nothing here changes the licence handling
below: the sweep is the same FIXED_PRICE Browse search, its listings go only into item feeds shown in their own labelled units, the
affiliate URL is stored exactly as eBay returns it with our campaign id, converted prices are refused, its counts appear only in the
job's log and summary (never on the site), and its rows are hidden and purged on the same age bound.

### Priorities: markets and hot sets

The owner's priorities live in one small file, **`src/lib/popular.ts`**, which the importer reads (and the pages too: they highlight a
hot product's eBay link). Nothing in it raises a cap: the hot sets' sweep pages come out of the sweep's `EBAY_SWEEP_CALLS` share, and
their per-product searches out of what the sweep leaves.

* **Markets.** `PRIORITY_MARKETPLACES` is US, UK, EU (eBay.de). Every part of the run goes in the order **US, UK, EU, then AU/NZ, CA**
  (`MARKETPLACE_ORDER` in `src/lib/ebay-import.ts`): the fixed feeds (so a cap hit drops Canada's before the US's), the sweep's
  marketplaces, and the per-product searches. The audience weights (`MARKET_WEIGHT` in `src/lib/ebay-context.ts`: **US 1, UK 0.7,
  EU 0.7, AU/NZ 0.35, CA 0.25**) size each marketplace's share of the sweep (the products it lists x its weight, at least about 8%
  each) and rank the eligible per-product searches. With the product counts of 2026-10-11 that is about 37% of the sweep for the US,
  22% for the UK, 16% for the EU, 12% for AU and 13% for CA (it was 33 / 17 / 8 / 18 / 23% before), and what one marketplace leaves
  unspent rolls on to the next in that order. (Arithmetic from the counts, not yet a measured run: read the next summary's Sweep table.)
* **Hot sets.** `HOT_SETS`, most wanted first: 30th Celebration (`cel30`), then Pitch Black, Chaos Rising, Ascended Heroes, Prismatic
  Evolutions, Perfect Order, Phantasmal Flames and 151. They go first twice:
  1. **In the sweep.** Each marketplace starts with a **hot pass**: for each hot set in that order and each product type that
     marketplace's own regions list for it, one search, "Pokemon 30th elite trainer box", "Pokemon 30th booster pack", "Pokemon pitch black booster
     box"... (an ETB and a Pokémon Center ETB share one; a case is its box's words + "case"), paged 200 listings a call with the same
     stop rules and the same matching as every sweep query. The hot pass may spend at most **half** the marketplace's share (in pages);
     the general queries get the rest, so they are never starved. A set whose release date is still to come is skipped.
  2. **In the per-product searches.** Every hot-set product listed in the **US, UK or EU** that the sweep did not cover (and whose feed
     was not refreshed in the last 2 hours) is searched on its own ("Pokemon <cleaned name>", with a set in `HOT_SET_QUERY` searched by
     its keyword: "Pokemon 30th Elite Trainer Box", "Pokemon 151 Booster Bundle"), by hot rank, then US, UK, EU, then price, **before any
     other product, whatever its type or price**: booster packs and cheap products too (the eligibility rule below applies only to the
     others). A set not out yet is skipped here too. These searches refuse what the sweep refuses: lots and multi-pack listings ("5
     Booster Packs"), part of a product, random variants, Japanese naming, damage.
* **The run summary's "Hot sets" table**: per hot set and marketplace (US, UK, EU), the products with an item feed the site still shows
  after the run (younger than the age bound) / the products of that set the marketplace lists, and one line with how many hot products the sweep covered, how many were
  fresh, and how many were searched one by one (and found listings). The Sweep table's "Hot-set pages" column is the hot pass's pages
  per marketplace. Counts only, like the rest of the summary.

**To change them**, edit `src/lib/popular.ts`; the next run uses it (its first log lines print the order and the hot sets: "Priorities
(src/lib/popular.ts): ..."):

* `HOT_SETS`: set codes as in `src/lib/sets.ts`, most wanted first. Keep it short: each hot set adds a sweep query per product type
  it has in every marketplace (a page each at least) and puts its unswept US/UK/EU products ahead of every other product's search.
  A code whose set is not out yet does nothing until its release date.
* `HOT_SET_QUERY`: the eBay keywords for a hot set whose sellers do not write its `sets.ts` name. eBay requires every keyword, so
  "30th Celebration" would miss the listings titled just "30th Anniversary"; `cel30: "30th"` finds those, "30th Anniversary
  Celebration" and "30th Celebration" alike (`sv3pt5: "151"` likewise: sellers rarely write "Scarlet & Violet 151"). Any other hot set is searched by its name, accents folded and "&" dropped.
* `PRIORITY_MARKETPLACES`: which eBay sites come first, in order (the weights are `MARKET_WEIGHT`).

### The import's plan, caps and failure handling

Priority order (spent until the run cap; a cap hit drops the **least valuable**, never a hole in the middle):

| # | Bucket | What | Calls |
| --- | --- | --- | ---: |
| 1 | chase | generic chase cards, 8 queries round-robin per marketplace | 40 |
| 2 | sealed | generic sealed Pokémon, 6 queries per marketplace, kept only if `identify()` accepts the title | 30 |
| 3 | types | one query per high-value type (booster boxes, ETBs, Pokémon Center ETBs, UPCs, booster-box / ETB / bundle cases, Build & Battle Stadiums, collections) | 45 |
| 4 | sets | chase cards of the 30 most recently released sets (never a series-named or common-word set), one query each | 150 |
| 5 | sweep | the catalogue sweep (above): per marketplace (US, UK, EU, AU, CA) the hot pass, then 30 broad queries, 200 listings a call, an item feed for every product found | up to 2,100 (`EBAY_SWEEP_CALLS`) |
| 6 | items | one query per (marketplace, product) the sweep did **not** cover: first every **hot-set** product of the US, UK and EU, then every **eligible** product: "Pokemon <cleaned name>" (no "sealed": eBay requires every keyword) | what is left (~135) |

The plan reserves the sweep's share after the fixed feeds; the item feeds it lists are a pre-plan, and the run buys them only for keys
the sweep missed, sized to what the sweep actually left.

* **Eligible products** (the per-product searches only; the sweep has no eligibility rule, only each type's price floor). Always (from US$25): booster box, booster-box / ETB / bundle case, ETB, Pokémon Center ETB,
  Ultra-Premium Collection, Build & Battle Stadium. Only from a best-known price of about **US$50** (the **core**): collection,
  tin, deck, booster bundle, Build & Battle box, blister. **Never**: booster packs and sleeved boosters, or anything under
  **US$25**; a reference price over US$600 for those gated types is a placeholder ask ("CA$9,999" blisters are in the data) and is
  not eligible. Best-known = the market's cheapest open price, else its cheapest listed (sold-out) one; only regions where the
  product has a `ProductStat` row count, and a marketplace takes the higher price of its regions. Core keys are bought first;
  if budget remains, the **extension** (US$25-50) follows, downward by price. Within a tier, keys are ranked by reference
  price (US$) x market weight (US 1.0, UK 0.7, EU 0.7, AU/NZ 0.35, CA 0.25: `MARKET_WEIGHT`), sold-out products x1.5 (highest intent).
  The hot-set products of the US, UK and EU are searched before all of them, whatever their price (next section).
  Thresholds in each market's money (the importer's rough FX table, never shown): **US$50 = A$75 / NZ$82.50 / US$50 / £39 / C$68.50 / €45 / S$65**, and
  **US$25 = A$37.50 / NZ$41.25 / US$25 / £19.50 / C$34.25 / €22.50 / S$32.50**.
* **Relevance** (`src/lib/ebay-normalise.ts`): a listing is kept for a product only if the repo's own title classifier accepts it as
  sealed Pokémon and says the same **type and set** (a set product's identity is exactly that); for collections, tins, decks and
  blisters the classifier's identifying words must all be in the title, with nothing extra but seller filler ("fast", "USA",
  "NIB"…). Singles, cases when the product is a box, lots, empty or opened boxes, damaged ones, other languages and other
  sets or types are refused, and so is anything under the type's price floor. Up to 8 de-duplicated listings are stored,
  **lowest price first** (the strip says nothing more than "before shipping": never "cheapest" or "deal"). Chase feeds keep the
  junk / counterfeit / language filters of the previous round. The sweep matches with the same classifier, plus the rules in "The
  catalogue sweep" above.
* **Caps.** The run cap is `min(EBAY_RUN_CAP, what is left of today's daily cap, --max-calls)` and is a **strict upper bound on the searches of
  a run, retries and the repeat after a 401 included** (a search is claimed against it before it is made, so three workers cannot overshoot;
  retries therefore take their calls from the least valuable feeds at the end of the plan). The daily cap
  (`EBAY_DAILY_CAP`, default and maximum 2,500: this site's half of eBay's 5,000 default for a keyset it shares with the owner's other
  site; with the run cap also at 2,500 there is no slack for a manual re-run on the same Pacific day unless `EBAY_RUN_CAP` is set lower) is kept in the
  database, per **budget day = the Pacific day** (eBay's limit resets at midnight Pacific; the official page was not readable
  from the build sandbox, a third-party summary says "midnight Pacific Time", and eBay's own field documentation says the reset is "current time
  plus the time window", which some developers see at other times than midnight: **this boundary is an assumption**. `scripts/ebay-check.ts`
  prints eBay's own counter and reset time from the Analytics API's `getRateLimits`: compare it with 07:00/08:00 UTC once. The counter also cannot see
  the owner's other site's calls on a shared keyset: see the box at the top of this section.)
  **Every Browse search reserves its call first with ONE atomic statement**:

  ```sql
  INSERT INTO "EbayCallDay" ("day","total","updatedAt") VALUES ($day, $n, now())
  ON CONFLICT ("day") DO UPDATE SET "total" = "EbayCallDay"."total" + $n
    WHERE "EbayCallDay"."total" + $n <= $cap
  RETURNING "total"
  ```

  so overlapping runs and manual dispatches can never pass the cap between them (verified at the then-default cap of 2,400: three runs
  started together made 2,400 searches between them, equal to the counter and to the mock's own count). The catalogue sweep's pages go
  through the same reservation. Token requests are identity-API calls, not Browse searches: nothing in eBay's documentation says they
  count. If they do, they are one or two a run outside both sites' caps, and with both sites at 2,500 the keyset has no slack left for
  them: a day on which both spend their whole share could meet a 429 at the very end (the run stops and keeps the previous rows).
* **Failures.** Concurrency 3; **a circuit breaker protects the daily budget**: a 403 (or a 401 that survives the token refresh: no Buy API
  access) stops the run at once, **6 searches in a row that fail** (a 400 or 5xx after its retry, malformed JSON, or HTTP 200 with no listings and a
  warning from eBay) stop it, and so do 30 in a row that come back with no listings at all; each ends with one `::error::` that names only the error
  category (`search-http-403`, `search-malformed`, `search-warning`) and exits 1, so a persistent failure costs a handful of calls, not the run cap; a run that
  ends by using up its retry allowance reports "retries", one that reaches its cap "cap". A **feed refreshed in the last 2 hours (a quarter of the
  bound at most) is not bought again** (an accidental second dispatch, an overlapping run, a re-run after a crash; `force` overrides), so reruns
  spend their calls further down the plan. Two runs replacing the same feed take a Postgres advisory lock per feed. Retries count inside the run
  cap (at most 5% of the plan plus 5); the daily cap holds regardless. A search gets one retry on a 5xx or a timeout; a 400 on a search that carries a price
  filter retries once without it (the `[N..]` range syntax could not be exercised without keys); a **429 stops the whole run**
  (logged, previous rows kept); a **token failure fails the run** (`::error::` with only eBay's OAuth category, e.g.
  `token-http-401:invalid_client`, never a secret, id or eBay's own text); fewer than half of the planned feeds refreshed fails
  the run (planned = the fixed feeds and the per-product searches the run actually made room for; the sweep's feeds are counted in its
  own table, and the search of a hot-set product that is not an eligible key (a booster pack, a cheap product) in the "Hot sets"
  lines: it is best effort, and a pack eBay does not list must not fail the job). A feed is replaced only after a successful, **non-empty** normalisation; an empty or failed one keeps its old rows
  until the bound. The sweep writes a product's feed when it found at least one listing for it (one listing is still that product's
  eBay price: the route answers a product's own feed from one row, any other feed from two); a product it did not find is searched
  on its own if it is a hot product or eligible and the budget reaches it, and otherwise keeps its old rows until the bound (its page
  then falls back to its type's strip).

### Capacity model: the per-product plan alone (local data, 2026-10-07)

This is the plan **before the catalogue sweep** (one search per eligible key, a 2,000-call run cap, a 2,400 daily cap): the arithmetic
that made the sweep necessary. From the full local database (6,684 products, 14,166 product x region rows), `npx tsx scripts/ebay-import.ts --dry-run`:

| Bucket | Feeds | Calls |
| --- | ---: | ---: |
| chase | 5 | 40 |
| sealed | 5 | 30 |
| types | 45 | 45 |
| sets | 150 | 150 |
| **fixed** | **205** | **265** |
| items wanted | 7,701 (4,848 core + 2,853 extension; 4,357 distinct products) | 7,701 |
| items bought at a 2,000-call run | **1,735** (35.8% of the core keys, 22.5% of all) | 1,735 |

**Do ALL eligible keys fit, one search each? No.** All core keys need 265 + 4,848 = **5,113** calls a day; every eligible key (extension too)
needs **7,966**. One run was capped at 2,000 and the day at 2,400 (and eBay's own default limit is 5,000 a day for the whole
application, shared with the owner's other site), so a day covered about 1,735 of them (and on 2026-10-10, 44% of those searches came back empty). The extension (US$25-50) is not
reached at all at a 2,000-call run, and the cheapest key bought was about US$100. By marketplace (covered / eligible product keys):
US 690 / 1,947 (35%), AU+NZ 399 / 1,715 (23%), CA 363 / 1,895 (19%), UK 144 / 971 (15%), EU 139 / 1,173 (12%). By type
(covered / eligible): booster-box cases 113/113, ETB cases 155/155, bundle cases 61/61, Ultra-Premium Collections 53/70,
Booster Boxes 205/260, Pokémon Center ETBs 99/145, Build & Battle Stadiums 14/48, ETBs **123/293**, collections 571/2,956,
tins 163/1,870, blisters 84/806, decks 69/650, Build & Battle boxes 18/146, booster bundles 7/128. Weighted by reference price x
market weight x sold-out boost (a proxy: there is no traffic data), the plan covers **82%** of the eligible weight; every key
of US$500 or more (642) is covered, 1,458 of the 1,640 keys of US$200 or more. Sold-out products: 697 of 3,857 eligible keys
covered. The weighting is a price proxy, not traffic: **ETBs, the most-searched product, are only 42% covered** because they are
cheap next to cases and boxes; if that matters, raise their rank (a per-type multiplier in `itemKeys`).

Since 2026-10-11 the caps are 2,500 and the sweep (above) covers products in bulk; the per-product searches keep this ranking but get
only what the sweep leaves (~135 calls), for the eligible keys it missed. `--dry-run` still prints this capacity model, but for that
per-product **pre-plan** (sized after the sweep's reservation), so its "covered" counts leave out everything the sweep will cover: the
coverage that counts is a real run's (item feeds in the database, from the sweep and from per-product searches, and the Sweep table).
What would cover more: `EBAY_SWEEP_CALLS` higher where the Sweep table shows queries stopping on `budget`,
dropping the sets bucket (`only: chase,sealed,types,sweep,items`: +150; an `only` list without `sweep` skips the sweep), or the Application
Growth Check (below), which raises the 5,000/day limit.
A product with no feed of its own still shows its type's listings (or, for box-class types, generic sealed); a type with none shows the
compact search row.

### Troubleshooting

* **`token-http-401:invalid_client`**: the id or secret is wrong, a Sandbox keyset, or the keyset is not enabled for Production.
* **Searches answer 403**: the keyset has no Buy API access yet (apply from the application's page). The run stops after the first refusal (the
  circuit breaker), so it costs a handful of calls, not the day's budget. the same breaker stops the run after "6 searches in a row failed" or "30 in a row returned nothing" (a rejected filter, a changed response).
* **What EPN reports for listing tiles**: the importer asks eBay for `affiliateReferenceId=dex-<market>-<feed kind>` on every search, eBay puts it
  in the URL's `customid`, and the site uses that URL exactly as eBay returned it (eBay's spec says to; nothing in the browser edits it). So EPN's
  report by custom id shows `dex-us-chase`, `dex-au-item`, `dex-uk-set` and so on: earnings by marketplace and feed kind, **not by page**. If
  you see only `dex-listings` or no custom id, eBay did not echo the reference: check one stored URL (`SELECT "url" FROM "EbayListing" LIMIT 3`)
  and the importer's request header; the campaign id, and so the earnings, are unaffected either way. Which surface earned is in Vercel's
  `buy_click` placement.
* **The route is public**: each distinct `?c=` value that is not cached reaches the database once an hour per edge (10 minutes for an empty answer); CDN caching covers the repeats. Put a Vercel
  Firewall rate limit on `/api/ebay/*` (Security → Firewall → Rate limiting) if its traffic ever looks abnormal; each answer reads at most 8 rows
  (about 5 KB).
* **A 429 in the log**: eBay's daily or burst limit; the run stopped and kept the old rows. Check the other site's use of the same keyset.
* **Fewer product strips than expected**: read the run summary's Sweep table. A marketplace whose queries stopped on `budget` wanted more
  calls (`EBAY_SWEEP_CALLS`); `dry` or `end` means its searches ran out of new products; a low "matched" next
  to many listings means the classifier refused them (run the `probe` input and read its MISS / AMB samples). Canada and the EU are lower by
  design: eBay-converted prices and German- or Japanese-language listings are refused.
* **Scheduled runs can be delayed or skipped by GitHub** (and are disabled after 60 days without repository activity). Rows older
  than the bound simply stop showing (the strips become the search row): that is the intended failure mode, not an error.
* **The strips show only the search row**: nothing imported yet, the kill switch is on, or the rows are older than the bound;
  `scripts/ebay-budget.ts` shows which. Vercel's function log shows a Prisma "relation does not exist" line for each uncached
  request until the first import has created the tables: harmless.
* **Application Growth Check**: developer.ebay.com → your application → "Application Growth Check" raises the 5,000/day limit after eBay
  reviews that the application follows the License Agreement and uses the API efficiently; it will look at the six-hour rule.

### eBay's rules, and how each is met

| Rule (source) | How |
| --- | --- |
| "Displayed item listing information may not be more than six (6) hours older" (prong 1) and "other eBay Content ... no more than twenty-four (24) hours older" (prong 2) (API License Agreement 8.1(c), "Age of Displayed eBay Content") | **Not met in the default daily mode** (26 h bound): disclosed ("Updated 9 h ago", "imported about once a day"), bounded (26 h), and switchable to a compliant mode (above). The growth release shows listing prices on more surfaces (sold-out box, Marketplaces panel, buy bar, grid tiles), each with the listing's age; the hour of edge caching never shows a row past the bound (the browser re-checks it) |
| Delete copies when no longer required (3.1(b)); delete eBay Content that is no longer publicly available (8.1(b)(1)) | Rows are deleted when older than the bound + 4 h, by the importer (start and end of each run) and the store import; a refresh replaces, never appends; no history |
| eBay content not "co-mingled or combined with non-eBay Content" (8.1(b)(2)) | **Not met on the product page, by the owner's choice (2026-10-11, widened by the growth release, 2026-10)**: the product's cheapest eBay listing is a row of the store price table (`listings-offer-row`), ranked by price among the stores, because DexCompare compares websites and eBay is one; when that listing is cheaper than every in-stock store it counts as the product's best price (`listings-best-price`). The growth release extends the same listing (the same request, `useEbayPick`; never a second fetch) to three more places beside store content: the **sold-out box** shows its price (`listings-soldout-best`), the **Marketplaces panel** shows its price when the card is not already eBay (`listings-marketplace`), and the phone **buy bar** repeats whichever of those the top of the page shows (`product-sticky`). The in-feed **grid tiles** sit among product cards (framed, labelled, never in a table). Mitigations: every one is visibly eBay's (tint or frame, eBay-blue button, the eBay wordmark, "Ad", the listing's age) and the listing is never counted (store count, median). Strips still hold eBay listings only, in a dashed unit of their own. **To go back, per surface**: the table row and the card: drop `ebay=` from the product page's `<OfferTable>` (the row and its note go with it) and pass `ebay={null}` to its `<BestPriceCard>`; the sold-out box: remove `<SoldOutEbay>` from the callout (`src/components/Marketplaces.tsx`), leaving the server's `soldout-ebay` search button; the panel: remove `<PanelEbayPrice>`, leaving the `product-marketplace` search row; the buy bar: give it no eBay listing (it then repeats the store, TCGplayer or the eBay search), or remove `<StickyBuyBar>` from the product page; the grid tiles: drop the `tiles` prop from the `<ProductGrid>`s |
| No derived statistics (8.1(d)) | None: no average, median, "% below"; prices shown as returned, never converted, counted, averaged, or in JSON-LD, meta, OG or the sitemap; the exceptions, the owner's calls: the price table's eBay row (above) is placed by its price among the stores', and when it is the cheapest it is the best price, with that card's per-pack price and median/MSRP comparisons computed from it in the browser (`listings-best-price`); never a count or a median, never server-rendered; the order within a product's feed is "lowest price first, before shipping" (shown on the strip) and says nothing else; the catalogue sweep's counts (listings matched, products found) stay in the job's log and summary, never on the site |
| "Only surface FIXED PRICE items"; eBay's own image; shipping separate; "indicate when the item is not new" (Buy APIs Requirements) | `buyingOptions:{FIXED_PRICE}`; `*.ebayimg.com` thumbnails as plain `<img>`; the first shipping option is shown on the tile; the condition is shown when it is not new |
| Use the URL returned in `itemAffiliateWebUrl` | Every link is that URL **exactly as returned** (the importer checks it is one eBay item page with our campaign id and stores eBay's own string; the browser checks an eBay item URL with a numeric `campid` and changes nothing in it). `customid` is the per-feed `affiliateReferenceId` the importer sent (`dex-<market>-<feed kind>`). Only when eBay sends no usable one is `itemWebUrl` tagged with the same EPN parameters |
| 5,000 calls/day default (API call limits), per application | Daily cap 2,500 (also the maximum: this site's share of a keyset shared with the owner's other site) for THIS site's runs, every call (sweep pages included) reserved atomically in the database before it is made; **the counter cannot see another site on the same keyset** (box at the top of this section) |

### The eBay wordmark

Every strip starts with the multicolour "ebay" wordmark as small inline text (`src/components/EbayMark.tsx`: e #e53238, b #0064d2,
a #f5af02, y #86b817, `aria-label="eBay"`): **one swappable component**. The owner chose a wordmark style; eBay Partner Network's brand
guidelines apply to how its marks are shown (clear space, no recolouring, no implied endorsement): check them in EPN Campaign
Manager before changing its size or colours, and swap the file's body for eBay's official logo artwork if EPN asks for it.

### Not verified without real keys

The exact `price:[N..]` filter syntax (a 400 retries without it), the real response shape of `shippingOptions` for every
marketplace (a missing cost shows "Shipping on eBay"), that `i.ebayimg.com` serves `s-l500` for every photo (eBay's own pages
use it; a tile whose picture fails hides itself), which keys eBay counts as "Browse" calls, and the Pacific reset time itself.
Run `scripts/ebay-check.ts` once the keys are in, then one manual import, and read its summary.

## Checking it works

- `https://www.dexcompare.app/au` shows products, "Last checked" a few minutes/hours ago.
- `https://www.dexcompare.app/sitemap.xml` lists eight files, and
  `/sitemap/2.xml` (US) has a couple of thousand `/us/p/…` URLs. A regional
  file with no products means the database is empty or unreachable (the build
  writes empty regional files when it cannot reach the database, and a preview
  build always does; the first
  import's page refresh fills them).
- `view-source:` of any page: `<link rel="canonical">` and every `hrefLang`
  say `https://www.dexcompare.app/…`. If they say another host, fix
  `NEXT_PUBLIC_SITE_URL` and redeploy.
- `/AU` answers 308 to `/au`; `/foo` answers 404 with the branded page.
- A product page lists stores with *In stock* / *Sold out* and "checked … ago".
- `/us`, `/us/deals`, `/us/cheapest-packs`, `/us/this-week`, `/us/guides` and one guide, an in-stock and a sold-out product,
  and `/api/browse/us` answer 200; `view-source:` of any of them holds no `ebayimg.com`, no `/itm/` and no eBay price (eBay
  data only ever arrives in the browser).
- `curl -sI "https://www.dexcompare.app/api/ebay/us?c=sealed"` shows `cache-control: public, max-age=60, s-maxage=3600,
  stale-while-revalidate=82800` (or `public, max-age=30, s-maxage=600` while the feed is empty), and a second request within the
  hour answers `x-vercel-cache: HIT` (the edge may rewrite the header it passes on, so if it looks different, read it in the
  Vercel function logs).
- Neon → Monitoring → **Network transfer**: expect a small fraction of the
  5 GB allowance; each import reads well under 10 MB, and each page render
  reads only its own product or region.

## Egress of the new routes (the growth release)

Neon transfer per uncached render (pages are ISR: rendered once after each import, `revalidate` 86400), estimated from each
query's row cap and its card columns:

| Route | What it reads | Per render |
| --- | --- | ---: |
| `/<region>/deals` | `dealsInMarket` (≤ 96 rows, take 48 after ranking), `perPackLeaders` (≤ 200 rows), US: `belowMsrpUS` (120 rows) | about 60 KB |
| `/<region>/cheapest-packs` | `perPackLeaders` (≤ 200 rows, one window query) | about 45 KB |
| `/<region>/this-week` | `productCountsBySets` (one `GROUP BY`, ≤ 10 sets), the calendar's products, `dealsInMarket` take 8, `newlyTracked` 12 | about 15 KB |
| `/<region>/guides/<slug>` | at most about 40 rows (existing loaders, one `GROUP BY` by type) | ≤ 20 KB (the index: none) |
| `/<region>/preorders/<set>` | `setOfferGroups` (≤ 30 products × ≤ 40 offers, as before); added 2026-10-16: outside the US the set's TCGplayer offers (≤ 30 rows) and, for the "across all markets" line, one `GROUP BY` of the set's offers by store (one small row per store, ≤ ~400) | about +10 KB |
| `/guides/pokemon-booster-box-prices-by-country` | every market's open booster boxes of ≤ 7 candidate sets (take ≤ 98), then the lead set's open ETB and bundle (take ≤ 28), one `StoreStat` aggregate; rendered on first visit, never at build | ≤ 20 KB |
| `/api/browse/<region>` | the search and filter index: one whole-market read per region | about 0.5 MB per region per import |
| product pages | `inStockAlternatives` (LIMIT 4) added; related products unchanged (take 40) | about +1 KB |
| `/<region>/sealed` and `/page/<n>` | 48 rows a page plus one `COUNT` (they read the whole market before) | down from about 0.5 MB |
| set, type, sets index, releases | set counts as one `GROUP BY` (≤ 150 rows); type pages capped at 48 in stock + 24 sold out | down |
| `/api/ebay/<region>` | unchanged per miss (≤ 8 rows, ~5 KB), but an edge keeps an answer an hour instead of 5 minutes | down |

The index costs about 7 × 0.5 MB per import (about 200 MB a month at two imports a day), in place of the whole-market read every
uncached browse page made. Check the effect the morning after a deploy: Neon → Monitoring → **Network transfer**, compared with
the week before, should be flat or lower; the Vercel logs should have no `[egress-guard]` lines (`src/lib/db.ts`).

## PageSpeed check

`.github/workflows/psi-dexcompare.yml` runs Google PageSpeed Insights on `https://www.dexcompare.app` (`/us`, one in-stock product,
`/us/sealed`, `/us/type/booster-boxes`; phone and desktop) **every Monday at 06:23 UTC** and on demand (Actions → **PageSpeed
check DexCompare** → Run workflow; the `paths` input takes other paths). It needs the repository secret **`PSI_API_KEY`**
(Google Cloud console → APIs & Services → enable "PageSpeed Insights API" → Credentials → API key; restrict it to that API).
Without the secret the job writes "skipped" to its summary and succeeds. A run makes 8 API calls and takes about two minutes;
it fails only when every call fails (a wrong key). Read the job summary: the lab score, LCP, CLS and TBT, and the real-user (field)
LCP, INP and CLS when Chrome has enough data. Lab numbers move from run to run: compare weeks, not single runs.

## After the growth release: owner actions

1. Set **`NEXT_PUBLIC_CONTACT_EMAIL`** to a branded forwarding address and **`NEXT_PUBLIC_OPERATOR`** to who runs the site
   (Vercel, Production and Preview; redeploy).
2. Add the **`PSI_API_KEY`** repository secret (see "PageSpeed check").
3. Confirm the Vercel project is on **Pro with Web Analytics enabled**, or `buy_click` events (every placement above) are not
   recorded.
4. Check the **eBay-blue buttons** (`.btn-ad`, #3665f3) against the EPN brand guidelines in Campaign Manager; if EPN asks for
   something else, the colour lives in one class in `src/app/globals.css`.
5. **Resubmit the sitemap** in Search Console (see "Search Console").
6. Run the **monthly money check** (above) a month after the release, and every month after.

The integrator's same-day checks after the deploy: the Vercel production build is green; `/`, `/us`, `/us/deals`,
`/us/cheapest-packs`, `/us/this-week`, `/us/guides`, one guide, an in-stock and a sold-out product and `/api/browse/us` answer 200;
`/sitemap/0.xml` lists the new pages; view-source shows no eBay data; the Vercel logs have no `[egress-guard]` lines. The next
morning: Neon's network transfer, as above.

## Costs and limits to know

- **GitHub Actions**: a full import of the 344 stores took 18 minutes in
  testing (three stores at a time, to stay under Shopify's rate limits).
  `Specifxx/CompareEmpire` is a public repository, so standard runner minutes
  are free. If the repo is ever made private, twice a day is ~2,000+ minutes a
  month — change the two `cron:` lines in
  `.github/workflows/dexcompare-sealed-import.yml` to one.
- **eBay API: DexCompare's own keyset, in GitHub Actions only.** One import a day makes at most 2,500 Browse
  calls (the run cap; the daily cap, 2,500 across every run, is kept in the database), most of them catalogue
  sweep pages; the website makes none. The job's timeout is 90 minutes. Nothing here can
  spend Rift Compare's eBay quota unless both sites share one keyset (the owner's other site shares the
  5,000-call daily limit with this one: 2,500 is this site's share, so cap the other site at 2,500 too; see the
  box at the top of "eBay listings: the daily import").
- **TCGplayer** links go through Impact (`partner.tcgplayer.com/c/7385758/…`),
  the same approved account as Rift Compare. Every page carries Impact's
  `impact-site-verification` tags (the account's shared token, as on the other
  CompareEmpire sites, and the token Impact issued for this site's own
  property, `f20df7de-…`); in Impact, check that `www.dexcompare.app` is listed as a promotional
  property of that account.
- **When the import goes red**: fewer than half the stores read, nothing
  requested read at all, or TCGplayer not read for 48 hours (its offers show
  "not checked recently" after 72 hours and are dropped after 14 days). A
  single failed TCGplayer read only adds a warning to the run and keeps its
  previous offers; a TCGplayer read that comes back with under 70% of the
  offers it had last time counts as failed in the same way.
- **Schema changes reach the database through the import job** (its "Sync
  the schema" step, `prisma db push` without `--accept-data-loss`), not the
  Vercel build. A push to `main` that changes `prisma/schema.prisma` starts
  that job on its own (a two-minute TCGplayer-only run, which also recomputes
  every product's stats), so a new column — e.g. `ProductStat.marketplaceOpen`
  — lands at about the same time as the deploy. Check Actions → **DexCompare
  sealed import** went green after such a merge; until the column exists, new
  pages that aren't cached yet fail to render. An added column with a default
  is safe for the old code.
