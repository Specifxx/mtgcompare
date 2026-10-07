"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Country } from "@/lib/country";
import type { DealList, TcgDealRow, VsEbayDealRow } from "@/lib/deal-pages";
import { hrefFor, type DealFinderParams } from "@/lib/deal-finder-href";
import { readWatchlist } from "@/components/WatchButton";
import { DealPager, TcgDealTable, VsEbayTable } from "@/components/DealTable";

type Result =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ok"; watched: number; slugs: number; view: "tcg"; list: DealList<TcgDealRow> }
  | { state: "ok"; watched: number; slugs: number; view: "vs-ebay"; list: DealList<VsEbayDealRow> };

// "Only my cards" for Plus members. The watchlist lives in this browser
// (components/WatchButton.tsx), so the server cannot filter by it on its own:
// this island sends the watched card slugs to /api/deal-finder, which runs the
// same ranking over the same cached inputs with the filter applied BEFORE
// paging, and renders the same table the server page renders.
export function MineDeals({ params, country, buy }: { params: DealFinderParams; country: Country; buy: string[] | null }) {
  const [res, setRes] = useState<Result>({ state: "loading" });
  const view = params.view === "vs-ebay" ? "vs-ebay" : "tcg";
  const { sort, page } = params;
  const buyKey = buy?.join(",") ?? null;

  useEffect(() => {
    let live = true;
    const slugs = readWatchlist()
      .filter((w) => w.kind === "card")
      .map((w) => w.slug);
    setRes({ state: "loading" });
    fetch("/api/deal-finder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ view, sort, page, buy: buyKey == null ? null : buyKey ? buyKey.split(",") : [], slugs }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) return setRes({ state: "error", message: j.error ?? "Couldn't load your cards." });
        setRes({ state: "ok", watched: j.watched, slugs: Math.max(slugs.length, j.watched ?? 0), view: j.view, list: j.list });
      })
      .catch(() => live && setRes({ state: "error", message: "Couldn't load your cards — check your connection and try again." }));
    return () => {
      live = false;
    };
  }, [view, sort, page, buyKey]);

  if (res.state === "loading") {
    return (
      <div className="card-surface p-4" aria-busy="true">
        <p className="text-sm text-slate-400">Checking your watchlist…</p>
        <ul className="mt-3 space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-10 animate-pulse rounded bg-ink-800" />
          ))}
        </ul>
      </div>
    );
  }
  if (res.state === "error") return <div className="card-surface p-6 text-center text-sm text-slate-400">{res.message}</div>;

  const { list } = res;
  const what = view === "vs-ebay" ? "below eBay at a store" : "below TCGplayer market";
  if (list.rows.length === 0) {
    return (
      <div className="card-surface grid place-items-center p-10 text-center text-sm text-slate-400">
        {res.slugs === 0 ? (
          <>You aren&apos;t watching any cards yet — tap the heart on any card to add it to your watchlist.</>
        ) : res.watched === 1 ? (
          <>Your watched card isn&apos;t {what} right now.</>
        ) : (
          <>None of your {res.watched.toLocaleString("en-US")} watched cards is {what} right now.</>
        )}{" "}
        {params.buy !== null && view === "tcg" ? (
          <Link href={hrefFor(params, { buy: null, page: 1 })} className="text-brand-400 hover:underline">
            Try every store.
          </Link>
        ) : null}
      </div>
    );
  }
  return (
    <>
      <p className="mb-2 text-xs text-slate-500">
        Checking the {res.watched.toLocaleString("en-US")} cards on your watchlist in this browser.
      </p>
      <div className="card-surface overflow-x-auto">
        {res.view === "vs-ebay" ? <VsEbayTable rows={res.list.rows} country={country} /> : <TcgDealTable rows={res.list.rows} country={country} />}
      </div>
      <DealPager total={list.total} page={list.page} pageCount={list.pageCount} linkFor={(p) => hrefFor(params, { page: p })} />
    </>
  );
}
