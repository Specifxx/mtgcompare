import { LayoutInlineAds } from "@/components/InlineAds";
import { listedSetCodes, tcgplayerTiles, type TcgplayerTile } from "@/lib/data";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { HolidayStrip } from "@/components/HolidayStrip";
import { SideAds } from "@/components/SideAds";
import { regionOrNotFound } from "@/lib/regions";

// Nothing here is prerendered at build: every region page is force-dynamic and kept by Vercel's CDN
// (next.config.js, CDN_PAGES; ISR until 2026-10-17). A build must not depend on the database being
// reachable — when Rift Compare's database ran out of transfer, every deploy failed until it was replaced.

// The 404 here is not enough on its own: a page's generateMetadata and body run
// alongside the layout, so every page under [region] resolves its region the
// same way before touching anything else (/terms, /foo and /AU used to 500).
export default async function RegionLayout({ children, params }: { children: React.ReactNode; params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  // The pre-footer TCGplayer strip's products: read at request time (pages are force-dynamic), never at build; a failure shows none.
  // The sets with a product here, so the menus and footer never link a set page that would 404 (lib/release.ts menuSets); a
  // failed read links every set, as before.
  const [tcg, listed] = await Promise.all([tcgplayerTiles().catch((): TcgplayerTile[] => []), listedSetCodes(r.market).catch(() => null)]);
  return (
    <>
      <Header region={r.region} listed={listed} />
      <HolidayStrip region={r.region} />
      {/* ONE navigation since 2026-11-13 (owner: "we're making things too complicated"): the header. The sidebar that repeated its
          menus down the left of every desktop page is gone; the page is one centred column. */}
      <main id="main" className="min-w-0 flex-1">
        {/* The two big ad banners (owner, 2026-11-14) sit at the TOP of every region page without a spot of its own (the region home, a
            product page and a set page place them themselves, under their own hero or breadcrumbs): the top of <main>. The server HTML
            holds the banners at their final height (components/InlineAds.tsx). The legal pages are not under [region]. */}
        <div className="page">
          <LayoutInlineAds region={r.region} tiles={tcg} />
        </div>
        {children}
      </main>
      <Footer region={r.region} listed={listed} />
      {/* Narrow screens only, drawn in the browser after a scroll: the phone dock (components/SideAds.tsx, AdDock.tsx). The side rails are gone
          (2026-11-13). Nothing in the server HTML. */}
      <SideAds region={r.region} tiles={tcg} />
    </>
  );
}
