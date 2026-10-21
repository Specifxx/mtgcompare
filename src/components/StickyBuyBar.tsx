"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ebayRetailer, ebayRetailerForHref, REL_SPONSORED, type Placement } from "@/lib/affiliate";
import { shipLabel } from "@/lib/ebay-context";
import type { PriceFloor } from "@/lib/ebay-offer-row";
import { money } from "@/lib/format";
import { REGIONS, type Region } from "@/lib/regions";
import { useEbayPick } from "./EbayStrip";
import { EbayMark } from "./EbayMark";
import { Icon } from "./Icon";
import { OutboundLink } from "./OutboundLink";

// The phone buy bar (the owner-approved exception to "no sticky", README "Always"; placement product-sticky). On a phone a product page
// runs 4–10k px and the buy action scrolls away; this keeps the page's OWN top action within reach, and nothing else:
//   • in stock: the best-price card's store, price and button (its href, rel and retailer), "affiliate link" when that is TCGplayer;
//     eBay's listing only where the card itself shows it (the same useEbayPick, the same `cheaper` rule: never on a pre-order, NZ or SG),
//     then labelled "Ad", with data-ad;
//   • sold out: the callout's eBay action (the product's own new listing when there is one, else the eBay search), labelled "Ad".
// When it shows: only once #best (the card) or #soldout (the callout) has scrolled ABOVE the viewport. When it hides: while the price
// table (#prices), any other unit ([data-ad]) or the footer is in view (so a phone screen never holds two units), and for the rest of
// the session once dismissed. Fixed, 64 px plus the safe area, it slides on transform only: nothing on the page moves (CLS 0). Phones
// only (lg:hidden; the observers do not run from lg). While it shows, the page's scroll-padding-bottom is its height, so a focused element
// is never under it. role="region", "Quick buy", in the tab order after the page's content.

export interface BarPick {
  slug: string;
  floor: PriceFloor | null;
  packs: number | null;
}

export interface BarStore {
  cents: number;
  storeName: string;
  href: string;
  rel: string;
  retailer: string;
  /** TCGplayer (a marketplace, an affiliate link), not a store. */
  marketplace: boolean;
}

export interface StickyBuyBarProps {
  region: Region;
  /** The element that must scroll away before the bar shows: the best-price card (in stock) or the sold-out callout. */
  anchor: "best" | "soldout";
  /** In stock: the card's store action. */
  store?: BarStore | null;
  /** The card's (in stock) or the callout's (sold out) eBay pick, or null where the page shows none (pre-order, NZ, SG). */
  pick?: BarPick | null;
  /** Sold out: the callout's eBay search, and the line the bar says above it ("Sold out at UK stores"). */
  search?: { href: string; line: string } | null;
  preorder?: boolean;
}

const placement: Placement = "product-sticky";
const DISMISS_KEY = "dex-buybar-off";

export function StickyBuyBar(props: StickyBuyBarProps) {
  return props.pick ? <WithPick {...props} pick={props.pick} /> : <Bar {...props} content={staticContent(props)} />;
}

function WithPick(props: StickyBuyBarProps & { pick: BarPick }) {
  const { region, pick, store } = props;
  const { item, cents, bestable, age } = useEbayPick({ region, slug: pick.slug, floor: pick.floor, packs: pick.packs, placement });
  // In stock: BestPriceCard's rule to the letter (the bar repeats the card). Sold out: the callout's (any new listing of its own).
  const show = store ? bestable && item != null && cents != null && cents < store.cents : bestable && item != null && cents != null;
  const content = show && item && cents != null ? listingContent(region, item, cents, age, !store) : staticContent(props);
  return <Bar {...props} content={content} />;
}

interface Content {
  ad: boolean;
  top: ReactNode;
  bottom: ReactNode;
  link: { href: string; rel: string; retailer: string; label: string; className: string };
}

function staticContent({ region, store, search, preorder }: StickyBuyBarProps): Content {
  const r = REGIONS[region];
  if (store) {
    return {
      ad: false,
      top: (
        <>
          <b className="tabular font-display text-lg font-extrabold leading-6">{money(store.cents, r.market)}</b>
          <span className="truncate text-sm font-semibold"> · {store.storeName}</span>
        </>
      ),
      bottom: store.marketplace ? "Marketplace · affiliate link" : `${preorder ? "Cheapest pre-order" : "Best price in stock"} · excl. shipping`,
      link: { href: store.href, rel: store.rel, retailer: store.retailer, label: store.marketplace ? "View offer" : "Go to store", className: "btn-primary" },
    };
  }
  return {
    ad: true,
    top: <span className="truncate text-sm font-semibold">{search?.line ?? "Sold out at the stores we track"}</span>,
    bottom: (
      <>
        <span className="ad-pill">Ad</span> <span className="truncate">Sealed listings on eBay</span>
      </>
    ),
    link: { href: search?.href ?? "#", rel: REL_SPONSORED, retailer: ebayRetailer(region), label: "Find on eBay", className: "btn-ad" },
  };
}

