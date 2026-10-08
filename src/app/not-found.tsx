import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CardSearch } from "@/components/CardSearch";
import { CardTile } from "@/components/CardTile";
import { tileOfHome } from "@/components/home/home-data";
import { POSTS } from "@/lib/blog";
import { getHomeBoard, getSets } from "@/lib/data";
import { postTitle } from "@/lib/seo";
import { releasedSets } from "@/lib/selectors";

// RiftCompare's 404: the number, the heading, the hero search, the way-back
// buttons, then cards people are looking at, the sets and a few guides — all
// from the published-file loaders of src/lib/data (the egress rule; RiftCompare
// queries Prisma here). Any loader error simply drops its section.
export const metadata: Metadata = {
  title: { absolute: "Page not found — MTG Compare" },
  description: "We couldn't find that page. Search the Magic: The Gathering database for live prices across stores in six markets.",
  robots: { index: false, follow: false },
};

export default async function NotFound() {
  const [board, allSets] = await Promise.all([getHomeBoard().catch(() => null), getSets().catch(() => [])]);
  const popular = (board?.popular ?? []).slice(0, 6).map(tileOfHome);
  const sets = releasedSets(allSets).slice(0, 12);
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
        <Link href="/blog" className="btn-ghost">
          Guides &amp; news
        </Link>
      </div>
      {popular.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Cards Commander players love</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {popular.map((t) => (
              <CardTile key={t.card.id} card={t.card} setCode={t.setCode} />
            ))}
          </div>
        </section>
      )}
      {sets.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Browse by set</h2>
          <div className="flex flex-wrap gap-2">
            {sets.map((s) => (
              <Link key={s.slug} href={`/sets/${s.slug}`} className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500">
                {s.name}
              </Link>
            ))}
          </div>
        </section>
      )}
      {guides.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Or start with a guide</h2>
          <ul className="space-y-2">
            {guides.map((g) => (
              <li key={g.slug}>
                <Link href={`/blog/${g.slug}`} className="text-sm font-semibold text-brand-400 hover:underline">
                  {postTitle(g, board?.at)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
