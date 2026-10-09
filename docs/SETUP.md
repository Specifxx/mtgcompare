# MTG Compare: setup

Everything MTG Compare needs to go live, in order. `docs/CHROME-SETUP-PROMPT.md` does all of it in the browser; this page is the same steps written out, and the environment tables in section 9 are generated from `tests/fixtures/env-names.json` (the only list of variables the code may read; `tests/env-names.test.ts` fails on a name that is not in it).

MTG Compare gets its **own** Neon project, Vercel project, private data repository, Stripe account (inside the owner's RiftCompare organisation), sign-in apps, GA4 property and Search Console property. It never reads or writes anything of RiftCompare's or OP Compare's, with one stated exception: eBay may share RiftCompare's keyset in `shared` mode (section 6a), Rift first.

**The domain is not decided.** `mtgcompare.app` is a placeholder (on 2026-10-08 it answered DEPLOYMENT_PAUSED, and the `.com` of the name is a live, unrelated "MTG Compare UK" site). Use the Vercel production URL (`https://<project>.vercel.app`, SITE_URL below) until the owner chooses one; section 8b says how to switch.

**Vercel variables are Production-only.** Preview and development deployments are off (they build only for a commit subject carrying `[preview]`, added only when the owner asks), so there is no Preview scope to fill.

## 1. Database (Neon)

1. Create a Neon project named `mtgcompare`: Postgres 16+, region AWS US East (N. Virginia), next to Vercel's `iad1` functions. Scale to zero stays on.
2. Copy the **pooled** connection string (`...-pooler....neon.tech/neondb?sslmode=require`). That one string is `DATABASE_URL` everywhere below.

Neon holds **private** state (accounts, billing, watches, alerts, the collection, notifications, the newsletter, the inbox, click events, the launch-promo counter, `ImportRun`/`Meta`, the eBay ledger and all eBay data: about 100 MB at most, target) **and, since 2026-10-09, the published data plane** as one raw-SQL table, `"PlaneFile"` (about 25 MB of gzip: the current tree only; the publisher creates it, there is nothing to migrate; see DECISIONS.md, "The plane moves into Neon"). Free tier: 0.5 GB storage, 5 GB/month transfer, 100 compute hours. The GitHub data repository below is now OPTIONAL (`PLANE_BACKEND=github`).

## 2. GitHub: the code repository (and, optionally, the private data repository)

**Code:** `Specifxx/mtgcompare`. Create `main` from the working branch and make it the default branch (CI, the weekly release and Vercel production all key off `main`; scheduled workflows run only from the default branch). Settings, Actions, General, Workflow permissions: **Read and write** (the weekly release pushes a commit to `main`).

**Data (default): nothing to create.** The published data goes to the Neon database that `DATABASE_URL` names (Actions secret and Vercel Production variable, both already needed). No repository, no token, no `PLANE_*` variable. Everything in the plane table is world-readable through the site anyway: never write anything private, paid or eBay-derived to it (the validator and `tests/plane-no-premium.test.ts` guard that).

**Data (optional, `PLANE_BACKEND=github`): a private repository.** Set the variable `PLANE_BACKEND` = `github` in Vercel (Production) AND in Actions, create the **private** repository `Specifxx/mtgcompare-data` empty (no README, no licence; the first publish creates its `data` branch) and the two tokens below. Without that variable none of the rest of this section applies.

**Two fine-grained personal access tokens (`PLANE_BACKEND=github` only)** (resource owner Specifxx, repository access *Only select repositories: `mtgcompare-data`*, expiry one year):

| Token | Permissions | Goes to |
|---|---|---|
| `mtgcompare-plane-read` | Contents: Read-only | Vercel only, as `PLANE_TOKEN` (the site reads the data with it) |
| `mtgcompare-data-write` | Contents: Read and write, Administration: Read-only | GitHub Actions secret `DATA_REPO_TOKEN` (the publisher and the watchdog) |

With the GitHub backend the watchdog reports days left on `PLANE_TOKEN` on `/admin/data` and alarms at 30 and 7 days. Rotate before expiry.

**Settings, Secrets and variables, Actions.** The full list is in section 9. The required ones to start: secrets `DATABASE_URL`, `CRON_SECRET`, `AUTH_SECRET`; variables `SITE_URL`, `REVALIDATE_URL`. (`DATA_REPO_TOKEN` and `PLANE_REPO` only with `PLANE_BACKEND=github`.) Optional: `OPS_WEBHOOK_URL` (a Discord or Slack webhook for freshness and failure alerts; they only print in the log without it) and `TARGET_DATABASE_URL` (only when a Neon project must be replaced; the `migrate-database` maintenance task is a green no-op without it; never a Vercel variable).

| Workflow | When (UTC) | Needs |
|---|---|---|
| CI, CI build | every PR and push to `main` | nothing (the build reads no database and no data host) |
| Import prices | 21:25, 21:55, 22:25 (the first that finds new sources publishes), or Run workflow | `DATABASE_URL`, `CRON_SECRET` (GitHub backend: `DATA_REPO_TOKEN`, `PLANE_REPO`) |
| Data hook, Data watchdog | after a publish; hourly at :17 | `DATABASE_URL`, `REVALIDATE_URL` (GitHub backend: `DATA_REPO_TOKEN`) |
| Data audit, Data squash, Data rollback | 00:20 daily; Sunday 23:50; by hand | `DATABASE_URL` (GitHub backend: `DATA_REPO_TOKEN`). With the Neon backend squash is a green no-op (only the current tree is stored) and rollback refuses with an explanation |
| Production deploy | **Tuesday 08:00**, or Run workflow | write permission |
| eBay prices | 05:37 and 17:37, or Run workflow (never 21:05 to 23:30) | `DATABASE_URL`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` (a green no-op without them) |
| Demand snapshot, IndexNow, Store health | 22:40, 23:15, 23:35 | as their headers say |
| Email outbox, Weekly newsletter | hourly at :23; Friday 21:00 | `RESEND_API_KEY`, `EMAIL_FROM` (no-ops without them) |
| Search Console | 07:25 | `GSC_SA_KEY` |
| DB audit, Egress audit, Inbox audit, Shipping rates, Maintenance | weekly or monthly, or by hand | `DATABASE_URL` |
| Stripe setup | by hand: once, and after a price change | `STRIPE_SECRET_KEY` |

Each workflow is a no-op until its values exist.

## 3. Vercel

1. *Add New, Project, Import* `Specifxx/mtgcompare`, in the same team as RiftCompare. Framework Next.js; defaults otherwise. Project name `mtgcompare`. The team must be on a plan that allows commercial use (Pro): the site has affiliate links and subscriptions.
2. *Settings, Git, Production Branch:* `main`.
3. *Settings, Environment Variables:* **Production only**, names exactly as in section 9. Never copy a secret from another project.
4. A build is skipped unless the commit subject carries `[deploy]` (production) or `[preview]` (preview, only when the owner asks). "Build skipped" or "Canceled" on a deployment is normal. Nothing deploys until the first release.
5. The daily Stripe reconcile runs as a Vercel Cron (`vercel.json`).
6. Enable Web Analytics in the project's Analytics tab (custom events need Pro).

## 4. Google Analytics 4

In the same account as RiftCompare: Admin, Create property "MTG Compare", a Web stream for SITE_URL with Enhanced measurement on; put the `G-...` id in `NEXT_PUBLIC_GA_ID`; mark `buy_click` a key event once it appears.

## 5. Sign-in (Google, optionally Discord)

**Google (its own client).** Google Cloud Console: project "MTG Compare"; OAuth consent screen (External, app name "MTG Compare", scopes `openid`, `email`, `profile`, Publish app); Credentials, OAuth client ID, Web application "MTG Compare web": JavaScript origin SITE_URL, redirect URI `SITE_URL/api/auth/oauth/google/callback`. Put the id and secret in Vercel (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

**Discord (optional).** discord.com/developers: application "MTG Compare", OAuth2 redirect `SITE_URL/api/auth/oauth/discord/callback`; its id and secret go to Vercel (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`). A provider's button shows only when both values are set.

