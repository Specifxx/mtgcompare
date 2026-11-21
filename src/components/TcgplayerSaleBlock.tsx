import { OutboundLink } from "@/components/OutboundLink";
import { REL_SPONSORED, TCGPLAYER_RETAILER, tcgplayerSearchUrl } from "@/lib/affiliate";
import type { Region } from "@/lib/regions";

// The Black Friday and Cyber Monday pages' TCGplayer block (DECISIONS.md, "Black Friday strip on sealed pages", 2026-11-21
// amendment): one "Ad"-labelled card of tagged TCGplayer searches for sealed Magic, below the deals and the price watch, never
// above a price. It claims no price and no discount, ranks nothing, and is never a store or the cheapest: TCGplayer's sellers set
// their own prices, so the visitor checks them against the store prices above.
const SEARCHES: { label: string; query: string }[] = [
  { label: "Booster boxes", query: "booster box" },
  { label: "Bundles", query: "bundle" },
  { label: "Commander decks", query: "commander deck" },
  { label: "All sealed Magic", query: "" },
];

export function TcgplayerSaleBlock({ region, name }: { region: Region; name: string }) {
  return (
    <section aria-labelledby="tcgplayer-sale" data-tcgplayer-sale="" className="card mt-14 max-w-3xl px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="rounded border border-line px-1.5 text-[11px] font-semibold uppercase leading-5 text-muted">Ad</span>
        <h2 id="tcgplayer-sale" className="font-display text-xl font-bold tracking-tight">
          {name} on TCGplayer
        </h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted">
        TCGplayer&rsquo;s sellers set their own prices, so we don&rsquo;t count them as a store or rank them here. Check what you find against the store prices
        above. Paid links: we may earn a commission, at no cost to you.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {SEARCHES.map((s) => (
          <li key={s.label}>
            <OutboundLink
              href={tcgplayerSearchUrl(s.query, region, "tcgplayer-bf-page")}
              rel={REL_SPONSORED}
              retailer={TCGPLAYER_RETAILER}
              placement="tcgplayer-bf-page"
              className="btn-ad px-3 py-1.5 text-xs"
            >
              {s.label}
            </OutboundLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
