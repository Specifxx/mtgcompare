import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cardValue, type CardRow } from "@/lib/cards";
import { cardPath, shortDate, usd } from "@/lib/format";
import { breadcrumbLd, jsonLd, pageMeta } from "@/lib/seo";
import { readSet, readSets, setBySlug } from "@/lib/store";
import { SITE, gameBySlug } from "@/site.config";

// One set's price list: every card in collector-number order, PER_PAGE a page (a set of thousands would be a multi-megabyte page).
// Page 1 is indexable once the set has a released card; ?page=N is noindex and not crawled (robots.txt).
export const dynamic = "force-dynamic";
const PER_PAGE = 300;

function load(params: { game: string; set: string }) {
  const g = gameBySlug(params.game);
  const set = g && setBySlug(g.slug, params.set);
  return g && set ? { g, set, cards: readSet(g.slug, set.slug) } : null;
}
const best = (c: CardRow) => cardValue(c.p);

export function generateMetadata({ params, searchParams }: { params: { game: string; set: string }; searchParams: { page?: string } }): Metadata {
  const x = load(params);
  if (!x) return {};
  const { g, set, cards } = x;
  const top = [...cards].sort((a, b) => (best(b) ?? 0) - (best(a) ?? 0))[0];
  return pageMeta({
    title: `${set.name} Card Prices (${g.name})`.slice(0, 60 - SITE.name.length - 3),
    description: `Prices for all ${cards.length} cards in ${g.name} ${set.name}${top && best(top) ? `, from ${top.n} at ${usd(best(top)!)}` : ""}. TCGplayer market prices, updated daily.`.slice(0, 160),
    path: `/${g.slug}/${set.slug}`,
    noindex: !set.indexed || (searchParams.page != null && searchParams.page !== "1"),
  });
}

export default function SetPage({ params, searchParams }: { params: { game: string; set: string }; searchParams: { page?: string } }) {
  const x = load(params);
  if (!x) notFound();
  const { g, set, cards } = x;
  const { generatedAt } = readSets(g.slug);
  const pages = Math.max(1, Math.ceil(cards.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(searchParams.page ?? "1")) || 1));
  const shown = cards.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const crumbs = [{ label: SITE.name, href: "/" }, { label: g.name, href: `/${g.slug}` }, { label: set.name }];
  return (
    <div className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd(crumbs)) }} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="/">{SITE.name}</a> <span>›</span> <a href={`/${g.slug}`}>{g.name}</a> <span>›</span> <span>{set.name}</span>
      </nav>
      <h1>{set.name} card prices</h1>
      <p className="lede">
        All {cards.length} {g.name} cards in {set.name}
        {set.released ? `, released ${shortDate(set.released)}` : ""}, with TCGplayer&rsquo;s market price for the most valuable printing of each.
        {generatedAt ? ` Updated ${shortDate(generatedAt)}.` : ""}
      </p>
      <div className="wrap card" style={{ marginTop: 18 }}>
        <table className="list">
          <thead>
            <tr>
              <th>#</th>
              <th>Card</th>
              <th>Rarity</th>
              <th className="r">Market price</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id}>
                <td>{c.no}</td>
                <td>
                  <a href={cardPath(g.slug, set.slug, c.s)} style={{ fontWeight: 600 }}>
                    {c.n}
                  </a>
                </td>
                <td>{c.r ?? ""}</td>
                <td className="r">{best(c) != null ? usd(best(c)!) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="pager" aria-label="Pages">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <a key={n} className={`btn${n === page ? " primary" : ""}`} href={n === 1 ? `/${g.slug}/${set.slug}` : `/${g.slug}/${set.slug}?page=${n}`} rel={n === 1 ? undefined : "nofollow"} aria-current={n === page ? "page" : undefined}>
              {n}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
