"use client";

import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useMegaMenu } from "./MegaMenuProvider";
import { NAV_GROUPS, type NavGroupLink } from "./nav-groups";
import { searchNav } from "./nav-search";
import { CountrySwitcher } from "./CountrySwitcher";
import { BrandLogo } from "./BrandLogo";
import { NavIcon } from "./NavIcon";
import { TierBadge } from "./TierBadge";
import { useScrollLock, useModalFlag, useEscapeLayer } from "./ui/Dialog";

// How many database matches the overlay shows before deferring to /browse.
// Small on purpose: this is a phone menu, and the feature grid it sits above
// still has to be reachable without a long scroll past search results.
const CARD_HITS_SHOWN = 6;
const SEALED_HITS_SHOWN = 3;

// Just the fields this overlay renders, not the full CardTileData the route
// returns. Narrower on purpose: a nav row shows a name and where the card is
// from, and NO PRICE — the route localises price per market across six price
// columns (see cardTileSelect), and a nav menu that rendered one of those
// without the client-side market resolution SearchBar does would show some
// visitors another market's currency. The card page it links to has the real
// localised price.
interface CardHit {
  id: string;
  slug: string;
  name: string;
  setCode: string;
  collectorNumber: string;
}

interface SealedHit {
  groupKey: string;
  slug: string;
  name: string;
  productType: string;
}

// MTG Compare's /api/search answers `{ hits: [{ kind: "card"|"sealed", slug,
// name, number, set }] }` (the header CardSearch's shape), so the two lists
// are split out of one array here.
interface SearchHit {
  kind: "card" | "sealed";
  slug: string;
  name: string;
  number: string | null;
  set: string;
}

// Shared by the Popular grid and the full category panels below — both need
// the identical active-pathname/external branching, so it's factored out
// rather than duplicated (and drifting) between the two render paths.
//
// 2026-09-16: text-only. Every link here used to lead with its own emoji
// (🗃️, 📦, 💼…) — the same "AI generated" look the collapsed rail's icons
// replaced on 2026-09-11 (see NavIcon.tsx). This overlay is the last place
// that language survived; the group-level NavIcon glyph on each section
// header (below) now carries the visual identity instead of one per link.
function FeatureLink({ l, pathname, onClick }: { l: NavGroupLink; pathname: string; onClick: () => void }) {
  const active = !l.external && (pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href)));
  const className = `group flex min-h-11 items-center gap-3 rounded-md px-2 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-400 ${
    active ? "bg-brand-500 font-semibold text-white" : "text-slate-200 hover:bg-ink-800 hover:text-white"
  }`;
  if (l.external) {
    return (
      <a href={l.href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className}>
        <span className="font-medium">{l.label}</span>
      </a>
    );
  }
  return (
    <Link href={l.href} onClick={onClick} aria-current={active ? "page" : undefined} className={className}>
      <span className="font-medium">{l.label}</span>
      {/* The active row is a solid amethyst fill: the brass Premium chip is 2.1:1 on it, so the chip turns white-on-dark there. */}
      {l.plan ? <TierBadge tier={l.plan} className={active ? "!bg-ink-950/40 !text-white" : ""} /> : null}
    </Link>
  );
}

