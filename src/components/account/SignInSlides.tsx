"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { track } from "@vercel/analytics";
import { ACCOUNT_SITE as S } from "@/lib/account-site";
import { trackPremium } from "@/lib/premium-member";
import { usePremium } from "@/components/premium/usePremium";
import { BellArt, BoxesArt, GiftArt, KeyArt } from "./art";

// THE SIGN-IN SLIDES (owner, 2026-11-22: "we need nice profile pages and sign in slides to encourage signing in"). They sell the FREE
// account by what it really does on this site, one benefit a slide: the giveaway (while it is open), price alerts, the collection, and one
// sign-in for every card site. Never a price, a countdown we can't back, or Premium: Premium has its own page.
//
// Three placements, all inside the page budget (ops/product-ux/page-budget.md):
//   • "banner": the home page's one promo banner, in the page's flow under the hero (it takes the giveaway banner's place for a
//     signed-out visitor, who also sees the giveaway as its first slide; anyone signed in gets `fallback`, the plain giveaway banner);
//   • "panel": beside the form on /account;
//   • "corner": SignInCorner's card, the visit's one prompt (never on the first page, closed for 7 days).
// Motion: one slide every 6 s, paused on hover and focus, none at all under prefers-reduced-motion. Every slide is in the HTML at the
// same place (a grid stack), so the height never changes. Events: signin_prompt {surface, step: view|click|close} (GA4), and
// signin_prompt_click {surface} (Vercel). The button carries ?src=<surface> (lib/premium-member.ts rememberSignInSource).

export type SlidesSurface = "home" | "signin" | "corner";

interface Slide {
  key: string;
  kicker: string;
  title: string;
  body: string;
  cta: string;
  next: string;
  art: ReactNode;
}

export function signInSlides(): Slide[] {
  const out: Slide[] = [];
  const g = S.giveaway;
  if (g?.open()) {
    out.push({
      key: "giveaway",
      kicker: `Free giveaway · ${g.closesShort}`,
      title: g.title,
      body: "Sign in free for 50 points. Add 5 every day you check in and 25 for each friend you invite.",
      cta: "Sign in and enter",
      next: "/giveaway",
      // eslint-disable-next-line @next/next/no-img-element
      art: <img src={g.image} alt={g.title} width={64} height={64} className="h-full max-h-full w-full max-w-full rounded-lg bg-white object-contain p-1" />,
    });
  }
  out.push(
    {
      key: "alerts",
      kicker: "Free price alerts",
      title: "Name your price. We email you.",
      body: `Set a target on any of the ${S.things} we compare. We read every store about twice a day and email you when one goes under it.`,
      cta: "Sign in free",
      next: "/watches",
      art: <BellArt className="h-8 w-8" />,
    },
    {
      key: "collection",
      kicker: "My collection",
      title: "See what your collection is worth",
      body: "Tap “I own this” on what you own. We value it at today's store prices in your currency, and show how far it has moved.",
      cta: "Start my collection",
      next: "/collection",
      art: <BoxesArt className="h-8 w-8" />,
    },
    {
      key: "account",
      kicker: "No password",
      title: "One free account for all our card sites",
      body: "Continue with Google or Discord, or get a sign-in link by email. Your alerts and points follow you to every card site we run.",
      cta: "Create my free account",
      next: "/account",
      art: <KeyArt className="h-8 w-8" />,
    },
  );
  return out;
}

export function signInHref(surface: string, next: string): string {
  return `/account?src=${surface}&next=${encodeURIComponent(next)}`;
}

function event(surface: SlidesSurface, step: "view" | "click" | "close", slide?: string) {
  trackPremium("signin_prompt", { surface, step, slide });
  if (step === "click") {
    try {
      track("signin_prompt_click", { surface, slide: slide ?? "" });
    } catch {
      /* analytics is best-effort */
    }
  }
}
export { event as signInPromptEvent };

function useRotation(count: number, paused: boolean) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (paused || count < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % count), 6000);
    return () => clearInterval(t);
  }, [paused, count]);
  return [i, setI] as const;
}

function Dots({ n, i, set, light = false }: { n: number; i: number; set: (k: number) => void; light?: boolean }) {
  if (n < 2) return null;
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: n }, (_, k) => (
        <button
          key={k}
          type="button"
          aria-label={`Show slide ${k + 1} of ${n}`}
          aria-current={k === i}
          onClick={() => set(k)}
          className={`grid h-6 place-items-center ${k === i ? "w-7" : "w-4"}`}
        >
          <span className={`block h-1.5 rounded-full transition-all ${k === i ? `w-6 ${light ? "bg-white" : "bg-brand"}` : `w-1.5 ${light ? "bg-white/45" : "bg-ink/25"}`}`} />
        </button>
      ))}
    </div>
  );
}

