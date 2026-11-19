import type { Metadata } from "next";
import Link from "@/components/Link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Section } from "@/components/Section";
import { CARDS_HUB, cardImage, cardPath, readMovers, readSets, usd, type CardMover } from "@/lib/cards";
import { shortDate } from "@/lib/hub-copy";
import { breadcrumbJsonLd, jsonLd } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";

// Rising and falling cards (owner, 2026-11-19, the collector side; lib/cards.ts "Card movers"): the biggest TCGplayer market price
// moves over one day and seven, finish by finish, cards of US$2 or more only. Reads data/cards/movers.json, nothing else; no eBay.
// Rendered per request and kept by Vercel's CDN for a day (next.config.js CDN_PAGES). Noindex until the seven-day lists are full,
// so Google never sees an empty page; out of the sitemap until then too.
export const dynamic = "force-dynamic";

const FINISH = ["", "Foil", "Etched"] as const;
const FULL = 20;

export function generateMetadata(): Metadata {
  const m = readMovers();
  const rich = !!m && m.d7.up.length >= FULL && m.d7.down.length >= FULL;
  return {
    title: "Rising and falling MTG card prices this week",
    description: "The Magic cards whose TCGplayer market price moved most in the last day and the last week, normal and foil, cards worth US$2 or more.",
    alternates: { canonical: `${CARDS_HUB}/movers` },
    robots: rich ? undefined : { index: false, follow: true },
  };
}

function MoverList({ rows, names }: { rows: CardMover[]; names: Map<string, string> }) {
  if (!rows.length) return <p className="text-sm text-muted">Not enough price history yet. This list fills in as the daily prices come in.</p>;
  return (
    <ol className="grid gap-2 sm:grid-cols-2">
      {rows.map((m) => (
        <li key={m.id}>
          <Link href={cardPath(m.set, m.s)} prefetch={false} className="card flex items-center gap-3 p-2 pr-3 hover:text-brand">
            <img src={cardImage(m.id)} alt={m.n} width={40} height={56} loading="lazy" decoding="async" className="h-14 w-10 shrink-0 rounded object-contain" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {m.n}
                {m.f ? <span className="ml-1 text-xs font-medium text-muted">{FINISH[m.f]}</span> : null}
              </span>
              <span className="block truncate text-xs text-muted">
                {names.get(m.set) ?? m.set}
                {m.no ? ` · #${m.no}` : ""} · was {usd(m.from)}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="tabular block font-display font-extrabold">{usd(m.to)}</span>
              <span className={`tabular block text-xs font-bold ${m.pct > 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                {m.pct > 0 ? "▲" : "▼"} {Math.abs(m.pct)}%
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export default function CardMoversPage() {
  const m = readMovers();
  const names = new Map(readSets().sets.map((s) => [s.slug, s.name]));
  const crumbs = [{ href: "/", label: SITE_NAME }, { href: CARDS_HUB, label: "Card prices" }, { label: "Rising and falling" }];
  const span = (d: string) => (d ? `since ${shortDate(d)}` : "");
  return (
    <div className="page py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd(crumbs)) }} />
      <Breadcrumbs items={crumbs} />
      <h1 className="page-title">Rising and falling MTG card prices</h1>
      <p className="mt-3 max-w-3xl text-muted">
        The Magic cards whose TCGplayer market price (recent sales, US$) moved the most, compared finish by finish, among cards worth US$2 or more.
        {m?.generatedAt ? ` Updated ${shortDate(m.generatedAt.slice(0, 10))}.` : ""} Own one?{" "}
        <a href="/collection" className="font-semibold text-brand hover:underline">
          Track your collection
        </a>
        .
      </p>
      <Section id="week-up" title={`Rising this week ${span(m?.since.d7 ?? "")}`.trim()} className="mt-8">
        <MoverList rows={m?.d7.up.slice(0, 30) ?? []} names={names} />
      </Section>
      <Section id="week-down" title={`Falling this week ${span(m?.since.d7 ?? "")}`.trim()}>
        <MoverList rows={m?.d7.down.slice(0, 30) ?? []} names={names} />
      </Section>
      <Section id="day-up" title={`Rising today ${span(m?.since.d1 ?? "")}`.trim()}>
        <MoverList rows={m?.d1.up.slice(0, 20) ?? []} names={names} />
      </Section>
      <Section id="day-down" title={`Falling today ${span(m?.since.d1 ?? "")}`.trim()}>
        <MoverList rows={m?.d1.down.slice(0, 20) ?? []} names={names} />
      </Section>
    </div>
  );
}
