# TCG Singles DB

Single-card prices for trading card games: one page per card with TCGplayer's market price per printing, its price history and
the week's movers. Pokémon first; other games follow one at a time (`src/site.config.ts`).

- **Data**: `scripts/import.ts` reads TCGplayer's public catalogue and price files (via tcgcsv.com, no key) once a day in GitHub
  Actions (`card-prices.yml`) and commits `data/`. No database.
- **Pages**: `/<game>`, `/<game>/<set>`, `/<game>/<set>/<card>`, `/search`. Server-rendered, CDN-cached for a day.
- **Google**: every card has a page; only released cards are indexable and in the sitemap (`lib/cards.ts`, `CARD_INDEX_GROWTH`).
- **Earning**: tagged eBay search and TCGplayer (Impact) links. No eBay API.

## Run it

```
npm install
TCGCSV_FIXTURE_DIR=tests/fixtures/tcgcsv DATA_DIR=/tmp/tsdb IMPORT_DAY=2026-11-18 npx tsx scripts/import.ts
TSDB_DATA_DIR=/tmp/tsdb npm run dev
```

A real import needs network access to tcgcsv.com: run *Card prices* in GitHub Actions (on a branch it commits a trial without
a deploy marker).

## Set up (once)

1. Vercel project on this repository, production branch `main`, domain connected, `NEXT_PUBLIC_SITE_URL` set if the domain is
   not `tcgsinglesdb.com`.
2. Run *Card prices* once on `main`.
3. Search Console and Bing: verify the domain, submit `/sitemap.xml`.
4. Remove the repository variable `OPS_LIVE=0` once the site answers.
