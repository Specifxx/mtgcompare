import type { Metadata } from "next";
import Link from "@/components/Link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { cheapestInStock, HEADLINE_TYPES } from "@/lib/data";
import { REGION_LIST } from "@/lib/regions";
import { pageMeta } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { embedSnippet, storeBadge } from "@/lib/embed";
import { attributionHtml, PRICE_API_PATH } from "@/lib/price-api";

// /widgets: the free widgets directory (DECISIONS.md, "Free price widgets", 2026-11-02), what outreach points at instead
// of asking for a link. Code only, never live iframes of our own widgets. Force-dynamic and kept a day by the CDN
// (next.config.js "/widgets/:path*") like every data page.
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMeta({
  title: "Free MTG Sealed Price Widgets for Your Site",
  description: "A live Magic booster box and sealed price badge for blogs, newsletters and community sites, and a badge for the stores we compare. One line of HTML, free, no signup.",
  path: "/widgets",
});

export default async function EmbedPage() {
  // A real box US stores have in stock, so an unedited snippet shows a working badge.
  const example = (await cheapestInStock("US", HEADLINE_TYPES, 1).catch(() => []))[0];
  const slug = example?.slug ?? "PRODUCT-SLUG";
  const snippet = embedSnippet(SITE_URL, SITE_NAME, "us", slug, example?.name ?? "PRODUCT NAME");
  const badge = storeBadge(SITE_URL, SITE_NAME, "Magic sealed");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
      <Breadcrumbs items={[{ href: "/", label: SITE_NAME }, { label: "Free widgets" }]} />
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold">Free MTG sealed price widgets</h1>
        <p className="text-muted">
          Put a live booster box or bundle price on any page with one line of HTML. It shows the cheapest in-stock store price in your readers&apos; region and
          updates itself every day. Free, no signup, no tracking. The widget is noindex, so it never competes with your own pages in search.
        </p>
      </header>
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-lg font-bold">Sealed price badge</h2>
        <p className="text-sm text-muted">
          For set reviews, &ldquo;should I buy&rdquo; posts and newsletters. <Link className="underline" href={`/widgets/p/${slug}?region=us`}>See it running →</Link>
        </p>
        <pre className="overflow-x-auto rounded bg-black/5 p-3 text-xs"><code>{snippet}</code></pre>
        <ul className="list-disc pl-5 text-sm text-muted">
          <li>Change <code>{slug}</code> (in both places) to the last part of any product&apos;s address on {SITE_NAME}, after <code>/p/</code>.</li>
          <li>Change <code>region=us</code> (in both places) for another region: {REGION_LIST.map((r) => r.region).join(", ")}.</li>
          <li>The plain link under the widget is optional; it is the part that tells search engines where the price comes from.</li>
        </ul>
      </section>
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-lg font-bold">For stores we compare</h2>
        <p className="text-sm text-muted">A plain-HTML badge telling customers your prices are compared openly. No script, no image, nothing to host.</p>
        <div dangerouslySetInnerHTML={{ __html: badge }} />
        <pre className="overflow-x-auto rounded bg-black/5 p-3 text-xs"><code>{badge}</code></pre>
      </section>
      <section className="card flex flex-col gap-3 p-4" id="price-data">
        <h2 className="text-lg font-bold">Free price data</h2>
        <p className="text-sm text-muted">
          Building a Discord bot, a collection tool, a spreadsheet or a blog? Every product&apos;s cheapest in-stock store price in each region is in one
          JSON file: <a className="underline" href={PRICE_API_PATH}>{SITE_URL}{PRICE_API_PATH}</a>. Free, no key, no signup, open to every origin, and
          refreshed with each daily release.
        </p>
        <ul className="list-disc pl-5 text-sm text-muted">
          <li>Each product has an <code>id</code>, a <code>name</code> and, per region, <code>cents</code> in that region&apos;s <code>currency</code> with a <code>url</code> to its comparison.</li>
          <li>Store prices only: never eBay, and never converted between currencies.</li>
          <li>Free for any use, including commercial. The one condition: a visible link back wherever the prices appear, for example:</li>
        </ul>
        <pre className="overflow-x-auto rounded bg-black/5 p-3 text-xs"><code>{attributionHtml()}</code></pre>
      </section>
    </div>
  );
}
