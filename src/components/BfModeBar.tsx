"use client";
// The Black Friday to Cyber Monday bar (lib/bf-mode.ts): drawn in the server HTML in place of the promo line under the header, and
// read against the clock again in the browser, so once the window ends the page switches with no new build. The ✕ hides it for
// this visit only. Never a pop-up, never fixed or floating.
// After TCGplayer's sale (owner, 2026-11-28: "keep the banners going"), the same bar carries the offer calendar
// (lib/offer-calendar.ts) when the site passes `evergreen`: the season or the site's own event, our own page, and the
// partner's standing offer (labelled Ad). Without `evergreen` it falls back to the ordinary line (`children`), as before.
import { useEffect, useState, type ReactNode } from "react";
import { BF_PHASE_LABEL, bfHref, bfModeOn, bfPhase, type BfPhase } from "@/lib/bf-mode";
import {
  OFFER_PHASE_LABEL,
  OFFER_PHASE_SHORT,
  activeEvent,
  offerCalendarOn,
  offerPhase,
  type OfferEvent,
  type OfferPhase,
} from "@/lib/offer-calendar";

const CLOSED_KEY = "bf-mode-closed";
const OFFER_CLOSED_KEY = "offer-bar-closed";

export type EvergreenBar = {
  /** The bar's words outside an event, e.g. "Riftbound sealed deals". */
  title: string;
  line?: string;
  /** Our own page for each season; `href` for any season not named. */
  hrefs?: Partial<Record<OfferPhase, string>>;
  href: string;
  cta?: string;
  /** The site's own dated events (lib/offer-calendar.ts OfferEvent); the first one running wins. */
  events?: readonly OfferEvent[];
  /** The partner's standing offer as a labelled paid link, drawn by the site with its own tagged helper. */
  ad?: ReactNode;
};

type Shown = { kind: "bf"; phase: BfPhase } | { kind: "offer"; phase: OfferPhase; event: OfferEvent | null } | { kind: "none" };

function read(now: number, evergreen: EvergreenBar | undefined): Shown {
  if (bfModeOn(now)) return { kind: "bf", phase: bfPhase(now) };
  if (evergreen && offerCalendarOn(now)) return { kind: "offer", phase: offerPhase(now), event: activeEvent(evergreen.events, now) };
  return { kind: "none" };
}

export function BfModeBar({
  on,
  phase: serverPhase = "blackFriday",
  now: serverNow,
  href,
  title,
  line,
  cta = "Shop the deals",
  ad,
  evergreen,
  children,
}: {
  /** The server's answer to bfModeOn() when it drew the page. */
  on: boolean;
  /** The server's bfPhase() when it drew the page; the browser reads the clock again. */
  phase?: BfPhase;
  /** The server's clock when it drew the page (for the offer calendar); the browser reads the clock again. */
  now?: number;
  /** Our own Black Friday deals page. */
  href: string;
  title: string;
  line?: string;
  cta?: string;
  /** An optional second, labelled paid link (TCGplayer's sale), drawn by the site with its own tagged link. */
  ad?: ReactNode;
  /** The offer calendar's bar, shown once the sale is over (lib/offer-calendar.ts). */
  evergreen?: EvergreenBar;
  /** The ordinary promo line, shown again once Black Friday mode ends and no `evergreen` is given. */
  children?: ReactNode;
}) {
  const [shown, setShown] = useState<Shown>(() =>
    on ? { kind: "bf", phase: serverPhase } : read(serverNow ?? Date.now(), evergreen),
  );
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    const now = Date.now();
    const s = read(now, evergreen);
    setShown(s);
    try {
      if (sessionStorage.getItem(s.kind === "offer" ? OFFER_CLOSED_KEY : CLOSED_KEY) === "1") setClosed(true);
    } catch {
      /* storage refused: the bar shows */
    }
    // evergreen is static per page; read the clock once a mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (shown.kind === "none") return <>{children}</>;
  if (closed) return null;
  const offer = shown.kind === "offer" ? shown : null;
  const chip = offer ? offer.event?.label ?? OFFER_PHASE_LABEL[offer.phase] : BF_PHASE_LABEL[shown.kind === "bf" ? shown.phase : "blackFriday"];
  const chipShort = offer ? offer.event?.label ?? OFFER_PHASE_SHORT[offer.phase] : chip;
  const link = offer
    ? offer.event?.href ?? evergreen?.hrefs?.[offer.phase] ?? evergreen!.href
    : bfHref(href, shown.kind === "bf" ? shown.phase : "blackFriday");
  const words = offer ? offer.event?.title ?? evergreen!.title : title;
  const sub = offer ? (offer.event ? undefined : evergreen!.line) : line;
  const button = offer ? evergreen!.cta ?? "See the deals" : cta;
  const paid = offer ? evergreen!.ad : ad;
  return (
    <div
      data-bf-mode={offer ? undefined : "on"}
      data-offer-bar={offer ? offer.event ? "event" : offer.phase : undefined}
      className="relative"
      style={{ background: "#0b0b0c", color: "#fff", borderBottom: "1px solid #000" }}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-2 pr-11 text-center text-sm">
        <a href={link} className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1" style={{ color: "#fff", textDecoration: "none" }}>
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider"
            style={{ background: "#ffd400", color: "#0b0b0c" }}
          >
            <span className="sm:hidden">{chipShort}</span>
            <span className="hidden sm:inline">{chip}</span>
          </span>
          <b>{words}</b>
          {sub ? <span className="hidden md:inline" style={{ color: "#d4d4d8" }}>{sub}</span> : null}
          <span className="rounded-full px-3 py-0.5 font-bold" style={{ background: "#ffd400", color: "#0b0b0c" }}>
            {button} →
          </span>
        </a>
        {paid ? <span className="text-xs sm:text-sm" style={{ color: "#d4d4d8" }}>{paid}</span> : null}
      </div>
      <button
        type="button"
        aria-label={`Hide the ${chip} bar`}
        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full"
        style={{ color: "#a1a1aa" }}
        onClick={() => {
          try {
            sessionStorage.setItem(offer ? OFFER_CLOSED_KEY : CLOSED_KEY, "1");
          } catch {
            /* storage refused: it hides for this page */
          }
          setClosed(true);
        }}
      >
        ✕
      </button>
    </div>
  );
}
