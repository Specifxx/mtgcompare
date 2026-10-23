# Vercel cost audit (2026-10-23)

## What could and could not be measured

- **No Vercel token or dashboard access** in the session that wrote this: per-project usage (CPU, transfer, ISR writes,
  invocations) could not be measured, and nothing here attributes the team bill to MTG Compare.
- Measured: a local `next build` + `next start` in the default `files` data mode, response sizes by `curl` (raw, gzip, and the
  `RSC: 1` payload), on the 2026-10-23 data.

| Path | HTML | HTML gzip | RSC payload |
| --- | ---: | ---: | ---: |
| `/` | 190,761 B | 29,550 B | 96,759 B |
| `/us` | 340,801 B | 30,177 B | 177,053 B |
| `/us/sealed` | 234,323 B | 24,553 B | 58,774 B |
| `/us/p/star-trek-play-booster-box` | 241,171 B | 31,785 B | 108,838 B |
| `/us/deals` | 440,626 B | 35,115 B | 229,519 B |
| `/us/sets` | 245,940 B | 23,983 B | 132,748 B |
| `/us/guides` | 158,179 B | 21,592 B | 84,886 B |
| `/api/browse/us` | 531,157 B | 85,091 B | n/a |

The pages' weight is rendered markup (on `/us/deals`: 1,316 `className` props, about 97 KB of class strings, 48 product cards),
not an embedded data blob: no full price history, all-store list or unused fields ride in the payload. Nothing was cut; a markup
diet would change the interface for a few KB gzipped.

## Already in place before this audit (DECISIONS.md, 2026-10-17 to 2026-10-23)

- Every data page is `force-dynamic` + `Vercel-CDN-Cache-Control: public, s-maxage=86400, stale-while-revalidate=86400`
  (`next.config.js` `CDN_PAGES`); no page reads a cookie, header or session (`tests/cache-ttl.test.ts`).
- `/api/revalidate` does nothing in `files` mode (the release deploy empties the cache), so imports purge nothing.
- Web Analytics, Speed Insights and custom `track()` events were removed (owner, 2026-10-22: "no more than like $1 a day"). The
  cost brief asked to keep `@vercel/analytics` with a `beforeSend` filter; the repo's owner decision wins, so it stays off.
  GA4 events go through `src/lib/gtag.ts`, a no-op until `NEXT_PUBLIC_GA_ID` is set.
- Link prefetching is off; images are `unoptimized` (hotlinked store photos), so `minimumCacheTTL` does not apply.
- The middleware matcher runs only on upper-case region prefixes (`/AU...`): `_next`, static files, images and normal pages skip it.
- robots.txt already refuses SEO-tool, data and AI-training crawlers (AhrefsBot, SemrushBot, MJ12bot, DotBot, PetalBot,
  Bytespider, DataForSeoBot, BLEXBot, GPTBot, CCBot, ClaudeBot, Google-Extended and more); search engines and answer engines
  (OAI-SearchBot, PerplexityBot, Claude-SearchBot) stay allowed; `/api/` and `/*?` are disallowed for all. No `Crawl-delay` was
  added: Googlebot ignores it and Bingbot obeys it, so it would only slow Bing.
- Production builds only a `[deploy]` subject (one data release a day); previews are off.

## Changes in this audit

1. **`/api/browse/<region>` leaves ISR**: `force-static` + `revalidate = 86400` became `force-dynamic` with its own
   `Cache-Control: public, s-maxage=86400, stale-while-revalidate=86400`. It was the one ISR surface every release rewrote: seven
   region indexes (US measured at 531,157 B raw), billed as ISR writes per 8 KB on top of the CDN copy.
2. **Docs-only `[deploy]` commits do not build** (`scripts/vercel-ignore-build.sh`): a release commit that changed only `*.md` or
   `docs/` is skipped; an empty `[deploy]` commit (`release.yml`) still builds. Pinned in `tests/vercel-ignore-build.test.ts`.

Not changed: the sitemap files stay ISR (eight small files, prerendered at build); OG images are prerendered static files.

## Expected effect

Qualitative only (nothing billed could be measured): no ISR writes or reads for the browse index, and no build or CDN purge from a
docs-only release. The big levers (CDN-cached pages, one release a day, no analytics, no prefetch) were already pulled.
