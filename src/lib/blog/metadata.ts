import type { Metadata } from "next";
import { getCatalog } from "../data";
import { pageOgOwnImage } from "../og/meta";
import { AUTHOR, postBySlug } from "./index";

/** generateMetadata for /blog/[slug] and /guides/[slug]: the same fields, the section's own canonical path. */
export async function articleMetadata(slug: string, section: "blog" | "guide"): Promise<Metadata> {
  const post = postBySlug(slug);
  if (!post) return { title: section === "guide" ? "Guide not found" : "Post not found" };
  const cat = await getCatalog();
  const title = post.title({ cat });
  const path = `/${section === "guide" ? "guides" : "blog"}/${post.slug}`;
  return {
    title: { absolute: title.length <= 60 ? title : title.replace(/:.*$/, "").slice(0, 60) },
    description: post.description,
    alternates: { canonical: path },
    openGraph: pageOgOwnImage(path, { type: "article", title, description: post.description, publishedTime: post.date, modifiedTime: cat.pricesAt, authors: [AUTHOR.name] }),
  };
}

