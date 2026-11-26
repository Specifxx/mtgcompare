"use client";

// Box worth: the interactive part of /<region>/box-value/<set> (DECISIONS.md 2026-11-26 "Box worth: published odds only").
//
// Everything is worked out from Wizards' published odds and TCGplayer's US$ market prices that the server sent (lib/box-ev): the
// average box, a 2,000-box simulation (seeded, so the server's HTML and the browser agree and nothing moves on load), the box
// price line, where the value sits and the best pulls. The reader's two controls (which box; which cards count) only re-run the
// sums. No prompt, no pop-up, nothing stored, no request.
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import Link from "@/components/Link";
import { boxEv, histogram, quantile, shareAtLeast, simulate, slotEvs } from "@/lib/box-ev/model";
import { asBooster, boxOdds, KIND_LABEL, type BoxView } from "@/lib/box-ev/shared";
import type { BoxKind } from "@/lib/box-ev/types";

export interface BoxPrice {
  /** US cents: the cheapest in-stock US store (or TCGplayer) price for the box. */
  cents: number;
  /** The product page. */
  href: string;
  stores: number;
}

export interface LocalPrice {
  /** Already formatted in the reader's own currency (never converted). */
  text: string;
  href: string;
  place: string;
}

export interface BoxWorthProps {
  setName: string;
  boxes: BoxView[];
  /** Per box kind: the US price the verdict is worked against, and the reader's own market's price when that isn't the US. */
  prices: Partial<Record<BoxKind, { us: BoxPrice | null; local: LocalPrice | null }>>;
}

const FLOORS = [
  { cents: 0, label: "Every card" },
  { cents: 100, label: "$1+" },
  { cents: 200, label: "$2+" },
  { cents: 500, label: "$5+" },
] as const;
const DEFAULT_FLOOR = 100;
const SIM_BOXES = 2000;
const SEED = 20261126;
const BINS = 28;

const usd = (cents: number, whole = false): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: whole ? 0 : 2, minimumFractionDigits: whole ? 0 : 2 }).format(cents / 100);
const pctText = (x: number): string => `${Math.round(x * 100)}%`;

/** A row of mutually exclusive choices, the WAI-ARIA radio group pattern (arrow keys move and choose). */
function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.value === value);
    const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % options.length : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + options.length) % options.length : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].value);
    (e.currentTarget.querySelectorAll("button")[next] as HTMLButtonElement | undefined)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="inline-flex max-w-full rounded-full border border-line bg-raised p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`min-h-9 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-colors duration-150 motion-reduce:transition-none sm:px-4 ${on ? "bg-ink text-surface shadow-card" : "text-muted hover:text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The simulated boxes as a histogram, the box price as a line through it. Pure SVG: crisp at any width, themed by currentColor. */
