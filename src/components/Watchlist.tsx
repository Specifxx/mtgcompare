"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CardArt, CardTile } from "./CardTile";
import { PriceWatchButton } from "./PriceWatchButton";
import { TargetPriceField } from "./TargetPriceField";
import { useCountry } from "./CountryProvider";
import CardQuickLink from "./CardQuickLink";
import { Sparkline } from "./Sparkline";
import { Delta, PrintingBadge } from "./ui";
import { NavIcon } from "./NavIcon";
import { useWatchlist, watchlistStore, LOCAL_WATCHLIST_EVENT, LOCAL_WATCHLIST_KEY } from "@/lib/use-watchlist";
import { useMe } from "@/lib/use-me";
import { targetAlertLimit } from "@/lib/alert-limits";
import { freeLimitCounterText, showFreeLimitCounter } from "@/lib/free-limits";
import { honouredTargetIds } from "@/lib/target-price";
import { watchBaseline, watchChips } from "@/lib/watch-baseline";
import { headline } from "@/lib/price";
import { money } from "@/lib/format";
import type { Country } from "@/lib/country";
import type { CardLite } from "@/lib/data";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonTile } from "./ui/Skeleton";

// The body of /watching and of the header drawer — RiftCompare's Watchlist,
// ported in wave 2 (2026-10-03).
//
// THE REMOVE CONTROL IS THE TILE'S OWN HEART. Clicking it unwatches, which
// updates the shared watched-Set (lib/use-watchlist.ts), which filters the card
// out of the list below — no refetch, no router refresh.
//
// TWO LAYOUTS: `grid` is the /watching page (CardTiles, 2/3/4 columns);
// `list` is the 448px drawer, one wide row per card with the heart in a column
// of its own (a grid there gave four 90px columns on every desktop).
//
// SIGNED OUT (OP Compare): the list saved in this browser (localStorage),
// priced by /api/watchlist from the cached catalogue — RiftCompare has no
// signed-out list (its heart asks for an email instead).
//
// LIVE CHIPS (OP Compare): while email is off an alert is delivered in-app, so
// each row says "At your target" or "New low since you started", computed
// from the same cached price the row shows (lib/watch-baseline.ts watchChips).
// The snooze chip and the pause banner exist only once email is on.
interface WatchItem {
  id: string;
  cardId: number;
  market: string;
  lastPriceCents: number | null;
  startPriceCents: number | null;
  targetCents: number | null;
  snoozedUntil?: string | null;
  createdAt: string;
  card: CardLite & { setCode: string };
}

/** The viewer's buyable price for a card (a listing), or null. */
function priceNow(card: CardLite, country: Country): number | null {
  const h = headline(card, country);
  return h.kind === "listing" ? h.cents : null;
}

export function Watchlist({
  layout = "grid",
  onNavigate,
}: {
  layout?: "grid" | "list";
  /** Called when a row is followed to its card page — the drawer passes its own close. */
  onNavigate?: () => void;
} = {}) {
  const { me, loaded: meLoaded } = useMe();
  if (meLoaded && !me.user) return <LocalWatchlist layout={layout} onNavigate={onNavigate} />;
  if (!meLoaded) return <WatchlistSkeleton layout={layout} />;
  return <AccountWatchlist layout={layout} onNavigate={onNavigate} />;
}

function WatchlistSkeleton({ layout }: { layout: "grid" | "list" }) {
  if (layout === "list") {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading your watchlist">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card-surface flex gap-3 p-3">
            <Skeleton className="aspect-[5/7] w-24 shrink-0 rounded-md" />
            <div className="flex flex-1 flex-col gap-2 py-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="mt-auto h-6 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4" role="status" aria-label="Loading your watchlist">
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonTile key={i} />
      ))}
    </div>
  );
}

