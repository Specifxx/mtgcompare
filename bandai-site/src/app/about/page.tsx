import type { Metadata } from "next";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { StaticPage } from "@/components/StaticPage";

export const revalidate = 86400;
export const metadata: Metadata = { title: `About ${SITE.name}`, description: `${SITE.name} compares ${SITE.game} prices across stores so you never overpay.`, ...canon("/about") };

export default function About() {
  return (
    <StaticPage title={`About ${SITE.name}`}>
      <p>{SITE.name} is a free price comparison site for {SITE.game}. Every day it collects the price of every {SITE.gameShort} card and sealed product from TCGplayer, eBay and {SITE.stores.length} online game stores in the US, UK, Canada, Australia and Europe, and puts them side by side, cheapest first.</p>
      <p>It is built by the team behind <a href="https://riftcompare.com" rel="noopener">Rift Compare</a> (Riftbound) and <a href="https://opcompare.app" rel="noopener">OP Compare</a> (One Piece), with the same rule: comparing prices is free for everyone, and we never hide a cheaper store.</p>
      {SITE.disclaimer && <p>{SITE.disclaimer}</p>}
      <h2>How we make money</h2>
      <p>Some buy links are affiliate links (eBay Partner Network, TCGplayer, Amazon): if you buy, the store may pay us a small commission at no cost to you. Amazon, eBay and TCGplayer, our affiliate partners, head each price table whatever their price, with &ldquo;Best price&rdquo; still marking the cheapest. The stores below them are ranked by price only — a store that pays us nothing ranks exactly where its price puts it.</p>
      <h2>Contact</h2>
      <p>Spotted a wrong price, or run a store that sells {SITE.gameShort}? <a href="/contact">Get in touch</a> or email <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.</p>
    </StaticPage>
  );
}
