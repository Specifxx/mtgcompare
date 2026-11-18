import { pageMeta } from "@/lib/seo";
import { SITE } from "@/site.config";

export const dynamic = "force-dynamic";
export const metadata = pageMeta({ title: "About", description: `What ${SITE.name} is, where its prices come from and how it earns.`, path: "/about" });

export default function About() {
  return (
    <div className="page">
      <h1>About {SITE.name}</h1>
      <p className="lede">A price guide for single trading cards. One page per card, with what it has recently sold for.</p>
      <h2>Where the prices come from</h2>
      <p>Every price is TCGplayer&rsquo;s market price in US dollars: what copies of that printing recently sold for on TCGplayer, not what a seller is asking. We read TCGplayer&rsquo;s public price files once a day. A card with no recent sale shows no price.</p>
      <h2>Price history</h2>
      <p>We keep each card&rsquo;s price from the day this site first read it, and add a point whenever it moves. The history cannot go back further than that.</p>
      <h2>How the site earns</h2>
      <p>The eBay and TCGplayer buttons are paid links: we may earn a commission when you buy. It never changes a price shown here, and no seller pays to be listed.</p>
      <h2>Not affiliated</h2>
      <p>{SITE.disclaimer}</p>
    </div>
  );
}
