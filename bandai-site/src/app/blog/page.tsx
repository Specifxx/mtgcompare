import type { Metadata } from "next";
import Link from "@/components/Link";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { posts } from "@/lib/posts";

export const revalidate = 86400;
export const metadata: Metadata = {
  title: `${SITE.gameShort} guides and price analysis`,
  description: `Guides to buying ${SITE.game} cards: set price guides, most valuable cards, where to buy and pre-order advice.`,
  ...canon("/blog"),
};

export default function Blog() {
  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 font-display text-3xl font-black">{SITE.gameShort} guides</h1>
      <ul className="flex flex-col gap-4">
        {posts().map((p) => (
          <li key={p.slug} className="card-surface p-5">
            <Link href={`/blog/${p.slug}`} className="text-lg font-semibold hover:underline">{p.title}</Link>
            <p className="mt-1 text-sm text-muted">{p.description}</p>
            <p className="mt-2 text-xs text-muted">{p.updated ?? p.date}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
