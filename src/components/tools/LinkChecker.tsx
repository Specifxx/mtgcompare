"use client";

// "Is this a good price?": paste a store's product link, see how its price compares with every store we read. The browser asks
// /api/check/<host> for that store's listings (CDN-cached, our own stored rows: the store is never fetched) and the region's browse
// index (/api/browse/<region>, the header search's file) for the product's cheapest and median in-stock prices, then says where the
// price sits (lib/link-check.ts priceVerdict). A link we can't place (eBay, Amazon, a store we don't read, a page we never matched)
// falls back to a search from the link's own words, and the visitor types the price. Nothing here reaches the database.
import Link from "@/components/Link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProductCardData } from "@/lib/data";
import { money, plural, timeAgo } from "@/lib/format";
import { gaEvent } from "@/lib/gtag";
import { loadIndex, type LoadedIndex } from "@/lib/index-client";
import { article, findOffer, marketplaceName, parseLink, priceVerdict, type PastedLink, type StoreCheck, type Verdict } from "@/lib/link-check";
import { REGIONS, type Region } from "@/lib/regions";
import { rankSearch } from "@/lib/search-index";
import { parseMoney } from "@/lib/tools";
import { currencyPrefix, Field, Figure, INPUT, NumberField, ToolCard } from "./ui";

type Lookup =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "not-a-link" }
  | { kind: "fallback"; why: string; words: string; region: Region }
  | { kind: "found"; store: StoreCheck; card: ProductCardData; priceCents: number; inStock: boolean; region: Region };

const TONE: Record<Verdict, string> = {
  best: "border-open/40 bg-open-soft text-open",
  good: "border-open/30 bg-open-soft text-open",
  typical: "border-line bg-raised text-ink",
  high: "border-brand/40 bg-brand-soft text-brand-strong",
  unknown: "border-line bg-raised text-muted",
};

const storeCache = new Map<string, Promise<StoreCheck | null>>();
function loadStore(host: string): Promise<StoreCheck | null> {
  let p = storeCache.get(host);
  if (!p) {
    p = fetch(`/api/check/${encodeURIComponent(host)}`, { headers: { accept: "application/json" } }).then(async (res) => {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`check: HTTP ${res.status}`);
      const body = (await res.json()) as StoreCheck;
      if (body?.v !== 1 || !Array.isArray(body.offers)) throw new Error("check: unexpected body");
      return body;
    });
    p.catch(() => storeCache.delete(host));
    storeCache.set(host, p);
  }
  return p;
}

