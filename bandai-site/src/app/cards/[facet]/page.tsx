import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/Link";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { money } from "@/lib/format";
import { shortName } from "@/lib/names";
import { refCents } from "@/lib/data";
import { attrFacet, attrHubTitle, facetStats } from "@/lib/hubs";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { abs } from "@/lib/site";

// The index of one attribute hub (SITE.cardHubs): every colour, type or
// franchise with its card count, median and most valuable card.
export const revalidate = 86400; // data only changes with a release (DECISIONS.md, "Vercel cost")
export const generateStaticParams = () => [];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function generateMetadata({ params }: { params: { facet: string } }): Metadata {
  const f = attrFacet(params.facet);
  if (!f) return {};
  return {
    title: `${SITE.gameShort} cards by ${f.cfg.noun[0]}: prices for every ${f.cfg.noun[0]}`,
    description: `All ${f.hubs.length} ${SITE.game} ${f.cfg.noun[1]} with card counts, median price and the most valuable card in each. Compare every store.`,
    ...canon(`/cards/${f.cfg.facet}`),
  };
}

export default function FacetIndex({ params }: { params: { facet: string } }) {
  const f = attrFacet(params.facet);
  if (!f) notFound();
  const rows = facetStats(f.cfg.facet);
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ name: "Cards", href: "/cards" }, { name: `By ${f.cfg.noun[0]}` }]} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "ItemList", name: `${SITE.gameShort} cards by ${f.cfg.noun[0]}`, itemListElement: rows.map((r, i) => ({ "@type": "ListItem", position: i + 1, url: abs(`/cards/${f.cfg.facet}/${r.hub.slug}`), name: attrHubTitle(f.cfg, r.hub.label) })) }} />
      <header>
        <h1 className="font-display text-3xl font-black">{SITE.gameShort} cards by {f.cfg.noun[0]}</h1>
        <p className="mt-2 text-muted">{f.cfg.blurb ? `${f.cfg.blurb} ` : ""}{rows.length} {f.cfg.noun[1]}, largest first. Open one for every card in it, most valuable first, with every store compared.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="py-2 pr-3">{cap(f.cfg.noun[0])}</th><th className="py-2 pr-3">Cards</th><th className="py-2 pr-3">Median</th><th className="py-2 pr-3">$10+</th><th className="py-2">Most valuable</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.hub.slug} className="border-t border-white/10">
                <td className="py-2 pr-3"><Link className="link font-semibold" href={`/cards/${f.cfg.facet}/${r.hub.slug}`}>{r.hub.label}</Link></td>
                <td className="py-2 pr-3">{r.count}</td>
                <td className="py-2 pr-3">{money(r.median)}</td>
                <td className="py-2 pr-3">{r.over10}</td>
                <td className="py-2">{r.top ? <><Link className="link" href={`/card/${r.top.slug}`}>{shortName(r.top.name)}</Link> <span className="text-muted">{money(refCents(r.top.id))}</span></> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
