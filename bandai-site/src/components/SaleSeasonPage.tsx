import type { Metadata } from "next";
import Link from "@/components/Link";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { deals, meta, storeDealsIn, type Deal, type StoreDeal } from "@/lib/data";
import { money } from "@/lib/format";
import { shortName } from "@/lib/names";
import { sourceNameServer } from "@/lib/sources";
import { splitDeals } from "@/lib/black-friday";
import { listRegions, saleHeading, saleIntro, saleYear, SALE_SEASONS, type SaleSlug } from "@/lib/sale-seasons";
import type { Market } from "@/lib/site-types";

// The seasonal sale pages (DECISIONS.md, "Seasonal sale pages", 2026-11-02): /boxing-day,
// /january-sales and /lunar-new-year, one URL each kept every year, like /black-friday. Each lists
// today's real store deals in every market the site has stores in, in that market's own currency:
// US prices under TCGplayer's market price (the Black Friday page's deals()), and in every market the
// cheapest in-stock store at least 10% under the median of that market's stores. Never a "was" price,
// a countdown or an invented sale.

const today = () => (meta()?.updatedAt ?? new Date().toISOString()).slice(0, 10);

/** Which markets lead on each page: where the day is a sale day first. */
const ORDER: Record<SaleSlug, Market[]> = {
  "boxing-day": ["AU", "UK", "CA", "US", "EU", "SG"],
  "january-sales": ["UK", "US", "AU", "CA", "EU", "SG"],
  "lunar-new-year": ["SG", "AU", "CA", "US", "UK", "EU"],
  "valentines-day": ["US", "UK", "CA", "AU", "EU", "SG"],
};
const IN: Record<Market, string> = { US: "the US", UK: "the UK", CA: "Canada", AU: "Australia", EU: "Europe", SG: "Singapore" };
const ADJ: Record<Market, string> = { US: "US", UK: "UK", CA: "Canadian", AU: "Australian", EU: "European", SG: "Singapore" };

function marketsFor(slug: SaleSlug): Market[] {
  const have = new Set(SITE.stores.map((s) => s.market));
  return ORDER[slug].filter((m) => have.has(m));
}

export function saleMetadata(slug: SaleSlug): Metadata {
  const year = saleYear(slug, today());
  const regions = listRegions(marketsFor(slug).map((m) => IN[m]));
  return {
    title: `${SITE.gameShort} ${saleHeading(slug, year)}: Store Prices Compared`,
    description: `${SALE_SEASONS[slug].name} ${year} ${SITE.game} deals: booster boxes, sealed product and cards that stores in ${regions} sell under the other stores or TCGplayer today, updated every day.`,
    ...canon(`/${slug}`),
  };
}

