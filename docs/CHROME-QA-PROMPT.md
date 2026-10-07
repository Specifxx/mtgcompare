# Claude in Chrome — OP Compare live QA prompt

Paste everything between the lines into Claude in Chrome. Before you do, open
https://opcompare.app and https://riftcompare.com in two tabs. For the signed-in
checks, have a spare Google account ready (never the admin account, never an
account with a real subscription).

---

You are QA-testing the live website **OP Compare** (https://opcompare.app), a
One Piece Card Game price-comparison site. It is the sister site of
**RiftCompare** (https://riftcompare.com), and the owner's rule is: *a one-to-one
copy of RiftCompare with only the branding and the cards changed.* Your job is to
find every place where OP Compare is broken, missing something RiftCompare has,
or looks different from RiftCompare, and report it. **You only observe and
report; you do not edit code or settings.** RiftCompare is read-only: don't sign
up, subscribe, change or submit anything on riftcompare.com.

Known, intended differences (don't report these): the logo and name; the brand
colour (One Piece red with white button text, where RiftCompare is green); the
site opens in the **light** theme by default; there are no games and no Pokémon
section; Plus/Premium shows **"Opening soon"** until Stripe is switched on (check
the notes at the end); email features show nothing until email is switched on.

How to work:
- Test at two window sizes: a phone (390×844, use the browser's device toolbar)
  and a laptop (1280×800). Test the **light and the dark** theme (the sun/moon
  button in the header).
- Open the browser console on every page. Report any red error other than
  failed requests to external image hosts (`tcgplayer-cdn.tcgplayer.com`) and
  `/_vercel/insights`.
- For each finding write: the URL, the size and theme, what you did, what you
  saw, what RiftCompare does (if different), and a screenshot.
- Use these test states: **signed out**; **signed in as a free account** (Google
  sign-in with the spare account); and, if I give you a Plus or Premium test
  account, those too. Don't pay for anything.
- Use the country switcher (flag in the header) to test **US, AU, UK**.

## 1. Look and feel — side by side with RiftCompare
Open the same pages on both sites at the same size: home, a card page, the price
guide, /premium, /tools/deal-finder, /dashboard (signed in). Compare:
- the fonts: headings use a serif (Fraunces), body text Inter, prices a
  monospace (JetBrains Mono), the homepage hero title a heavy sans;
- header, left menu, footer, card tiles, buttons, badges, radii, spacing;
- the header turns blurred with a shadow after scrolling 8px; collapsing a menu
  group and reloading keeps it collapsed; Cmd/Ctrl+K opens the command launcher;
- the phone menu opens full screen, searches cards and closes with Esc;
- the theme choice persists across a reload.
Report anything that differs other than colour/logo/name.

## 2. Prices, stores and links
- /price-guide: filters, sort and paging work; every row opens a quick view
  panel; every row has an **eBay** and a **TCGplayer** button; hover/inspect the
  links: TCGplayer links go through `partner.tcgplayer.com`, eBay links carry
  `campid`.
- Open 5 different card pages (a cheap common, a Leader, a Parallel, a Manga, a
  card with no stock). On each: the price table, "In stock at · <country> N
  stores" (the number includes TCGplayer if it's in the table, never eBay), the
  highlighted eBay search block, the TCGplayer market price block with a "Check
  on TCGplayer" button, the price history chart (hover shows date and price; the
  7D/30D/90D/All buttons work), the "report a wrong price" button, cheaper
  alternatives/other printings, FAQ text.
- Quick view: click a card in the price guide, home, search results, Deal Finder,
  movers, watchlist, sets and a blog post table. It must open every time; Esc and
  the browser back button close it; "Open full page" works.
- Search: type "luffy", "OP01-001", "monkey d luffy", "Shanks alt art". Arrow keys
  and Enter work; clicking a result opens the quick view; "/" focuses search;
  the empty state shows recent searches and recently viewed cards.
- /stores: lists many stores per market (US ~140, CA ~110, AU ~65, UK ~35, EU
  ~30); a store page (/stores/<name>) loads.

## 3. Watchlist — the bar and the sliders
- Signed out: click the heart on a card. The header heart shows a badge "1".
  Click the badge: a drawer slides in from the right with that card, its price,
  its 7-day change and a small price chart.
- Reload: the card is still watched. Sign in with Google: the local list merges
  into the account and /watching shows the card.
- As a free account, watch 11 cards: the 11th shows a popover that says the free
  limit is 10 with a Plus button.
- If a Plus test account is available: set a target price on a watched card (a
  slider/field) and see "1 of 25 used".

## 4. Premium everywhere
- The header has **Pricing** (from 400px width up). /premium shows two plan
  cards at the very top, side by side even on a phone, with both buttons visible
  without scrolling at 390×844.
- Every locked feature (Deal Finder rows, the Best Basket plan, Rising Cards,
  a locked tool) shows a wall with a button that opens the plan dialog; the
  dialog has the monthly/annual toggle and says "Opening soon"/waitlist while
  Stripe is off.
- The slide-in nudge: sign in with the spare free account, wait on a card page
  (account must be older than 2 days and you must have viewed 3 pages; if it
  isn't, say so). It appears in the corner after ~12 seconds; the X dismisses
  it; it doesn't appear on /premium, /login, /tools or /dashboard.

## 5. Member area
- /dashboard (signed in): the tier chip, the tool grid with locks, a Collection
  value card, a Watching snapshot, recent alerts, a welcome checklist for a new
  account. Compare its layout with riftcompare.com/dashboard.
- /profile: account details, plan and billing section (no Stripe errors),
  sign out. /login: Google and Discord buttons work.
- /portfolio: add 3 cards; import a CSV exported from TCGplayer (the page says
  which format); see total value and the value chart; /portfolio/sets/op01 shows
  set progress; the share link opens signed out and the "stop sharing" button
  kills it.

## 6. Tools
- **Deal Finder** (/tools/deal-finder): three tabs (Underpriced vs TCGplayer,
  Cheapest on eBay, Underpriced vs eBay). Signed out: a locked preview; free: 3
  rows and "N more cards"; Plus: 25 rows with store picker, sort and pages. Click
  a row's price: it opens the real store listing in a new tab. Check one deal by
  hand: is the TCGplayer low really above the store's price?
- **Best Basket** (/tools/best-basket): paste a decklist of ~50 cards (for
  example `4x OP01-001`, `3 OP05-119` lines), run it. Free accounts get a total,
  the number of stores and the saving; Premium gets the store-by-store plan,
  condition floor, 1- and 2-store alternatives. Postage shows "measured" or
  "estimate". No eBay rows appear. The totals look sane against the card pages.
- **Deck / list pricer** (/deck): the same pasted list; switching a printing
  changes the price; the share link reopens the list.
- **Box value** (/tools/box-ev; /tools/box-value must redirect to it): pick OP-01
  and the newest set. The expected value must be **below** the sum of every
  card in the set and plausible against the box price; the sliders change the
  chart. Tell me if a number looks wrong for One Piece boosters (24 packs a
  box, 12 cards a pack).
- **Rising Cards** and **Demand Finder**: free accounts see the limited number of
  rows; the tier table matches what the page says.
- Trade calculator, selling fees, /tools hub: every tool is listed and opens.

## 7. Alerts (email is off unless I tell you otherwise)
- /alerts and a card's "alert me" button: they work without promising emails
  anywhere in the page text ("we'll email you"). Search the page text of /alerts,
  a card page and the watch drawer for the word "email".
- Watch a card and look at the dashboard bell/notifications.

## 8. Content and SEO
- /market, /movers, /sets and a set page, /sealed (filters apply instantly; a
  tile opens a quick view), /guides, a blog post (a shop strip of live prices
  appears), /gallery, /support (submit a test ticket "QA test": a ticket number is
  shown), /feedback, /contact (shows opcompareofficial@gmail.com), /about.
- View-source checks on /, a card page and /price-guide: `<title>`,
  `<meta name="description">`, `<link rel="canonical" href="https://opcompare.app/...">`,
  `og:image`, `twitter:card`, JSON-LD scripts. /robots.txt, /sitemap.xml,
  /feed.xml and /llms.txt load.
- Paste https://opcompare.app/, a card URL and /price-guide into a link-preview
  tester (for example https://www.opengraph.xyz): the thumbnail must show the
  price guide / card with real prices, not a blank or error image.

## 9. Admin (only if I give you the admin login)
As mastermisclick@gmail.com: /admin, /admin/accounts, /admin/store-health (look
at the new stores: any with errors?), /admin/premium,
/admin/inbox, /admin/subscriptions all load. As anyone else, /admin must show a
"not found" page.

## 10. Report
Return a table: **severity (blocker / bug / polish)**, URL, size and theme, what
is wrong, what RiftCompare does, screenshot. Group by section number. Finish with
a one-line verdict per section: *works / works with issues / broken*, and the
five things the owner should fix first.
