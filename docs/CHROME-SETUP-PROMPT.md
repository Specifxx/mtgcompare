# Claude in Chrome — OP Compare setup prompt

Paste everything between the lines into Claude in Chrome. After the first deploy, also run docs/CHROME-QA-PROMPT.md. Before you do, log in
to:
- GitHub, Vercel, Neon, Google (Cloud Console, Analytics and Search Console),
  Stripe and Discord, using the same accounts as RiftCompare;
- the registrar of **opcompare.app**.

---

You are setting up the production infrastructure for **OP Compare**, a One Piece
Card Game price-comparison website at **https://opcompare.app**. Its code is
finished in the GitHub repo **Specifxx/OpCompare** (branch
`claude/tender-noether-2na98p`). It is the sister site of RiftCompare (repo
Specifxx/TCGEmpire, site riftcompare.com). It must get its **own** of each of
these:
- Neon database
- Vercel project
- Google sign-in client and Discord app
- Stripe account
- Google Analytics property
- Search Console property

**The domain is `opcompare.app`. I already own it.** Use exactly
`https://opcompare.app` (no `www`, no trailing slash) wherever a site URL is
asked for. `.app` domains are HTTPS-only, so the site won't load until Vercel
has issued its certificate. That takes a few minutes after the DNS is right,
and it's normal.

Ground rules:
- **RiftCompare is read-only.** Never change, delete or rotate anything of
  RiftCompare's:
  - its Vercel project
  - its GitHub repo or secrets
  - its Neon projects
  - its Stripe account
  - its Google Cloud or OAuth clients
  - its GA or GSC properties
  - riftcompare.com's DNS

  You may only READ values from RiftCompare where a step says so.
- **No money, no guesses.** Do not buy anything (domains, paid plans) and do not
  add a payment method. If a step needs money, legal or business details I
  haven't given (for example Stripe's activation form), or a decision, stop and
  ask me.
- **Ask before deleting DNS.** Never delete an existing DNS record on
  opcompare.app without asking me first.
- **Keep secrets in their fields.** Never paste secret values into chat, issues
  or commit messages. Only put them in the secret or env-var fields named below.
- **Track and report.** Keep a running checklist. Finish with a summary of what
  you did, every value you set (secrets shown only as "set") and anything left.

**Random secrets:** whenever a step says "generate a random secret", open
https://www.random.org/strings/?num=3&len=20&digits=on&upperalpha=on&loweralpha=on&unique=on&format=plain&rnd=new
and join the three lines into one 60-character string. Use a fresh one each
time. You need two:
- `CRON_SECRET`
- `AUTH_SECRET`

## 1. Neon — new database
1. Open https://console.neon.tech and create a **new project** `opcompare`:
   - Postgres 16 or newest
   - region **AWS US East (N. Virginia)**
   - free plan
2. Copy the **pooled** connection string (Connect → "Pooled connection" on; it
   contains `-pooler` and ends with `?sslmode=require`). This is `DATABASE_URL`.

## 2. GitHub — Specifxx/OpCompare
1. **Create `main`.** Code → branches → New branch `main`, source
   `claude/tender-noether-2na98p`. Then Settings → General → Default branch →
   `main`.
2. **Workflow permissions.** Settings → Actions → General → Workflow
   permissions → **Read and write permissions** → Save. The daily release pushes
   to `main`, and the import pushes price history to a `data` branch that it
   creates itself.
3. **Secrets.** Settings → Secrets and variables → Actions → **Secrets**:
   - `DATABASE_URL` = the Neon pooled string
   - `CRON_SECRET` = a random secret (keep it for step 3)
   - `GSC_SA_KEY` = added in step 9
   - `STRIPE_SECRET_KEY` = added in step 6
   - `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` = optional, added in step 11a
     from OP Compare's OWN new eBay application (never RiftCompare's values)
4. **Variables.** Same page → **Variables**:
   - `SITE_URL` = `https://opcompare.app`
   - `GSC_PROPERTY` = `sc-domain:opcompare.app`
   - `INDEXNOW_KEY` = `43ac93dd97a44d4894bedf52d621c57c` (RiftCompare's public
     IndexNow key, reused on purpose)

## 3. Vercel — new project and the domain
1. **Create the project.** https://vercel.com/new → import
   **Specifxx/OpCompare** in the same team as RiftCompare. Project name
   `opcompare`, framework Next.js, defaults otherwise.
