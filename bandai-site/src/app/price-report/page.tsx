import type { Metadata } from "next";
import Link from "@/components/Link";
import { SITE } from "@/site.config";
import { canon, SITE_URL } from "@/lib/site";
import { meta, movers, products, refCents, summaryOf } from "@/lib/data";
import { money, pct } from "@/lib/format";
import { shortName } from "@/lib/names";
import { MARKETS, MARKET_LABEL } from "@/lib/site-types";
import { reportMonth, sealedLines, storeCoverage, storesVsTcgplayer, type ReportRow } from "@/lib/market-report";

// The self-updating monthly price report (DECISIONS.md, "Self-updating price report",
// 2026-11-02): the page outreach offers to writers and creators, rebuilt from the
// committed data on every release, so nobody writes it. One URL for good: a link to
// it never goes stale. A day per page, like every page here.
export const revalidate = 86400;

export function generateMetadata(): Metadata {
  const month = reportMonth(meta()?.updatedAt);
  return {
    title: `${SITE.gameShort} Price Report, ${month}: Stores vs TCGplayer`,
    description: `How ${SITE.game} prices compare across ${SITE.stores.length} stores in six markets this month: how often a store undercuts TCGplayer, the cheapest sealed boxes and the biggest price movers. Free to cite.`,
    ...canon("/price-report"),
  };
}

function rows(): ReportRow[] {
  return products().map((p) => {
    const s = summaryOf(p.id);
    return { p, ref: refCents(p.id), best: s.best, change30d: s.change30d };
  });
}

export default function PriceReport() {
  const m = meta();
  const month = reportMonth(m?.updatedAt);
  const asOf = m?.updatedAt ? new Date(m.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null;
  const all = rows();
  const cards = all.filter((r) => r.p.kind === "card");
  const beat = storesVsTcgplayer(cards);
  const sealedBeat = storesVsTcgplayer(all.filter((r) => r.p.kind === "sealed"), 1000);
  const coverage = storeCoverage(all, MARKETS);
  const sealed = sealedLines(all, MARKETS);
  // Thirty days once there is a month of history, else the week (a new site has only days).
  const m30 = movers(30, 300);
  const span = m30.up.length + m30.down.length ? "30 days" : "7 days";
  const mo = span === "30 days" ? m30 : movers(7, 300);
  const share = beat.compared ? Math.round((beat.storeCheaper / beat.compared) * 100) : null;
  const sealedShare = sealedBeat.compared ? Math.round((sealedBeat.storeCheaper / sealedBeat.compared) * 100) : null;
  const citation = `${SITE.name}, "${SITE.gameShort} Price Report, ${month}", ${SITE_URL}/price-report`;

  return (
    <article className="flex max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-black">{SITE.gameShort} price report, {month}</h1>
        <p className="text-muted">
          {SITE.game} prices across {SITE.stores.length} stores in {MARKETS.length} markets, compared with TCGplayer. Rebuilt from each day&apos;s prices{asOf ? `; last updated ${asOf}` : ""}.
          Free to quote with a link.
        </p>
      </header>

      <section className="card-surface flex flex-col gap-3 p-4">
        <h2 className="text-lg font-bold">Do stores beat TCGplayer?</h2>
        {share == null ? (
          <p className="text-sm text-muted">Not enough US store prices yet to compare.</p>
        ) : (
          <p>
            For <b>{beat.compared.toLocaleString("en-US")}</b> {SITE.gameShort} cards worth $5 or more with an in-stock US store price, a store was cheaper than TCGplayer&apos;s market price on{" "}
            <b>{share}%</b> of them{beat.medianSaving != null ? <>, by a median of <b>{beat.medianSaving}%</b></> : null}.
            {sealedShare != null ? <> For sealed product worth $10 or more, a store was cheaper on <b>{sealedShare}%</b> of {sealedBeat.compared.toLocaleString("en-US")}{sealedBeat.medianSaving != null ? <>, by a median of {sealedBeat.medianSaving}%</> : null}.</> : null}
          </p>
        )}
        <p className="text-xs text-muted">Item prices before shipping, in US dollars on both sides; nothing is converted.</p>
      </section>

      {sealed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">The most valuable sealed products in US stores today</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr><th className="py-1 pr-3">Product</th><th className="py-1 pr-3 text-right">TCGplayer market</th><th className="py-1 pr-3 text-right">Cheapest US store</th><th className="py-1 pr-3 text-right">vs TCGplayer</th><th className="py-1 text-right">Markets in stock</th></tr>
              </thead>
              <tbody>
                {sealed.map((s) => (
                  <tr key={s.p.id} className="border-t border-ink-800">
                    <td className="py-1.5 pr-3"><Link className="hover:underline" href={`/card/${s.p.slug}`}>{shortName(s.p.name)}</Link></td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{money(s.ref)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{s.us ? money(s.us.cents, s.us.currency) : "—"}</td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums ${s.vsRef == null ? "" : s.vsRef > 0 ? "text-up" : "text-down"}`}>{s.vsRef == null ? "—" : s.vsRef > 0 ? `${s.vsRef}% under` : s.vsRef < 0 ? `${-s.vsRef}% over` : "same"}</td>
                    <td className="py-1.5 text-right tabular-nums">{s.marketsInStock} of {MARKETS.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Where you can buy from a store</h2>
        <p className="text-sm text-muted">Products with at least one in-stock store price, by market. Each market compares only stores that charge in its own currency.</p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MARKETS.map((mk) => (
            <li key={mk} className="card-surface p-3 text-sm"><span className="block text-muted">{MARKET_LABEL[mk]}</span><b className="text-xl tabular-nums">{coverage[mk].toLocaleString("en-US")}</b></li>
          ))}
        </ul>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {([[`Biggest risers, ${span}`, mo.up], [`Biggest fallers, ${span}`, mo.down]] as const).map(([title, list]) => (
          <div key={title} className="card-surface p-4">
            <h2 className="mb-2 text-lg font-bold">{title}</h2>
            {!list.length && <p className="text-sm text-muted">Not enough price history yet.</p>}
            <ol>
              {list.slice(0, 8).map((r, i) => (
                <li key={r.p.id} className="flex items-center justify-between gap-2 border-t border-ink-800 py-1.5 text-sm">
                  <span className="w-6 text-muted">{i + 1}</span>
                  <Link className="flex-1 truncate hover:underline" href={`/card/${r.p.slug}`}>{shortName(r.p.name)}</Link>
                  <span className="tabular-nums">{money(r.cents)}</span>
                  <span className={`w-16 text-right tabular-nums ${r.change >= 0 ? "text-up" : "text-down"}`}>{pct(r.change)}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>
      <p className="text-sm"><Link className="link" href="/movers">Every price mover →</Link> · <Link className="link" href="/methodology">How prices are collected →</Link></p>

      <section className="card-surface flex flex-col gap-2 p-4">
        <h2 className="text-lg font-bold">Quote this report</h2>
        <p className="text-sm">You&apos;re welcome to use any number here in an article, video or store post, with a link to this page. It updates itself, so the link stays current.</p>
        <p className="rounded bg-ink-900 p-2 font-mono text-xs">{citation}</p>
      </section>
    </article>
  );
}
