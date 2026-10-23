"use client";

// The sealed value checker: the region's browse index (/api/browse/<region>, CDN-cached, the file the header's search box loads), searched
// in the browser. Nothing here reaches the database: a keystroke filters the index already in memory.
import Link from "@/components/Link";
import { useEffect, useMemo, useState } from "react";
import type { ProductCardData } from "@/lib/data";
import { money, plural, timeAgo } from "@/lib/format";
import { loadIndex, type LoadedIndex } from "@/lib/index-client";
import { packsForLabel, perPackCents } from "@/lib/packs";
import type { Region } from "@/lib/regions";
import { usMsrpForCard } from "@/lib/rrp";
import { rankSearch } from "@/lib/search-index";
import { parseMoney, pricePosition, type PricePosition } from "@/lib/tools";
import { currencyPrefix, Field, Figure, INPUT, NumberField, ToolCard } from "./ui";

const POSITION: Record<PricePosition, { text: string; tone: "open" | "ink" | "sold" }> = {
  "below-cheapest": { text: "Under every store’s in-stock price today. Check the seller and the seal before you pay.", tone: "open" },
  "at-cheapest": { text: "About the cheapest in-stock store price today.", tone: "open" },
  "below-median": { text: "Under what most stores ask today, above the cheapest.", tone: "open" },
  "around-median": { text: "Around the median: what a typical store asks today.", tone: "ink" },
  "above-median": { text: "Above what most stores ask today.", tone: "sold" },
  "above-cheapest": { text: "Above the cheapest in-stock store price today.", tone: "sold" },
};

export function ValueChecker({ region, market, place, examples }: { region: Region; market: string; place: string; examples: string[] }) {
  const [index, setIndex] = useState<LoadedIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<ProductCardData | null>(null);
  const [offer, setOffer] = useState("");
  const m = (c: number | null) => money(c, market);

  useEffect(() => {
    let live = true;
    loadIndex(region).then(
      (ix) => live && setIndex(ix),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [region]);

  const results = useMemo(() => (index && q.trim() ? rankSearch(index.cards, q, 8).products : []), [index, q]);
  const packs = pick ? packsForLabel(pick.productType, pick.setCode, pick.name) : null;
  const perPack = pick ? perPackCents(pick.lowestPriceCents, packs) : null;
  const msrp = pick ? usMsrpForCard(market, pick.productType, pick.setCode) : null;
  const open = pick ? pick.inStockStores > 0 || pick.marketplaceOpen : false;
  const offerCents = parseMoney(offer);
  const pos = pick && open && pick.lowestPriceCents != null && offerCents ? pricePosition(offerCents, pick.lowestPriceCents, pick.inStockStores >= 2 ? pick.medianOpenCents : null) : null;

  return (
    <ToolCard label="Value checker">
      <Field label="Search a sealed product" hint={index ? `${plural(index.cards.length, "product")} in ${place}${index.checkedAt ? `, prices checked ${timeAgo(index.checkedAt)}` : ""}.` : failed ? "The product list didn’t load. Reload the page to try again." : "Loading the product list…"}>
        {(id) => (
          <input
            id={id}
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPick(null);
            }}
            placeholder={examples[0] ? `e.g. ${examples[0]}` : "e.g. booster box"}
            autoComplete="off"
            spellCheck={false}
            className={INPUT}
          />
        )}
      </Field>
      {!q && examples.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Try">
          {examples.map((e) => (
            <li key={e}>
              <button type="button" className="chip min-h-10" onClick={() => setQ(e)}>
                {e}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q && !pick && (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {results.length ? (
            results.map((p) => (
              <li key={p.slug}>
                <button type="button" onClick={() => setPick(p)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-raised">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block text-xs text-muted">{p.productType}</span>
                  </span>
                  <span className="tabular shrink-0 text-sm font-semibold">{p.inStockStores > 0 || p.marketplaceOpen ? m(p.lowestPriceCents) : "Sold out"}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-4 py-3 text-sm text-muted">{index ? "No product matches that search." : "Loading…"}</li>
          )}
        </ul>
      )}

      {pick && (
        <div className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-lg font-bold">{pick.name}</h3>
            <Link href={`/${region}/p/${pick.slug}`} prefetch={false} className="text-sm font-semibold text-brand hover:underline">
              Every store’s price →
            </Link>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">
            <Figure label="Cheapest in stock" value={open ? m(pick.lowestPriceCents) : "Sold out"} tone="brand" sub={open ? `${plural(pick.inStockStores, "store")} in stock${pick.marketplaceOpen ? " + TCGplayer" : ""}` : `${plural(pick.listedStores, "store")} list it, none in stock`} />
            <Figure label="Median in stock" value={open && pick.inStockStores >= 2 && pick.medianOpenCents != null ? m(pick.medianOpenCents) : "—"} sub="The middle in-stock store price" />
            <Figure label="Per pack" value={open && perPack != null ? m(perPack) : "—"} sub={packs != null ? `${plural(packs, "booster pack")} inside` : "No fixed pack count"} />
            <Figure label={msrp != null ? "US MSRP" : "Stores listing it"} value={msrp != null ? m(msrp) : pick.listedStores} sub={msrp != null ? "Wizards of the Coast’s announced US list price; stores set their own" : "In or out of stock"} />
          </div>
          {open && (
            <div className="mt-5 grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-end">
              <NumberField label="A price you were offered" value={offer} onChange={setOffer} prefix={currencyPrefix(m(0))} />
              <p className={`text-sm font-semibold leading-6 ${pos ? (POSITION[pos].tone === "open" ? "text-open" : POSITION[pos].tone === "sold" ? "text-sold" : "text-ink") : "text-muted"}`} aria-live="polite">
                {pos ? POSITION[pos].text : "Type a price to see where it sits against today’s stores."}
              </p>
            </div>
          )}
          <button type="button" onClick={() => setPick(null)} className="mt-4 text-sm font-semibold text-muted hover:text-ink hover:underline">
            ← Back to results
          </button>
        </div>
      )}
    </ToolCard>
  );
}
