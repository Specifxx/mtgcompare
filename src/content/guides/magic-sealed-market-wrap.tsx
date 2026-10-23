// Guide: this week's Magic sealed market wrap. ONLY real week-over-week moves from data/public/price-history.json (more-data.ts
// weekMoves): a product's cheapest in-stock price on the history's last day against seven days before, at 2+ stores on both days.
// With no history file, or under eight days of it, the page says so and shows no numbers: nothing is estimated.
// Wording avoids the history claims copy-rules.ts bans ("dropped", "was $…"): "lower than seven days ago", two dated columns.
import type { RegionInfo } from "@/lib/regions";
import { money } from "@/lib/format";
import { formatRelease } from "@/lib/release";
import type { ProductCardData } from "@/lib/data";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { GuideBody, Lede, LiveBlock, NextLinks, NoneYet, ProductTh, Prose, StackTable, storesPhrase, whereToBuy, type BodyProps, type GuideOutline } from "./kit";
import { faqSection } from "./kit-more";
import type { WeekMove } from "./more-data";

const GUIDE = GUIDE_BY_SLUG.get("magic-sealed-market-wrap")!;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const w = data.wrap ?? { through: null, from: null, days: 0, lower: [], higher: [], compared: 0 };
  const cards = new Map((data.cards ?? []).map((c) => [c.slug, c] as const));
  const ready = !!w.through && !!w.from && w.days >= 8;
  const m = (c: number) => money(c, r.market);
  const table = (moves: WeekMove[], caption: string) => {
    const rows = moves.filter((x) => cards.has(x.slug));
    if (!rows.length) return <NoneYet>No product moved by 5% or more this week.</NoneYet>;
    return (
      <StackTable
        caption={caption}
        head={["Product", formatRelease(w.from!), formatRelease(w.through!), "Change"]}
        rows={rows.map((x) => ({
          key: x.slug,
          th: <ProductTh r={r} label={(cards.get(x.slug) as ProductCardData).productType} p={cards.get(x.slug)!} />,
          cells: [m(x.before), <span key="a" className="font-semibold">{m(x.after)}</span>, <span key="c">{x.pct > 0 ? "+" : ""}{x.pct}%</span>],
        }))}
      />
    );
  };
  return {
    intro: (
      <Lede>
        {ready ? (
          <>
            The week to {formatRelease(w.through!)} in Magic sealed at {storesPhrase(r)}: of {w.compared} products in stock at two or more stores on both days,{" "}
            <strong>{w.lower.length}</strong> moved lower by 5% or more and <strong>{w.higher.length}</strong> moved higher, from our daily snapshots.
          </>
        ) : (
          <>
            This wrap compares each product’s cheapest in-stock price with seven days before, from MTG Compare’s daily price snapshots.{" "}
            <strong>We don’t have a full week of snapshots yet{w.days ? ` (${w.days} days so far)` : ""}</strong>, so there are no moves to report: the tables fill in once we do.
          </>
        )}
      </Lede>
    ),
    sections: [
      {
        id: "lower",
        title: "Lower than seven days ago",
        live: true,
        body: <LiveBlock r={r} checked={data.checked}>{ready ? table(w.lower, `Products whose cheapest price in ${r.inName} is lower than seven days ago`) : <NoneYet>Not enough snapshots yet for a week-over-week comparison.</NoneYet>}</LiveBlock>,
      },
      {
        id: "higher",
        title: "Higher than seven days ago",
        body: <LiveBlock r={r} checked={data.checked}>{ready ? table(w.higher, `Products whose cheapest price in ${r.inName} is higher than seven days ago`) : <NoneYet>Not enough snapshots yet for a week-over-week comparison.</NoneYet>}</LiveBlock>,
      },
      {
        id: "how",
        title: "How the wrap is made",
        body: (
          <>
            <Prose>
              <p>
                Each import records every product’s cheapest in-stock price and how many stores have it. The wrap compares the last day recorded with seven days before, only
                for products in stock at two or more stores on both days, and leaves out moves over 50% (usually a misfiled listing). It says nothing about why a price moved or
                where it goes next.
              </p>
            </Prose>
            <NextLinks links={[{ href: `/${r.region}/deals`, label: "Today’s deals", icon: "tag" }, { href: `/${r.region}/this-week`, label: "This week’s releases", icon: "calendar" }]} />
          </>
        ),
      },
      faqSection([
        { q: "Where do these price moves come from?", a: "From MTG Compare's daily snapshots of each product's cheapest in-stock price at the stores it checks; nothing is estimated." },
        { q: "Why is a product missing?", a: "It was not in stock at two or more stores on both days, or its price moved by less than 5%." },
        { q: "Do the prices include shipping?", a: "No: each is a store's listed price, excluding delivery." },
      ]),
      whereToBuy(r),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