// Full-screen, "movie-like" navigation overlay (ported from DexCompare). Stays
// mounted and toggles via classes (animates in AND out): scroll-lock, Escape,
// backdrop/outside click, transform/opacity transitions + a focus trap. Flat,
// single accent (brand green). Fully prefers-reduced-motion safe.
export function CinematicNavMenu() {
  const { open, setOpen } = useMegaMenu();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");

  // React 18's JSX `inert` prop doesn't reliably reach the DOM (no first-class
  // support until React 19 — the attribute was silently missing from the
  // rendered HTML, which is exactly what let a close button and search input
  // stay tab-reachable inside this aria-hidden subtree while closed). Setting
  // the DOM property directly bypasses that gap; `HTMLElement.prototype.inert`
  // itself is supported by every browser this site targets.
  useEffect(() => {
    if (overlayRef.current) overlayRef.current.inert = !open;
  }, [open]);

  // The panels below, narrowed by the FEATURE filter. Same matcher the ⌘K
  // launcher uses, so "prices"/"deals"/"blog"/"alerts" behave identically on a
  // phone and on a desktop.
  const filtering = filter.trim().length > 0;

  // ── CARDS AND SEALED, from the same box ────────────────────────────────────
  // This input filtered features ONLY until 2026-09-16, and the history matters
  // because it has now been reported in BOTH directions. It originally held the
  // card SearchBar, which was reported as broken ("it acts like a normal search
  // bar and searches all the cards") because a card search sat directly above a
  // grid of features it did not filter. It was switched to a pure feature
  // filter, and that was then reported as the opposite defect: on a phone this
  // overlay is the search box people find, and typing a card name into it
  // returned nothing but pages.
  //
  // Flipping it a third time would just re-break the other half. It does both
  // now: the feature grid still narrows as you type (the earlier fix stands),
  // and real card/sealed matches appear above it. /api/search already returns
  // both lists for the navbar dropdown, so this adds a consumer, not a query.
  const [cardHits, setCardHits] = useState<CardHit[]>([]);
  const [sealedHits, setSealedHits] = useState<SealedHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = filter.trim();
    // Closed overlay must never fetch, and <2 chars is what the route itself
    // treats as "no query" (it returns empty lists) — so don't spend the trip.
    if (!open || q.length < 2) {
      setCardHits([]);
      setSealedHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    // Debounced, and the controller aborts the in-flight request on every
    // keystroke: without it a fast typist's earlier, slower response can land
    // last and overwrite the results for what they actually typed.
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { hits?: SearchHit[] };
        const hits = data.hits ?? [];
        setCardHits(
          hits
            .filter((h) => h.kind === "card")
            .slice(0, CARD_HITS_SHOWN)
            .map((h) => ({ id: h.slug, slug: h.slug, name: h.name, setCode: h.set, collectorNumber: h.number ?? "" })),
        );
        setSealedHits(
          hits
            .filter((h) => h.kind === "sealed")
            .slice(0, SEALED_HITS_SHOWN)
            .map((h) => ({ groupKey: h.slug, slug: h.slug, name: h.name, productType: h.set })),
        );
      } catch {
        /* aborted or offline — leave whatever is on screen rather than flashing empty */
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [filter, open]);
  const sections = useMemo(() => {
    if (!filtering) return NAV_GROUPS.map((g) => ({ title: g.title, icon: g.icon, links: g.links }));
    const hits = searchNav(filter);
    const byGroup = new Map<string, typeof hits>();
    for (const h of hits) {
      const list = byGroup.get(h.group);
      if (list) list.push(h);
      else byGroup.set(h.group, [h]);
    }
    return NAV_GROUPS.filter((g) => byGroup.has(g.title)).map((g) => ({
      title: g.title,
      icon: g.icon,
      links: byGroup.get(g.title)!,
    }));
  }, [filter, filtering]);

  // A stale filter (or a stale "showing everything") on reopen would show a
  // fraction — or an overwhelming amount — of the menu with no obvious reason
  // why. Every open starts fresh: Popular, unfiltered.
  useEffect(() => {
    if (!open) {
      setFilter("");
      setCardHits([]);
      setSealedHits([]);
    }
  }, [open]);

  // Scroll lock and the shared rcDialog flag now come from the same
  // refcounted hooks every Dialog-based overlay uses (ui/Dialog.tsx) — this
  // menu never set the flag before, so the corner nudges could slide in over
  // an open phone Explore overlay. It stays mounted and class-toggled rather
  // than using Dialog itself. Since 2026-09-23 it also shares Dialog's Escape
  // stack (useEscapeLayer) instead of its own window listener, so a Dialog
  // opened over the menu takes Escape first; it keeps its own focus trap and
  // focus restore below.
  useScrollLock(open);
  useModalFlag(open);
  useEscapeLayer(open, () => setOpen(false));

  // Focus in on open (the Close button), and back to whatever opened the menu
  // (HeaderMenuButton) on close — the same save/restore ui/Dialog does. Without
  // it the overlay going `inert` blurs the Close button and focus falls to
  // <body>, so the next Tab lands in the footer ad zone.
  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;
    // The panel never unmounts (see above), so this is the same node the
    // cleanup would read from the ref — copied only to satisfy the hooks lint.
    const panel = dialogRef.current;
    const t = setTimeout(() => {
      panel?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }, 60);
    return () => {
      clearTimeout(t);
      const a = document.activeElement;
      // Only reclaim focus that is lost (on <body>) or still inside the panel —
      // never steal it from something a menu link's navigation focused.
      if (
        returnTo &&
        returnTo !== document.body &&
        returnTo.isConnected &&
        (!a || a === document.body || panel?.contains(a))
      ) {
        returnTo.focus({ preventScroll: true });
      }
    };
  }, [open]);

  // Simple focus trap: loop Tab within the dialog while open.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const close = () => setOpen(false);

  return (
    // `inert` alongside aria-hidden: the panel stays mounted when closed (so the
    // open/close transition can animate), which left a close button and a search
    // input focusable inside an aria-hidden subtree — a screen-reader user could
    // tab into controls that, as far as the accessibility tree is concerned, do
    // not exist. `inert` removes them from the tab order and from hit-testing
    // for exactly as long as aria-hidden is set, so the two can't disagree (set
    // imperatively via overlayRef above — see that comment for why).
    <div
      ref={overlayRef}
      aria-hidden={!open}
      className={`fixed inset-0 z-menu ${open ? "" : "pointer-events-none"}`}
    >
      {/* Solid backdrop — no transparency, no blur. */}
      <div
        onClick={close}
        // NOT motion-safe:opacity-0 — unlike Dialog/Toast/the nudges, this
        // overlay stays MOUNTED (and painted) at all times; the closed state
        // must actually hide it for every visitor, reduced-motion included.
        // Only the ANIMATION needs to skip for reduced motion, and the global
        // nuke at the bottom of globals.css already forces the transition
        // duration near-zero there — closed still means closed, just instant.
        className={`absolute inset-0 bg-ink-950 transition-opacity duration-slow ease-out ${open ? "opacity-100" : "opacity-0"}`}
      />

      {/* Content (click empty space to close) */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        onKeyDown={onKeyDown}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        // Same reasoning as the backdrop above — this panel is always
        // mounted, so its hidden state can't be motion-safe:-gated.
        // Below sm the panel enters from the bottom (a real sheet feel, matching
        // ui/Dialog's own placement="sheet") rather than the subtle lift+fade
        // larger screens get — translate-y-6, overridden back to -3 at sm:.
        // pb-[max(1rem,env(...))] keeps both the 16px gutter and the last row
        // clear of a notched phone's home indicator, same reasoning as
        // ui/Dialog's own safe-area padding. 2026-09-23: it was a bare
        // pb-[env(...)], which overrode p-4's bottom and evaluated to 0 on
        // most phones, so the panel ran flush into the viewport's bottom edge.
        // overscroll-contain stops a scroll past either end of the menu from
        // chaining to the (scroll-locked) page behind it.
        className={`absolute inset-0 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-all duration-slow ease-out sm:p-8 ${open ? "cine-open scale-100 opacity-100 translate-y-0" : "scale-[0.98] opacity-0 translate-y-6 sm:translate-y-3"}`}
      >
        {/* The middle panel — flat, bordered. */}
        <div className="relative mx-auto my-auto max-w-5xl">
          <div className="relative rounded-lg border border-ink-800 bg-ink-900 p-5 sm:p-8">
            {/* Top bar — sticky (2026-09-23). The menu is a ~4,100px sheet on a
                phone and this bar holds its only Close control, which used to
                scroll away (y=-3245 at the end of the list on a 390x844).
                The negative offsets cancel the scroller's p-4/sm:p-8 and this
                panel's p-5/sm:p-8 so the bar sticks flush at the viewport top;
                nothing inside the menu sets a z-index, so z-10 is enough. */}
            <div className="sticky -top-4 z-10 -mx-5 -mt-5 flex items-center justify-between gap-4 rounded-t-lg border-b border-ink-800 bg-ink-900 px-5 pb-3 pt-5 sm:-top-8 sm:-mx-8 sm:-mt-8 sm:px-8 sm:pb-4 sm:pt-8">
              <Link href="/" onClick={close} className="flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
                <BrandLogo />
                <span className="font-display text-lg font-extrabold text-white">
                  MTG<span className="text-brand-400">Compare</span>
                </span>
              </Link>
              {/* The market switcher, below 360px only: under that the header
                  row cannot fit it (Navbar.tsx), so it lands here, one tap
                  away. The exact complement of the header's min-[360px]:block. */}
              <CountrySwitcher className="ml-auto min-[360px]:hidden" anchored />
              <button
                type="button"
                data-autofocus
                onClick={close}
                aria-label="Close menu"
                className="rounded-md border border-ink-800 bg-ink-850 px-3 py-2 text-sm font-bold text-white outline-none transition-colors hover:border-ink-600 hover:bg-ink-800 focus-visible:ring-2 focus-visible:ring-brand-400 min-h-11"
              >
                Close ✕
              </button>
            </div>

            {/* ONE box, both kinds of answer. It filters the feature grid below
                AND searches the card/sealed database above it.
                This slot originally held the card SearchBar, which was reported
                as broken ("it acts like a normal search bar and searches all the
                cards") because on a phone this overlay IS the Explore menu and
                the input sat directly above a grid of features it did not
                filter. Making it a pure feature filter then drew the opposite
                report: it is the search box people find on a phone, and a card
                name typed into it returned only pages. So it now does both, and
                neither report is re-opened by fixing the other. */}
            <div className="mx-auto mt-4 max-w-2xl">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search cards, sealed, features…"
                aria-label="Search MTG Compare cards, sealed products and features"
                className="input w-full"
                type="search"
              />
              {filtering && (
                <p className="mt-2 text-center text-xs text-slate-500">
                  {sections.reduce((n, s2) => n + s2.links.length, 0)} feature
                  {sections.reduce((n, s2) => n + s2.links.length, 0) === 1 ? "" : "s"} match &ldquo;{filter}&rdquo;
                </p>
              )}

              {/* Database matches, above the feature grid: someone typing a card
                  name wants the card, and on a phone anything below the fold is
                  effectively absent. */}
              {(cardHits.length > 0 || sealedHits.length > 0) && (
                <div className="mt-4 rounded-lg border border-ink-800 bg-ink-900/60 p-2 text-left">
                  {cardHits.length > 0 && (
                    <>
                      <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Cards
                      </div>
                      <ul>
                        {cardHits.map((c) => (
                          <li key={c.id}>
                            <Link
                              href={`/card/${c.slug}`}
                              onClick={close}
                              className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-2 text-sm text-slate-200 outline-none transition-colors hover:bg-ink-800 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-400"
                            >
                              <span className="min-w-0 truncate font-semibold">{c.name}</span>
                              <span className="shrink-0 text-[11px] text-slate-500">
                                {c.setCode} {c.collectorNumber}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {sealedHits.length > 0 && (
                    <>
                      <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Sealed
                      </div>
                      <ul>
                        {sealedHits.map((s2) => (
                          <li key={s2.groupKey}>
                            <Link
                              href={`/sealed/${s2.slug}`}
                              onClick={close}
                              className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-2 text-sm text-slate-200 outline-none transition-colors hover:bg-ink-800 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-400"
                            >
                              <span className="min-w-0 truncate font-semibold">{s2.name}</span>
                              <span className="shrink-0 text-[11px] text-slate-500">{s2.productType}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <Link
                    href={`/browse?q=${encodeURIComponent(filter)}`}
                    onClick={close}
                    className="flex min-h-11 items-center justify-center rounded-md px-2 py-2 text-xs font-semibold text-brand-400 outline-none transition-colors hover:bg-ink-800 focus-visible:ring-2 focus-visible:ring-brand-400"
                  >
                    See all results for &ldquo;{filter}&rdquo; →
                  </Link>
                </div>
              )}
              {/* Only while a search is genuinely outstanding AND nothing is on
                  screen yet, so results never flicker to "Searching…" mid-type. */}
              {searching && cardHits.length === 0 && sealedHits.length === 0 && filter.trim().length >= 2 && (
                <p className="mt-3 text-center text-xs text-slate-500">Searching cards and sealed…</p>
              )}
              {/* Light/dark switch — the phone home for the control the header
                  shows from sm up (ThemeToggle.tsx). Below lg only: from lg the
                  header's own icon is visible, and two switches in view at
                  once would be one too many. */}
              <div className="mt-3 lg:hidden">
                <ThemeToggle variant="row" />
              </div>
            </div>

            {/* The gold Premium spotlight that sat here (2026-09-10 → 09-28) is
                gone: the owner moved every upgrade prompt to where a free
                account hits a limit, "not in popups and headers". /premium
                stays in this menu as the Premium entry of NAV_GROUPS. */}

            {/* Every category, always — no curated "Popular" subset and no
                "Show all features" gate in front of it any more (2026-09-16).
                Both existed because of an earlier report ("we don't need
                everything to show up... have a subset of the most used
                features and have a way for them to look at all features only
                if they want to"), but that Popular subset was ALWAYS a
                duplicate of the exact same links' entries in the full grid
                below (it was a filter() over NAV_GROUPS, not a separate
                list) — every visitor saw each popular link twice,
                once flat and once inside its category. Reported directly,
                reversing the earlier call: "we don't even need the see all
                features anymore... they can just scroll down and look at all
                the features." Scrolling now shows the one copy of everything
                there is. */}
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sections.map((sec, si) => (
                <div
                  key={sec.title}
                  className="cine-item relative overflow-hidden rounded-lg border border-ink-800 border-l-2 border-l-brand-500 bg-ink-850 p-4"
                  style={{ "--cine-delay": `${si * 70}ms` } as CSSProperties}
                >
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">
                    {sec.icon && <NavIcon name={sec.icon} className="h-3.5 w-3.5 text-brand-400" />}
                    {sec.title}
                  </div>
                  <ul className="space-y-0.5">
                    {sec.links.map((l) => (
                      <li key={l.href}>
                        <FeatureLink l={l} pathname={pathname} onClick={close} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
