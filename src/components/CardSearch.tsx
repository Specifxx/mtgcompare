"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ebayLabel, ebaySearchUrl, magicEbayQuery, outboundRel } from "@/lib/affiliate";
import { clearRecent, pushRecentSearch, RECENT_SEARCHES_KEY, useRecentCards, useRecentSearches } from "@/lib/recently-viewed";
import CardQuickLink from "./CardQuickLink";
import { sendCardView } from "@/lib/card-views";
import { useCountry } from "./CountryProvider";
import { Icon } from "./Icon";
import { RecentlyViewed } from "./RecentlyViewed";

interface Hit {
  id?: number;
  slug: string;
  name: string;
  number: string | null;
  variant: string | null;
  set: string;
  img: string | null;
  price: string;
  kind: "card" | "sealed";
}

// Baymard's autocomplete rule, as on RiftCompare: at most 10 rows on a desktop,
// 6 on a phone, and never a scrollbar inside the dropdown in the common case.
const DESKTOP_CAP = 10;
const MOBILE_CAP = 6;

function useCap(): number {
  const [cap, setCap] = useState(DESKTOP_CAP);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setCap(mq.matches ? MOBILE_CAP : DESKTOP_CAP);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return cap;
}

// Bold only the part the visitor has NOT typed yet (RiftCompare/Baymard).
function Highlight({ label, query }: { label: string; query: string }) {
  const q = query.trim().toLowerCase();
  const i = q ? label.toLowerCase().indexOf(q) : -1;
  if (i === -1) return <>{label}</>;
  const end = i + q.length;
  return (
    <>
      {label.slice(0, end)}
      <strong className="font-bold text-white">{label.slice(end)}</strong>
    </>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function isVisible(el: HTMLElement): boolean {
  if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return false;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

// The card search (RiftCompare's SearchBar): an instant dropdown with art, the
// printing, set · number and the visitor's market price; arrow keys, Enter and
// Esc; "/" focuses whichever box is on screen. Empty, it offers recent searches
// and recently viewed cards. A card row opens QuickView (CardQuickLink); Enter
// on the typed text, or "See all results", opens /browse?q=. No match offers
// "Did you mean" names and an affiliate eBay search for the typed words.
/** What `onPick` receives: a card row of the dropdown (pick mode). */
export interface SearchCard {
  id: number;
  slug: string;
  name: string;
}

// `onPick` (wave 2, RiftCompare's CardSearch onPick — the welcome checklist's
// "Watch a card"): a card row CHOOSES the card instead of opening it, and the
// sealed rows and "See all results" are left out.
export function CardSearch({
  size = "md",
  placeholder = "Search for cards",
  autoFocus = false,
  onPick,
}: {
  size?: "md" | "lg";
  placeholder?: string;
  autoFocus?: boolean;
  onPick?: (card: SearchCard) => void;
}) {
  const { country } = useCountry();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [suggest, setSuggest] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [maxH, setMaxH] = useState(420);
  const recentSearches = useRecentSearches();
  const recentCards = useRecentCards();
  const cap = useCap();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const uid = useId();
  const listId = `search-list-${uid}`;
  const optionId = (i: number) => `search-opt-${uid}-${i}`;

  // ?q= prefill after mount (reading it during render would bail the header out
  // of static rendering, RiftCompare's 2026-09-22 lesson).
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("q");
    if (v && window.location.pathname === "/browse") setQ(v);
  }, []);

  // "/" focuses the box that is actually on screen (two or three are mounted).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = document.activeElement as HTMLElement | null;
      if (t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable)) return;
      const el = input.current;
      if (!el || !isVisible(el)) return;
      // The hero box wins over the header box while both are visible.
      if (size === "md" && [...document.querySelectorAll<HTMLInputElement>("input[data-search-size='lg']")].some(isVisible)) return;
      e.preventDefault();
      el.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [size]);

  // Debounced, abortable fetch.
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) {
      setHits([]);
      setTotal(0);
      setSuggest([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(s)}`, { signal: ctrl.signal });
        if (r.ok) {
          const data = await r.json();
          setHits(data.hits ?? []);
          setTotal(data.total ?? 0);
          setSuggest(Array.isArray(data.suggest) ? data.suggest : []);
          setActive(-1);
        }
        setLoading(false);
      } catch {
        /* aborted: the next keystroke's fetch owns the state */
      }
    }, 160);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) {
        setOpen(false);
        setActive(-1);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Fit the list to the space left under the box (the visual viewport, so a
  // phone keyboard is accounted for); scrolling inside is the rare fallback.
  useEffect(() => {
    if (!open) return;
    const fit = () => {
      if (!box.current) return;
      const vv = window.visualViewport;
      const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      setMaxH(Math.max(160, Math.min(520, bottom - box.current.getBoundingClientRect().bottom - 24)));
    };
    fit();
    const vv = window.visualViewport;
    window.addEventListener("resize", fit);
    window.addEventListener("scroll", fit, true);
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("scroll", fit, true);
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
    };
  }, [open]);

  const trimmed = q.trim();
  const zero = trimmed.length < 2;
  const cards = useMemo(() => hits.filter((h) => h.kind === "card").slice(0, cap), [hits, cap]);
  const sealed = useMemo(
    () => (onPick ? [] : hits.filter((h) => h.kind === "sealed").slice(0, Math.max(0, Math.min(3, cap - cards.length)))),
    [hits, cap, cards.length, onPick],
  );
  const rows: Hit[] = useMemo(() => [...cards, ...sealed], [cards, sealed]);
  const recent = recentSearches.slice(0, MOBILE_CAP);
  const count = zero ? recent.length : rows.length;
  const hasZeroContent = recent.length > 0 || recentCards.length > 0;
  const show = open && (zero ? hasZeroContent : true);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const commit = (term: string, newTab = false) => {
    const t = term.trim();
    if (!t) return;
    // Pick mode: Enter chooses the first card rather than leaving the page.
    if (onPick) {
      const first = rows.findIndex((r) => r.kind === "card");
      if (first >= 0) activate(first, false);
      return;
    }
    pushRecentSearch(t);
    const href = `/browse?q=${encodeURIComponent(t)}`;
    if (newTab) {
      window.open(href, "_blank", "noopener");
      return;
    }
    close();
    input.current?.blur();
    setQ(t);
    router.push(href);
  };

  const activate = (i: number, newTab: boolean) => {
    if (zero) {
      const term = recent[i];
      if (term) {
        setQ(term);
        commit(term, newTab);
      }
      return;
    }
    const h = rows[i];
    if (!h) return;
    if (onPick && h.kind === "card" && h.id != null) {
      close();
      setQ("");
      onPick({ id: h.id, slug: h.slug, name: h.name });
      return;
    }
    const href = h.kind === "card" ? `/card/${h.slug}` : `/sealed/${h.slug}`;
    if (newTab) {
      window.open(href, "_blank", "noopener");
      return;
    }
    // A plain click on the row's own link: CardQuickLink opens QuickView when
    // it is mounted, and navigates otherwise.
    const a = document.getElementById(optionId(i))?.querySelector("a");
    close();
    if (a) a.click();
    else router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        close();
      } else input.current?.blur();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!open) setOpen(true);
      if (!count) return;
      e.preventDefault();
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % count : a <= 0 ? count - 1 : a - 1));
      return;
    }
    if (e.key === "Enter" && open && active >= 0 && active < count) {
      e.preventDefault();
      activate(active, e.metaKey || e.ctrlKey || e.shiftKey);
    }
    // Enter with nothing arrowed-to submits the form: the full results page.
  };

  const activeLabel = active >= 0 ? (zero ? recent[active] : rows[active]?.name) : undefined;
  const big = size === "lg";
  const rowCls = (on: boolean) => `flex items-center gap-3 px-3 py-2 ${on ? "bg-ink-800 ring-1 ring-inset ring-brand-500/50" : "hover:bg-ink-800"}`;
  const ebayHref = ebaySearchUrl(country, magicEbayQuery(trimmed), "search-no-results");

  return (
    <div ref={box} className="relative w-full">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          commit(q);
        }}
      >
        <label className="relative block">
          <span className="sr-only">{placeholder}</span>
          <Icon name="search" className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-500 ${big ? "left-4 h-5 w-5" : "left-3 h-4 w-4"}`} />
          <input
            ref={input}
            data-search-size={size}
            value={activeLabel ?? q}
            autoFocus={autoFocus}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onFocus={() => {
              setFocused(true);
              setOpen(true);
            }}
            onBlur={(e) => {
              setFocused(false);
              // Tabbing out of the box closes the list (a click elsewhere is the
              // mousedown listener's job; a click on a row keeps focus inside).
              const to = e.relatedTarget as Node | null;
              if (to && box.current && !box.current.contains(to)) close();
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            role="combobox"
            aria-expanded={show}
            aria-haspopup="listbox"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            className={`w-full rounded-md border border-ink-700 bg-ink-900 text-slate-100 outline-none placeholder:text-slate-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/40 focus-visible:border-brand-500 ${
              big ? "h-14 pl-12 pr-12 text-lg" : "h-11 pl-9 pr-11 text-base sm:text-sm"
            }`}
          />
          {!q && !focused ? (
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-ink-600 px-1.5 font-mono text-xs text-slate-400 sm:block" aria-hidden="true">
              /
            </kbd>
          ) : null}
        </label>
        {focused || q ? (
          <button
            type="button"
            aria-label="Clear and close search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQ("");
              close();
              input.current?.blur();
            }}
            className={`absolute top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-ink-800 hover:text-white ${big ? "right-2.5" : "right-1"}`}
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        ) : null}
      </form>

      {show ? (
        <div className={`absolute left-0 right-0 z-dropdown mt-1 overflow-hidden rounded-lg border border-ink-700 bg-ink-900 text-left shadow-glow ${big ? "" : "xl:min-w-[26rem]"}`}>
          {zero ? (
            <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: maxH }}>
              {recent.length ? (
                <ul id={listId} role="listbox" aria-label="Recent searches" className="py-1">
                  <li role="presentation" className="flex items-center justify-between px-3 pb-1 pt-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recent searches</span>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => clearRecent(RECENT_SEARCHES_KEY)}
                      className="text-[11px] font-medium text-slate-500 hover:text-white"
                    >
                      Clear
                    </button>
                  </li>
                  {recent.map((term, i) => (
                    <li key={term} id={optionId(i)} role="option" aria-selected={active === i}>
                      <button
                        type="button"
                        tabIndex={-1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setQ(term);
                          commit(term);
                        }}
                        className={`w-full text-left ${rowCls(active === i)}`}
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-850 text-slate-500">
                          <ClockIcon />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{term}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <RecentlyViewed className={`px-3 py-2.5 ${recent.length ? "border-t border-ink-800" : ""}`} onNavigate={close} />
            </div>
          ) : rows.length === 0 ? (
            <div>
              <p className="px-4 py-3 text-sm text-slate-400" role="status">
                {loading ? "Searching…" : `No cards match “${trimmed}” — press Enter to search anyway.`}
              </p>
              {!loading && suggest.length ? (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pb-2 text-sm text-slate-400">
                  <span>Did you mean</span>
                  {suggest.map((name, i) => (
                    <span key={name}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setQ(name);
                          input.current?.focus();
                        }}
                        className="min-h-9 font-semibold text-brand-400 hover:underline"
                      >
                        {name}
                      </button>
                      {i < suggest.length - 1 ? "," : "?"}
                    </span>
                  ))}
                </p>
              ) : null}
              {!loading ? (
                <div className="border-t border-ink-800 px-4 pb-2.5 pt-1">
                  <a
                    href={ebayHref}
                    target="_blank"
                    rel={outboundRel()}
                    data-retailer="ebay_search"
                    data-page="search"
                    className="block min-h-11 py-3 text-sm font-semibold text-sky-300 [overflow-wrap:anywhere] hover:underline"
                  >
                    Search {ebayLabel(country)} for “{trimmed}” →
                  </a>
                  <p className="text-[11px] leading-snug text-slate-500">Paid link: we may earn a commission from eBay at no cost to you.</p>
                </div>
              ) : null}
            </div>
          ) : (
            <ul id={listId} role="listbox" aria-label="Search suggestions" className="overflow-y-auto overscroll-contain py-1" style={{ maxHeight: maxH }}>
              {rows.map((h, i) => {
                const firstSealed = h.kind === "sealed" && (i === 0 || rows[i - 1].kind !== "sealed");
                const inner = (
                  <>
                    {h.img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.img} alt="" className={`h-12 w-9 shrink-0 rounded-sm bg-ink-800 ${h.kind === "card" ? "object-cover" : "object-contain"}`} loading="lazy" decoding="async" />
                    ) : (
                      <span className="h-12 w-9 shrink-0 rounded-sm bg-ink-800" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span data-card-name className="block truncate text-sm font-semibold text-slate-100">
                        <Highlight label={h.name} query={trimmed} />
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {h.variant ? <span className="text-slate-400">{h.variant} · </span> : null}
                        {h.set}
                        {h.number ? ` · ${h.number}` : ""}
                      </span>
                    </span>
                    <span className="num shrink-0 text-sm font-semibold text-accent">{h.price}</span>
                  </>
                );
                return (
                  <li key={`${h.kind}-${h.slug}`} role="presentation">
                    {firstSealed ? <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sealed products</p> : null}
                    {/* Close in the bubble phase, after the row's own link has handled the
                        click: a capture-phase close unmounts the list before
                        CardQuickLink's onClick runs, and the browser then
                        follows the href instead of opening QuickView. */}
                    <div id={optionId(i)} role="option" aria-selected={active === i} onClick={() => { if (h.kind === "card") sendCardView(h.slug, "search"); close(); }}>
                      {onPick && h.kind === "card" ? (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => activate(i, false)}
                          className={`w-full text-left ${rowCls(active === i)}`}
                        >
                          {inner}
                        </button>
                      ) : h.kind === "card" ? (
                        <CardQuickLink slug={h.slug} className={rowCls(active === i)}>
                          {inner}
                        </CardQuickLink>
                      ) : (
                        <Link href={`/sealed/${h.slug}`} prefetch={false} className={rowCls(active === i)}>
                          {inner}
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
              {onPick ? null : (
              <li role="presentation" className="border-t border-ink-800">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit(q)}
                  className="block w-full px-4 py-2.5 text-left text-sm font-medium text-brand-400 hover:bg-ink-800"
                >
                  See all {total > rows.filter((r) => r.kind === "card").length ? `${total} ` : ""}results for “{trimmed}” →
                </button>
              </li>
              )}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
