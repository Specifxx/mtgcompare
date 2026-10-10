# Claude in Chrome: MTG Compare setup prompt

Paste everything between the two lines into Claude in Chrome. It is written to be pasted **more than once**: it checks what
already exists, skips what is done, and picks up where it left off. Paste it now (phase A runs, phase B waits for the site),
and paste it again when the build is reported ready (phase B runs).

Before you paste: sign in, in this Chrome profile, to GitHub (Specifxx), Vercel, Neon, Stripe, the eBay developer portal,
Google (Cloud Console and Analytics) and Discord. Anything you forget becomes a manual item with its tab left open, so you
cannot get this wrong.

---

You are setting up the production infrastructure for **MTG Compare**, a Magic: The Gathering card price-comparison website.
The code lives in the GitHub repo **Specifxx/mtgcompare**, branch `claude/compassionate-wright-1tr8wt`. It is the sister site of
RiftCompare (repo Specifxx/TCGEmpire) and OP Compare (repo Specifxx/OpCompare). MTG Compare gets its **own** Neon database,
Vercel project, Google sign-in client, Discord app, Stripe account (inside my existing Rift Compare Stripe organization),
and Google Analytics property.

The admin account is **mastermisclick@gmail.com**. There is no MTG Compare domain yet: use the Vercel production URL
(`https://<project>.vercel.app`, called SITE_URL below) everywhere a site URL is needed, and do not buy a domain.

## How this run works (read this twice)

1. **Idempotent.** Before creating anything, look for it by name and reuse it. Never create duplicates. If a value already
   exists and is correct, leave it.
2. **Never stop the whole run for a blocker.** Some actions only I can do: signing in, two-factor codes, CAPTCHAs, payment,
   identity or business verification, e-mail or SMS confirmation, accepting a legal agreement or terms of service, a
   decision I haven't given you, or anything the sites won't let you do. When you hit one:
   a. Open the exact page in a **new tab** and **leave that tab open** on the exact spot where I must act.
   b. Add an entry to the MANUAL list: `M<n>`, what I must do (one or two precise sentences), the tab (title and URL), and
      which later steps are waiting on it.
   c. Mark the steps that depend on it `BLOCKED(M<n>)` and **carry on with every other step** that doesn't depend on it.
   d. Never accept legal terms, agreements or paid-plan prompts for me. Never guess a business or identity detail.
3. **Deferred is not manual.** Some steps need the finished site to be live (phase B). If the readiness check in phase B
   fails, list those steps as DEFERRED, with the sentence "re-paste this prompt after the build is reported ready".
4. **Finish with a report** in exactly this shape:
   - `DONE` (short bullets)
   - `VALUES SET` (names only: GitHub secrets and variables, Vercel env vars, with the environments; secrets shown as "set")
   - `DEFERRED` (steps waiting for the live site)
   - `MANUAL ITEMS: do these in order` (M1, M2, ... each with its open tab), followed by what unblocks once each is done
   - `PROBLEMS` (anything that failed, with the exact error text)
   At the end, the browser should have one open tab per manual item, in the order of the list. Tell me the tab order.

## Ground rules

- **RiftCompare and OP Compare are read-only.** Never change, delete or rotate anything of theirs: Vercel projects, GitHub
  repos or secrets, Neon projects, Stripe account settings, Google clients, GA or Search Console properties, DNS. Do not
  open RiftCompare's or OP Compare's Vercel or Neon projects at all. The only permitted read of existing infrastructure is the
  eBay developer portal's keyset page in A8, and the public pages of riftcompare.com.
- **No money.** Do not buy anything (domains, plans, credits) and do not add a payment method. A step that needs payment is a
  manual item.
- **Secrets stay in their fields.** Never print a secret, a token, an API key, a connection string or a password in the chat,
  in an issue, in a commit message or in the final report (names only). Only type them into the GitHub or Vercel fields named
  below. When you copy a value from one site to another, do it through the clipboard, not by reading it back.
