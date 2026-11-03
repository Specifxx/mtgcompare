// "How we pick stores": the store-vetting page every Compare Empire site shares
// (owner, 2026-11-02). The criteria and the weekly check live in RiftCompare's repo
// (docs/store-vetting.md, scripts/store-vetting.mjs); this file only says them
// plainly. Region-neutral copy, inherited styling, the same file in every repo.
import type { ReactNode } from "react";
import { ReportStore } from "./ReportForms";

const h2 = { fontSize: "1.25rem", fontWeight: 700, margin: "28px 0 8px" } as const;
const ul = { paddingLeft: 20, margin: "8px 0", lineHeight: 1.6 } as const;
const p = { margin: "8px 0", lineHeight: 1.6 } as const;

export function HowWePickStores({
  site,
  what,
  stores = [],
  priceRule,
  marketplaces,
  buttonClassName,
  suggestHref,
  showTitle = true,
  family = true,
}: {
  /** the site's name, e.g. "Gundam Compare" */
  site: string;
  /** what the stores sell, e.g. "Gundam cards" */
  what: string;
  /** every store name the site lists, for the report form's suggestions */
  stores?: string[];
  /** this site's own too-cheap rule in one sentence */
  priceRule: string;
  /** a sentence on marketplace rows (eBay, Amazon) where the site shows them */
  marketplaces?: ReactNode;
  buttonClassName?: string;
  /** where the "Suggest a store" form lives, if the site has one */
  suggestHref?: string;
  /** false when the site's page wrapper already draws the h1 */
  showTitle?: boolean;
  /** false on a site that carries no Compare Empire branding */
  family?: boolean;
}) {
  return (
    <div style={{ maxWidth: 720 }}>
      {showTitle ? <h1 style={{ fontSize: "1.9rem", fontWeight: 800, margin: "8px 0 12px" }}>How we pick stores</h1> : null}
      <p style={p}>
        Sending people to the cheapest price is only useful if the store is real and actually ships. Every store on {site} is added by hand
        after a check, and it stays only while it keeps passing. No store pays to be listed or to rank higher: prices are always sorted by price.
      </p>

      <h2 style={h2}>Before a store is added</h2>
      <ul style={ul}>
        <li><strong>It is an established shop.</strong> Its website has been around for a while (we look up when the domain was registered, and a domain under a year old gets a much closer look), with a business name, a real email or phone, and its own refund and shipping policies.</li>
        <li><strong>Other buyers know it.</strong> It has reviews (Trustpilot, Google) or is known in the community: official stockist and store-finder lists, and recommendations from buyers.</li>
        <li><strong>We read its prices from its own shop.</strong> In its own currency, product by product, and a listing must match exactly or it is left out.</li>
        <li><strong>No marketplace sellers, drop-shippers or copycat sites,</strong> and never a store anyone has reported as a scam.</li>
      </ul>

      <h2 style={h2}>After it is listed</h2>
      <ul style={ul}>
        <li><strong>A weekly check of every store&apos;s website.</strong> A store whose site stops answering, is parked or up for sale, or suddenly moves to a different address is taken off. New bad reviews or missing contact details get a look by hand.</li>
        <li><strong>Too-good-to-be-true prices are dropped.</strong> {priceRule} A price like that is usually a mistake or the wrong product, so it is never shown as the cheapest.</li>
        <li><strong>Reported stores are checked first.</strong> A store that turns out to be a scam is removed{family ? " from every Compare Empire site" : ""} and banned for good.</li>
      </ul>
      {marketplaces ? <p style={p}>{marketplaces}</p> : null}

      <h2 style={h2}>Report a store</h2>
      <p style={p}>
        Had a problem with a store we list, or does one look wrong to you? Tell us here. You don&apos;t need an account.
        {suggestHref ? (
          <>
            {" "}Know a good shop for {what} we are missing? <a href={suggestHref} style={{ textDecoration: "underline" }}>Suggest it</a>.
          </>
        ) : null}
      </p>
      <ReportStore stores={stores} buttonClassName={buttonClassName} />

      <h2 style={h2}>Before you buy anywhere</h2>
      <ul style={ul}>
        <li>Pay by card or PayPal, which let you dispute a charge. Be careful with a shop that only takes bank transfer or crypto.</li>
        <li>A price far under every other store is a warning sign, not a bargain.</li>
        <li>Check the shop&apos;s contact page and policies, and look it up on Trustpilot or Google before a big order.</li>
      </ul>
    </div>
  );
}
