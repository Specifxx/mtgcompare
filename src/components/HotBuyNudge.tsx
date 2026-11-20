"use client";
// The Hot 100 buy prompt (lib/hot-nudge.ts has the rules and the read). Reddit landings only, 50/50, never on load, dismissible.
import { useEffect, useRef, useState } from "react";
import { OutboundLink } from "./OutboundLink";
import { track } from "@/lib/track";
import { REL_SPONSORED } from "@/lib/affiliate";
import {
  HOT_NUDGE_ARM_KEY,
  HOT_NUDGE_HIDE_MS,
  HOT_NUDGE_SHOWS_KEY,
  HOT_NUDGE_VISIT_KEY,
  fromReddit,
  hotNudgeShows,
  pickHotNudgeArm,
  recentShows,
  type HotNudgeArm,
} from "@/lib/hot-nudge";

interface Top {
  slug: string;
  region: string;
  name: string;
  sub: string;
  img: string | null;
  price: string | null; // our cheapest in-stock store price, formatted; null = none in stock
  pct: number; // this week's rise
}

interface Visit { arm: HotNudgeArm; shown?: boolean; bought?: boolean }

const readVisit = (): Visit | null => {
  try { return JSON.parse(sessionStorage.getItem(HOT_NUDGE_VISIT_KEY) ?? "null"); } catch { return null; }
};
const writeVisit = (v: Visit) => { try { sessionStorage.setItem(HOT_NUDGE_VISIT_KEY, JSON.stringify(v)); } catch {} };
const shows = (): number[] => { try { const a = JSON.parse(localStorage.getItem(HOT_NUDGE_SHOWS_KEY) ?? "[]"); return Array.isArray(a) ? a.map(Number) : []; } catch { return []; } };
const armOf = (): HotNudgeArm => {
  try {
    const a = localStorage.getItem(HOT_NUDGE_ARM_KEY);
    if (a === "on" || a === "off") return a;
    const n = pickHotNudgeArm(Math.random());
    localStorage.setItem(HOT_NUDGE_ARM_KEY, n);
    return n;
  } catch {
    return "off";
  }
};

export function HotBuyNudge({ top, tcgHref }: { top: Top; tcgHref: string }) {
  const [open, setOpen] = useState(false);
  const visit = useRef<Visit | null>(null);

  useEffect(() => {
    // The visit starts on a Reddit landing; a later Hot 100 view in the same tab keeps it. Anyone else: nothing at all.
    let v = readVisit();
    if (!v) {
      if (!fromReddit(document.referrer)) return;
      v = { arm: armOf() };
      writeVisit(v);
      track("hot_nudge", { k: `${v.arm}:seen` });
    }
    visit.current = v;
    const started = Date.now();

    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      const cur = visit.current;
      if (!a || !cur || cur.bought) return;
      let host = "";
      try { host = new URL(a.href, location.href).hostname; } catch { return; }
      if (!host || host === location.hostname) return; // internal: a product page, the quick view
      cur.bought = true;
      writeVisit(cur);
      track("hot_nudge", { k: `${cur.arm}:buy` });
      setOpen(false);
    };
    const check = () => {
      const cur = visit.current;
      if (!cur) return;
      const now = Date.now();
      const state = {
        arm: cur.arm, elapsedMs: now - started, scrolledPx: window.scrollY, screenPx: window.innerHeight,
        boughtThisVisit: !!cur.bought, dialogOpen: !!document.querySelector('[role="dialog"]'), shownThisVisit: !!cur.shown,
        shownAt: shows(), now,
      };
      if (!hotNudgeShows(state)) return;
      cur.shown = true;
      writeVisit(cur);
      try { localStorage.setItem(HOT_NUDGE_SHOWS_KEY, JSON.stringify([...recentShows(state.shownAt, now), now])); } catch {}
      track("hot_nudge", { k: `${cur.arm}:shown` });
      setOpen(true);
    };
    const tick = setInterval(check, 1000);
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      clearInterval(tick);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const t = setTimeout(() => setOpen(false), HOT_NUDGE_HIDE_MS);
    document.addEventListener("keydown", esc);
    return () => { clearTimeout(t); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!open) return null;
  return (
    <div role="status" data-hot-nudge className="fixed bottom-4 left-1/2 z-50 w-[min(94vw,26rem)] -translate-x-1/2 rounded-xl border border-line bg-surface p-3 text-sm text-ink shadow-lg">
      <div className="flex items-start gap-3">
        {top.img && (
          <span className="plate flex h-14 w-14 shrink-0 items-center justify-center">
            <img src={top.img} alt={top.name} width={56} height={56} className="h-full w-full object-contain p-1 mix-blend-multiply" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">#1 riser this week · ▲ {top.pct}%</p>
          <p className="line-clamp-2 font-semibold leading-snug">{top.name}</p>
          {top.price && (
            <p className="text-xs text-muted">
              Cheapest in stock now <span className="tabular font-bold text-ink">{top.price}</span>
            </p>
          )}
        </div>
        <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="-mr-1 -mt-1 inline-flex min-h-8 min-w-8 items-center justify-center text-muted hover:text-ink">✕</button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <a
          href={`/${top.region}/p/${top.slug}`}
          data-qv={top.slug}
          data-qv-region={top.region}
          data-qv-name={top.name}
          data-qv-sub={top.sub}
          data-qv-img={top.img ?? undefined}
          onClick={() => setOpen(false)}
          className="btn btn-primary min-h-10 px-3 py-1.5 text-center"
        >
          Compare every store
        </a>
        <OutboundLink href={tcgHref} rel={REL_SPONSORED} retailer="TCGplayer" placement="tcgplayer-hot-nudge" className="btn-tcg min-h-10 px-3 py-1.5 text-center">
          TCGplayer <span className="ad-pill ml-1">Ad</span>
        </OutboundLink>
      </div>
    </div>
  );
}
