import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/Link";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { refCents, setById } from "@/lib/data";
import { money } from "@/lib/format";
import { shortName } from "@/lib/names";
import { attrFacet, attrFacets, attrHub, attrHubTitle } from "@/lib/hubs";
import { ChipList } from "@/components/ChipList";
import { TileGrid } from "@/components/ProductTile";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { fitTitle } from "@/lib/seo-title";

// One attribute hub (SITE.cardHubs): every card of one colour, type or
// franchise, most valuable first. Cached on first visit, never prerendered.
export const revalidate = 86400; // data only changes with a release (DECISIONS.md, "Vercel cost")
export const generateStaticParams = () => [];

export function generateMetadata({ params }: { params: { facet: string; slug: string } }): Metadata {
  const f = attrFacet(params.facet);
  const h = attrHub(params.facet, params.slug);
  if (!f || !h) return {};
  const name = attrHubTitle(f.cfg, h.label);
  return {
    title: fitTitle([`${name}: prices, most valuable first`, `${name}: prices`, name]),
    description: `All ${h.items.length} ${h.label} ${SITE.game} cards ranked by TCGplayer market price, with the cheapest store and eBay listing for each. Updated daily.`,
    ...canon(`/cards/${f.cfg.facet}/${h.slug}`),
  };
}

export default function AttrHubPage({ params }: { params: { facet: string; slug: string } }) {
  const f = attrFacet(params.facet);
  const h = attrHub(params.facet, params.slug);
  if (!f || !h) notFound();
  const name = attrHubTitle(f.cfg, h.label);
  const priced = h.items.filter((p) => refCents(p.id) != null);
  const top = priced[0];
  const over10 = priced.filter((p) => (refCents(p.id) ?? 0) >= 1000).length;
  // Which sets these cards come from, most first: a crawlable route to each set.
  const bySet = new Map<number, number>();
  for (const p of h.items) bySet.set(p.setId, (bySet.get(p.setId) ?? 0) + 1);
  const setChips = [...bySet.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ s: setById(id), n })).filter((x) => x.s).map((x) => ({ key: x.s!.id, href: `/sets/${x.s!.slug}`, label: `${x.s!.name} (${x.n})` }));
  const others = attrFacets().filter((x) => x.cfg.facet !== f.cfg.facet);
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ name: "Cards", href: "/cards" }, { name: `By ${f.cfg.noun[0]}`, href: `/cards/${f.cfg.facet}` }, { name: h.label }]} />
      <header>
        <h1 className="font-display text-3xl font-black">{name}: prices</h1>
        <p className="mt-2 text-muted">
          {h.items.length} {h.label} cards
          {priced.length ? `, from ${money(refCents(priced[priced.length - 1].id))} to ${money(refCents(priced[0].id))}` : ""}
          {over10 ? `; ${over10} of them are worth $10 or more` : ""}.
          {top ? <> The most valuable is <Link className="link" href={`/card/${top.slug}`}>{shortName(top.name)}</Link> at {money(refCents(top.id))}.</> : null} Open any card to compare every store and eBay.
        </p>
      </header>
      <TileGrid items={h.items.slice(0, 120)} />
      {h.items.length > 120 && <p className="text-sm text-muted">Showing the 120 most valuable of {h.items.length}. <Link className="link" href="/cards">Search every card</Link>.</p>}
      {setChips.length > 1 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">{h.label} cards by set</h2>
          <ChipList items={setChips} more="sets" />
        </section>
      )}
      <section>
        <h2 className="mb-3 text-lg font-bold">Other {f.cfg.noun[1]}</h2>
        <ChipList items={f.hubs.filter((x) => x.slug !== h.slug).map((x) => ({ key: x.slug, href: `/cards/${f.cfg.facet}/${x.slug}`, label: x.label }))} more={f.cfg.noun[1]} />
      </section>
      {others.map((o) => (
        <section key={o.cfg.facet}>
          <h2 className="mb-3 text-lg font-bold">Browse by {o.cfg.noun[0]}</h2>
          <ChipList items={o.hubs.map((x) => ({ key: x.slug, href: `/cards/${o.cfg.facet}/${x.slug}`, label: x.label }))} more={o.cfg.noun[1]} />
        </section>
      ))}
    </div>
  );
}
