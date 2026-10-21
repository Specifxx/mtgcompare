# Reddit launch kit

Every link below has its own 1200×630 thumbnail (`/og/<region>`, `/og/guides/<slug>`), which Reddit pulls from the page's
`og:image`. Open the card URL first (for example `https://www.dexcompare.app/og/au`) to see what Reddit will show: it caches the
thumbnail the first time a link is posted.

## Ground rules (read before posting)

- **Say it's yours.** Every post below says "I built". Reddit and nearly every subreddit treat undisclosed self-promotion as spam.
- **Read each subreddit's rules first.** r/PokemonTCG has had a weekly *Self Promo Sunday* thread; if its sidebar still says
  promotion goes there, post there, not as a new post. Other subs want a summary in the post text, not a bare link.
- **One sub a day, not ten in an hour.** Cross-posting the same link everywhere at once gets accounts filtered.
- **Stay and answer comments** for the first couple of hours. That is what makes a launch post work, and it's where the
  "can you add my store?" requests come from (point them at <https://www.dexcompare.app/about#stores>).
- Use an account with some normal history. Brand-new accounts posting a link are often auto-removed.

## Post 1 — the main launch (link post)

**Where:** r/PokemonTCG (Self Promo Sunday thread if that's the rule), r/pokemoncardcollectors, deal subreddits
whose rules allow tools.

**Link:** `https://www.dexcompare.app/` (the region picker; its card says "388 stores in 7 regions")

**Title:**
> I built a free site that compares Pokémon sealed prices and stock across 388 independent stores (AU, US, UK, CA, NZ, EU, SG)

**First comment (post it yourself right away):**
> Hey all, I made DexCompare because checking 20 store websites for an ETB got old.
>
> - Booster boxes, ETBs, bundles, collections, tins: English sealed only, no singles
> - Every store's own price in your currency, in stock first, cheapest first
> - Prices and stock read about twice a day, and every listing says when it was last checked
> - Price per pack on every product, plus a "cheapest per pack" page for every set
> - Free, no sign-up, and no store pays to be listed or to rank
>
> It earns from marked eBay/TCGplayer affiliate links. Store links are plain.
>
> Missing a store you like, or spot a product on the wrong page? Tell me here and I'll add or fix it.

## Post 2 — region-specific (best for local subs)

Local subs reward local tools. Swap in the region:

| Region | Link (thumbnail says…) | Subs to check |
| --- | --- | --- |
| Australia | `https://www.dexcompare.app/au` ("60 Australian stores") | r/PokemonFansAustralia, r/australia (only if allowed), state TCG subs |
| UK | `https://www.dexcompare.app/uk` ("64 UK stores") | r/PokemonTCG_UK |
| Canada | `https://www.dexcompare.app/ca` ("82 Canadian stores") | Canadian Pokémon TCG subs (search Reddit; check each sub's rules) |
| NZ | `https://www.dexcompare.app/nz` ("23 New Zealand stores") | NZ TCG subs (r/newzealand only if its rules allow it) |
| US | `https://www.dexcompare.app/us` ("68 US stores") | r/pokemoncardcollectors, r/PokemonTCG |

**Title (AU example):**
> I made a site that compares Pokémon booster box & ETB prices across 60 Australian stores, cheapest in stock first

**First comment:**
> Every price is in AUD, straight from each store's website, read about twice a day. Products are sorted in stock first, then
> cheapest. There's a deals page (stuff well under what other stores charge today) and a cheapest-per-pack page for every set.
> Free, no account. I built it, so feedback and missing stores are very welcome.

## Post 3 — useful content, not the homepage (later in the week)

Guides get a better reception than a homepage link, and still bring people to the site. Each has its own title card.

- **"Which product actually gives the cheapest Pokémon pack right now? I ranked them by price per pack"** →
  `https://www.dexcompare.app/us/guides/cheapest-way-to-buy-pokemon-packs` (or `/au/…`, `/uk/…` for local subs)
- **"Pokémon Center ETB vs regular ETB: 11 packs vs 9, here's what each costs per pack today"** →
  `https://www.dexcompare.app/us/guides/pokemon-center-etb-vs-elite-trainer-box`
- **"A checklist for avoiding resealed booster boxes and ETBs"** →
  `https://www.dexcompare.app/us/guides/how-to-avoid-resealed-pokemon-products`

For these, put a short summary of the answer in the post body (two or three lines and the table's headline), then the link. Subs
like r/pkmntcg require that external links come with a summary.

## After posting

- Vercel → Analytics → Referrers shows Reddit traffic per post; `buy_click` events show what it turned into (DEPLOY.md, "Click events").
- Replies asking for a store: run the probe (README, "Adding a store") and answer when it's live. Being able to say "added" is the
  best follow-up comment you can post.
