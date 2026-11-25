import { LayoutInlineAds } from "@/components/InlineAds";
import { listedSetCodes, tcgplayerTiles, type TcgplayerTile } from "@/lib/data";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { HolidayStrip } from "@/components/HolidayStrip";
import { SideAds } from "@/components/SideAds";
import { GutterAds } from "@/components/GutterAds";
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
      <main id="main" className="relative min-w-0 flex-1">
        {children}
        {/* The two ad banners sit BELOW the content of every region page without a spot of its own (owner, 2026-11-19: "all the ads
            that can negatively impact our indexing let's remove and have more strategically placed ads"). The server HTML holds the
            banners at their final height (components/InlineAds.tsx). The legal pages are not under [region]. */}
        <div className="page">
          <LayoutInlineAds region={r.region} tiles={tcg} />
        </div>
        {/* The gutter ads (owner, 2026-11-25): a labelled TCGplayer column in the empty right side of a wide window, from 1440px (light site: one column). */}
        <GutterAds region={r.region} tiles={tcg} sides="right" />
      </main>
      <Footer region={r.region} listed={listed} />
      {/* Narrow screens only, drawn in the browser after a scroll: the phone dock (components/SideAds.tsx, AdDock.tsx). The side rails are gone
          (2026-11-13). Nothing in the server HTML. */}
      <SideAds region={r.region} tiles={tcg} />
    </>
  );
}
