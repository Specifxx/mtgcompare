import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ADSENSE_CLIENT } from "@/lib/adsense";
import Link from "@/components/Link";
import { DUTIES_NOTE, REGION_LIST } from "@/lib/regions";
import { PROBE_ADDRESSES } from "@/lib/shipping-probe";
import { CONTACT_EMAIL, FAN_CONTENT_DISCLAIMER, SITE_URL } from "@/lib/site";
import { STORES, storesInMarket } from "@/lib/stores";
import { SuggestedTypeLinks } from "@/components/RegionSuggest";
import { COUNTRY_GUIDE } from "@/content/guides/country-prices";
import { PRODUCT_TYPES } from "@/lib/sealed-title";
import { faqJsonLd, jsonLd } from "@/lib/seo";

// The questions a first-time visitor (and a crawler) asks, answered from the facts this page states. Moved here from the landing
// page when it was cut short (2026-10-25), with its FAQPage JSON-LD: the markup goes only where the answers are shown.
const FAQ: { q: string; a: string }[] = [
  {
    q: "What is MTG Compare?",
    a: `A free price-comparison site for English-language Magic: The Gathering sealed product: play and collector booster boxes, bundles, Commander decks and more. It reads ${STORES.length} independent stores in ${REGION_LIST.length} regions and ranks every product's listings in stock first, cheapest first.`,
  },
  {
    q: "How often are prices and stock checked?",
    a: "About twice a day. Every listing says when it was last read, and a store that hasn’t answered for three days is marked as not checked recently, never guessed.",
  },
  {
    q: "Does MTG Compare sell cards?",
    a: "No. Every buy button goes to the store’s own website, and you buy from the store. MTG Compare keeps no accounts and asks for no email.",
  },
  {
    q: "Do stores pay to be listed?",
    a: `No. Stores are ranked by price and stock only. The site earns from marked eBay and TCGplayer affiliate links${ADSENSE_CLIENT ? " and Google ads" : ""}, which never change the order of the stores.`,
  },
  {
    q: "Which prices are shown?",
    a: "Each store’s own listed price, in your region’s currency, before shipping. Beside it is the store’s shipping for one item, measured weekly from its own checkout where we can; “Price + shipping” on a product page ranks by both. The store’s checkout is final.",
  },
  {
    q: "Why can’t I find singles or Japanese product?",
    a: "MTG Compare compares English-language sealed product only, so every product page compares like with like. Singles, graded cards, Japanese product, accessories and store-made bundles are left out on purpose.",
  },
];

export const metadata: Metadata = {
  title: "How MTG Compare works",
  description: "How MTG Compare finds Magic sealed prices and stock, what it does and doesn't store, how it makes money, and how stores get listed.",
  alternates: { canonical: `${SITE_URL}/about` },
};


