import { DiscordCta } from "@/components/DiscordCta";
import { DISCORD_INVITE } from "@/lib/site";
import Link from "@/components/Link";
import { OutboundLink } from "@/components/OutboundLink";
import { Section } from "@/components/Section";
import { ebayRetailer, ebaySearchUrl, offerLink, offerRetailer, REL_SPONSORED } from "@/lib/affiliate";
import { money } from "@/lib/format";
import { dropLine } from "@/lib/real-drops";
import type { DropRow } from "@/lib/real-drops-data";
import type { RegionInfo } from "@/lib/regions";

// The Black Friday / Cyber Monday pages' first list (lib/real-drops.ts): products whose cheapest in-stock price today sits furthest
// under their own 30-day typical price, each line with the store's buy button and a tagged eBay search (placement "bf-drops").
export function RealDrops({ r, rows, title = "Furthest under their own 30-day price today" }: { r: RegionInfo; rows: DropRow[]; title?: string }) {
  if (!rows.length) return null;
  const fmt = (c: number) => money(c, r.market);
  return (
    <Section id="real-drops" title={title} kicker="From our daily price snapshots, with a buy button on every line">
      <ol className="grid gap-2">
        {rows.map((row) => {
          const link = offerLink(row.offer.store, row.offer.url, r.region, "bf-drops");
          return (
            <li key={row.slug} className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3" data-cents={row.offer.priceCents}>
              {row.imageUrl && <img src={row.imageUrl} alt={row.name} loading="lazy" className="h-12 w-12 shrink-0 rounded object-contain" />}
              <Link href={`/${r.region}/p/${row.slug}`} prefetch={false} className="min-w-0 flex-1 basis-48 font-semibold hover:text-brand">
                {row.name}
                <span className="block text-xs font-normal text-faint">{row.productType} · {dropLine(row.drop, fmt)}</span>
              </Link>
              <b className="tabular font-display text-lg">{fmt(row.offer.priceCents)}</b>
              <span className="flex shrink-0 gap-2">
                <OutboundLink href={link.href} rel={link.rel} retailer={offerRetailer(row.offer.store, row.offer.storeName, r.market)} placement="bf-drops" className="btn-primary px-3 py-1.5 text-xs" aria-label={`Buy ${row.name} at ${row.offer.storeName}`}>
                  Buy at {row.offer.storeName}
                </OutboundLink>
                <OutboundLink href={ebaySearchUrl(row.name, r.region, "bf-drops")} rel={REL_SPONSORED} retailer={ebayRetailer(r.region)} placement="bf-drops" className="btn-ad px-3 py-1.5 text-xs" aria-label={`${row.name} on eBay (paid link)`}>
                  eBay
                </OutboundLink>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm leading-6 text-muted">
        The typical price is the median of the product&rsquo;s cheapest in-stock {r.adjective} price on each of the last 30 days we recorded (two weeks of records at least;
        a day far under the rest is left out as a wrong listing, and a product whose records swing more than twofold is not listed). It says what stores asked on those
        days, not what they will charge next. Prices exclude shipping. The eBay button is a paid link.
      </p>
      {/* Cyber Weekend (2026-11-21): the Discord hub posts these drops as they happen. */}
      <DiscordCta href={DISCORD_INVITE} className="mt-4" />
    </Section>
  );
}
