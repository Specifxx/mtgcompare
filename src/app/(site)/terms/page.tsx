import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, OPERATOR, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of use",
  description: `The terms for using ${SITE_NAME}: what the prices and stock mean, affiliate links, trademarks, and what we don't guarantee.`,
  alternates: { canonical: `${SITE_URL}/terms` },
};

// Bump when the terms change in substance, not for wording.
const LAST_UPDATED = "5 October 2026";

export default function Terms() {
  return (
    <div className="page max-w-3xl py-12">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Terms of use</h1>
      <p className="mt-2 text-sm text-faint">Last updated {LAST_UPDATED}</p>
      <div className="prose-dex mt-6">
        <p>
          {SITE_NAME} ({SITE_URL.replace(/^https?:\/\//, "")}) is a free price-comparison site for Pokémon TCG sealed product, operated by {OPERATOR}{" "}
          (&ldquo;we&rdquo;). By using it you agree to these terms. They are short because the site does little: it reads stores&rsquo; public
          listings and shows them side by side.
        </p>

        <h2 id="accuracy">Prices and stock</h2>
        <ul>
          <li>
            Every price is the <b>store&rsquo;s own listed price</b> (or, in the United States, one TCGplayer seller&rsquo;s), in that store&rsquo;s
            currency, <b>excluding shipping</b>, taxes charged at checkout and any discount codes.
          </li>
          <li>
            We read each store about twice a day. A price or stock status is what the store said <b>when we last read it</b>, and may have changed
            since. Each listing shows how long ago that was. The store&rsquo;s own page is the only price that counts; if the two disagree, the
            store is right.
          </li>
          <li>
            <b>No guarantee of availability.</b> &ldquo;In stock&rdquo; and &ldquo;pre-order&rdquo; mean the store listed it as orderable at the
            last read, not that it will be there when you arrive, and not that the store will honour a price it has since changed.
          </li>
          <li>
            Listings are matched to products by their titles, automatically. We would rather leave a listing out than put it on the wrong product,
            but mistakes happen; <Link href="/contact#report">tell us</Link> and we will fix or remove it.
          </li>
          <li>
            We are not a store and sell nothing. Your purchase is a contract between you and the store; its terms, returns and consumer law
            apply, not ours.
          </li>
        </ul>

        <h2 id="affiliate">Affiliate links</h2>
        <p>
          Links to eBay and TCGplayer are affiliate links (eBay Partner Network; TCGplayer through Impact). If you buy through one we may earn a
          commission, at no cost to you. The eBay listing strips and links on the site are advertisements, and so is the
          eBay row of a product&rsquo;s price table: each is marked &ldquo;Ad&rdquo;. That row (the lowest-priced eBay listing we have for
          the product) is placed by its price among the stores, and is the product&rsquo;s best price when it is a new listing cheaper than every store; it
          is never counted, and nothing else from eBay is part of a
          comparison, ranking or count.{" "}
          The strips show listings that eBay returns to us through its official listing service, imported on a schedule (about once a day in the default setting) and stored briefly (each strip says how old its
          listings are, and it may be a day or so older than eBay&rsquo;s own page), and shown as eBay lists them (title, photo, price in eBay&rsquo;s
          currency, and the shipping cost eBay gives). We don&rsquo;t verify them, take no part in any sale and can&rsquo;t promise a listing is
          still available or its price unchanged by the time you click: eBay&rsquo;s page and the seller&rsquo;s terms apply. The other eBay links
          open a search on eBay and show no eBay price.
{" "}Links to stores are plain links and stores pay us nothing. Affiliate status never changes the
          order products or stores appear in — that is price and stock only. We don&rsquo;t control eBay or TCGplayer: what you find there, and
          any purchase you make, is between you and them. See{" "}
          <Link href="/about#money">how {SITE_NAME} makes money</Link>.
        </p>

        <h2 id="trademarks">Trademarks and content</h2>
        <p>
          Pokémon and the names of its sets and products are trademarks of Nintendo, Creatures Inc., GAME FREAK inc. and The Pokémon Company, and
          are used only to identify the products being compared. Product photos are the stores&rsquo; own, shown from the stores&rsquo; servers, and
          remain theirs. {SITE_NAME} is an independent site and is not affiliated with, endorsed or sponsored by any of them, or by any store,
          eBay or TCGplayer.
        </p>
        <p>
          You may link to any page. You may not scrape or mirror the site in bulk, or use it to build a competing data set; stores&rsquo; listings
          are public and you are welcome to read them from the stores as we do.
        </p>

        <h2 id="stores">Stores</h2>
        <p>
          We list stores that publish a public catalogue feed and price in their region&rsquo;s currency (<Link href="/about#which-stores">which stores and why</Link>). A store
          that would rather not be listed can email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and is removed within a day. Being
          listed is free and cannot be bought.
        </p>

        <h2 id="liability">No warranty</h2>
        <p>
          The site is provided as is, free of charge, and without warranty of any kind. To the fullest extent the law allows, we are not liable for
          any loss from relying on a price or stock status shown here, from a store&rsquo;s conduct, or from the site being unavailable or wrong.
          Nothing in these terms limits rights that consumer law gives you and that cannot be excluded.
        </p>

        <h2 id="changes">Changes and law</h2>
        <p>
          We may change these terms; the date at the top is when they last changed in substance. These terms are governed by the laws of the
          operator&rsquo;s home jurisdiction. Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See also{" "}
          <Link href="/privacy">privacy</Link>.
        </p>
      </div>
    </div>
  );
}
