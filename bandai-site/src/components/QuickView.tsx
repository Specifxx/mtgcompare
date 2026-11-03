"use client";
// The quick view (owner, 2026-10-30: "I really like the kaeyoung quick view pop
// ups", ported from K Young). A click on any product tile (a[data-qv]) opens
// this panel at once with what the tile already knows (art, name, set), then
// fills in every price from /api/quick/<slug> (CDN-cached six hours) through the
// card page's own PriceTable, so the rows, their order and the market picker are
// the page's. The tile stays a real link: crawlers, new tabs and modified clicks
// go to the card page, whose server HTML keeps every price.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/Link";
import type { Market, Offer } from "@/lib/site-types";
import { PriceTable } from "./PriceTable";
import { ShareButton } from "./ShareButton";
import { closeQuickViewUrl, onQuickViewHistory, openQuickViewUrl } from "@/lib/quick-view-url";

interface Head {
  slug: string;
  name: string;
  sub: string;
  img: string | null;
}
interface Data {
  id: number;
  offers: Offer[];
  fx: Record<string, number>;
  amazon: Partial<Record<Market, string>> | null;
  name: string;
  sub: string;
  img: string | null;
}

// Every link to a card or sealed page opens it (owner, 2026-10-31: "whenever I
// click on any item … a quick view open like K Young"): a tile's data-qv
// attributes when it has them, else the slug read from the href
// (/card/<slug>), with the link's own picture and text until /api/quick brings
// the product's own. Links in the quick view, and on the product's own page,
// navigate as usual.
const PRODUCT_PATH = /^\/card\/([^/?#]+)\/?$/;
function headOf(e: Event): Head | null {
  const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download") || a.closest("[role=dialog]")) return null;
  if (a.dataset.qv) return { slug: a.dataset.qv, name: a.dataset.qvName || "", sub: a.dataset.qvSub || "", img: a.dataset.qvImg || null };
  const href = a.getAttribute("href")!;
  const m = PRODUCT_PATH.exec(href);
  if (!m || window.location.pathname.replace(/\/$/, "") === href.replace(/\/$/, "")) return null;
  const img = a.querySelector("img");
  const text = (a.textContent || "").replace(/\s+/g, " ").trim();
  return { slug: decodeURIComponent(m[1]), name: img?.alt || (text.length <= 140 ? text : ""), sub: "", img: img?.currentSrc || img?.src || null };
}

const cache = new Map<string, Promise<Data | null>>();
function load(slug: string): Promise<Data | null> {
  let p = cache.get(slug);
  if (!p) {
    p = fetch(`/api/quick/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Data>) : null))
      .catch(() => null);
    p.then((d) => d || cache.delete(slug));
    cache.set(slug, p);
  }
  return p;
}

export function QuickView() {
  const [head, setHead] = useState<Head | null>(null);
  const [data, setData] = useState<Data | null | "loading">(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Closing steps back to the list's own URL (lib/quick-view-url.ts); the details link only hides it, and lands on the URL already shown.
  const close = useCallback(() => {
    setHead(null);
    closeQuickViewUrl();
  }, []);
  const hide = useCallback(() => setHead(null), []);

  useEffect(() => {
    // Capture phase on the document: runs before Next's Link, which then sees
    // the click already handled and does not navigate.
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const h = headOf(e);
      if (!h) return;
      e.preventDefault();
      show(h);
      // The product's own link in the address bar while it is open (owner, 2026-11-03), so it can be copied, shared or bookmarked.
      openQuickViewUrl(`/card/${h.slug}`, h);
    }
    function show(h: Head | null) {
      setHead(h);
      if (!h) return;
      setData("loading");
      load(h.slug).then((d) => setData((cur) => (cur === "loading" ? d : cur)));
    }
    // Back closes the pop-up, Forward reopens it.
    const offHistory = onQuickViewHistory<Head>(show);
    // Warm the response when a mouse rests on a tile, so most opens are instant.
    function onOver(e: PointerEvent) {
      const h = e.pointerType === "mouse" ? headOf(e) : null;
      if (h) load(h.slug);
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerover", onOver, { passive: true });
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerover", onOver);
      offHistory();
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
  const href = `/card/${head.slug}`;
  const got = data && data !== "loading" ? data : null;
  const name = got?.name || head.name;
  const sub = got?.sub || head.sub;
  const img = head.img || got?.img || null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={name}>
      <button type="button" aria-label="Close" tabIndex={-1} className="qv-backdrop absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={close} />
      <div className="qv-panel relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-ink-700/60 bg-ink-900 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start gap-4 border-b border-ink-800 p-4 sm:p-5">
          <div className="grid h-28 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-ink-850">
            {img ? <img src={img} alt="" className="h-full w-full object-contain p-1" /> : <span className="p-2 text-center text-[11px] text-muted">No image yet</span>}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-snug text-fg">{name || <span className="qv-shimmer inline-block h-5 w-48 rounded" />}</h2>
            {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
            {name && <ShareButton path={href} name={name} medium="card" offers={got?.offers} className="mt-2" />}
          </div>
          <button ref={closeRef} type="button" onClick={close} aria-label="Close" className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-ink-800 hover:text-fg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold text-fg">Compare prices</h3>
          {data === "loading" ? (
            <Skeleton />
          ) : data ? (
            <PriceTable offers={data.offers} fx={data.fx} productId={data.id} page="quickview" amazon={data.amazon} tableId={null} />
          ) : (
            <p className="rounded-xl border border-ink-700/60 p-4 text-sm text-muted">Prices did not load. The full page has every price.</p>
          )}
        </div>
        <div className="border-t border-ink-800 p-4 sm:px-5">
          <Link href={href} onClick={hide} className="btn-primary flex w-full justify-center px-5 py-2.5 text-[15px]">
            See price history and details <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="divide-y divide-ink-800 overflow-hidden rounded-xl border border-ink-700/60" aria-label="Loading prices" aria-busy="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <div className="flex-1 space-y-1.5">
            <div className="qv-shimmer h-3.5 w-1/3 rounded" />
            <div className="qv-shimmer h-2.5 w-1/4 rounded" />
          </div>
          <div className="qv-shimmer h-9 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
