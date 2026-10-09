# Claude in Chrome: finish the MTG Compare launch (one pass)

Paste everything below the line into Claude in Chrome. It is idempotent: it checks each item and only changes what is missing.

---

You are completing the launch of MTG Compare (code repo `Specifxx/mtgcompare`, branch `claude/compassionate-wright-1tr8wt`). Work in ONE pass, in a new tab per site, and never print or paste a secret value into chat.

**Hard rules.** Never open or change anything for Rift Compare (its Vercel project, Neon project, Stripe account) except reading the eBay developer portal keyset page. Do not spend money, do not accept legal terms for me, do not enter payment cards. If an action needs me (CAPTCHA, 2FA, identity or bank verification, a card, a legal acceptance), write it on a MANUAL list, leave that tab open, and continue with the next item. At the very end, print the MANUAL list in order.

**Context.** The first import failed at the final `git push`: the GitHub Actions repo has no `DATA_REPO_TOKEN` secret and no `PLANE_REPO` variable. Everything else in the import worked. Fixing this is the top priority.

## 1. GitHub: data repository and Actions settings (top priority)
1. Open https://github.com/Specifxx/mtgcompare-data. If it does not exist, create it as PRIVATE, empty (no README). Make sure a branch can be created by pushes (the importer creates branch `data`).
2. Open https://github.com/settings/personal-access-tokens . Check whether two fine-grained tokens exist for `mtgcompare-data`:
   - `mtgcompare-data-write`: repository access ONLY `Specifxx/mtgcompare-data`, permission Contents: Read and write. No expiry shorter than 1 year.
   - `mtgcompare-data-read`: same repository, Contents: Read-only.
   Tokens cannot be re-read, so if you cannot see a token value, create new ones (name them with today's date). Copy each value straight into the place that needs it; do not write it anywhere else.
3. Open https://github.com/Specifxx/mtgcompare/settings/secrets/actions and make sure these exist (add or update): `DATA_REPO_TOKEN` = the write token; `PLANE_TOKEN` = the read token (the mail workflows read this one); plus anything already there stays.
4. Open https://github.com/Specifxx/mtgcompare/settings/variables/actions and make sure: `PLANE_REPO` = `Specifxx/mtgcompare-data`.
5. Open https://github.com/Specifxx/mtgcompare/actions/workflows/import-prices.yml and press "Run workflow" on branch `claude/compassionate-wright-1tr8wt`. Leave the tab open. Report whether the run started. (Phase 1 takes about 3 minutes, phase 2 35 to 75 minutes later; the run must go green, if it goes red open the failing step and copy me the last 15 log lines with any secrets blanked.)

## 2. Vercel: production environment
Open the Vercel project for MTG Compare only (project name containing `mtgcompare`). Under Settings, Environment Variables, make sure these exist for PRODUCTION only (no Preview, no Development) and that none is empty:
- `PLANE_REPO` = `Specifxx/mtgcompare-data`
- `PLANE_TOKEN` = the read-only token from step 1 (mark Sensitive)
- `DATABASE_URL` (Neon, pooled), `AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_EBAY_CAMPAIGN_ID` = `5339155912`, `NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK` = `https://partner.tcgplayer.com/c/7385758/1780961/21018`
- Stripe keys, Google OAuth, Discord, GA4, Resend if I already set them (do not invent values).
Compare the full list with the table in `docs/SETUP.md` of the repo (open it on GitHub) and list any name that is missing. Confirm Settings > Git > Production Branch is `claude/compassionate-wright-1tr8wt` (or `main` if it exists), Settings > General > Ignored Build Step uses `scripts/vercel-ignore-build.sh`, and Analytics is enabled. If you changed any variable whose name starts with `NEXT_PUBLIC_`, put "needs a redeploy" on the MANUAL list (the build inlines it).

## 3. eBay (live)
1. https://github.com/Specifxx/mtgcompare/settings/variables/actions : set `EBAY_KEYSET_MODE` = `shared`, `EBAY_DAILY_CALL_BUDGET` = `1000`, `EBAY_OBSERVE_ONLY` = `0` ONLY if the Actions secrets `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` exist (check the secrets page). If either secret is missing, leave `EBAY_OBSERVE_ONLY` = `1` and put "eBay keys missing" on the MANUAL list.
2. Never run `ebay-prices.yml` between 21:05 and 23:30 UTC. Outside that window, run it once from https://github.com/Specifxx/mtgcompare/actions/workflows/ebay-prices.yml and report whether the run is green and its "spent" line.
3. In the eBay developer portal, verify the Marketplace Account Deletion endpoint points at `https://<production site>/api/ebay/marketplace-deletion` with the verification token matching the Vercel variable named in `docs/SETUP.md`. Read only for the Rift Compare keyset; never edit it.

## 4. Stripe (live)
1. In the NEW Stripe account for MTG Compare (inside my organization, not Rift Compare's), check whether live mode is activated. If activation needs business details, bank or identity verification, put it on the MANUAL list and stay in test mode.
2. If live mode is active: create a restricted live secret key per `docs/SETUP.md` section on Stripe; set the live `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` in Vercel Production and the GitHub Actions secrets; run the "Stripe setup" workflow (https://github.com/Specifxx/mtgcompare/actions/workflows/stripe-setup.yml) so live prices with lookup keys `mtgcompare_{plus,premium}_{month,year}` exist; create a live webhook to `https://<production site>/api/stripe/webhook` with the events listed in `docs/SETUP.md` and store its signing secret as `STRIPE_WEBHOOK_SECRET` in Vercel. Put "redeploy needed for live Stripe keys" on the MANUAL list.

## 5. Verify the live site
After the import run is green: open the production site. Check and report pass/fail for: home loads with prices; the "Chase cards on eBay right now" strip sits directly under the hero (it may be empty until eBay has run); a card page (search for Lightning Bolt) shows "Buy on TCGplayer" and "Buy on eBay"; /price-guide and /sets load; /pricing shows Plus and Premium; /admin returns a 404 when signed out; signing in with Google works and `mastermisclick@gmail.com` can open /admin; /sitemap.xml loads. Then open https://github.com/Specifxx/mtgcompare/actions/workflows/data-watchdog.yml and run it once; report its result.

## 6. Final answer
Print: (a) a table of items DONE / ALREADY DONE / FAILED, (b) the ordered MANUAL list with the tab each one is in, (c) any failing log lines (secrets blanked). Do not add `[deploy]` to anything yourself; if a redeploy is needed, say so and I will ask Claude Code to make the release commit.
