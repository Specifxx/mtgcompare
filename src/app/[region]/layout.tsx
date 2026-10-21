import { PreFooterStrip } from "@/components/EbayStrip";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { regionOrNotFound } from "@/lib/regions";

// Nothing here is prerendered at build: every region page is force-dynamic and kept by Vercel's CDN
// (next.config.js, CDN_PAGES; ISR until 2026-10-17). A build must not depend on the database being
// reachable — when Rift Compare's database ran out of transfer, every deploy failed until it was replaced.

// The 404 here is not enough on its own: a page's generateMetadata and body run
// alongside the layout, so every page under [region] resolves its region the
// same way before touching anything else (/terms, /foo and /AU used to 500).
export default function RegionLayout({ children, params }: { children: React.ReactNode; params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  return (
    <>
      <Header region={r.region} />
      <main id="main" className="flex-1">
        {children}
        {/* Every region page ends with a slim eBay listing strip (four tiles), directly above the site
            footer (inside <main>: it is page content, not a landmark of its own). With nothing to list it
            is the compact CTA row. A page too short to fit it beside its own units renders <NoPreFooter/>,
            and globals.css hides this wrapper. The legal pages are not under [region], so they never get one. */}
        <div className="page mt-16" data-ebay-prefooter>
          <PreFooterStrip region={r.region} />
        </div>
      </main>
      <Footer region={r.region} />
    </>
  );
}