export function LinkChecker({ region, example }: { region: Region; example?: string }) {
  const [text, setText] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ kind: "idle" });
  const [index, setIndex] = useState<LoadedIndex | null>(null);
  const [pick, setPick] = useState<ProductCardData | null>(null);
  const [price, setPrice] = useState("");
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  const check = useCallback(
    async (raw: string) => {
      const n = ++seq.current;
      setPick(null);
      setFailed(false);
      const link: PastedLink | null = parseLink(raw);
      if (!link) {
        setLookup(raw.trim() ? { kind: "not-a-link" } : { kind: "idle" });
        return;
      }
      setLookup({ kind: "loading" });
      const fallback = (why: string, r: Region = region) => {
        if (n !== seq.current) return;
        setPrice("");
        setLookup({ kind: "fallback", why, words: link.words, region: r });
        loadIndex(r).then((ix) => n === seq.current && setIndex(ix), () => n === seq.current && setFailed(true));
      };
      const market = marketplaceName(link.host);
      if (market) {
        gaEvent("link_check", { result: "marketplace", host: link.host });
        return fallback(`That’s ${article(market)} ${market} link. We compare stores, so we can’t read ${market}’s price from a link: find the product below and type the price you see.`);
      }
      try {
        const store = await loadStore(link.host);
        if (n !== seq.current) return;
        if (!store) {
          gaEvent("link_check", { result: "unknown-store", host: link.host });
          return fallback(`We don’t read ${link.host} yet, so we can’t see its price. Find the product below and type the price you see.`);
        }
        const r = (store.region in REGIONS ? store.region : region) as Region;
        const offer = findOffer(store.offers, link);
        if (!offer) {
          gaEvent("link_check", { result: "unmatched", host: link.host });
          return fallback(`We read ${store.name}, but that page isn’t one we’ve matched to a sealed product. Find it below and type the price you see.`, r);
        }
        const ix = await loadIndex(r);
        if (n !== seq.current) return;
        setIndex(ix);
        const card = ix.bySlug.get(offer[1]);
        if (!card) {
          gaEvent("link_check", { result: "not-compared", host: link.host });
          return fallback(`We found that product at ${store.name}, but no other store in ${REGIONS[r].inName} lists it, so there’s nothing to compare it with yet.`, r);
        }
        gaEvent("link_check", { result: "found", host: link.host, slug: card.slug });
        setPrice((offer[2] / 100).toFixed(2));
        setLookup({ kind: "found", store, card, priceCents: offer[2], inStock: offer[3] === 1, region: r });
      } catch {
        if (n === seq.current) {
          setFailed(true);
          setLookup({ kind: "idle" });
        }
      }
    },
    [region],
  );

  // A link handed over in the address (#link=…, from the header search) is checked on arrival. A fragment, never a query: the CDN
  // keeps one copy of the page, whatever the link.
  useEffect(() => {
    try {
      const l = new URLSearchParams(window.location.hash.slice(1)).get("link");
      if (l) {
        setText(l);
        void check(l);
      }
    } catch {
      /* no address to read */
    }
  }, [check]);

  const fb = lookup.kind === "fallback" ? lookup : null;
  const results = useMemo(() => (fb && index && fb.words ? rankSearch(index.cards, fb.words, 6).products : []), [fb, index]);
  const card = lookup.kind === "found" ? lookup.card : pick;
  const r = lookup.kind === "found" || lookup.kind === "fallback" ? lookup.region : region;
  const market = REGIONS[r].market;
  const m = (c: number | null) => money(c, market);
  const priceCents = parseMoney(price);
  const open = card ? card.inStockStores > 0 || card.marketplaceOpen : false;
  // The store's own listing, out of stock when we read it, at the price we saw: say so rather than call a price you can't pay cheap.
  const outHere = lookup.kind === "found" && !lookup.inStock && priceCents === lookup.priceCents;
  const verdict = outHere
    ? { verdict: "unknown" as Verdict, headline: "Out of stock at this store", detail: open && card?.lowestPriceCents != null ? `It was out of stock when we last checked. The cheapest in-stock price we found is ${m(card.lowestPriceCents)}.` : "It was out of stock when we last checked, and no other store we read has it in stock either.", saveCents: 0 }
    : card && priceCents
      ? priceVerdict({ priceCents, cheapestCents: open ? card.lowestPriceCents : null, medianCents: card.medianOpenCents, inStockStores: card.inStockStores + (card.marketplaceOpen ? 1 : 0), money: (c) => m(c) })
      : null;

  return (
    <ToolCard label="Is this a good price?">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void check(text);
        }}
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
      >
        <Field label="Paste a store’s product link" hint={failed ? "That didn’t load. Check your connection and try again." : "Any store’s page for a sealed product. We compare it with every store we read."}>
          {(id) => (
            <input
              id={id}
              type="url"
              inputMode="url"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                const v = e.clipboardData.getData("text");
                if (v) {
                  e.preventDefault();
                  setText(v);
                  void check(v);
                }
              }}
              placeholder={example ?? "https://store.example/products/…"}
              autoComplete="off"
              spellCheck={false}
              className={INPUT}
            />
          )}
        </Field>
        <button type="submit" className="btn-primary h-11 px-5">
          Check the price
        </button>
      </form>

      <div aria-live="polite">
        {lookup.kind === "loading" && <p className="mt-4 text-sm text-muted">Looking it up…</p>}
        {lookup.kind === "not-a-link" && <p className="mt-4 text-sm text-muted">That doesn’t look like a link. Paste the whole address from the store’s product page, starting with https://.</p>}

        {fb && !pick && (
          <div className="mt-5">
            <p className="text-sm leading-6 text-ink">{fb.why}</p>
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
                <li className="px-4 py-3 text-sm text-muted">
                  {index ? (
                    <>
                      Nothing matched the link’s words.{" "}
                      <Link href={`/${r}/tools/value-checker`} prefetch={false} className="font-semibold text-brand hover:underline">
                        Search by name instead →
                      </Link>
                    </>
                  ) : (
                    "Loading…"
                  )}
                </li>
              )}
            </ul>
          </div>
        )}

        {card && (
          <div className="mt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-lg font-bold">{card.name}</h3>
              <Link href={`/${r}/p/${card.slug}`} prefetch={false} className="text-sm font-semibold text-brand hover:underline">
                Every store’s price →
              </Link>
            </div>
            {r !== region && <p className="mt-1 text-xs text-muted">That store sells in {REGIONS[r].inName}, so it is compared with stores there, in {REGIONS[r].currency}.</p>}

            {verdict && (
              <div className={`mt-4 rounded-xl border px-4 py-3 ${TONE[verdict.verdict]}`}>
                <p className="font-display text-xl font-extrabold">{verdict.headline}</p>
                <p className="mt-1 text-sm leading-6 text-ink">{verdict.detail}</p>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {lookup.kind === "found" && (
                <Figure
                  label={lookup.store.name}
                  value={m(lookup.priceCents)}
                  tone={lookup.inStock ? "ink" : "sold"}
                  sub={`${lookup.inStock ? "In stock" : "Out of stock"} when we last checked${lookup.store.checkedAt ? `, ${timeAgo(lookup.store.checkedAt)}` : ""}`}
                />
              )}
              <Figure label="Cheapest in stock" value={open ? m(card.lowestPriceCents) : "Sold out"} tone="brand" sub={open ? `${plural(card.inStockStores, "store")} in stock${card.marketplaceOpen ? " + TCGplayer" : ""}` : `${plural(card.listedStores, "store")} list it`} />
              <Figure label="Median in stock" value={open && card.inStockStores >= 2 && card.medianOpenCents != null ? m(card.medianOpenCents) : "—"} sub="What a typical store asks" />
            </div>

            <div className="mt-4 max-w-xs">
              <NumberField
                label={lookup.kind === "found" ? "Price on the page now" : "The price you see"}
                value={price}
                onChange={setPrice}
                prefix={currencyPrefix(m(0))}
                hint={lookup.kind === "found" ? "Changed since we checked? Type what the page shows." : "Type it to see how it compares."}
              />
            </div>
            {pick && (
              <button type="button" onClick={() => setPick(null)} className="mt-4 text-sm font-semibold text-muted hover:text-ink hover:underline">
                ← Back to results
              </button>
            )}
          </div>
        )}
      </div>
    </ToolCard>
  );
}
