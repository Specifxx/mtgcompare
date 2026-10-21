# Working in this repo

MTG Compare is a **sealed-only** Magic: The Gathering price comparison site: booster boxes, bundles, Commander decks and other
sealed product, compared across independent stores in AU, US, UK, CA, NZ, EU and SG, with eBay and TCGplayer affiliate links. Since
2026-10-21 it is a port of DexCompare's sealed app (`Specifxx/CompareEmpire`, `apps/dexcompare-sealed`), not the old singles site:
no card database, no accounts, no Premium, no price history. Read `README.md`, then `DEPLOY.md`, then `DECISIONS.md`. The old
singles site is in git history before 2026-10-21; nothing of it is on `main`.

## Data: on GitHub, never a database read from a page

- The importers (`scripts/import.ts`, `scripts/ebay-import.ts`, run by `.github/workflows/sealed-import.yml` and `ebay-import.yml`)
  write Neon, then export every public table to `data/public/` and commit it to `main` (`scripts/publish-public-data.sh`). The site
  reads those files (`src/lib/public-data/`). No page, route or build reads Neon in the default `files` mode.
- Neon is `DATABASE_URL` in its own schema, `sealed` (`src/lib/db.ts` `withSchema`, and the workflows): never write the default
  schema, which holds the old singles site's tables.
- Never edit `data/public/` by hand: it belongs to the workflows.

## Deploys

Production builds only a commit whose SUBJECT carries `[deploy]` (`scripts/vercel-ignore-build.sh`,
`tests/vercel-ignore-build.test.ts`). The evening sealed import's data commit carries it: one release a day. **Never put `[deploy]`
in a code commit's subject on your own initiative**; code rides the next data release. "Ship it" means land on `main`. Use
`release.yml` (or `[deploy]`) only when the owner says it is urgent, and say so. Previews build only with `[preview]` in the
subject, only when the owner asks.

## Rules that keep prices on the right product

- `src/lib/sealed-title.ts` `identify()` decides what a store title is, and refuses rather than guesses: singles, graded,
  accessories, other games, other languages, store-made bundles and damaged product are left out. Wrongly merging two products is
  worse than missing one. Every rule changed gets a real store title in `tests/sealed-title.test.ts`.
- A region compares only stores that charge in its currency; prices are never converted for display.
- Stores live in `src/data/stores.json` (Shopify or WooCommerce, the store's Magic sealed collections).
- Pages are `force-dynamic` and cached by Vercel's CDN through `next.config.js` headers, never ISR; no page reads a cookie, header
  or session (`tests/cache-ttl.test.ts`).

## eBay

- Only `scripts/ebay-import.ts` (GitHub Actions) calls eBay's Browse API; the website never calls eBay and holds no eBay credential.
- The keyset in this repo's secrets has been shared with RiftCompare: the workflow caps itself at 1,500 calls a day unless
  `EBAY_DAILY_CAP` says otherwise. Never raise a cap on your own initiative.
- eBay rows are labelled ads, in their own block, never counted as a store and never re-ranked into store rows.

## Legal copy

Wizards of the Coast's Fan Content Policy line (`FAN_CONTENT_DISCLAIMER`, `src/lib/site.ts`) stays in the footer, `/about` and
`/terms`. Product photos are the stores' (or TCGplayer's) own, hotlinked. Never invent a price, an MSRP, a pack count or a release
date: a fact we are not sure of is left out.

## Checks

```
npx prisma generate
npm run typecheck
npm run lint
npm test
```

Record non-obvious decisions in `DECISIONS.md` (newest at the bottom).
