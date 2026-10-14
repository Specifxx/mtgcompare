import Link from "next/link";
import { Callout, SimpleTable } from "@/components/blog/BlogBits";
import { COUNTRIES, MARKETS, type Country } from "../../country";
import type { SealedLite } from "../../data";
import { money, shortDate } from "../../format";
import { BOX_ROWS, cheapestBoxes, perPack } from "../select";
import type { Post, PostSection } from "../types";
import { monthYear } from "../util";

const boxLink = (s: SealedLite) => (
  <Link key="b" href={`/sealed/${s.slug}`}>
    {s.name}
  </Link>
);

// The other end of the booster-box post: the cheapest boxes a store has in stock, market by market (each market's own listings in its own
// currency), and the cheapest by TCGplayer market price. Every released Booster Box product we list is read (context.ts loadCheapBoxes);
// a pre-order is not a box you can buy today and is left out.
export const cheapBoxes: Post = {
  slug: "cheapest-magic-booster-boxes",
  title: ({ cat }) => `The Cheapest Magic Booster Boxes in Stock (${monthYear(cat.pricesAt)})`,
  description:
    "The cheapest Magic: The Gathering booster boxes in stock right now in each of our six markets, from store listings in each market's own currency, with the cost per pack where the pack count is known and the cheapest boxes by TCGplayer market price.",
  tags: ["sealed", "booster box", "budget"],
  date: "2026-10-14",
  minutes: 4,
  related: [
    { href: "/sealed", label: "Sealed products" },
    { href: "/tools/box-ev", label: "Box EV calculator" },
    { href: "/stores", label: "Stores we compare" },
  ],
  faq: [
    {
      q: "What is the cheapest Magic booster box?",
      a: "It depends on your market and changes with stock. The first table of this post lists the cheapest boxes in stock at a store we track in your market today, cheapest first, and the market-by-market table gives the cheapest box in each of the six markets.",
    },
    {
      q: "Is a cheap booster box good value?",
      a: "A low price per pack is not the same as good value: what matters is what the packs are likely to hold. Older or less popular sets are cheap because their cards are cheap. The [Box EV calculator](/tools/box-ev) weighs a box's price against the singles you can open.",
    },
    {
      q: "Why are pre-orders left out?",
      a: "A pre-order is a box that is not out yet: its price is a promise for a future delivery date and often falls after release. This post lists boxes you can buy and receive now; upcoming sets are on the [release dates page](/release-dates).",
    },
    {
      q: "Do these prices include postage?",
      a: "No. Each price is the item price of the cheapest in-stock listing we track, in the market's own currency. Postage on a box is often large and differs by store, so compare the total at checkout before you buy.",
    },
  ],
  build: ({ cheapBoxes: all, newest, setById, country }) => {
    const c = COUNTRIES[country];
    if (!all) {
      return {
        heroCards: [],
        summary: [],
        lede: (
          <p>
            The booster box prices could not be read just now, so this post has no tables on this page load. Every box is on the <Link href="/sealed">sealed products
            page</Link>.
          </p>
        ),
        sections: [],
      };
    }
    const released = all.filter((b) => !b.presale);
    const mine = cheapestBoxes(released, country);
    const inStock = released.filter((b) => b.low[country] != null && (b.stores[country] ?? 0) > 0).length;
    const perMarket = MARKETS.map((m) => ({ m, box: cheapestBoxes(released, m, 1)[0] })).filter((x): x is { m: Country; box: SealedLite } => !!x.box);
    const byMarket = released
      .filter((b) => b.marketUsd != null && b.marketUsd > 0)
      .sort((a, b) => a.marketUsd! - b.marketUsd! || a.id - b.id)
      .slice(0, BOX_ROWS);
    const released_ = (s: SealedLite): string => shortDate(s.releasedOn ?? (s.setId != null ? setById.get(s.setId)?.releasedOn : null));
    const first = mine[0];
    const firstPack = first ? perPack(first.low[country], first.packCount) : null;
    const tcgFirst = byMarket[0];

    const sections: PostSection[] = [];
    if (mine.length) {
      sections.push({
        id: "your-market",
        title: `The ${mine.length} cheapest booster boxes in stock in ${c.place}`,
        body: (
          <>
            <p>
              The cheapest in-stock listing at a store we track in {c.place}, in {c.currency}, with how many stores have the box. &ldquo;Per pack&rdquo; divides that
              price by the pack count where our data has one.
            </p>
            <SimpleTable
              head={["Box", "Released", `Cheapest in ${c.code}`, "Stores", "Per pack"]}
              align={["l", "l", "r", "r", "r"]}
              rows={mine.map((s) => [boxLink(s), released_(s), money(s.low[country], country), s.stores[country], perPack(s.low[country], s.packCount) != null ? money(perPack(s.low[country], s.packCount), country) : "—"])}
            />
          </>
        ),
      });
    }
    if (perMarket.some((x) => x.m !== country)) {
      sections.push({
        id: "by-market",
        title: "The cheapest box in each market",
        body: (
          <>
            <p>
              Each market&apos;s own cheapest in-stock box, in its own currency. The boxes differ because stock differs: a box sold out in one market can be the
              cheapest in another. Whether a cheaper market is worth ordering from once postage is added is in the{" "}
              <Link href="/guides/are-magic-cards-cheaper-abroad">guide to buying abroad</Link>.
            </p>
            <SimpleTable
              head={["Market", "Box", "Price", "Stores"]}
              align={["l", "l", "r", "r"]}
              rows={perMarket.map(({ m, box }) => [COUNTRIES[m].label, boxLink(box), money(box.low[m], m), box.stores[m]])}
            />
          </>
        ),
      });
    }
    if (byMarket.length) {
      sections.push({
        id: "tcgplayer",
        title: "The cheapest boxes by TCGplayer market price",
        body: (
          <>
            <p>
              TCGplayer&apos;s market price, in US dollars, follows recent sales in the US. It is a steadier reference than one store&apos;s stock, and it ranks the boxes
              the same way in every market:
            </p>
            <SimpleTable
              head={["Box", "Released", "Market (US$)", "Per pack"]}
              align={["l", "l", "r", "r"]}
              rows={byMarket.map((s) => [boxLink(s), released_(s), money(s.marketUsd, "US"), perPack(s.marketUsd, s.packCount) != null ? money(perPack(s.marketUsd, s.packCount), "US") : "—"])}
            />
          </>
        ),
      });
    }
    sections.push(
      {
        id: "why-cheap",
        title: "Why some boxes cost so little",
        body: (
          <>
            <p>
              A box is priced by what it is likely to hold. The cheapest boxes are usually from sets whose cards are cheap, from box types with fewer or smaller packs,
              or from sets printed in large numbers. Collector boxes sit at the other end: fewer packs, more foils and special frames. The dearest boxes are in{" "}
              <Link href="/blog/magic-booster-box-prices">our booster box price list</Link>, and how much of a set&apos;s value sits in a handful of cards is in{" "}
              <Link href="/blog/magic-set-value-concentration">which sets hold the most value</Link>.
            </p>
            <Callout title="Opening versus buying singles">
              A cheap box is only good value if you want what is in it. The <Link href="/tools/box-ev">Box EV calculator</Link> puts a box&apos;s price next to what its
              contents are worth in singles today, and the cards you are after are often cheaper bought on their own: see the{" "}
              <Link href="/blog/cheapest-magic-mythic-rares-by-colour">cheapest mythic rares by colour</Link>.
            </Callout>
          </>
        ),
      },
      {
        id: "before-you-buy",
        title: "Before you buy a box",
        body: (
          <ul>
            <li>Check the box type in the name: play, draft, set, collector and jumpstart boxes of one set are different products with different packs.</li>
            <li>Make sure it is the English product and a sealed box; stores list other languages and opened displays too.</li>
            <li>Postage on a box is often large. Compare the total at checkout, not only the item price shown here.</li>
            <li>Prices are store listings from the newest daily import; stock moves, so open the box&apos;s page for every store&apos;s current listing.</li>
            <li>
              New to the stores here? <Link href="/guides/where-to-buy-magic-cards">Where to buy Magic cards</Link> compares them market by market.
            </li>
          </ul>
        ),
      },
    );

    return {
      heroCards: (newest?.cards ?? []).filter((x) => x.hasImage).slice(0, 3),
      summary: [
        first ? (
          <>
            <strong>The cheapest booster box in stock in {c.place}</strong> is <Link href={`/sealed/${first.slug}`}>{first.name}</Link> at {money(first.low[country], country)}
            {firstPack != null ? `, or ${money(firstPack, country)} a pack` : ""}.
          </>
        ) : (
          <>No store we track in {c.place} has a booster box in stock today.</>
        ),
        inStock ? (
          <>
            {inStock.toLocaleString("en-US")} of the {released.length.toLocaleString("en-US")} released booster boxes we list are in stock at a store we track in {c.place}.
          </>
        ) : null,
        tcgFirst ? (
          <>
            By TCGplayer market price, the cheapest is <Link href={`/sealed/${tcgFirst.slug}`}>{tcgFirst.name}</Link> at {money(tcgFirst.marketUsd, "US")}.
          </>
        ) : null,
        <>Item prices only: postage is extra and differs by store.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>Opening a box does not have to cost the earth.</strong> This post lists the cheapest Magic booster boxes you can buy today: the cheapest in stock at a
          store we track in your market, the cheapest in each of the six markets we compare, and the cheapest by TCGplayer market price. Pre-orders are left out. The
          tables are rebuilt from the newest import each time the page is generated.
        </p>
      ),
      sections,
    };
  },
};
