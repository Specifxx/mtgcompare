// "List your store": the page every Compare Empire site shares for a store owner
// who wants to be compared (owner, 2026-11-04: "we need to be so popular that
// people will come to us rather than we going to them... some people ask us to
// add their website, we want to encourage that"). It says what a store gets,
// what we need and what happens next, then the ListStore form. Region-neutral
// copy, inherited styling, the same file in every repo; a site passes its own
// facts. Nothing here reads a cookie, a header or a database.
import type { ReactNode } from "react";
import { ListStore } from "./ReportForms";

const h2 = { fontSize: "1.25rem", fontWeight: 700, margin: "28px 0 8px" } as const;
const ul = { paddingLeft: 20, margin: "8px 0", lineHeight: 1.6 } as const;
const ol = { paddingLeft: 22, margin: "8px 0", lineHeight: 1.6 } as const;
const p = { margin: "8px 0", lineHeight: 1.6 } as const;

export function ListYourStore({
  site,
  what,
  markets,
  storeCount,
  regions,
  email,
  platforms = "Shopify, WooCommerce or BigCommerce",
  pricesRule,
  suggestHref,
  howHref = "/how-we-pick-stores",
  buttonClassName,
  showTitle = true,
  children,
  badge,
}: {
  /** the site's name, e.g. "Gundam Compare" */
  site: string;
  /** what the stores sell, e.g. "Gundam cards and Gunpla kits" */
  what: string;
  /** the markets the site compares, in words: "the US, UK, Canada and Australia" */
  markets: string;
  /** how many stores the site compares today (left out under 5) */
  storeCount?: number;
  /** region codes and names for the form's "ships from" */
  regions?: [string, string][];
  /** the site's inbox, for owners who would rather email */
  email?: string;
  /** the shop platforms the importer reads, in words */
  platforms?: string;
  /** the site's own one-line price rule, if any (a wrong-price rule the owner should know) */
  pricesRule?: string;
  /** where a shopper (not an owner) suggests a store */
  suggestHref?: string;
  howHref?: string;
  buttonClassName?: string;
  /** false when the site's page wrapper already draws the h1 */
  showTitle?: boolean;
  /** anything site-specific to say under "What we need" */
  children?: ReactNode;
  /** the site's plain-HTML "compared on" badge (lib/embed.ts storeBadge), offered to stores already listed (2026-11-08) */
  badge?: string;
}) {
  const count = storeCount && storeCount >= 5 ? `${storeCount} stores` : "stores";
  return (
    <div style={{ maxWidth: 720 }}>
      {showTitle ? <h1 style={{ fontSize: "1.9rem", fontWeight: 800, margin: "8px 0 12px" }}>List your store on {site}</h1> : null}
      <p style={p}>
        {site} compares prices for {what} across {count} in {markets}, and sends buyers straight to the store with the best price.
        Listing is free, there is no contract and no fee, and you never pay to rank: prices are sorted by price only.
      </p>

      <h2 style={h2}>What your store gets</h2>
      <ul style={ul}>
        <li><strong>Buyers who are ready to order.</strong> Every product you stock shows your price beside the other stores&apos;, with a link to your own product page. The cheapest in-stock price wins the badge.</li>
        <li><strong>Nothing to maintain.</strong> We read your prices and stock from your shop every day. No feed to upload, no account, no plugin.</li>
        <li><strong>A fair comparison.</strong> No store pays to be listed or to rank higher, and we never sell your listing to a competitor.</li>
      </ul>

      <h2 style={h2}>What we need</h2>
      <ul style={ul}>
        <li><strong>A shop we can read.</strong> {platforms} work straight away; most other platforms with a public product feed do too. We read your public product listing once a day, gently, and respect robots.txt.</li>
        <li><strong>{what.charAt(0).toUpperCase() + what.slice(1)} in your own currency,</strong> with clear product titles. A listing we cannot match exactly is left out rather than guessed{pricesRule ? `, and ${pricesRule}` : ""}.</li>
        <li><strong>An established store.</strong> A business name, contact details and your own shipping and refund policies on your site. Every store is checked before it is listed and every week after: <a href={howHref}>how we pick stores</a>.</li>
        {children}
      </ul>

      <h2 style={h2}>How it works</h2>
      <ol style={ol}>
        <li>Send the form below. It takes a minute.</li>
        <li>We check your store within a few days and reply through the contact details on your website.</li>
        <li>Once it passes, your prices appear with the next daily update and stay up to date on their own.</li>
      </ol>

      <h2 style={h2}>List your store</h2>
      <ListStore regions={regions} what={what} buttonClassName={buttonClassName} />
      {email ? (
        <p style={p}>
          Prefer email? Write to <a href={`mailto:${email}?subject=${encodeURIComponent(`List my store on ${site}`)}`}>{email}</a> with your store&apos;s address.
        </p>
      ) : null}
      {suggestHref ? (
        <p style={{ ...p, opacity: 0.8 }}>
          Not a store owner, just know a good shop? <a href={suggestHref}>Suggest a store</a> instead.
        </p>
      ) : null}

      {/* The badge for stores already listed (competitor scan, 2026-11-08): plain HTML and an ordinary link, no iframe,
          script, image or tracking, so the link sits on the store's own page. Offered here and on a store's own page only,
          never sent to anyone. */}
      {badge ? (
        <>
          <h2 style={h2}>Already listed? Add our badge</h2>
          <p style={p}>
            Show your customers that your prices are compared in the open. Paste this into your footer or product pages. It is
            plain HTML: no script, no image to load and no tracking.
          </p>
          <div style={{ margin: "12px 0" }} dangerouslySetInnerHTML={{ __html: badge }} />
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", userSelect: "all", fontSize: 12, lineHeight: 1.5, padding: 12, borderRadius: 8, border: "1px solid rgba(127,127,127,.35)", margin: "8px 0" }}>
            <code>{badge}</code>
          </pre>
        </>
      ) : null}
    </div>
  );
}