function Distribution({ sorted, price, ev }: { sorted: number[]; price: number | null; ev: number }) {
  const bins = useMemo(() => histogram(sorted, BINS), [sorted]);
  if (!bins.length) return null;
  const max = Math.max(...bins.map((b) => b.n), 1);
  const lo = bins[0].from;
  const hi = bins[bins.length - 1].to;
  const W = 600;
  const H = 150;
  const x = (v: number) => Math.min(W, Math.max(0, ((v - lo) / (hi - lo)) * W));
  const bw = W / bins.length;
  const priceX = price != null && price >= lo && price <= hi ? x(price) : null;
  const ticks = [quantile(sorted, 0.1), quantile(sorted, 0.5), quantile(sorted, 0.9)];
  return (
    <figure className="mt-2">
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="block h-auto w-full overflow-visible" role="img" aria-label={`What ${SIM_BOXES.toLocaleString("en-US")} simulated boxes were worth: from about ${usd(ticks[0], true)} (1 in 10 boxes is worth less) to about ${usd(ticks[2], true)} (1 in 10 is worth more), most often around ${usd(ticks[1], true)}.${price != null ? ` The box costs ${usd(price, true)}.` : ""}`}>
        {bins.map((b, i) => {
          const h = Math.max(1.5, (b.n / max) * H);
          const above = price != null && b.from >= price;
          return <rect key={i} x={i * bw + 1} y={H - h} width={Math.max(1, bw - 2)} height={h} rx={2} className={above ? "fill-open" : "fill-brand"} opacity={above ? 0.85 : 0.55} />;
        })}
        <line x1={x(ev)} x2={x(ev)} y1={0} y2={H} className="stroke-ink" strokeWidth={1.5} strokeDasharray="2 3" />
        {priceX != null && (
          <>
            <line x1={priceX} x2={priceX} y1={-4} y2={H} className="stroke-ink" strokeWidth={2.5} />
            <text x={priceX} y={-8} textAnchor={priceX > W - 90 ? "end" : priceX < 90 ? "start" : "middle"} className="fill-ink text-[13px] font-semibold">
              Box price {usd(price!, true)}
            </text>
          </>
        )}
        <line x1={0} x2={W} y1={H + 0.5} y2={H + 0.5} className="stroke-line" />
        {ticks.map((t, i) => (
          <text key={i} x={x(t)} y={H + 17} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="fill-muted text-[12px]">
            {usd(t, true)}
          </text>
        ))}
      </svg>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-brand/60" /> Boxes worth less than the price
        </span>
        {price != null && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-open/85" /> Boxes worth more
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0 w-3 border-t-2 border-dotted border-ink" /> Average
        </span>
        <span>Ticks: 1 in 10 lower · typical · 1 in 10 higher</span>
      </figcaption>
    </figure>
  );
}

export function BoxWorth({ setName, boxes, prices }: BoxWorthProps) {
  const id = useId();
  const kinds = boxes.map((b) => b.kind);
  const [kind, setKind] = useState<BoxKind>(kinds[0]);
  const [floor, setFloor] = useState<number>(DEFAULT_FLOOR);
  // A product page links its own box: "#collector" opens on the Collector Booster Box (the page is one cached copy, so the choice
  // rides in the hash, never the query).
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (h === "collector" || h === "play") if (kinds.includes(h)) setKind(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const view = boxes.find((b) => b.kind === kind) ?? boxes[0];
  const booster = useMemo(() => asBooster(view), [view]);
  const ev = useMemo(() => boxEv(booster, floor), [booster, floor]);
  const evAll = useMemo(() => boxEv(booster, 0), [booster]);
  const sim = useMemo(() => simulate(booster, SIM_BOXES, SEED, floor), [booster, floor]);
  const slots = useMemo(() => slotEvs(booster, floor).sort((a, b) => b.box - a.box), [booster, floor]);
  const price = prices[kind]?.us ?? null;
  const local = prices[kind]?.local ?? null;
  const beat = price ? shareAtLeast(sim, price.cents) : null;
  const diff = price ? ev - price.cents : null;
  const ratio = price ? ev / price.cents : null;
  const good = diff != null && diff >= 0;
  const slotMax = Math.max(...slots.map((s) => s.box), 1);
  const floorLabel = floor ? `cards worth ${usd(floor, true)} or more` : "every card";

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        {kinds.length > 1 && (
          <Segmented
            label="Which box"
            value={kind}
            options={kinds.map((k) => ({ value: k, label: k === "play" ? "Play Booster Box" : "Collector Booster Box" }))}
            onChange={(k) => {
              setKind(k);
              try {
                history.replaceState(null, "", `#${k}`);
              } catch {
                /* a sandboxed frame: the choice still shows */
              }
            }}
          />
        )}
      </div>

      {/* The answer, first and large. */}
      <section aria-labelledby={`${id}-verdict`} className="card relative mt-5 overflow-hidden p-5 sm:p-8">
        <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${price ? (good ? "bg-open" : "bg-stale") : "bg-brand"}`} />
        <h2 id={`${id}-verdict`} className="sr-only">
          What a {setName} {KIND_LABEL[kind]} is worth
        </h2>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
          <div className="min-w-0">
            <div className="eyebrow">Average box, opened</div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="tabular font-display text-5xl font-bold tracking-tight text-ink sm:text-6xl">{usd(ev, true)}</span>
              {price && diff != null && (
                <span className={`tabular inline-flex items-center rounded-full px-2.5 py-1 text-sm font-bold ${good ? "bg-open-soft text-open" : "bg-stale-soft text-stale"}`}>
                  {good ? "+" : "−"}
                  {usd(Math.abs(diff), true)} vs the box
                </span>
              )}
            </div>
            <p className="mt-3 max-w-prose text-[15px] leading-6 text-muted">
              {price ? (
                good ? (
                  <>
                    On average the cards are worth <strong className="text-ink">{pctText(ratio!)}</strong> of what the box costs, counting {floorLabel}. That&rsquo;s before
                    selling fees and the time it takes.
                  </>
                ) : (
                  <>
                    On average the cards are worth <strong className="text-ink">{pctText(ratio!)}</strong> of what the box costs, counting {floorLabel}. Open it for the fun
                    of it; buy singles if you want particular cards.
                  </>
                )
              ) : (
                <>Counting {floorLabel}, at TCGplayer&rsquo;s market prices. No US store has the box in stock right now, so there&rsquo;s no price to set it against.</>
              )}
            </p>
            <div className="mt-5">
              <div aria-hidden="true" className="mb-2 text-xs font-semibold text-muted">
                Count cards worth
              </div>
              <Segmented label="Count cards worth" value={floor} options={FLOORS.map((f) => ({ value: f.cents, label: f.label }))} onChange={setFloor} />
              {floor > 0 && <p className="mt-2 text-xs text-muted">Every card counted: {usd(evAll, true)}. Bulk rarely sells for its market price, so it&rsquo;s left out by default.</p>}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 self-start sm:gap-4">
            <div className="rounded-xl border border-line bg-raised p-4">
              <dt className="text-xs font-semibold text-muted">Box price (US)</dt>
              <dd className="tabular mt-1 text-2xl font-bold text-ink">{price ? usd(price.cents) : "—"}</dd>
              {price && (
                <dd className="mt-1 text-xs">
                  <Link href={price.href} className="font-semibold text-brand-strong underline-offset-2 hover:underline">
                    {price.stores > 1 ? `Compare ${price.stores} stores →` : "See the price →"}
                  </Link>
                </dd>
              )}
            </div>
            <div className="rounded-xl border border-line bg-raised p-4">
              <dt className="text-xs font-semibold text-muted">Boxes that beat it</dt>
              <dd className="tabular mt-1 text-2xl font-bold text-ink">{beat != null ? pctText(beat) : "—"}</dd>
              <dd className="mt-1 text-xs text-muted">of {SIM_BOXES.toLocaleString("en-US")} simulated</dd>
            </div>
            <div className="rounded-xl border border-line bg-raised p-4">
              <dt className="text-xs font-semibold text-muted">A typical box</dt>
              <dd className="tabular mt-1 text-2xl font-bold text-ink">{usd(quantile(sim, 0.5), true)}</dd>
              <dd className="mt-1 text-xs text-muted">half are worth less</dd>
            </div>
            <div className="rounded-xl border border-line bg-raised p-4">
              <dt className="text-xs font-semibold text-muted">8 in 10 boxes</dt>
              <dd className="tabular mt-1 text-lg font-bold leading-8 text-ink">
                {usd(quantile(sim, 0.1), true)}–{usd(quantile(sim, 0.9), true)}
              </dd>
              <dd className="mt-1 text-xs text-muted">land in this range</dd>
            </div>
          </dl>
        </div>
        {local && (
          <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
            In {local.place} the cheapest box is <strong className="tabular text-ink">{local.text}</strong>.{" "}
            <Link href={local.href} className="font-semibold text-brand-strong underline-offset-2 hover:underline">
              Compare stores →
            </Link>{" "}
            Card values are TCGplayer&rsquo;s US$ prices, so the verdict above uses the US box price; we never convert currencies.
          </p>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section aria-labelledby={`${id}-dist`} className="card min-w-0 p-5 sm:p-6">
          <h2 id={`${id}-dist`} className="font-display text-xl font-bold tracking-tight">
            {SIM_BOXES.toLocaleString("en-US")} boxes, opened
          </h2>
          <p className="mt-1 text-sm text-muted">Each bar is how many simulated boxes landed at that value. The average hides how often a box falls short.</p>
          <div className="mt-6">
            <Distribution sorted={sim} price={price?.cents ?? null} ev={ev} />
          </div>
        </section>

        <section aria-labelledby={`${id}-where`} className="card min-w-0 p-5 sm:p-6">
          <h2 id={`${id}-where`} className="font-display text-xl font-bold tracking-tight">
            Where the value is
          </h2>
          <p className="mt-1 text-sm text-muted">
            Per box ({view.packs} packs), by slot. Counting {floorLabel}.
          </p>
          <ul className="mt-4 grid gap-3">
            {slots.map((s) => (
              <li key={s.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-sm">
                <span className="min-w-0 truncate text-ink">
                  {s.label}
                  {s.count > 1 && <span className="text-muted"> ×{s.count}</span>}
                </span>
                <span className="tabular font-semibold text-ink">{usd(s.box, true)}</span>
                <span aria-hidden="true" className="col-span-2 h-1.5 overflow-hidden rounded-full bg-raised">
                  <span className="block h-full rounded-full bg-brand/70 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(s.box / slotMax) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {view.pulls.length > 0 && (
        <section aria-labelledby={`${id}-pulls`} className="mt-10">
          <h2 id={`${id}-pulls`} className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            The cards that make a box
          </h2>
          <p className="mt-1 text-sm text-muted">The most valuable cards this box can hold, and how often one turns up.</p>
          <ol className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {view.pulls.map((p, i) => (
              <li key={`${p.href}-${p.foil}`}>
                <Link href={p.href} className="card lift group flex h-full items-center gap-3 p-3.5">
                  <span aria-hidden="true" className="tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-strong">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink group-hover:underline">{p.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {p.foil ? "Foil · " : ""}
                      {boxOdds(p.inBox)}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-sm font-bold text-ink">{usd(p.v)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
