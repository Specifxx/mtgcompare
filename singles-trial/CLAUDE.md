# Working in this repo

TCG Singles DB: single-card prices, price history and movers for trading card games, one game at a time (owner, 2026-11-17:
"a new website dedicated just for TCG singles … every TCG game"). The card engine is MTG Compare's (`Specifxx/mtgcompare`,
`lib/cards.ts`) made game-agnostic. It is a copy, not a synced sister: change this repo on its own. Read `README.md`, then
`DECISIONS.md`. Game and brand facts live only in `src/site.config.ts`; engine code never names a game.

## One game at a time

A game is imported and routed only while `live: true` in `site.config.ts`. Order (DECISIONS.md, 2026-11-18): Pokémon, Yu-Gi-Oh!,
the games no sister site covers, Magic only after MTG Compare's indexing read (about 9 Dec 2026), then One Piece, Riftbound,
Lorcana and Gundam last. Turn a game on only when the one before it passed its gate: 30% of its released cards indexed three
weeks after launch. Never copy Magic here while MTG Compare serves the same cards: two of our hosts must not compete for one card.

## Google is rationed, not the catalogue

Every card has a live page; a card is indexable and in the sitemap only once the import released it (`ix`, `lib/cards.ts`):
US$1 and up, most valuable first, 1,000 per game on its first run, then `CARD_INDEX_GROWTH` (repository variable, default 250)
a day; `0` pauses it. Never put unreleased cards in a sitemap, never raise the numbers without the owner's go: two earlier card
sites put tens of thousands of URLs in front of Google and got the homepage indexed.

## URLs are frozen

`/<game>/<set>/<card>`. Set and card slugs are kept forever once given (`mergeSet`, the import's `slugByGroup`); a card that
leaves TCGplayer's list 308s to its set. No path change ships without a redirect map and a test. The host never changes.

## Data: files, never a database

`scripts/import.ts` (GitHub Actions only: the cloud container cannot reach tcgcsv.com) writes `data/cards/<game>/`,
`data/history/<game>/` and `data/meta.json`, and `card-prices.yml` commits them. Pages read them through `src/lib/store.ts`,
the one seam: if `data/` nears 150 MB (`tests/cost-rules.test.ts`) move the reads there, not in the pages. Never edit `data/`
by hand, never write anything private to it.

Prices are TCGplayer's market price only (recent sales, US$). Never invent a price, never show an ask as a price, never convert.
History starts the day this site first read a card; never backfill it from anywhere.

## Deploys are gated: never add `[deploy]` to a commit subject

One production build per 12 hours, production only (owner, 2026-11-02). Production builds only a commit whose SUBJECT carries
`[deploy]` (`scripts/vercel-ignore-build.sh`); the daily import's data commit on `main` carries it: one release a day. Code
rides the next one. `[urgent]` overrides the 12-hour gap only when the owner says so. Previews are off.

## Cost rules (`tests/cost-rules.test.ts`)

Pages are `force-dynamic` and cached by Vercel's CDN for a day (`next.config.js`), never ISR; no `generateStaticParams`; no page
reads a cookie or header; plain `<a>` and `<img>` (no prefetch, no image optimisation); no database; no accounts; no mail key.

## Money

"Check on eBay" first (a tagged search, campaign 5339155912, customid prefix `tcgsdb`; no price claimed), TCGplayer second,
always through `/out/tcgplayer` (a bot is sent on untagged). This site has NO eBay keyset and must never be given one or pointed
at a sister's. No banner ads, no pop-ups, no interstitials.

## Names and art

Card and set names describe what is priced. Images are TCGplayer's own, hotlinked. Never use a publisher's logo, card art or
characters as decoration, and keep `SITE.disclaimer` in the footer, `/about` and `/terms`.

## The site watches itself

`ops-monitor.yml` runs `scripts/ops-monitor.ts` every six hours. A new scheduled job, external source or limit gets a check there.

## Checks

```
npm run typecheck
npm run lint
npm test
```

Record non-obvious decisions in `DECISIONS.md` (newest at the bottom).
