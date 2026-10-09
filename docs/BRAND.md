> Repository copy of the brand spec (WP16, 2026-10-08). Paths such as `tools/`, `apply/` and `/home/user/...` and the "scratch copy" it mentions belong to the planning workspace it was written in; the applied result is in the source (`src/app/globals.css`, `tailwind.config.ts`, `src/components/Logo.tsx`, `scripts/gen-icons.ts`, `src/lib/og/`). Section 11 lists the owner's open questions: the name collision with the live "MTG Compare UK" site, the domain, dark versus light default, the Wizards Fan Content wording against a paid tier, "MTG" in the name, handles and the contact mailbox, and the amethyst's resemblance to Scryfall's purple.

# MTG Compare brand spec (WP16): "Arcane Ink"

Everything here was applied and tested against a scratch copy of the repo (`/home/user/mtgcompare` was not edited). The deliverable is executable: `tools/verify-apply.sh` takes a pristine OP Compare copy, applies the files and patches below, runs the global rename, and runs the real gates. Result of the last run: **1304 / 1304 tests pass, `tsc --noEmit` clean, `next lint` clean** (baseline was 1304 / 1304). `tests/theme.test.ts` 9/9, `tests/design-system.test.ts` 12/12, `tests/domain.test.ts` 3/3, `tests/og.test.ts` 31/31.

Not verified (say so plainly): `next build` and a live browser (Safari/Firefox `mask-image` on the new `logo-mask.svg`, the PWA install with the maskable icon, a real link-preview tester on the new share images). The share images were rendered through the real `ImageResponse` with the bundled fonts and looked at (see Preview files); real card art was not fetched, so art slots show the placeholder mark.

## 0. Contents of this directory

| Path | What |
|---|---|
| `brand-spec.md` | this file |
| `rename-table.md` | every `oc_`/`oc-`/`oc:`/`op-`/`op_`/`op:` key with file:line locations and owning work package (section 4 has the compact version) |
| `tokens/` | `globals.theme.css` (the exact `:root` and light blocks), `tailwind.colors.ts.txt`, `og-theme.ts`, `palette.json` (single source of truth), `contrast-table.md`, `tests.patch` |
| `apply/` | mirror tree of every file WP16 owns, final content; `DELETE.txt` lists two files to remove |
| `patches/` | 11 small edits in files other WPs own (layout, ThemeToggle, chrome copy, tests); `diff -u`, apply with `patch -p1` |
| `logo/` | `logo-mark.svg`, `logo-mask.svg`, `icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-icon.png`, `Logo.tsx`, `BrandLogo.tsx`, `Wordmark.tsx` (optional), `gen-icons.ts` |
| `fonts/` | `Cinzel-900.ttf` + `Cinzel-OFL.txt` (the one new OG font) |
| `preview/` | PNGs and `palette-demo.html` (self-contained, fonts embedded, `?theme=light` / `?theme=dark`) |
| `tools/` | `verify-apply.sh`, `build-apply.sh`, `rename-keys.mjs` + `rename-map.mjs`, `apply-cross-wp.mjs`, `gen-contrast.mjs`, `gen-logo.mjs`, `make-cinzel-900.py`, `build-demo.mjs`, `demo.src.html` |

### How WP16 (or the orchestrator) applies it

Run from the repo root; `B` is this directory.

```
cp -r $B/apply/. .                                  # 1. WP16's files
while read f; do [ -n "$f" ] && rm -f "$f"; done < DELETE.txt; rm DELETE.txt
for p in $B/patches/*.patch; do patch -p1 < "$p"; done   # 2. small edits in WP15/WP17 files + 2 tests
node $B/tools/rename-keys.mjs .                     # 3. the global key rename, ONCE (about 130 files, 392 replacements on a pristine copy)
node $B/tools/apply-cross-wp.mjs .                  # 4. brand-colour literals in other WPs' files (25 asserted edits)
npm run typecheck && npm run lint && npm test
```

Order matters in one place: the patches are written against pristine files, so apply them before the rename. Do step 3 as the first commit before any other WP branches (nothing else then thinks about key names); `rename-keys.mjs` is idempotent.

Dependencies on other packages: `tests/domain.test.ts` passes only after step 3 (it also reads the workflows, `.env.example`, `docs/SETUP.md`, `next.config.js`, `scripts/gsc-report.ts`, which the rename rewrites). `src/lib/og/theme.ts` keeps OP's `RARITY_TONE` / `printingDot` and `tests/og.test.ts` keeps OP fixtures (`manga`, `OP01`, ...): only the brand parts were changed; the vocabulary half belongs to WP01 (see 8.4).

---

## 1. Decision: three directions, one pick

Preview: `preview/directions-comparison.png` (same page, three palettes, real Tailwind output).

| | A. Arcane Ink (chosen) | B. Verdigris Ledger | C. Cinder Copper |
|---|---|---|---|
| Idea | scribe's ink and a scale of two prices: amethyst on indigo-tinted ink, brass accent | oxidised-copper balance: teal on blue-green ink, copper accent | alchemist's forge: burnt orange on warm charcoal, parchment accent |
| Brand fill / dark link / light link | `#9140da` / `#c394f4` / `#6a24b0` | `#0f766e` / `#4fd1c1` / `#0f6b64` | `#c2410c` / `#f59a5c` / `#9a3412` |
| Brand hue | 272 deg | 176 deg | 24 deg |
| White ink on the fill | 5.32:1 | 5.47:1 | 5.18:1 |
| Distinct from RiftCompare (green 148 deg) | yes, 124 deg away | no, 28 deg away: reads as "Rift, but bluer" | yes |
| Distinct from OP Compare (red 357 deg) | yes, 85 deg | yes | weak, 27 deg: red-orange next to red |
| Next to eBay blue `#0064d2` (211 deg) and TCGplayer sky (200 deg) on the same price board | clear: 61 deg and a purple/blue luminance step | poor: 35 deg, same luminance, two cool buttons side by side | best: complementary |
| Collides with a semantic colour | none (nearest: Discord blurple 235 deg, 37 deg away, only on the sign-in buttons) | `up` green (128 deg) and `emerald` status text: teal links read as "in stock" | `gold` (Premium/foil, 42 deg) and `down` red (348 deg) |
| Collides with a competitor | Scryfall's purple (`#5822AC` on its own docs page, 263 deg): 9 deg apart in hue, but ours is far lighter and brighter (lightness 55% against 41%): a mild resemblance, flagged in the open questions | none known | **mtgcompare.com, an existing live "MTG Compare UK" site, uses orange `#FF7400`**: the same name in the same niche; copying its colour would make the confusion worse |
| Colour-blind separation from eBay blue | good (luminance and chroma differ; labelled buttons) | poor | best |
| Arcane / ink / ledger / scale fit | strong (ink, amethyst, brass; mark = two prices overlapping) | good (verdigris on copper scales) but generic "fintech teal" | good (forge) but the loudest, and orange is a Magic rarity colour (mythic) |

