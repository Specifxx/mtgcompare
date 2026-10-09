"use client";

import { useEffect, useRef, useState } from "react";
import { useCountry } from "./CountryProvider";
import { tradeGremlin, type TradeTone } from "@/lib/trade-gremlin";
import { currencyOf, type Country } from "@/lib/country";
import { money } from "@/lib/format";

// RiftCompare's TradeCalculator, for Magic. Card search is /api/search
// (each hit carries every market's cheapest in-stock price, `low`), and "pick
// store price" reads the card's QuickView payload, /api/card/[slug], whose
// per-market rows are the card page's own cheapest open offers. eBay rows are
// left out of the picker: a trade is valued at store prices.

/** "Lightning Bolt (Extended Art)": the printing in the name, so same-name cards are distinguishable. */
function cardDisplayName(name: string, c: { variant?: string | null }): string {
  return c.variant ? `${name} (${c.variant})` : name;
}
const cardImageAlt = (c: { name: string; number?: string | null }) => `${c.name}${c.number ? ` ${c.number}` : ""} card`;

// A card added to one side of a trade. We store the full set of market prices so
// the totals re-compute live when the visitor switches country/currency.
interface TradeCard {
  /** Card.id (the TCGplayer product id) as a string, the key of an override. */
  id: string;
  slug: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  // The printing, so same-name cards (standard vs Extended Art vs Showcase) are
  // distinguishable in the name — see cardDisplayName().
  variant?: string | null;
  imageThumbUrl: string | null;
  /** Every market's cheapest in-stock store price, in that market's currency. */
  low: Partial<Record<Country, number | null>>;
  qty: number;
}

type Side = "yours" | "theirs";
const STORAGE_KEY = "mc_trade";

// What we keep from an /api/search card hit.
type SearchResult = Omit<TradeCard, "qty">;
interface SearchHit {
  kind: "card" | "sealed";
  id?: number;
  slug: string;
  name: string;
  number: string | null;
  variant: string | null;
  set: string;
  img: string | null;
  low?: Partial<Record<Country, number | null>>;
}
const fromHit = (h: SearchHit): SearchResult => ({
  id: String(h.id),
  slug: h.slug,
  name: h.name,
  setCode: h.set,
  collectorNumber: h.number ?? "",
  variant: h.variant,
  imageThumbUrl: h.img,
  low: h.low ?? {},
});

// Visual styling per gremlin verdict tone.
const TRADE_TONE: Record<TradeTone, { ring: string }> = {
  robbed: { ring: "border-rose-500/40 bg-rose-500/5" },
  winning: { ring: "border-brand-500/40 bg-brand-500/5" },
  fair: { ring: "border-ink-600 bg-ink-950/40" },
  donation: { ring: "border-ink-700 bg-ink-950/40" },
};

