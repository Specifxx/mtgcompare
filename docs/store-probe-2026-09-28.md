# Store probe, 28 September 2026

Follow-up to [`store-probe-2026-09.md`](store-probe-2026-09.md). Two jobs: check
the 20 stores the last import had flagged as dormant or dead, and find new
independent stores where the registry was thin (UK, EU, NZ, SG). Every store
checked is a row in [`store-probe-2026-09-28.csv`](store-probe-2026-09-28.csv)
with its outcome.

Same method as September: `scripts/probe-stores.ts` at concurrency 3 (Shopify
rate-limits per IP across all its storefronts), currency must match the
market, at least 3 English Pokémon sealed products through `identify()`, then
`scripts/registry-from-probe.ts` to merge. One rule added this time, matching
the importer's own "dormant" test: **a new store also needs at least one
sealed product in stock at probe time.** A store listing 20+ sealed products
with none orderable is what got the 20 removed, so adding more of the same
would be pointless.

## Counts

| Region | Before (HEAD) | After removals | Added | **Now** |
| --- | ---: | ---: | ---: | ---: |
| AU | 60 | 57 | 3 | **60** |
| CA | 79 | 79 | 3 | **82** |
| EU | 58 | 54 | 16 | **70** |
| NZ | 8 | 7 | 16 | **23** |
| SG | 16 | 16 | 5 | **21** |
| UK | 57 | 48 | 16 | **64** |
| US | 66 | 63 | 5 | **68** |
| **Total** | **344** | **324** | **64** | **388** |

Targets were +15 UK, +10 EU, +10 NZ, +8 SG. SG fell short (+5): Singapore's
shops are overwhelmingly on custom builds, Wix, Squarespace, EasyStore or
Instagram/Carousell only (100 of 129 SG candidates had no Shopify/Woo feed),
and the few Shopify ones mostly sell Japanese or Chinese product.

## Removed (20) — verified, none restored

Each was re-probed live on 28 Sep (`stores2/probe-removed.json`): the probe
re-reads the store's sitemap, re-ranks every collection and reports how many
of the sealed products it finds are orderable, so a new live Pokémon
collection would have shown up. Every one still reads fine and still has
**0 in stock** across its sealed listings; a whole-store `/products.json`
pass (up to 1,000 products, done earlier the same day) agreed. They stay out.

| Region | Store | Sealed listed | In stock | Why removed |
| --- | --- | ---: | ---: | --- |
| AU | Card Tribe Australia (cardtribe.com.au) | 21 | 0 | dormant |
| AU | Loot Vault (lootvault.au) | 76 | 0 | dormant |
| AU | One Stop Poke Mart (onestoppokemart.com.au) | 52 | 0 | dormant (sold-out Sword & Shield / XY / Sun & Moon back catalogue) |
| EU | BaruZcard (baruzcard.it) | 81 | 0 | dormant |
| EU | Pokeflip (pokeflip.com) | 123 | 0 | dormant (whole store: 0 of 175 products orderable) |
| EU | Poké-Geek (poke-geek.fr) | 27 | 0 | dormant; mostly Japanese/French product |
| EU | Prime Protector (primeprotector.at) | 33 | 0 | dormant (one English booster pack orderable store-wide) |
| NZ | Spellbound Games NZ (spellboundgames.co.nz) | 221 | 0 | dormant (7 of 1,000 products orderable, none sealed) |
| UK | Gathering Games (gatheringgames.co.uk) | 284 | 0 | dormant |
| UK | Incom Gaming (incomgaming.co.uk) | 27 | 0 | dormant |
| UK | JET Cards (jetcards.uk) | 222 | 0 | dormant |
| UK | Mox in the Hole (moxinthehole.co.uk) | 49 | 0 | dormant (only a pre-orders collection, all closed) |
| UK | PikaShop (pikashop.co.uk) | 188 | 0 | dormant (0 of 1,000 products orderable — shop appears closed) |
| UK | PROBUYTCG (probuytcg.co.uk) | 56 | 0 | dormant (0 of 153 products orderable) |
| UK | The TCG Shop (thetcgshop.co.uk) | 27 | 0 | dormant |
| UK | Thirsty Meeples (thirstymeeples.co.uk) | 25 | 0 | dormant (board-game café; Pokémon shelf empty) |
| UK | Union County Games (unioncountygames.co.uk) | 48 | 0 | dormant |
| US | PokeBox USA (pokeboxusa.com) | 149 | 0 | dormant (one ETB promo orderable store-wide) |
| US | The Stadium BC (the-stadium-bc.myshopify.com) | 157 | 0 | dormant |
| US | The Crimson Guild (ffcf84.myshopify.com) | – | – | dead: `products.json` gone (404), store closed |