2. **Environment variables.** Settings → Environment Variables, for
   **Production and Preview**:
   - `DATABASE_URL` = the Neon pooled string
   - `CRON_SECRET` = the same value as GitHub's
   - `AUTH_SECRET` = a NEW random secret (never RiftCompare's)
   - `NEXT_PUBLIC_SITE_URL` = `https://opcompare.app`
   - `INDEXNOW_KEY` = `43ac93dd97a44d4894bedf52d621c57c`
   - `ADMIN_EMAILS`: usually **leave it unset**. The code's built-in admin
     is `mastermisclick@gmail.com` (it opens `/admin` and counts as Premium).
     Setting `ADMIN_EMAILS` REPLACES that default, so if I want another admin
     address too, set it to a comma-separated list that **includes
     `mastermisclick@gmail.com`**. Never copy RiftCompare's value.
   - `ADMIN_TOKEN`: leave unset unless I ask for script access to the admin
     API. Then generate a NEW random secret of at least 32 characters (for
     example `openssl rand -hex 32`), put it in Vercel only (never GitHub,
     never a URL), and never reuse RiftCompare's.

   Then copy these from RiftCompare's Vercel project, but only the ones it
   has. Read the values there and change nothing:
   - `EBAY_AFFILIATE_CAMPAIGN`
   - `TCGPLAYER_IMPACT_LINK`
   - `NEXT_PUBLIC_USD_TO_AUD`, `NEXT_PUBLIC_USD_TO_GBP`,
     `NEXT_PUBLIC_USD_TO_SGD`, `NEXT_PUBLIC_USD_TO_CAD`,
     `NEXT_PUBLIC_USD_TO_EUR`

   Never copy RiftCompare's `EBAY_CLIENT_*` values: create OP Compare's own
   eBay application and keys (section 11a; GitHub secrets only, never Vercel).
   `EBAY_VERIFICATION_TOKEN` and `EBAY_DELETION_ENDPOINT` are new values for
   OP Compare too, set in section 11a. Do NOT copy any of
   these either: `RM*`, `RH*`,
   `HISTORY_DATABASE_URL*`, `AUTH_SECRET`, `STRIPE_*`, `*_PRICE_ID`, Google or
   Discord OAuth, Resend, Brevo, AdSense.
3. **Production branch.** Settings → Git → Production Branch = **`main`**.
4. **Domains.** Settings → Domains → add **`opcompare.app`**, then
   **`www.opcompare.app`** set to **redirect to `opcompare.app`** (308).
5. **DNS.**
   - If `opcompare.app` appears on the team's **Domains** page (bought
     through Vercel or on Vercel nameservers), Vercel configures it. Wait for
     **Valid Configuration**.
   - Otherwise:
     1. Find the registrar at
        https://lookup.icann.org/en/lookup?name=opcompare.app.
     2. Add **exactly the records Vercel shows**: an A record on `@` and a
        CNAME on `www`. Don't change nameservers. Ask me before removing a
        conflicting record, such as a parking page.
     3. If you can't access the registrar, stop and tell me which one it is.

   Wait for Valid Configuration and certificates on both names.
6. **"Build skipped" is normal.** Production builds only for commits whose
   subject contains `[deploy]`. Leave those messages alone; step 8 deploys.

## 4. Google sign-in — a new OAuth client
1. **Project.** https://console.cloud.google.com → project picker → **New
   project** "OP Compare". Make sure it is selected.
2. **Consent screen.** APIs & Services → **OAuth consent screen** (Google Auth
   Platform):
   - App name "OP Compare"; user support email and developer contact = my
     email
   - Audience **External**
   - Authorized domain `opcompare.app`
   - Home page `https://opcompare.app`, privacy policy
     `https://opcompare.app/privacy`, terms `https://opcompare.app/terms`
   - Data access / scopes: `openid`, `.../auth/userinfo.email`,
     `.../auth/userinfo.profile`
   - Then **Publish app** (In production). These basic scopes need no Google
     review. If Google asks for verification anyway, tell me and continue.
3. **Client.** **Clients / Credentials → Create OAuth client → Web
   application** "OP Compare web":
   - Authorized JavaScript origin: `https://opcompare.app`
   - Authorized redirect URI:
     `https://opcompare.app/api/auth/oauth/google/callback`
4. **Vercel.** Copy the client ID and secret into Vercel as
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (Production and Preview).

(Only if creating a project is impossible: RiftCompare's existing client could
take that redirect URI too, but its sign-in screen would say "RiftCompare".
Ask me before touching it.)

