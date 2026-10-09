"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format-currency";
import { convertUsdCents, USD_TO } from "@/lib/fx";
import { currencyOf } from "@/lib/country";
import { outboundRel } from "@/lib/affiliate";
import { useCountry } from "@/components/CountryProvider";
import CardQuickLink from "@/components/CardQuickLink";
import { CardArt } from "@/components/CardTile";
import {
  boxSetLabel,
  evForPools,
  isChasePool,
  oneInPacks,
  releaseDateLabel,
  verdictFor,
  DEFAULT_PACKS,
  POOL_LABEL,
  unvaluedSlots,
  type PoolKey,
} from "@/lib/box-ev";
import { BOOSTER_TYPES, packSummary } from "@/lib/pack-composition";

// The provenance note quotes the slot table the defaults are built from, never
// a typed copy of it (lib/pack-composition.ts).

// Box EV explorer. MTG Compare supplies a real market price for every card in
// the set, chase treatments included; the pack structure is the one Wizards of
// the Coast publishes for the booster (lib/pack-composition.ts), and the player
// can tune every rate. A slot Wizards publishes no split for is valued at zero
// until the player sets one.
//
// EVERYTHING ARRIVES IN USD and is converted once, here, for display. The server
// render is country-agnostic (that is what lets the page be ISR-cached), and
// useCountry() picks the visitor's currency.

export interface PullCard {
  id: number;
  slug: string;
  name: string;
  rarity: string | null;
  number: string | null;
  /** Treatment words of the printing ("Borderless", "Extended Art"). */
  label?: string | null;
  usdCents: number | null;
  hasImage: boolean;
}

export interface BoxEvPool {
  pool: PoolKey;
  avgUsdCents: number;
  topUsdCents: number;
  priced: number;
  total: number;
  top: PullCard[];
}

export interface BoxEvBooster {
  /** BoosterType.key. */
  key: string;
  /** The box product's own pack count from the catalogue, else the booster's usual count. */
  packs: number;
}

export interface BoxEvSet {
  setCode: string;
  setSlug: string;
  setName: string;
  /** YYYY-MM-DD, or null when the catalogue has no date. */
  releasedOn: string | null;
  /** Out on the day the page was rendered (lib/box-ev.ts isReleased, decided on the server so the picker hydrates as rendered). */
  released: boolean;
  /** The booster boxes of the set that Wizards' published structures cover. */
  boosters: BoxEvBooster[];
  pools: BoxEvPool[];
}

/** The cheapest in-stock Booster Box a tracked store has, in that market's own currency. */
export interface BoxEvOffer {
  priceCents: number;
  retailer: string;
  retailerName: string;
  /** Affiliate-tagged on the server. */
  href: string;
  boxSlug: string;
}

/** setCode → market → offer. Only sets and markets with an open box offer appear. */
export type BoxEvOffers = Record<string, Partial<Record<string, BoxEvOffer>>>;

/**
 * `initialSetCode` is the set the page chose to open on (lib/box-ev.ts
 * defaultBoxSet: the newest RELEASED set with a computed EV); the list itself
 * stays newest first, unreleased sets labelled.
 */
