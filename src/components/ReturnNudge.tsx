"use client";
// The return nudge: see lib/return-nudge.ts for the rules. One delegated click listener notes a store click (and the page's own sponsored
// eBay and TCGplayer links); when the visitor comes back to the tab, the "on" arm sees a small dismissible card with those two links.
import { useEffect, useState } from "react";
import { track } from "@/lib/track";
import { gaEvent } from "@/lib/gtag";
import { NUDGE_ARM_KEY, NUDGE_STATE_KEY, isStoreLink, nudgeEligible, nudgeShows, pickArm, pickPaidLinks } from "@/lib/return-nudge";

interface Saved { t: number; e?: string; g?: string; shown?: boolean }
interface View { e?: string; g?: string }

const read = (): Saved | null => {
  try { return JSON.parse(sessionStorage.getItem(NUDGE_STATE_KEY) ?? "null"); } catch { return null; }
};
const write = (v: Saved) => { try { sessionStorage.setItem(NUDGE_STATE_KEY, JSON.stringify(v)); } catch {} };
const arm = (): "on" | "off" => {
  try {
    const a = localStorage.getItem(NUDGE_ARM_KEY);
    if (a === "on" || a === "off") return a;
    const n = pickArm(Math.random());
    localStorage.setItem(NUDGE_ARM_KEY, n);
    return n;
  } catch {
    return "off";
  }
};

export function ReturnNudge() {
  const [view, setView] = useState<View | null>(null);

  useEffect(() => {
    let hiddenAt = 0;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href][target=_blank]") as HTMLAnchorElement | null;
      if (!a || !a.closest("[data-offer-row]")) return;
      if (!isStoreLink({ href: a.href, rel: a.rel }, location.hostname.replace(/^www\./, ""))) return;
      arm(); // fixes the visitor's arm before any later buy click is logged
      const root = a.closest("[role=dialog], main") ?? document;
      const links = pickPaidLinks([...root.querySelectorAll<HTMLAnchorElement>("a[href][rel~=sponsored]")].map((x) => ({ href: x.href, rel: x.rel })));
      write({ t: Date.now(), e: links.ebay, g: links.tcg, shown: read()?.shown });
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      const st = read();
      if (!st) return;
      const now = Date.now();
      const state = {
        arm: arm(), clickedAt: st.t, now, awayMs: hiddenAt ? now - hiddenAt : 0, shownBefore: !!st.shown,
        blocked: !!document.querySelector("[data-rate-card]"), hasLinks: !!(st.e || st.g),
      };
      hiddenAt = 0;
      if (!nudgeEligible(state)) return;
      write({ ...st, shown: true }); // one eligible return a session, whichever arm
      track("nudge_eligible", { arm: state.arm });
      gaEvent("nudge_eligible", { arm: state.arm, page: location.pathname.slice(0, 100) });
      if (nudgeShows(state)) {
        track("nudge_shown", { arm: state.arm });
        gaEvent("nudge_shown", { page: location.pathname.slice(0, 100) });
        setView({ e: st.e, g: st.g });
      }
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (!view) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setView(null);
    const t = setTimeout(() => setView(null), 20000);
    document.addEventListener("keydown", esc);
    return () => { clearTimeout(t); document.removeEventListener("keydown", esc); };
  }, [view]);

  if (!view) return null;
  const open = (which: string) => { track("nudge_click", { which }); gaEvent("nudge_click", { which }); };
  return (
    <div role="status" data-return-nudge className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2 rounded-xl border border-line bg-surface p-3 text-sm text-ink shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">Still comparing? <span className="ad-pill ml-1">Ad</span></p>
        <button type="button" aria-label="Close" onClick={() => setView(null)} className="-mr-1 -mt-1 inline-flex min-h-8 min-w-8 items-center justify-center text-muted hover:text-ink">✕</button>
      </div>
      <p className="mt-0.5 text-xs text-muted">Check the same product here too.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {view.e && <a href={view.e} target="_blank" rel="sponsored nofollow noopener" onClick={() => open("ebay")} className="btn-primary min-h-10 px-3 py-1.5">eBay <span aria-hidden="true">↗</span></a>}
        {view.g && <a href={view.g} target="_blank" rel="sponsored nofollow noopener" onClick={() => open("tcgplayer")} className="btn-tcg min-h-10 px-3 py-1.5">TCGplayer <span aria-hidden="true">↗</span></a>}
      </div>
    </div>
  );
}