## 5. Discord sign-in (optional, recommended)
1. https://discord.com/developers/applications → **New Application** "OP
   Compare" (add the logo from https://opcompare.app/icon-512.png once the
   site is up).
2. OAuth2 → Redirects → add
   `https://opcompare.app/api/auth/oauth/discord/callback` → Save.
3. Copy the Client ID and (Reset) Client Secret into Vercel as
   `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.

## 6. Stripe — a separate account for OP Compare
1. **Separate account.** https://dashboard.stripe.com → account switcher (top
   left) → **New account** named "OP Compare". It must NOT be RiftCompare's
   account: RiftCompare matches every subscription in its account to its own
   users by email.
2. **Activate payments.**
   - Use the same business details as RiftCompare's account where Stripe offers
     to copy them.
   - Public business name **OP Compare**; statement descriptor **OPCOMPARE**;
     website `https://opcompare.app`; support email = my email.
   - If Stripe needs anything else (identity, bank account, tax details), stop
     and ask me.
3. **Branding and receipts.**
   - Settings → Branding: the logo from https://opcompare.app/icon-512.png,
     brand colour `#d92b33`.
   - Settings → Customer emails: turn on **successful payments** receipts.
4. **Secret key.** Developers → API keys → reveal the **live secret key**
   (`sk_live_…`). Put it in:
   - the Vercel env var `STRIPE_SECRET_KEY` (Production and Preview)
   - the GitHub secret `STRIPE_SECRET_KEY`
5. **Create products and prices.** GitHub → Actions → **Stripe setup** → Run
   workflow (branch main). Wait for green. Its log lists:
   - the two products (OP Compare Plus, OP Compare Premium)
   - four prices: Plus $2.99/month and $23.99/year; Premium $4.99/month and
     $39.99/year
   - the portal configuration

   It ends with "WEBHOOK MISSING", which is expected at this point.
6. **Webhook.** Stripe → Developers → Webhooks → **Add endpoint**:
   - URL `https://opcompare.app/api/stripe/webhook`
   - events, exactly these six:
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `invoice.paid`
     - `invoice.payment_succeeded`
     - `customer.subscription.created`
     - `customer.subscription.updated`

   Reveal the **Signing secret** (`whsec_…`) and put it in Vercel as
   `STRIPE_WEBHOOK_SECRET` (Production).
7. **Check.** Run **Stripe setup** once more. The log should now end with
   "all six events subscribed".

## 7. Load the data
GitHub → Actions → **Import prices** → Run workflow (branch main, defaults).
It does three things:
- creates the tables;
- imports ~7,300 cards, ~420 sealed products and prices from ~386 stores;
- creates the `data` branch, where the price history is published.

Wait for green (10–20 min). If it fails, open the log and report the error to
me.

## 8. First production deploy
1. GitHub → Actions → **Production deploy** → Run workflow (branch main).
2. In Vercel → Deployments, wait for the production deployment to be
   **Ready**. Then open **https://opcompare.app** and check:
   - the homepage shows card counts and prices; `/browse` lists cards; a card
     page shows a price table;
   - `/sitemap.xml` loads and its URLs start with `https://opcompare.app/`;
   - `/indexnow.txt` shows the key;
   - `https://www.opcompare.app` redirects to `https://opcompare.app`;
   - `/login` shows "Continue with Google" (and Discord, if set up);
   - sign in with my Google account: it lands on `/account`;
   - sign in as **mastermisclick@gmail.com**: `/account` says "Premium (owner
     account)", the account menu shows **Admin**, and **https://opcompare.app/admin**
     loads (Accounts, Subscriptions, Store health, Inbox). Signed out, or as
     any other account, `/admin` must be an ordinary 404 page;
   - `/premium` shows "Get Plus" and "Get Premium" buttons, not "Opening soon";
   - **share images (link thumbnails):** paste `https://opcompare.app` and
     `https://opcompare.app/price-guide` into https://www.opengraph.xyz/ and
     into a Discord message (a private channel or DM is fine), and open
     Reddit's *Create post → Link* with each URL to see its preview (do not
     submit the post). Each must show the price-guide image: the OP Compare
     logo, "ONE PIECE PRICE GUIDE" and a table of five real cards with
     prices. If it shows an empty grey "ghost" table instead, tell me: the
     image rendered before the data was ready. Also check one card page, one
     set page and one sealed page in the same tester.
