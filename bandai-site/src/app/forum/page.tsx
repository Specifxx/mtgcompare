// The beta forum (docs/forum.md). Threads are in the HTML from the page's cached
// copy of forum.json; the browser then fetches the newest copy from GitHub.
import type { Metadata } from "next";
import { ForumApp } from "@/components/forum/Forum";
import "@/components/forum/forum.css";
import { forumIndexable } from "@/lib/forum/core";
import { FORUM_SITE } from "@/lib/forum/site";
import { readForum } from "@/lib/forum/store";
import { canon } from "@/lib/site";
import { SITE } from "@/site.config";

export const revalidate = 21600;

export async function generateMetadata(): Promise<Metadata> {
  const forum = await readForum(FORUM_SITE, revalidate);
  return {
    title: `${SITE.gameShort} forum: prices, deals and collections`,
    description: `The ${SITE.name} community forum. Talk ${SITE.game} prices, deals and collections. No account needed.`,
    ...canon("/forum"),
    ...(forumIndexable(forum) ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function ForumPage() {
  const forum = await readForum(FORUM_SITE, revalidate);
  return <ForumApp site={FORUM_SITE} initial={forum} now={Date.now()} />;
}
