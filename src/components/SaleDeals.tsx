"use client";

// The Black Friday / Cyber Monday pages' ONE deal list (lib/sale-deals.ts; owner's review, 2026-11-24). The server renders it with
// the default filters, so the first screen of the HTML already holds deal rows; the toggle, filters and sort then run in the browser
// over the same rows (no request). Every row: a 64px thumbnail on a white tile, the name, a discount badge, today's price with the
// reference price struck through beside it, "checked N h ago" (flagged past 12 hours), the measured shipping or an estimated
// delivered price, a 30-day sparkline, the store's buy button (primary) and an eBay text link (secondary). After the fifth row,
// one slim bar of alerts (email, Discord, Telegram). Clicks count under placement "bf-drops" (the 3 Dec read).
import Link from "@/components/Link";
import { useMemo, useState, type FormEvent } from "react";
import { track } from "@vercel/analytics";
import { OutboundLink } from "@/components/OutboundLink";
import { ALERT_SERVICE } from "@/components/PriceAlertForm";
import { TELEGRAM_URL } from "@/components/DiscordCta";
import { REL_SPONSORED } from "@/lib/affiliate";
import { money, timeAgo } from "@/lib/format";
import { dropDate } from "@/lib/real-drops";
import {
  applyFilters,
  DEFAULT_FILTERS,
  deliveredCents,
  isStale,
  perPack,
  pctOn,
  PRICE_BANDS,
  refCents,
  sparkPath,
  typesOf,
  type SaleBasis,
  type SaleDealRow,
  type SaleFilters,
} from "@/lib/sale-deals";

const PAGE = 20;
const ALERT_AFTER = 5;

const BASIS_LABEL: Record<SaleBasis, { tab: string; ref: string; tip: string }> = {
  typical: {
    tab: "Biggest price drops",
    ref: "30-day typical",
    tip: "Against the product's own typical price: the median of its cheapest in-stock price on each of the last 30 days we recorded (two weeks of records at least; a day far under the rest is left out as a wrong listing).",
  },
  median: {
    tab: "Under other stores today",
    ref: "store median",
    tip: "Against the middle price of the stores that have it in stock today (three or more stores, at least 10% under, never under half: that is a misfiled listing).",
  },
};

