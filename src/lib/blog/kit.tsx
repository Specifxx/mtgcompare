// The pieces the blog posts are built from: the guides' prose and table pieces (src/content/guides/kit.tsx), plus the cross-market
// blocks a region-less post needs. No JSX runs when this module loads.
import Link from "@/components/Link";
import type { ReactNode } from "react";
import { Checked, Lede, Note, Prose, StackTable } from "@/content/guides/kit";
import {
  familyOf,
  perPackOf,
  whereText,
  type MarketCard,
} from "@/content/families";
import { ProductCard } from "@/components/ProductCard";
import { cardOpen } from "@/lib/compact";
import { money } from "@/lib/format";
import { REGION_LIST, regionOfMarket, type Market } from "@/lib/regions";
import type { PostData } from "./data";

export { Checked, Lede, Note, Prose, StackTable };

export interface PostSection {
  id: string;
  title: string;
  body: ReactNode;
}

export interface PostOutline {
  intro: ReactNode;
  sections: PostSection[];
}

export interface PostModule {
  outline: (data: PostData) => PostOutline;
}

/** A block of live prices from every market: when they were checked, then the content. */
export function MarketsBlock({
  checked,
  children,
  title = "Today, in every market we compare",
}: {
  checked: string | null;
  children: ReactNode;
  title?: string;
}) {
  return (
    <div className="card my-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-raised px-4 py-2.5 sm:px-5">
        <span className="eyebrow flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-open" />
          {title}
        </span>
        {checked && (
          <span className="text-xs text-muted">
            <Checked iso={checked} />
          </span>
        )}
      </div>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </div>
  );
}

/** One market's products as a table: product (linked to its page in that region), price in its own currency, per pack, where. */
export function MarketProducts({
  market,
  cards,
  label,
}: {
  market: Market;
  cards: readonly MarketCard[];
  label?: (p: MarketCard) => string;
}) {
  const r = regionOfMarket(market)!;
  if (!cards.length)
    return (
      <p className="text-sm text-muted">
        Nothing in stock at the stores we compare in {r.inName} right now.
      </p>
    );
  return (
    <StackTable
      caption={`${r.name}: today's listings`}
      head={["Product", "Price", "Per pack", "In stock at"]}
      rows={cards.map((p) => ({
        key: `${market}-${p.slug}`,
        th: (
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-semibold text-ink">
              {label ? label(p) : (familyOf(p.name)?.label ?? "Sealed")}
            </span>
            <Link
              href={`/${r.region}/p/${p.slug}`}
              prefetch={false}
              className="truncate text-xs font-medium text-brand underline-offset-2 hover:underline"
            >
              {p.name}
            </Link>
          </span>
        ),
        cells: [
          <span key="p" className="font-semibold">
            {money(p.lowestPriceCents, market)}
          </span>,
          perPackOf(p) != null ? money(perPackOf(p), market) : "—",
          <span key="w" className="text-muted">
            {whereText(p)}
          </span>,
        ],
      }))}
    />
  );
}

/**
 * The post's products as the site's own product tiles (photo, live price, stock), for one market (the US by default): the
 * same tile a buyer sees on a browse page, so a post shows what it is talking about. In-stock products first; nothing when the
 * market has none (the tables below say so).
 */
export function ProductTiles({
  cards,
  market = "US",
  take = 4,
  keep = () => true,
}: {
  cards: readonly MarketCard[];
  market?: Market;
  take?: number;
  keep?: (p: MarketCard) => boolean;
}) {
  const r = regionOfMarket(market)!;
  const mine = cards.filter((c) => c.market === market && keep(c));
  const list = [...mine.filter(cardOpen), ...mine.filter((c) => !cardOpen(c))].slice(0, take);
  if (!list.length) return null;
  return (
    <div className="mb-6">
      <h3 className="mb-3 font-display text-lg font-bold">
        In {r.inName} today <span className="text-xs font-normal text-muted">{r.currency}</span>
      </h3>
      <ul role="list" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {list.map((p) => (
          <li key={p.slug} className="grid min-w-0">
            <ProductCard p={p} region={r.region} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Every market's products, one sub-table each, in REGION_LIST order, under the US products as tiles (`tiles`, on by default). */
export function ByMarket({
  cards,
  take = 8,
  label,
  keep = () => true,
  tiles = true,
}: {
  cards: readonly MarketCard[];
  take?: number;
  label?: (p: MarketCard) => string;
  keep?: (p: MarketCard) => boolean;
  tiles?: boolean;
}) {
  return (
    <>
      {tiles && <ProductTiles cards={cards} keep={keep} />}
      {REGION_LIST.map((r) => (
        <div
          key={r.region}
          className="border-t border-line pt-5 first:border-0 first:pt-0 [&+&]:mt-6"
        >
          <h3 className="mb-2 font-display text-lg font-bold">
            <Link
              href={`/${r.region}`}
              prefetch={false}
              className="hover:text-brand hover:underline"
            >
              {r.name}
            </Link>{" "}
            <span className="text-xs font-normal text-muted">{r.currency}</span>
          </h3>
          <MarketProducts
            market={r.market}
            cards={cards
              .filter((c) => c.market === r.market && keep(c))
              .slice(0, take)}
            label={label}
          />
        </div>
      ))}
    </>
  );
}

/** The note every cross-market table carries. */
export const NO_FX =
  "Each store’s own price in its own currency, excluding shipping. We don’t convert currencies.";
export function NoFx() {
  return <p className="text-xs leading-5 text-muted">{NO_FX}</p>;
}