## 6. Stripe (Plus and Premium), test mode first

1. **A NEW Stripe account inside the owner's RiftCompare organisation**, named "MTG Compare". Never share RiftCompare's account: its reconcile matches subscriptions by account. Public business name "MTG Compare", statement descriptor `MTGCOMPARE`, a support e-mail, receipts for successful payments on.
2. **Settings, Branding (by hand):** brand colour `#9140da` and icon `SITE_URL/icon-512.png`. `scripts/stripe-setup.ts` only reads these and prints what is off.
3. Stay in **test mode** until the owner has clarity on taking payments for a Magic site (Wizards fan-content terms; contract 10.10). Put the test secret key in Vercel and in the GitHub secret `STRIPE_SECRET_KEY`.
4. GitHub, Actions, **Stripe setup**, Run workflow (after the first deploy). It creates the products "MTG Compare Plus" and "MTG Compare Premium", four prices with lookup keys `mtgcompare_<plus|premium>_<month|year>`, and the billing portal configuration. Checkout sets metadata `kind=mc_premium`, `site=mtgcompare`; only subscriptions carrying that site tag ever change an entitlement.
5. Developers, Webhooks, Add endpoint `SITE_URL/api/stripe/webhook` with exactly six events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`. Its signing secret is `STRIPE_WEBHOOK_SECRET` (Vercel). Re-run Stripe setup: it reports all events subscribed.
6. **To go live:** the owner activates the account (identity and bank details are theirs), then the live secret key replaces the test key in both places, Stripe setup runs again on live, a live webhook is created and `STRIPE_WEBHOOK_SECRET` replaced, then a release.

To change a price, edit the prices in `src/lib/plans.ts`, ship it, and re-run Stripe setup. Changing a price, a tier's features or the trial policy is the owner's call.

## 6a. eBay Browse API (optional)

eBay listing prices are fetched script-side by **eBay prices** (`ebay-prices.yml` calling `scripts/ebay.ts`), stored in Neon only and shown in their own labelled block. The workflow is a green no-op until both secrets exist.

- `EBAY_KEYSET_MODE=shared` (the default): MTG Compare spends `min(ledger allowance, live remaining - the RiftCompare reserve)` on RiftCompare's existing production keyset, always after Rift's own runs, and logs and alarms any spend it did not make. Copy the production **App ID** and **Cert ID** through the clipboard into the GitHub secrets `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET`; never into Vercel, never into chat. `own` is for a keyset of MTG Compare's own. Check with eBay Developer Support that a second site may use one keyset.
- Start with `EBAY_OBSERVE_ONLY=1` for the first week (the job reads the remaining quota to measure Rift's use and spends nothing), `EBAY_DAILY_CALL_BUDGET=1000`. The owner switches observe-only to `0`.
- The Marketplace Account Deletion endpoint stays RiftCompare's in shared mode (one application has one endpoint). The route `src/app/api/ebay/marketplace-deletion` must stay deployed while a keyset of MTG Compare's own exists; then set `EBAY_VERIFICATION_TOKEN` (new random, 32 to 80 characters of `[A-Za-z0-9_-]`) and `EBAY_DELETION_ENDPOINT` in Vercel before the release, and check `curl -s "SITE_URL/api/ebay/marketplace-deletion?challenge_code=test"` returns `{"challengeResponse":"<64 hex>"}`.
- **Never dispatch eBay prices within 21:05 to 23:30 UTC**: it shares the daily import's concurrency group and can cancel a pending import. `/admin/ebay` shows the ledger and refuses a manual run inside that window.
- Smoke test: run eBay prices by hand with `only_market=US` and `max_calls=50` and read the `eBay quota:` line.

## 6b. Email (optional, off until you do this)

MTG Compare ships with email **off**: alerts are delivered in-app, no page promises an email and no email field renders. To switch it on, create MTG Compare's **own** Resend account (never RiftCompare's), verify the sending domain, and set the GitHub **repository** secrets (never Vercel): `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_LINK_SECRET` (32+ random characters, signs the one-tap links), and optionally the variables `EMAIL_REPLY_TO` and `ALERT_DAILY_BUDGET`. Both `RESEND_API_KEY` and `EMAIL_FROM` are needed. Each runner records Meta `email` = on/off; the site switches its copy only after a run has recorded `on`, so run **Email outbox** once by hand. A key that is set but refused turns the run red and flips the copy back off. The anonymous "email me, no account" form stays hidden until `NEXT_PUBLIC_ANON_ALERTS=1` (the owner's call: it lets anyone enter any address).

## 7. Google Search Console and Bing (needs a domain)

*Add property, Domain* and verify with the DNS TXT record (or a URL-prefix property with `GOOGLE_SITE_VERIFICATION`, then `GSC_PROPERTY` in GitHub). Add the service account's `client_email` with **Full** permission, put its JSON key in `GSC_SA_KEY`, submit `SITE_URL/sitemap.xml` (an index; the children are `/sitemaps/<kind>-<n>.xml`), and import into Bing Webmaster Tools. IndexNow follows the index daily at 23:15 UTC after the publish.

## 8. Turn it on

1. **Publish the data first.** GitHub, Actions, *Import prices*, Run workflow on `main` (up to about 75 minutes; it creates the `PlaneFile` table in Neon and publishes the tree into it; with the GitHub backend, the `data` branch of the data repository). Then run *Data hook* once. Pages render from this data, so it must exist before the first deploy.
2. **First deploy.** Push a commit whose subject carries `[deploy]`, or run *Production deploy*. After that, production deploys by itself once a week, Tuesday 08:00 UTC; data refreshes never need a deploy.
3. Open SITE_URL and check: a card page shows store prices per finish; `/login` shows the sign-in buttons; `/premium` shows live buttons; signed in as **mastermisclick@gmail.com** the account menu shows *Admin* and `/admin` loads (the lights for data, eBay, database and deploy age); `/admin/data` shows the pointer under 26 hours old. Signed out, `/admin` is an ordinary 404.
4. Share images: paste SITE_URL, a card URL and `/price-guide` into a link-preview tester and a Discord message; each must show real cards and prices, not the data-free fallback. Check **before** posting to Reddit: Reddit keeps a post's thumbnail forever.
5. Run *Search Console* and *IndexNow submit* once the domain exists.

## 8b. Switching to a real domain

Vercel, Domains: add it (and `www` redirecting to the apex); set `NEXT_PUBLIC_SITE_URL` (Vercel) and `SITE_URL` and `REVALIDATE_URL` (GitHub); change the `mtgcompare.app` strings in `next.config.js` (the www redirect) and `vercel.json` if present; add the new URL to the Google OAuth client (origin and redirect), the Discord redirect and the Stripe webhook (new endpoint, move the signing secret, remove the old one); then a release (`NEXT_PUBLIC_*` values are inlined at build time).

## 9. Every environment variable

Generated from `tests/fixtures/env-names.json`. **Kind:** secret (never committed, never `NEXT_PUBLIC_`), var (configuration), public (`NEXT_PUBLIC_*`, inlined at build time, so changing one needs a release). Platform variables set by Vercel, Next or Actions are not listed. Vercel scope is always Production.

### Vercel (Production only)

**Database and platform**

| Name | Kind | Default / when unset | What |
|---|---|---|---|
| `DATABASE_URL` | secret | none | the ONE Neon project (pooled URL): private tables only (accounts, billing, watches, alerts, collection, notifications, newsletter, inbox, click events, ledger and eBay data, ImportRun/Meta). Public data is NOT in it (section 12). The importer does not read it |
| `PRISMA_LOG` | var | unset |  |

**Site identity and links**

| Name | Kind | Default / when unset | What |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | public | https://mtgcompare.app (placeholder, flagged) | the domain (10.3); read in ONE file |
| `NEXT_PUBLIC_CONTACT_EMAIL` | public | contact@mtgcompare.invalid (placeholder, flagged) | ONE contact address (requirements 1.4). The default ends in .invalid on purpose: a placeholder on a real domain would deliver every mailto to whoever owns it (WP16-site-identity-and-legal-strings) |
| `NEXT_PUBLIC_DISCORD_URL` | public | unset |  |
| `NEXT_PUBLIC_ANON_ALERTS` | public | unset |  |
| `NEXT_PUBLIC_USD_TO_AUD` | public | built-in rate | static fallback exchange rate |
| `NEXT_PUBLIC_USD_TO_CAD` | public | built-in rate | static fallback exchange rate |
| `NEXT_PUBLIC_USD_TO_EUR` | public | built-in rate | static fallback exchange rate |
| `NEXT_PUBLIC_USD_TO_GBP` | public | built-in rate | static fallback exchange rate |
| `NEXT_PUBLIC_USD_TO_SGD` | public | built-in rate | static fallback exchange rate |
| `NEXT_PUBLIC_IMAGE_PRIMARY` | public | tcgplayer | scryfall flips the front-image order (10.4) |

**Affiliate links**

| Name | Kind | Default / when unset | What |
|---|---|---|---|
| `NEXT_PUBLIC_EBAY_CAMPAIGN_ID` | public | none: links render as plain eBay search links | EPN campaign id, MTG's own (10.20). Replaces OP's EBAY_AFFILIATE_CAMPAIGN, which client components could not read (no NEXT_PUBLIC prefix) and which fell back to RIFT's id 5339155912 in the browser |
| `NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK` | public | none: links render as plain TCGplayer links | Impact link. Replaces OP's TCGPLAYER_IMPACT_LINK (default was Rift's partner link) |
| `NEXT_PUBLIC_TCGPLAYER_CREATIVES` | public | unset |  |
| `EBAY_MKRID_US` | var | built-in | per-market EPN tracking parameter (templated read) |
| `EBAY_SITEID_US` | var | built-in | per-market EPN site id (templated read) |
| `EBAY_MKRID_AU` | var | built-in | per-market EPN tracking parameter (templated read) |
| `EBAY_SITEID_AU` | var | built-in | per-market EPN site id (templated read) |
| `EBAY_MKRID_UK` | var | built-in | per-market EPN tracking parameter (templated read) |
| `EBAY_SITEID_UK` | var | built-in | per-market EPN site id (templated read) |
| `EBAY_MKRID_CA` | var | built-in | per-market EPN tracking parameter (templated read) |
| `EBAY_SITEID_CA` | var | built-in | per-market EPN site id (templated read) |
| `EBAY_MKRID_SG` | var | built-in | per-market EPN tracking parameter (templated read) |
| `EBAY_SITEID_SG` | var | built-in | per-market EPN site id (templated read) |
| `EBAY_MKRID_EU` | var | built-in | per-market EPN tracking parameter (templated read) |
| `EBAY_SITEID_EU` | var | built-in | per-market EPN site id (templated read) |

**Accounts, billing, admin**

| Name | Kind | Default / when unset | What |
|---|---|---|---|
| `AUTH_SECRET` | secret | none | session signing; also verifies signed email links in scripts |
| `ADMIN_EMAILS` | var | mastermisclick@gmail.com (built in; REPLACED when set) |  |
| `ADMIN_TOKEN` | secret | unset (token path closed) | scripts only, Authorization: Bearer, at least 32 characters |
| `ADMIN_EXTRA_ORIGINS` | var | unset | extra origins (comma separated) an admin POST may come from in production, besides SITE_URL: a preview domain you administer from |
| `GOOGLE_CLIENT_ID` | var | none: the provider button is hidden |  |
| `GOOGLE_CLIENT_SECRET` | secret | none: the provider button is hidden |  |
| `DISCORD_CLIENT_ID` | var | none: the provider button is hidden |  |
| `DISCORD_CLIENT_SECRET` | secret | none: the provider button is hidden |  |
| `STRIPE_SECRET_KEY` | secret | none: billing is off | the NEW MTG Compare Stripe account (test mode first). The site tag `site=mtgcompare` and the lookup keys `mtgcompare_*` are constants in plans.ts, not variables |
| `STRIPE_WEBHOOK_SECRET` | secret | none |  |
| `CRON_SECRET` | secret | none | bearer secret: Vercel cron routes, the warm call /api/data-warm that every publish makes, and the purge of the Neon-backed tags /api/revalidate. Plane data needs no purge (pinned URLs) |
| `GITHUB_DISPATCH_TOKEN` | secret | unset: the admin panels show a link to the workflow instead of a Run button | OPTIONAL fine-grained token, this repository only, Actions: write. Lets /admin/ebay and /admin/deploys dispatch a workflow. NOT an eBay credential |
| `NEXT_PUBLIC_GITHUB_REPO` | public | Specifxx/mtgcompare | owner/repo used by the admin links and the unauthenticated release-history read |
| `CLICK_LOG` | var | 1 | 0 = outbound clicks are not recorded (owner decision 10.32); GA's buy_click is unaffected. Clicks are buffered in the instance and written in ONE insert inside the aligned half-hour window shared with the view counter (ClickBatcher) |
| `CLICK_SAMPLE_RATE` | var | 1 | 1 = every click (buffered); 0.1 = one in ten. Read only by ClickBatcher's caller |

**Email and notifications**

| Name | Kind | Default / when unset | What |
|---|---|---|---|
| `EMAIL_LINK_SECRET` | secret | none | signs unsubscribe and action links |

**Analytics and search engines**

| Name | Kind | Default / when unset | What |
|---|---|---|---|
| `NEXT_PUBLIC_GA_ID` | public | unset: no analytics |  |
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | public | unset: house promo |  |
| `GOOGLE_SITE_VERIFICATION` | var | unset |  |
| `BING_SITE_VERIFICATION` | var | unset |  |
| `INDEXNOW_KEY` | var | unset |  |

**eBay (script-side only; the credentials are GitHub Actions secrets, never Vercel)**

| Name | Kind | Default / when unset | What |
|---|---|---|---|
| `EBAY_VERIFICATION_TOKEN` | secret | none | Marketplace Account Deletion route; tests/no-ebay-api.test.ts pins the two names this route reads |
| `EBAY_DELETION_ENDPOINT` | var | none |  |

**Data plane (section 12): where the published data lives, the reader's tuning, and (only for `PLANE_BACKEND=github`) the private data repository and its tokens**

| Name | Kind | Default / when unset | What |
|---|---|---|---|
| `PLANE_BACKEND` | var | neon | `neon` (also when unset): the `PlaneFile` table of `DATABASE_URL`, no token. `github`: the private data repository, and the OPTIONAL rows below become required. The same value in Vercel and in Actions |
| `PLANE_POINTER_TTL_S` | var | 60 | Neon backend: seconds an instance trusts its last read of the pointer row (raise it to let Neon's compute suspend between visits) |
| `PLANE_REPO` | var | OPTIONAL (github backend): Specifxx/mtgcompare-data | owner/name of the PRIVATE data repository (12.4); the same value in Vercel and in Actions |
| `PLANE_BRANCH` | var | OPTIONAL (github backend): data | the data branch; only the publisher writes it |
| `PLANE_TOKEN` | secret | OPTIONAL (github backend). Unset: reads are unauthenticated and a private repository answers 404 (the site serves... | fine-grained personal access token, Contents: read, on the data repository ONLY, at most 1 year (alarm 30 days before expiry). Part of the Data Cache key of every file: a rotation makes the cache cold and is followed by the data-hook workflow |
| `PLANE_LRU_MB` | var | 64 | per-instance memory cache of parsed files |
| `PLANE_TIMEOUT_RAW_MS` | var | 3000 | per-file budget of the raw host before the API fallback |
| `PLANE_TIMEOUT_API_MS` | var | 5000 | per-file budget of the contents API fallback |
| `VIEW_BEACON_SAMPLE` | var | 10 | the card-view counter samples one view in N and never counts a crawler; 1 = every view, 0 = off (12.12) |
| `VIEW_FLUSH_MINUTES` | var | 30 | the counter writes to Neon at most this often per instance (scale-to-zero arithmetic: 12.12) |

### GitHub Actions (secrets and variables of `Specifxx/mtgcompare`)

**Database and platform**

| Name | Kind | Default / when unset | What |
|---|---|---|---|
| `DATABASE_URL` | secret | none | the ONE Neon project (pooled URL): private tables only (accounts, billing, watches, alerts, collection, notifications, newsletter, inbox, click events, ledger and eBay data, ImportRun/Meta). Public data is NOT in it (section 12). The importer does not read it |
| `TARGET_DATABASE_URL` | secret | none: the migrate-database task is a green no-op | the NEW Neon project of the maintenance task migrate-database (pg_restore target; private tables only). Read by the workflow alone; never a Vercel variable |
| `NODE_OPTIONS` | var | --max-old-space-size=3072 | importer heap |

**Site identity and links**

| Name | Kind | Default / when unset | What |
|---|---|---|---|
| `SITE_URL` | var | none | production origin for scripts and the importer's User-Agent |

**Affiliate links**

| Name | Kind | Default / when unset | What |
|---|---|---|---|
| `NEXT_PUBLIC_EBAY_CAMPAIGN_ID` | public | none: links render as plain eBay search links | EPN campaign id, MTG's own (10.20). Replaces OP's EBAY_AFFILIATE_CAMPAIGN, which client components could not read (no NEXT_PUBLIC prefix) and which fell back to RIFT's id 5339155912 in the browser |

**Accounts, billing, admin**

| Name | Kind | Default / when unset | What |
|---|---|---|---|
| `AUTH_SECRET` | secret | none | session signing; also verifies signed email links in scripts |
| `STRIPE_SECRET_KEY` | secret | none: billing is off | the NEW MTG Compare Stripe account (test mode first). The site tag `site=mtgcompare` and the lookup keys `mtgcompare_*` are constants in plans.ts, not variables |
| `CRON_SECRET` | secret | none | bearer secret: Vercel cron routes, the warm call /api/data-warm that every publish makes, and the purge of the Neon-backed tags /api/revalidate. Plane data needs no purge (pinned URLs) |
| `REVALIDATE_URL` | var | none: the warm call is skipped and logged (the site still reads the new pointer within... | production origin: /api/data-warm and /api/data-status are called after every publish, /api/revalidate only for the Neon-backed tags |

**Email and notifications**

| Name | Kind | Default / when unset | What |
|---|---|---|---|
| `EMAIL_FROM` | var | none: no mail is sent |  |
| `EMAIL_REPLY_TO` | var | none |  |
| `EMAIL_LINK_SECRET` | secret | none | signs unsubscribe and action links |
| `RESEND_API_KEY` | secret | none: no mail is sent | script-side only (tests/no-email-api.test.ts) |
| `BREVO_API_KEY` | secret | none |  |
| `ALERT_DAILY_BUDGET` | var | built-in | distinct addresses mailed per rolling day, free and paid runs together (price-alerts.ts alertDailyBudget) |
| `OPS_WEBHOOK_URL` | secret | unset: ops alerts only print in the log | Discord/Slack webhook for freshness, failure and store-health alerts (parity P39). Webhook only, no bot |

**Analytics and search engines**

| Name | Kind | Default / when unset | What |
|---|---|---|---|
| `INDEXNOW_KEY` | var | unset |  |
| `GSC_PROPERTY` | var | sc-domain:<domain> |  |
| `GSC_SA_KEY` | secret | none |  |

**eBay (script-side only; the credentials are GitHub Actions secrets, never Vercel)**

| Name | Kind | Default / when unset | What |
|---|---|---|---|
| `EBAY_CLIENT_ID` | secret | none: eBay stays off (a green no-op run) | tests/no-ebay-api.test.ts: named only in src/lib/ebay*.ts and ebay-prices.yml. The workflow file name is ebay-prices.yml (one name, everywhere) |
| `EBAY_CLIENT_SECRET` | secret | none |  |
| `EBAY_KEYSET_MODE` | var | shared | shared (Rift first, then MTG on the same quota) or own (10.1) |
| `EBAY_OBSERVE_ONLY` | var | 1 for the first 7 days | quota reads only (10.2) |
| `EBAY_API_ENABLED` | var | 1 | KILL SWITCH (requirements 4): 0 = no Browse call at all |
| `EBAY_DAILY_CALL_BUDGET` | var | 1000 | calls per day for MTG (requirements 4); the ledger enforces it |
| `EBAY_QUOTA_RESERVE` | var | OP's value | calls always left for Rift |
| `EBAY_MAX_CALLS` | var | OP's value | cap per run |
| `EBAY_MIN_VALUE_CENTS` | var | OP's value | price floor for the allocator |
| `EBAY_DISPATCH_CAP` | var | OP's value |  |
| `EBAY_FORCE` | var | unset | manual override flag |
| `EBAY_ONLY_MARKET` | var | unset | restrict a manual run to one market |
| `EBAY_REFRESH` | var | unset |  |

**Importer and publisher (GitHub Actions variables, never Vercel variables)**

| Name | Kind | Default / when unset | What |
|---|---|---|---|
| `CATALOG_FLOOR_CENTS` | var | 1 | every priced class-0 single has a row; 10, 25, 50 are the fallback ladder (5.6) (read only by trackConfigFromEnv) |
| `CATALOG_EXIT_RATIO` | var | 0.8 | read only by trackConfigFromEnv |
| `CATALOG_ORACLE_COMPLETE` | var | 1 | every priced oracle keeps its TOP printing listed whatever the floor (read only by trackConfigFromEnv) |
| `INDEX_FLOOR_CENTS` | var | 50 | a listed row below this score is THIN: noindex, no sitemap entry (read only by trackConfigFromEnv) |
| `CATALOG_SPECIAL_FLOOR_CENTS` | var | 2000 | read only by trackConfigFromEnv |
| `TRACK_FLOOR_CENTS` | var | 500 | read only by trackConfigFromEnv |
| `TRACK_EXIT_RATIO` | var | 0.8 | read only by trackConfigFromEnv |
| `TRACK_LOW_BASIS` | var | 0 | read only by trackConfigFromEnv |
| `TRACK_POP_BOOST` | var | 0 | read only by trackConfigFromEnv |
| `TRACK_PER_ORACLE_CAP` | var | 0 | read only by trackConfigFromEnv |
| `PRICE_CLIP_CENTS` | var | 200000 | read only by trackConfigFromEnv |
| `CATALOG_MAX_ROWS` | var | 200000 | F6 cap (read only by trackConfigFromEnv) |
| `TRACK_MAX_UNITS` | var | 70000 | F6 cap (read only by trackConfigFromEnv) |
| `OFFER_ROWS_BUDGET` | var | 450000 | section 12 may re-express it in bytes (read only by trackConfigFromEnv) |
| `IMPORT_MAX_LISTED_CHANGE` | var | 0.05 | F10 (read only by trackConfigFromEnv) |
| `IMPORT_MAX_TRACKED_CHANGE` | var | 0.15 | F10 (read only by trackConfigFromEnv) |
| `IMPORT_ACCEPT_FLAG_CHANGE` | var | 0 | 1 = accept this run's flag changes once (read only by trackConfigFromEnv) |
| `IMPORT_GUARD_MAX_TRIPS` | var | 3 | the Nth consecutive F10 trip is accepted (read only by trackConfigFromEnv) |
| `IMPORT_MIN_PARSE_RATIO` | var | 0.9 | a parse below this fraction of the last run aborts (F2, F4) |
| `SCRYFALL_MODE` | var | auto | off = prices-only run keeping existing links (the library reads it; the two entry points pass it on) |
| `IMPORT_FORCE` | var | unset | 1 = ignore the last-updated.txt gate |
| `IMPORT_STORES` | var | 1 | 0 = skip the store stage (bootstrap sets 0) |
| `IMPORT_ONLY_STORES` | var | unset |  |
| `IMPORT_ONLY_COUNTRY` | var | unset |  |
| `SKIP_REVALIDATE` | var | unset | 1 = skip the warm call and the status poll after a publish (S13); the pointer has already moved |
| `TCGCSV_CACHE_DIR` | var | unset | local response cache for offline re-runs |
| `SCRYFALL_CACHE_DIR` | var | unset |  |
| `IMPORT_CACHE_DIR` | var | .cache | the Actions cache directory of the slim Scryfall file and the phase-1 to phase-2 match index |
| `BOOTSTRAP_GROUPS` | var | unset | N = restrict the first run to the N largest and newest groups |
| `FEED_SOURCES` | var | empty | public price feeds stay off (10.11) |

**Data plane (section 12): where the published data lives, the reader's tuning, and (only for `PLANE_BACKEND=github`) the private data repository and its tokens**

| Name | Kind | Default / when unset | What |
|---|---|---|---|
| `PLANE_BACKEND` | var | neon | `neon` (also when unset): the `PlaneFile` table of `DATABASE_URL`, no token. `github`: the private data repository, and the OPTIONAL rows below become required. The same value in Vercel and in Actions |
| `PLANE_POINTER_TTL_S` | var | 60 | Neon backend: seconds an instance trusts its last read of the pointer row (raise it to let Neon's compute suspend between visits) |
| `PLANE_REPO` | var | OPTIONAL (github backend): Specifxx/mtgcompare-data | owner/name of the PRIVATE data repository (12.4); the same value in Vercel and in Actions |
| `PLANE_BRANCH` | var | OPTIONAL (github backend): data | the data branch; only the publisher writes it |
| `PLANE_ALLOW_PUBLIC` | var | unset: a public data repository raises DATA_REPO_PUBLIC (error) | 1 = operate knowingly with a public data repository; the premium inputs and licensed data are then world-readable (12.3.3) |
| `DATA_REPO_TOKEN` | secret | OPTIONAL (github backend). None: no publish | fine-grained personal access token, Contents: write (and Administration: read for the size probe), on the data repository ONLY. GITHUB_TOKEN covers only the workflow's own repository. Travels in an http extraheader, never in a URL or a log |

## Limits to watch

- **Neon:** the published plane is one table (`PlaneFile`, about 25 MB gzip; `/admin/data` shows its size against 400 MB, `scripts/audit-publication.ts --remote` against Neon Free's 512 MB project limit) on top of under 100 MB of private tables (`/admin/database` lights amber at 70 MB, red at 90 MB); 5 GB/month transfer; public pages now read it through `src/lib/data/plane` only: a pointer row at most every 60 s per instance and one row per cold file (a per-instance LRU keyed by sha keeps the rest in memory); the CDN headers of the pages cut the origin hits. If Neon's compute-hours run short, raise `PLANE_POINTER_TTL_S`. The Launch-plan trigger is 80 projected compute hours by day 10 of a billing month.
- **The data repository (only with `PLANE_BACKEND=github`):** `/admin/data` shows its size against 3 GB and the days left; the weekly squash keeps it bounded. Rotate `PLANE_TOKEN` and `DATA_REPO_TOKEN` before a year is up.
- **eBay:** `/admin/ebay` shows calls spent against the cap per quota window; in shared mode MTG Compare only spends what Rift has left over.
- **Releases:** more than two `[deploy]` subjects in a week turns the Deploys light red.
