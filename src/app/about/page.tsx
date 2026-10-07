import type { Metadata } from "next";
import Link from "next/link";
import { StaticPage } from "@/components/StaticPage";
import { getSiteStats } from "@/lib/data";
import { CONTACT_EMAIL, SISTER_SITE, SITE_NAME } from "@/lib/site";
import { pageOg } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: "About OP Compare",
  description: "Who runs OP Compare, what it does and how it is paid for.",
  alternates: { canonical: "/about" },
  openGraph: pageOg("/about"),
};

export default async function About() {
  const ebayLive = (await getSiteStats().catch(() => null))?.ebayLive ?? false;
  return (
    <StaticPage title={`About ${SITE_NAME}`} crumb="About">
      <p>
        {SITE_NAME} is a price comparison site for the One Piece Card Game. It
        answers one question for every card and sealed product: where is it
        cheapest to buy right now, in my country and my currency?
      </p>
      <p>
        It reads the public listings of dozens of stores in the United States,
        Australia, the United Kingdom, Singapore, Canada and the eurozone twice
        a day, matches every listing to the exact printing it is — standard,
        Parallel, Manga, SP, Treasure Rare or promo — and ranks the offers
        cheapest first. TCGplayer&apos;s catalogue is the backbone: every
        printing TCGplayer lists has a page here.
      </p>
      <h2>Made by the RiftCompare team</h2>
      <p>
        {SITE_NAME} is the sister site of{" "}
        <a href={SISTER_SITE.url}>{SISTER_SITE.name}</a>, which does the same
        for {SISTER_SITE.game}. Same approach, same rules: a price is a live
        listing you can buy, never a guess, and a listing we cannot match with
        certainty is left out.
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
      <h2>Not affiliated with Bandai</h2>
      <p>
        {SITE_NAME} is an independent, fan-made site. It is not affiliated with,
        endorsed or sponsored by Bandai, Eiichiro Oda, Shueisha or Toei
        Animation. ONE PIECE and the One Piece Card Game are trademarks of their
        respective owners; card images are TCGplayer&apos;s product images.
      </p>
      <p>
        Questions, corrections or a store to add:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> or the{" "}
        <Link href="/contact">contact page</Link>.
      </p>
    </StaticPage>
  );
}