export default function About() {
  return (
    <div className="page max-w-3xl py-12">
      <Breadcrumbs items={[{ href: "/", label: "MTG Compare" }, { label: "About" }]} />
      <h1 className="font-display text-4xl font-extrabold tracking-tight">How MTG Compare works</h1>
      <div className="prose-dex mt-6">
        <p>
          MTG Compare compares Magic: The Gathering <b>sealed product</b> — play and collector booster boxes, bundles, Commander decks,
          starter kits, prerelease packs and boosters — across {STORES.length} independent stores in {REGION_LIST.length} regions. It does one job: show you
          who has something in stock and who is cheapest.
        </p>
        <p>
          The same booster box is often priced very differently from one shop to the next on the same day, and one shop&rsquo;s sold-out
          page says nothing about the next one&rsquo;s stock. Every listing here carries the time it was last read, so you can see how fresh a
          price is before you click through.
        </p>

        <h2>Where the prices come from</h2>
        <p>
          About twice a day we read each store&rsquo;s public product listings (the same catalogue feed their own website uses), in the
          store&rsquo;s own currency. Every price you see is that store&rsquo;s listed price, excluding shipping. We never convert currencies:
          a region only compares stores that charge in its currency.
        </p>
        <p>
          In the United States we also read TCGplayer, a marketplace of many sellers, and show the cheapest English listing among its
          lowest-priced offers for each product when we last read it, excluding shipping — one seller&rsquo;s price, which may have changed
          by the time you click. It is compared with the US stores on the same terms: price, then stock. It is never counted as one of the
          stores.
        </p>

        <ul>
          <li>
            <b>In stock</b> — the store listed it as available when we last read it.
          </li>
          <li>
            <b>Pre-order</b> — available to order for a set that hasn&rsquo;t released yet.
          </li>
          <li>
            <b>Sold out</b> — listed, but not available.
          </li>
          <li>
            <b>Not checked recently</b> — we couldn&rsquo;t read that store for over three days, so we don&rsquo;t know.
          </li>
        </ul>
        <p>
          The headline &ldquo;from&rdquo; price is always the cheapest listing you can actually order. We match listings to products by their
          titles, and we&rsquo;d rather leave a listing out than put it on the wrong product: singles, graded cards, accessories, other
          languages and store-made bundles are excluded.
        </p>

        <h2>Shipping and tax</h2>
        <p>
          Shipping differs between stores, and within a country by where you live: a box that is cheaper by $10 is not cheaper if it costs
          $20 more to post to you. So once a week we ask each store&rsquo;s own checkout what it charges to post one item (a cart with a
          pack, then with items around a few price points, up to a booster box) to several addresses in each region:{" "}
          {REGION_LIST.map((r) => `${PROBE_ADDRESSES[r.market].map((a) => a.label).join(", ")} (${r.short})`).join("; ")}. Each row of a price table
          shows what was quoted for an item near its price, as a range when it depends on the address or the order value, and &ldquo;Shipping
          at checkout&rdquo; when we have no measurement (stores whose checkout we cannot ask, and TCGplayer). We never guess a rate. Pick
          &ldquo;Price + shipping&rdquo; above a price table to rank by the price plus the cheapest measured shipping; the default ranking is
          price and stock. The carts we create only ask for a quote; nothing is ordered, and the store&rsquo;s own checkout is always final.
        </p>
        <ul>
          {REGION_LIST.map((r) => (
            <li key={r.region}>
              <b>{r.name}</b> — {r.taxNote}
            </li>
          ))}
        </ul>
        <p>{DUTIES_NOTE}</p>

        <h2 id="which-stores">Which stores, and why</h2>
        <p>
          A store is listed when it passes four checks, run by a script before it is added (the feed, currency and robots.txt checks run again on every read): it publishes a
          <b> public catalogue feed</b> (the Shopify or WooCommerce product listing its own website is built on — we read that, not the
          pages); it lists <b>at least three</b> Magic sealed products; it prices them <b>in its region&rsquo;s currency</b>; and its{" "}
          <b>robots.txt</b> allows the read. We pause between requests and back off when a store asks us to.
        </p>
        <p>
          That rule decides who is missing, too. Big-box chains and department stores without a public feed are out of scope, however large
          their Magic range, and so is any store that prices a region in a converted currency. It is why the store lists are independent
          hobby and games stores, and why a region with few of those (Singapore, New Zealand) has fewer comparisons than Australia or the US.
          Marketplaces are not stores: TCGplayer appears in the US as a marketplace, badged as such, and is never counted in &ldquo;N stores&rdquo;.
        </p>

        <h2 id="refuse">What we refuse, with examples</h2>
        <p>
          A listing has to be English-language Magic: The Gathering sealed product, as Wizards of the Coast sealed it. Everything else is left
          out, even when the store files it under Magic:
        </p>
        <ul>
          <li>
            <b>Singles and graded cards</b> — &ldquo;The One Ring (Borderless) PSA 10&rdquo;, &ldquo;Sheoldred, the Apocalypse [DMU] Foil&rdquo;. MTG Compare has no singles at all.
          </li>
          <li>
            <b>Japanese and other-language product</b> — &ldquo;Japanese Play Booster Box&rdquo;, &ldquo;Display de boosters (FR)&rdquo;. A region compares English print runs only, because that is what its stores compete on.
          </li>
          <li>
            <b>Other games and merchandise</b> — Pokémon, One Piece and Lorcana boxes, binders, sleeves, deck boxes, playmats, dice.
          </li>
          <li>
            <b>Store-made bundles and partial product</b> — &ldquo;3 Collector Boosters + playmat deal&rdquo;, &ldquo;10 loose packs&rdquo;, repacks and mystery boxes,
            opened or &ldquo;unshrinked&rdquo; boxes, damaged-box discounts. There is no like-for-like price for those.
          </li>
          <li>
            <b>Prices that cannot be real</b> — a listing far below every other store&rsquo;s price for the same product (a placeholder, or a
            single pack filed as a box) is left out rather than shown as the &ldquo;from&rdquo; price.
          </li>
        </ul>
        <p>
          The filter errs towards leaving things out. If it leaves out something it should list, or lists something it should not,{" "}
          <Link href="/contact#report">report it</Link>.
        </p>

        <h2 id="freshness">Freshness</h2>
        <p>
          Every store is read about twice a day, and the site is updated from the latest read once a day: a &ldquo;from&rdquo; price, a stock
          status, a store&rsquo;s listing count, the median a region&rsquo;s stores are asking. Each listing shows how long ago its store was
          read. When a store cannot be read for three days its listings are marked &ldquo;not checked recently&rdquo; and drop out of the
          &ldquo;from&rdquo; price; after two weeks they are removed. A store that lists twenty or more products and had none of them in stock
          at the last read is treated as dormant, and so is one whose &ldquo;in stock&rdquo; prices sat far below the other stores&rsquo; on many
          products (we do not trust those): its listings stay on product pages, marked sold out, but it no longer counts towards
          &ldquo;listed by N stores&rdquo;. We keep nothing from earlier reads, so no figure here compares today with an earlier day.
        </p>

        <h2 id="report">Report a listing</h2>
        <p>
          Wrong price, wrong product, wrong stock, or a store that should not be there: email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with the page&rsquo;s address and the store&rsquo;s name. Details on{" "}
          <Link href="/contact#report">the contact page</Link>. Fixes usually land with the next read.
        </p>

        <h2>What we don&rsquo;t keep</h2>
        <p>
          MTG Compare keeps one snapshot a day of each product&rsquo;s cheapest in-stock price and how many stores have it in stock
          (the price history on product pages, from 23 October 2026), and nothing more about the stores&rsquo; past listings. It keeps no
          data about you: no accounts, no emails, no cookies. We count page views and clicks on buy links, without knowing who made them. See{" "}
          <Link href="/privacy">privacy</Link>.
        </p>

        <h2 id="money">How MTG Compare makes money</h2>
        <p>
          {ADSENSE_CLIENT ? "Through one Google ad in some guides, and through affiliate links of only two kinds" : "Through affiliate links, and only two kinds"}: <b>eBay</b> (the eBay Partner Network) and <b>TCGplayer</b> (through Impact). If you
          buy through one we may earn a small commission, at no cost to you &mdash; the price is the same as going direct. Every one is
          marked where it appears: eBay with an &ldquo;Ad&rdquo; label, TCGplayer with &ldquo;affiliate link&rdquo;.
        </p>
        {ADSENSE_CLIENT && (
          <p>
            Some guides also carry one Google AdSense ad, labelled &ldquo;Advertisement&rdquo;. Google chooses what it shows; no advertiser pays to change a price,
            a ranking or a guide. <Link href="/privacy#ads">How Google uses cookies for these ads</Link>.
          </p>
        )}
        <p>
          We keep them out of your way: at most one ad on a phone screen at a time and two on a wide screen, no pop-ups or countdowns, space
          kept for every ad before it loads so nothing you are reading gets pushed aside, and no ads on this page or the Terms, Privacy or
          Contact pages.
        </p>

        <h3 id="ebay" className="mb-2 mt-6 font-display text-base font-bold text-ink">eBay</h3>
        <p>
          The eBay listings you see are <b>real Buy It Now listings</b>. On a schedule (once a day, in the default setting) our server asks
          eBay&rsquo;s official listing service (its Browse API) for them and stores the latest few for each place they appear; your browser
          fetches them after the page loads, and each unit says how old its listings are. Each listing is shown as eBay lists it &mdash; its
          title, photo, price in the currency eBay shows, its shipping and, when it is not new, its condition &mdash; never converted, counted
          or averaged, and it links to the listing on eBay. Because they are imported on a schedule, not live, a price or its availability
          may have changed by the time you click: eBay&rsquo;s page is final. We keep a listing only while it can be shown (a day or so) and
          then delete it. Where there is nothing to show, a unit is a single &ldquo;search eBay&rdquo; button.
        </p>
        <p>Where eBay appears:</p>
        <ul>
          <li>
            <b>Listing strips</b>, in a dashed, tinted box of their own: two on each region&rsquo;s home page (sealed Magic, then chase
            cards further down), and one on product, set, type, release, store, deals, cheapest-per-pack and
            &ldquo;this week&rdquo; pages, the first page of the product list and each guide; most pages also have a slimmer strip above
            the footer.
          </li>
          <li>
            <b>Listing tiles in long product grids</b> (browse, set, type and deals pages): a tile the size of a product card after every
            16 products, at most two in a grid, framed and labelled the same way and never the same listing as the page&rsquo;s strips.
          </li>
          <li>
            <b>On a product page</b>, the product&rsquo;s own eBay listing, when it has one, always marked &ldquo;Ad&rdquo; with how old it
            is: a tinted row of the price table, placed by its price among the stores that have it in stock (after them when the row is an
            eBay search, and always in New Zealand and Singapore, whose listings come from another country&rsquo;s eBay in its currency);
            the best price at the top of the page, when that listing is new and cheaper than every store that has the product in stock (not
            for a pre-order), with its per-pack price and how it compares with the median and MSRP, its shipping and the cheapest
            store&rsquo;s price beside it; and the eBay-blue button in the Marketplaces box, which shows the listing&rsquo;s price when the
            top of the page is not already showing it. Without a listing, the row and the button are searches for the product on eBay.
          </li>
          <li>
            <b>When a product is sold out at every store</b>, the sold-out notice at the top of the page has an eBay box: a search for the
            product on eBay or, where eBay has its own new listing (not for a pre-order, and not in New Zealand or Singapore), that listing
            with its price, shipping and age. TCGplayer is the second choice under it, and products of the same kind that are in stock
            follow the price table.
          </li>
          <li>
            <b>A buy bar on phones</b>: on a product page, once the price at the top has scrolled out of view, a slim bar at the foot of the
            screen repeats it &mdash; the same store, TCGplayer or eBay button the top of the page shows, labelled the same way. It hides
            while the price table, another ad or the footer is on screen, and you can close it for the rest of your visit.
          </li>
          <li>
            <b>Search buttons</b>: an &ldquo;eBay&rdquo; item in the header on wide screens, a &ldquo;Shop &hellip; sealed on eBay&rdquo;
            button in the strip of every set that is out (popular sets say &ldquo;Shop &hellip; on eBay&rdquo;), and, when you search the
            product list, one box that searches eBay for the same words. A search button opens eBay&rsquo;s own results.
          </li>
        </ul>
        <p>
          Those product-page places are the only ones where eBay is part of the comparison: the one tinted row of the price table, placed by
          its price, and the same listing shown at the top of the page, in the sold-out notice or in the Marketplaces box. eBay is never
          counted in the number of stores or the median, never changes the order of the stores, and its listings never appear in what
          search engines read of a page.
        </p>

        <h3 id="tcgplayer" className="mb-2 mt-6 font-display text-base font-bold text-ink">TCGplayer</h3>
        <p>
          Every link to tcgplayer.com. TCGplayer is a US marketplace. In the United States we compare it alongside the stores, and it is
          ranked by price and stock like any store; set pages, guides and searches of the product list also link to a TCGplayer search,
          marked &ldquo;affiliate link&rdquo;. Elsewhere it appears only as a separate, labelled US marketplace in US$ (in a product&rsquo;s Marketplaces box and as
          the second choice when a product is sold out), never in your region&rsquo;s comparison or its &ldquo;from&rdquo; price.
        </p>

        <h3 id="stores-pay-nothing" className="mb-2 mt-6 font-display text-base font-bold text-ink">Stores</h3>
        <p>
          Links to stores are plain links: stores pay us nothing. No one pays to be listed or to rank higher, and commissions never change the
          order &mdash; it is price and stock, nothing else. MTG Compare is not endorsed by eBay or TCGplayer.
        </p>

        <h2 id="stores">For stores</h2>
        <p>
          If you sell English Magic sealed product online on Shopify or WooCommerce, we can list you for free. Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with your store&rsquo;s address and it goes through the same checks as every
          other store (<a href="#which-stores">above</a>). If you&rsquo;d rather not be listed, email us and we&rsquo;ll remove you within a day.
          We read a few pages of your catalogue twice a day and respect robots.txt. Listing is free and cannot be bought; nothing changes the
          ranking except price and stock.
        </p>
        <p>
          Stores currently compared:{" "}
          {REGION_LIST.map((r, i) => (
            <span key={r.region}>
              {i > 0 && ", "}
              <Link href={`/${r.region}/stores`}>
                {storesInMarket(r.market).length} in {r.name}
              </Link>{" "}
              ({r.currency})
            </span>
          ))}
          . Each region compares its own stores in its own currency, so a price is one you can actually pay, before shipping. The same
          booster box in all seven, side by side: <Link href={COUNTRY_GUIDE.path}>booster box prices by country</Link>.
        </p>
      </div>

      <section id="compare" className="mt-10" aria-labelledby="compare-h">
        <h2 id="compare-h" className="mb-3 font-display text-xl font-bold text-ink">
          What we compare
        </h2>
        <SuggestedTypeLinks types={PRODUCT_TYPES.slice(0, 13).map((t) => ({ slug: t.slug, label: t.plural }))} align="start" />
        <p className="mt-3 text-sm leading-6 text-muted">
          English-language Magic: The Gathering sealed product only; <a href="#refuse" className="font-medium text-brand underline underline-offset-2">what we refuse</a> is above.
        </p>
      </section>

      <section id="faq" className="mt-10" aria-labelledby="faq-h">
        <h2 id="faq-h" className="mb-4 font-display text-xl font-bold text-ink">
          Questions
        </h2>
        {/* Written out, not collapsed: every answer is visible text in the first render, each question a real <h3>. */}
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {FAQ.map((f) => (
            <div key={f.q} className="px-4 py-4">
              <h3 className="font-semibold">{f.q}</h3>
              <p className="mt-1.5 text-[15px] leading-7 text-muted">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="prose-dex mt-6">

        <h2>Not affiliated</h2>
        <p>
          MTG Compare is an independent site and is not affiliated with, endorsed or sponsored by Wizards of the Coast or Hasbro. Magic: The
          Gathering and its trademarks are theirs. {FAN_CONTENT_DISCLAIMER}
        </p>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqJsonLd(FAQ)) }} />
    </div>
  );
}
