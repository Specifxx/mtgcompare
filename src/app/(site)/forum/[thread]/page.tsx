// One forum thread (docs/forum.md). A thread with no replies is noindex; one
// newer than this copy is drawn by the browser.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ForumApp } from "@/components/forum/Forum";
import "@/components/forum/forum.css";
import { findThread, idFromSegment, threadDescription, threadIndexable, threadJsonLd, threadPath } from "@/lib/forum/core";
import { FORUM_SITE } from "@/lib/forum/site";
import { readForum } from "@/lib/forum/store";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { thread: string } }): Promise<Metadata> {
  const id = idFromSegment(params.thread);
  const t = id ? findThread(await readForum(FORUM_SITE, 0), id) : null;
  if (!t) return { title: "Community forum", robots: { index: false, follow: true } };
  return {
    title: `${t.title} | ${FORUM_SITE.siteName} forum`,
    description: threadDescription(t),
    alternates: { canonical: threadPath(FORUM_SITE, t) },
    ...(threadIndexable(t) ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function Page({ params }: { params: { thread: string } }) {
  const id = idFromSegment(params.thread);
  if (!id) notFound();
  const forum = await readForum(FORUM_SITE, 0);
  const t = findThread(forum, id);
  return (
    <div className="page py-6">
      {t && threadIndexable(t) && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(threadJsonLd(SITE_URL, FORUM_SITE, t)).replace(/</g, "\\u003c") }} />}
      <ForumApp site={FORUM_SITE} initial={forum} threadId={id} now={Date.now()} />
    </div>
  );
}
