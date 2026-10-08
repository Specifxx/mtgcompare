import type { Metadata } from "next";
import Link from "next/link";
import { StaticPage } from "@/components/StaticPage";
import { getSiteStats } from "@/lib/data";
import { CONTACT_EMAIL, DATA_ATTRIBUTION, FAN_CONTENT_DISCLAIMER, FAN_CONTENT_POLICY_URL, SCRYFALL_URL, SISTER_SITES, SITE_NAME, UNOFFICIAL_FAN_SITE_NOTICE } from "@/lib/site";
import { pageOg } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: `About ${SITE_NAME}`,
  description: `Who runs ${SITE_NAME}, what it does, where its data comes from and how it is paid for.`,
  alternates: { canonical: "/about" },
  openGraph: pageOg("/about"),
};

export default async function About() {
  const ebayLive = (await getSiteStats().catch(() => null))?.ebayLive ?? false;
  return (
    <StaticPage title={`About ${SITE_NAME}`} crumb="About">
      <p>
        {SITE_NAME} is a price comparison site for Magic: The Gathering. It
        answers one question for every card and sealed product: where is it
        cheapest to buy right now, in my country and my currency?
      </p>
      <p>
        It reads the public listings of dozens of stores in the United States,
        Australia, the United Kingdom, Singapore, Canada and the eurozone,
        matches every listing to the exact printing and finish it is — set,
        collector number, foil, etched or a special frame — and ranks the offers
        cheapest first. Prices are published once a day; the code of the site
        ships once a week, and never holds a price back.
      </p>
      <h2>Where the data comes from</h2>
      <p>
        TCGplayer&apos;s catalogue (read through TCGCSV) is the backbone of the
        prices: every printing TCGplayer lists has a page here, with
        TCGplayer&apos;s market price. Card names, rules text, legalities and
        card art are matched from <a href={SCRYFALL_URL}>Scryfall</a>. {DATA_ATTRIBUTION}
      </p>
      <h2>Made by the RiftCompare team</h2>
      <p>
        {SITE_NAME} is a sister site of{" "}
        {SISTER_SITES.map((x, i) => (
          <span key={x.name}>
            {i ? " and " : ""}
            <a href={x.url}>{x.name}</a> ({x.game})
          </span>
        ))}
        . Same approach, same rules: a price is a live listing you can buy,
        never a guess, and a listing we cannot match with certainty is left out.
      </p>
      <h2>How it is paid for</h2>
      <p>
        Some outbound links are affiliate links: when you buy through an eBay or
        TCGplayer link, {SITE_NAME} may earn a commission at no extra cost to
        you. Affiliate status never changes the order of a price comparison — it
        is always cheapest first. Rows that are paid links are labelled.
        {ebayLive ? (
          <>
            {" "}eBay prices are the cheapest matching Buy It Now listing we found,
            shown as an asking price among the stores — never moved up or down
            because they are eBay. {SITE_NAME} is an eBay Partner Network
            affiliate.
          </>
        ) : null}
      </p>
      <h2>Unofficial fan site</h2>
      <p>{UNOFFICIAL_FAN_SITE_NOTICE}</p>
      <p>
        {FAN_CONTENT_DISCLAIMER}{" "}
        <a href={FAN_CONTENT_POLICY_URL} rel="noopener noreferrer">
          Wizards of the Coast Fan Content Policy
        </a>
        .
      </p>
      <p>
        Questions, corrections or a store to add:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> or the{" "}
        <Link href="/contact">contact page</Link>.
      </p>
    </StaticPage>
  );
}
