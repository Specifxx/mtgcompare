import { LayoutInlineAds } from "@/components/InlineAds";
import { listedSetCodes, tcgplayerTiles, type TcgplayerTile } from "@/lib/data";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { HolidayStrip } from "@/components/HolidayStrip";
import { SideAds } from "@/components/SideAds";
import { SideNav } from "@/components/SideNav";
import { navGroups } from "@/lib/nav";
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
      {/* From xl, the sidebar (components/SideNav.tsx) fills the wide screen's left side; the page keeps its own width beside it. */}
      <div className="mx-auto flex w-full max-w-shell flex-1">
        <SideNav region={r.region} groups={navGroups(r.region, undefined, listed)} />
        <main id="main" className="min-w-0 flex-1">
        {children}
        {/* Every region page without a spot of its own for the in-page ad block (the region home, a product page and a set page place it themselves)
            ends with it, directly above the site footer (inside <main>: it is page content). Browser only: the server HTML holds an empty box of its
            height (components/InlineAds.tsx). A page too short to fit it beside its own units renders <NoPreFooter/>, and globals.css hides
            this wrapper. The legal pages are not under [region], so they never get one. */}
        <div className="page mt-16" data-ebay-prefooter>
          <LayoutInlineAds region={r.region} tiles={tcg} />
        </div>
        </main>
      </div>
      <Footer region={r.region} listed={listed} />
      {/* Narrow screens only, drawn in the browser after a scroll: the phone dock (components/SideAds.tsx, AdDock.tsx). The side rails are gone
          (2026-11-13). Nothing in the server HTML. */}
      <SideAds region={r.region} tiles={tcg} />
    </>
  );
}
