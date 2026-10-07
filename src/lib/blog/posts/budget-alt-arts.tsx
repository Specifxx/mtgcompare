import Link from "next/link";
import { Callout, CardTable, SimpleTable } from "@/components/blog/BlogBits";
import { COLOR_KEYS } from "../../constants";
import { COUNTRIES } from "../../country";
import { money } from "../../format";
import type { CardLite } from "../../data";
import type { Post } from "../types";
import { medianOf, plural } from "../util";

const TIERS: { key: string; label: string }[] = [
  { key: "alt", label: "Parallel / Full Art" },
  { key: "sp", label: "SP" },
  { key: "treasure", label: "Treasure Rare" },
  { key: "manga", label: "Manga" },
];

// "Bling on a budget": the cheapest in-stock alternate-art print of each card,
// what it costs over the standard print, by colour. Built from the same cached
// catalogue as the price pages; every figure is the visitor's market.
export const budgetAltArts: Post = {
  slug: "cheapest-one-piece-alt-arts-by-colour",
  title: () => "Bling on a Budget: The Cheapest One Piece Alt Arts, by Colour",
  description:
    "What upgrading a One Piece deck to alternate arts really costs: the cheapest Parallel prints in stock in every colour, the cheapest alt-art Leaders, and what each art tier costs over the standard print.",
  tags: ["guide", "budget", "collecting"],
  date: "2026-10-06",
  minutes: 6,
  related: [
    { href: "/price-guide", label: "Price guide" },
    { href: "/colors", label: "Cards by colour" },
    { href: "/leaders", label: "Every Leader" },
  ],
  build: ({ cat, country }) => {
    const c = COUNTRIES[country];
    const inStock = (x: CardLite) => x.low[country] != null;
    const price = (x: CardLite) => x.low[country]!;
    // The standard print of each card number, for the "extra over the base" column.
    const base = new Map<string, CardLite>();
    for (const x of cat.cards) {
      if (x.printing !== "standard" || !x.number) continue;
      const prev = base.get(x.number);
      const p = x.low[country] ?? null;
      if (p != null && (!prev || prev.low[country] == null || p < prev.low[country]!)) base.set(x.number, x);
    }
    const alts = cat.cards.filter((x) => TIERS.some((t) => t.key === x.printing) && inStock(x));
    const parallels = alts.filter((x) => x.printing === "alt").sort((a, b) => price(a) - price(b));
    const tiers = TIERS.map((t) => {
      const xs = alts.filter((x) => x.printing === t.key).map(price);
      return { ...t, n: xs.length, median: medianOf(xs), min: xs.length ? Math.min(...xs) : null };
    }).filter((t) => t.n > 0);
    const under = (cents: number) => parallels.filter((x) => price(x) < cents).length;
    const byColour = COLOR_KEYS.map((k) => ({
      k,
      rows: parallels.filter((x) => x.cardType !== "Leader" && x.colors.length === 1 && x.colors[0] === k).slice(0, 6),
    })).filter((g) => g.rows.length);
    const leaders = parallels.filter((x) => x.cardType === "Leader").slice(0, 8);
    const extras = parallels
      .map((x) => ({ x, b: x.number ? base.get(x.number) : undefined }))
      .filter((r): r is { x: CardLite; b: CardLite } => !!r.b && r.b.low[country] != null)
      .map((r) => ({ ...r, extra: price(r.x) - r.b.low[country]! }));
    const medianExtra = medianOf(extras.map((r) => r.extra));
    const smallest = [...extras].filter((r) => r.extra >= 0 && (r.x.rarity === "SR" || r.x.rarity === "R")).sort((a, b) => a.extra - b.extra).slice(0, 10);
    const parallelTier = tiers.find((t) => t.key === "alt");

    return {
      heroCards: parallels.filter((x) => x.hasImage && (x.rarity === "SR" || x.rarity === "L")).slice(0, 3),
      summary: [
        parallelTier ? (
          <>
            <strong>{plural(parallelTier.n, "Parallel")}</strong> are in stock in {c.place}; the typical one costs {money(parallelTier.median, country)}.
          </>
        ) : null,
        <>
          <strong>{under(300)}</strong> Parallels cost under {c.symbol}3 and <strong>{under(1000)}</strong> under {c.symbol}10: alternate art is not only for
          chase cards.
        </>,
        medianExtra != null ? <>The typical Parallel costs {money(medianExtra, country)} more than the cheapest standard print of the same card.</> : null,
        <>SP, Treasure Rare and Manga prints are a different league: those are collector chases, not deck upgrades.</>,
        <>Prices are each card&apos;s cheapest in-stock listing in {c.place}, refreshed twice a day.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>Want your deck to look the part without paying chase-card prices?</strong> Most One Piece cards have an alternate-art print (a Parallel or Full Art), and
          plenty of them cost little more than the standard card. We went through every alt-art print in stock in {c.place} and pulled out the cheapest in
          each colour, the cheapest alt-art Leaders, and the upgrades that cost the least over the base card.
        </p>
      ),
      sections: [
        {
          id: "tiers",
          title: "What each art tier costs",
          body: (
            <>
              <p>
                One Piece has four kinds of special print. The Parallel is the everyday alternate art, printed for most Rares, Super Rares, Leaders and many
                Commons; SP, Treasure Rare and Manga prints are much rarer pulls.
              </p>
              <SimpleTable
                head={["Print", "In stock", "Typical price", "Cheapest"]}
                align={["l", "r", "r", "r"]}
                rows={tiers.map((t) => [t.label, t.n.toLocaleString("en-US"), money(t.median, country), money(t.min, country)])}
              />
            </>
          ),
        },
        ...(leaders.length
          ? [
              {
                id: "leaders",
                title: "The cheapest alt-art Leaders",
                body: (
                  <>
                    <p>The Leader sits face up all game, so it is the one card everyone sees. These alt-art Leaders cost the least right now:</p>
                    <CardTable cards={leaders} setById={cat.setById} country={country} />
                  </>
                ),
              },
            ]
          : []),
        ...byColour.map((g) => ({
          id: g.k.toLowerCase(),
          title: `Cheapest ${g.k} Parallels`,
          body: <CardTable cards={g.rows} setById={cat.setById} country={country} />,
        })),
        ...(smallest.length
          ? [
              {
                id: "smallest-upgrade",
                title: "Rares and Super Rares where the alt art costs almost nothing extra",
                body: (
                  <>
                    <p>
                      The Parallel against the cheapest standard print of the same card number. For these, the upgrade costs less than a booster pack:
                    </p>
                    <SimpleTable
                      head={["Card", "Standard", "Parallel", "Extra"]}
                      align={["l", "r", "r", "r"]}
                      rows={smallest.map((r) => [
                        <Link key="c" href={`/card/${r.x.slug}`}>
                          {r.x.name} ({r.x.number})
                        </Link>,
                        money(r.b.low[country], country),
                        money(price(r.x), country),
                        money(r.extra, country),
                      ])}
                    />
                  </>
                ),
              },
            ]
          : []),
        {
          id: "tips",
          title: "Tips before you buy",
          body: (
            <>
              <ul>
                <li>
                  <strong>Check the number and the set.</strong> Many cards have several Parallels from different sets and promos, priced very differently.
                  Match the set code on the listing.
                </li>
                <li>
                  <strong>English and Japanese prints are different products.</strong> A Japanese Parallel is often cheaper, but it is not the card a listing in
                  English shows. These prices are English prints only.
                </li>
                <li>
                  <strong>Postage matters on cheap cards.</strong> A {c.symbol}2 card with {c.symbol}5 postage is a {c.symbol}7 card. Buy several from the same
                  store.
                </li>
                <li>
                  <strong>Reprints move prices.</strong> Cards reprinted in starter decks or Premium Boosters often get cheaper alt arts too.
                </li>
              </ul>
              <Callout title="Pricing your own list">
                Paste a decklist into the <Link href="/deck">Deck Builder &amp; Pricer</Link> and switch any card to its Parallel to see the total change.
              </Callout>
            </>
          ),
        },
      ],
    };
  },
};
