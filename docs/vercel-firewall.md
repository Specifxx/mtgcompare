# Vercel Firewall rules for MTG Compare

Paste-ready rules for **Project → Firewall → ⋯ → Configure → Add New… → Rule**, written for the dashboard's fields as Vercel documents them (WAF Custom Rules, Rate Limiting, Managed Rulesets and Bot Management, read 2026-10-19). Each rule says its name, its conditions (**If**, joined by **AND** unless it says **OR**), its action (**Then**) and why. Vercel's rule builder also accepts a plain-English description ("Generate Rule"); the sentence under each rule is written to work there too.

**Roll out in Log mode first.** Set every rule's action to **Log**, publish, and watch the Firewall overview for a day (group by the rule). Switch to the real action only once the matches look like what the rule is for. Rules take effect immediately and need no deploy.

**Order matters.** Custom rules run top to bottom, before the managed rulesets. A **Bypass** match skips the remaining custom rules and the Bot Protection ruleset. A **Deny** stops evaluation.

## Why not "rate-limit unverified bots" in one rule

The custom rule builder matches on what the request says (path, user agent, IP, JA4 digest, headers, country and the like), and a user agent can be faked. Vercel's own bot verification (IP ranges, reverse DNS, Web Bot Auth) is applied by the **Bot Protection managed ruleset**, which skips verified bots (Googlebot, Bingbot, OAI-SearchBot, PerplexityBot and the rest of Vercel's directory) and challenges every other client that does not behave like a browser.

So "unverified bots" is covered by two things together:

- **Bot Protection in Challenge mode.** An unverified scraper cannot pass the JavaScript challenge.
- **A per-IP rate limit on `/card/*`** for whatever gets through.

## The rules, top to bottom

### 1. `bypass-own-jobs` — Bypass

- **If** User Agent **starts with** `MTGCompare-`
- **AND** Request Path **does not start with** `/admin`
- **Then** Bypass

> Bypass requests whose user agent starts with MTGCompare- unless the path starts with /admin.

Our GitHub Actions jobs read the live site with honest, non-browser user agents:

- `MTGCompare-status/1.0` (`scripts/status-check.ts`)
- `MTGCompare-smoke/1.0` (`smoke-pages.ts`)
- `MTGCompare-crawl/1.0` (`crawl-check.ts`)
- `MTGCompare-build/0.1` (IndexNow, the publication audit, the Search Console report)

The import's data warm-up uses the same family. Bot Protection would challenge all of them, so the release gates and the watchdog would go red.

This user agent can be copied, so it buys a scraper nothing beyond what any browser gets.

### 2. `deny-scrapers-that-ignore-robots` — Deny

- **If** Request Path **does not start with** `/api/`
- **AND** User Agent **matches regex** (case insensitive):

  ```
  (Bytespider|ImagesiftBot|Timpibot|Shapbot|meta-externalagent|CCBot|GPTBot|MJ12bot|DotBot|PetalBot|DataForSeoBot|BLEXBot|Barkrowler|serpstatbot|SeekportBot|Scrapy|python-requests|python-urllib|aiohttp|httpx|Go-http-client|node-fetch|axios/|okhttp|Java/|libwww-perl|Wget|HeadlessChrome|PhantomJS)
  ```

- **Then** Deny. Optionally add persistent action **for 1 hour** (Pro): the IP is refused before the firewall even evaluates, so its further requests cost nothing.

> Deny requests to non-/api paths whose user agent matches Bytespider, ImagesiftBot, … HeadlessChrome or PhantomJS.

**The first fifteen names** are the bulk crawlers robots.txt already disallows (`src/app/robots.ts`, DECISIONS 2026-10-16 and 2026-10-17). A compliant one never fetches a page, so this rule only ever matches the ones that ignore robots.txt. Bytespider and ImagesiftBot are the usual offenders.

**The rest** are scraping libraries and headless browsers that no person browses with.

**What it leaves alone:**
- **`/api/`**, so Stripe's webhooks, eBay's Marketplace Account Deletion call (it must keep working while the keyset exists, CLAUDE.md) and our own beacons are never refused.
- **Googlebot, Bingbot, Ahrefs, Semrush and the AI search agents.** robots.txt allows them (OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User and the Claude agents).

`curl` is deliberately not in the list: the owner and these docs use it to check headers by hand. Add `curl/` if it shows up in the Firewall overview as real load.

### 3. `rate-limit-card-pages` — Rate Limit

- **If** Request Path **starts with** `/card/`
- **Then** Rate Limit:
  - **Fixed Window**, **Time Window 60 s**, **Request Limit 120**
  - **Key: IP** (add **JA4 Digest** as a second key on Pro, so one scraper rotating IPs from one TLS client is still counted)
  - **Then 429** (the default)

> Rate limit /card/ to 120 requests per minute per IP, then return 429.

**Why `/card/*`:** the card page is the route with by far the most URLs (99,000) and was 26K function runs per 12 h on 2026-10-16.

**Why 120 a minute:** no person views two card pages a second. A crawler that does is either a verified search engine, for which a 429 is a "slow down" (never a de-index), or a scraper.