export function SaleDeals({
  rows,
  market,
  regionCode,
  regionName,
  siteKey,
  discordHref,
  ebayLabel,
  ebayRetailer,
}: {
  rows: SaleDealRow[];
  market: string;
  regionCode: string;
  ebayRetailer: string;
  regionName: string;
  siteKey: string;
  discordHref: string | null;
  ebayLabel: string;
}) {
  const [f, setF] = useState<SaleFilters>(() => ({ ...DEFAULT_FILTERS, basis: rows.some((r) => r.typical) ? "typical" : "median" }));
  const [shown, setShown] = useState(PAGE);
  const list = useMemo(() => applyFilters(rows, f), [rows, f]);
  const types = useMemo(() => typesOf(rows, f.basis), [rows, f.basis]);
  const fmt = (c: number) => money(c, market);
  const set = (patch: Partial<SaleFilters>) => {
    setF((x) => ({ ...x, ...patch }));
    setShown(PAGE);
    track("bf_filter", { key: Object.keys(patch)[0] ?? "", value: String(Object.values(patch)[0] ?? "") });
  };
  const counts = { typical: rows.filter((r) => r.typical).length, median: rows.filter((r) => r.median).length };
  const anyPack = rows.some((r) => r.packs);
  const sel = "min-h-11 rounded-lg border border-line bg-surface px-2.5 text-sm";

  return (
    <div>
      <div role="tablist" aria-label="Compare against" className="inline-flex rounded-xl border border-line p-1">
        {(["typical", "median"] as const).map((b) => (
          <button
            key={b}
            role="tab"
            type="button"
            aria-selected={f.basis === b}
            disabled={!counts[b]}
            onClick={() => set({ basis: b, type: "" })}
            className={`min-h-10 rounded-lg px-3 text-sm font-semibold disabled:opacity-40 ${f.basis === b ? "bg-brand text-white" : "text-muted hover:text-ink"}`}
          >
            {BASIS_LABEL[b].tab} <span className="tabular font-normal opacity-80">({counts[b]})</span>
          </button>
        ))}
      </div>
      <details className="ml-2 inline-block align-middle text-sm">
        <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 text-muted hover:text-ink" aria-label="How we calculate">
          <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full border border-current text-[11px] font-bold">i</span>
          How we calculate
        </summary>
        <p className="mt-2 max-w-xl text-xs leading-5 text-muted">
          {BASIS_LABEL[f.basis].tip} It says what stores asked, not what they will charge next. Shipping is the store&rsquo;s own checkout as we measured it for one
          item to {regionName}, where we have it.
        </p>
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Filter and sort the deals">
        <label className="sr-only" htmlFor="bf-type">Product type</label>
        <select id="bf-type" className={sel} value={f.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="">All product types</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="bf-band">Price</label>
        <select id="bf-band" className={sel} value={f.band} onChange={(e) => set({ band: e.target.value as SaleFilters["band"] })}>
          <option value="">Any price</option>
          {PRICE_BANDS.map((b) => (
            <option key={b.key} value={b.key}>
              {b.max === Infinity ? `${fmt(b.min)}+` : b.min === 0 ? `Under ${fmt(b.max)}` : `${fmt(b.min)}–${fmt(b.max)}`}
            </option>
          ))}
        </select>
        {rows.some((r) => r.japanese) && (
          <>
            <label className="sr-only" htmlFor="bf-lang">Language</label>
            <select id="bf-lang" className={sel} value={f.lang} onChange={(e) => set({ lang: e.target.value as SaleFilters["lang"] })}>
              <option value="all">English and Japanese</option>
              <option value="en">English</option>
              <option value="ja">Japanese</option>
            </select>
          </>
        )}
        <label className="sr-only" htmlFor="bf-stock">Availability</label>
        <select id="bf-stock" className={sel} value={f.stock} onChange={(e) => set({ stock: e.target.value as SaleFilters["stock"] })}>
          <option value="all">In stock and pre-order</option>
          <option value="now">In stock</option>
          <option value="pre">Pre-order</option>
        </select>
        <label className="sr-only" htmlFor="bf-sort">Sort</label>
        <select id="bf-sort" className={sel} value={f.sort} onChange={(e) => set({ sort: e.target.value as SaleFilters["sort"] })}>
          <option value="pct">Sort: % off</option>
          <option value="price">Sort: price, low to high</option>
          {anyPack && <option value="pack">Sort: price per pack</option>}
        </select>
      </div>

      {list.length ? (
        <ol className="mt-4 grid gap-2">
          {list.slice(0, shown).map((row, i) => (
            <SaleRow key={row.slug} row={row} basis={f.basis} fmt={fmt} regionCode={regionCode} ebayRetailer={ebayRetailer} region={regionName} ebayLabel={ebayLabel} alertBar={i === ALERT_AFTER - 1} siteKey={siteKey} market={market} discordHref={discordHref} />
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-xl border border-line px-4 py-6 text-sm text-muted">No deal matches these filters right now. Try another product type or price.</p>
      )}
      {list.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="btn-secondary mt-3 min-h-11 w-full px-4 text-sm sm:w-auto">
          Show {Math.min(PAGE, list.length - shown)} more of {list.length}
        </button>
      )}
    </div>
  );
}

function SaleRow({
  row,
  basis,
  fmt,
  regionCode,
  ebayRetailer,
  region,
  ebayLabel,
  alertBar,
  siteKey,
  market,
  discordHref,
}: {
  row: SaleDealRow;
  basis: SaleBasis;
  fmt: (c: number) => string;
  regionCode: string;
  ebayRetailer: string;
  region: string;
  ebayLabel: string;
  alertBar: boolean;
  siteKey: string;
  market: string;
  discordHref: string | null;
}) {
  const pct = pctOn(row, basis);
  const ref = refCents(row, basis);
  const stale = isStale(row.checkedAt);
  const delivered = deliveredCents(row);
  const pp = perPack(row);
  const path = sparkPath(row.spark, 72, 22);
  return (
    <>
      <li className="card grid grid-cols-[64px_1fr] gap-x-3 gap-y-2 p-3 sm:grid-cols-[72px_minmax(0,1fr)_96px_9.5rem_8.5rem] sm:items-center sm:gap-x-4" data-cents={row.priceCents}>
        <div className="row-span-2 grid h-16 w-16 place-items-center overflow-hidden rounded-lg bg-white sm:row-span-1 sm:h-[72px] sm:w-[72px]">
          {row.imageUrl ? <img src={row.imageUrl} alt={row.name} width={72} height={72} loading="lazy" decoding="async" className="h-full w-full object-contain p-1" /> : null}
        </div>
        <div className="min-w-0">
          <Link href={`/${regionCode}/p/${row.slug}`} prefetch={false} className="block font-semibold leading-snug hover:text-brand">
            {row.name}
          </Link>
          <span className="mt-0.5 block text-xs text-muted">
            {row.productType}
            {row.preorder ? " · Pre-order" : ""}
            {pp != null ? ` · ${fmt(pp)}/pack` : ""}
            {basis === "typical" && row.typical?.lowest ? ` · lowest since ${dropDate(row.typical.sinceDay)}` : ""}
          </span>
          <span className={`mt-0.5 block text-xs ${stale ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted"}`}>
            {stale ? "Price checked " : "Checked "}
            <time dateTime={row.checkedAt} suppressHydrationWarning>
              {timeAgo(row.checkedAt)}
            </time>
            {stale ? ": check the store before you buy" : ""}
          </span>
        </div>
        <div className="col-start-2 sm:col-start-auto" aria-hidden={!path}>
          {path ? (
            <svg width="72" height="22" viewBox="0 0 72 22" role="img" aria-label={`${row.name}: cheapest in-stock price over the last 30 days`} className="text-brand">
              <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          ) : null}
        </div>
        <div className="col-span-2 flex flex-wrap items-baseline gap-x-2 sm:col-span-1 sm:block sm:text-right">
          {pct != null && <span className="mr-1 inline-block rounded-md bg-open px-1.5 py-0.5 text-sm font-bold text-white sm:mb-1" title={BASIS_LABEL[basis].tip}>{pct}% under {basis === "median" ? "median" : "30-day typical"}</span>}
          <b className="tabular font-display text-xl">{fmt(row.priceCents)}</b>
          {ref != null && (
            <s className="tabular ml-1 text-sm text-muted" title={BASIS_LABEL[basis].ref}>
              <span className="sr-only">{BASIS_LABEL[basis].ref} </span>
              {fmt(ref)}
            </s>
          )}
          <span className="block w-full text-xs text-muted">
            {row.shipText == null ? "Shipping at checkout" : delivered != null && row.shipMinCents ? `≈ ${fmt(delivered)} delivered` : row.shipText}
          </span>
        </div>
        <div className="col-span-2 flex items-center gap-3 sm:col-span-1 sm:flex-col sm:items-stretch sm:gap-1">
          <OutboundLink href={row.buyHref} rel={row.buyRel} retailer={row.retailer} placement="bf-drops" className="btn-primary min-h-11 flex-1 truncate px-3 text-center text-sm sm:flex-none" aria-label={`Buy ${row.name} at ${row.storeName}`}>
            Buy at {row.storeName}
          </OutboundLink>
          <OutboundLink href={row.ebayHref} rel={REL_SPONSORED} retailer={ebayRetailer} placement="bf-drops" className="min-h-11 shrink-0 content-center text-center text-xs font-semibold text-muted underline underline-offset-2 hover:text-ink sm:min-h-0" aria-label={`${row.name} on ${ebayLabel} (paid link)`}>
            or on eBay
          </OutboundLink>
        </div>
      </li>
      {alertBar && <AlertsBar siteKey={siteKey} market={market} discordHref={discordHref} region={region} />}
    </>
  );
}

function AlertsBar({ siteKey, market, discordHref, region }: { siteKey: string; market: string; discordHref: string | null; region: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (String(fd.get("website") ?? "")) return setState("done");
    setState("sending");
    try {
      const r = await fetch(ALERT_SERVICE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site: siteKey, region: market, email: String(fd.get("email") ?? ""), kind: "weekly" }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean };
      if (r.ok && j.ok) {
        track("weekly_signup", { placement: "black-friday", region: market });
        setState("done");
      } else setState("error");
    } catch {
      setState("error");
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-line px-3 py-2 text-sm" aria-label="Deal alerts">
      <span className="font-semibold">Get new deals as they land:</span>
      {state === "done" ? (
        <span role="status" className="text-muted">Check your inbox to confirm.</span>
      ) : (
        <form onSubmit={submit} className="flex min-w-0 flex-1 basis-56 gap-2">
          <label className="sr-only" htmlFor="bf-alert-email">Your email</label>
          <input id="bf-alert-email" name="email" type="email" required autoComplete="email" placeholder="Your email" className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-transparent px-2.5 text-base sm:text-sm" />
          <span className="sr-only" aria-hidden="true">
            <input name="website" tabIndex={-1} autoComplete="off" />
          </span>
          <button type="submit" disabled={state === "sending"} className="btn-secondary min-h-10 shrink-0 px-3 text-sm">
            {state === "sending" ? "Saving…" : "Email me"}
          </button>
        </form>
      )}
      {discordHref && (
        <a href={discordHref} target="_blank" rel="noopener noreferrer" className="min-h-10 content-center font-semibold text-[#5865F2] underline underline-offset-2">
          Discord
        </a>
      )}
      <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="min-h-10 content-center font-semibold text-[#229ED9] underline underline-offset-2">
        Telegram
      </a>
      {state === "error" && <span role="alert" className="w-full text-xs text-red-600">Couldn&rsquo;t save that. Please try again.</span>}
    </li>
  );
}