/**
 * The slides. `fallback` (banner only) is what a signed-in visitor sees in the same place. Signed-in visitors never see a slide.
 */
export function SignInSlides({ surface, variant, fallback = null, onClose, className = "" }: { surface: SlidesSurface; variant: "banner" | "panel" | "corner"; fallback?: ReactNode; onClose?: () => void; className?: string }) {
  const v = usePremium();
  const slides = signInSlides();
  const [paused, setPaused] = useState(false);
  const [i, setI] = useRotation(slides.length, paused);
  const ref = useRef<HTMLElement>(null);
  const seen = useRef(false);
  const signedIn = v.status === "member" || v.status === "free";

  useEffect(() => {
    if (signedIn || seen.current || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting) && !seen.current) {
        seen.current = true;
        event(surface, "view");
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [signedIn, surface]);

  if (signedIn) return <>{fallback}</>;
  const s = slides[Math.min(i, slides.length - 1)];
  const pause = { onMouseEnter: () => setPaused(true), onMouseLeave: () => setPaused(false), onFocus: () => setPaused(true), onBlur: () => setPaused(false) };
  const stack = (render: (x: Slide) => ReactNode) =>
    slides.map((x, n) => (
      <div
        key={x.key}
        role="group"
        aria-roledescription="slide"
        aria-label={`${n + 1} of ${slides.length}`}
        aria-hidden={n !== i}
        className={`col-start-1 row-start-1 transition-[opacity,transform] duration-500 motion-reduce:transition-none ${n === i ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-4 opacity-0"}`}
      >
        {render(x)}
      </div>
    ));
  const go = (x: Slide) => () => event(surface, "click", x.key);

  if (variant === "panel") {
    return (
      <section ref={ref} aria-roledescription="carousel" aria-label={`Why sign in to ${S.name}`} {...pause} className={`signin-panel relative overflow-hidden rounded-2xl p-6 text-white sm:p-8 ${className}`}>
        <div className="grid">
          {stack((x) => (
            <div>
              <div className="hidden h-14 w-14 place-items-center overflow-hidden rounded-xl bg-white/15 text-white ring-1 ring-white/25 sm:grid sm:mb-5">{x.art}</div>
              <p className=" text-xs font-bold uppercase tracking-[0.14em] text-white/80">{x.kicker}</p>
              <p className="mt-1 font-display text-2xl font-bold leading-tight sm:text-3xl">{x.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-white/85 sm:text-base">{x.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <Dots n={slides.length} i={i} set={setI} light />
        </div>
        <ul className="mt-6 hidden gap-2 border-t border-white/20 pt-5 text-sm text-white/90 lg:grid">
          {slides.map((x) => (
            <li key={x.key} className="flex items-start gap-2">
              <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/20 text-[11px] font-bold">✓</span>
              {x.title}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (variant === "corner") {
    return (
      <section ref={ref} aria-roledescription="carousel" aria-label={`Sign in to ${S.name}`} {...pause} className={className}>
        <div className="grid">
          {stack((x) => (
            <div className="flex gap-3 pr-6">
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-soft text-brand-strong [&_svg]:h-6 [&_svg]:w-6">{x.art}</div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{x.kicker}</p>
                <p className="font-display text-base font-bold leading-snug">{x.title}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <a href={signInHref(surface, location.pathname)} onClick={() => { go(s)(); onClose?.(); }} className="btn-primary min-h-10 px-5">
            Sign in free
          </a>
          <Dots n={slides.length} i={i} set={setI} />
        </div>
        <p className="mt-2 text-xs text-muted">Free, no password. Google, Discord or an email link.</p>
      </section>
    );
  }

  // banner
  return (
    <section ref={ref} aria-roledescription="carousel" aria-label={`A free ${S.name} account`} {...pause} className={`signin-banner card relative mt-4 overflow-hidden ${className}`}>
      <div className="grid items-center gap-4 p-4 sm:grid-cols-[1fr_auto] sm:gap-6 sm:p-5">
        <div className="grid">
          {stack((x) => (
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-soft text-brand-strong">{x.art}</div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-strong">{x.kicker}</p>
                <p className="font-display text-lg font-bold leading-snug sm:text-xl">{x.title}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-muted">{x.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
          <a href={signInHref(surface, s.next)} onClick={go(s)} className="btn-primary min-h-11 px-6">
            {s.cta}
          </a>
          <Dots n={slides.length} i={i} set={setI} />
        </div>
      </div>
    </section>
  );
}
