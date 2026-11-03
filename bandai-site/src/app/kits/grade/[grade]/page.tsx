import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/Link";
import { SITE } from "@/site.config";
import { canon, KITS_SHARE_IMAGE } from "@/lib/site";
import { gradeHubBySlug, gradeHubs, kitAdTiles, kitBestByMarket } from "@/lib/kits";
import { KitEbayStrip } from "@/components/KitAds";
import { KitGrid } from "@/components/KitTile";
import { KitPrice } from "@/components/KitPrice";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const revalidate = 86400; // data only changes with a release (DECISIONS.md, "Vercel cost")
export const generateStaticParams = () => [];

// Tiles for the first kits, a plain list for the rest: an HG hub holds
// hundreds of kits, and a tile each is hundreds of store photos.
const TILES = 60;

export function generateMetadata({ params }: { params: { grade: string } }): Metadata {
  const h = SITE.kits ? gradeHubBySlug(params.grade) : null;
  if (!h || !SITE.kits) return {};
  return {
    title: `${h.label} ${SITE.kits.label} prices: compare ${SITE.kits.stores.length} shops`,
    description: `Compare prices for ${h.items.length} ${h.label} kits across ${SITE.kits.stores.length} hobby shops in the US, UK, Canada and Australia, cheapest in-stock first.`,
    ...canon(`/kits/grade/${h.slug}`, KITS_SHARE_IMAGE),
  };
}

export default function GradePage({ params }: { params: { grade: string } }) {
  const h = SITE.kits ? gradeHubBySlug(params.grade) : null;
  if (!h || !SITE.kits) notFound();
  const rest = h.items.slice(TILES);
  return (
    <div className="flex flex-col gap-8">
      <header>
        <Breadcrumbs items={[{ name: SITE.kits.label, href: "/kits" }, { name: h.label }]} />
        <h1 className="font-display text-3xl font-black">{h.label} {SITE.kits.label} prices</h1>
        <p className="mt-2 text-muted">{h.items.length} kits, the ones most shops have in stock first. Open a kit to compare every shop.</p>
      </header>
      <nav aria-label="Grades" className="flex flex-wrap gap-2">
        {gradeHubs().map((g) => (
          <Link key={g.slug} href={`/kits/grade/${g.slug}`} className={`chip text-sm ${g.slug === h.slug ? "border-brand text-brand-400" : "hover:border-brand"}`}>{g.label}</Link>
        ))}
      </nav>
      <KitGrid items={h.items.slice(0, TILES)} />
      <KitEbayStrip tiles={kitAdTiles(h.items, 12)} page="kit-grade" title={`${h.label} ${SITE.kits.label} on eBay`} />
      {rest.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold">More {h.label} kits</h2>
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((k) => (
              <li key={k.jan} className="flex items-baseline justify-between gap-3 border-b border-ink-800 py-1.5">
                <Link href={`/kit/${k.slug}`} className="truncate hover:underline">{k.name}</Link>
                <span className="shrink-0 tabular-nums text-brand-400"><KitPrice best={kitBestByMarket(k.jan)} /></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
