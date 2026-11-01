// The beta forum (docs/forum.md). Force-dynamic and held by the CDN like the data
// pages (next.config.js CDN_PAGES); the browser then fetches the newest posts from
// GitHub itself, so the CDN copy only has to carry the HTML for search engines.
import type { Metadata } from "next";
import { ForumApp } from "@/components/forum/Forum";
import "@/components/forum/forum.css";
import { forumIndexable } from "@/lib/forum/core";
import { FORUM_SITE } from "@/lib/forum/site";
import { readForum } from "@/lib/forum/store";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const forum = await readForum(FORUM_SITE, 0);
  return {
    title: "Community forum: prices, deals and collections",
    description: `The ${FORUM_SITE.siteName} community forum. Talk ${FORUM_SITE.topic} prices, deals and collections. No account needed.`,
    alternates: { canonical: "/forum" },
    ...(forumIndexable(forum) ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function Page() {
  const forum = await readForum(FORUM_SITE, 0);
  return (
    <div className="page py-6">
      <ForumApp site={FORUM_SITE} initial={forum} now={Date.now()} />
    </div>
  );
}