Two other stores the earlier dormant check looked at, Jeffthrowcards (US) and
Obsidian Games (CA), were kept because they had sealed product in stock when
probed; the scratch import below still reported them dormant from their
*previous* rows (they weren't in this run's `--only` list), so the next full
import should be the judge.

## Added (64)

Candidates came from web search (store names, "booster box"/"elite trainer
box" queries per region, directories such as CardCompass UK, Which?, The
Smart Local SG, TCGRadar) and the shop lists in the task. 611 stores were
probed in all (including the 20 above); 67 cleared the bar and were merged,
then 3 were taken back out after the import (see below), leaving 64.

Every added store was imported into a scratch copy of the database
(`CREATE DATABASE dexsealed_stores TEMPLATE dexsealed`, `prisma db push`,
`import.ts --only <keys> --concurrency 3`; dropped afterwards). Numbers are
what that import wrote — sealed offers listed / in stock:

| Region | Key | Store | Base | Listed | In stock | Collections read |
| --- | --- | --- | --- | ---: | ---: | --- |
| AU | `gdgames` | GD Games | www.gdgames.com.au | 53 | 48 | pokemon-tcg-australia ascended-heroes-pokemon-tcg pitch-black-pokemon-tcg |
| AU | `sportscardstore` | Sports Card Store | sportscardstore.com.au | 4 | 2 | pokemon-boxes pokemon-cases |
| AU | `trainertown` | Trainer Town | trainertown.com.au | 31 | 20 | pokemon-cards pokemon-tcg-mega-evolution pokemon-booster-boxes pokemon-elite-trainer-box |
| CA | `danireon` | Danireon Cards & Games | danireon.com | 321 | 38 | pokemon-tins pokemon-blister-packs pokemon-booster-boxes pokemon-sealed-on-sale |
| CA | `gamesland` | GamesLand Canada | gamesland.ca | 195 | 44 | pokemon all-pokemon |
| CA | `justahobby` | Just-a-Hobby | www.justahobby.store | 534 | 245 | english-pokemon |
| EU | `biridama` | Biridama TCG | www.biridama.pt | 178 | 36 | all-pokemon |
| EU | `cardcosmos` | CardCosmos | cardcosmos.de | 37 | 3 | pokemon-tins pokemon-blister |
| EU | `collectorexpert` | Collector Expert | collector-expert.de | 46 | 46 | pokemon-karten |
| EU | `crispycards` | Crispy Cards | crispycards.de | 80 | 38 | pokemon-tin-boxen pokemon-booster pokemon-display |
| EU | `debroergrot` | De Broergrot | www.debroergrot.nl | 32 | 25 | booster-packs booster-box elite-trainer-box pokemonsale |
| EU | `iberiancollect` | Iberian Collect | iberiancollect.com | 19 | 2 | pokemon-booster-pack-box etb-pokemon pokemon-tcg |
| EU | `kardz` | Kardz.eu | kardz.eu | 3 | 2 | pokemon-151 booster-packs |
| EU | `mojocards` | Mojo Cards | mojocards.nl | 17 | 10 | pokemon pokemon-151 booster-packs |
| EU | `otakura` | Otakura | otakura.com | 55 | 3 | display-buste-pokemon carte-pokemon |
| EU | `pikamon` | Pikamon | pikamon.eu | 55 | 12 | pokemon |
| EU | `pokemillon` | PokeMillon | www.pokemillon.com | 122 | 40 | cartas-pokemon-inglesas pokemon-go pokemon-center |
| EU | `pokemonwinkel` | Pokemon Winkel | pokemonwinkel.nl | 186 | 10 | pokemon-tcg-v-box elite-trainer-box booster-box pokemon-go-tcg |
| EU | `pokepower` | PokePower | poke-power.eu | 219 | 2 | pokemon |
| EU | `pushdichtcg` | Pushdich TCG | www.pushdich-tcg.de | 5 | 5 | pokemon-karten-englisch |
| EU | `templarsarena` | Templars Arena | templarsarena.com | 165 | 41 | tins-pokemon blister-pokemon boosters-pokemon premium-sets-pokemon |
| EU | `toytreasure` | Toy Treasure | toy-treasure.com | 154 | 92 | pokemon pokemon-booster |
| NZ | `animalkingdoms` | Animal Kingdoms | animalkingdoms.co.nz | 38 | 18 | pokemon-tcg |
| NZ | `boostergames` | Booster Games | www.boostergames.co.nz | 39 | 1 | pokemon-tcg |
| NZ | `cardcollective` | Card Collective NZ | cardcollective.co.nz | 13 | 3 | all-pokemon-tcg |
| NZ | `collectorsguild` | Collectors Guild | collectorsguild.co.nz | 28 | 2 | english-pokemon |
| NZ | `goblingames` | Goblin Games NZ | goblingames.nz | 31 | 7 | pokemon-tcg-sealed-packs pokemon-sealed-1 |
| NZ | `imyourwardrobe` | Im Your Wardrobe | imyourwardrobe.com | 28 | 28 | pokemon-elite-trainer-boxes pokemon-booster-boxes |
| NZ | `novagames` | Nova Games | novagames.co.nz | 5 | 5 | pokemon |
| NZ | `ocare` | OCARE | ocare.co.nz | 52 | 7 | pokemon |
| NZ | `playx` | PlayX | www.playx.co.nz | 190 | 2 | pokemon |
| NZ | `pokestash` | Poke Stash | pokestash.co.nz | 1228 | 83 | pokemon-products pokemon-go pokemon-products-in-stock |
| NZ | `popstop` | Pop Stop | popstop.co.nz | 308 | 7 | pokemon |
| NZ | `prospernz` | PROSPER Boutique | prospernz.com | 25 | 23 | pokemon-new |
| NZ | `razorleaf` | Razor Leaf | www.razorleaf.co.nz | 8 | 7 | elite-trainer-boxes booster-packs |
| NZ | `tcgmanavault` | TCG Mana Vault | tcgmanavault.com | 13 | 12 | pokemon-sealed-products |
| NZ | `toytime` | Toy Time | toytime.co.nz | 14 | 8 | pokemon-tcg |
| NZ | `wpgames` | WP Games | wpgames.co.nz | 27 | 12 | pokemon-tcg |
| SG | `cardboardcollectible` | Cardboard Collectible | cardboardcollectible.com | 64 | 3 | sealed |
| SG | `greyogregames` | Grey Ogre Games | www.greyogregames.com | 43 | 14 | pokemon-sealed-prodcuts-no-packs pokemon-ascended-heroes pokemon-sealed |
| SG | `humbletcg` | Humble TCG | humbletcg.com | 7 | 5 | booster-boxes elite-trainer-boxes booster-packs collection-boxes |
| SG | `sawadeekard` | Sawadeekard | sawadeekard.com | 109 | 45 | new-nav-all-pokemon-products |
| SG | `spearingcollectibles` | Spearing Collectibles | www.spearingcollectibles.com | 46 | 16 | pokemon-card-packs pokemon |
| UK | `aftermkt` | After Market | aftermkt.co.uk | 42 | 7 | elite-trainer-boxes booster-boxes tins pokemon |
| UK | `bristolindependentgaming` | Bristol Independent Gaming | bristolindependentgaming.co.uk | 17 | 3 | pokemon |
| UK | `buyanycards` | Buy Any Cards | buyanycards.co.uk | 66 | 19 | pokemon-elite-trainer-boxes pokemon-trading-card-game pokemon-booster-boxes booster-packs |
| UK | `cardandink` | Card & Ink | www.cardandink.com | 6 | 6 | sealed-products |
| UK | `collectorclash` | Collector Clash | collectorclash.com | 63 | 9 | pokemon |
| UK | `collectorskingdom` | Collectors Kingdom | collectorskingdom.co.uk | 74 | 33 | pokemon |
| UK | `crackthepack` | Crack The Pack | crackthepack.com | 34 | 30 | pokemon-tcg |
| UK | `elemental` | Elemental Cards | elemental.cards | 96 | 7 | sealed-pokemon pokemon-booster-box pokemon-booster-pack etb |
| UK | `hokeypokegames` | Hokey Poke Games | hokeypokegames.co.uk | 61 | 21 | all-pokemon |
| UK | `koolthings` | Koolthings | www.koolthings.co.uk | 10 | 6 | pokemon-1 |
| UK | `meeplescorner` | Meeples Corner | meeplescorner.co.uk | 41 | 2 | pokemon-tcg |
| UK | `pokestadiumcards` | PokeStadium Cards | pokestadiumcards.co.uk | 30 | 20 | search:pokemon |
| UK | `pokevend` | Pokevend | pokevend.co.uk | 77 | 33 | all-pokemon-products |
| UK | `rarepokemoncards` | Rare Pokémon Cards UK | rarepokemoncards.co.uk | 50 | 49 | sealed-pokemon-products-uk |
| UK | `terrorstcg` | Terrors TCG | www.terrorstcg.com | 12 | 11 | pokemon booster-pack |
| UK | `trolltradercards` | Troll Trader Cards | trolltradercards.com | 12 | 11 | pokemon-booster-pack |
| US | `blackwolfcollectibles` | Black Wolf Collectibles | blackwolfcollectibles.com | 197 | 121 | all-pokemon |
| US | `geekerygames` | Geekery Games | geekerygames.com | 7 | 7 | pokemon |
| US | `mhdealsplus` | MH Deals Plus | mhdealsplus.com | 24 | 19 | booster-boxes pokemon-tcg |
| US | `tcgora` | TCGORA | tcgora.com | 42 | 12 | elite-trainer-box pre-orders |
| US | `ultimasupply` | Ultima Supply | ultimasupply.com | 63 | 18 | pokemon |