export function TradeCalculator() {
  const { country } = useCountry();
  const currency = currencyOf(country);
  const fmt = (cents: number) => money(cents, country);
  const price = (c: TradeCard): number | null => c.low?.[country] ?? null;
  const [yours, setYours] = useState<TradeCard[]>([]);
  const [theirs, setTheirs] = useState<TradeCard[]>([]);
  // The gremlin's spicier on-demand take (a canned line: /api/trade-roast is rules-only).
  const [roast, setRoast] = useState<{ text: string; source: "ai" | "rules" } | null>(null);
  const [roasting, setRoasting] = useState(false);
  // Each side has its OWN value % — so each player can discount their cards (e.g. value
  // them at 90%) independently. The cash difference is then the gap between the two
  // adjusted totals.
  const [yoursPct, setYoursPct] = useState(100);
  const [theirsPct, setTheirsPct] = useState(100);
  // Per-card value override (cents), keyed by card id — set by typing a value or by
  // picking a specific store's price.
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  // Restore an in-progress trade (handy at locals — survives a refresh).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        // Only rows in today's shape (a slug and per-market lows) are restored.
        const ok = (list: unknown): TradeCard[] =>
          Array.isArray(list) ? list.filter((c): c is TradeCard => !!c && typeof c.slug === "string" && typeof c.low === "object") : [];
        setYours(ok(data.yours));
        setTheirs(ok(data.theirs));
        if (data.overrides && typeof data.overrides === "object") setOverrides(data.overrides);
        if (typeof data.yoursPct === "number") setYoursPct(data.yoursPct);
        if (typeof data.theirsPct === "number") setTheirsPct(data.theirsPct);
      }
    } catch {
      /* ignore corrupt state */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ yours, theirs, overrides, yoursPct, theirsPct }));
    } catch {
      /* quota/private mode — fine */
    }
  }, [yours, theirs, overrides, yoursPct, theirsPct, loaded]);

  const setter = (side: Side) => (side === "yours" ? setYours : setTheirs);

  function add(side: Side, r: SearchResult) {
    const set = setter(side);
    set((list) => {
      const i = list.findIndex((c) => c.id === r.id);
      if (i >= 0) {
        const next = list.slice();
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...list, { ...r, qty: 1 }];
    });
  }
  function changeQty(side: Side, id: string, delta: number) {
    setter(side)((list) =>
      list.flatMap((c) => {
        if (c.id !== id) return [c];
        const qty = c.qty + delta;
        return qty <= 0 ? [] : [{ ...c, qty }];
      })
    );
  }
  function remove(side: Side, id: string) {
    setter(side)((list) => list.filter((c) => c.id !== id));
  }
  function clearSide(side: Side) {
    setter(side)([]);
  }
  function swapSides() {
    setYours(theirs);
    setTheirs(yours);
    setYoursPct(theirsPct);
    setTheirsPct(yoursPct);
  }

  // Effective per-unit value: a manual/selected override if set, else the live price.
  const effUnit = (c: TradeCard) => overrides[c.id] ?? price(c);
  const onOverride = (id: string, cents: number) => setOverrides((o) => ({ ...o, [id]: cents }));

  const sideTotal = (list: TradeCard[]) => list.reduce((sum, c) => sum + (effUnit(c) ?? 0) * c.qty, 0);
  const sideUnpriced = (list: TradeCard[]) => list.filter((c) => effUnit(c) == null).length;

  const rawYours = sideTotal(yours);
  const rawTheirs = sideTotal(theirs);
  const adjYours = Math.round((rawYours * yoursPct) / 100);
  const adjTheirs = Math.round((rawTheirs * theirsPct) / 100);
  const cashDiff = adjTheirs - adjYours; // who pays whom is left to the traders
  const hasCards = yours.length + theirs.length > 0;
  const unpriced = sideUnpriced(yours) + sideUnpriced(theirs);

  // Live gremlin fairness verdict (free, instant). adjYours = you give; adjTheirs = you get.
  const gremlin = hasCards ? tradeGremlin(adjYours, adjTheirs, currency) : null;

  // The on-demand roast is a snapshot — clear it whenever the trade changes.
  useEffect(() => { setRoast(null); }, [adjYours, adjTheirs]);

  async function getRoast() {
    setRoasting(true);
    try {
      const res = await fetch("/api/trade-roast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          giveCents: adjYours,
          getCents: adjTheirs,
          currency,
          yours: yours.map((c) => `${c.name}${c.qty > 1 ? ` x${c.qty}` : ""}`),
          theirs: theirs.map((c) => `${c.name}${c.qty > 1 ? ` x${c.qty}` : ""}`),
        }),
      });
      const d = await res.json();
      if (d.text) setRoast({ text: d.text, source: d.source ?? "rules" });
    } catch {
      /* ignore — the live line is still shown */
    } finally {
      setRoasting(false);
    }
  }

  return (
    <div>
      {/* grid-cols-1 below md, not the implicit `auto` track: that sized itself to
          the min-content of the longest truncated card name, so /trade with Jinx
          and Ahri added laid out 603px wide on a 390px phone (2026-09-23).
          grid-cols-1 is minmax(0, 1fr). */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TradeColumn
          title="Your cards"
          subtitle="What you're giving"
          accent="rose"
          list={yours}
          raw={rawYours}
          adjusted={adjYours}
          pct={yoursPct}
          onPct={setYoursPct}
          country={country}
          fmt={fmt}
          price={price}
          overrides={overrides}
          onOverride={onOverride}
          onAdd={(r) => add("yours", r)}
          onQty={(id, d) => changeQty("yours", id, d)}
          onRemove={(id) => remove("yours", id)}
          onClear={() => clearSide("yours")}
        />
        <TradeColumn
          title="Their cards"
          subtitle="What you're receiving"
          accent="emerald"
          list={theirs}
          raw={rawTheirs}
          adjusted={adjTheirs}
          pct={theirsPct}
          onPct={setTheirsPct}
          country={country}
          fmt={fmt}
          price={price}
          overrides={overrides}
          onOverride={onOverride}
          onAdd={(r) => add("theirs", r)}
          onQty={(id, d) => changeQty("theirs", id, d)}
          onRemove={(id) => remove("theirs", id)}
          onClear={() => clearSide("theirs")}
        />
      </div>

      {/* Summary: sticky so the totals stay in view on a phone. Only the totals ride
          along. With the Gremlin and the disclaimer inside, the bar was 368px (44% of
          an 844px phone) and covered the 'Their cards' search while you edited it
          (2026-09-23). */}
      {/* sm:pr-36 (2026-09-23): from 640 the FeedbackWidget pill sits at the
          bottom-right, and once this bar stuck its right-aligned Cash difference
          ran underneath it on a landscape phone. Same clearance as the Filters
          "Show results" footer. */}
      <div className="sticky bottom-3 z-20 mt-4">
        <div className="card-surface border-ink-600 bg-ink-900/95 p-4 shadow-2xl backdrop-blur sm:pr-36">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div className="flex items-center gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">You give</div>
                <div className="font-bold text-white">
                  {fmt(rawYours)}
                  {yoursPct !== 100 && <span className="ml-1 text-xs font-normal text-brand-300">({fmt(adjYours)})</span>}
                </div>
              </div>
              <div className="text-2xl text-slate-600">⇄</div>
              <div>
                <div className="text-xs text-slate-500">You receive</div>
                <div className="font-bold text-white">
                  {fmt(rawTheirs)}
                  {theirsPct !== 100 && <span className="ml-1 text-xs font-normal text-brand-300">({fmt(adjTheirs)})</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {hasCards && (
                <button onClick={swapSides} className="btn-ghost text-sm" title="Swap the two sides">⇅ Swap</button>
              )}
              {hasCards && (
                <div className="text-right">
                  <div className="text-xs text-slate-500">Cash difference</div>
                  <div className="font-bold text-accent">{fmt(Math.abs(cashDiff))}</div>
                </div>
              )}
            </div>
          </div>

          {unpriced > 0 && (
            <p className="mt-2 text-xs text-gold">
              {unpriced} card{unpriced === 1 ? "" : "s"} have no price — type a value or pick a store price.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {/* Trade Gremlin — funny live fairness verdict; tap to get a spicier roast */}
        {gremlin && (
          <div className={`rounded-xl border p-3 ${TRADE_TONE[gremlin.tone].ring}`}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-base">🤖</span>
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-300">Trade Gremlin</span>
              {/* The roast is a canned line (/api/trade-roast is rules-only on
                  MTG Compare); the footer below says so. */}
              <button
                onClick={getRoast}
                disabled={roasting}
                className="ml-auto rounded-md bg-ink-800 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-ink-700 disabled:opacity-60"
              >
                {roasting ? "Cooking… 🔥" : "🔮 Roast this trade"}
              </button>
            </div>
            <p className="text-sm leading-relaxed text-slate-100">{roast?.text ?? gremlin.line}</p>
          </div>
        )}

        <p className="text-[11px] text-slate-600">
          Values start from MTG Compare&apos;s lowest live store price (tap a price to type your own or pick a store).
          Each side has its own value % for cash settlement. A guide for fair trades — always agree the final deal yourselves.
          {gremlin && " The Trade Gremlin's commentary is a set of canned jokes picked by the size of the gap, not written by AI — the values above are real, its opinion isn't advice."}
        </p>
      </div>
    </div>
  );
}

function TradeColumn({
  title,
  subtitle,
  accent,
  list,
  raw,
  adjusted,
  pct,
  onPct,
  country,
  fmt,
  price,
  overrides,
  onOverride,
  onAdd,
  onQty,
  onRemove,
  onClear,
}: {
  title: string;
  subtitle: string;
  accent: "rose" | "emerald";
  list: TradeCard[];
  raw: number;
  adjusted: number;
  pct: number;
  onPct: (pct: number) => void;
  country: string;
  fmt: (c: number) => string;
  price: (c: TradeCard) => number | null;
  overrides: Record<string, number>;
  onOverride: (id: string, cents: number) => void;
  onAdd: (r: SearchResult) => void;
  onQty: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const ring = accent === "rose" ? "border-t-rose-500/50" : "border-t-emerald-500/50";
  const count = list.reduce((n, c) => n + c.qty, 0);
  return (
    <section className={`card-surface border-t-2 ${ring} p-4`}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-white">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        {list.length > 0 && (
          <button onClick={onClear} className="text-xs text-slate-500 hover:text-rose-300">Clear</button>
        )}
      </div>

      <CardPicker onAdd={onAdd} />

      {list.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-ink-700 p-6 text-center text-sm text-slate-500">
          No cards yet — search above to add what&apos;s being traded.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-ink-800">
          {list.map((c) => {
            const base = price(c);
            const ov = overrides[c.id];
            const unit = ov ?? base; // override beats market price
            return (
              <li key={c.id} className="flex items-start gap-3 py-2.5">
                {c.imageThumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageThumbUrl} alt={cardImageAlt({ name: c.name, number: c.collectorNumber })} width={36} height={48} loading="lazy" className="mt-0.5 h-12 w-9 shrink-0 rounded object-cover" />
                ) : (
                  <div className="mt-0.5 h-12 w-9 shrink-0 rounded bg-ink-800" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{cardDisplayName(c.name, c)}</div>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <span className="truncate">{c.setCode} {c.collectorNumber}</span>
                    <span>·</span>
                    <span>$</span>
                    {/* 16px below sm so iOS doesn't zoom the page on focus (it was
                        11px), and w-[5.5rem] so "15300.00" still shows at that
                        size (w-20 clipped it to "15300.0"). The narrow w-16 is for
                        a MOUSE only: globals.css forces 16px on a coarse landscape
                        phone too, where a bare sm:w-16 clipped "1266.68". The
                        set-code span truncates to make room (2026-09-23).
                        sm:leading-4 because text-base also sets a 24px line-height
                        that sm:text-[11px] alone would keep, making the ≥sm input
                        30px tall instead of 22. */}
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={((ov ?? base ?? 0) / 100).toFixed(2)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        onOverride(c.id, Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : 0);
                      }}
                      onFocus={(e) => e.target.select()}
                      className={`w-[5.5rem] rounded border bg-ink-900 px-1 py-0.5 text-right text-base outline-none focus:border-brand-500 focus-visible:ring-1 focus-visible:ring-brand-500/40 sm:[@media(pointer:fine)]:w-16 sm:text-[11px] sm:leading-4 ${
                        ov != null ? "border-brand-500/60 text-brand-300" : "border-ink-700 text-slate-300"
                      }`}
                      aria-label="Card value"
                      title={ov != null ? "Custom value — edit, or pick a store price below" : "Market value — type to override"}
                    />
                    <span>ea</span>
                  </div>
                  {/* Pick a specific store's price in case the cheapest is wrong. */}
                  <StorePrices slug={c.slug} country={country} fmt={fmt} onPick={(cents) => onOverride(c.id, cents)} />
                  {/* Stepper and line total sit in the info column, not in fixed side columns:
                      a w-16 total couldn't hold "US$1,266.68" and ran 20px under the ✕,
                      and the side columns squeezed the name to 83px on a 390px phone
                      (2026-09-23). flex-wrap because at 320 the stepper (104px) plus
                      "US$15,300.00" (~104px) don't fit a ~166px column; the total drops
                      under the stepper instead of spilling over the ✕. */}
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => onQty(c.id, -1)} className="grid h-9 w-9 place-items-center rounded-md bg-ink-800 text-slate-300 hover:bg-ink-700 sm:h-7 sm:w-7" aria-label="Decrease quantity">−</button>
                      <span className="w-5 text-center text-sm font-semibold text-white">{c.qty}</span>
                      <button onClick={() => onQty(c.id, 1)} className="grid h-9 w-9 place-items-center rounded-md bg-ink-800 text-slate-300 hover:bg-ink-700 sm:h-7 sm:w-7" aria-label="Increase quantity">+</button>
                    </div>
                    <div className="num whitespace-nowrap text-sm font-semibold text-accent">
                      {unit != null ? fmt(unit * c.qty) : "—"}
                    </div>
                  </div>
                </div>
                {/* h-9, not .tap-icon: 44–48px made the wrapped rows 142–171px tall.
                    -mr-2 keeps the 36px target inside the section's p-4. */}
                <button onClick={() => onRemove(c.id)} className="-mr-2 grid h-9 w-9 shrink-0 place-items-center text-slate-600 hover:text-rose-300" aria-label="Remove">✕</button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 border-t border-ink-700 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">{count} card{count === 1 ? "" : "s"}</span>
          <span className="text-lg font-extrabold text-white">
            {fmt(raw)}
            {pct !== 100 && <span className="ml-1 text-sm font-semibold text-accent">→ {fmt(adjusted)}</span>}
          </span>
        </div>
        {/* This side's value % — for cash settlement (e.g. value your cards at 90%). */}
        {list.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Value %</span>
            <input
              type="range"
              min={1}
              max={100}
              value={pct}
              onChange={(e) => onPct(Number(e.target.value))}
              className="h-1 flex-1 cursor-pointer accent-brand-500"
              aria-label={`${title} value percentage`}
            />
            <input
              type="number"
              min={1}
              max={100}
              value={pct}
              onChange={(e) => {
                const v = Math.round(Number(e.target.value));
                if (Number.isFinite(v)) onPct(Math.min(100, Math.max(1, v)));
              }}
              onFocus={(e) => e.target.select()}
              className="w-14 rounded border border-ink-700 bg-ink-900 px-1 py-0.5 text-right text-base font-bold text-white outline-none focus:border-brand-500 focus-visible:ring-1 focus-visible:ring-brand-500/40 sm:w-11 sm:text-xs"
              aria-label={`${title} value percentage`}
            />
            <span className="text-xs text-slate-400">%</span>
          </div>
        )}
      </div>
    </section>
  );
}

// Expandable list of a card's in-stock store prices for the current market, so a
// trader can pick a specific store's price if the auto-cheapest one looks wrong.
// Picking sets that card's value override.
function StorePrices({
  slug,
  country,
  fmt,
  onPick,
}: {
  slug: string;
  country: string;
  fmt: (c: number) => string;
  onPick: (cents: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<
    { retailerName: string; priceCents: number; condition: string | null; isFoil: boolean }[] | null
  >(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && rows == null) {
      setLoading(true);
      try {
        const res = await fetch(`/api/card/${encodeURIComponent(slug)}`);
        const data = await res.json();
        type Row = { label: string; priceCents: number; condition: string | null; ebay: boolean };
        const list = ((data.markets?.[country]?.rows ?? []) as Row[])
          .filter((p) => !p.ebay)
          .map((p) => ({ retailerName: p.label, priceCents: p.priceCents, condition: p.condition ?? null, isFoil: false }))
          .sort((a, b) => a.priceCents - b.priceCents);
        setRows(list);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="mt-0.5">
      <button type="button" onClick={toggle} className="text-[11px] text-slate-500 hover:text-brand-400">
        {open ? "hide store prices ▴" : "pick store price ▾"}
      </button>
      {open && (
        <ul className="mt-1 max-h-40 overflow-auto rounded-md border border-ink-700 bg-ink-900">
          {loading ? (
            <li className="px-2 py-1 text-[11px] text-slate-500">Loading…</li>
          ) : !rows || rows.length === 0 ? (
            <li className="px-2 py-1 text-[11px] text-slate-500">No in-stock store prices for this market.</li>
          ) : (
            rows.map((p, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(p.priceCents);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[11px] hover:bg-ink-800"
                >
                  <span className="truncate text-slate-300">
                    {p.retailerName}
                    {p.isFoil ? " · Foil" : ""}
                    {p.condition ? ` · ${p.condition}` : ""}
                  </span>
                  <span className="shrink-0 font-semibold text-accent">{fmt(p.priceCents)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// Typeahead that adds a real DB card (with its live market prices) to a side.
function CardPicker({ onAdd }: { onAdd: (r: SearchResult) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        setResults(((data.hits ?? []) as SearchHit[]).filter((h) => h.kind === "card" && h.id != null).slice(0, 8).map(fromHit));
      } catch {
        /* ignore */
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div ref={boxRef} className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Add a card — type to search…"
        className="input"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-ink-700 bg-ink-850 shadow-2xl">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onAdd(r);
                  setQ("");
                  setResults([]);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink-800"
              >
                {r.imageThumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imageThumbUrl} alt={cardImageAlt({ name: r.name, number: r.collectorNumber })} width={28} height={36} loading="lazy" className="h-9 w-7 shrink-0 rounded object-cover" />
                ) : (
                  <div className="h-9 w-7 shrink-0 rounded bg-ink-800" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-white">
                  {cardDisplayName(r.name, r)} <span className="text-xs text-slate-500">{r.setCode} {r.collectorNumber}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
