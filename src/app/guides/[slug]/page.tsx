import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ArticleView } from "@/components/blog/ArticleView";
import { postBySlug, postHref } from "@/lib/blog";
import { articleMetadata } from "@/lib/blog/metadata";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return articleMetadata(params.slug, "guide");
}

export default function GuidePage({ params }: Props) {
  const post = postBySlug(params.slug);
  if (!post) notFound();
  // Only guides are served here; a dated post belongs at /blog/[slug].
  if (post.category !== "guide") permanentRedirect(postHref(post));
  return <ArticleView post={post} section="guide" />;
}
