# Running BandaiCompare

The daily price import (`refresh-prices.yml`, 03:17 UTC, with eBay once the
keys exist) commits data to `main`, and that commit (its subject carries
`[deploy]`) is the day's only production build. There is no database, no
email and no account system. First-time setup (Vercel project, domain,
secrets, search engines) is the Claude in Chrome prompt in
`docs/CHROME-SETUP-PROMPT.md`.

## Day to day

* An urgent code release: Actions → Production deploy → Run workflow.
* The ops monitor runs every three hours and fails (GitHub emails you) when
  data goes stale, stores break or eBay stops.
* Adding stores: add candidates to `research/candidate-hosts.txt`, run
  Actions → Probe stores, review the printed listing, then copy the store
  into `src/content/stores.ts`.
* eBay: BandaiCompare's own app (owner rule, 2026-11-01; the owner supplies it), 2,500 calls a day
  (`SITE.ebay.dailyBudget`). This site serves that app's Marketplace Account
  Deletion endpoint (`/api/ebay/account-deletion`, `EBAY_VERIFICATION_TOKEN`
  in Vercel): keep it deployed while the keyset exists.

## Keeping Vercel cheap

* One build a day (the data commit). `claude/*` branches never deploy and
  previews only build for a `[preview]` subject.
* Nothing database-backed is prerendered: card and set pages render on first
  visit and are cached for six hours (cards, sets, hubs).
* Card art comes straight from TCGplayer's CDN; Vercel image optimisation is
  off.
* `data/` ships inside every function. Three games hold over 21,000
  TCGplayer products, so cards under US$1 in every printing stay out except in
  sets from the last 120 days (`catalogMinCardCents`). Measure `data/` before lowering it.
