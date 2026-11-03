import type { Metadata } from "next";
import Link from "@/components/Link";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { deals, meta } from "@/lib/data";
import { money } from "@/lib/format";
import { shortName } from "@/lib/names";
import { sourceNameServer } from "@/lib/sources";
import { blackFriday, cyberMonday, longDate, seasonYear, splitDeals } from "@/lib/black-friday";
import { FamilyCluster } from "@/components/FamilyCluster";

// The Black Friday page (DECISIONS.md, "Black Friday page", 2026-11-02): one URL kept
// year after year, so links and rankings it gathers carry over. Rebuilt from the day's
// prices like every page; never a "was" price, a countdown or an invented sale.
export const revalidate = 86400;

const today = () => (meta()?.updatedAt ?? new Date().toISOString()).slice(0, 10);

export function generateMetadata(): Metadata {
  const year = seasonYear(today());
  return {
    title: `${SITE.gameShort} Black Friday Deals ${year}: Store Prices Under TCGplayer`,
    description: `Black Friday and Cyber Monday ${year} ${SITE.game} deals: sealed product and cards that ${SITE.stores.length} stores sell under TCGplayer's market price today, updated every day.`,
    ...canon("/black-friday"),
  };
}

export default function BlackFridayPage() {
  const now = today();
  const year = seasonYear(now);
  const bf = blackFriday(year);
  const cm = cyberMonday(year);
  const { sealed, cards } = splitDeals(deals(400).filter((d) => d.offer.source !== "ebay" && d.offer.source !== "amazon"));
  const asOf = meta()?.updatedAt
    ? new Date(meta()!.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : null;
  const before = now < bf;

  return (
    <article className="flex max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-black">{SITE.gameShort} Black Friday deals {year}</h1>
        <p className="text-muted">
          Black Friday is {longDate(bf)} and Cyber Monday is {longDate(cm)} {year}.{" "}
          {before ? "Stores often start their sales earlier. " : ""}
          Below is everything {SITE.stores.length} stores sell under TCGplayer&apos;s market price right now, in stock, rebuilt from each day&apos;s prices
          {asOf ? ` (last updated ${asOf})` : ""}. Bookmark it: the same page updates every day through the sales.
        </p>
      </header>

      <Section title="Sealed product under TCGplayer today" rows={sealed} empty="No sealed product is under TCGplayer's market price in a US store today." />
      <Section title="Cards under TCGplayer today" rows={cards} empty="No card worth $5 or more is under TCGplayer's market price in a US store today." />

      <FamilyCluster cluster="cards" kind="deal" />
      <section className="card-surface flex flex-col gap-2 p-4 text-sm">
        <h2 className="text-lg font-bold">How to read this</h2>
        <p>Each row is the cheapest in-stock US store price we found (stores only, never eBay or Amazon), 8% to 60% under TCGplayer&apos;s market price, for products worth $5 or more. Item prices before shipping, in US dollars on both sides.</p>
        <p>We only see what a store asks when we read its prices, so a sale can start or end between updates. Always check the price on the store&apos;s page before you buy.</p>
        <p>
          <Link className="link" href="/tools/deal-finder">Deal Finder, with filters →</Link> · <Link className="link" href="/price-report">Monthly price report →</Link> ·{" "}
          <Link className="link" href="/sealed">Every sealed product →</Link>
        </p>
      </section>
    </article>
  );
}

function Section({ title, rows, empty }: { title: string; rows: ReturnType<typeof deals>; empty: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">{title}</h2>
      {!rows.length ? (
        <p className="text-sm text-muted">{empty}</p>
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
    </section>
  );
}