function AccountWatchlist({ layout, onNavigate }: { layout: "grid" | "list"; onNavigate?: () => void }) {
  const { country } = useCountry();
  const { watched } = useWatchlist();
  const { me, loaded: meLoaded } = useMe();
  const premium = me.tier != null;
  const [items, setItems] = useState<WatchItem[] | null>(null);
  // Alert emails paused for this address (AlertMute) — null = unknown.
  const [paused, setPaused] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/alerts/watchlist", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: WatchItem[]; paused?: boolean | null }) => {
        if (!cancelled) {
          setItems(d.items ?? []);
          setPaused(d.paused ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (items === null) return <WatchlistSkeleton layout={layout} />;

  // Once the shared set has loaded it is the source of truth for what is still
  // watched — that is what makes an unwatch remove the tile instantly.
  const visible = watched ? items.filter((it) => watched.has(it.cardId)) : items;
  const targetsUsed = visible.filter((it) => it.targetCents != null).length;
  const watchedCards = new Set(visible.map((it) => it.cardId)).size;
  const honoured = honouredTargetIds(visible, premium ? targetAlertLimit(me.tier) : 0);
  const targetActive = (it: WatchItem) => it.targetCents == null || honoured.has(it.id);
  const onTargetSaved = (id: string, cents: number | null) =>
    setItems((prev) => (prev ? prev.map((it) => (it.id === id ? { ...it, targetCents: cents } : it)) : prev));

  if (visible.length === 0) {
    return (
      <EmptyState
        icon="heart"
        title="Nothing on watch yet"
        body={
          me.emailOn
            ? "Tap the heart on any card and we'll email you when it hits a new low, naming the cheapest store — at most one email a week."
            : "Tap the heart on any card to keep it here with today's cheapest price. A new low is flagged on this list and on your dashboard."
        }
        primary={{ href: "/browse", label: "Card database →" }}
      />
    );
  }

  return (
    <>
      {me.emailOn ? <PauseBanner paused={paused} onChange={setPaused} /> : null}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <p className="text-sm text-slate-400">
          <span className="num font-semibold text-white">{visible.length}</span> {visible.length === 1 ? "card" : "cards"} · newest first
          {/* The quiet free-limit counter: distinct cards, only once a free
              account is close. The upgrade itself is offered by the heart. */}
          {meLoaded && showFreeLimitCounter("watchlist", watchedCards, premium) && (
            <span className="text-slate-500"> · {freeLimitCounterText("watchlist", watchedCards)}</span>
          )}
        </p>
        <p className="text-xs text-slate-500">Tap a card&apos;s heart to stop watching it</p>
      </div>
      {/* Buy this list (Best Basket reads the watchlist server-side for the
          viewer's market — nothing is passed in the URL). */}
      <Link
        href="/tools/best-basket?source=watchlist"
        prefetch={false}
        onClick={onNavigate}
        className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand-400 hover:underline"
      >
        Price my watchlist, delivered →
      </Link>

      {layout === "list" ? (
        <ul className="flex flex-col gap-3">
          {visible.map((it) => (
            <WatchRow
              key={it.id}
              item={it}
              onNavigate={onNavigate}
              targetsUsed={targetsUsed}
              targetActive={targetActive(it)}
              snooze={me.emailOn}
              onTargetSaved={(cents) => onTargetSaved(it.id, cents)}
            />
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {visible.map((it) => {
            const now = priceNow(it.card, country);
            const { label, text, delta } = watchBaseline(it, country, now);
            const chips = watchChips(it, country, now);
            return (
              // A three-row grid: the tile fills the first (1fr) track and the
              // two lines below keep their own space (RiftCompare QA 2026-09-25).
              <div key={it.id} className="grid grid-rows-[1fr_auto_auto]">
                <CardTile card={it.card} setCode={it.card.setCode} country={country} />
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                  <BaselineLine label={label} text={text} delta={delta} />
                  {it.market !== country && <span className="chip px-1.5 py-0 text-[10px]">{it.market}</span>}
                  <AlertChips {...chips} />
                  {me.emailOn ? <SnoozeNote until={it.snoozedUntil} /> : null}
                </div>
                <TargetPriceField
                  cardId={it.cardId}
                  cardName={it.card.name}
                  market={it.market}
                  initialCents={it.targetCents}
                  used={targetsUsed}
                  active={targetActive(it)}
                  onSaved={(cents) => onTargetSaved(it.id, cents)}
                  className="mt-2"
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function BaselineLine({ label, text, delta }: { label: string; text: string | null; delta: number | null }) {
  return (
    <>
      {text != null ? (
        <span>
          {label} <span className="num text-slate-400">{text}</span>
        </span>
      ) : (
        <span>no price when you started</span>
      )}
      {delta != null && delta !== 0 && (
        <span className={`num font-semibold ${delta < 0 ? "text-up" : "text-down"}`}>
          {delta < 0 ? "↓" : "↑"} {Math.abs(delta)}%
        </span>
      )}
    </>
  );
}

function AlertChips({ atTarget, newLow }: { atTarget: boolean; newLow: boolean }) {
  return (
    <>
      {atTarget && <span className="chip border border-up/40 bg-up/10 px-1.5 py-0 text-[10px] font-semibold text-up">At your target</span>}
      {newLow && !atTarget && <span className="chip border border-up/40 bg-up/10 px-1.5 py-0 text-[10px] font-semibold text-up">New low since you started</span>}
    </>
  );
}

// One watched card as a full-width row, for the drawer. THE HEART HAS A
// COLUMN OF ITS OWN: a flex sibling of the row's link, so nothing can be laid
// on top of it and toggling it never follows the link.
function WatchRow({
  item,
  onNavigate,
  targetsUsed,
  targetActive,
  snooze,
  onTargetSaved,
}: {
  item: WatchItem;
  onNavigate?: () => void;
  targetsUsed: number;
  targetActive: boolean;
  snooze: boolean;
  onTargetSaved: (cents: number | null) => void;
}) {
  const { country } = useCountry();
  const card = item.card;
  const now = priceNow(card, country);
  const h = headline(card, country);
  const { label, text, delta } = watchBaseline(item, country, now);
  const chips = watchChips(item, country, now);

  return (
    <li className="card-surface p-3 transition-colors hover:border-ink-600">
      <div className="flex items-start gap-3">
        <Link
          href={`/card/${card.slug}`}
          prefetch={false}
          onClick={onNavigate}
          className="flex min-w-0 flex-1 gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <div className="relative aspect-[5/7] w-24 shrink-0 overflow-hidden rounded-md bg-ink-900">
            <CardArt id={card.id} hasImage={card.hasImage} alt="" size="thumb" className="h-full w-full" />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="line-clamp-3 text-base font-semibold leading-snug text-white" title={card.name}>
              {card.name}
            </h3>
            <p className="text-xs text-slate-500">
              {card.setCode}
              {card.number ? ` · ${card.number}` : ""}
            </p>
            <div className="flex flex-wrap gap-1 empty:hidden">
              <PrintingBadge printing={card.printing} variant={card.variant} />
            </div>

            <div className="mt-auto pt-1">
              {h.kind === "listing" ? (
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="num text-xl font-bold leading-tight text-accent">{money(h.cents, country)}</span>
                  {h.stores > 0 && (
                    <span className="text-xs font-semibold text-brand-400">
                      {h.stores} {h.stores === 1 ? "store" : "stores"}
                    </span>
                  )}
                </p>
              ) : h.kind === "reference" ? (
                <p className="text-sm font-medium text-slate-400">
                  <span className="num">≈ {money(h.cents, country)}</span> <span className="text-xs text-slate-500">TCGplayer market</span>
                </p>
              ) : (
                <p className="text-sm font-medium text-slate-500">No price yet</p>
              )}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                <BaselineLine label={label} text={text} delta={delta} />
                {item.market !== country && <span className="chip px-1.5 py-0 text-[10px]">{item.market}</span>}
                <AlertChips {...chips} />
                {snooze ? <SnoozeNote until={item.snoozedUntil} /> : null}
              </p>
            </div>
          </div>
        </Link>

        <div className="shrink-0">
          <PriceWatchButton cardId={card.id} slug={card.slug} name={card.name} />
        </div>
      </div>
      {/* Below the row, outside its link: an input inside a link would follow
          the link on every tap. */}
      <TargetPriceField
        cardId={card.id}
        cardName={card.name}
        market={item.market}
        initialCents={item.targetCents}
        used={targetsUsed}
        active={targetActive}
        onSaved={(cents) => onTargetSaved(cents)}
        className="mt-3 border-t border-ink-800 pt-3"
      />
    </li>
  );
}

// "Emails snoozed until 25 Oct" — an alert email's per-card Snooze 30 days.
// Shown only once email is on (nothing can snooze an email that never sends).
function SnoozeNote({ until }: { until?: string | null }) {
  if (!until) return null;
  const d = new Date(until);
  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return null;
  return (
    <span className="chip px-1.5 py-0 text-[10px]" title="Snoozed from an alert email: still checked, not emailed until then">
      emails snoozed until {d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
    </span>
  );
}

// "Pause alert emails" for the whole address (AlertMute), with the watchlist
// kept. Rendered only while email is on (POST /api/alerts/pause is the
// collection-alerts track's).
function PauseBanner({ paused, onChange }: { paused: boolean | null; onChange: (p: boolean) => void }) {
  const [working, setWorking] = useState(false);
  if (paused == null) return null;
  const toggle = async () => {
    setWorking(true);
    try {
      const res = await fetch("/api/alerts/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !paused }),
      });
      if (res.ok) onChange(!paused);
    } finally {
      setWorking(false);
    }
  };
  if (paused) {
    return (
      <div className="card-surface mb-4 flex flex-wrap items-center justify-between gap-2 border-amber-500/40 p-3 text-sm text-slate-300">
        <span>
          <strong className="text-white">Alert emails paused.</strong> We still check every card here, but send no price-alert emails until you resume.
        </span>
        <button onClick={toggle} disabled={working} className="btn-primary min-h-11">
          {working ? "Resuming…" : "Resume"}
        </button>
      </div>
    );
  }
  return (
    <div className="mb-2 flex justify-end">
      <button onClick={toggle} disabled={working} className="min-h-11 text-xs text-slate-500 underline hover:text-slate-300">
        {working ? "Pausing…" : "Pause alert emails (keep this list)"}
      </button>
    </div>
  );
}

// ── Signed out: the list saved in this browser ──────────────────────────────
interface LocalRow {
  kind: "card" | "sealed";
  slug: string;
  name: string;
  variant: string | null;
  sub: string;
  img: string | null;
  price: string;
  stores: number;
  change7d: number | null;
  spark: number[] | null;
}

interface LocalItem {
  slug: string;
  kind: "card" | "sealed";
  name: string;
  id?: number;
}

function readLocalItems(): LocalItem[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(LOCAL_WATCHLIST_KEY) || "[]");
    return Array.isArray(v) ? (v as LocalItem[]).filter((i) => i && typeof i.slug === "string") : [];
  } catch {
    return [];
  }
}

function writeLocalItems(items: LocalItem[]) {
  try {
    localStorage.setItem(LOCAL_WATCHLIST_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(LOCAL_WATCHLIST_EVENT));
  } catch {
    /* private mode */
  }
}

function useLocalItems(): LocalItem[] | null {
  const [items, setItems] = useState<LocalItem[] | null>(null);
  useEffect(() => {
    const sync = () => setItems(readLocalItems());
    sync();
    window.addEventListener(LOCAL_WATCHLIST_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LOCAL_WATCHLIST_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return items;
}

/**
 * Sealed products saved in this browser, for a signed-in account that is not
 * entitled to sealed watches (Plus): they stay local — never dropped — under
 * their own heading on /watching. Renders nothing when there are none.
 */
export function LocalSealedSection() {
  const all = useLocalItems();
  if (!all?.some((i) => i.kind === "sealed")) return null;
  return (
    <LocalWatchlist
      kinds={["sealed"]}
      wrap={(list) => (
        <section aria-labelledby="local-sealed-h" className="card-surface mt-8 p-5" data-local-sealed>
          <h2 id="local-sealed-h" className="font-display text-lg font-bold text-white">
            Sealed — saved in this browser
          </h2>
          <p className="mb-3 mt-1 text-xs text-slate-500">Kept on this device. Sealed watches that follow you and alert on a restock are part of Plus.</p>
          {list}
        </section>
      )}
    />
  );
}

/** The signed-out (localStorage) list — cards and sealed products — as rows. */
export function LocalWatchlist({
  layout = "list",
  onNavigate,
  kinds = ["card", "sealed"],
  wrap,
}: {
  layout?: "grid" | "list";
  onNavigate?: () => void;
  kinds?: ("card" | "sealed")[];
  /** Render only when something resolved, inside this frame (no empty state). */
  wrap?: (list: React.ReactNode) => React.ReactNode;
}) {
  const all = useLocalItems();
  const items = all?.filter((i) => kinds.includes(i.kind)) ?? null;
  const [rows, setRows] = useState<LocalRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const key = items?.map((w) => `${w.kind}:${w.slug}`).join(",") ?? null;

  useEffect(() => {
    if (key == null) return;
    if (!key) {
      setRows([]);
      return;
    }
    const list = key.split(",").map((k) => ({ kind: k.split(":")[0], slug: k.slice(k.indexOf(":") + 1) }));
    const ctrl = new AbortController();
    const cards = list.filter((w) => w.kind === "card").map((w) => w.slug).join(",");
    const sealed = list.filter((w) => w.kind === "sealed").map((w) => w.slug).join(",");
    fetch(`/api/watchlist?cards=${encodeURIComponent(cards)}&sealed=${encodeURIComponent(sealed)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { items: LocalRow[] }) => {
        // Keep the visitor's own order (newest watched first).
        const by = new Map<string, LocalRow>(d.items.map((r) => [`${r.kind}:${r.slug}`, r]));
        setRows(key.split(",").map((k) => by.get(k)).filter((r): r is LocalRow => Boolean(r)));
        setFailed(false);
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setFailed(true);
      });
    return () => ctrl.abort();
  }, [key]);

  const shown = rows?.filter((r) => items?.some((w) => w.slug === r.slug && w.kind === r.kind)) ?? null;
  if (failed && !shown?.length) return <p className="text-sm text-slate-400">Couldn&apos;t load prices just now. Try again in a moment.</p>;
  if (wrap && !shown?.length) return null;
  if (shown == null) return <WatchlistSkeleton layout="list" />;
  if (!shown.length) {
    return (
      <EmptyState
        icon="heart"
        title="Nothing on watch yet"
        body="Tap the heart on any card to keep it here, with today's cheapest price in your market."
        primary={{ href: "/browse", label: "Card database →" }}
      />
    );
  }

  const remove = (r: LocalRow) => {
    if (r.kind === "card") {
      void watchlistStore.unwatch({ id: -1, slug: r.slug });
      return;
    }
    writeLocalItems(readLocalItems().filter((w) => !(w.slug === r.slug && w.kind === r.kind)));
  };

  const list = (
    <ul className={`flex flex-col gap-3 ${layout === "grid" ? "sm:grid sm:grid-cols-2" : ""}`}>
      {shown.map((r) => {
        const body = (
          <>
            {r.img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.img} alt="" loading="lazy" className={`aspect-[5/7] w-16 shrink-0 rounded-md bg-ink-900 ${r.kind === "card" ? "object-cover" : "object-contain"}`} />
            ) : (
              <span className="aspect-[5/7] w-16 shrink-0 rounded-md bg-ink-900" />
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span data-card-name className="line-clamp-2 text-sm font-semibold leading-snug text-white">
                {r.name}
              </span>
              <span className="truncate text-xs text-slate-500">
                {r.variant ? <span className="text-slate-400">{r.variant} · </span> : null}
                {r.sub}
              </span>
              <span className="mt-auto flex flex-wrap items-baseline gap-x-2">
                <span className="num text-lg font-bold leading-tight text-accent">{r.price}</span>
                {r.change7d != null ? <Delta v={r.change7d} className="text-xs" /> : r.stores ? <span className="text-xs font-semibold text-brand-400">{r.stores} {r.stores === 1 ? "store" : "stores"}</span> : null}
              </span>
            </span>
          </>
        );
        const cls = "flex min-w-0 flex-1 gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";
        return (
          <li key={`${r.kind}-${r.slug}`} className="card-surface p-3 transition-colors hover:border-ink-600" onClick={(e) => (e.target as HTMLElement).closest("a") && onNavigate?.()}>
            <div className="flex items-start gap-3">
              {r.kind === "card" ? (
                <CardQuickLink slug={r.slug} className={cls}>
                  {body}
                </CardQuickLink>
              ) : (
                <Link href={`/sealed/${r.slug}`} prefetch={false} className={cls}>
                  {body}
                </Link>
              )}
              <div className="flex shrink-0 flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={() => remove(r)}
                  aria-label={`Stop watching ${r.name}`}
                  title="Stop watching"
                  className="tap-icon rounded-full border border-gold/60 bg-ink-950/80 text-gold"
                >
                  <NavIcon name="heart" className="h-4 w-4" fill="currentColor" />
                </button>
                <Sparkline values={r.spark} className="hidden h-7 w-16 min-[400px]:block" label={r.spark ? "30-day market price trend" : undefined} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
  return wrap ? <>{wrap(list)}</> : list;
}
