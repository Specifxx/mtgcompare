"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCountry } from "../CountryProvider";
import { ShareButton } from "../ShareButton";
import type { Country } from "@/lib/country";
import { outboundRel } from "@/lib/affiliate";
import { money } from "@/lib/format";
import { changeSincePublished, totalFor, type MarketTotals, type PricedCard } from "@/lib/published-decks";

export interface BestStore {
  source: string;
  store: string;
  priceCents: number;
  buyHref: string;
}

export interface CheapestPrinting {
  id: number;
  href: string;
  label: string;
  priceCents: number;
}

export interface DeckViewLine {
  qty: number;
  commander: boolean;
  finish: "N" | "F";
  card: PricedCard & { id: number; href: string; name: string; number: string | null; variant: string | null; setCode: string };
  /** Cheapest in-stock store for THIS printing, per market (never eBay). */
  best: Partial<Record<Country, BestStore | null>>;
  /** Cheapest printing of the same card number, per market — the Budget build. */
  cheapest: Partial<Record<Country, CheapestPrinting | null>>;
}

// A published deck: the full list, its
// CURRENT total in the viewer's market, the cheapest store per card, a
// client-side Budget build that swaps each card for its cheapest printing,
// the change since publishing, Best Basket, Mass Entry copy and share.
export function PublishedDeckView(props: {
  title: string;
  commanderName: string;
  commanderSlug: string;
  partnerName: string | null;
  format: string;
  authorName: string | null;
  description: string | null;
  colors: string[];
  publishedAt: string;
  cardCount: number;
  lines: DeckViewLine[];
  publishedTotals: MarketTotals;
  massEntry: string;
  basketHref: string;
  builderHref: string;
}) {
  const { country } = useCountry();
  const fmt = (c: number) => money(c, country);
  const [budget, setBudget] = useState(false);
  const [copied, setCopied] = useState(false);

  const priced = useMemo(
    () =>
      props.lines.map((l) => {
        const asPublished = l.card.low[country] ?? null;
        const cheap = l.cheapest[country] ?? null;
        const unit = budget ? (cheap?.priceCents ?? asPublished) : asPublished;
        return { l, unit, swapped: budget && cheap && cheap.id !== l.card.id ? cheap : null };
      }),
    [props.lines, country, budget],
  );
  const missing = priced.filter((p) => p.unit == null).length;
  const total = priced.reduce((n, p) => n + (p.unit ?? 0) * p.l.qty, 0);
  const asPublishedTotal = missing === 0 && !budget ? total : null;
  const change = changeSincePublished(totalFor(props.publishedTotals, country), budget ? null : asPublishedTotal);
  const published = new Date(props.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  async function copy() {
    try {
      await navigator.clipboard.writeText(props.massEntry);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — nothing to do */
    }
  }

  return (
    <article>
      <header className="card-surface p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Link href={`/decks/commander/${props.commanderSlug}`} className="hover:text-slate-300">
            {props.commanderName}
          </Link>
          {props.partnerName ? ` + ${props.partnerName}` : ""}
          {` · ${props.format}`}
          {props.colors.length > 0 && ` · ${props.colors.join(" · ")}`}
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-white">{props.title}</h1>
        <p className="mt-1 text-xs text-slate-500">
          {props.cardCount} cards{props.authorName ? ` · by ${props.authorName}` : ""} · published {published}
        </p>
        {props.description && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-300">{props.description}</p>}

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {budget ? "Budget build" : "To build"} · {country}
            </div>
            <div className="num text-3xl font-extrabold text-accent">{fmt(total)}</div>
            <div className="text-xs text-slate-400">
              {missing > 0
                ? `${missing} card${missing === 1 ? " has" : "s have"} no price in your market yet — not included`
                : change != null
                  ? `${change > 0 ? "+" : ""}${change}% since it was published (${fmt(totalFor(props.publishedTotals, country)!)})`
                  : budget
                    ? "Each card at its cheapest printing"
                    : "Cheapest store per card, before postage"}
            </div>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" checked={budget} onChange={(e) => setBudget(e.target.checked)} className="h-4 w-4 accent-brand-500" />
            Budget build (cheapest printing of each card)
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={props.basketHref} className="btn-primary" title="The cheapest delivered order across stores, postage included">
            Buy this deck for less →
          </Link>
          <button type="button" onClick={copy} className="btn-ghost">
            {copied ? "✓ Copied" : "Copy list (TCGplayer Mass Entry)"}
          </button>
          <ShareButton />
          <Link href={props.builderHref} className="btn-ghost">
            Open in deck builder
          </Link>
        </div>
      </header>

      <ul className="card-surface mt-4 divide-y divide-ink-800 overflow-hidden">
        {priced.map(({ l, unit, swapped }) => {
          const best = l.best[country] ?? null;
          return (
            <li key={`${l.card.id}.${l.finish}`} className="flex items-start gap-3 p-3">
              <span className="num w-7 shrink-0 pt-0.5 text-right font-bold text-slate-300">{l.qty}×</span>
              <span className="min-w-0 flex-1">
                <Link href={swapped ? swapped.href : l.card.href} className="block font-semibold text-white hover:text-brand-400">
                  {l.card.name}
                  {l.commander ? <span className="chip ml-2 border border-gold/40 align-middle text-[10px] text-gold">Commander</span> : null}
                  {l.finish === "F" ? <span className="chip ml-2 border border-ink-700 align-middle text-[10px] text-slate-300">Foil</span> : null}
                </Link>
                <span className="block text-xs text-slate-500">
                  {swapped ? `${swapped.label} (cheapest printing)` : `${l.card.setCode} · ${l.card.number ?? ""}${l.card.variant ? ` ${l.card.variant}` : ""}`}
                  {!swapped && best ? ` · cheapest at ${best.store}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="num text-sm font-semibold text-white">{unit != null ? fmt(unit * l.qty) : <span className="font-normal text-slate-500">no price</span>}</span>
                {!swapped && best && (
                  <a href={best.buyHref} target="_blank" rel={outboundRel()} data-retailer={best.source.replace("store:", "")} data-page="deck" className="btn-ghost text-xs">
                    Buy
                  </a>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        Prices are each card&apos;s cheapest in-stock listing we track in your market, imported once a day; postage is extra and Best Basket works out
        the cheapest delivered order.
      </p>
    </article>
  );
}
