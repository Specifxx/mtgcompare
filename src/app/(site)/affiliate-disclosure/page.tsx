import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import Link from "@/components/Link";
import { ADSENSE_CLIENT } from "@/lib/adsense";
import { AMAZON_DISCLOSURE } from "@/lib/amazon";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// Static: no data read. Kept in step with /about#money and /terms#affiliate.
export const metadata: Metadata = {
  title: "Affiliate disclosure",
  description: `How ${SITE_NAME} earns: Amazon Associates, eBay Partner Network and TCGplayer (Impact) affiliate links, and Google ads. Stores never pay to rank.`,
  alternates: { canonical: `${SITE_URL}/affiliate-disclosure` },
};

const LAST_UPDATED = "25 October 2026";

export default function AffiliateDisclosure() {
  return (
    <div className="page max-w-3xl py-12">
      <Breadcrumbs items={[{ href: "/", label: "MTG Compare" }, { label: "Affiliate disclosure" }]} />
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Affiliate disclosure</h1>
      <p className="mt-2 text-sm text-faint">Last updated {LAST_UPDATED}</p>
      <div className="prose-dex mt-6">
        <p>
          {SITE_NAME} is free to use. It is paid for by affiliate links{ADSENSE_CLIENT ? " and Google ads" : ""}: if you buy through one of our marked links we may earn a
          commission, at no extra cost to you. Stores are compared and ranked by price and stock only; no store pays to be listed or to rank, and an affiliate link never
          changes the order of the stores.
        </p>

        <h2 id="amazon">Amazon Associates</h2>
        <p>
          <b>{AMAZON_DISCLOSURE}</b> In Australia, New Zealand and Singapore some pages link to Amazon Australia (amazon.com.au) with our Associates tag. Amazon is a
          marketplace, not one of the stores we compare: it is never counted as a store, never ranked with the stores and never shown as a best price. We do not read
          Amazon, so we show no Amazon price, rating or stock; each link says &ldquo;Check price on Amazon AU&rdquo;, and Amazon&rsquo;s own page is what counts. Outside
          Australia, Amazon Australia may or may not ship to you: check delivery before you buy.
        </p>

        <h2 id="ebay">eBay Partner Network</h2>
        <p>
          Links to eBay are eBay Partner Network affiliate links, and the eBay listings shown on the site are advertisements, marked &ldquo;Ad&rdquo;. See{" "}
          <Link href="/terms#affiliate">the terms</Link> for how eBay listings are imported and shown.
        </p>

        <h2 id="tcgplayer">TCGplayer (Impact)</h2>
        <p>Links to TCGplayer go through TCGplayer&rsquo;s affiliate program on Impact, and are marked as affiliate links where they appear.</p>

        <h2 id="google">Google ads</h2>
        <p>
          Some guides may carry a Google AdSense ad, labelled &ldquo;Advertisement&rdquo;. Google chooses what it shows; no advertiser pays to change a price, a ranking
          or a guide. <Link href="/privacy#ads">How Google uses cookies for these ads</Link>.
        </p>

        <h2 id="stores">Store links</h2>
        <p>
          Links to the independent stores we compare are plain links: stores pay us nothing. More on <Link href="/about#money">how {SITE_NAME} makes money</Link>.
        </p>
      </div>
    </div>
  );
}
