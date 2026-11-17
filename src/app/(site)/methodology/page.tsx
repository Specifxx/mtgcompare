import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import Link from "@/components/Link";
import { CONTACT_EMAIL, OPERATOR, SITE_NAME, SITE_URL } from "@/lib/site";

// Static: no data read (growth report item 8, 2026-11-17). Kept in step with /about, /how-we-pick-stores and /affiliate-disclosure.
export const metadata: Metadata = {
  title: "Methodology",
  description: `What ${SITE_NAME} tracks and what it does not: where prices come from, how often they are read, how stores are ranked and how the site earns.`,
  alternates: { canonical: `${SITE_URL}/methodology` },
};

const LAST_UPDATED = "17 November 2026";

export default function Methodology() {
  return (
    <div className="page max-w-3xl py-12">
      <Breadcrumbs items={[{ href: "/", label: SITE_NAME }, { label: "Methodology" }]} />
      <h1 className="page-title">Methodology</h1>
      <p className="mt-2 text-sm text-faint">Last updated {LAST_UPDATED}</p>
      <div className="prose-dex mt-6">
        <p>
          {SITE_NAME} compares the price of sealed Magic: The Gathering product (booster boxes, bundles, Commander decks and the like) across independent stores. This page says
          what we track, what we do not, and how the table is put in order.
        </p>

        <h2 id="track">What we track</h2>
        <ul>
          <li>The price and stock of sealed product at the stores listed on <Link href="/how-we-pick-stores">How we pick stores</Link>, read from each store&rsquo;s own site about twice a day. Every row shows when it was last read, and each product page says when its prices were checked.</li>
          <li>Each store&rsquo;s measured shipping for one item, where we have measured it. Where we have not, the row says shipping is at checkout; shipping is never added silently to a price.</li>
          <li>TCGplayer and eBay listings and Amazon search links, labelled as marketplaces. They are never counted as a store.</li>
        </ul>

        <h2 id="not">What we do not track</h2>
        <ul>
          <li>Single cards, graded cards, accessories, other games and other languages. A listing we cannot read as exactly one product is left out rather than guessed.</li>
          <li>Prices in another currency than the region&rsquo;s. A region compares only stores that charge in its currency; prices are never converted for display or ranking.</li>
          <li>Price history, and any price, release date or pack count we are not sure of.</li>
          <li>The individual sellers on marketplaces. Check a seller&rsquo;s feedback before you buy.</li>
        </ul>

        <h2 id="ranking">How the table is ordered</h2>
        <p>
          By item price, cheapest first (or by price plus measured shipping, when you switch it). Commission never decides the order. eBay and TCGplayer rows are pinned at the top,
          labelled, and are never called the cheapest by us on their own account.
        </p>

        <h2 id="earn">How the site earns</h2>
        <p>
          Some links are affiliate links (eBay Partner Network, TCGplayer through Impact, Amazon Associates), marked &ldquo;Ad&rdquo; or &ldquo;Paid link&rdquo;. If you buy through one we may
          earn a commission at no extra cost to you. Stores do not pay to be listed or to rank. Full detail: <Link href="/affiliate-disclosure">Affiliate disclosure</Link>.
        </p>

        <h2 id="independent">Independence</h2>
        <p>
          {SITE_NAME} is an independent site, not affiliated with Wizards of the Coast or Hasbro, or with any store it lists.
          {OPERATOR !== SITE_NAME && ` It is operated by ${OPERATOR}.`} A wrong price or a store we should check: <Link href="/contact">contact us</Link>
          {CONTACT_EMAIL ? ` or write to ${CONTACT_EMAIL}` : ""}.
        </p>
      </div>
    </div>
  );
}