export function BoxEvCalculator({ sets, offers = {}, initialSetCode }: { sets: BoxEvSet[]; offers?: BoxEvOffers; initialSetCode?: string }) {
  const { country } = useCountry();
  const currency = currencyOf(country);
  const opening = sets.find((s) => s.setCode === initialSetCode) ?? sets[0];
  const [setCode, setSetCode] = useState(opening?.setCode ?? "");
  const [boosterKey, setBoosterKey] = useState(opening?.boosters[0]?.key ?? "play");
  const [packs, setPacks] = useState(opening?.boosters[0]?.packs ?? DEFAULT_PACKS);
  // null = "use the cheapest box we track" (see `offer` below); a string is what
  // the visitor typed, which wins until they switch set.
  const [typedPrice, setTypedPrice] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Partial<Record<PoolKey, number>>>({});
  const [showRates, setShowRates] = useState(false);

  const set = sets.find((s) => s.setCode === setCode) ?? sets[0];
  const boosterOpt = set?.boosters.find((b) => b.key === boosterKey) ?? set?.boosters[0];
  const booster = BOOSTER_TYPES.find((b) => b.key === boosterOpt?.key) ?? null;

  // The price field starts at the cheapest in-stock Booster Box for this set in
  // the visitor's market, from /sealed's own data, in the market's currency.
  const offer = set ? offers[set.setCode]?.[country] ?? null : null;
  const boxPrice = typedPrice ?? (offer ? (offer.priceCents / 100).toFixed(2) : "");
  const usingOffer = typedPrice == null && offer != null;

  // Local display helpers. `fx` is the multiplier actually applied, printed in
  // the disclosure so the conversion is auditable rather than a black box.
  const fx = USD_TO[currency] ?? 1;
  const money = (usdCents: number) => formatMoney(convertUsdCents(usdCents, currency), currency);
  const usd = (usdCents: number) => formatMoney(usdCents, "USD");
  const fmt = (cents: number) => formatMoney(cents, currency);

  const calc = useMemo(() => {
    if (!set) return null;
    const priceCents = Math.round((parseFloat(boxPrice) || 0) * 100);
    // The box price is typed in the DISPLAY currency; the model works in USD, so
    // convert back rather than comparing two different currencies.
    const priceUsdCents = fx > 0 ? Math.round(priceCents / fx) : 0;
    return evForPools({ pools: set.pools, booster, packs, overrides, boxPriceCents: priceUsdCents });
  }, [set, booster, packs, overrides, boxPrice, fx]);

  if (!set || !calc) return null;

  // A set not out yet has a partial card list at pre-order prices: its EV is shown, labelled, and never given a verdict.
  const verdict = set.released ? verdictFor(calc.ratio, { pricedShare: calc.pricedShare, chaseShare: calc.chaseShare }) : null;
  const chaseLines = calc.lines.filter((l) => isChasePool(l.pool));
  const chaseShare = chaseLines.reduce((a, l) => a + l.share, 0);
  const poolByKey = new Map(set.pools.map((p) => [p.pool, p]));

  return (
    <div className="space-y-4">
      {/* ── Headline: the number, and how it lands against a real box price ── */}
      <div className="card-surface overflow-hidden">
        <div className="border-b border-ink-800 bg-ink-900/60 p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Expected value per box
              </div>
              <div className="num font-display text-5xl font-extrabold leading-none text-white">
                {money(calc.evBoxCents)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {currency !== "USD" && <>≈ {usd(calc.evBoxCents)} · </>}
                {money(calc.evPackCents)} per pack · {packs} packs
              </div>
            </div>

            {calc.ratio != null && (
              <div className="text-right">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Return on box price</div>
                <div
                  className={`num text-4xl font-extrabold leading-none ${
                    calc.ratio >= 1 ? "text-up" : calc.ratio >= 0.85 ? "text-gold" : "text-down"
                  }`}
                >
                  {(calc.ratio * 100).toFixed(0)}%
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {calc.ratio >= 1 ? "+" : ""}
                  {money(calc.evBoxCents - calc.priceCents)} vs price
                </div>
              </div>
            )}
          </div>

          {/* EV-vs-price bar. The visual question this page exists to answer is
              "does the bar clear the line", so draw exactly that. */}
          {calc.ratio != null && (
            <div className="mt-4">
              <div className="relative h-3 overflow-hidden rounded-full bg-ink-800">
                <div
                  className={`h-full rounded-full transition-all ${
                    calc.ratio >= 1 ? "bg-up" : calc.ratio >= 0.85 ? "bg-gold" : "bg-down"
                  }`}
                  style={{ width: `${Math.min(100, (calc.ratio / 1.5) * 100)}%` }}
                />
                {/* Break-even marker at 100% of a 150%-wide track. */}
                <div className="absolute inset-y-0 left-[66.67%] w-px bg-slate-400/70" aria-hidden />
              </div>
              <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-slate-600">
                <span>0%</span>
                <span className="text-slate-400">break even</span>
                <span>150%</span>
              </div>
            </div>
          )}

          {!set.released && (
            <p className="mt-3 text-sm font-semibold text-gold" data-unreleased>
              ⏳ {set.setName} is not out until {set.releasedOn ? releaseDateLabel(set.releasedOn) : "its release date"}. Only part of its card list is
              known and its prices are pre-orders, so this expected value says nothing about a box yet.
            </p>
          )}

          {verdict && (
            <p
              className={`mt-3 text-sm font-semibold ${
                verdict.tone === "up" ? "text-up" : verdict.tone === "flat" ? "text-gold" : "text-down"
              }`}
            >
              {verdict.emoji} {verdict.text}
            </p>
          )}
        </div>

        {/* Inputs */}
        <div className="grid gap-3 p-5 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Set</span>
            <select
              value={setCode}
              // A price typed for one set's box is not a price for another's:
              // switching set goes back to that set's cheapest tracked box, and
              // to that box's own pack count.
              onChange={(e) => {
                const next = sets.find((s) => s.setCode === e.target.value);
                setSetCode(e.target.value);
                setTypedPrice(null);
                setOverrides({});
                const first = next?.boosters[0];
                if (first) { setBoosterKey(first.key); setPacks(first.packs); }
              }}
              className="input"
            >
              {sets.map((s) => (
                <option key={s.setCode} value={s.setCode}>{boxSetLabel(s)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Booster</span>
            <select
              value={boosterOpt?.key ?? ""}
              onChange={(e) => {
                const next = set?.boosters.find((b) => b.key === e.target.value);
                if (next) { setBoosterKey(next.key); setPacks(next.packs); setOverrides({}); }
              }}
              className="input"
            >
              {(set?.boosters ?? []).map((b) => (
                <option key={b.key} value={b.key}>{BOOSTER_TYPES.find((t) => t.key === b.key)?.label ?? b.key}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Packs per box</span>
            <input
              type="number" min={1} max={100} value={packs}
              onChange={(e) => setPacks(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Box price ({currency})</span>
            <input
              type="number" min="0" step="0.01" value={boxPrice}
              onChange={(e) => setTypedPrice(e.target.value)}
              placeholder="what you'd pay"
              className="input"
            />
          </label>
        </div>
        {offer && (
          <p className="-mt-2 px-5 pb-5 text-xs text-slate-500">
            {usingOffer ? "Filled in with the" : "The"} cheapest in-stock {set.setName} booster box we track:{" "}
            <a
              href={offer.href}
              target="_blank"
              rel={outboundRel()}
              data-retailer={offer.retailer}
              data-page="box_ev"
              className="font-semibold text-brand-400 hover:underline"
            >
              {fmt(offer.priceCents)} at {offer.retailerName} →
            </a>{" "}
            · <Link href={`/sealed/${offer.boxSlug}`} className="text-slate-400 hover:underline">compare boxes</Link>
            {usingOffer ? (
              " · type your own price to override it."
            ) : (
              <>
                {" · "}
                <button type="button" onClick={() => setTypedPrice(null)} className="text-slate-400 hover:underline">
                  use this price
                </button>
              </>
            )}
          </p>
        )}
      </div>

      {/* ── Where the value sits ─────────────────────────────────────────────
          One proportional bar per pool. This is the whole story of a box in a
          single glance: bulk contributes a wide flat band, the chase tiers a
          thin bright one. */}
      <div className="card-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold text-white">Where the value sits</h2>
          <span className="text-xs text-slate-500">
            chase prints are <span className="num font-semibold text-brand-300">{(chaseShare * 100).toFixed(1)}%</span> of EV
          </span>
        </div>

        <div className="mt-4 space-y-2.5">
          {calc.lines.map((l) => {
            const p = poolByKey.get(l.pool);
            const coverage = l.total > 0 ? l.priced / l.total : 0;
            return (
              <div key={l.pool}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex items-center gap-1.5 font-semibold text-white">
                    {POOL_LABEL[l.pool]}
                    {l.chase && (
                      <span className="chip bg-brand-500/15 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide text-brand-300">
                        chase
                      </span>
                    )}
                  </span>
                  <span className="num shrink-0 text-sm font-bold text-accent">{money(l.contributionCents)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-800">
                  <div
                    className={`h-full rounded-full ${l.chase ? "bg-brand-400" : "bg-slate-600"}`}
                    style={{ width: `${Math.max(l.share * 100, l.contributionCents > 0 ? 1.5 : 0)}%` }}
                  />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                  <span className="num">{money(l.avgCents)} avg</span>
                  <span aria-hidden>·</span>
                  <span>{oneInPacks(l.rate) ?? `${Number(l.rate.toFixed(2))}× per pack`}</span>
                  <span aria-hidden>·</span>
                  <span className={coverage < 0.5 ? "text-gold" : undefined}>
                    {l.priced}/{l.total} priced
                    {coverage < 0.5 && l.total > 0 && " — understated"}
                  </span>
                  {p && p.topUsdCents > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span>top {money(p.topUsdCents)}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-slate-600">
          A pool&apos;s average divides by <em>every</em> card in it, so cards with no market price count as
          zero — which is honest for genuine bulk, but means a pool showing low coverage is
          <strong className="text-slate-500"> understating</strong> its true contribution, never overstating it.
          Implied pack size: <span className="num text-slate-500">{calc.cardsPerPack.toFixed(2)}</span> cards.
        </p>
      </div>

      {/* ── Pull rates ──────────────────────────────────────────────────────
          Collapsed by default. Wizards publishes slot structures, not every
          rate, so this is the assumption panel, and it says so plainly. */}
      <div className="card-surface p-5">
        <button
          type="button"
          onClick={() => setShowRates((v) => !v)}
          aria-expanded={showRates}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span>
            <span className="font-bold text-white">Pull rates</span>
            <span className="ml-2 text-xs text-slate-500">published pack structure · tune the assumptions</span>
          </span>
          <span className={`shrink-0 text-slate-500 transition-transform ${showRates ? "rotate-180" : ""}`} aria-hidden>▾</span>
        </button>

        {showRates && (
          <div className="mt-4 border-t border-ink-800 pt-4">
            <p className="text-[11px] leading-relaxed text-slate-500">
              <strong className="text-gold">Wizards of the Coast publishes the slot structure</strong> of its
              boosters, not a probability for every card, so the rates here are built from that structure and
              nothing else. {booster ? <>A {booster.label} is {packSummary(booster)}. </> : null}
              {booster?.source ? (
                <>Source:{" "}
                  <a href={booster.source.url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-400 hover:underline">{booster.source.title}</a>.{" "}
                </>
              ) : null}
              {booster?.sourceNote}{" "}
              Where Wizards gives no split (the wildcard slots can be any rarity), the slot is
              <strong className="text-gold"> valued at zero</strong> until you set a rate, so the expected value
              errs below what a box is likely to return rather than above it. Every rate is editable.
            </p>
            {unvaluedSlots(booster).length > 0 && (
              <p className="mt-2 text-[11px] leading-relaxed text-gold">
                Not valued: {unvaluedSlots(booster).map((sl) => `${sl.count} ${sl.label.toLowerCase()}`).join(", ")} per pack.
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {calc.lines.map((l) => (
                <label key={l.pool} className="block">
                  <span className="mb-1 block text-[11px] font-medium text-slate-400">
                    {POOL_LABEL[l.pool]}
                  </span>
                  <input
                    type="number" min="0" step="0.0001"
                    value={Number((calc.rates[l.pool] ?? 0).toFixed(5))}
                    onChange={(e) =>
                      setOverrides((cur) => ({ ...cur, [l.pool]: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    className="input py-1.5 text-sm"
                  />
                  <span className="mt-0.5 block text-[10px] text-slate-600">
                    {oneInPacks(calc.rates[l.pool] ?? 0) ?? "per pack"}
                  </span>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { setOverrides({}); setPacks(boosterOpt?.packs ?? DEFAULT_PACKS); }}
              className="mt-3 text-[11px] text-brand-400 hover:underline"
            >
              reset to defaults
            </button>
            <ul className="mt-4 space-y-1.5 text-[11px] leading-relaxed text-slate-500">
              {(booster?.slots ?? []).map((sl) => (
                <li key={sl.key}>
                  <strong className="text-slate-400">{sl.count} × {sl.label}:</strong> {sl.note}{sl.sourced ? "" : " (structure not confirmed against a Wizards article)"}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── What you're actually chasing ────────────────────────────────────
          The point of a box. Real cards, real prices, ordered by value. */}
      {chaseLines.map((l) => {
        const p = poolByKey.get(l.pool);
        if (!p || p.top.length === 0) return null;
        return (
          <div key={l.pool} className="card-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold text-white">
                {POOL_LABEL[l.pool]} <span className="text-sm font-normal text-slate-500">· {p.total} in {set.setCode}</span>
              </h2>
              <span className="text-xs text-slate-500">{oneInPacks(l.rate) ?? `${Number(l.rate.toFixed(2))}× per pack`}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {p.top.map((c) => (
                <CardQuickLink key={c.id} slug={c.slug} className="group block">
                  <div className="overflow-hidden rounded-lg border border-ink-700 transition-colors group-hover:border-brand-500">
                    <CardArt id={c.id} hasImage={c.hasImage} alt={`${c.name}${c.number ? ` ${c.number}` : ""}`} size="thumb" className="rounded-none" />
                  </div>
                  <div data-card-name className="mt-1 truncate text-[11px] font-semibold text-slate-300 group-hover:text-white">
                    {c.name}
                  </div>
                  <div className="num text-[11px] text-brand-300">
                    {c.usdCents != null && c.usdCents > 0 ? money(c.usdCents) : "—"}
                  </div>
                </CardQuickLink>
              ))}
            </div>
          </div>
        );
      })}

      {/* ── Disclosure ─────────────────────────────────────────────────────── */}
      <div className="card-surface p-5 text-[11px] leading-relaxed text-slate-600">
        <p>
          <strong className="text-slate-500">Every card is valued at its TCGplayer market price</strong> — the
          English Near-Mint fair-market figure TCGplayer publishes, not the cheapest listing.{" "}
          {currency !== "USD" && (
            <>
              Prices are converted from USD at an approximate, hand-maintained rate of{" "}
              <span className="num text-slate-500">US$1 ≈ {formatMoney(Math.round(100 * fx), currency)}</span>, so
              this is a <strong className="text-slate-500">reference value, not a local retail quote</strong>:
              singles in your market frequently sell above the converted figure, and TCGplayer may not even ship
              to you. The USD original is shown alongside the headline so you can check the conversion.{" "}
            </>
          )}
        </p>
        <p className="mt-2">
          Every rate comes from the <strong className="text-slate-500">pack structure Wizards publishes</strong>, and
          you control it; what Wizards does not publish is left at zero. EV is an average across many boxes: the distribution is heavily skewed by the chase tiers, so most
          boxes come in under it. It also assumes every card could be sold at market price, and bulk commons
          effectively cannot be. Want a specific card?{" "}
          <Link href="/browse" className="text-brand-400 hover:underline">Buying the single</Link> is the surer
          play, and you can <Link href="/sealed" className="text-brand-400 hover:underline">compare live box prices</Link>{" "}
          before you commit.
        </p>
      </div>
    </div>
  );
}
