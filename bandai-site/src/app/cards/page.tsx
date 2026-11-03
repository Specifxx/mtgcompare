import type { Metadata } from "next";
import Link from "@/components/Link";
import { Suspense } from "react";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { byValue, movers, products, sets } from "@/lib/data";
import { attrFacets, rarityHubs } from "@/lib/hubs";
import { TileGrid } from "@/components/ProductTile";
import { SearchBox } from "@/components/SearchBox";
import { ChipList } from "@/components/ChipList";
import { CardSearch } from "./CardSearch";
import { fitTitle } from "@/lib/seo-title";

export const revalidate = 86400; // data only changes with a release (DECISIONS.md, "Vercel cost")
export const metadata: Metadata = {
  // Owns "<game> card list" (Rift Compare's /browse); the homepage owns "<game> card prices".
  title: fitTitle([`${SITE.gameShort} Card List & Prices — Every Card`, `${SITE.gameShort} Card List & Prices`]),
  description: `Search and compare prices for every ${SITE.game} card across TCGplayer, eBay and ${SITE.stores.length} stores. Updated daily.`,
  ...canon("/cards"),
};

export default function Cards() {
  const top = byValue(products().filter((p) => p.kind === "card")).slice(0, 24);
  const rising = movers(7).up.filter((m) => m.p.kind === "card").slice(0, 12).map((m) => m.p);
  const listed = sets().filter((s) => s.productCount > 0);
  // Only the newest released sets here; every set is one click away on /sets.
  const latest = listed.filter((s) => !s.upcoming && s.productCount > 20).slice(0, 10);
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-3xl font-black">{SITE.gameShort} card prices</h1>
        <p className="mt-2 text-muted">Search any card, or browse by set. Every card page compares all the stores we track.</p>
        <div className="mt-5 max-w-xl"><SearchBox /></div>
        <Suspense><CardSearch /></Suspense>
      </header>

      <section>
        <h2 className="mb-3 text-xl font-bold">Most valuable {SITE.gameShort} cards</h2>
        <TileGrid items={top} />
      </section>

      {rising.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-bold">Rising this week</h2>
            <Link className="link text-sm" href="/movers">All movers →</Link>
          </div>
          <TileGrid items={rising} />
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold">Latest sets</h2>
          <Link className="link text-sm" href="/sets">All {listed.length} sets →</Link>
        </div>
        <ChipList items={latest.map((s) => ({ key: s.id, href: `/sets/${s.slug}`, label: s.name }))} limit={10} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Browse by rarity</h2>
        <ChipList items={rarityHubs().map((h) => ({ key: h.slug, href: `/cards/rarity/${h.slug}`, label: h.label }))} more="rarities" />
      </section>

      {attrFacets().map((f) => (
        <section key={f.cfg.facet}>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-bold">Browse by {f.cfg.noun[0]}</h2>
            <Link className="link text-sm" href={`/cards/${f.cfg.facet}`}>All {f.hubs.length} {f.cfg.noun[1]} →</Link>
          </div>
          <ChipList items={f.hubs.map((h) => ({ key: h.slug, href: `/cards/${f.cfg.facet}/${h.slug}`, label: h.label }))} more={f.cfg.noun[1]} />
        </section>
      ))}
    </div>
  );
}
