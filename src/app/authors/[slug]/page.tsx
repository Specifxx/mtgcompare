import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StaticPage } from "@/components/StaticPage";
import { AUTHORS, POSTS, postHref } from "@/lib/blog";
import { postContext } from "@/lib/blog/context";
import { shortDate } from "@/lib/format";
import { pageOg } from "@/lib/og/meta";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { JsonLd } from "@/components/ui";

type Props = { params: { slug: string } };

// The authors are a file (lib/blog/index.ts AUTHORS), not a database table, so
// generating their pages at build is the one static-params case the egress rules
// allow: it reads no database.
export function generateStaticParams() {
  return AUTHORS.map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const a = AUTHORS.find((x) => x.slug === params.slug);
  if (!a) return { title: "Author not found" };
  return {
    title: `${a.name}: Author at ${SITE_NAME}`,
    description: `${a.name}, ${a.role}. Posts and guides written for ${SITE_NAME}, every figure drawn from its own price database.`,
    alternates: { canonical: `/authors/${a.slug}` },
    openGraph: pageOg(`/authors/${a.slug}`),
  };
}

export default async function AuthorPage({ params }: Props) {
  const a = AUTHORS.find((x) => x.slug === params.slug);
  if (!a) notFound();
  const ctx = await postContext(DEFAULT_COUNTRY);
  return (
    <StaticPage title={a.name} crumb="Authors">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "ProfilePage", mainEntity: { "@type": "Organization", name: a.name, url: `${SITE_URL}/authors/${a.slug}`, description: a.bio } }} />
      <p>
        <strong>{a.role}.</strong> {a.bio}
      </p>
      <p>
        How we choose topics and correct mistakes is in our <Link href="/editorial-policy">editorial policy</Link>; <Link href="/methodology">the methodology</Link> explains how prices are collected.
      </p>
      <h2>Posts and guides</h2>
      <ul>
        {POSTS.map((p) => (
          <li key={p.slug}>
            <Link href={postHref(p)}>{p.title(ctx)}</Link> <span className="text-slate-500">· {p.category === "guide" ? "Guide" : "Post"} · {shortDate(p.date)}</span>
          </li>
        ))}
      </ul>
    </StaticPage>
  );
}
