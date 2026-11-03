import type { Metadata } from "next";
import Link from "@/components/Link";
import { SITE } from "@/site.config";
import { canon, SITE_URL } from "@/lib/site";
import { byValue, products, summaryOf } from "@/lib/data";
import { shortName } from "@/lib/names";
import { MARKETS } from "@/lib/site-types";
import { badgeOffer, dailySnippet, embedSnippet, storeBadge } from "@/lib/embed";

// The free widgets directory (DECISIONS.md, "Free price widgets", 2026-11-02): the page outreach points at instead of
// asking for a link. Shows code, never live iframes of our own widgets.
export const revalidate = 86400;

export function generateMetadata(): Metadata {
  return {
    title: `Free ${SITE.gameShort} Price Widgets for Your Site`,
    description: `A live ${SITE.game} card price badge for blogs, deck guides and community sites, and a badge for stores we compare. One line of HTML, free, no signup.`,
    ...canon("/embed"),
  };
}

export default function EmbedPage() {
  // A real card a US store stocks, so a pasted, unedited snippet shows a working badge.
  const example = byValue(products().filter((p) => p.kind === "card")).find((p) => badgeOffer(summaryOf(p.id).best, "US"));
  const slug = example?.slug ?? "CARD-SLUG";
  const name = example ? shortName(example.name) : "CARD NAME";
  const snippet = embedSnippet(SITE_URL, SITE.name, slug, name, `${SITE.gameShort} card price`);
  const badge = storeBadge(SITE_URL, SITE.name, SITE.gameShort);
  const daily = dailySnippet(SITE_URL, SITE.name, SITE.gameShort);
  return (
    <article className="flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-black">Free {SITE.gameShort} price widgets for your site</h1>
        <p className="text-muted">
          Drop a live card price into any page with one line of HTML. It shows the cheapest in-stock store price in your readers&apos; market and updates every
          day by itself. Free, no signup, no tracking. The widget is marked noindex, so it never competes with your own pages in search.
        </p>
      </header>

      <section className="card-surface flex flex-col gap-3 p-4">
        <h2 className="text-lg font-bold">Card price badge</h2>
        <p className="text-sm text-muted">
          For deck guides, set reviews and tier lists: put one under each card you mention and readers see what it costs today, without you keeping a price
          table up to date. <Link className="link" href={`/embed/card/${slug}`}>See it running →</Link>
        </p>
        <pre className="overflow-x-auto rounded bg-ink-900 p-3 text-xs"><code>{snippet}</code></pre>
        <ul className="list-disc pl-5 text-sm text-muted">
          <li>Change <code>{slug}</code> (in both places) to the last part of any card&apos;s address on {SITE.name}, after <code>/card/</code>.</li>
          <li>Add <code>?market=UK</code> to the widget address for another market: {MARKETS.join(", ")}. The US is the default.</li>
          <li>The plain link under the widget is optional, and it is the part that tells search engines where the price comes from.</li>
        </ul>
      </section>

      <section className="card-surface flex flex-col gap-3 p-4">
        <h2 className="text-lg font-bold">Daily price game</h2>
        <p className="text-sm text-muted">
          For creators, clubs and Discord-linked sites: today&apos;s {SITE.gameShort} Price Duel, two cards and &ldquo;which is worth more?&rdquo;. It changes by itself
          every day at midnight UTC, so your page has something new daily. <Link className="link" href="/embed/daily">See it running →</Link>
        </p>
        <pre className="overflow-x-auto rounded bg-ink-900 p-3 text-xs"><code>{daily}</code></pre>
      </section>

      <section className="card-surface flex flex-col gap-3 p-4">
        <h2 className="text-lg font-bold">For stores we compare</h2>
        <p className="text-sm text-muted">
          A small plain-HTML badge that tells your customers your prices are compared openly. No script, no image, nothing to host.{" "}
          <Link className="link" href="/stores">See the stores we compare →</Link>
        </p>
        <div dangerouslySetInnerHTML={{ __html: badge }} />
        <pre className="overflow-x-auto rounded bg-ink-900 p-3 text-xs"><code>{badge}</code></pre>
      </section>
    </article>
  );
}