**One rule covers both pages:** the share image `/card/<slug>/opengraph-image` sits under the same prefix.

**Limits and cost:**
- Hobby allows **one** rate-limit rule; Pro allows 40.
- Rate limiting is billed per allowed request on Pro (regional pricing), so a single prefix rule is the cheapest useful one.
- Counters are per region, so a client spread over regions can exceed 120 overall.

**Second rule (Pro, optional):** to cover every page rather than just cards, use the same rule with **Request Path does not start with `/api/`**, **AND** **does not start with `/_next/`**, and a limit of **300** a minute.

### 4. Managed rulesets (Firewall → Rules → Bot Management)

- **Bot Protection: Log for a day, then Challenge.** Verified bots are excluded automatically. Everything that is not a browser and not verified gets a JavaScript challenge.
  - This is the "unverified bot" rule.
  - It does not work behind another proxy (no Cloudflare in front of Vercel).
  - Our own jobs pass because of rule 1.
- **AI Bots: leave on Allow (or Log).** **Deny** would block every AI bot in Vercel's list, including the AI search agents robots.txt invites (OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot). The 2026-10-17 entry keeps the site visible to them on purpose. Rule 2 already denies the training crawlers that ignore robots.txt.

## How to check it worked

- **Firewall overview, grouped by rule.** Rule 2 should show a steady trickle of denied Bytespider and library user agents. Rule 3 should show 429s on a handful of IPs and none on Googlebot's ranges (look up any IP that hits it often).
- **Observability → Functions:** invocations on `/card/[slug]` should fall further, with no fall in Search Console's crawl stats for Googlebot.
- **Search Console → Settings → Crawl stats:** "Host status" stays green, and 429s stay a small share of responses. If they rise, raise rule 3's limit.

## Where the remaining invocations most likely come from (top 10)

Ranked from the only route-level numbers in DECISIONS.md: the 2026-10-16 entry's top routes, `/card/[slug]` at 26K per 12 h, then `/guides/[slug]`, `/sealed/[slug]`, `/sets/[slug]`, `/price-guide`, `/blog` and `/tools/box-ev`. Each route is then judged by how many URLs it has, how many CDN copies each URL keeps, and what still bypasses the CDN after the 2026-10-16/17 caching and the 2026-10-19 changes. The order below rows 1–7 is inference, not measurement. Vercel Observability → Functions, sorted by invocations, is the check.

1. **`/card/[slug]`.** About 99,000 URLs: 26,415 indexable and ~72,500 THIN, which stay crawlable from before. The CDN keeps each URL a day (since 2026-10-19 one copy, not one per market), so every first crawl of a URL each day is a render. A long-tail crawler revisits most URLs about daily, which makes this route a lower bound of ~99K renders a day if it all gets crawled. Since the THIN pages lost their links and sitemap entries, this should fall as crawlers stop finding them.
2. **`/card/[slug]/opengraph-image`.** One share image per card, a day at the CDN (`OG_CACHED`), drawn by satori on a miss: CPU-heavy per invocation. Fetched by Googlebot-Image, link previews and scrapers that follow `og:image`. Rule 3 covers it.
3. **`/sealed/[slug]`.** 3,760 URLs, and up to one CDN copy per IP country (33 market keys plus the US). Every non-US crawler region renders its own copy.
4. **`/sets/[slug]`.** 401 URLs × market keys, and the heaviest render: 2–5 MB of HTML for the biggest sets (DECISIONS 2026-10-19, "What Googlebot found"). Few URLs, but each miss costs the most CPU and Fast Origin Transfer.
5. **`/guides/[slug]` and `/blog/[slug]`.** Second on the 2026-10-16 list. Market pages (`postContext(country)` prices every section), so one copy per market key.
6. **`/cards/name/[slug]`.** 6,861 name hubs in the sitemap, a market page, one copy per key.
7. **`/commanders/[slug]`.** 3,467 commander hubs (1,645 in the sitemap from 2026-10-19), a market page. It also reads the published decks from Neon on a miss.
8. **`/price-guide` and `/browse`.** On the 2026-10-16 list. Market pages whose filters are query strings: robots.txt keeps crawlers off `?`, but every person's filter or page change is a fresh render (`_mk` keys are per market, and the queries vary).
9. **The `/api/*` routes the client calls:**
   - `/api/geo`: every first visit with no cookie, including headless scrapers that run JavaScript.
   - `/api/card/[slug]`: the QuickView, prefetched on hover.
   - `/api/me`: only with the `mc_auth` cookie.
   - `/api/click`: the outbound beacon.

   Never cached by design (private). robots.txt keeps search engines off them, but a JavaScript-running scraper makes 1–3 of them per page. Rule 2 and Bot Protection cut these.
10. **`/sitemaps/[section]`, `/sitemap.xml` and `/news-sitemap.xml`.** Route handlers with the five-minute public header (`publicDataHeaders`). Few URLs, but each miss reads a 10,000-URL section from the plane, and search engines re-fetch sitemaps often.

`/tools/box-ev` (on the 2026-10-16 list) has a day at the CDN since that entry, so it should now be a few renders a day. If it is still high in Observability, its 462 KB calculator payload is the next thing to cut.
