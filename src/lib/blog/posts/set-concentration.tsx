import Link from "next/link";
import { Callout, SimpleTable } from "@/components/blog/BlogBits";
import { money } from "../../format";
import type { CardLite } from "../../data";
import type { Post } from "../types";
import { medianOf, packPullable } from "../util";

const BANDS: { label: string; lo: number; hi: number }[] = [
  { label: "US$1–10", lo: 100, hi: 1000 },
  { label: "US$10–50", lo: 1000, hi: 5000 },
  { label: "US$50–200", lo: 5000, hi: 20000 },
  { label: "US$200+", lo: 20000, hi: Infinity },
];

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);

// A market-structure post for collectors who think in portfolios: how much of
// each booster's master-set value sits in its top cards, and how the cheapest
// listing compares with TCGplayer's market price by price band. All US dollars
// (TCGplayer market is a US figure), from the same cached catalogue as the pages.
export const setConcentration: Post = {
  slug: "one-piece-set-value-concentration",
  title: () => "Where the Value Sits in Every One Piece Set (and Who Sells Below Market)",
  description:
    "Master-set value for every One Piece booster, how much of it sits in the top one and top five cards, and how often the cheapest listing beats TCGplayer's market price, by price band.",
  tags: ["market", "analysis", "collecting"],
  date: "2026-10-07",
  minutes: 7,
  related: [
    { href: "/market", label: "OP Compare Index" },
    { href: "/tools/box-ev", label: "Box EV calculator" },
    { href: "/tools/deal-finder", label: "Deal Finder" },
  ],
  build: ({ cat }) => {
    const pool = packPullable(cat).filter((c) => c.marketUsd != null && c.marketUsd > 0);
    const now = Date.now();
    const sets = cat.sets
      .filter((s) => s.kind === "booster" && s.releasedOn && Date.parse(s.releasedOn) <= now)
      .map((s) => {
        const cards = pool.filter((c) => c.setId === s.id).sort((a, b) => b.marketUsd! - a.marketUsd!);
        const total = cards.reduce((t, c) => t + c.marketUsd!, 0);
        const top5 = cards.slice(0, 5).reduce((t, c) => t + c.marketUsd!, 0);
        return {
          s,
          n: cards.length,
          total,
          top: cards[0] as CardLite | undefined,
          top1: total ? cards[0].marketUsd! / total : null,
          top5: total ? top5 / total : null,
          over100: cards.filter((c) => c.marketUsd! >= 10000).length,
          under1: cards.length ? cards.filter((c) => c.marketUsd! < 100).length / cards.length : null,
        };
      })
      .filter((r) => r.n >= 100 && r.top)
      .sort((a, b) => Date.parse(a.s.releasedOn!) - Date.parse(b.s.releasedOn!));
    const medTop1 = medianOf(sets.map((r) => r.top1!));
    const medTop5 = medianOf(sets.map((r) => r.top5!));
    const medUnder1 = medianOf(sets.map((r) => r.under1!));
    const mostConc = [...sets].sort((a, b) => b.top5! - a.top5!)[0];
    const leastConc = [...sets].sort((a, b) => a.top5! - b.top5!)[0];

    const listed = cat.cards.filter((c) => c.printing !== "don" && c.marketUsd != null && c.marketUsd >= 100 && c.low.US != null);
    const bands = BANDS.map((b) => {
      const xs = listed.filter((c) => c.marketUsd! >= b.lo && c.marketUsd! < b.hi);
      return {
        ...b,
        n: xs.length,
        below: xs.length ? xs.filter((c) => c.low.US! < c.marketUsd!).length / xs.length : null,
        ratio: medianOf(xs.map((c) => c.low.US! / c.marketUsd!)),
        stores: medianOf(xs.map((c) => c.stores.US)),
      };
    }).filter((b) => b.n >= 20);
    const top = bands[bands.length - 1];

    return {
      heroCards: [...sets].sort((a, b) => b.total - a.total).slice(0, 3).map((r) => r.top!),
      summary: [
        medTop1 != null && medTop5 != null ? (
          <>
            In the typical One Piece booster, <strong>one card holds {pct(medTop1)}</strong> of the master set&apos;s TCGplayer value and the{" "}
            <strong>top five hold {pct(medTop5)}</strong>.
          </>
        ) : null,
        medUnder1 != null ? <>Meanwhile {pct(medUnder1)} of a typical set&apos;s cards are worth under US$1.</> : null,
        mostConc && leastConc ? (
          <>
            {mostConc.s.code} is the most top-heavy set ({pct(mostConc.top5)} in five cards); {leastConc.s.code} the most spread out ({pct(leastConc.top5)}).
          </>
        ) : null,
        top ? (
          <>
            For cards worth {top.label}, the cheapest listing we track is below TCGplayer market {pct(top.below)} of the time, typically at{" "}
            {top.ratio != null ? `${top.ratio.toFixed(2)}×` : "—"} market.
          </>
        ) : null,
        <>Not financial advice: a snapshot of today&apos;s prices, which move daily.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>How much of a One Piece set&apos;s value is really in its chase cards?</strong> We added up the TCGplayer market price of one copy of every
          card you can pull from each booster (standard prints, Parallels, SPs, Manga and Treasure Rares; no promos or DON!!), then measured how much of
          that total sits in the top one and top five cards. Then we checked how the cheapest listing we track compares with TCGplayer&apos;s market
          price, by price band.
        </p>
      ),
      sections: [
        {
          id: "by-set",
          title: "Every booster's value, and how concentrated it is",
          body: (
            <>
              <p>
                &ldquo;Master set&rdquo; is the sum of one of every pack-pullable card at TCGplayer market. &ldquo;Top card&rdquo; is its share of that total.
              </p>
              <SimpleTable
                head={["Set", "Master set", "Top card", "Top card share", "Top 5 share", "Cards US$100+", "Under US$1"]}
                align={["l", "r", "l", "r", "r", "r", "r"]}
                rows={sets.map((r) => [
                  <Link key="s" href={`/sets/${r.s.slug}`}>
                    {r.s.code}
                  </Link>,
                  money(r.total, "US"),
                  <Link key="c" href={`/card/${r.top!.slug}`}>
                    {r.top!.name}
                    {r.top!.variant ? ` (${r.top!.variant})` : ""}
                  </Link>,
                  pct(r.top1),
                  pct(r.top5),
                  r.over100.toLocaleString("en-US"),
                  pct(r.under1),
                ])}
              />
            </>
          ),
        },
        {
          id: "what-it-means",
          title: "What the concentration means",
          body: (
            <>
              <p>
                A set whose value sits in a handful of cards is a lottery to open: most boxes miss the cards that carry the set, so the typical box returns
                far less than the average box. A flatter set (more cards worth US$100+, a smaller top-five share) spreads its value over more pulls.
              </p>
              <p>
                Concentration also means risk for holders. When most of a set&apos;s value is one card, that card&apos;s price is the set&apos;s price: a
                reprint, a ban or a cooling of demand for one character moves the whole set.
              </p>
              <Callout title="Opening versus buying singles">
                The <Link href="/tools/box-ev">Box EV calculator</Link> weighs a box&apos;s price against live singles prices and pull rates for each set.
              </Callout>
            </>
          ),
        },
        ...(bands.length
          ? [
              {
                id: "below-market",
                title: "How often the cheapest listing beats TCGplayer market",
                body: (
                  <>
                    <p>
                      TCGplayer&apos;s market price is built from recent sales. The cheapest listing is what you could buy for right now, across the US stores we
                      track and TCGplayer itself. Cards worth US$1 or more, in stock in the US:
                    </p>
                    <SimpleTable
                      head={["TCGplayer market", "Cards", "Cheapest listing below market", "Typical cheapest ÷ market", "Typical US stores stocking"]}
                      align={["l", "r", "r", "r", "r"]}
                      rows={bands.map((b) => [b.label, b.n.toLocaleString("en-US"), pct(b.below), b.ratio != null ? `${b.ratio.toFixed(2)}×` : "—", b.stores != null ? String(Math.round(b.stores)) : "—"])}
                    />
                    <p>
                      The pattern: below-market listings are common at every price, but the dearest cards are stocked by the fewest stores, so the gap
                      between shopping around and buying the first listing you see is real money on exactly the cards where it matters most.
                    </p>
                  </>
                ),
              },
            ]
          : []),
        {
          id: "caveats",
          title: "Caveats",
          body: (
            <ul>
              <li>Market prices are TCGplayer&apos;s, in US dollars, for English near-mint copies. Other markets and conditions differ.</li>
              <li>A listing below market may be a lower condition, one copy, or priced before a recent rise. Check the listing.</li>
              <li>Item prices only: postage and tax are extra.</li>
              <li>This is a snapshot of today&apos;s prices, not a forecast and not financial advice.</li>
            </ul>
          ),
        },
      ],
    };
  },
};