3. Optional end-to-end payment test (ask me first). In Stripe, create a coupon
   at 100% off for one month and a promotion code `OWNERTEST`.
   1. Sign in on the site with a second Google account.
   2. On `/premium`, start Plus monthly and enter `OWNERTEST`.
   3. Confirm the welcome page says "You're Plus!" and the footer ads
      disappear.
   4. Then in Stripe: cancel that subscription immediately, and deactivate the
      promotion code and the coupon.

## 9. Google Analytics 4 and Search Console
1. **GA4.**
   1. https://analytics.google.com → Admin, in the **same account as
      RiftCompare** → Create → Property "OP Compare", with my time zone and
      currency.
   2. Add a Web data stream for `https://opcompare.app` with Enhanced
      measurement on.
   3. Put the Measurement ID (`G-…`) in Vercel as `NEXT_PUBLIC_GA_ID`
      (Production).
2. **Search Console property.**
   https://search.google.com/search-console → Add property → **Domain** →
   `opcompare.app`.
   1. Add the TXT record it shows on `@` wherever opcompare.app's DNS lives
      (Vercel → Domains → opcompare.app → DNS Records, or the registrar).
   2. Click **Verify**, retrying for up to ~30 minutes.

   Only if you cannot add DNS records: use a **URL prefix** property
   `https://opcompare.app/` with the **HTML tag** method instead.
   1. Put the `content` value in Vercel as `GOOGLE_SITE_VERIFICATION`
      (Production).
   2. Run Production deploy and wait for Ready, then click Verify.
   3. Set the GitHub variable `GSC_PROPERTY` to `https://opcompare.app/`.
3. **Service account access.** Search Console → Settings → Users and
   permissions → Add user: the service-account email (ends
   `.iam.gserviceaccount.com`) that RiftCompare's property lists as a user →
   **Full**.
4. **`GSC_SA_KEY`.** Google Cloud Console → IAM & Admin → Service accounts →
   that account → Keys → Add key → JSON. Open the downloaded file in a tab and
   paste its full contents into the GitHub secret `GSC_SA_KEY`. If you can't
   open it, ask me to paste it.
5. **Sitemap.** Search Console → Sitemaps → submit
   `https://opcompare.app/sitemap.xml`.
6. **Bing.** https://www.bing.com/webmasters → Add site → **Import from Google
   Search Console** → `opcompare.app`. Then submit the sitemap there too.
7. **Redeploy.** Run **Production deploy** once more so the GA ID (and any
   verification tag) take effect.

## 10. Turn on the search workflows
1. GitHub → Actions → **Search Console** → Run workflow. Its summary should
   show "Sitemap submit … HTTP 204" or "200".
2. GitHub → Actions → **IndexNow submit** → Run workflow. It should report
   URLs submitted.

## 11. Affiliate housekeeping (optional — ask me before submitting forms)
- Impact (TCGplayer affiliate): add `https://opcompare.app` as a promotional
  property on the existing account.
- eBay Partner Network: nothing required (OP Compare's clicks are tagged
  `oc-…`). Optionally add `https://opcompare.app` as a traffic source.

## 11a. eBay developer portal — a new application for OP Compare (ask me first)

OP Compare searches eBay's Browse API with its OWN eBay application, which has
its own 5,000 calls a day. Rules for this section:
- **Ask me before accepting any eBay agreement or submitting a Growth Check.**
- **Never open or copy the RiftCompare app's keys.** Using them would silently
  spend RiftCompare's quota.
- Never echo the App ID, Cert ID or verification token in the chat or the report.

1. **Confirm the deletion endpoint is live.** Run, or open in the browser:
   `https://opcompare.app/api/ebay/marketplace-deletion?challenge_code=test`.
   It must return `{"challengeResponse":"<64 hex characters>"}`. If it returns
   500, the two Vercel variables below are missing from the live deployment.
2. **Token and Vercel variables.** Generate a 48-character token of
   `[A-Za-z0-9_-]` (random.org strings as above, letters and digits only). In
   Vercel → OP Compare → Settings → Environment Variables (Production), set, if
   they aren't set yet:
   - `EBAY_VERIFICATION_TOKEN` = that token;
   - `EBAY_DELETION_ENDPOINT` = `https://opcompare.app/api/ebay/marketplace-deletion`
     (exactly: apex host, no trailing slash, no query).

   If you only just set them, **stop here and tell me**: Vercel applies them
   at the next production release (08:00 UTC daily), and step 1 must pass first.
