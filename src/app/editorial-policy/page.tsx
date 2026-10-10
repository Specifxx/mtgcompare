import type { Metadata } from "next";
import Link from "next/link";
import { StaticPage } from "@/components/StaticPage";
import { getSiteStats } from "@/lib/data";
import { CONTACT_EMAIL } from "@/lib/site";
import { pageOg } from "@/lib/og/meta";

// Reads the eBay-live flag from the published data: rendered per request, never at build (CLAUDE.md, contract C26).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Editorial Policy",
  description:
    "How MTG Compare writes, sources and corrects its guides and market posts.",
  alternates: { canonical: "/editorial-policy" },
  openGraph: pageOg("/editorial-policy"),
};

export default async function EditorialPolicy() {
  const ebayLive = (await getSiteStats().catch(() => null))?.ebayLive ?? false;
  return (
    <StaticPage title="Editorial policy" crumb="Editorial policy">
      <h2>Figures come from data, not from the draft</h2>
      <p>
        Every price, count and ranking in a post is computed from MTG
        Compare&apos;s own price data when the page is built — the same data
        behind every card page. Nothing numeric is typed into a post by hand, so
        a post cannot quote a price the site does not show, and its figures
        refresh with the daily price import. Each post shows when its
        prices were last updated.
      </p>
      <h2>How posts are written</h2>
      <p>
        Posts are drafted with AI assistance and written to say only what the
        data supports: a sentence that depends on a fact is printed only when
        the fact exists. Explanations of the game (rarities, treatments, how a
        game is played) are kept to what is printed on the cards, in the
        published rules, or listed in TCGplayer&apos;s and Scryfall&apos;s catalogues.
      </p>
      <h2>Independence and affiliate links</h2>
      <p>
        MTG Compare earns from some eBay and TCGplayer links (labelled) and from Plus and Premium subscriptions. Affiliate status
        never changes a ranking: comparisons are cheapest first, and posts name
        stores by the data. No store pays to be mentioned.
        {ebayLive ? (
          <>
            {" "}eBay listing prices (we are an eBay Partner Network affiliate) sit
            in their own labelled block, apart from the stores, and are never
            ranked among them.
          </>
        ) : null}
      </p>
      <h2>Corrections</h2>
      <p>
        Found a mistake? Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with the page
        link. Data errors are fixed at the source (a store match, a catalogue
        rule), which corrects every page that shows them. See also{" "}
        <Link href="/methodology">how we compare prices</Link>.
      </p>
    </StaticPage>
  );
}
