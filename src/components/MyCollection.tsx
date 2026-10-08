"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CONDITIONS, CONDITION_KEYS, infoCopyValueCents } from "@/lib/collection-conditions";
import { PRINTINGS } from "@/lib/constants";
import { QUANTITY_CAP } from "@/lib/collection-cost";
import { money } from "@/lib/format";
import { useCountry } from "./CountryProvider";
import { trackEvent } from "@/lib/analytics";
import { EmptyState } from "@/components/ui/EmptyState";
import { useMe } from "@/lib/use-me";
import { FREE_LIMIT_STATUS, freeLimitCounterText, parseFreeLimit, showFreeLimitCounter, type FreeLimitBody } from "@/lib/free-limits";
import type { Country } from "@/lib/country";
import { PortfolioLimitNotice as FreeLimitPanel } from "./PortfolioLimitNotice";

// "My Collection". A row is a UNIT: a product (Card.id, the TCGplayer productId)
// in a finish. Each row shows its treatment chip and a Normal / Foil switch when the
// product has both finishes (a Foil copy is valued at the Foil price, a product that
// has only one finish shows it as a fixed chip: lib/collection-server.ts
// collectionItems, track.ts normalizeFoil on every write). The search reads the
// header's /api/search, whose hits carry the card id.
type CollCard = {
  id: number;
  name: string;
  slug: string;
  setCode: string | null;
  number: string | null;
  variant: string | null;
  printing: string;
  rarity: string | null;
  img: string | null;
  hasN: boolean;
  hasF: boolean;
  foilLabel: string;
  marketN: number | null;
  marketF: number | null;
};
type Item = {
  id: string;
  cardId: number;
  condition: string;
  isFoil: boolean;
  quantity: number;
  costBasisCents: number | null;
  costBasisIsTotal: boolean;
  note: string | null;
  card: CollCard;
};

// A copy's value is infoCopyValueCents (lib/collection-conditions.ts): the finish's
// TCGplayer market price converted to the visitor's currency × the condition
// multiplier, rounded per copy — the exact rule getPortfolio values the /portfolio
// headline and holdings grid with (a list that skipped the multiplier disagreed with
// the headline above it by up to 60% for a played copy).

/** "Stingcaster Mage (Borderless · Facet Foil)". */
const shown = (c: { name: string; variant: string | null }) => `${c.name}${c.variant ? ` (${c.variant})` : ""}`;

/** The treatment chip a non-plain printing carries (Borderless, Extended Art, Foil Etched…). */
export function PrintingChip({ printing }: { printing: string }) {
  if (printing === "standard") return null;
  const p = PRINTINGS[printing];
  if (!p) return null;
  return (
    <span className="chip inline-flex items-center gap-1 bg-ink-800 text-slate-300">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: p.dot }} />
      {p.label}
    </span>
  );
}

// How long to wait after the last edit before re-rendering the page around this
// list. A burst of +/− clicks becomes one server render (one getPortfolio read).
const PAGE_REFRESH_DEBOUNCE_MS = 1500;

