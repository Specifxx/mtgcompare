import type { Metadata } from "next";
import Link from "next/link";
import { ADSENSE_CLIENT } from "@/lib/adsense";
import { CONTACT_EMAIL, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What DexCompare collects (very little) and why.",
  alternates: { canonical: `${SITE_URL}/privacy` },
};

// Bump when what is collected changes, not for wording.
const LAST_UPDATED = ADSENSE_CLIENT ? "15 October 2026" : "14 October 2026";

export default function Privacy() {
  return (
    <div className="page max-w-3xl py-12">
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Privacy</h1>
      <p className="mt-2 text-sm text-faint">Last updated {LAST_UPDATED}</p>
      <div className="prose-dex mt-6">
        <p>
          DexCompare has no accounts and doesn&rsquo;t ask for your email.{" "}
          {ADSENSE_CLIENT ? "We show ads from Google AdSense, which uses cookies (below)." : "It sets no advertising cookies."} Here is everything we collect.
        </p>
        <h2>Analytics</h2>
        <p>
          We use Vercel Web Analytics to count page views, and clicks on outbound buy links. A page view is recorded by its path only: what you
          type into the search box is stripped from the address before it is counted. Each click records the retailer the link goes
          to (for example &ldquo;Pokebox (AU)&rdquo;, &ldquo;TCGplayer&rdquo; or &ldquo;eBay (ebay.com.au)&rdquo;) and where on the page it
          was (for example the best-price button or the price table), together with the page it happened on and the anonymous context
          Vercel Web Analytics attaches to every page view: the referring page, your approximate location (country, region, city) and
          your browser, operating system and device type. It uses no cookies, collects no personal data and doesn&rsquo;t identify you,
          on this site or across others.
        </p>
        <h2>Links to stores, eBay and TCGplayer</h2>
        <p>
          When you follow a link to a store, eBay or TCGplayer, that site&rsquo;s own privacy policy applies. eBay links carry an eBay Partner
          Network tag, and TCGplayer links pass through TCGplayer&rsquo;s affiliate network (Impact), so they can credit us for the referral.
          Store links are plain links. The eBay units on the site are advertisements, marked &ldquo;Ad&rdquo;; they load no ad script,
          tracking pixel or cookie from eBay.
          {" "}
          The eBay listing strips load one thing from eBay: when a strip scrolls near the screen, your browser asks DexCompare&rsquo;s own
          server for the listings it has stored (that request carries nothing about you; the listings were imported from eBay on a schedule (about once a
          day in the default setting) with our own key, never with your details), and then loads each listing&rsquo;s thumbnail <b>directly from eBay&rsquo;s image
          servers</b> (ebayimg.com), which shares your IP address and browser type with eBay. We ask your browser not to send the page address
          along (no-referrer). Nothing is loaded until the strip is near the screen, and eBay sets no cookie through it. We store the
          imported listings only briefly (about a day) and then delete them; they hold nothing about visitors.
          <> Set logos on the set pages are loaded from the Pokémon TCG image catalogue (images.pokemontcg.io / images.scrydex.com), which can see that request.</>
        </p>
        {ADSENSE_CLIENT && (
          <>
            <h2 id="ads">Advertising (Google AdSense)</h2>
            <p>
              Some pages show ads served by Google AdSense, labelled &ldquo;Advertisement&rdquo;. Google and its partners use cookies and similar technologies to serve
              ads based on your visits to this and other websites, to limit how often you see an ad and to measure ads. Google&rsquo;s use of advertising cookies
              lets it and its partners serve ads based on those visits. You can opt out of personalised advertising in{" "}
              <a href="https://adssettings.google.com" rel="noopener noreferrer">Google&rsquo;s Ads Settings</a>, or opt out of some third-party vendors&rsquo; cookies at{" "}
              <a href="https://www.aboutads.info/choices" rel="noopener noreferrer">aboutads.info</a>. How Google uses data from sites that use its services is explained at{" "}
              <a href="https://policies.google.com/technologies/partner-sites" rel="noopener noreferrer">policies.google.com/technologies/partner-sites</a>. In the UK,
              the EEA and Switzerland you are asked for consent before personalised ads are shown. DexCompare itself receives no personal data from these ads.
            </p>
          </>
        )}
        <h2>Kept in your browser</h2>
        <p>
          The &ldquo;Recently viewed&rdquo; row remembers the last products you opened in each region. That list is kept only in this
          browser (in its local storage, as product addresses and nothing else), is never sent to DexCompare, and is removed when you
          clear this site&rsquo;s data in your browser or press &ldquo;Clear&rdquo; on the row. Search suggestions work the same way: your
          browser loads one list of products from DexCompare, the same list for every visitor, and matches what you type against it on
          your device, so the letters you type are not sent to us while you type.
        </p>
        <h2>Server logs</h2>
        <p>
          The host (Vercel) keeps ordinary request logs for a short time for security and debugging, as every web host does. We do not use
          them to identify visitors.
        </p>
        <h2>Contact</h2>
        <p>
          Questions, or want your data removed? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> — see <Link href="/contact">contact</Link>.
        </p>
      </div>
    </div>
  );
}
