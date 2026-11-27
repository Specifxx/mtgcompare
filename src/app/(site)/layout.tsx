import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { HolidayStrip } from "@/components/HolidayStrip";

// The pages with no region of their own (the landing page, About, the blog, the legal pages) get the whole header too (owner,
// 2026-10-28), for the visitor's region (built for the default one on the server). ONE navigation since 2026-11-13 (owner: "we're
// making things too complicated"): the sidebar that repeated the header's menus down the left of every desktop page is gone; its
// links are the header's mega menus, the menu button's sheet and the footer.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header region={null} />
      {/* The landing page, About and the blog get the sale bar and TCGplayer's sale card too (owner, 2026-11-27: "on every
          single website"), for the default region (the US), as the header is built for it on the server. */}
      <HolidayStrip region="us" />
      <main id="main" className="relative min-w-0 flex-1">
        {children}
      </main>
      <Footer region={null} />
    </>
  );
}
