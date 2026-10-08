"use client";

import { useEffect, useState } from "react";
import type { Country } from "@/lib/country";
import { isLikelyBot } from "@/lib/data/plane/crawler";
import type { EbayPanelData } from "@/lib/listing-panel";
import { EbayCardPanelLive } from "./EbayCardPanelLive";
import { EbayPanelIntro } from "./EbayPanelIntro";

/** The panel route: a public, cached /api read of one product's EbayPanel and EbayBest rows. Without it (or with the database down) the panel is the plain search CTA. */
export const PANEL_ENDPOINT = "/api/ebay/panel";

// "Also available on eBay": the last in-column section of a card page, and the Listings tab only on sealed pages. The rows were captured by scripts/ebay.ts from the name pass's own search
// (zero extra Browse calls) and live in Neon, so this island LOADS them in the browser, never in the server render of a public page, and not at all for a crawler. A database blip or a
// product eBay does not search renders the plain eBay search CTA, never an error and never an empty box.
export function EbayCardPanel({
  productId,
  country,
  query,
  name,
  card,
  page = "card",
  rawCents = null,
  sealed = false,
  preRelease = false,
}: {
  productId: number;
  country: Country;
  query: string;
  name: string;
  card: string;
  page?: string;
  rawCents?: number | null;
  sealed?: boolean;
  preRelease?: boolean;
}) {
  const [data, setData] = useState<EbayPanelData>({ listings: [], graded: [] });
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (isLikelyBot(typeof navigator === "undefined" ? "" : navigator.userAgent)) return;
    const ctl = new AbortController();
    fetch(`${PANEL_ENDPOINT}/${productId}`, { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Partial<EbayPanelData>>) : null))
      .then((d) => {
        if (!d) return;
        setData({ listings: Array.isArray(d.listings) ? d.listings : [], graded: Array.isArray(d.graded) ? d.graded : [] });
        setNow(Date.now());
      })
      .catch(() => {});
    return () => ctl.abort();
  }, [productId]);
  return (
    <section className="card-surface p-5" aria-label="Also available on eBay">
      <h2 className="font-bold text-white">Also available on eBay</h2>
      <EbayPanelIntro graded={!sealed} />
      <EbayCardPanelLive data={data} now={now} country={country} query={query} name={name} card={card} page={page} rawCents={rawCents} showGraded={!sealed} preRelease={preRelease} className="mt-4" />
    </section>
  );
}
