import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ArticleView } from "@/components/blog/ArticleView";
import { postBySlug, postHref } from "@/lib/blog";
import { articleMetadata } from "@/lib/blog/metadata";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return articleMetadata(params.slug, "blog");
}

export default async function PostPage({ params }: Props) {
  const post = postBySlug(params.slug);
  if (!post) notFound();
  // Evergreen guides live at /guides/[slug]; the old URL keeps working.
  if (post.category === "guide") permanentRedirect(postHref(post));
  return <ArticleView post={post} section="blog" />;
}
