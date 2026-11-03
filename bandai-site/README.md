# Cyberpunk Compare

Free Cyberpunk TCG price comparison (cyberpunkcompare.com): every card and
sealed product TCGplayer lists, Beta and Retail, compared across TCGplayer,
eBay and Cyberpunk TCG stores (US, UK, Canada, Australia, EU), updated daily.

Built on the Rift Compare playbook (riftcompare.com, repo `Specifxx/TCGEmpire`),
on the lean engine shared with Gundam Compare, Lorcana Compare and YGO Compare.
The only game-specific files are `src/site.config.ts` and `src/content/`
(stores, blog posts, pre-order copy), plus icons, share images, workflows and docs.

## How it works

```
GitHub Actions, daily 00:17 UTC (refresh-prices.yml)
  TCGCSV (TCGplayer catalogue + prices, category 92)
  + every Shopify store in src/content/stores.ts  (products.json)
  + eBay Browse API, budgeted (own app, 2,500 calls/day, cards from $10, all sealed)
  → data/public/*.json, data/history/<set>.json, data/state/*.json
  → commit to main with "[deploy]" in the subject  → one Vercel build a day
  → IndexNow ping
```

* **Public pages never touch a database** (there is none). They read the
  committed JSON (`src/lib/data.ts`), shipped with the deployment.
* **No accounts, no Premium, no email**: the site compares prices and earns
  through affiliate links (eBay, TCGplayer, Amazon).
* **Deploys are gated** (`scripts/vercel-ignore-build.sh`): production builds
  only when the commit subject has `[deploy]`; previews need `[preview]`;
  `claude/*` branches never deploy.

## Cyberpunk TCG specifics

* **Beta vs Retail.** Welcome to Night City exists twice under the same names:
  the Kickstarter Beta print (36-pack boxes) and the Retail print (24-pack
  boxes, 6 November 2026), at very different prices. `SITE.setEditions` keeps
  them apart: a store or eBay title counts for Beta only when it says Beta,
  36 packs or Kickstarter, and for Retail otherwise; a title naming both is
  skipped.
* **Rarities**: TCGplayer's codes (C, UC, R, E, S, IL, IO, IS, NR) are spelled
  out by `SITE.rarityNames`.
* **Card numbers** are bare ("012") within each TCGplayer group.

## Run locally

```
npm install
cp .env.example .env
npx tsx scripts/import-all.ts   # fetch data (EBAY_REFRESH=false to skip eBay)
npm run dev
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`.

## Going live

See `docs/SETUP.md` (and the Claude in Chrome prompt in `docs/CHROME-SETUP-PROMPT.md`).
