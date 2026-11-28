"use client";
// TCGplayer's sale card (owner, 2026-11-27: "a pop-up on every single website … the 10% store credit … here's some items to get
// started"). It is a small card in the corner, or a short sheet along the bottom on a phone, and never a full-screen
// interstitial. There is no backdrop and nothing on the page is blocked or moved. It is labelled Ad, and ✕ or Escape closes it
// for good. It shows only while TCGplayer's sale runs (tcgSaleOn, the same clock as the row chip), once a visit, after
// OPEN_AFTER_MS on the page, and never while the visitor is typing: a focused text field or a key in the last QUIET_MS makes it
// wait. It takes the visit's one prompt slot (`slotKey`, each site's own) and stands down when another prompt already has it.
// The links are drawn by the site with its own tagged helpers (`children`). It never calls window.open and never navigates by
// itself.
// After the sale (owner, 2026-11-28: "keep the banners going and the pop-ups going"), the same card keeps its slot all year with
// the offer calendar's words (lib/offer-calendar.ts): the season and TCGplayer's own standing offer, never an invented discount.
// It is still once a visit, never while typing, and its ✕ keeps it away for OFFER_CLOSE_DAYS.
import { useEffect, useState, type ReactNode } from "react";
import { BF_PHASE_LABEL, bfHref, bfPhase, type BfPhase } from "@/lib/bf-mode";
import { OFFER_CLOSE_DAYS, OFFER_PHASE_SHORT, TCG_OFFER_COPY, offerCalendarOn, offerPhase, type OfferPhase } from "@/lib/offer-calendar";
import { tcgSaleOn } from "@/components/TcgSaleChip";

export const OPEN_AFTER_MS = 9000;
export const QUIET_MS = 5000;
const SHOWN_KEY = "tcg-sale-popup";
const CLOSED_KEY = "tcg-sale-popup-closed";
const OFFER_CLOSED_KEY = "tcg-offer-popup-closed-at";
const NAME = "tcg-sale-popup";

function typingTarget(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName !== "INPUT") return false;
  const t = ((el as HTMLInputElement).type || "text").toLowerCase();
  return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image", "hidden"].includes(t);
}

/** Takes the visit's one prompt slot; false when another prompt has it, or storage is refused. */
function claimSlot(slotKey: string, sale: boolean): boolean {
  try {
    if (sessionStorage.getItem(SHOWN_KEY) === "1") return false;
    if (sale && localStorage.getItem(CLOSED_KEY) === "1") return false;
    if (!sale) {
      const at = Number(localStorage.getItem(OFFER_CLOSED_KEY) || 0);
      if (at && Date.now() - at < OFFER_CLOSE_DAYS * 24 * 3600 * 1000) return false;
    }
    const cur = sessionStorage.getItem(slotKey);
    if (cur && cur !== NAME) return false;
    sessionStorage.setItem(slotKey, NAME);
    sessionStorage.setItem(SHOWN_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

export function TcgSalePopup({
  slotKey,
  dealsHref,
  offerHref,
  children,
}: {
  /** The site's own one-prompt-a-visit sessionStorage key. */
  slotKey: string;
  /** Our own Black Friday deals page (bfHref turns it into the Cyber Monday page on Monday). */
  dealsHref: string;
  /** Our own deals page once the sale is over (defaults to `dealsHref`). */
  offerHref?: string;
  /** Two or three tagged TCGplayer links, drawn by the site. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<BfPhase>("cyberWeekend");
  const [offer, setOffer] = useState<OfferPhase | null>(null);
  useEffect(() => {
    const live = (t: number) => tcgSaleOn(t) || offerCalendarOn(t);
    if (!live(Date.now())) return;
    let lastKey = 0;
    const onKey = () => (lastKey = Date.now());
    window.addEventListener("keydown", onKey, { capture: true, passive: true });
    window.addEventListener("input", onKey, { capture: true, passive: true });
    let timer = 0;
    const tryOpen = () => {
      const now = Date.now();
      if (!live(now)) return;
      if (typingTarget(document.activeElement) || now - lastKey < QUIET_MS || document.querySelector("dialog[open]")) {
        timer = window.setTimeout(tryOpen, 2000);
        return;
      }
      const sale = tcgSaleOn(now);
      if (!claimSlot(slotKey, sale)) return;
      setOffer(sale ? null : offerPhase(now));
      setPhase(bfPhase(now));
      setOpen(true);
    };
    timer = window.setTimeout(tryOpen, OPEN_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("input", onKey, { capture: true });
    };
  }, [slotKey]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  function close() {
    try {
      if (offer) localStorage.setItem(OFFER_CLOSED_KEY, String(Date.now()));
      else localStorage.setItem(CLOSED_KEY, "1");
    } catch {
      /* storage refused: it closes for this page */
    }
    setOpen(false);
  }
  if (!open) return null;
  const label = offer ? OFFER_PHASE_SHORT[offer] : BF_PHASE_LABEL[phase];
  const copy = offer ? TCG_OFFER_COPY[offer] : null;
  return (
    <aside
      data-tcg-sale-popup=""
      role="dialog"
      aria-modal="false"
      data-tcg-offer={offer ?? undefined}
      aria-label={offer ? `TCGplayer: ${copy!.head}` : `TCGplayer ${BF_PHASE_LABEL[phase]} sale`}
      className="tcg-sale-popup"
      style={{
        position: "fixed",
        zIndex: 60,
        left: "max(12px, env(safe-area-inset-left))",
        right: "max(12px, env(safe-area-inset-right))",
        bottom: "max(12px, env(safe-area-inset-bottom))",
        maxWidth: 360,
        marginLeft: "auto",
        background: "#0b0b0c",
        color: "#fff",
        border: "1px solid #27272a",
        borderRadius: 10,
        boxShadow: "0 10px 30px rgba(0,0,0,.35)",
        padding: "14px 16px 12px",
        fontSize: 14,
        lineHeight: 1.4,
      }}
    >
      <button
        type="button"
        aria-label={offer ? "Close the TCGplayer card" : "Close the TCGplayer sale card"}
        onClick={close}
        style={{ position: "absolute", top: 6, right: 6, width: 32, height: 32, borderRadius: 999, color: "#a1a1aa", background: "transparent" }}
      >
        ✕
      </button>
      <p style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, paddingRight: 28 }}>
        <span style={{ background: "#ffd400", color: "#0b0b0c", borderRadius: 4, padding: "1px 6px", fontSize: 11, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase" }}>
          {label}
        </span>
        <span style={{ color: "#a1a1aa", fontSize: 12 }}>Ad · TCGplayer</span>
      </p>
      <p style={{ margin: "8px 0 2px", fontSize: 17, fontWeight: 800 }}>{copy ? copy.head : "10% back in TCGplayer store credit"}</p>
      <p style={{ margin: 0, color: "#d4d4d8", fontSize: 13 }}>
        {copy ? copy.line : "On TCGplayer orders until 11PM Monday 30 Nov, New York time. Some places to start:"}
      </p>
      <div className="tcg-sale-popup-links" style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0 8px" }}>
        {children}
      </div>
      <a href={offer ? offerHref ?? dealsHref : bfHref(dealsHref, phase)} style={{ color: "#ffd400", fontSize: 13, fontWeight: 700 }}>
        Or compare store prices first →
      </a>
      <style>{`.tcg-sale-popup-links a{display:inline-block;background:#ffd400;color:#0b0b0c;border-radius:999px;padding:5px 11px;font-weight:700;font-size:13px;text-decoration:none}.tcg-sale-popup-links a:hover{background:#ffe34d}`}</style>
    </aside>
  );
}