Import totals for the 67 keys: 66/67 read OK, 5,913 offers written, 1,527 in
stock, 2.4 minutes. Per region — AU 88/70, CA 1,050/327, EU 1,373/367,
NZ 2,109/236, SG 269/83, UK 691/267, US 333/177 (offers/in stock).

Hand edits after the merge (the probe's greedy cover optimises product
coverage per page, not language or egress):

- `pokemillon` (ES): the probe chose `cartas-pokemon-chino` and
  `cartas-pokemon-japon`; set to `cartas-pokemon-inglesas`, `pokemon-go`,
  `pokemon-center` (English only; 122 sealed listed, 40 in stock).
- `pushdichtcg` (DE): dropped `pokemon-karten-deutsch`, kept
  `pokemon-karten-englisch` (5 sealed, all in stock).
- `collectorclash` (UK): dropped `all-non-pokemon`.
- `goblingames` (NZ): `pokemon` (2,000+ products for 12 extra sealed)
  replaced by `pokemon-sealed-1`.
- `elemental` (UK): `pokemon` (750 products) replaced by
  `pokemon-booster-box`, `pokemon-booster-pack`, `etb`.
- `prospernz` (NZ): `new-arrivals` (163 products) replaced by `pokemon-new`.

Merged, then removed again after the scratch import:

- `dektcgshop` (SG): moved from Shopify to WooCommerce between the morning
  probe and the evening import; the new catalogue lists one English Pokémon
  product. Import: 0 read.
- `kidzstuffonline` (NZ): toy shop with no Pokémon collection — its 9 sealed
  products were only reachable through a 2,000-product `new-arrivals` feed.
- `metalife` (NZ): 53 sealed / 2 in stock, reachable only through
  `preorder` + `new-arrivals` (2,400 products a day).

One known classifier gap seen in the import: `sawadeekard` lists one
Chinese item (`[CHI] Pikachu V-Union Gift Box`) that `identify()` accepts;
everything else it lists is `[ENG]`-prefixed. Not fixable from the registry.

## Candidates that failed, and why

Outcome per probed candidate (latest result; the 20 re-probed removals are
not in this table, the 67 merged are the "Listed" column):

| Region | Probed | Listed | Dormant (0 in stock) | Too few sealed | Wrong currency | No public feed | Rate limited | Excluded |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| AU | 6 | 3 | 0 | 0 | 0 | 3 | 0 | 0 |
| CA | 7 | 3 | 0 | 1 | 0 | 3 | 0 | 0 |
| EU | 115 | 16 | 1 | 16 | 2 | 79 | 0 | 1 |
| NZ | 62 | 18 | 0 | 9 | 2 | 32 | 1 | 0 |
| SG | 129 | 6 | 1 | 17 | 4 | 100 | 1 | 0 |
| UK | 279 | 16 | 13 | 23 | 14 | 212 | 0 | 1 |
| US | 13 | 5 | 0 | 1 | 0 | 7 | 0 | 0 |
| **Total** | **611** | **67** | **15** | **67** | **22** | **436** | **2** | **2** |