- **Don't delete DNS records or any resource you did not create in this run.**
- **If the repo's own docs disagree with this prompt** about a variable name, a workflow name or a route, the repo wins:
  read `docs/SETUP.md` on the branch (raw: https://raw.githubusercontent.com/Specifxx/mtgcompare/claude/compassionate-wright-1tr8wt/docs/SETUP.md)
  once it exists, use its names, and list the differences under PROBLEMS.

**Random secrets.** When a step says "random secret", open
https://www.random.org/strings/?num=3&len=20&digits=on&upperalpha=on&loweralpha=on&unique=on&format=plain&rnd=new
and join the three lines into one 60-character string; use a fresh one each time. (If that page is unavailable, join two UUIDs
from https://www.uuidgenerator.net/ without dashes.) You need three: `CRON_SECRET`, `AUTH_SECRET`, and a spare for
`EMAIL_LINK_SECRET` (phase C).

## Phase 0: sign-in audit (2 minutes)

Open one tab per service and check I am signed in: github.com/Specifxx, vercel.com, console.neon.tech, dashboard.stripe.com,
developer.ebay.com/my/keys, console.cloud.google.com, analytics.google.com, discord.com/developers/applications.
For each service where I am **not** signed in: create a manual item ("Sign in to <service>, then say nothing: re-paste this
prompt"), leave that tab open on its sign-in page, and skip every step that needs that service (mark BLOCKED). Continue
with the services that are signed in.

## Phase A: everything that needs no finished code

### A1. Neon: ONE new project
1. console.neon.tech: create a project named `mtgcompare` (Postgres 16 or newest, region **AWS US East (N. Virginia)**, free
   plan). If one named `mtgcompare` exists, reuse it. Create no second project and no second database.
2. Turn **Scale to zero** on (the default on free) and leave it on.
3. Copy the **pooled** connection string (Connect, "Pooled connection" on; it contains `-pooler` and ends in
   `?sslmode=require`). This is `DATABASE_URL`. Do not print it.

### A2. GitHub: the code repo Specifxx/mtgcompare (the private data repo is now OPTIONAL)
MTG Compare publishes ALL public data (live prices, store offers, price history) as sharded JSON files. Since 2026-10-09 they live by DEFAULT in the
Neon database (`DATABASE_URL`, table `PlaneFile`, created by the first import): no repository, no token, no `PLANE_*` variable. Steps 2 and 3 below
are ONLY for `PLANE_BACKEND=github` (a private data repository); SKIP them unless I ask for that. Neon also holds accounts, billing, alerts and ops state.
1. Specifxx/mtgcompare, Settings, Actions, General, Workflow permissions: **Read and write permissions**, Save.
2. ONLY IF I ASK FOR THE GITHUB BACKEND (then also set variable `PLANE_BACKEND` = `github` in Actions AND in Vercel): create a new **private** repository `Specifxx/mtgcompare-data`, completely empty (no README, no .gitignore, no licence). The
   import creates its `data` branch itself. Reuse it if it exists.
3. ONLY IF I ASK FOR THE GITHUB BACKEND: create two **fine-grained personal access tokens** (github.com/settings/personal-access-tokens/new), resource owner Specifxx,
   repository access **Only select repositories: `mtgcompare-data`**, expiration 1 year:
   - name `mtgcompare-plane-read`, permission **Contents: Read-only**. This value is `PLANE_TOKEN` (goes to Vercel only, A3).
   - name `mtgcompare-data-write`, permissions **Contents: Read and write** and **Administration: Read-only**. This value is
     `DATA_REPO_TOKEN` (goes to GitHub Actions secrets only).
   GitHub may ask me for my password, a passkey or a 2FA code when creating a token: that is a manual item (leave the tab open on
   the token form). Never print a token. Tokens are shown once: put each straight into its field.
4. Specifxx/mtgcompare, Settings, Secrets and variables, Actions, **Secrets**: `DATABASE_URL` (the Neon pooled string),
   `CRON_SECRET` (a new random secret; keep it for A3), `AUTH_SECRET` (a new random secret; **the same value goes to Vercel in A3**).
   (`DATA_REPO_TOKEN` only with the GitHub backend.)
5. Same page, **Variables**: `SITE_URL` = SITE_URL and `REVALIDATE_URL` = SITE_URL (both set after A3 knows the Vercel URL; come back
   and set them), `NEXT_PUBLIC_EBAY_CAMPAIGN_ID` = `5339155912`,
   `INDEXNOW_KEY` = `43ac93dd97a44d4894bedf52d621c57c`.
6. OPTIONAL, skip unless I ask: Actions secret `OPS_WEBHOOK_URL` (a Discord or Slack webhook for freshness and failure alerts; alerts only print in
   the log without it) and Actions secret `TARGET_DATABASE_URL` (only when a Neon project must be replaced: the `migrate-database` maintenance task is a
   green no-op without it; never a Vercel variable). `PLANE_BRANCH` defaults to `data`: leave it unset.
7. Do NOT create a `main` branch now (that happens in B1).

### A3. Vercel: new project
1. https://vercel.com/new: import **Specifxx/mtgcompare** into the **same team as RiftCompare**. Project name `mtgcompare`,
   framework Next.js, everything else default. Note the production URL Vercel assigns: that is SITE_URL
   (`https://mtgcompare.vercel.app`, or the variant Vercel chose). Then finish A2.3.
2. "Build skipped" or "Canceled" on every deployment is **normal and correct**: production builds only on the weekly release
   (Tuesday 08:00 UTC) or for a commit whose subject line contains `[deploy]`, and **preview deployments are off** (they build only for
   a subject containing `[preview]`, which I add myself when I want one). Nothing deploys until the site is ready. Do not "fix" it,
   do not trigger a deploy now, and do not enable preview deployments or create preview environment variables.
3. Settings, Environment Variables, for the **Production** environment only (preview deployments are turned off for this project, so there is no Preview scope to fill; names exact; secrets are never copied from any other project):
   - `DATABASE_URL` = the Neon pooled string
   - `CRON_SECRET` = the same value as GitHub's
   - `AUTH_SECRET` = the same value as the GitHub secret of that name (A2.4)
   - (`PLANE_BACKEND`, `PLANE_REPO` and `PLANE_TOKEN` only with the GitHub backend: leave them unset otherwise)
   - `NEXT_PUBLIC_SITE_URL` = SITE_URL
   - `INDEXNOW_KEY` = `43ac93dd97a44d4894bedf52d621c57c`
   - `NEXT_PUBLIC_EBAY_CAMPAIGN_ID` = `5339155912` (my existing public eBay Partner Network campaign id)
   - `NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK` = `https://partner.tcgplayer.com/c/7385758/1780961/21018` (my existing public TCGplayer
     Impact link)
   - `NEXT_PUBLIC_CONTACT_EMAIL` = leave **unset** (the site shows a placeholder until I choose an address)
   - `ADMIN_EMAILS` = leave **unset** (the built-in admin is mastermisclick@gmail.com; setting it REPLACES that)
   - `ADMIN_TOKEN` = leave unset
   - `GITHUB_DISPATCH_TOKEN` = leave unset (optional: it only enables "Run" buttons in the admin panels)
4. Settings, Git, Production Branch: leave as is for now (B1 sets it to `main`).
5. Is the team on a plan that allows commercial use (Pro)? Read the plan on Settings, Billing. If it is Hobby, add a manual item
   ("MTG Compare has ads, affiliate links and subscriptions: Vercel Hobby is non-commercial, move this team to Pro") with the
   billing tab left open. Do not upgrade.

### A3b. Vercel Web Analytics
In the Vercel project, open the **Analytics** tab and click **Enable** (Web Analytics; the site already contains the component, nothing is
sent until this is on). Custom `buy_click` events need a Pro or Enterprise plan: if Vercel says the plan does not include custom events,
make it a manual item and continue.

### A4. Google sign-in: a new OAuth client
1. console.cloud.google.com: **New project** "MTG Compare" (reuse if it exists).
2. APIs & Services, OAuth consent screen (Google Auth Platform): app name "MTG Compare", support and developer e-mail = my
   Google account's, audience External, authorized domain = the host of SITE_URL if Google accepts it (a `vercel.app` host
   usually cannot be added as an authorized domain: if so, leave it empty and note it under PROBLEMS), home page SITE_URL,
   privacy `SITE_URL/privacy`, terms `SITE_URL/terms`, scopes `openid`, `userinfo.email`, `userinfo.profile`, then **Publish
   app** (In production). If Google demands verification, make it a manual item and continue.
3. Credentials, Create OAuth client ID, Web application "MTG Compare web": authorized JavaScript origin = SITE_URL; authorized
   redirect URI = `SITE_URL/api/auth/oauth/google/callback`.
4. Put the client id and secret into Vercel as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (Production).

### A5. Discord sign-in (optional but do it)
1. discord.com/developers/applications: **New Application** "MTG Compare" (reuse if it exists).
2. OAuth2, Redirects: add `SITE_URL/api/auth/oauth/discord/callback`, Save.
3. Copy Client ID and (Reset) Client Secret into Vercel as `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.

### A6. Stripe: a NEW account inside my Rift Compare organization
1. dashboard.stripe.com: account switcher (top left). Find my existing **Rift Compare organization** and add a new account named
   **MTG Compare** inside it (reuse it if it exists). If the UI offers no organization option, use "New account" and tell me under
   PROBLEMS which one you used. Do NOT change anything in Rift Compare's own account.
2. Stay in **test mode (sandbox)** for now: Developers, API keys, reveal the **test secret key** (`sk_test_...`) and put it in Vercel
   as `STRIPE_SECRET_KEY` (Production) and in GitHub as the Actions secret `STRIPE_SECRET_KEY`.
3. Settings: public business name "MTG Compare", statement descriptor `MTGCOMPARE`, support e-mail = my Google account's,
   brand colour `#9140da` and icon `SITE_URL/icon-512.png` (Settings, Branding; the setup script only reads these and prints what is off), and Customer emails: turn on **successful payments** receipts. Skip anything that asks for identity, bank
   or tax details: that is **manual item "Activate payments on the MTG Compare Stripe account"** (leave that tab open on the
   activation page). Live-mode keys come after activation (see the end of phase C).
4. The products, prices and webhook are created in phase B (they need the code).

### A7. Google Analytics 4
analytics.google.com, Admin, in the **same account as RiftCompare**: Create property "MTG Compare" (my time zone and currency), add a Web
data stream for SITE_URL with Enhanced measurement on, and put the Measurement ID (`G-...`) in Vercel as `NEXT_PUBLIC_GA_ID`
(Production). (Reuse the property if it exists.)

### A8. eBay developer portal: share Rift Compare's keyset (it is read-only for you)
My decision: MTG Compare uses up to 1,000 eBay API calls a day, always **after** Rift Compare, on Rift's existing keyset.
1. developer.ebay.com/my/keys: find the application RiftCompare uses (its name contains "Rift"; if you cannot tell which, make it a
   manual item and leave the page open). Open its **Production** keyset.
2. **Read only.** Copy its **App ID (Client ID)** and **Cert ID (Client Secret)** through the clipboard into the GitHub Actions
   **secrets** `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` of Specifxx/mtgcompare. Never into Vercel, never into chat, never into
   any other project. Do not edit, regenerate or reconfigure anything in that application, including its notifications.
   (The Marketplace Account Deletion endpoint stays Rift's: one application has one endpoint.)
3. In GitHub Actions **Variables** set (only the names that `docs/SETUP.md` lists once it exists; set these three now):
   `EBAY_KEYSET_MODE` = `shared`, `EBAY_OBSERVE_ONLY` = `0` (spending on; `1` would make the job read the quota only),
   `EBAY_DAILY_CALL_BUDGET` = `1000`. Leave
   `EBAY_API_ENABLED` unset (it is the kill switch, default on) and leave `EBAY_VERIFICATION_TOKEN` / `EBAY_DELETION_ENDPOINT` unset
   (the deletion endpoint stays Rift's in shared mode).
4. If the portal asks me to accept an agreement, that is a manual item.

### A9. Affiliate property forms (manual, queue them)
Create manual items (open the page, do not submit): Impact (TCGplayer affiliate) add SITE_URL as a promotional property on the existing
account; eBay Partner Network add SITE_URL as a traffic source on the existing campaign.

## Phase B: needs the finished site (run only when it is live)

**Readiness check (do this first).** Open `SITE_URL/` and `https://raw.githubusercontent.com/Specifxx/mtgcompare/claude/compassionate-wright-1tr8wt/docs/SETUP.md`.
The site is READY only if all of these hold: the Vercel project has a Production deployment in state Ready; the home page returns
HTTP 200; its text contains "MTG Compare"; it contains neither "One Piece" nor "OP Compare"; and `docs/SETUP.md` exists and mentions
"MTG Compare". If any of these fails, write **"phase B: site not ready"**, put every step below under DEFERRED, skip to the report. Do
not try to make it ready: the code is still being built and a deploy happens only when I say so.

If READY, read `docs/SETUP.md` fully first (its names win), then:

**B1. Branch and production branch.** GitHub, Code, branches: create `main` from `claude/compassionate-wright-1tr8wt` and make it the
default branch (Settings, General). Vercel, Settings, Git, Production Branch = `main`. Never delete the original branch.

**B2. Schema and data.** GitHub, Actions: run the workflow that publishes the data (named in docs/SETUP.md, expected: **Import
prices**) on `main` and wait for green (it can take up to ~75 minutes; it publishes into the `PlaneFile` table of the Neon database (GitHub backend: the private data repo's `data` branch) and
creates the Neon tables). Then run the **data-hook** workflow once (it tells the site the new data is there). In
`Specifxx/mtgcompare-data` confirm a `data` branch now exists. If anything fails, copy the failing step's error text into PROBLEMS
("DATABASE_URL is not set" means the Actions secret is missing; with the GitHub backend a 404 or "token rejected" means `PLANE_TOKEN` or `DATA_REPO_TOKEN` is wrong or missing: check the scopes in A2.3).

**B3. Stripe products and webhook (test mode).** Run the **Stripe setup** workflow (branch main). Its log lists the products and
prices (Plus and Premium, monthly and yearly). In Stripe (MTG Compare account, test mode): Developers, Webhooks, Add endpoint
`SITE_URL/api/stripe/webhook` with exactly the events docs/SETUP.md lists (expected six: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_succeeded`, `customer.subscription.created`,
`customer.subscription.updated`). Put its signing secret (`whsec_...`) into Vercel as `STRIPE_WEBHOOK_SECRET` (Production). Run
Stripe setup again: it should report all events subscribed.

**B4. First production deploy.** Run **Production deploy** (branch main) once, wait for Ready in Vercel. After this, production
deploys by itself **once a week (Tuesday 08:00 UTC)**; data refreshes never need a deploy.

**B5. Verify the live site.** Open SITE_URL and check, reporting pass or fail for each:
- the home page shows card counts and prices, and **a "Chase cards on eBay right now" strip directly under the hero** with an
  "Ad - live listings on eBay" label (tiles may link to eBay searches until the eBay job has data);
- `/browse` lists cards and search finds "Lightning Bolt"; a card page shows a price table with **"Buy on TCGplayer" and a highlighted
  "Buy on eBay"** button;
- `/sitemap.xml` loads and its URLs start with SITE_URL; `/robots.txt` loads;
- `/login` shows Google (and Discord) sign-in; sign in with my Google account;
- sign in as **mastermisclick@gmail.com**: the account menu shows **Admin** and `SITE_URL/admin` loads (accounts, subscriptions,
  inbox, store health, eBay budget, data publication status, deploy cadence, database footprint). Signed out or as another account,
  `/admin` is an ordinary 404;
- `/premium` shows live Plus and Premium buttons; Deal Finder, Rising Cards and Demand Finder are shown as paid features and show
  only a preview to a free account;
- `/tools/deal-finder` shows a preview when signed out or free.
Optional (only if I said yes in this chat): a test checkout with a 100%-off coupon, then cancel it.

**B6. eBay job smoke test.** In GitHub Actions run the eBay workflow (**eBay prices**, `ebay-prices.yml`) with its smallest settings,
**not** between 21:05 and 23:30 UTC (the daily import window). With `EBAY_OBSERVE_ONLY=1` it must spend zero calls; report the quota
line it prints. Do not change `EBAY_OBSERVE_ONLY`.

**B7. Weekly release and data freshness.** In GitHub Actions confirm the **Production deploy** workflow's schedule is one cron,
Tuesday 08:00 UTC (`0 8 * * 2`), and report whether it has run. Open `SITE_URL/admin/data` and `SITE_URL/admin/deploys` as the admin
and report the data pointer's age (it should be under 26 hours after the first import) and the next release time.

## Phase C: depends on a domain or on services I may add later (queue as manual or deferred, do not block on them)

- **Domain.** There is none. Make one manual item: "Choose and buy a domain for MTG Compare (there is an existing 'MTG Compare UK' site at
  mtgcompare.com, so check the name first)". When I later give you the domain, run this switch: Vercel, Domains, add it (and `www`
  redirecting to the apex); set `NEXT_PUBLIC_SITE_URL` (Vercel) and `SITE_URL` (GitHub variable) to the new URL; add the new URL to the Google
  OAuth client (origin and redirect), the Discord redirect, the Stripe webhook URL (create the new endpoint, move the signing secret, remove the
  old one), then redeploy.
- **Search Console and Bing** (needs the domain): property, DNS TXT verification, sitemap submit, `GSC_SA_KEY` secret from the existing
  Google service account (Search Console, Settings, Users and permissions, add the service-account e-mail with Full), Bing import. DEFERRED.
- **E-mail (Resend)** (needs the domain and a contact address): a NEW Resend account, verify the domain, API key with sending access in GitHub
  secrets `RESEND_API_KEY` and `EMAIL_FROM`, `EMAIL_LINK_SECRET` (random, same in GitHub and Vercel). DEFERRED.
- **Live payments.** After I activate the Stripe account: live secret key into Vercel and GitHub `STRIPE_SECRET_KEY`, rerun Stripe setup on
  live, create the live webhook, replace `STRIPE_WEBHOOK_SECRET`, redeploy. Make this one manual item with the Stripe tab open, and tell me the
  five steps in the MANUAL list.
- **Later eBay account.** If I get a separate eBay application, I will tell you; then `EBAY_KEYSET_MODE` becomes `own` with its own keys.

## Final report

Print the report in the shape described under "How this run works", and finish by listing the open tabs in the order I should
work through them.

---