**Pick A.** Reasons in order: (1) the largest unused arc of the hue wheel once Rift (green), OP (red), eBay/TCGplayer (blue), `up`/`down` and gold are accounted for is 235-348 deg; the brand sits inside it at 272 deg, toward the cooler end so it reads as ink-violet rather than magenta (37 deg from Discord's blurple, 76 deg from `down` red); (2) it keeps the eBay "Buy on eBay" button the highlighted one next to the brand-filled "Buy on TCGplayer" button; (3) it avoids the existing orange MTG Compare UK site; (4) it keeps `gold` free to mean Premium/foil, exactly as on both sister sites; (5) it evokes ink and arcana without a single Wizards trademark.

### Distinct from the sister sites (what actually differs)

| | RiftCompare | OP Compare | MTG Compare |
|---|---|---|---|
| Brand fill / 400 | `#1ea65c` / `#34d17e` | `#d92b33` / `#ff6b6b` | `#9140da` / `#c394f4` |
| Dark surfaces | graphite `#0a0c10`..`#333b4d` (hue 220) | same graphite on the web, navy `#070c16` in share images and icons | indigo ink `#0a0912`..`#3b3a54` (hue 245) |
| Text ramp | slate, blue-grey | slate, blue-grey | lavender-grey (hue 250) |
| Light page | `#f4f6f8` | `#f4f6f8` | `#f5f4fa` (faint lavender) |
| Logo | green "R" | straw hat | two overlapping rhombi, amethyst and brass |
| Default theme | dark | **light** (owner's call, DECISIONS "Light theme is the default") | **dark** (see 1.1) |
| Title face (share images) | (Rift's own) | Luckiest Guy (comic) | Cinzel Black (Roman inscriptional caps) |

### 1.1 Default theme: DARK

The brief says dark-first; RiftCompare defaults to dark; OP Compare switched to light on the owner's explicit request for OP. MTG Compare defaults to **dark**, with the light theme one toggle away and fully tested. This needs five coordinated edits, all in the patches/apply tree and verified: `DEFAULT_THEME = "dark"` and the boot script's fallback (`theme-shared.ts`), `<html data-theme="dark">` and `viewport.themeColor = "#0c0b14"` (`layout.tsx`, a WP15 patch), `useState<ThemeMode>("dark")` (`ThemeToggle.tsx`, WP15 patch), `THEME_COLOR` and the manifest colours, and the tests that pin them (`theme.test.ts`, `design-system.test.ts`). To flip back to OP's light default instead, revert exactly those spots (they are the only light/dark-default pins; the palette itself is independent of the default). This is the owner's call: see open questions.

---

## 2. Names, copy and legal strings (exact)

### 2.1 Identity strings (`src/lib/site.ts`, written in `apply/`)

| Constant | Value |
|---|---|
| `SITE_NAME` | `MTG Compare` |
| `SITE_SHORT` | `MTGCompare` |
| `SITE_TAGLINE` | `Magic: The Gathering card prices, compared` |
| `SITE_DESCRIPTION` | `Compare Magic: The Gathering card prices across stores in the US, Australia, the UK, Singapore, Canada and the EU. Every printing and sealed product, priced daily.` (163 characters) |
| Default page title (`layout.tsx`) | `` `Magic: The Gathering Card Prices — Compare Every Store | ${SITE_NAME}` `` (template stays `%s | MTG Compare`) |
| Organization JSON-LD | `alternateName: ["MTGCompare", "MTG Compare App"]`, `knowsAbout: ["Magic: The Gathering", "Magic: The Gathering card price comparison", "Trading card game prices", "Sealed trading card products"]` |
| Sister sites | `SISTER_SITES = [RiftCompare (https://riftcompare.com, Riftbound), OP Compare (https://opcompare.app, the One Piece Card Game)]`; `SISTER_SITE` kept as the first entry so About/Authors still compile |
| Wordmark | `MTG` + `Compare`, glued; "MTG" white, "Compare" `text-brand-400` (chrome); share images use `OG.brandWord` for "MTG" |

### 2.2 Share-image copy (`src/lib/og/compose.tsx`)

| Where | Text |
|---|---|
| Title line (replaces `ONE PIECE PRICE GUIDE`) | **`MTG PRICE GUIDE`**: "MTG" in `OG.brandWord` (#c394f4), "Price Guide" white, Cinzel Black, upper-case |
| Home footer | `Every card, the cheapest store in your market, updated daily` + host from `SITE_URL` |
| `/price-guide` footer | `Every printing in one table · sorted by price · updated daily` + `<host>/price-guide` |
| Blog footer default | `Live prices from the MTG Compare price guide` |
| Lockup | mark + `MTG` (brand-word) + `Compare` (white), Archivo 900 |
| `alt` of the 9 routes + `DEFAULT_OG_IMAGE.alt` | `Magic: The Gathering ... on MTG Compare: ...` (written into `apply/`) |

The host is derived from `SITE_URL`, so the share images follow a domain change with no edit.

### 2.3 Home hero (`CinematicHero.tsx`, WP15 patch applied and tested)

- H1: `<span className="text-brand-400">MTG</span> Card Prices` (+ ` in <place>` on a region home).
- Strong line: **`Buy Magic: The Gathering cards at the best price`**
- Sub (sm and up): `Price check any card and find the cheapest place to buy: live Magic card prices from every {adjective} store we track, plus five more markets in their own currency: {others}, updated daily.` ("daily", not OP's "twice a day": the owner's addendum has one daily import. Change it if the import cadence differs.)
- Search placeholder: `Search any Magic card…`
- Footer share line: `Find MTG Compare useful? Send it to someone who plays Magic.`

### 2.4 Footer (`Footer.tsx`, WP15 patch applied and tested; `tests/site-chrome.test.ts` pins it)

1. Site line: `MTG Compare · Magic: The Gathering card database & price comparison for the US, Australia, the UK, Singapore, Canada and the EU. Prices are sourced from public store listings and may be out of date — always confirm on the retailer's site.`
2. **Data attribution** (`DATA_ATTRIBUTION`, src/lib/site.ts): `Card data (names, rules text, legalities, set codes and collector numbers): Scryfall. Card images: TCGplayer, and Scryfall where TCGplayer has none and for the back faces of double-faced cards. Prices: TCGplayer market data and public store listings. For information only; Scryfall does not endorse MTG Compare.` (Scryfall links to https://scryfall.com.) The image sentence follows `IMAGE_PRIMARY` of src/lib/images.ts (with `NEXT_PUBLIC_IMAGE_PRIMARY=scryfall` it reads `Card images: Scryfall, and TCGplayer where Scryfall has none.`); until 2026-10-09 it said `Card data and images: Scryfall`, though most images are TCGplayer's.
3. Affiliate line (unchanged wording): `Affiliate links: as an eBay Partner Network affiliate and a TCGplayer affiliate, MTG Compare earns from qualifying purchases — at no extra cost to you.`
4. **Wizards of the Coast Fan Content disclaimer, verbatim from the policy** (the policy's template with the site name; `Fan Content Policy` links to https://company.wizards.com/en/legal/fancontentpolicy):
   > MTG Compare is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
5. **Unofficial fan site:** `MTG Compare is an independent, unofficial fan site. It is not endorsed, sponsored or approved by Wizards of the Coast, Hasbro or Scryfall. TCGplayer and eBay are retailers we link to as an affiliate and do not endorse this site. Magic: The Gathering and its card names, artwork, symbols and set names are trademarks or property of Wizards of the Coast LLC.`
6. Sister sites: `Playing Riftbound or the One Piece Card Game too? Our sister sites RiftCompare and OP Compare compare their card prices the same way.` (JSX maps over `SISTER_SITES`.)
7. `© {year} MTG Compare. All rights reserved.` (unchanged pattern)

The disclaimer asserts the site is "permitted under the Fan Content Policy". `scryfall-terms.md` section 4 explains why a paid Premium tier is the one open legal question; the stock sentence is used as written, and the owner should settle that point (open questions).

### 2.5 Affiliate disclosure and the eBay strip (`AffiliateDisclosure.tsx`, patch applied)

- eBay: `Affiliate link: as an eBay Partner Network affiliate, MTG Compare earns from qualifying purchases — at no extra cost to you.`
- TCGplayer: `Affiliate link: MTG Compare earns a commission from qualifying TCGplayer purchases — at no extra cost to you.`
- Both: the footer sentence in 2.4.3.
- Strip label (rendered upper-case by CSS): **`Ad · Live listings on eBay`**, heading `Chase cards on eBay right now`, then the disclosure under the tiles (preview shows it). `data-ad-placement` and the `rel` set are unchanged.
- "Free postage" under a tile is a positive cue, not a brand cue: it is `text-brand-400` in five places only because RiftCompare's brand is green. `apply-cross-wp.mjs` changes them to `text-emerald-400` (EbayChaseStrip, EbayPicksLive, EbayAdCarouselLive, EbayGradedLive, BestBasket). Without it, "Free postage" would render amethyst.

### 2.6 Trademark note on the name (flag, used as chosen)

The owner chose "MTG Compare", and it is used everywhere. Risks, none of which this work can settle: (a) "MTG" is Wizards' abbreviation of its mark (the logo is on their protected list; the bare letters in a descriptive name are common practice but not a licence); (b) **an existing live site is named "MTG Compare UK" (mtgcompare.com, checked 2026-10-08, orange `#FF7400`)**, a price comparison for UK stores: same niche, near-identical name; (c) Wizards can withdraw Fan Content permission at any time. No Wizards mark appears in the identity: no logo or logotype, no mana or guild symbol, no Planeswalker symbol, no card frame (see 9).

### 2.7 Social handles and contact (placeholders)

| Item | Value | Status |
|---|---|---|
| Contact e-mail default | `riftcompare@gmail.com` | Owner choice 2026-10-09 (the public contact address; shared with Rift Compare). Override with `NEXT_PUBLIC_CONTACT_EMAIL` |
| Discord | `NEXT_PUBLIC_DISCORD_URL` (unset: icon, footer link and nav entry render nothing) | unchanged mechanism |
| X / Twitter | `@mtgcompare` | PLACEHOLDER, unregistered; leave `twitter:site` out until the account exists (the layout sets only `card: summary_large_image`) |
| Reddit / YouTube | none | do not add `sameAs` entries before real URLs exist |
| E-mail sender | `MTG Compare <alerts@mtgcompare.app>` follows from the rename (`DEFAULT_EMAIL_FROM`) | placeholder domain, see 3 |

---

## 3. Domain constants

One constant: `SITE_URL` in `src/lib/site.ts`, default **`https://mtgcompare.app`**, overridden by `NEXT_PUBLIC_SITE_URL`. **It is a placeholder.** Probe on 2026-10-08 (one request each, descriptive User-Agent): `mtgcompare.app` resolves to Vercel and answers `503 x-vercel-error: DEPLOYMENT_PAUSED` (a domain already attached to a paused Vercel project: possibly the owner's, possibly not); `mtgcompare.com` is the live "MTG Compare UK" site; `mtgcompare.net` does not answer. Confirm ownership before launch.

Everything else that names the domain reads the same default and is rewritten by the rename (step 3): the six workflow fallbacks (`vars.SITE_URL || 'https://mtgcompare.app'`), `GSC_PROPERTY` (`sc-domain:mtgcompare.app`), the `www` redirect in `next.config.js`, `.env.example`, `docs/SETUP.md`, `docs/CHROME-SETUP-PROMPT.md`, `scripts/gsc-report.ts`, `scripts/stripe-setup.ts`, the ICS UID, `DEFAULT_EMAIL_FROM`. `tests/domain.test.ts` pins them (3/3 after the rename).

To swap the domain later: `rg -l 'mtgcompare\.app' . --glob '!node_modules' | xargs sed -i 's/mtgcompare\.app/NEWDOMAIN/g'`, then update `docs/` text that says ".app is HTTPS-only and HSTS-preloaded" if the TLD changes. The share images, canonicals, sitemap and JSON-LD need nothing else.

---

## 4. Cookie, storage and prefix renames (`oc_`/`op-` -> `mc_`)

`node tools/rename-keys.mjs <repo>` applies the whole table below. Full file:line locations and owning work packages: `rename-table.md`. Counts on the pristine copy: 131 files, 392 replacements; afterwards `rg '(oc[_:-]|op[_:])'` finds only the browserslist `not op_mini all`. Unprefixed keys (`theme`, `country`) are unchanged. DECISIONS.md and set slugs like `op-01` (One Piece data) are deliberately not touched.

| Old | New | Kind | Files | Owner WPs |
|---|---|---|---|---|
| `oc_session` | `mc_session` | cookie | 4 | WP17, WP18, tests |
| `oc_auth` | `mc_auth` | cookie | 8 | WP14, WP17, WP18, tests |
| `oc_adfree` | `mc_adfree` | cookie | 7 | WP06, WP17, WP18 |
| `oc_ref` | `mc_ref` | cookie | 2 | WP18, tests |
| `oc_signup_src` | `mc_signup_src` | cookie | 4 | WP18, tests |
| `oc_auth_placement` | `mc_auth_placement` | storage | 1 | WP18 |
| `oc_signup_session` | `mc_signup_session` | storage | 1 | WP18 |
| `oc_pending_watch` | `mc_pending_watch` | storage | 2 | WP18, tests |
| `oc_premium_surface` | `mc_premium_surface` | storage | 2 | WP18, tests |
| `oc_chunk_reload_at` | `mc_chunk_reload_at` | storage | 2 | WP15 |
| `oc_card_views` | `mc_card_views` | storage | 2 | WP06, tests |
| `oc_postage` | `mc_postage` | storage | 2 | WP13, tests |
| `oc_entry` | `mc_entry` | storage | 1 | WP18 |
| `oc_trade` | `mc_trade` | storage | 1 | WP13 |
| `oc_tip` | `mc_tip` | storage | 1 | WP15 |
| `oc_promo_session` | `mc_promo_session` | storage | 1 | WP18 |
| `oc_promo_dismisses` | `mc_promo_dismisses` | storage | 1 | WP18 |
| `oc_promo_until` | `mc_promo_until` | storage | 1 | WP18 |
| `oc_promo_pv` | `mc_promo_pv` | storage | 1 | WP18 |
| `oc_annual_nudge_session` | `mc_annual_nudge_session` | storage | 1 | WP18 |
| `oc_annual_nudge_pv` | `mc_annual_nudge_pv` | storage | 1 | WP18 |
| `oc_annual_nudge_dismisses` | `mc_annual_nudge_dismisses` | storage | 1 | WP18 |
| `oc_annual_nudge_until` | `mc_annual_nudge_until` | storage | 1 | WP18 |
| `oc_prem_slidein_session` | `mc_prem_slidein_session` | storage | 1 | WP18 |
| `oc_prem_slidein_pv` | `mc_prem_slidein_pv` | storage | 1 | WP18 |
| `oc_prem_slidein_dismisses` | `mc_prem_slidein_dismisses` | storage | 1 | WP18 |
| `oc_prem_slidein_until` | `mc_prem_slidein_until` | storage | 1 | WP18 |
| `ocQuickView` | `mcQuickView` | storage | 1 | WP06 |
| `op_welcome_dismissed` | `mc_welcome_dismissed` | storage | 1 | WP18 |
| `op_welcome_deals` | `mc_welcome_deals` | storage | 1 | WP18 |
| `op_welcome_at` | `mc_welcome_at` | storage | 3 | WP18, tests |
| `op:watchlist-merged` | `mc:watchlist-merged` | storage | 2 | WP14, tests |
| `op:watchlist` | `mc:watchlist` | storage | 4 | WP14, tests |
| `op:recent-cards` | `mc:recent-cards` | storage | 1 | WP15 |
| `op:recent-searches` | `mc:recent-searches` | storage | 1 | WP15 |
| `op:alert_email` | `mc:alert_email` | storage | 3 | WP14, tests |
| `op:sidenav:collapsed-groups` | `mc:sidenav:collapsed-groups` | storage | 1 | WP15 |
| `op:theme` | `mc:theme` | storage | 1 | WP16 |
| `op:recent` | `mc:recent` | event | 1 | WP15 |
| `oc:theme` | `mc:theme` | event | 2 | WP15, tests |
| `oc:me` | `mc:me` | event | 3 | WP14, WP18, tests |
| `data-oc-dialog` | `data-mc-dialog` | dom | 4 | WP16, WP18, tests |
| `data-oc-buybar` | `data-mc-buybar` | dom | 2 | WP06, WP16 |
| `ocDialog` | `mcDialog` | dom | 5 | WP15, WP18, tests |
| `op-hero` | `mc-hero` | dom | 5 | WP15, WP18, tests |
| `op-ad-zone` | `mc-ad-zone` | dom | 2 | WP15, WP18 |
| `op-feedback-title` | `mc-feedback-title` | dom | 1 | WP18 |
| `op-reviews-heading` | `mc-reviews-heading` | dom | 1 | WP18 |
| `oc-tcgplayer-card` | `mc-tcgplayer-card` | tracking | 2 | tests |
| `oc-tcg-ad` | `mc-tcg-ad` | tracking | 1 | WP06 |
| `oc-us` | `mc-us` | tracking | 2 | WP06, tests |
| `oc-au` | `mc-au` | tracking | 3 | WP06, tests |
| `oc-uk` | `mc-uk` | tracking | 3 | WP06, tests |
| `oc-ca` | `mc-ca` | tracking | 1 | WP06 |
| `oc-eu` | `mc-eu` | tracking | 1 | WP06 |
| `oc-sg` | `mc-sg` | tracking | 2 | WP06, tests |
| `oc-demand-v1` | `mc-demand-v1` | cache | 1 | WP02 |
| `oc-rise-feed-v1` | `mc-rise-feed-v1` | cache | 1 | WP02 |
| `oc_premium` | `mc_premium` | stripe | 6 | WP18, tests |

Literals the token map cannot see, handled by file-scoped rules: `src/lib/affiliate.ts` builds the EPN `customid` / Impact `sharedid` prefix from the bare string `"oc"` (`affiliateSubId("oc", ...)` and the fallback `|| "oc"`), which becomes `"mc"` so MTG revenue is separable from OP's and Rift's in both networks' reports.

**Brand words** (regex `opcompare` as a whole token): the Stripe site tag (`STRIPE_SITE = "mtgcompare"`, `site=mtgcompare` metadata, `scripts/stripe-setup.ts`), the Stripe lookup-key prefix (`lookupKey = mtgcompare_<tier>_<interval>`), the rate-limit salt, the indexnow User-Agent, `utm_source=mtgcompare`, the users CSV name, the dev-secret default, the affiliate `subId` default, the ICS UID, `package.json` name, the dev database name. the OP Compare contact address becomes the `.invalid` placeholder. `src/lib/site.ts` is excluded because it keeps the OP Compare sister link.

**Stripe, in one place:** site tag `mtgcompare`; lookup keys `mtgcompare_plus_month`, `mtgcompare_plus_year`, `mtgcompare_premium_month`, `mtgcompare_premium_year` (from `plans.ts`); checkout metadata `kind: "mc_premium"`; Stripe branding colour `#9140da`, logo `<SITE_URL>/icon-512.png` (`docs/CHROME-SETUP-PROMPT.md` is edited by `apply-cross-wp.mjs`).

Display strings that stay with the owning work package (`rg -n "OP Compare|OPCompare|One Piece"`): `OP Compare` -> `MTG Compare` in AdSlot, PlanDialog, TcgMarketPrice, TcgplayerAd, EbayBuyCta, PriceBoard, FeedbackWidget, email templates and admin titles; `OPCompare` (glued) -> `MTGCompare`; `OPCompare/1.0` (the runtime import User-Agent) -> the owner's call (REQUIREMENTS 1.11 fixes only the build UA `MTGCompare-build/0.1 (+https://github.com/Specifxx/mtgcompare)`).

**Heads-up for WP05/WP06, found while reading `affiliate.ts`:** the code defaults `EBAY_CAMPAIGN_ID` to `5339155912` and `TCGPLAYER_IMPACT_LINK` to `https://partner.tcgplayer.com/c/7385758/1780961/21018`. Those are OP Compare's (or Rift's) affiliate identities. They are env-overridable, but a MTG deploy that forgets the env vars would pay another site's account. Make them required (or empty and "affiliate off") rather than defaulted.

---

## 5. PWA manifest and browser chrome

`src/app/manifest.ts` (in `apply/`):

| Field | Value |
|---|---|
| `name`, `short_name` | `MTG Compare` (11 characters, fits as a short name) |
| `description` | `SITE_DESCRIPTION` |
| `start_url`, `display` | `/`, `standalone` |
| `background_color`, `theme_color` | `#0c0b14` (= `THEME_COLOR.dark`) |
| `icons` | `/icon-192.png`, `/icon-512.png`, plus new `/icon-maskable-512.png` with `purpose: "maskable"` |

`<meta name="theme-color">`: `viewport.themeColor = "#0c0b14"` (layout, WP15 patch); `ThemeToggle` rewrites it to `#f5f4fa` for a light-theme visitor. `THEME_COLOR = { dark: "#0c0b14", light: "#f5f4fa" }`. The apple-touch icon is now a full-bleed square (iOS rounds it itself and paints transparency black; OP's was a pre-rounded tile with transparent corners).

---

## 6. Tokens

Token **names are OP Compare's** (so no component changes): `ink-950..600`, `brand` (`DEFAULT`, `400`, `500`, `600`), `slate-100..900`, `white`, `accent`, `gold`, `up`, `down`, and the chromatic text shades `rose-200/300/400`, `red-300/400`, `emerald-300/400`, `amber-100/200/300`, `sky-200/300/400`, `lime-200/300`, `purple-300`, `blue-300`. One token is added: `orange-300` (Mythic rarity text; the tailwind entry, both palettes, and the pinned expectations include it). Values are in `tokens/palette.json`; the CSS and Tailwind blocks are emitted below exactly as they appear after WP16.

Highlights: dark surfaces step `#0a0912 / #0f0e18 / #151421 / #1c1b2b / #2a293e / #3b3a54` (hue 245, saturation 18-33% on the very dark steps, where it is invisible; it reads as ink, not colour); text `white #ffffff`, `slate-300 #cdc9df`, `slate-400 #a8a4c0`, `slate-500 #958fb2`, `slate-600 #8480a1` (lifted: 4.84:1 on ink-850, 0.26 above OP's own); `brand-400 #c394f4` (8.4:1 on ink-950, versus OP's red 7.1); light surfaces `#f5f4fa / #ffffff / #efedf7`; light `brand-400 #6a24b0` (7.7:1). `gold`, `up`, `down` and every chromatic shade keep OP's/Rift's values so semantics are identical across the three sites; all pass on the new surfaces (table).

`brand-500 #9140da` and `brand-600 #7b2cc4` are fixed fills in both themes and take white ink (5.32:1 and 7.00:1; the repo test asserts both). The eBay button stays `#0064d2` (white 5.59:1) and TCGplayer stays sky.

### 6.1 `:root` (dark) and `:root[data-theme="light"]` as they appear in `src/app/globals.css`

```css
:root { ... }` (dark, the default); the second replaces `:root[data-theme="light"] { ... }`. */

:root {
  color-scheme: dark;
  /* ── Palette: DARK (MTG Compare's default, as on RiftCompare) ───────────
     RGB triplets, not hexes, because tailwind.config.ts wraps each one as
     `rgb(var(--c-x) / <alpha-value>)` so opacity modifiers keep working.
     "Arcane Ink": near-black surfaces tinted toward indigo (hue ~245, at most
     ~18% saturation on the lighter steps so it reads as ink, not as colour), a
     lavender-grey text ramp, one amethyst accent (brand, hue ~272) and the
     brass `gold`. The
     light set is further down under `:root[data-theme="light"]`;
     src/lib/theme-shared.ts explains the switch and tests/theme.test.ts pins
     that both sets define every variable and clear WCAG AA. */
  --c-ink-950: 10 9 18;
  --c-ink-900: 15 14 24;
  --c-ink-850: 21 20 33;
  --c-ink-800: 28 27 43;
  --c-ink-700: 42 41 62;
  --c-ink-600: 59 58 84;
  --c-brand-400: 195 148 244;
  --c-slate-100: 243 241 250;
  --c-slate-200: 229 226 241;
  --c-slate-300: 205 201 223;
  --c-slate-400: 168 164 192;
  --c-slate-500: 149 143 178;
  --c-slate-600: 132 128 161;
  --c-slate-700: 59 58 84;
  --c-slate-800: 39 38 58;
  --c-slate-900: 23 22 37;
  --c-accent: 239 237 248;
  --c-gold: 202 168 90;
  --c-up: 63 185 80;
  --c-down: 240 80 110;
  --c-white: 255 255 255;
  /* Chromatic text shades: Tailwind's stock hexes (orange-300 is the Mythic
     rarity text). */
  --c-rose-200: 254 205 211;
  --c-rose-300: 253 164 175;
  --c-rose-400: 251 113 133;
  --c-red-300: 252 165 165;
  --c-red-400: 248 113 113;
  --c-emerald-300: 110 231 183;
  --c-emerald-400: 52 211 153;
  --c-amber-100: 254 243 199;
  --c-amber-200: 253 230 138;
  --c-amber-300: 252 211 77;
  --c-sky-200: 186 230 253;
  --c-sky-300: 125 211 252;
  --c-sky-400: 56 189 248;
  --c-lime-200: 217 249 157;
  --c-lime-300: 190 242 100;
  --c-purple-300: 216 180 254;
  --c-blue-300: 147 197 253;
  --c-orange-300: 253 186 116;
  --page-bg: #0c0b14;
  --page-fg: #e9e7f3;
  --shadow-card: 0 1px 0 rgba(255, 255, 255, 0.02), 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-glow: 0 1px 0 rgba(255, 255, 255, 0.03), 0 4px 12px rgba(0, 0, 0, 0.45);
  /* The scrolled header's drop (NavbarShell SCROLLED, tailwind `shadow-header`). */
  --shadow-header: 0 8px 30px rgba(0, 0, 0, 0.35);
  --scroll-track: #0f131c;
  --scroll-thumb: #2c3650;
  --scroll-thumb-hover: #3a4564;
  /* Reserved width for the persistent desktop SideNav (components/SideNav.tsx),
     0 by default so every element that pads/positions against it (the header,
     main, the footer ad zone, the footer itself, CinematicHero's full-bleed
     breakout) is a no-op below the breakpoint where SideNav actually renders.
     Read via `var(--sidenav-w)` rather than a Tailwind `lg:` prefix on each
     consumer so ALL of them share exactly one breakpoint decision —
     SideNav.tsx's own `hidden lg:flex` and the media query below must always
     agree, or the panel either overlaps un-padded content or leaves a dead
     gap. tests/sidenav.test.ts pins both against the same "1024px" value.

     ONE WIDTH, ONE BREAKPOINT, since 2026-09-21. There used to be two rail
     modes — a 4rem icon strip and a 17rem list — chosen by a `data-sidenav`
     attribute stamped before first paint from a cookie, with a chevron and a
     `[` shortcut to flip between them. That whole mechanism is gone
     ("the collapsible option is actually, there's no point — have the default
     as uncollapsed"), and with it the boot script, the cookie, the
     `.sidenav-expanded`/`.sidenav-collapsed` display toggles and the flyouts
     the icon mode needed. The rail is simply the list now. */
  --sidenav-w: 0px;
  /* Height of the native AdMob banner inside the Capacitor shell — see the
     native-app rule further down. 0 on the web, where there is no banner. */
  --native-banner-h: 0px;
}
```

```css

```

### 6.2 `tailwind.config.ts` `theme.extend.colors`

```ts
      colors: {
        // "Arcane Ink": near-black surfaces tinted toward violet, quiet lavender-grey
        // borders, one amethyst accent — no neon.
        ink: {
          950: v("ink-950"), // dark #0a0912
          900: v("ink-900"), // dark #0f0e18
          850: v("ink-850"), // dark #151421
          800: v("ink-800"), // dark #1c1b2b
          700: v("ink-700"), // dark #2a293e
          600: v("ink-600"), // dark #3b3a54
        },
        // The single sharp accent — MTG Compare's amethyst (RiftCompare's green and
        // OP Compare's red are the tokens that differ), used sparingly for primary
        // actions + active states. Everything else stays neutral ink.
        brand: {
          DEFAULT: "#9140da",
          // 400 is the LINK shade (text-brand-400). #c394f4 is fine on dark
          // ink and unreadable on white, so it alone is themed; 500/600 are
          // fills and borders and stay fixed (white ink on both: 5.3:1, 7.0:1).
          400: v("brand-400"), // dark #c394f4
          500: "#9140da",
          600: "#7b2cc4",
        },
        // Muted greys, LIFTED to clear WCAG AA on this palette's surfaces, and
        // tinted lavender to sit on the violet ink.
        //
        // Tailwind's stock slate-500 (#64748b) measures 4.11:1 on ink-950 and
        // 3.97:1 on ink-900 — under the 4.5:1 body-text floor — and slate-600 is
        // far worse. Between them they were 548 + 112 usages, i.e. most of the
        // site's secondary text, and the single largest accessibility failure in
        // the audit. These replacements keep the same visual ramp (400 lighter
        // than 500 lighter than 600) and the same restrained, low-saturation
        // character, while clearing 4.5:1 on both surfaces with margin:
        //   500 #958fb2 → 6.2:1 on ink-900
        //   600 #8480a1 → 5.1:1 on ink-900
        // Changing the token rather than 660 class names means it cannot be
        // half-applied, and a new component that reaches for text-slate-500 is
        // accessible by default.
        // The full ramp is themed (not just 500/600): text-slate-400 alone is
        // ~630 usages, and Tailwind's stock #94a3b8 is 2.5:1 on white.
        slate: {
          100: v("slate-100"), // dark #f3f1fa
          200: v("slate-200"), // dark #e5e2f1
          300: v("slate-300"), // dark #cdc9df
          400: v("slate-400"), // dark #a8a4c0
          500: v("slate-500"), // dark #958fb2 (lifted, see above)
          600: v("slate-600"), // dark #8480a1 (lifted, see above)
          700: v("slate-700"), // dark #3b3a54
          800: v("slate-800"), // dark #27263a
          900: v("slate-900"), // dark #171625
        },
        // `text-white` is the primary text colour (~900 usages); in the light
        // theme it is near-black ink. bg-black overlays are NOT themed on purpose.
        white: v("white"),
        // "accent" now reads as the high-contrast NUMERAL colour — a near-white ink
        // for prices, so figures stay crisp and neutral like a trading desk.
        accent: v("accent"), // dark #efedf8
        // Muted brass — reserved for genuine gold/foil semantics only, never UI chrome.
        gold: v("gold"), // dark #caa85a
        // Market deltas: gains/losses on the terminal. Calm, not neon.
        up: v("up"), // dark #3fb950
        down: v("down"), // dark #f0506e
        // Chromatic TEXT shades. Tailwind's stock pastels were tuned for dark ink
        // and read 1.3-2.8:1 on the light theme's white cards, so the shades that
        // are used as text go through the palette like the neutrals. The dark
        // values in globals.css are Tailwind's stock hexes.
        // `extend` deep-merges, so every shade not listed here (the 50/100 tints
        // bar amber-100, and the 500-950 fills) stays stock. amber-400 is
        // deliberately NOT themed: CardImage.tsx's PromoStamp uses from-amber-400
        // as a bright fill under text-amber-950. The one non-text consumer that
        // does move is PromoStamp's ring-amber-300/50 (a darker ring in light).
        rose: { 200: v("rose-200"), 300: v("rose-300"), 400: v("rose-400") },
        red: { 300: v("red-300"), 400: v("red-400") },
        emerald: { 300: v("emerald-300"), 400: v("emerald-400") },
        amber: { 100: v("amber-100"), 200: v("amber-200"), 300: v("amber-300") },
        sky: { 200: v("sky-200"), 300: v("sky-300"), 400: v("sky-400") },
        lime: { 200: v("lime-200"), 300: v("lime-300") },
        purple: { 300: v("purple-300") },
        blue: { 300: v("blue-300") },
        // MTG Compare addition: Mythic rarity text (dark #fdba74, 10.8-11.7:1; light #9a3412, 6.3-7.3:1).
        orange: { 300: v("orange-300") },
      },
```

Everything else in `tailwind.config.ts` and `globals.css` is unchanged apart from comments.

### 6.3 Contrast (proof)

Full table with OP's value beside ours: `tokens/contrast-table.md`. Summary, using the repo test's exact formula: every tested pair (7 body tokens and 10 status tokens on ink-950, ink-900, ink-850, in both themes) is at least **4.73:1** (light `emerald-400` on ink-850; the next lowest is dark `slate-600` on ink-850 at 4.84). The 13 other themed text shades were checked too. Fills: white on brand-500 5.32, on brand-600 7.00; brand-500 against every surface 3.4-5.3 (non-text 3:1); brand-400 on a `bg-brand-500/15` chip 5.9-7.2. One pre-existing item surfaced: white on eBay's hover blue `#0079e6` is 4.31:1 (hover only, same in OP and Rift, untested); `#0070d9` would clear 4.5 (4.86). Left as is.

The real tests run against the scratch copy: `tests/theme.test.ts` 9/9 and `tests/design-system.test.ts` 12/12 (and the full suite) pass. The pinned expectations they needed are in `tokens/tests.patch` (palette map, `--page-bg #0c0b14`, `--page-fg #e9e7f3`, white-on-brand `145 64 218` / `123 44 196`, `.bg-brand-400` light fill `#c394f4`, dark-ink-on-gold `#0a0912`, the dark-default assertions). The retired-vocabulary test (no "straw", "bob", ...) passes: the new config and CSS contain none of those words.

### 6.4 Share-image palette (`src/lib/og/theme.ts`)

Keys renamed for the new identity (`red` -> `brand`, `redWord` -> `brandWord`, `straw` -> `gold`, `SEA_BG` -> `ARCANE_BG`; every use in `compose.tsx` updated): `page #08070f`, `ink900 #100f1b`, `ink850 #161524`, `ink800 #1e1d30`, `ink700 #2d2c46`, `brand #9140da`, `brandWord #c394f4`, `gold #dcb95e`, `white`, `slate100 #f3f1fa`, `slate300 #cdc9df`, `slate400 #a8a4c0`, `slate500 #958fb2`, `accent #efedf8`, `up #3fb950`, `down #f06278`. Backdrop `ARCANE_BG` = amethyst glow top-centre (`rgba(145,64,218,0.34)`) plus a brass glow top-right (`rgba(220,185,94,0.12)`). Unlike OP, whose share images used a navy that appears nowhere on the site, these use the site's own dark palette. Inline gradients and the blog badge in `compose.tsx` were retinted (`rgba(145,64,218,...)`, badge text `#d3b0f8`).

---

## 7. Logo, icons, wordmark, fonts

### 7.1 The mark

Two overlapping rounded rhombi (a comparison): left amethyst gradient (`#b98af2` -> `#7028bb`), right brass gradient (`#ecd187` -> `#b58a30`), the overlap in ivory `#fbf7ea` (the right rhombus clipped by the left, so it is exact at any size). Brass echoes the `gold` token (Premium, foil); amethyst is the brand. Original and abstract: not a mana or guild symbol, not the Planeswalker symbol (no star, spark, drop, flame or circle), not a card frame, not Wizards' logotype. 64 x 64 viewBox like OP's; the geometry is two path strings in `Logo.tsx`'s `MARK_PATHS`, shared by `gen-icons.ts`, `BrandLogo` and the share images, so nothing can drift.

Candidates tried and dropped (`tools/logo-lab*.mjs`): a lozenge with an "M" (clear at 16 px but generic, and just a letter), a balance-scale glyph (reads as a legal icon), a quill nib (reads as a leaf). Preview: `preview/logo-sheet.png` (16, 32, 192 px on dark and light, mark and one-colour mask, tiles) and `preview/logo-16px-zoom8x.png` (the 16 px renders magnified 8x, nearest-neighbour): both diamonds, the brass/amethyst split and the ivory centre are distinguishable at 16 px; the one-colour mask reads as two interlocking diamonds with a hole.

### 7.2 Files and where each is used

| File | Used by |
|---|---|
| `public/logo-mask.svg` | `BrandLogo` CSS mask: `Navbar` (below lg), `SideNav` (rail), `CinematicNavMenu`, `CinematicHero`. One path, `fill-rule="evenodd"`, so the overlap is a hole; no inner `<mask>` element needed |
| `public/logo-mark.svg` | full colour, transparent: the design hand-off asset (nothing in `src` references it, as in OP) |
| `src/components/Logo.tsx` -> `LogoMark` | blog byline (`ArticleView`: `HatMark` -> `LogoMark`, a one-line patch) |
| `src/lib/og/compose.tsx` -> `Mark` | share-image lockup, art placeholder, sealed plate, "releases" plate |
| `src/app/icon.svg` | browser favicon (dark rounded tile with the mark) |
| `src/app/apple-icon.png` | 180 px, full-bleed square (iOS rounds it) |
| `public/icon-192.png`, `icon-512.png` | manifest; `icon-512.png` is also the Organization JSON-LD `logo` and the Stripe/Resend branding logo |
| `public/icon-maskable-512.png` | new, manifest `purpose: "maskable"`; mark scaled to 0.6 so it sits in the 80% safe zone |

`BrandLogo` fill: `linear-gradient(in oklch, #c394f4, #9140da)` (= brand-400 dark -> brand-500), `aria-label="MTG Compare logo"`. Nothing else in the chrome changes.

### 7.3 Generating the icons (`scripts/gen-icons.ts`, `npm run icons`)

The script (in `apply/`) imports `MARK_PATHS` and `MARK_COLORS` from `src/components/Logo` and writes, with `sharp` at density 300: `src/app/icon.svg`, `public/logo-mark.svg`, `public/logo-mask.svg` (new: OP hand-authored the mask; now it cannot drift), `src/app/apple-icon.png` (180, square tile), `public/icon-192.png`, `public/icon-512.png` (rounded tile, `rx 14`, mark scaled 0.82, dark radial tile `#1d1740` -> `#0c0b14`, 1.2 px edge `#2f2b4d`) and `public/icon-maskable-512.png`. Run once after changing `MARK_PATHS`; the committed PNGs in `apply/` came from this exact script run in the scratch repo.

### 7.4 Wordmark

Text, not an image. Chrome: Inter 800 (`font-extrabold`), tracking -0.025em (`tracking-tight`), "MTG" `text-white`, "Compare" `text-brand-400`, `text-lg` (rail `text-sm`). Optional `Wordmark.tsx` (in `logo/`) collapses the four hand-copied spans; the patches only swap `OP` for `MTG` so WP15 can adopt it or not. Share images: Archivo 900 (the lockup) with the Cinzel Black title; email header: `MTG <span style="color:#c394f4">Compare</span>`, 22 px / 800.

### 7.5 Fonts the share-image renderer needs (all OFL, all static TTF, nothing WOFF2)

satori reads only static TTF/OTF. After this change `OG_FONT_FILES` is:

| Name | File | Weight | Status | Source |
|---|---|---|---|---|
| Cinzel | `Cinzel-900.ttf` | 900 | **new** (title "MTG PRICE GUIDE") | below |
| Archivo | `Archivo-900.ttf` | 900 | unchanged, already bundled | repo |
| Inter | `Inter-600.ttf`, `Inter-700.ttf` | 600, 700 | unchanged | repo |
| JetBrains Mono | `JetBrainsMono-700.ttf` | 700 | unchanged | repo |

Removed: `LuckiestGuy-400.ttf` and `LuckiestGuy-LICENSE.txt` (a comic face tied to One Piece's manga voice; its licence file goes with it). Added: `Cinzel-900.ttf` and `Cinzel-OFL.txt` (copyright "2020 The Cinzel Project Authors", no Reserved Font Name). The site's own fonts (next/font: Inter, JetBrains Mono, Fraunces, and Archivo on the home page) are **unchanged**, which is why `tests/design-system.test.ts`'s font pins needed no edit.

**Why Cinzel Black:** Roman inscriptional capitals read arcane and trustworthy at once, are not Wizards' typeface (Beleren/Matrix), and stay legible at a 58 px title in a 1200x630 thumbnail. Compared side by side (`tools/fonts-lab.mjs`): Archivo 900 (kept for the lockup, no personality gain), Spectral ExtraBold and Fraunces 900 (pleasant, not arcane), Cardo Bold (good, light for thumbnails), Marcellus (too thin), Luckiest Guy (retired). Cinzel's lower case is small capitals, so it is used only for the upper-case title; card, set and product titles stay Archivo.

**Where to get `Cinzel-900.ttf`:** Google Fonts publishes Cinzel only as a variable font. `raw.githubusercontent.com/google/fonts/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf` (125,468 bytes) and `.../OFL.txt` are reachable (checked 2026-10-08, plain GET, 200, one request each, User-Agent `MTGCompare-build/0.1 (+https://github.com/Specifxx/mtgcompare)`, no personal e-mail; the GitHub contents API for `google/fonts` is not reachable from this sandbox, only raw files). Instance it with `tools/make-cinzel-900.py` (fonttools `varLib.instancer`, `wght=900`, name table set to "Cinzel Black"), or take `static/Cinzel-Black.ttf` from the family zip at fonts.google.com/specimen/Cinzel. The committed `fonts/Cinzel-900.ttf` is 77,400 bytes, `usWeightClass 900`, no `fvar`; the og test loads it through `loadOgFonts()` and renders a PNG with it. `next.config.js`'s `outputFileTracingIncludes` already traces the whole `src/lib/og/fonts` folder.

---

## 8. Using the palette (guide for the other work packages)

1. **Brand (amethyst) means:** primary action, current page/tab, link text (`text-brand-400`), focus ring, the logo. It is not a status colour.
2. **Status stays semantic:** `up` green = rise / in stock / positive, `down` red = fall / out of stock / error, `gold` = Premium/foil only, `amber` = "NEW", sky = TCGplayer, `#0064d2` = eBay. Never use brand for "good".
3. **The price board pair:** `.btn-primary` (amethyst) for "Buy on TCGplayer" / "View deal" and `.btn-ebay` (blue) for "Buy on eBay" sit side by side in the preview; the eBay one reads as the highlighted one. Do not recolour either.
4. **Rarity text (WP01):** suggested tones on the existing themed tokens: common `text-slate-300`, uncommon `text-sky-200`, rare `text-gold`, mythic `text-orange-300` (new token), special/bonus `text-purple-300`. All pass AA in both themes. For the share images' `RARITY_TONE`, use the dark values of the same tokens (`#cdc9df`, `#bae6fd`, `#caa85a`, `#fdba74`, `#d8b4fe`).
5. **Colour-identity dots (WP01)** are data, not brand: plain circles (never Wizards' mana artwork), suggested `W #f1e9c6` (give it a 1 px `ink-600` ring), `U #3b82d9`, `B #7a7388`, `R #e0523f`, `G #35a35e`, colourless `#9ba3ad`, multicolour `#d4b24a`. None is within 40 deg of the brand hue.
6. **Charts:** a brand-coloured series uses `#a259e6` (4.7:1 on dark ink-900, 4.1:1 on white), applied by `apply-cross-wp.mjs` to the five chart call sites that used OP's `#ff6b6b`.
7. **Card images** (Scryfall rule): in the share images keep the 5:7 box (`388 x 542`, `488:680`), never crop the bottom edge (copyright and artist line), no filters, no overlays or watermarks on the art; badges go beside it. The existing compositions already do this; the blog fan overlaps back cards but keeps the front one whole.

---

## 9. Wizards of the Coast IP checklist (for review)

- No Magic: The Gathering logo or logotype, no Wizards logo, no Planeswalker symbol, no mana or guild symbols, no set symbols, no card-frame imitation anywhere in the mark, icons, share images or chrome. Mana costs, if ever shown, are text.
- The mark is two rhombi; the palette (amethyst, indigo ink, brass) is not a Wizards colour system; the title face is not Wizards'.
- The name "MTG Compare" is text in Inter/Archivo, not stylised like the Magic wordmark.
- The mandatory Fan Content disclaimer and the unofficial-fan-site notice are in the footer on every page (2.4); `tests/site-chrome.test.ts` pins the disclaimer text.
- Card art is shown unaltered, hotlinked from Scryfall (WP-owned), with no mark placed on top of it; the placeholder mark appears only when no image exists.

---

## 10. Previews (all in `preview/`)

| File | Shows |
|---|---|
| `palette-demo.html` (+ `-dark.png`, `-light.png`, `-mobile-dark.png`) | the home hero, the **"Ad · Live listings on eBay" strip** (six tiles, snap-scroll on phones), a card header, the **price board** (cheapest chip, in-stock, condition chips, eBay and TCGplayer buy buttons, "More listings" row, eBay search card), up/down chips, buttons, Plus/Premium/NEW chips, Deal Finder card, token swatches, the footer disclaimer. Built from the repo's real compiled Tailwind output with the new tokens, so every class is the production one; sample data, art plates are abstract gradients. Open it with `?theme=light` or use the sun button |
| `directions-comparison.png` | the three directions |
| `logo-sheet.png`, `logo-16px-zoom8x.png`, `icons-set.png`, `mark-*`, `mask-*`, `icon-tile-*` | the mark at 16 / 32 / 192 px, light and dark, mask and full colour, all icons |
| `og-guide.png`, `og-card.png`, `og-blog.png`, `og-set-upcoming.png`, `og-fallback.png` | real `ImageResponse` renders with the bundled fonts (card art slots show the placeholder) |

---

## 11. Open questions for the owner

1. **Name collision.** An established site called "MTG Compare UK" (mtgcompare.com, orange) exists in the same niche. Keep "MTG Compare" and differentiate (the amethyst/brass identity already does visually), add a qualifier ("MTG Compare" vs "MTGCompare.app"), or rename? This also affects Wizards/eBay/TCGplayer affiliate approvals that ask for a unique site.
2. **Domain.** `mtgcompare.app` resolves to a paused Vercel deployment (maybe yours). Is it yours? Otherwise pick the domain now: it is one constant plus one `sed`.
3. **Default theme.** Dark (as Rift, as the brief says) or light (as OP, per your earlier decision for OP)? Dark is implemented; the flip is the five spots in 1.1.
4. **Wizards and Premium.** The required disclaimer says the site is "permitted under the Fan Content Policy"; the policy bars requiring payment for Fan Content. Settle with Wizards/counsel whether paid analytics (Deal Finder, Rising, Demand Finder) change that. The disclaimer is used verbatim as written.
5. **"MTG" in the name.** Accepted as chosen (text only, descriptive use); a one-line trademark risk, not a blocker.
6. **Contact e-mail and handles.** Contact defaults to a `.invalid` placeholder; X/Discord/Reddit handles do not exist yet.
7. **Affiliate defaults.** `EBAY_CAMPAIGN_ID` and `TCGPLAYER_IMPACT_LINK` default to OP's/Rift's identities in code (section 4).
8. **Import cadence in copy.** The hero and share images say "updated daily"; correct if the import runs twice a day.
9. **Scryfall resemblance.** Scryfall's own docs page uses purple `#5822AC` (263 deg). Ours is `#9140da` (272 deg): the same family, but much lighter and brighter, with brass, no shared shape, and the footer states Scryfall does not endorse the site. If you want more distance, move the brand 15-20 deg toward magenta (hue ~288, e.g. `#a735cd`); it is about 40 hex literals, found with `rg -n '9140da|c394f4|7b2cc4|6a24b0|a259e6|b98af2|7028bb|d3b0f8|145 64 218|195 148 244' apply patches tools`, and `gen-contrast.mjs` re-proves the contrast.
