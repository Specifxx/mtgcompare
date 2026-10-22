import Link from "@/components/Link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Ago } from "@/components/Ago";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toc, TocDisclosure } from "@/content/guides/kit";
import { POST_BY_SLUG, POSTS, postMetaTitle, postPath } from "@/lib/blog";
import { loadPostData } from "@/lib/blog/data";
import { POST_MODULES } from "@/lib/blog/modules";
import { timeAgo } from "@/lib/format";
import { formatRelease } from "@/lib/release";
import { articleJsonLd, jsonLd, ogCardImage, pageMeta } from "@/lib/seo";

// /blog/<slug>: a post (src/lib/blog), region-less, its live blocks from every market's current listings. Never at build: a build
// reads no data. Rendered per request, never ISR.
export const dynamic = "force-dynamic";

type Params = { params: { slug: string } };

export function generateMetadata({ params }: Params): Metadata {
  const p = POST_BY_SLUG.get(params.slug);
  if (!p) return {};
  const meta = pageMeta({ title: p.title, description: p.description, path: postPath(p.slug) });
  return {
    ...meta,
    title: postMetaTitle(p.title),
    openGraph: { ...meta.openGraph, type: "article", publishedTime: p.published, modifiedTime: p.updated, images: [ogCardImage(`/og/blog/${p.slug}`, p.title)] },
  };
}

export default async function PostPage({ params }: Params) {
  const p = POST_BY_SLUG.get(params.slug);
  if (!p) notFound();
  const data = await loadPostData(p.slug);
  const o = POST_MODULES[p.slug].outline(data);
  const toc = o.sections.map(({ id, title }) => ({ id, title }));
  const more = POSTS.filter((x) => x.slug !== p.slug).slice(0, 3);
  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: "/", label: "MTG Compare" }, { href: "/blog", label: "Blog" }, { label: p.title }]} />
      <div className="lg:grid lg:grid-cols-[minmax(0,68ch)_14rem] lg:gap-x-12 xl:gap-x-20">
        <article className="min-w-0 max-w-[68ch]">
          <header>
            <div className="eyebrow">{p.kicker}</div>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{p.title}</h1>
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span className="font-medium text-ink">By MTG Compare</span>
              <span aria-hidden="true">·</span>
              <span>
                Updated <time dateTime={p.updated}>{formatRelease(p.updated)}</time>
              </span>
              {data.checked && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    prices checked <Ago iso={data.checked} initial={timeAgo(data.checked)} />
                  </span>
                </>
              )}
            </p>
          </header>
          <TocDisclosure sections={toc} />
          <div className="mt-8">{o.intro}</div>
          {o.sections.map((s) => (
            <section key={s.id} aria-labelledby={s.id} className="mt-12">
              <h2 id={s.id} className="mb-4 font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
                {s.title}
              </h2>
              {s.body}
            </section>
          ))}
        </article>
        <aside className="hidden lg:block">
          <div className="sticky top-[calc(var(--hdr)+2rem)] max-h-[calc(100vh-var(--hdr)-4rem)] overflow-y-auto pb-6 pt-1">
            <Toc sections={toc} />
          </div>
        </aside>
      </div>
      <section aria-labelledby="more" className="mt-16 border-t border-line pt-10">
        <h2 id="more" className="font-display text-xl font-bold tracking-tight">
          More from the blog
        </h2>
        <ul role="list" className="mt-4 grid gap-4 sm:grid-cols-3">
          {more.map((x) => (
            <li key={x.slug}>
              <Link href={postPath(x.slug)} prefetch={false} className="card block h-full p-5 hover:shadow-lift">
                <span className="eyebrow">{x.kicker}</span>
                <span className="mt-2 block font-display text-lg font-bold leading-snug">{x.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(articleJsonLd({ title: p.title, description: p.description, path: postPath(p.slug), published: p.published, updated: p.updated })) }}
      />
    </div>
  );
}
