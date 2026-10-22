import Link from "@/components/Link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { POSTS, postPath } from "@/lib/blog";
import { formatRelease } from "@/lib/release";
import { jsonLd, pageMeta } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

// /blog: the posts as cards, from the registry alone (no data read). Region-less, one canonical URL.
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMeta({
  title: "Blog: Magic sealed prices and new releases",
  description: "Posts on Magic: The Gathering sealed product: new releases, booster box prices across seven markets and where to buy, built from today's store listings.",
  path: "/blog",
});

export default function BlogIndex() {
  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "MTG Compare blog",
    itemListElement: POSTS.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.title, url: `${SITE_URL}${postPath(p.slug)}` })),
  };
  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: "/", label: "MTG Compare" }, { label: "Blog" }]} />
      <header className="max-w-3xl">
        <div className="eyebrow">Blog</div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">The MTG Compare blog</h1>
        <p className="mt-3 text-lg leading-8 text-muted">New Magic releases and sealed prices across the seven markets we compare, built from today’s listings at real stores.</p>
      </header>
      <ul role="list" className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {POSTS.map((p) => (
          <li key={p.slug}>
            <Link href={postPath(p.slug)} prefetch={false} className="card group flex h-full flex-col p-5 transition-shadow hover:shadow-lift sm:p-6">
              <span className="eyebrow">{p.kicker}</span>
              <h2 className="mt-2 font-display text-xl font-bold leading-snug tracking-tight group-hover:text-brand">{p.title}</h2>
              <p className="mt-2 flex-1 text-[15px] leading-6 text-muted">{p.description}</p>
              <span className="mt-4 text-xs text-muted">
                Updated <time dateTime={p.updated}>{formatRelease(p.updated)}</time>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
    </div>
  );
}
