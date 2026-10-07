# Working in this repo

OP Compare is the One Piece Card Game sister site of RiftCompare
(`Specifxx/TCGEmpire`). Same rules where they apply; read `README.md` first and
`DECISIONS.md` for why things are the way they are.

## Deploys are gated — do not add `[deploy]` to commit subjects

Production builds only for a commit whose SUBJECT LINE carries `[deploy]`
(`scripts/vercel-ignore-build.sh`); `.github/workflows/production-deploy.yml`
lands one a day at 08:00 UTC. "Push to prod" means land it on `main` and ride the
daily release. Add `[deploy]` only when the owner says a release is urgent, and
say so. A commit BODY may discuss the marker; it does not deploy.

## The eBay API: OP Compare's own keyset, script-side only

- It runs only from `scripts/ebay.ts`, via `.github/workflows/ebay-prices.yml`
  (05:37 and 17:37 UTC). No page, route, Vercel cron or the store import calls
  or imports it.
- eBay API hosts appear only in `src/lib/ebay*.ts`; the `EBAY_CLIENT_*`
  credentials only there and in `ebay-prices.yml` (`tests/no-ebay-api.test.ts`).
  `scripts/ebay.ts` asks `isEbayEnabled()` and never names them.
- Never RiftCompare's keyset (it would spend RiftCompare's quota silently), and
  never on Vercel: the credentials are GitHub Actions secrets only.
- eBay is off until both secrets exist (a green no-op run); keys set but
  refused fail the run red.
- The budget is `min(EBAY_MAX_CALLS, remaining − EBAY_QUOTA_RESERVE)` per run
  (unknown `remaining` → daily limit minus our last-24h spend; the cap is at
  most half the spendable day); `spendable` starts at 0 and every Browse call
  goes through `spend()`. Searches failing without a 429 trip the breaker and
  fail the run red; every run records `spent`, even when it throws.
- Writes are per (product, market) pair, after a COMPLETED search only: a
  failed, 429'd or budget-refused search touches nothing.
- Never loosen the matcher to raise eBay matches; eBay-only rules live in
  `src/lib/ebay-match.ts`, each with a real title in `tests/ebay-match.test.ts`.
  No eBay price is trusted without a reference: TCGplayer's market price, or
  for an unpriced launch product the cheapest non-eBay offer.
- eBay rows are never re-ranked (item price, like every row), never in alerts
  or the Buy List Planner's baskets, never counted as a store, and never
  "delivered" without known postage. No "money back"/"buyer protection" copy.
- The eBay listing panels (`EbayListing`: the first 8 survivors with the
  headline pick first; `EbayGradedListing`: PSA/BGS/CGC/SGC slabs) are captured
  by `scripts/ebay.ts` from the SAME Browse search the price pass already makes:
  zero extra calls, written in `writePair`'s transaction after a COMPLETED search
  only, swept at 72 h, read through `getEbayPanel` / `getEbayPicks` in
  `src/lib/data.ts`. Those rows are display-only: never ranked into a price row,
  never in alerts or baskets, never counted as a store, and a slab never becomes
  an Offer or enters a comparison. Pages still never call eBay.
- The Marketplace Account Deletion route
  (`src/app/api/ebay/marketplace-deletion`) must stay deployed while the keyset
  exists.
- Changing a floor, share or interval in `src/lib/ebay-plan.ts` updates
  `tests/ebay-plan.test.ts`, the methodology copy and DECISIONS.
- Never dispatch *eBay prices* within 07:00–08:10 or 19:00–20:10 UTC: it shares
  the import's concurrency group and can cancel a pending import.

## Egress

Pages and API routes read only the loaders in `src/lib/data.ts`. Never import
`@/lib/db` from `src/app`, never add `unstable_cache` outside `src/lib/data.ts`,
never call a loader inside an `unstable_cache` callback, and keep each cache
entry well under 2 MB (`tests/nested-cache.test.ts`). No `generateStaticParams`
prewarming of database-backed routes.

Accounts and billing are the one exception, and a narrow one: `src/lib/auth.ts`
(`getCurrentUser`, one `select`-limited row), `src/lib/premium.ts`,
`src/lib/accounts.ts` and the Stripe routes query per user, uncached, and only
from account pages and `/api/*` routes — never from the root layout, which must
not read the session (the header asks `/api/me`, and only when the `oc_auth`
hint cookie exists). Gated rows are limited in the QUERY, never hidden with CSS.
The wave-2 member libraries join that exception on the same terms
(per-user or per-request, uncached, `select`-limited, called only from `/api/*`
routes and account pages — `/watching`, `/dashboard`, `/profile`,
`/portfolio/**`, `/c/[token]`, plus two dynamic pages that read one member's own row
and nothing else: `/tools/best-basket` (their deck watch and remembered minimum
condition) and `/alerts/action` (a signed action token) — never from the root
layout or a public page; `tests/app-no-db-import.test.ts` pins the set):
`src/lib/{watchlist-server,collection-server,collection-share,set-owned,notifications,sealed-watch,deck-watch,published-decks-server}.ts`.
The collection-alerts libraries do the same, for token- or per-request reads and writes only:
`src/lib/{alert-routes,alert-subscribe,alert-mute,alert-actions,newsletter-signup}.ts`
and `src/lib/launch-promo.ts` (called from `accounts.ts` at sign-up; the popup reads the counter
through `/api/promo` and `getLaunchPromo()` in `data.ts`, never the table)
(the unsubscribe and action tokens, the anonymous watch door and the newsletter signup; none imports
the mail module). Nothing under `src/app` imports `src/lib/email.ts` or a module that sends
(`tests/no-email-api.test.ts`): every email is sent script-side from GitHub Actions, only once
both mail secrets exist, and pages decide what to promise from `getEmailStatus()`.
Nothing under `src/app` imports `@/lib/db` (`tests/app-no-db-import.test.ts`).
Admin pages read through uncached `src/lib/admin*.ts`; public forms write
through `src/lib/inbox.ts`. Share images read only `src/lib/data.ts` loaders
(see "Share images").

