import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CardSearch } from "@/components/CardSearch";
import { POSTS, postHref } from "@/lib/blog";
import { postTitle } from "@/lib/seo";

// RiftCompare's 404: the number, the heading, the hero search, the way-back buttons and a few guides. It reads NO data
// (2026-10-19, DECISIONS.md "One card page for every market"): Next 14 renders the root not-found tree into the RSC payload of
// EVERY page under the root layout, so its popular-cards and set sections cost two plane reads and ~7.7 KB on every card page
// a crawler fetched, for a block nobody saw. The search and the buttons are the way back.
export const metadata: Metadata = {
  title: { absolute: "Page not found — MTG Compare" },
  description: "We couldn't find that page. Search the Magic: The Gathering database for live prices across stores in six markets.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  const guides = [...POSTS].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  return (
    <div className="mx-auto max-w-3xl py-10">
      <div className="text-center">
        <p className="num text-6xl font-extrabold text-brand-400">404</p>
        <h1 className="mt-3 text-2xl font-extrabold text-white">This page doesn&apos;t exist</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
          The card or page you were after may have moved, or may never have existed. Search the database below — every Magic card is
          in there, with live prices from stores in six markets.
        </p>
      </div>
      <div className="mx-auto mt-6 max-w-xl">
        <Suspense fallback={<div className="input h-12" />}>
          <CardSearch size="lg" placeholder="Search any Magic card…" />
        </Suspense>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/browse" className="btn-primary">
          Card database
        </Link>
        <Link href="/movers" className="btn-ghost">
          This week&apos;s price movers
        </Link>
        <Link href="/sealed" className="btn-ghost">
          Sealed products
        </Link>
        <Link href="/sets" className="btn-ghost">
          Browse by set
        </Link>
        <Link href="/blog" className="btn-ghost">
          Guides &amp; news
        </Link>
      </div>
      {guides.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Or start with a guide</h2>
          <ul className="space-y-2">
            {guides.map((g) => (
              <li key={g.slug}>
                <Link href={postHref(g)} className="text-sm font-semibold text-brand-400 hover:underline">
                  {postTitle(g, null)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
