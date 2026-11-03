import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/Link";
import { SITE } from "@/site.config";
import { canon, KITS_SHARE_IMAGE } from "@/lib/site";
import { gradeHubs, kitAdTiles, kits, kitsOn, kitsUpdatedAt, newKits, popular } from "@/lib/kits";
import { KitGrid } from "@/components/KitTile";
import { KitEbayStrip } from "@/components/KitAds";
import { KitSearch } from "@/components/KitSearch";
import { CheckedAgo } from "@/components/CardBuy";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { MARKET_LABEL } from "@/lib/site-types";
import { FamilyCluster } from "@/components/FamilyCluster";

export const revalidate = 86400; // data only changes with a release (DECISIONS.md, "Vercel cost")

export function generateMetadata(): Metadata {
  if (!SITE.kits) return {};
  const n = SITE.kits.stores.length;
  return {
    title: `${SITE.kits.label} prices: compare ${n} hobby shops`,
    description: `Compare ${SITE.kits.noun} prices across ${n} hobby shops in the US, UK, Canada and Australia: HG, RG, MG, PG and more, cheapest in-stock first, updated daily.`,
    ...canon("/kits", KITS_SHARE_IMAGE),
  };
}

export default function Kits() {
  if (!SITE.kits || !kitsOn()) notFound();
  const cfg = SITE.kits;
  const hubs = gradeHubs();
  const all = kits();
  const recent = newKits(21);
  const fresh = recent.slice(0, 12);
  // The first import marks every kit new: show "new" only once it means something.
  const showNew = recent.length > 0 && recent.length < all.length / 4;
  const markets = [...new Set(cfg.stores.map((s) => s.market))];
  return (
    <div className="flex flex-col gap-8">
      <header>
        <Breadcrumbs items={[{ name: cfg.label }]} />
        <h1 className="font-display text-3xl font-black">{cfg.label} prices</h1>
        <p className="mt-2 max-w-3xl text-muted">
          {all.length.toLocaleString()} {cfg.noun} compared across {cfg.stores.length} hobby shops in {markets.map((m) => MARKET_LABEL[m]).join(", ")}. Every kit is matched by the barcode on its box, so the prices you see are for the same kit. Cheapest in-stock first, in your own currency.
        </p>
        <div className="mt-2"><CheckedAgo at={kitsUpdatedAt()} /></div>
        <div className="mt-4 max-w-xl"><KitSearch /></div>
      </header>
      <nav aria-label="Grades" className="flex flex-wrap gap-2">
        {hubs.map((h) => (
          <Link key={h.slug} href={`/kits/grade/${h.slug}`} className="chip text-sm hover:border-brand">
            {h.label} <span className="text-muted">· {h.items.length}</span>
          </Link>
        ))}
      </nav>
      {showNew && (
        <section>
          <h2 className="mb-3 text-xl font-bold">New in stores</h2>
          <KitGrid items={fresh} />
        </section>
      )}
      {hubs.map((h) => (
        <section key={h.slug}>
          <h2 className="mb-3 text-xl font-bold"><Link className="hover:underline" href={`/kits/grade/${h.slug}`}>{h.label} →</Link></h2>
          <KitGrid items={h.items.slice(0, 12)} />
        </section>
      ))}
      {(() => {
        const rest = popular(all.filter((k) => !k.grade)).slice(0, 12);
        return rest.length ? (
          <section>
            <h2 className="mb-3 text-xl font-bold">Other kits</h2>
            <KitGrid items={rest} />
          </section>
        ) : null;
      })()}
      <KitEbayStrip tiles={kitAdTiles(popular(all), 12)} page="kits" title={`Popular ${cfg.label} on eBay`} />
      <FamilyCluster cluster="hobby" kind="deal" />
      <section className="prose-site max-w-3xl text-sm">
        <h2>How {cfg.label} prices are compared</h2>
        <p>
          Every day we read each shop&apos;s {cfg.label} catalogue and match every listing to a kit by its JAN barcode, the 13-digit number printed on the box (or {cfg.maker}&apos;s own item number, which maps to it). A listing we can&apos;t tie to a barcode is left out rather than guessed. Prices are item prices before postage, in the shop&apos;s own currency. Shops change prices and stock all the time, so the shop&apos;s checkout price is final.
        </p>
        <p>
          Run a hobby shop that sells {cfg.label}? <Link href="/contact">Ask to be listed</Link>, it&apos;s free.
        </p>
      </section>
    </div>
  );
}
