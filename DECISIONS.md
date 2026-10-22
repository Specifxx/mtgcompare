# Decisions

Newest at the bottom. The old singles site's decision log (2026-09 to 2026-10-20) is in git history: `git show 7e0d746:DECISIONS.md`.

## 2026-10-21 — MTG Compare becomes sealed-only, a port of DexCompare

**Owner:** "there's too many cards in Magic the Gathering … make the site MTG compare exactly like dex compare … get rid of all the
cards … only focus on sealed products … price all the sealed products comparing stores across the globe … eBay and TCG affiliates
… we still want the blog posts … I want all the data on the GitHub, ideally."

- The repository was replaced with DexCompare's sealed app (`Specifxx/CompareEmpire` `apps/dexcompare-sealed` at `25ba16b`),
  adapted for Magic: the title classifier, the product types and sets, the store list (`src/data/stores.json`, built from the old
  registry and DexCompare's stores by probing each store's Magic sealed collections), TCGplayer's Magic sealed catalogue, the eBay
  queries, the brand (Arcane Ink: amethyst and brass), the guides, and the blog (the old posts that make sense for sealed product,
  same slugs).
- Removed with the singles site: the card catalogue (Scryfall/TCGCSV), accounts, Stripe Plus/Premium, alerts, collections, decks,
  price history, the admin panels, the Neon data plane and the weekly release cadence.
- **Data on GitHub** (as DexCompare): the imports commit `data/public/` to `main` and the site reads the bundled files. Neon stays
  only as the importers' working store, in a new schema `sealed` of the existing database, so the old tables are not touched.
- **Releases are daily again**: the evening import's data commit carries `[deploy]`, because a data refresh is now a commit (the
  weekly-release rule existed for the Neon data plane, which needed no deploy).
- **eBay calls default to 1,500 a day** (`ebay-import.yml`), not DexCompare's 2,500: the keyset has been shared with RiftCompare.
- RiftCompare has no Magic section, so the product page's price-history link is off (`src/lib/riftcompare.ts` `RIFT_SECTION`).

## 2026-10-22 — Vercel cost cut to the bone

**Owner:** "I don't want MTG Compare doing more than like $1 a day … reduce any cost features."

- **Vercel Web Analytics is off** (`src/components/SiteAnalytics.tsx` renders nothing, `src/lib/track.ts` is a no-op, the
  `@vercel/analytics` package is removed): it bills page views and custom events.
- **Link prefetching is off by default** (`src/components/Link.tsx` wraps `next/link`): every page is force-dynamic, so each
  prefetched link was a billed server render, whether or not anyone clicked it.
- **The eBay strip API is cached 6 hours at the CDN** (was 1): its data changes once a day.
- **More crawlers are refused in robots.txt**: SEO-tool crawlers (Ahrefs, Semrush) and AI-training crawlers, which render the long
  tail and send no visitors. Search engines and AI search crawlers still read the site.
- Unchanged and already cheap: no database reads from pages, no crons, no ISR writes, no image optimisation, one release a day.
