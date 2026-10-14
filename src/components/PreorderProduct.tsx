import Link from "next/link";
import { COUNTRIES, type Country } from "@/lib/country";
import type { SealedLite } from "@/lib/data";
import { ago, money, usd } from "@/lib/format";
import { tcgplayerImage } from "@/lib/images";
import { boardSummary, type PreorderLine, type PreorderRow } from "@/lib/preorders";
import { outboundRel } from "@/lib/affiliate";

const VISIBLE = 5;

// One product of a pre-order page (OP Compare's PreorderProduct, on MTG Compare's
// data): the visitor's market only, in its currency, one row per seller, open
// pre-orders cheapest first by ITEM price, then rows we could not re-read in 72
// hours, then sold-out stores, each saying which it is. TCGplayer's lowest listing
// is a row in the US, ranked by price like the stores; eBay is never a row (its
// data is not published: the page offers a search beside the lists instead).
// Every outbound link is the affiliate-tagged one lib/quick-view built.
export function PreorderProduct({ s, rows, line, setCode, country, page }: { s: SealedLite; rows: PreorderRow[]; line: PreorderLine | null; setCode: string | null; country: Country; page: string }) {
  const c = COUNTRIES[country];
  const { cheapest, openStores } = boardSummary(rows);
  const shown = rows.slice(0, VISIBLE), more = rows.slice(VISIBLE);
  const row = (r: PreorderRow, i: number) => {
    const open = r.state === "open";
    return (
      <li key={`${r.source}-${i}`} className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <span className="num w-5 shrink-0 text-center text-sm text-slate-500">{i + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className={`truncate text-[15px] font-semibold ${open ? "text-white" : "text-slate-400"}`}>{r.label}</span>
            {open && r === cheapest ? <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">Cheapest</span> : null}
            {r.tcgplayer ? <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">TCGplayer</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {r.state === "open" ? (r.tcgplayer ? "lowest listing" : "pre-order open") : r.state === "soldout" ? `sold out · last seen ${ago(r.updatedAt)}` : `not re-checked in 72 hours · last seen ${ago(r.updatedAt)}`}
            {open ? ` · ${r.postage}` : ""}
          </p>
        </div>
        <span className={`num shrink-0 text-right text-base font-bold sm:text-lg ${open ? "text-accent" : "text-slate-500 line-through decoration-slate-600"}`}>{money(r.priceCents, country)}</span>
        <a
          href={r.href}
          target="_blank"
          rel={outboundRel()}
          data-retailer={r.retailer}
          data-page={page}
          data-card={s.slug}
          data-surface={open ? "preorder_row" : "preorder_sold_out"}
          className={`${open ? "btn-primary" : "btn-ghost"} shrink-0 px-3 sm:w-40 sm:px-4`}
          aria-label={`${open ? (r.tcgplayer ? "Buy on" : "Pre-order at") : "Check"} ${r.label}`}
        >
          <span className="hidden sm:inline">{open ? (r.tcgplayer ? "Buy on TCGplayer →" : "Pre-order →") : "Check →"}</span>
          <span className="sm:hidden">→</span>
        </a>
      </li>
    );
  };

  return (
    <section className="card-surface overflow-hidden" aria-label={s.name}>
      <div className="flex items-center gap-4 border-b border-ink-800 px-4 py-4 sm:px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tcgplayerImage(s.id, "200w")} alt="" loading="lazy" decoding="async" className="h-16 w-16 shrink-0 rounded-lg bg-white/90 object-contain p-1" />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-extrabold leading-tight text-white">
            <Link href={`/sealed/${s.slug}`} className="hover:text-brand-400">
              {s.name}
            </Link>
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            {line ? line.name : s.kind}
            {setCode ? ` · ${setCode}` : ""}
            {s.packCount ? ` · ${s.packCount} ${s.packCount === 1 ? "pack" : "packs"}` : ""}
            {s.marketUsd ? ` · TCGplayer market ${usd(s.marketUsd)}` : ""}
          </p>
        </div>
        {cheapest ? (
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">From · {c.code}</p>
            <p className="num text-xl font-extrabold text-accent">{money(cheapest.priceCents, country)}</p>
            <p className="text-[11px] text-slate-500">{openStores ? `${openStores} ${openStores === 1 ? "store" : "stores"}` : "TCGplayer only"}</p>
          </div>
        ) : null}
      </div>

      {rows.length ? (
        <>
          <ol className="divide-y divide-ink-800">{shown.map(row)}</ol>
          {more.length ? (
            <details className="border-t border-ink-800">
              <summary className="cursor-pointer px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200">
                {more.length} more {more.length === 1 ? "seller" : "sellers"}
              </summary>
              <ol className="divide-y divide-ink-800 border-t border-ink-800">{more.map((r, i) => row(r, i + VISIBLE))}</ol>
            </details>
          ) : null}
        </>
      ) : (
        <p className="px-5 py-5 text-sm text-slate-300">
          No {c.adjective} store we track lists a pre-order for this yet.{s.marketUsd ? " TCGplayer's market price is above, for reference." : ""} The list fills in on its own as stores open pre-orders.
        </p>
      )}
    </section>
  );
}
