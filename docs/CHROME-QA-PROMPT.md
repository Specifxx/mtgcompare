# Claude in Chrome: MTG Compare live QA prompt

Paste everything between the lines into Claude in Chrome. Before you do, open the live MTG Compare site (its address is SITE_URL below: the Vercel production URL until a domain is chosen) and https://riftcompare.com in two tabs. For the signed-in checks, have a spare Google account ready (never the admin account, never an account with a real subscription).

---

You are QA-testing the live website **MTG Compare** (SITE_URL), a Magic: The Gathering card price-comparison site. It is the sister site of **RiftCompare** (https://riftcompare.com) and OP Compare, and the owner's rule is: *the same layout and behaviour as RiftCompare, with only the branding and the cards changed.* Your job is to find every place where MTG Compare is broken, shows a wrong or impossible price, is missing something RiftCompare has, or looks different from RiftCompare, and report it. **You only observe and report; you do not edit code or settings.** RiftCompare is read-only: don't sign up, subscribe, change or submit anything on riftcompare.com.

Known, intended differences (don't report these): the logo and name; the brand ("Arcane Ink": amethyst with a brass accent, dark theme by default); no games section; Plus and Premium are in Stripe **test mode** (a checkout takes the test card 4242 4242 4242 4242 only, and you must not complete one unless I say so); e-mail features show nothing until e-mail is switched on; eBay shows search links, and live listings only once the eBay job has run (it may be in observe-only mode for its first week).

How to work:
- Test at two window sizes: a phone (390x844, the browser's device toolbar) and a laptop (1280x800). Test the **dark and the light** theme (the sun/moon button).
- Open the browser console on every page. Report any red error other than failed requests to image hosts (`cards.scryfall.io`, `tcgplayer-cdn.tcgplayer.com`) and `/_vercel/insights`.
- For each finding write: the URL, the size and theme, what you did, what you saw, what RiftCompare does (if different), and a screenshot.
- Test states: **signed out**; **signed in as a free account** (Google sign-in with the spare account); and, if I give you a Plus or Premium test account, those too. Don't pay for anything.
- Use the country switcher (flag in the header) to test **US, AU, UK**.

## 1. Look and feel, side by side with RiftCompare
Open the same pages on both sites at the same size: home, a card page, the price guide, /premium, /tools/deal-finder, /dashboard (signed in). Compare header, menu, footer, card tiles, buttons, badges, spacing; the header blur after scrolling 8px; Cmd/Ctrl+K opening the command launcher; the phone menu opening full screen and closing with Esc; the theme choice persisting across a reload. Report anything that differs other than colour, logo, name and fonts. Check the brand: the amethyst is readable on both themes (link text, buttons, focus rings) and the gold means Premium and foil only.

## 2. Prices, finishes and Scryfall data (this is where Magic differs)
- Open card pages for **Lightning Bolt**, **Sol Ring**, **Counterspell**, **The One Ring**, a basic land (**Island**) and a reprint-heavy card. On each: the art is the Scryfall image with its copyright and artist line **fully visible, uncropped**; set code, collector number, rarity and the printing words (Foil, Borderless, Extended Art, Showcase, Retro Frame ...) are right; the oracle text, mana cost and legalities grid are present (a legality shown as "?" must render as nothing, never "not legal").
- **Normal and Foil are separate prices.** A card with both shows a Normal tab and a Foil tab (or two clearly labelled rows); the headline price is the **Normal** one; the Foil price is never shown against the Normal label. A foil-only product shows only Foil. A price marked "low only" is a thin single listing: it must not appear in a ranked list (movers, top cards, price-guide sort by value).
- Price table: stores cheapest first in your market; "In stock at <country> N stores" counts TCGplayer if it is in the table and **never** eBay; eBay appears in its **own labelled block**, never interleaved with store rows and never counted as a store. TCGplayer links go through the partner link; eBay links carry a `campid`.
- Price history chart: hover shows date and price; the 7D/30D/90D/All buttons work; Normal and Foil have their own lines.
- Look for impossible numbers: a Foil far below its Normal on a card that is only foil-premium, a price over $100,000, a $0.00 price shown as a deal, a store price in the wrong currency for the market, an In-stock store with a price above TCGplayer market by 10x.
- Set and number lookup: search "ltr 246", "ltr 246 foil", "lea 161", "Lightning Bolt", "Jace" and "bolt". Results open the right printing; "/card/ltr/246" resolves; an ambiguous lookup shows a list, never a guess.
- /sealed: booster boxes, bundles, Commander decks; filters apply instantly; a product page shows per-pack prices only where the pack count is known.
- /stores: many stores per market; a store page (/stores/<name>) loads.

## 3. Commander, colours and keywords
- /commanders: a commander page (try **Atraxa, Praetors' Voice**) lists the card with its colour identity and links to decks. /colors/<combination> pages list cards inside that colour identity. /keywords: a keyword page (Flying, Deathtouch) lists real cards. Report a hub with zero cards or an obviously wrong member.
- /deck: paste a Commander list in MTGO format ("1 Sol Ring"), an Arena export ("1 Sol Ring (C21) 263") and a plain list. Each prices; the commander is recognised; a card with several printings uses the cheapest sensible printing unless a printing is named; the share link reopens the list; /decks shows published decks.

## 4. Watchlist and alerts
- Signed out: click the heart on a card; the header badge shows "1"; the drawer lists the card with its price and chart. Reload: still watched. Sign in with Google: the local list merges into the account.
- As a free account, watch more cards than the free limit: the popover mentions the limit and a Plus button. With a Plus account: set a target price on a watched card.
- /alerts and the "alert me" button must **not** promise e-mails anywhere (search the page text for "email") while e-mail is off.

## 5. Premium, test mode
- The header has **Pricing**; /premium shows the Plus and Premium cards side by side with both buttons visible at 390x844. The tier table matches `docs/premium-gates.md`: Deal Finder from Plus; Rising Cards and Demand Finder from Premium.
- **Deal Finder**: signed out sees only a count and a locked preview (no card, no price, no link in the HTML: view-source); free sees the top 3 rows and the count of the rest; Plus sees every deal with store picker, sort and pages; a row's price opens the real store listing. Check one deal by hand: is TCGplayer market really above the store price?
- **Rising Cards**: free and Plus see the top 3; Premium sees the full list. **Demand Finder**: everyone sees the top 10 most searched; Premium sees top 25 by searches and by views.
- **Premium never hides Magic data**: card names, images, oracle text, legalities, search and set pages are fully visible signed out. Report anything of that kind behind a lock.
- Every locked feature shows a wall with a button that opens the plan dialog (monthly/annual toggle). Do not complete a checkout unless I say so.

## 6. Member area
- /dashboard: tier chip, tool grid with locks, collection value, watching snapshot, notifications. /profile: plan and billing section, sign out. /login: Google and Discord buttons work.
- /portfolio: add 3 cards in different conditions and finishes; import a CSV (the page says which format); total value and chart; /portfolio/sets/<set> shows set progress; the share link opens signed out and "stop sharing" kills it.

## 7. Content, SEO and share images
- /market (the MTG Compare Index), /movers, /sets and a set page, /price-guide, /guides, a blog post, /release-dates, /about, /methodology, /contact (shows a placeholder address ending in .invalid until the owner chooses one: report it only if it shows another site's address), /feedback, /support (submit a test ticket "QA test": a ticket number appears), /privacy, /terms.
- Wizards of the Coast fan-content wording is present in the footer and /about, and the site never claims to be official.
- View-source on /, a card page and /price-guide: `<title>`, meta description, canonical (the SITE_URL host), `og:image`, `twitter:card`, JSON-LD. /robots.txt, /sitemap.xml (an index of /sitemaps/<kind>-<n>.xml children), /feed.xml and /llms.txt load, and none lists /admin.
- Paste SITE_URL, a card URL and /price-guide into a link-preview tester (for example https://www.opengraph.xyz): the thumbnail must show the MTG price guide or the card with real prices, not a blank or error image.

## 8. Admin (only if I give you the admin login)
As mastermisclick@gmail.com open each of: /admin (traffic lights), /admin/data (pointer age under 26 hours, file counts, no red alarm), /admin/ebay, /admin/deploys (next release is a Tuesday 08:00 UTC; the data is newer than the code), /admin/database, /admin/accounts, /admin/subscriptions, /admin/premium, /admin/clicks, /admin/loyalty, /admin/mail, /admin/lookup (look up the spare account by e-mail), /admin/inbox, /admin/support, /admin/store-health (any store with errors?), /admin/demand, /admin/rising, /admin/decks. All must load without an error panel; the Run buttons either work or link to the workflow page. As anyone else, or signed out, /admin and every /admin/... page must show the ordinary "not found" page, and /api/admin/... must answer 401 or 403.

## 9. Report
Return a table: **severity (blocker / bug / polish)**, URL, size and theme, what is wrong, what RiftCompare does, screenshot. Group by section number. Finish with a one-line verdict per section: *works / works with issues / broken*, and the five things the owner should fix first.
