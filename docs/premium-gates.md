# Premium gates: who sees what

<!-- GENERATED from gateMatrix() (src/lib/premium-gates.ts) through paidToolRows() (src/lib/plans.ts). Do not edit the table by hand: print paidToolRows() again when plans.ts or tier-limits.ts change. tests/tier-comparison-rows.test.ts reads the matrix and TIER_COMPARISON back. -->

Deal Finder is Plus and Premium; Rising Cards and Demand Finder are Premium. The cut happens ONCE, in the loader, after the tier-neutral ranking is computed: the page or route mints an opaque `Entitlement` (`entitlementOf(user)`; a failed user read is signed out, never Premium) and `src/lib/premium-gates.ts` (`accessFor`, `rowLimit`, `gate`) decides how many rows leave the server. Rows are limited in the query, never hidden with CSS, a locked preview component takes no data props, and below full access every refinement (sort, page, store picker, scope, window, "only my cards") is coerced to the default view and the API answers 402. An admin counts as Premium.

| Tool | Path | From | Signed out | Free account | Plus | Premium (and admin) |
|---|---|---|---|---|---|---|
| Deal Finder | `/tools/deal-finder` | Plus | Deal count | Top 3 | Every deal | Every deal |
| Rising Cards | `/tools/rising` | Premium | Preview | Top 3 | Top 3 | Full list |
| Demand Finder | `/tools/demand` | Premium | Top 10 searched | Top 10 searched | Top 10 searched | Top 25 searched & viewed |

The free strips are the same for everyone and live in cached HTML: the home page and `/movers` show one Deal Finder row and the real total, the clear Rising preview slice and the top 10 most searched cards over seven days.

## What Premium never gates

Premium sells only OUR analytics: Deal Finder's ranking and member tools, Rising Cards, Demand Finder, history beyond the free window, alert counts, Best Basket, exports of our own computed data and the ad-free experience. It never gates card names, images, oracle text, legalities, search, set browsing, set pages, prices, or any Scryfall field, and there is no bulk or API export of Scryfall data (Scryfall's terms: "You may not paywall access to Scryfall data"). `tests/premium-gates-pages.test.ts` fails on a Scryfall-derived loader behind `isPremium`. Every Wizards-IP page stays free. Nothing paid is a file: the only demand-derived published files are the two preview slices (`pv/`).