function listingContent(region: Region, item: { href: string; ship?: Parameters<typeof shipLabel>[0] }, cents: number, age: string, soldOut: boolean): Content {
  const ship = shipLabel(item.ship);
  return {
    ad: true,
    top: (
      <>
        <EbayMark className="text-base" />
        <b className="tabular font-display text-lg font-extrabold leading-6">
          {soldOut ? "from " : ""}
          {money(cents, REGIONS[region].market)}
        </b>
      </>
    ),
    bottom: (
      <>
        <span className="ad-pill">Ad</span> <span className="truncate">{ship.text !== "Shipping on eBay" ? `${ship.text} · ` : ""}updated {age}</span>
      </>
    ),
    link: { href: item.href, rel: REL_SPONSORED, retailer: ebayRetailerForHref(item.href, region), label: "View on eBay", className: "btn-ad" },
  };
}

function Bar({ anchor, content }: StickyBuyBarProps & { content: Content }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const visible = shown && !dismissed;

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      /* storage blocked: the bar can still be dismissed for this page */
    }
  }, []);

  // When to show: the anchor is above the viewport, and nothing that hides the bar is in view.
  useEffect(() => {
    const bar = ref.current;
    if (!bar || typeof IntersectionObserver === "undefined") return;
    const desk = window.matchMedia("(min-width: 1024px)");
    let past = false;
    const blockers = new Set<Element>();
    const update = () => setShown(past && blockers.size === 0 && !desk.matches);

    const anchorEl = document.getElementById(anchor);
    const anchorIo = new IntersectionObserver((entries) => {
      for (const e of entries) past = !e.isIntersecting && e.boundingClientRect.bottom <= 0;
      update();
    });
    if (anchorEl) anchorIo.observe(anchorEl);

    // The price table, every other unit and the footer, with 120 px of margin above and below the viewport: a unit about to scroll in
    // (under the bar, or from the top) hides it before both can be on screen together.
    const watched = new Set<Element>();
    const blockIo = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.target.isConnected) blockers.add(e.target);
          else blockers.delete(e.target);
        }
        update();
      },
      { rootMargin: "120px 0px 120px 0px" },
    );
    const scan = () => {
      const now = new Set<Element>([...document.querySelectorAll("#prices, footer, [data-ad]")].filter((el) => !bar.contains(el)));
      for (const el of now) if (!watched.has(el)) (watched.add(el), blockIo.observe(el));
      for (const el of [...watched]) {
        if (now.has(el)) continue;
        watched.delete(el);
        blockIo.unobserve(el);
        blockers.delete(el);
      }
      update();
    };
    scan();
    // Units change their element when their listings arrive (EbayStrip): look again, at most once a frame.
    let frame = 0;
    const mo = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), scan()));
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ad", "id"] });
    desk.addEventListener?.("change", update);
    return () => {
      anchorIo.disconnect();
      blockIo.disconnect();
      mo.disconnect();
      if (frame) cancelAnimationFrame(frame);
      desk.removeEventListener?.("change", update);
    };
  }, [anchor]);

  // While shown, nothing focused scrolls under it.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible || !ref.current) return;
    root.style.scrollPaddingBottom = `${ref.current.offsetHeight}px`;
    return () => {
      root.style.scrollPaddingBottom = "";
    };
  }, [visible]);

  useEffect(() => {
    const el = ref.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (el) el.inert = !visible;
  }, [visible]);

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage blocked: dismissed for this page only */
    }
  }

  const { link } = content;
  return (
    <div
      ref={ref}
      role="region"
      aria-label="Quick buy"
      aria-hidden={visible ? undefined : true}
      data-ad={content.ad && visible ? placement : undefined}
      data-buybar={visible ? "shown" : "hidden"}
      // It slides IN (transform only, 200 ms, none with reduced motion) and goes at once: the moment another unit, the table or the
      // footer comes into view it is gone (visibility:hidden too, so it is out of the tab order), never on screen beside a unit.
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-[max(10px,env(safe-area-inset-bottom))] pt-[9px] shadow-lift backdrop-blur lg:hidden ${
        visible ? "translate-y-0 transition-transform duration-200 ease-out motion-reduce:transition-none" : "invisible translate-y-full"
      }`}
    >
      <div className="mx-auto flex h-11 max-w-page items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex h-6 min-w-0 items-center gap-1.5 whitespace-nowrap">{content.top}</div>
          <div className="flex h-5 min-w-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-muted">{content.bottom}</div>
        </div>
        <OutboundLink href={link.href} rel={link.rel} retailer={link.retailer} placement={placement} className={`${link.className} min-h-11 shrink-0 whitespace-nowrap px-4`}>
          {link.label} <span aria-hidden="true">↗</span>
        </OutboundLink>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide the quick buy bar"
          className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-ink"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
  );
}
