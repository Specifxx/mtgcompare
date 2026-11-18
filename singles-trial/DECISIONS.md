# Decisions

## 2026-11-18: a separate site for singles, one game at a time

The owner asked for a new site just for TCG singles covering every game ("tcgsinglesdb", 17 Nov) and approved the plan
(`ops/tcgsinglesdb-plan-2026-11-18.html` in the project files).

- **Own domain, not a section of TCG Prices.** TCG Prices went live on 14 Nov 2026, so it has no authority to lend, and the
  sealed sites earned A$2,444 of the network's A$3,144 in the 30 days before: a bad indexing result must stay off them.
- **Why rationed.** Dex's full card catalogue fell to zero impressions by September 2026 (5,594 URLs still "crawled, not indexed"
  on 16 Nov); MTG Compare's 42,000 sitemap URLs got its homepage indexed (19 Oct). YGO Compare's cards did index: its Google clicks
  fell 88% when they were removed (6 Nov), but singles earned A$1.53 of its A$39.93 a week. So: every card is a page, Google sees
  1,000 per game first, then 250 a day, US$1 and up.
- **Order.** Pokémon (no singles anywhere in the network, and it keeps them off Dex during the dexcompare.io move), Yu-Gi-Oh!
  (proven demand, no home), the uncovered games, Magic only after MTG Compare's read on about 9 Dec, the sister-covered games last.
- **Stop rules.** Under 30% of released cards indexed three weeks after a game's launch: `CARD_INDEX_GROWTH=0`, no new game. A
  sealed sister's Google clicks down 15% week on week with no other cause: that game goes noindex. Under A$0.01 a visitor after
  eight weeks: keep, add nothing.
- **What a page has that TCGplayer's does not.** History from the first import (a point only when the value moves 2% and 5 cents;
  cards at US$1 and up), the week's movers (cards at US$5 and up), every game in one search, and a plain dated price sentence plus
  `Product` structured data without an `Offer` (we do not sell the card).
- **Prices per printing as TCGplayer names them** (`Record<subTypeName, cents>`), not MTG Compare's fixed normal/foil/etched:
  Pokémon has Holofoil, Reverse Holofoil and 1st Edition; Yu-Gi-Oh! has 1st Edition, Unlimited and Limited.
- **Data is read with fs and traced into the functions.** Simple and proven on MTG Compare (24 MB of cards). A test fails at
  150 MB; `lib/store.ts` is the one place to change then.
- **US only.** TCGplayer's price is one US-dollar figure; the eBay row is eBay.com. Regions are not built.
- **Not built yet:** the one footer link to `/our-sites` (needs `lib/family-network.ts`), a per-card JSON endpoint, share images.
