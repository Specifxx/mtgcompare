import Link from "next/link";
import type { ReactNode } from "react";
import type { Country } from "@/lib/country";
import type { Catalog } from "@/lib/data";
import { POSTS } from "@/lib/blog";
import { MARKET_READS, startHereFor, type HomePick } from "@/lib/content/featured";
import { HomeUpdatedAgo } from "./HeroStats";

// RiftCompare's EditorialHub: one card-surface band of three columns — "Start
// here" (the buying guide for the market, then evergreen explainers), "Latest
// news" (the newest posts) and "Market updates" (movers, the Index and the
// market reads). Two rows per column on a phone. OP Compare's posts carry no
// hero image, so no column leads with one.
const NEWS_COUNT = 3;
const PHONE_ROWS = 2;

type Teaser = {
  href: string;
  title: string;
  line: string;
  date?: { iso: string; label?: string };
  readMins?: number;
};

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

export function EditorialHub({ cat, updatedAt, renderedAt, market }: { cat: Catalog; updatedAt: string | null; renderedAt: string; market?: Country }) {
  const bySlug = new Map(POSTS.map((p) => [p.slug, p]));
  const resolve = (picks: HomePick[], withDate: boolean): Teaser[] =>
    picks.flatMap((p) => {
      const post = bySlug.get(p.slug);
      if (!post) return [];
      return [
        {
          href: `/blog/${post.slug}`,
          title: post.title({ cat }),
          line: p.line,
          ...(withDate ? { date: { iso: post.date, label: "Updated" } } : { readMins: post.minutes }),
        },
      ];
    });

  const startHere = resolve(startHereFor(market), false);
  const news: Teaser[] = [...POSTS]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((p) => !startHere.some((t) => t.href === `/blog/${p.slug}`))
    .slice(0, NEWS_COUNT)
    .map((p) => ({ href: `/blog/${p.slug}`, title: p.title({ cat }), line: p.description, date: { iso: p.date } }));
  const reads = resolve([...MARKET_READS], true).filter((t) => !news.some((n) => n.href === t.href) && !startHere.some((s) => s.href === t.href));

  if (!startHere.length && !news.length) return null;

  return (
    <section aria-labelledby="editorial-hub-h" className="card-surface p-4 sm:p-5">
      <h2 id="editorial-hub-h" className="text-xl font-extrabold text-white">
        Guides, news &amp; market updates
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
        <Column title="Start here">
          <ul>
            {startHere.map((t, i) => (
              <TeaserRow key={t.href} t={t} phoneHidden={i >= PHONE_ROWS} />
            ))}
          </ul>
        </Column>
        <Column title="Latest news">
          <ul>
            {news.map((t, i) => (
              <TeaserRow key={t.href} t={t} phoneHidden={i >= PHONE_ROWS} />
            ))}
          </ul>
        </Column>
        <Column title="Market updates">
          {updatedAt && (
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              <span aria-hidden="true" className="text-up">●</span> Prices updated <HomeUpdatedAgo updatedAt={updatedAt} renderedAt={renderedAt} /> · store prices imported twice a day
            </p>
          )}
          <ul>
            <TeaserRow t={{ href: "/movers", title: "Price movers", line: "This week's biggest risers and drops in TCGplayer's market price." }} />
            <li>
              <RowLink href="/market" title="The OP Compare Index" line="One daily number for the value of the One Piece card market." />
            </li>
            {reads.map((t, i) => (
              <TeaserRow key={t.href} t={t} phoneHidden={i >= PHONE_ROWS - 1} />
            ))}
          </ul>
        </Column>
      </div>
      <p className="mt-4 border-t border-ink-800 pt-3 text-xs leading-relaxed text-slate-500">
        Posts are drafted with AI assistance and say only what the data supports; prices and figures come from our own price database (
        <Link href="/methodology" className="text-brand-300 underline-offset-2 hover:underline">how we collect them</Link>
        ), never from the draft.{" "}
        <Link href="/editorial-policy" className="text-brand-300 underline-offset-2 hover:underline">Editorial policy</Link>
        {" · "}
        <Link href="/guides" className="font-semibold text-brand-300 underline-offset-2 hover:underline">All guides →</Link>
        {" · "}
        <Link href="/blog" className="font-semibold text-brand-300 underline-offset-2 hover:underline">All posts →</Link>
      </p>
    </section>
  );
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </div>
  );
}

function TeaserRow({ t, phoneHidden = false }: { t: Teaser; phoneHidden?: boolean }) {
  const meta = t.date ? (
    <time dateTime={t.date.iso}>
      {t.date.label && <span className="hidden md:inline">{t.date.label} </span>}
      {shortDate(t.date.iso)}
    </time>
  ) : t.readMins ? (
    `${t.readMins} min read`
  ) : null;
  return (
    <li className={phoneHidden ? "hidden md:block" : undefined}>
      <RowLink href={t.href} title={t.title} line={t.line} meta={meta} />
    </li>
  );
}

function RowLink({ href, title, line, meta }: { href: string; title: string; line: string; meta?: ReactNode }) {
  return (
    <Link href={href} className="group flex min-h-11 min-w-0 flex-1 flex-col justify-center py-1.5">
      <span className="flex items-start justify-between gap-3 md:flex-col md:gap-0.5">
        <span className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug text-slate-100 group-hover:text-brand-300 md:line-clamp-3">{title}</span>
        {meta && <span className="shrink-0 pt-0.5 text-[11px] leading-4 text-slate-500 md:order-last md:pt-0">{meta}</span>}
        <span className="hidden text-xs leading-snug text-slate-400 md:line-clamp-2">{line}</span>
      </span>
    </Link>
  );
}