3. **The portal** (developer.ebay.com, my existing account). Create a **new
   application** named "OP Compare". Then Application Keys → that app →
   **Notifications** → Alerts and Notifications → Marketplace Account Deletion:
   enter an alert email (ask me which), the endpoint URL and the token exactly as
   in step 2, click **Save** (eBay sends the challenge), then **Send Test
   Notification** — it should succeed (HTTP 200).
4. **Production keys.** Enable the **Production** keyset for the new app. Copy
   the App ID and the Cert ID into GitHub → `Specifxx/OpCompare` → Settings →
   Secrets and variables → Actions → **secrets** `EBAY_CLIENT_ID` and
   `EBAY_CLIENT_SECRET`. Not Vercel. Check that no organisation-level secret of
   the same name exists.
5. **Smoke test.** GitHub → Actions → **eBay prices** → Run workflow with
   `only_market` = `US` and `max_calls` = `50`, **not** between 07:00–08:10 or
   19:00–20:10 UTC (it can cancel a waiting import). Report the
   `eBay quota: …` line, the `eBay US: due …` funnel line, the `eBay rejects:`
   line and whether `⚠ another app is spending this keyset` appeared.

## 11b. Wave-2 features: what to switch on (ask me before each paid or irreversible step)

The member area, alerts, Best Basket and the rest of the RiftCompare features are
live. A few of them stay **off until you set the services below**, exactly like
the eBay keys: nothing breaks while they are off, and the site makes no promises
it can't keep.

### 11b-1. Email (Resend), a NEW account for OP Compare
Do NOT use RiftCompare's Resend account (its 100 emails a day would be split).
1. Create a Resend account with opcompareofficial@gmail.com.
2. Add the domain `opcompare.app`. In the domain's DNS (at the registrar or
   Vercel DNS, wherever opcompare.app's DNS lives) add the records Resend shows:
   SPF, DKIM, the bounce MX, and a DMARC TXT `v=DMARC1; p=none`. Wait for Resend
   to show the domain as **Verified**.
3. Create an API key with **Sending access** only. Don't show it in chat.
4. In GitHub, Specifxx/OpCompare → Settings → Secrets and variables → Actions,
   add the secrets: `RESEND_API_KEY` (the key), `EMAIL_FROM`
   (`OP Compare <alerts@opcompare.app>`).
5. Generate a 32+ character random string and save it as `EMAIL_LINK_SECRET`
   in BOTH GitHub Actions secrets and Vercel (Production environment). It must be
   the same value in both.
6. Optional: `EMAIL_REPLY_TO` = opcompareofficial@gmail.com, and
   `ALERT_DAILY_BUDGET` (default is fine).
7. In Actions, run the **Email** workflow once. When it's green the site starts
   promising email (alerts, welcome mail). If it isn't, tell me the error.
Then ask me whether to approve updating the privacy policy to name Resend.

### 11b-2. Postage data for Best Basket
Actions → **Shipping rates** → Run workflow (outside 07:00–08:10 and
19:00–20:10 UTC). It opens a pull request with measured store postage; tell me
the PR link, don't merge it unless I say so.

### 11b-3. Check the plan and trial settings (read only)
In Stripe (the OP Compare account), open Settings → Billing → Customer portal and
confirm plan switching between Plus and Premium (monthly and annual) is allowed
with proration. Report what you see; change nothing.

### 11b-4. Optional extras (ask me which I want)
- `NEXT_PUBLIC_ADSENSE_CLIENT_ID` once AdSense approves opcompare.app.
- `NEXT_PUBLIC_TCGPLAYER_CREATIVES` (Impact banner creative ids).
- `DISCORD_URL` (an invite link for the header icon).

### 11b-5. Final check
After the next deploy, open https://opcompare.app/alerts and
https://opcompare.app/dashboard signed in, and report whether the pages mention
email (they should only once 11b-1 is done).

## 12. Report
Give me:
- the live URL, and whether `www` redirects;
- the Neon project name and region;
- every GitHub secret and variable, and every Vercel env var (names only);
- the Google OAuth project and client name, and whether the consent screen is
  in production;
- the Discord app name;
- the Stripe account name, the products and prices created, the webhook URL and
  its event count;
- the GA4 measurement ID;
- the GSC property, its verification status, and whether Bing is set up;
- the results of the Import / Stripe setup / Production deploy / Search
  Console / IndexNow runs, of the sign-in test, of the `/admin` check, and
  of the share-image checks (which testers showed the price-guide image);
- the eBay section: app created (yes/no), notification test result, secrets
  set (names only), and the smoke-test lines;
- anything you could not finish, and why.

---