// "My Collection" — a personal, valued list of cards the user owns. Separate from
// the wishlist (want) and decks (play). Populated by the "Add to collection" button
// in the card pop-up. Shows the live value of the whole collection.
//
// `refreshPage`: set on /portfolio, whose headline value, holdings grid and
// "Since you bought" panel are server-rendered from the same rows this list
// edits. Without it an edit here left them stale until a manual reload (typing a
// "paid" price never reached the P&L). /profile has nothing server-rendered that
// depends on the collection, so it leaves this off.
export function MyCollection({ refreshPage = false }: { refreshPage?: boolean } = {}) {
  const { country } = useCountry();
  const fmt = useCallback((c: number) => money(c, country), [country]);
  const unitOf = useCallback((it: Item) => infoCopyValueCents(it.card, it.isFoil, it.condition, country), [country]);
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changed = useCallback(() => {
    if (!refreshPage) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, PAGE_REFRESH_DEBOUNCE_MS);
  }, [refreshPage, router]);
  // Leaving the page cancels a pending refresh; there is nothing left to update.
  useEffect(() => {
    const timer = refreshTimer;
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const [items, setItems] = useState<Item[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    return fetch("/api/collection")
      .then((r) => {
        if (!r.ok) throw new Error("collection fetch failed");
        return r.json();
      })
      .then((d) => setItems(d.items ?? []))
      // A failed fetch must NOT read as "you own nothing" — that's indistinguishable
      // from a genuinely empty collection and would tell a real collector their
      // holdings vanished. Keep items unset and show a retry affordance instead.
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    if (!items) return { distinct: 0, total: 0, value: 0, priced: false };
    let total = 0, value = 0, priced = false;
    for (const it of items) {
      total += it.quantity;
      const unit = unitOf(it);
      if (unit != null) { value += unit * it.quantity; priced = true; }
    }
    return { distinct: items.length, total, value, priced };
  }, [items, unitOf]);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    try {
      const res = await fetch(`/api/collection/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) changed();
      if (data.merged) {
        const fresh = await fetch("/api/collection").then((r) => r.json()).catch(() => null);
        if (fresh?.items) setItems(fresh.items);
        return;
      }
      setItems((prev) => {
        if (!prev) return prev;
        if (data.deleted) return prev.filter((x) => x.id !== id);
        if (data.item) return prev.map((x) => (x.id === id ? { ...x, ...data.item } : x));
        return prev;
      });
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/collection/${id}`, { method: "DELETE" });
      setItems((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
      if (res.ok) changed();
    } finally {
      setBusy(null);
    }
  }

  // Re-pull the collection after an add/import (and the page around it).
  const refresh = useCallback(async () => {
    const fresh = await fetch("/api/collection").then((r) => r.json()).catch(() => null);
    if (fresh?.items) setItems(fresh.items);
    changed();
  }, [changed]);

  // The quiet free-limit counter (lib/free-limits.ts): distinct CARDS, the
  // unit the limit counts (a card in two conditions is one), and only once a
  // free account is close to the limit — never before.
  const { me, loaded: meLoaded } = useMe();
  const premium = me.tier != null;
  const distinctCards = items ? new Set(items.map((it) => it.cardId)).size : 0;
  const showCounter = meLoaded && items != null && showFreeLimitCounter("portfolio", distinctCards, premium);

  return (
    <div id="collection" className="card-surface mt-5 scroll-mt-header p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-white">My Collection</h2>
          <p className="text-sm text-slate-400">
            {loadError
              ? "Couldn't load your collection."
              : items == null
              ? "Loading…"
              : items.length === 0
              ? "Your collection is empty."
              : `${summary.distinct} ${summary.distinct === 1 ? "card" : "cards"} · ${summary.total} total${summary.priced ? ` · worth ~${fmt(summary.value)}` : ""}`}
          </p>
          {showCounter && <p className="mt-0.5 text-xs text-slate-500">{freeLimitCounterText("portfolio", distinctCards)}</p>}
        </div>
        <button onClick={() => setImporting((v) => !v)} className="btn-ghost shrink-0 text-sm">Import a list</button>
      </div>

      {/* Search any card and add it without leaving the page. */}
      <div className="mt-3">
        <CollectionSearch onAdded={refresh} />
      </div>

      {importing && <BulkImport onDone={refresh} />}

      {loadError && (
        <div role="alert" className="mt-4">
          <EmptyState
            bare
            icon="wrench"
            title="Something went wrong"
            body="It's still there, this page just couldn't reach it."
            primary={{ onClick: () => void load(), label: "Try again" }}
          />
        </div>
      )}

      {!loadError && items != null && items.length === 0 && (
        <EmptyState bare icon="collection" title="Nothing in your collection yet">
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
            Search a card above (or <span className="font-semibold text-brand-300">Import a list</span>) to start
            tracking what you own — we&apos;ll value the whole thing live as prices move. It&apos;s separate from any{" "}
            <Link href="/watchlist" className="text-brand-400 hover:underline">price watches</Link> you&apos;ve set.
          </p>
        </EmptyState>
      )}

      {items != null && items.length > 0 && (
        <ul className="mt-4 divide-y divide-ink-800">
          {items.map((it) => {
            const unit = unitOf(it);
            const cond = CONDITIONS[it.condition];
            return (
              <li key={it.id} className="flex items-center gap-3 py-3">
                <Link href={`/card/${it.card.slug}`} className="h-14 w-10 shrink-0 overflow-hidden rounded bg-ink-900">
                  {it.card.img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.card.img} alt={`${shown(it.card)} ${it.card.number ?? ""} Magic card`} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <Link href={`/card/${it.card.slug}`} className="block truncate text-sm font-semibold text-white hover:underline">
                    {shown(it.card)}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span>{it.card.setCode}{it.card.number ? ` · ${it.card.number}` : ""}</span>
                    <PrintingChip printing={it.card.printing} />
                    {it.isFoil && !(it.card.hasN && it.card.hasF) && <span className="chip bg-ink-800 text-slate-300">{it.card.foilLabel}</span>}
                    {unit != null && <span>· {fmt(unit)} ea</span>}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {/* The condition hue goes through .data-ink (globals.css), which
                        darkens it in the light theme: the raw hex measured ~1.8–3.3:1
                        on the light select (2026-09-23). The class is only added with
                        a known condition, because with --data-ink unset the colour
                        would inherit the row's slate instead of falling back to
                        text-white. Dark theme is unchanged: var(--data-ink) is the hex. */}
                    <select
                      value={it.condition}
                      onChange={(e) => patch(it.id, { condition: e.target.value })}
                      disabled={busy === it.id}
                      className={`rounded-md border border-ink-700 bg-ink-900 px-1.5 py-1 text-xs text-white${cond ? " data-ink" : ""}`}
                      style={cond ? ({ "--data-ink": cond.color } as CSSProperties) : undefined}
                      aria-label="Condition"
                    >
                      {CONDITION_KEYS.map((k) => (
                        <option key={k} value={k} className="bg-ink-900 text-white">{CONDITIONS[k].full}</option>
                      ))}
                    </select>
                    {/* The finish switch, only for a product that has both: the Foil
                        copy is its own price and its own history. A product with a
                        single finish is stored in it (normalizeFoil), so there is
                        nothing to switch. */}
                    {it.card.hasN && it.card.hasF && (
                      <div className="flex items-center overflow-hidden rounded-md border border-ink-700" role="group" aria-label="Finish">
                        <button onClick={() => !it.isFoil || patch(it.id, { isFoil: false })} disabled={busy === it.id} aria-pressed={!it.isFoil} className={`px-2 py-1 text-xs ${!it.isFoil ? "bg-brand-500/20 font-semibold text-brand-200" : "text-slate-400 hover:bg-ink-800"}`}>Normal</button>
                        <button onClick={() => it.isFoil || patch(it.id, { isFoil: true })} disabled={busy === it.id} aria-pressed={it.isFoil} className={`px-2 py-1 text-xs ${it.isFoil ? "bg-brand-500/20 font-semibold text-brand-200" : "text-slate-400 hover:bg-ink-800"}`}>{it.card.foilLabel}</button>
                      </div>
                    )}
                    <div className="flex items-center overflow-hidden rounded-md border border-ink-700">
                      <button onClick={() => patch(it.id, { quantity: Math.max(0, it.quantity - 1) })} disabled={busy === it.id} className="px-2 py-1 text-sm text-slate-300 hover:bg-ink-800" aria-label="Decrease quantity">−</button>
                      <span className="min-w-8 px-2 text-center text-sm font-semibold text-white">{it.quantity}</span>
                      <button onClick={() => patch(it.id, { quantity: Math.min(QUANTITY_CAP, it.quantity + 1) })} disabled={busy === it.id} className="px-2 py-1 text-sm text-slate-300 hover:bg-ink-800" aria-label="Increase quantity">+</button>
                    </div>
                    {/* Price paid — powers the Premium profit/loss view on /portfolio. */}
                    <CostInput
                      cents={it.costBasisCents}
                      isTotal={it.costBasisIsTotal}
                      quantity={it.quantity}
                      disabled={busy === it.id}
                      onSave={(cents, isTotal) => patch(it.id, { costBasisCents: cents, costBasisIsTotal: isTotal })}
                    />
                    <button onClick={() => remove(it.id)} disabled={busy === it.id} className="ml-auto text-xs text-slate-500 hover:text-red-400">Remove</button>
                  </div>
                </div>

                <div className="shrink-0 self-start text-right">
                  <div className="text-sm font-bold text-accent">{unit != null ? fmt(unit * it.quantity) : "—"}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// One /api/search hit (cards and sealed; only cards can be added).
type SearchCard = {
  kind: "card" | "sealed";
  id?: number;
  name: string;
  slug: string;
  number: string | null;
  variant: string | null;
  set: string;
  img: string | null;
};

// In-page card search: type a name, pick a result, and it's added to the collection
// (1× Near Mint) without leaving the page. Reuses the navbar typeahead endpoint.
// Exported for PortfolioQuickAdd.tsx — the portfolio page's zero-state reuses
// this exact search-and-add widget rather than a second copy of it.
export function CollectionSearch({ onAdded }: { onAdded: () => void | Promise<void> }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchCard[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [justAdded, setJustAdded] = useState<number | null>(null);
  // A row already at QUANTITY_CAP: the add changed nothing, so it must not say "✓ Added".
  const [atCap, setAtCap] = useState<number | null>(null);
  // The free portfolio limit, when an add hit it (lib/free-limits.ts).
  const [limit, setLimit] = useState<FreeLimitBody | null>(null);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(t)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => {
          setResults(((d.hits ?? []) as SearchCard[]).filter((h) => h.kind === "card" && h.id != null));
          setOpen(true);
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q]);

  async function add(hit: SearchCard) {
    if (hit.id == null) return;
    const card = { ...hit, id: hit.id };
    setAdding(card.id);
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id }),
      });
      if (res.ok) {
        setJustAdded(card.id);
        setTimeout(() => setJustAdded((v) => (v === card.id ? null : v)), 1500);
        trackEvent("collection_add", { card_id: card.id });
        await onAdded();
      } else if (res.status === 409 && (await res.json().catch(() => null))?.full) {
        setAtCap(card.id);
        setTimeout(() => setAtCap((v) => (v === card.id ? null : v)), 2500);
      } else if (res.status === FREE_LIMIT_STATUS) {
        const l = parseFreeLimit(await res.json().catch(() => null));
        if (l) {
          trackEvent("free_limit_hit", { kind: "portfolio", card_id: card.id });
          setLimit(l);
          setOpen(false);
        }
      }
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search a card to add to your collection…"
        className="input"
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
          {results.map((c) => (
            <li key={c.slug}>
              <button
                onMouseDown={(e) => e.preventDefault()} // keep dropdown open through the click
                onClick={() => add(c)}
                disabled={adding === c.id}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-ink-800 disabled:opacity-60"
              >
                {c.img && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.img} alt={`${shown(c)} Magic card`} width={28} height={39} loading="lazy" decoding="async" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{shown(c)}</span>
                  <span className="block text-[11px] text-slate-500">{c.set}{c.number ? ` · ${c.number}` : ""}</span>
                </span>
                <span className={`shrink-0 text-xs font-semibold ${justAdded === c.id ? "text-brand-400" : atCap === c.id ? "text-amber-300" : "text-slate-400"}`}>
                  {adding === c.id ? "…" : justAdded === c.id ? "✓ Added" : atCap === c.id ? `Already ${QUANTITY_CAP}` : "+ Add"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {limit && <FreeLimitPanel kind="portfolio" count={limit.count} onClose={() => setLimit(null)} className="mt-2" />}
    </div>
  );
}

// Bulk import: paste a list ("4 Lightning Bolt (M11) 146" per line) to add many cards at
// once. A line is matched by product id or by set and collector number (never by a bare
// name: a binder holds what you own); reports how many were added and anything it
// couldn't find.
function BulkImport({ onDone }: { onDone: (res: unknown) => Promise<unknown> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    added: number;
    matchedCards: number;
    full?: string[];
    unmatched: string[];
    // New cards skipped at the free portfolio limit (lib/free-limits.ts).
    limitSkipped?: number;
    limitSkippedNames?: string[];
    freeLimit?: FreeLimitBody;
    // The printing-aware CSV path (lib/collection-csv.ts, 2026-09-29): copies
    // added, lines it could not import and why, and rows with no usable condition.
    format?: "csv";
    copies?: number;
    skippedCount?: number;
    skipped?: { line: number; reason: string; text: string }[];
    conditionDefaulted?: number;
    // CSV lines whose finish could not be kept (Etched with no etched twin, Foil with no Foil row).
    warningCount?: number;
    warnings?: string[];
    failed?: string[];
    failedCount?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/collection/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await res.json();
      if (!res.ok) {
        // A CSV where no line could be read still says which lines and why.
        const why = Array.isArray(d.skipped) && d.skipped.length
          ? ` ${d.skipped.slice(0, 3).map((x: { line: number; reason: string }) => `Line ${x.line}: ${x.reason}.`).join(" ")}`
          : "";
        setError(`${d.error ?? "Import failed"}${why}`);
        return;
      }
      setResult(d);
      setText("");
      await onDone(d);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-ink-700 bg-ink-900/60 p-4">
      <label className="mb-1 block text-xs font-medium text-slate-400">
        Paste a list — one card per line with its set and number, e.g. <span className="text-slate-300">4 Lightning Bolt (M11) 146</span> or{" "}
        <span className="text-slate-300">1 Sol Ring (C21) 263 *F*</span> (<span className="text-slate-300">*F*</span> is a Foil copy, <span className="text-slate-300">*E*</span> Foil Etched).
        Or import a CSV (a TCGplayer, Moxfield, Deckbox or ManaBox export) to keep the exact printing and finish.
      </label>
      {/* sm:text-sm, not text-sm: .input is 16px below sm so iOS doesn't zoom the page on focus (2026-09-23). */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={"4 Lightning Bolt (M11) 146\n1 Sol Ring (C21) 263 *F*\n2 Counterspell (MH2) 267"}
        className="input font-mono sm:text-sm"
      />
      <div className="mt-2 flex items-center gap-2">
        <button onClick={submit} disabled={busy || !text.trim()} className="btn-primary text-sm disabled:opacity-50">
          {busy ? "Importing…" : "Add to collection"}
        </button>
        <label className="btn-ghost cursor-pointer text-sm">
          Choose a CSV file
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f && f.size <= 500_000) setText(await f.text());
              else if (f) setError("That file is too large — import up to about 2,000 lines at a time.");
            }}
          />
        </label>
        <span className="text-[11px] text-slate-600">A list adds at Near Mint; a CSV takes the printing and condition from the file (blank = Near Mint).</span>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-rose-400">{error}</p>}
      {result && (
        <div role="status" className="mt-2 text-sm">
          {/* `added`, not `matchedCards`: a card already at the cap matched but gained nothing. */}
          {result.added > 0 && (
            <p className="font-semibold text-brand-300">✓ Added {result.added} card{result.added === 1 ? "" : "s"} to your collection.</p>
          )}
          {result.full && result.full.length > 0 && (
            <p className="mt-1 text-xs text-amber-300/90">
              Already at {QUANTITY_CAP} copies, nothing added: <span className="text-slate-400">{result.full.join(" · ")}</span>
            </p>
          )}
          {result.limitSkipped != null && result.limitSkipped > 0 && result.freeLimit && (
            <>
              <p className="mt-1 text-xs text-amber-300/90">
                {result.limitSkipped} new card{result.limitSkipped === 1 ? "" : "s"} not added — free portfolios hold {result.freeLimit.limit} cards:{" "}
                <span className="text-slate-400">{(result.limitSkippedNames ?? []).join(" · ")}</span>
              </p>
              <FreeLimitPanel kind="portfolio" count={result.freeLimit.count} className="mt-2" />
            </>
          )}
          {result.unmatched.length > 0 && (
            <p className="mt-1 text-xs text-amber-300/90">
              Couldn&apos;t match: <span className="text-slate-400">{result.unmatched.join(" · ")}</span>
            </p>
          )}
          {result.format === "csv" && result.copies != null && result.copies > 0 && (
            <p className="mt-1 text-xs text-slate-400">{result.copies} {result.copies === 1 ? "copy" : "copies"} in all, each at the printing and condition the file named.</p>
          )}
          {result.warnings && result.warnings.length > 0 && (
            <div className="mt-1 text-slate-500">
              <p>Imported with a different finish ({result.warningCount ?? result.warnings.length}):</p>
              <ul className="list-disc pl-5">
                {result.warnings.slice(0, 10).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {result.skipped && result.skipped.length > 0 && (
            <div className="mt-1 text-xs text-amber-300/90">
              <p>Skipped {result.skippedCount ?? result.skipped.length} {(result.skippedCount ?? result.skipped.length) === 1 ? "line" : "lines"}:</p>
              <ul className="mt-0.5 list-disc pl-4 text-slate-400">
                {result.skipped.slice(0, 10).map((x, i) => (
                  <li key={i}>Line {x.line}: {x.reason}</li>
                ))}
              </ul>
              {(result.skippedCount ?? 0) > 10 && <p className="text-slate-500">…and {(result.skippedCount ?? 0) - 10} more.</p>}
            </div>
          )}
          {result.conditionDefaulted != null && result.conditionDefaulted > 0 && (
            <p className="mt-1 text-xs text-slate-500">{result.conditionDefaulted} {result.conditionDefaulted === 1 ? "line" : "lines"} had a condition we could not read and went in as Near Mint.</p>
          )}
          {result.failed && result.failed.length > 0 && (
            <p className="mt-1 text-xs text-amber-300/90">Couldn&apos;t save, try again: <span className="text-slate-400">{result.failed.join(" · ")}</span>
              {(result.failedCount ?? 0) > result.failed.length && ` …and ${(result.failedCount ?? 0) - result.failed.length} more`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Inline "paid $" editor for a holding's cost basis. Commits on blur/Enter; an
// empty value clears the cost basis. Stored in cents, edited in dollars.
// What the owner paid for this row — the input behind /portfolio's profit &
// loss. The each/total switch is the whole point of it.
//
// It used to be per-copy only, and a row covers every copy of one card in one
// condition, so several copies had to share one price. Reported 2026-09-10:
// "Added $770 paid to Akali ON - pulled one, paid for the other… Same issue
// with Arise where I paid 20 each for two and 25 for the third." Typing 770
// against two copies meant $1,540 invested, and 20/20/25 had no single per-copy
// number to type at all. "total" makes both sayable; see lib/collection-cost.ts
// for what the stored figure then means.
function CostInput({
  cents, isTotal, quantity, disabled, onSave,
}: {
  cents: number | null;
  isTotal: boolean;
  quantity: number;
  disabled: boolean;
  onSave: (cents: number | null, isTotal: boolean) => void;
}) {
  const [val, setVal] = useState(cents != null ? (cents / 100).toString() : "");
  const [total, setTotal] = useState(isTotal);
  useEffect(() => setVal(cents != null ? (cents / 100).toString() : ""), [cents]);
  useEffect(() => setTotal(isTotal), [isTotal]);

  function commit(nextTotal = total) {
    const t = val.trim();
    if (t === "") {
      if (cents != null) onSave(null, nextTotal);
      return;
    }
    const n = Math.round(parseFloat(t) * 100);
    if (!Number.isFinite(n) || n < 0) return;
    if (n === cents && nextTotal === isTotal) return;
    onSave(n, nextTotal);
  }

  // Flipping the switch changes what the SAME number means, so save immediately
  // rather than waiting for a blur the user has no reason to produce.
  function toggle() {
    const next = !total;
    setTotal(next);
    if (val.trim() === "") { onSave(null, next); return; }
    const n = Math.round(parseFloat(val) * 100);
    if (Number.isFinite(n) && n >= 0) onSave(n, next);
  }

  // Only worth showing once it disambiguates something — with one copy "each"
  // and "total" are the same number.
  const perCopy = total && cents != null && quantity > 1 ? cents / quantity / 100 : null;

  return (
    <label
      className="flex items-center gap-1 rounded-md border border-ink-700 bg-ink-900 px-1.5 py-1 text-xs text-slate-500"
      title={
        total
          ? "What you paid for ALL copies in this row — used for the \u201Csince you bought\u201D panel in your binder"
          : "What you paid for ONE copy — used for the \u201Csince you bought\u201D panel in your binder"
      }
    >
      paid
      <input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        disabled={disabled}
        placeholder="—"
        aria-label={total ? "Total price paid for this row" : "Price paid per copy"}
        className="w-14 rounded bg-transparent text-right text-white outline-none placeholder:text-slate-600 focus-visible:ring-1 focus-visible:ring-brand-500/40"
      />
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-label={`Price entered is ${total ? "the total for all copies" : "per copy"} — click to switch`}
        className="rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 hover:bg-ink-800 hover:text-slate-200"
      >
        {total ? "total" : "each"}
      </button>
      {perCopy != null && (
        <span className="text-[10px] text-slate-600">≈{perCopy.toFixed(2)}/ea</span>
      )}
    </label>
  );
}
