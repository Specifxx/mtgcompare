"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { COUNTRIES, MARKETS, type Country } from "@/lib/country";
import { GUIDE_SIZES, GUIDE_SORTS } from "@/lib/price-guide-query";

// The guide's toolbar (RiftCompare's PriceGuideToolbar): search within the
// guide, sort, page size and the region toggle. Everything is the URL: a change
// pushes a new query and the server renders it, so the page works without JS
// through the form and links (`/price-guide?q=…`). A link that carries
// ?market=AU shows "Prices for Australia from this link · Use my market".
export function PriceGuideToolbar({ sort, size, q, shownMarket, ownMarket }: { sort: string; size: number; q: string; shownMarket: Country; ownMarket: Country }) {
  const router = useRouter();
  const params = useSearchParams();
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);

  const push = (mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/price-guide?${qs}` : "/price-guide", { scroll: false });
  };
  const override = shownMarket !== ownMarket;
  const regionHref = (m: Country | null) => {
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    if (m && m !== ownMarket) next.set("market", m);
    else next.delete("market");
    const qs = next.toString();
    return qs ? `/price-guide?${qs}` : "/price-guide";
  };
  const field = "h-11 rounded-md border border-ink-700 bg-ink-900 px-3 text-sm font-medium text-slate-100 outline-none focus:border-brand-500 focus-visible:ring-1 focus-visible:ring-brand-500/50";
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <form
          role="search"
          className="min-w-0 flex-1 basis-60"
          onSubmit={(e) => {
            e.preventDefault();
            push((p) => (text.trim() ? p.set("q", text.trim()) : p.delete("q")));
          }}
        >
          <input type="search" name="q" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search the guide: name, number, set…" aria-label="Search the price guide" className="input h-11 w-full" />
        </form>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <span className="hidden sm:inline">Sort</span>
          <select aria-label="Sort the price guide" value={sort} onChange={(e) => push((p) => p.set("sort", e.target.value))} className={field}>
            {GUIDE_SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <span className="hidden sm:inline">Show</span>
          <select aria-label="Rows per page" value={size} onChange={(e) => push((p) => p.set("per", e.target.value))} className={field}>
            {GUIDE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-400">Prices in</span>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Market">
          {MARKETS.map((m) => (
            <Link
              key={m}
              href={regionHref(m)}
              scroll={false}
              aria-current={m === shownMarket ? "true" : undefined}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${m === shownMarket ? "border-brand-500 bg-brand-500/15 text-white" : "border-ink-700 text-slate-300 hover:border-ink-600"}`}
            >
              <span aria-hidden>{COUNTRIES[m].flag} </span>
              {COUNTRIES[m].currency}
            </Link>
          ))}
        </div>
        {override ? (
          <span className="text-xs text-slate-400">
            Prices for {COUNTRIES[shownMarket].place} from this link ·{" "}
            <Link href={regionHref(null)} scroll={false} className="text-brand-400 hover:underline">
              Use my market
            </Link>
          </span>
        ) : null}
      </div>
    </div>
  );
}
