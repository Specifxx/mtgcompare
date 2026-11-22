"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ACCOUNT_SITE as S } from "@/lib/account-site";
import { readStored } from "@/lib/premium-member";
import { claimPromptSlot, promptSlotHolder, PROMPT_SILENCE_DAYS } from "@/lib/prompt-slot";
import { SignInSlides, signInPromptEvent } from "./SignInSlides";

// THE SIGN-IN SLIDE IN THE CORNER (owner, 2026-11-22), in place of the Premium corner card: a signed-out visitor is asked for a FREE
// account, never for money. The page budget's rules (ops/product-ux/page-budget.md), each one enforced here:
//   • never on a visit's first page: it arms on the second distinct page, and then only once the visitor has scrolled a third of a screen;
//   • the visit's ONE prompt (lib/prompt-slot.ts): it stands down if the rating card or the return nudge already had the visit, and holds
//     the slot so they stand down after it; it shows at most once a visit;
//   • ✕ (or Escape) silences it for 7 days; following it silences it for 30;
//   • never signed in, never on the account pages, never over a dialog, and on product pages only from 1024px (the phone's buy bar).
// A card in the foot of the page, not a modal: nothing behind it is blocked. Browser only, nothing in the server HTML.

const SEEN_KEY = "mtg_signin_pages";
const SILENT_KEY = "signin_corner_silent_until";
const SLOT = "signin-corner";
const ARM_PAGES = 2;
const SCROLL_ARM = 0.33;
const DAY = 86_400_000;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function quiet(path: string): boolean {
  if (S.quietPaths.some((re) => re.test(path))) return true;
  // The page already carries the slides (the home page's banner): one pitch a page.
  if (document.querySelector(".signin-banner")) return true;
  return S.productPath.test(path) && !window.matchMedia("(min-width: 1024px)").matches;
}

export function SignInCorner() {
  const path = usePathname() || "/";
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && quiet(path)) setOpen(false);
    const seen: string[] = safe(() => JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]"), []);
    if (!seen.includes(path)) {
      seen.push(path);
      safe(() => sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-20))), undefined);
    }
    setArmed(seen.length >= ARM_PAGES);
  }, [path, open]);

  useEffect(() => {
    if (!armed || open || quiet(path)) return;
    if (readStored()) return;
    if (Number(safe(() => localStorage.getItem(SILENT_KEY), "0")) > Date.now()) return;
    const holder = promptSlotHolder();
    if (holder && holder !== SLOT) return;
    if (holder === SLOT) return; // shown already this visit
    const check = () => {
      const scrolled = window.scrollY / Math.max(1, window.innerHeight) >= SCROLL_ARM;
      // Another unit on screen goes first. A closed drawer can stay in the page hidden and inert: only a visible one counts.
      const busy = [...document.querySelectorAll<HTMLElement>("[data-rate-card], [data-heavy-popup], [data-heavy-slide], dialog[open], [aria-modal='true']")].some(
        (el) => !el.closest("[inert], [hidden], [aria-hidden='true']") && el.getClientRects().length > 0,
      );
      if (!scrolled || busy) return;
      window.removeEventListener("scroll", check);
      if (promptSlotHolder() || !claimPromptSlot(SLOT)) return;
      setOpen(true);
    };
    window.addEventListener("scroll", check, { passive: true });
    check();
    return () => window.removeEventListener("scroll", check);
  }, [armed, path, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(PROMPT_SILENCE_DAYS, true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close(days: number, dismissed: boolean) {
    safe(() => localStorage.setItem(SILENT_KEY, String(Date.now() + days * DAY)), undefined);
    if (dismissed) signInPromptEvent("corner", "close");
    setOpen(false);
  }

  if (!open) return null;
  return (
    <aside
      data-ad
      data-signin-corner
      aria-label={`Sign in to ${S.name}`}
      className="premium-slide-in fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-line bg-surface p-4 text-ink shadow-2xl md:bottom-4 sm:left-auto sm:right-4 sm:translate-x-0 sm:[animation-name:none]"
    >
      <button type="button" onClick={() => close(PROMPT_SILENCE_DAYS, true)} aria-label="Close" className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink">
        ✕
      </button>
      <SignInSlides surface="corner" variant="corner" onClose={() => close(30, false)} />
    </aside>
  );
}
