"use client";
// The quick view (owner, 2026-10-30: "I really like the kaeyoung quick view pop ups", ported from K Young). A click on any product
// card (a[data-qv]) opens this panel at once with what the card already knows (photo, name, type), then fills in the product page's own
// price rows from /api/quick/<region>/<slug> (CDN-cached for a day), drawn by the table's own OfferRowsWithEbay: eBay first, then
// TCGplayer and Amazon, then the stores, as on the page. The card stays a real link: crawlers, new tabs and modified clicks go to the
// product page, whose server HTML keeps every price.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/Link";
import type { PriceFloor } from "@/lib/ebay-offer-row";
import type { Region } from "@/lib/regions";
import { OfferRowsWithEbay } from "./EbayStrip";
import type { StoreRowData } from "./OfferRows";

interface Head {
  api: string;
  href: string;
  region: Region;
  name: string;
  sub: string;
  img: string | null;
}
interface Data {
  stores: number;
  inStock: number;
  rows: StoreRowData[];
  tcg: StoreRowData | null;
  amazon: StoreRowData | null;
  ebay: { slug: string; query: string; floor: PriceFloor | null; packs: number | null };
  preorder: boolean;
  name: string;
  sub: string;
  img: string | null;
}

const cache = new Map<string, Promise<Data | null>>();
function load(api: string): Promise<Data | null> {
  let p = cache.get(api);
  if (!p) {
    p = fetch(api)
      .then((r) => (r.ok ? (r.json() as Promise<Data>) : null))
      .catch(() => null);
    p.then((d) => d || cache.delete(api));
    cache.set(api, p);
  }
  return p;
}
// Every link to a product page opens it (owner, 2026-10-31: "whenever I click on any item … a quick view open like K Young"): a
// card's data-qv attributes when it has them, else the region and slug read from the href (/<region>/p/<slug>), with the name and
// photo the link itself shows until the response brings the product's own. Links inside the quick view, and on the product's own
// page, navigate as usual.
const PRODUCT_PATH = /^\/(au|nz|us|uk|ca|eu|sg)\/p\/([^/?#]+)\/?$/;
interface Target {
  region: Region;
  slug: string;
  href: string;
  name: string;
  sub: string;
  img: string | null;
}
function targetOf(e: Event): Target | null {
  const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download") || a.closest("[role=dialog]")) return null;
  const href = a.getAttribute("href")!;
  if (a.dataset.qv && a.dataset.qvRegion) {
    return { region: a.dataset.qvRegion as Region, slug: a.dataset.qv, href, name: a.dataset.qvName || "", sub: a.dataset.qvSub || "", img: a.dataset.qvImg || null };
  }
  const m = PRODUCT_PATH.exec(href);
  if (!m || window.location.pathname.replace(/\/$/, "") === href.replace(/\/$/, "")) return null;
  const img = a.querySelector("img");
  const text = (a.textContent || "").replace(/\s+/g, " ").trim();
  return { region: m[1] as Region, slug: decodeURIComponent(m[2]), href, name: img?.alt || (text.length <= 140 ? text : ""), sub: "", img: img?.currentSrc || img?.src || null };
}
const apiOf = (t: Target) => `/api/quick/${t.region}/${encodeURIComponent(t.slug)}`;

export function QuickView() {
  const [head, setHead] = useState<Head | null>(null);
  const [data, setData] = useState<Data | null | "loading">(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setHead(null), []);

  useEffect(() => {
    // Capture phase on the document: runs before Next's Link, which then sees the click already handled and does not navigate.
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const t = targetOf(e);
      if (!t) return;
      e.preventDefault();
      const api = apiOf(t);
      setHead({ api, href: t.href, region: t.region, name: t.name, sub: t.sub, img: t.img });
      setData("loading");
      load(api).then((d) => setData((cur) => (cur === "loading" ? d : cur)));
    }
    // Warm the response when a mouse rests on a card, so most opens are instant.
    function onOver(e: PointerEvent) {
      const t = e.pointerType === "mouse" ? targetOf(e) : null;
      if (t) load(apiOf(t));
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerover", onOver, { passive: true });
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerover", onOver);
    };
  }, []);

  useEffect(() => {
    if (!head) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [head, close]);

  if (!head) return null;
  const got = data && data !== "loading" ? data : null;
  const name = got?.name || head.name;
  const sub = got?.sub || head.sub;
  const img = head.img || got?.img || null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={name}>
      <button type="button" aria-label="Close" tabIndex={-1} className="qv-backdrop absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={close} />
      <div className="qv-panel relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl">
        <div className="flex items-start gap-4 border-b border-line p-4 sm:p-5">
          <div className="plate relative h-24 w-24 shrink-0">
            {img ? (
              <img src={img} alt="" className="absolute inset-0 h-full w-full object-contain p-1.5 mix-blend-multiply" />
            ) : (
              <div className="flex h-full items-center justify-center p-2 text-center text-[11px] font-semibold text-[#5c606c]">{sub}</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            {sub && <p className="text-xs font-semibold text-muted">{sub}</p>}
            <h2 className="mt-0.5 font-display text-lg font-bold leading-snug">{name || <span className="qv-shimmer inline-block h-5 w-48 rounded" />}</h2>
            {data && data !== "loading" && data.stores > 0 && (
              <p className="mt-1 text-xs text-faint">
                In stock at {data.inStock} of {data.stores} {data.stores === 1 ? "store" : "stores"}
              </p>
            )}
          </div>
          <button ref={closeRef} type="button" onClick={close} aria-label="Close" className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold">Every store&rsquo;s price</h3>
          {data === "loading" ? (
            <Skeleton />
          ) : data ? (
            <div className="card overflow-hidden">
              <OfferRowsWithEbay rows={data.rows} tcg={data.tcg} amazon={data.amazon} region={head.region} slug={data.ebay.slug} query={data.ebay.query} floor={data.ebay.floor} packs={data.ebay.packs} allowBest={!data.preorder} preorder={data.preorder} />
            </div>
          ) : (
            <p className="rounded-xl border border-line p-4 text-sm text-muted">Prices did not load. The full page has every store&rsquo;s price.</p>
          )}
        </div>
        <div className="border-t border-line p-4 sm:px-5">
          <Link href={head.href} prefetch={false} onClick={close} className="btn-primary flex w-full justify-center px-5 py-2.5 text-[15px]">
            See price history and details <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line" aria-label="Loading prices" aria-busy="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="flex-1 space-y-1.5">
            <div className="qv-shimmer h-3.5 w-1/3 rounded" />
            <div className="qv-shimmer h-2.5 w-1/2 rounded" />
          </div>
          <div className="qv-shimmer h-9 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