export function SaleSeasonPage({ slug }: { slug: SaleSlug }) {
  const year = saleYear(slug, today());
  const markets = marketsFor(slug);
  const regions = listRegions(markets.map((m) => IN[m]));
  const us = splitDeals(deals(400).filter((d) => d.offer.source !== "ebay" && d.offer.source !== "amazon"));
  const asOf = meta()?.updatedAt
    ? new Date(meta()!.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : null;

  return (
    <article className="flex max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-black">{SITE.gameShort} {saleHeading(slug, year)}</h1>
        <p className="text-muted">
          {saleIntro(slug, year, regions)} Rebuilt from each day&apos;s store prices{asOf ? ` (last updated ${asOf})` : ""}, so bookmark it: the same page
          updates every day through the sales.
        </p>
        {markets.length > 1 && (
          <p className="flex flex-wrap gap-2 text-sm">
            {markets.map((m) => (
              <a key={m} className="chip" href={`#${m.toLowerCase()}`}>{IN[m].replace(/^the /, "")}</a>
            ))}
          </p>
        )}
      </header>

      {markets.map((m) => (
        <MarketSection key={m} m={m} us={m === "US" ? us : null} />
      ))}

      <section className="card-surface flex flex-col gap-2 p-4 text-sm">
        <h2 className="text-lg font-bold">How to read this</h2>
        <p>
          Every price is a store&apos;s in-stock item price before shipping, in that country&apos;s own currency, never converted. In each country we list
          products whose cheapest store is at least 10% (and at most 45%: past that a listing is more likely the wrong product than a sale) under the middle price of three or more stores there. US prices are also compared with
          TCGplayer&apos;s market price (8% to 60% under it). Stores only: eBay and Amazon are never counted as a store or a deal.
        </p>
        <p>
          We only see what a store asks when we read its prices, so a sale can start or end between updates. There are no &ldquo;was&rdquo; prices here:
          always check the price on the store&apos;s page before you buy.
        </p>
        <p>
          <Link className="link" href="/black-friday">Black Friday deals →</Link> · <Link className="link" href="/tools/deal-finder">Deal Finder →</Link> ·{" "}
          <Link className="link" href="/sealed">Every sealed product →</Link> · <Link className="link" href="/price-report">Monthly price report →</Link>
        </p>
      </section>
    </article>
  );
}

function MarketSection({ m, us }: { m: Market; us: { sealed: Deal[]; cards: Deal[] } | null }) {
  const sealed = storeDealsIn(m, 16, "sealed");
  const cards = storeDealsIn(m, 16, "card");
  return (
    <section id={m.toLowerCase()} className="flex flex-col gap-4 scroll-mt-20">
      <h2 className="text-2xl font-bold">Deals in {ADJ[m]} stores</h2>
      {us && <UnderTcg title="Sealed product under TCGplayer today" rows={us.sealed} />}
      {us && <UnderTcg title="Cards under TCGplayer today" rows={us.cards} />}
      <UnderStores title={`Sealed product under other ${ADJ[m]} stores`} rows={sealed} m={m} />
      <UnderStores title={`Cards under other ${ADJ[m]} stores`} rows={cards} m={m} />
    </section>
  );
}

function UnderStores({ title, rows, m }: { title: string; rows: StoreDeal[]; m: Market }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-lg font-bold">{title}</h3>
      {!rows.length ? (
        <p className="text-sm text-muted">Nothing is 10% under the other stores in {IN[m]} today. This fills in as stores cut prices.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr><th className="py-1 pr-3">Product</th><th className="py-1 pr-3 text-right">Middle store price</th><th className="py-1 pr-3 text-right">Cheapest</th><th className="py-1 pr-3">Store</th><th className="py-1 text-right">Under</th></tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.p.id} className="border-t border-ink-800">
                  <td className="py-1.5 pr-3"><Link className="hover:underline" href={`/card/${d.p.slug}`}>{shortName(d.p.name)}</Link></td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{money(d.median, d.offer.currency)} <span className="text-xs text-muted">({d.stores} stores)</span></td>
                  <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{money(d.offer.cents, d.offer.currency)}</td>
                  <td className="py-1.5 pr-3">{sourceNameServer(d.offer)}</td>
                  <td className="py-1.5 text-right tabular-nums text-up">{d.saving}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UnderTcg({ title, rows }: { title: string; rows: Deal[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-lg font-bold">{title}</h3>
      {!rows.length ? (
        <p className="text-sm text-muted">Nothing worth $5 or more is under TCGplayer&apos;s market price in a US store today.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr><th className="py-1 pr-3">Product</th><th className="py-1 pr-3 text-right">TCGplayer market</th><th className="py-1 pr-3 text-right">Store price</th><th className="py-1 pr-3">Store</th><th className="py-1 text-right">Under market</th></tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.p.id} className="border-t border-ink-800">
                  <td className="py-1.5 pr-3"><Link className="hover:underline" href={`/card/${d.p.slug}`}>{shortName(d.p.name)}</Link></td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{money(d.market)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{money(d.offer.cents, d.offer.currency)}</td>
                  <td className="py-1.5 pr-3">{sourceNameServer(d.offer)}</td>
                  <td className="py-1.5 text-right tabular-nums text-up">{d.saving}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