## Price history lives in GitHub, not Postgres

The import writes history files (`src/lib/history.ts`) that the import workflow
commits to the `data` branch; pages read them from raw.githubusercontent.com
pinned to the commit in `Meta.historyRef`. Never add a history table back to
Prisma, and never push to `data` by hand — it is the workflow's.

## Plus & Premium (Stripe)

Entitlement is `User.premiumUntil` + `premiumTier`, written only by the webhook,
the daily reconcile, the admin grant/revoke routes (`src/lib/admin-billing.ts`,
admin session only, audited) and the launch promotion's single claim
(`src/lib/launch-promo.ts`: the first 50 NEW accounts get 30 days of Premium,
taken by one atomic capped upsert on the `Counter` row `launch-promo` in the
same transaction as the grant, called only from `upsertOAuthUser` for the row it
just created; `tests/launch-promo.test.ts` pins it), extend-only except an
explicit admin revoke, and
Stripe writes only for subscriptions whose Price or metadata says
`site=opcompare` (`src/lib/stripe-entitlement.ts`). `past_due`
never entitles. Prices live in `src/lib/plans.ts` and reach Stripe through
`scripts/stripe-setup.ts` (lookup keys), never through hand-typed price ids.
Changing a price, a tier's features or the trial policy is the owner's call.

## Admin access: one helper, every page and route, fail closed

An admin is `SessionUser.isAdmin` (`User.isAdmin` or `isAdminEmail`, from
`src/lib/admin-emails.ts`: the built-in `mastermisclick@gmail.com`, which
`ADMIN_EMAILS` REPLACES when set). Nothing else decides it. Every
`src/app/admin/**` page calls `requireAdminPage()` first (the layout is chrome,
not the gate) and every `src/app/api/admin/**` route calls `requireAdminApi()`
first, both from `src/lib/admin.ts`; `tests/admin.test.ts` walks the tree and
fails on a page or route that doesn't. Fail closed: no session, no admin flag,
an error or a missing env var means a 404 (pages) or 401/403 (APIs), never
the page. Mutations are POST + same-origin + JSON, and log with `adminLog`.
`ADMIN_TOKEN` is optional, for scripts, header-only (`Authorization: Bearer`),
at least 32 characters, and never in a URL, a query string or client props.
`/admin` stays out of robots, the sitemap, GA and the public UI (only an
admin's own account menu links it).

## Share images (link thumbnails)

Every `src/app/**/opengraph-image.tsx` is a thin route: it exports only
`runtime = "nodejs"`, `revalidate = 21600`, `alt`, `size` (1200×630),
`contentType` and `default`, and calls a loader-and-draw function in
`src/lib/og/images.tsx` (compositions in `compose.tsx`, pure selection in
`select.ts`). `tests/og.test.ts` pins this.

- **What each shows.** `/` and every page without its own image: the price
  guide (logo, "ONE PIECE PRICE GUIDE", card/store/market counts, five real
  top cards with art, printing, cheapest US price, TCGplayer market, number and
  store count or 7-day change). `/price-guide`: the same with the guide footer.
  `/sets/[slug]`: the set's top five cards (or its release date when unpriced).
  `/sealed/[slug]`: product art on a white plate with its price.
  `/card/[slug]`: card art, printing and rarity chips, and per-market prices.
  `/blog/[slug]`: the title beside three hero cards.
- **Real data only,** from the cached `src/lib/data.ts` loaders (no Offer or
  per-card query). Any error, empty database or unknown slug draws the
  data-free fallback image, never a 500 and never invented numbers.
- **Page metadata:** a page's `openGraph` replaces the root's whole object, so
  build it with `pageOg(canonicalPath)` (keeps site name/locale/type, sets
  `og:url`, re-adds the default image) or, beside its own
  `opengraph-image.tsx`, `pageOgOwnImage(path)`, which has no `images` key:
  the key alone blocks the sibling file (`src/lib/og/meta.ts`). The root layout
  sets no `og:url`. Images send a 6 h CDN header, the fallback one minute.
- **Safe area:** content inside x 48–1152, y 30–612; nothing essential below
  ~575 (Reddit and X overlay the domain there); the centre square
  (x 285–915) always holds real content.
- **Fonts:** the bundled TTFs in `src/lib/og/fonts/` (Luckiest Guy, Archivo
  900, Inter 600/700, JetBrains Mono 700; licences beside them), traced in by
  `next.config.js`. TTF/OTF only, never WOFF2; no emoji or flag glyphs. Follow
  the satori rules at the top of `compose.tsx`.
- Render changes locally and look at every PNG before shipping; check the live
  image in a link-preview tester before any Reddit post (Reddit freezes a
  post's thumbnail).

## Matching store listings

`src/lib/match.ts` matches a listing to ONE printing or not at all. Add a real
title to `tests/match.test.ts` for every rule you change. Never loosen a rule
to raise the match count; an ambiguous listing is skipped, not guessed.

## Checks

```
npx prisma generate
npm run typecheck
npm run lint
npm test
```

Record non-obvious decisions in `DECISIONS.md` (newest at the bottom).
