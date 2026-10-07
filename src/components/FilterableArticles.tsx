"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cardImage } from "@/lib/images";

export interface ArticleListItem {
  slug: string;
  href: string;
  title: string;
  excerpt: string;
  tags: string[];
  date: string;
  minutes: number;
  /** Up to three hero card ids for the tile art. */
  hero: number[];
}
export interface ArticleSection {
  title: string;
  accent: string;
  tags: string[];
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// The /guides and /blog index list (RiftCompare's FilterableArticles): "Editor's
// picks" first, then topic clusters (matched by tag, the first section wins so
// nothing appears twice, the rest under "More"), with a search box and tag chips
// that switch to a flat filtered list. Only what the list shows and searches
// crosses into the client: never an article's body. Every card is a real link in
// the server HTML.
export function FilterableArticles({ articles, sections, featured, featuredLabel = "Editor's picks" }: { articles: ArticleListItem[]; sections: ArticleSection[]; featured: readonly string[]; featuredLabel?: string }) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of articles) for (const t of a.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [articles]);

  const needle = q.trim().toLowerCase();
  const filtering = needle !== "" || tag != null;
  const shown = useMemo(
    () => articles.filter((a) => (!tag || a.tags.includes(tag)) && (!needle || `${a.title} ${a.excerpt} ${a.tags.join(" ")}`.toLowerCase().includes(needle))),
    [articles, tag, needle],
  );
  const picks = featured.map((s) => articles.find((a) => a.slug === s)).filter((a): a is ArticleListItem => Boolean(a));
  // A pick is shown once, in "Editor's picks", not again in its topic cluster.
  const used = new Set<string>(picks.map((a) => a.slug));
  const grouped = sections
    .map((s) => {
      const items = articles.filter((a) => !used.has(a.slug) && a.tags.some((t) => s.tags.includes(t)));
      items.forEach((a) => used.add(a.slug));
      return { s, items };
    })
    .filter((g) => g.items.length);
  const rest = articles.filter((a) => !used.has(a.slug));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guides…" aria-label="Search articles" className="input min-h-11 w-full max-w-xs" />
        <div className="flex flex-wrap gap-1.5">
          {tags.slice(0, 8).map(([t, n]) => (
            <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)} className={`chip border px-2.5 py-1 text-xs font-semibold ${tag === t ? "border-brand-500 bg-brand-500/15 text-brand-300" : "border-ink-700 text-slate-400 hover:text-slate-200"}`}>
              {t} <span className="text-slate-600">· {n}</span>
            </button>
          ))}
        </div>
      </div>

      {filtering ? (
        <div className="mt-6">
          <p className="mb-3 text-sm text-slate-400">
            {shown.length} {shown.length === 1 ? "article" : "articles"}
            {shown.length === 0 ? " match" : ""}
          </p>
          <Grid items={shown} />
        </div>
      ) : (
        <>
          {picks.length ? (
            <section className="mt-6">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-400">{featuredLabel}</h2>
              <Grid items={picks} />
            </section>
          ) : null}
          {grouped.map(({ s, items }) => (
            <section key={s.title} className="mt-8">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
                <span className="h-2 w-2 rounded-full" style={{ background: s.accent }} aria-hidden />
                {s.title}
              </h2>
              <Grid items={items} />
            </section>
          ))}
          {rest.length ? (
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-bold text-white">More</h2>
              <Grid items={rest} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Grid({ items }: { items: ArticleListItem[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((a) => (
        <Link key={a.slug} href={a.href} className="card-surface group flex flex-col overflow-hidden hover:border-ink-600">
          <div className="grid h-36 grid-cols-3 gap-1 bg-ink-850 p-2">
            {a.hero.slice(0, 3).map((id) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={id} src={cardImage.tile(id)} alt="" loading="lazy" className="h-full w-full rounded object-cover object-top" />
            ))}
          </div>
          <div className="flex flex-1 flex-col p-4">
            <div className="flex flex-wrap gap-1.5">
              {a.tags.slice(0, 2).map((t) => (
                <span key={t} className="rounded bg-ink-800 px-1.5 py-0.5 text-[11px] text-slate-300">
                  {t}
                </span>
              ))}
            </div>
            <h3 className="mt-2 text-lg leading-snug text-white group-hover:text-brand-400">{a.title}</h3>
            <p className="mt-1 line-clamp-3 text-sm text-slate-400">{a.excerpt}</p>
            <p className="mt-auto pt-3 text-xs text-slate-500">
              {shortDate(a.date)} · {a.minutes} min read
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
