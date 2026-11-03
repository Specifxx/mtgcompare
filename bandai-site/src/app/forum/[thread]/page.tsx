// One forum thread (docs/forum.md). A thread with no replies is noindex. A
// thread newer than the page's cached copy is drawn by the browser (noindex).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ForumApp } from "@/components/forum/Forum";
import "@/components/forum/forum.css";
import { JsonLd } from "@/components/JsonLd";
import { findThread, idFromSegment, threadDescription, threadIndexable, threadJsonLd, threadPath } from "@/lib/forum/core";
import { FORUM_SITE } from "@/lib/forum/site";
import { readForum } from "@/lib/forum/store";
import { canon, SITE_URL } from "@/lib/site";
import { SITE } from "@/site.config";

export const revalidate = 21600;
// Drawn on first visit, never at build.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: { thread: string } }): Promise<Metadata> {
  const id = idFromSegment(params.thread);
  const t = id ? findThread(await readForum(FORUM_SITE, revalidate), id) : null;
  if (!t) return { title: `${SITE.gameShort} forum`, robots: { index: false, follow: true } };
  return {
    title: `${t.title} | ${SITE.gameShort} forum`,
    description: threadDescription(t),
    ...canon(threadPath(FORUM_SITE, t)),
    ...(threadIndexable(t) ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function ThreadPage({ params }: { params: { thread: string } }) {
  const id = idFromSegment(params.thread);
  if (!id) notFound();
  const forum = await readForum(FORUM_SITE, revalidate);
  const t = findThread(forum, id);
  return (
    <>
      {t && threadIndexable(t) && <JsonLd data={threadJsonLd(SITE_URL, FORUM_SITE, t)} />}
      <ForumApp site={FORUM_SITE} initial={forum} threadId={id} now={Date.now()} />
    </>
  );
}