- **No public feed** is the big bucket. It mixes real shops on other platforms
  (Chaos Cards, Magic Madhouse, Big Orbit, Kirton Games, Eclipse Cards,
  Cardz UK, Poke Potion, Hobby Master, Zatu's board-game.co.uk side, Dark
  Sphere, Orcs Nest, Forbidden Planet's own platform, Cardboard Crack SG,
  Games Haven, Card Bazaar, Toyzsealed, Sakura Play, Poladex, That TCG
  Store, Vagabond NZ…) with domain guesses for shops that turned out to have
  no web store at all (much of the UK count — CardCompass lists 60+ Pokémon
  shops, most of them counter-only).
- **Dormant, not added** (15): 365 Games (58 sealed), Wishlist Collectables
  (83), Northumbrian Tin Soldier (251), Battleground Gaming UK (34), Langden
  Games (20), Phantom Cards UK (25), Wright Cards (17), Game HQ (17),
  Silvermine (9, Japanese focus), Puca Puca Games (6), Harlequins Games (5),
  Bearded Collectables (5), Prime Cards (3), Fantasy World BE (91), Happyland
  Collectibles SG (7). All read fine, none orderable. Worth a re-probe in a
  month — 365 Games and Wishlist in particular look like stock, not closure.
- **Too few sealed** (67): mostly singles/Japanese shops, board-game stores
  with a token Pokémon shelf (Forbidden Planet 2, Toy Or Game SG 2, Vorum 1,
  AFK Gaming 1), or Shopify shops whose Pokémon lives in collections the
  sitemap doesn't expose (Trident Cards, Pokestores, CardRush, Leisure Games,
  Dice and Dumplings, Entoyment, Loaded Dice, Card Empire, Beattys IE — all
  read 0). Cardian SG, Daruma Gaming SG and Mana Pro SG read hundreds of
  products, none English sealed.
- **Wrong currency** (22): Shopify stores on a UK/SG/NZ domain that checkout
  in USD or CAD (The Poke Office, CF31 TCG, CardXCards, DuckPondTCG, TCG
  Temple SG…), Collectable Kiwi and Ace Comics with no readable currency,
  Waroffice likewise.
- **Rate limited** (2): cardboardcrackgames.com throttles even a single
  sequential read (429 on retry); turtleisland.co.nz 429 once, not retried.
- **Excluded by hand** (2): Asmodee UK (distributor/publisher storefront —
  sells cases and CDUs, not an independent retailer) and cardcosmos.at
  (identical catalogue to cardcosmos.de, which is listed).
- Marketplaces and big-box chains found along the way were not probed:
  Amazon, eBay, Cardmarket, Carousell, Shopee, Zavvi, Smyths, GAME, Argos,
  Kyo Cards (marketplace), Packrat (own platform + marketplace).

## Re-run

```
npx tsx scripts/probe-stores.ts --in candidates.json --out probe.json
npx tsx scripts/registry-from-probe.ts probe.json
```

The candidate files and probe outputs for this run are in the session
scratchpad (`stores2/cands1-7.json`, `stores2/probe1-7.json`,
`stores2/probe-removed.json`, plus the morning's `probe-a…g.json`); the CSV
next to this file is their union, one row per store.
