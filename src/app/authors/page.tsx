import type { Metadata } from "next";
import Link from "next/link";
import { StaticPage } from "@/components/StaticPage";
import { AUTHOR, AUTHORS, POSTS, postHref } from "@/lib/blog";
import { SISTER_SITE } from "@/lib/site";
import { pageOg } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: "Who Writes OP Compare",
  description: "Who writes OP Compare's guides and market posts, and how.",
  alternates: { canonical: "/authors" },
  openGraph: pageOg("/authors"),
};

export default function Authors() {
  return (
    <StaticPage title="Who writes OP Compare" crumb="Authors">
      <h2>
        <Link href={`/authors/${AUTHORS[0].slug}`}>{AUTHOR.name}</Link>
      </h2>
      <p>
        Posts on the blog are bylined to the OP Compare team — the people who
        also run <a href={SISTER_SITE.url}>{SISTER_SITE.name}</a>, the{" "}
        {SISTER_SITE.game} price-comparison site OP Compare is built on.{" "}
        {AUTHOR.bio}
      </p>
      <p>
        Posts are drafted with AI assistance; every price, count and table in
        them is generated from our database when the page is built, never typed
        in by hand, so a figure in a post always matches the price pages. How we
        choose topics and correct mistakes is in our{" "}
        <Link href="/editorial-policy">editorial policy</Link>.
      </p>
      <h2>Posts</h2>
      <ul>
        {POSTS.map((p) => (
          <li key={p.slug}>
            <Link href={postHref(p)}>
              {p.description.split(":")[0].split("—")[0].trim()}
            </Link>
          </li>
        ))}
      </ul>
    </StaticPage>
  );
}
