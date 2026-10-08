import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pagination } from "@/components/Pagination";
import { Breadcrumbs, JsonLd, SectionHeader } from "@/components/ui";
import { MAX_PAGE, getKeywordIndex, getKeywordPage } from "@/lib/data";
import { pageSuffix } from "@/lib/facets";
import { int } from "@/lib/format";
import { faqLd } from "@/lib/jsonld";
import { KEYWORD_BY_SLUG, isIndexableKeyword, keywordLabel } from "@/lib/keywords";
import { identityName } from "@/lib/constants";
import { pageOg } from "@/lib/og/meta";

// /keywords/[slug] — one keyword: what it does (a written definition when lib/keywords.ts has one) and every card whose Scryfall keyword list has it, most played first
// (EDHREC rank), 48 a page. A keyword on fewer than KEYWORD_INDEX_MIN cards is noindex and out of the sitemap (isIndexableKeyword), as is every page past the first.
export const dynamic = "force-dynamic";
type Props = { params: { slug: string }; searchParams: { page?: string } };
const PER = 48;
const pageNo = (v: string | undefined): number => Math.max(1, parseInt(v ?? "1", 10) || 1);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const page = pageNo(searchParams.page), r = await getKeywordPage(params.slug, 1, PER);
  if (!r.keyword) return { title: "Keyword not found", robots: { index: false, follow: false } };
  const k = KEYWORD_BY_SLUG.get(r.keyword.slug), path = `/keywords/${r.keyword.slug}${pageSuffix(searchParams.page)}`;
  return {
    title: `${r.keyword.label} in Magic: The Gathering — What It Does & Every Card`,
    description: `${k ? `${k.summary} ` : ""}Every Magic card with ${r.keyword.label}, ${int(r.total)} in all, with live prices.`,
    alternates: { canonical: path },
    openGraph: pageOg(path),
    robots: page === 1 && isIndexableKeyword(r.total) ? undefined : { index: false, follow: true },
  };
}

export default async function KeywordPage({ params, searchParams }: Props) {
  const page = pageNo(searchParams.page);
  const [r, index] = await Promise.all([getKeywordPage(params.slug, page, PER), getKeywordIndex()]);
  if (!r.keyword) notFound();
  const k = KEYWORD_BY_SLUG.get(r.keyword.slug), label = r.keyword.label, path = `/keywords/${r.keyword.slug}`;
  const pages = Math.min(Math.max(1, Math.ceil(r.total / PER)), MAX_PAGE);
  return (
    <div>
      {k ? <JsonLd data={faqLd([{ q: `What does ${k.name} do in Magic: The Gathering?`, a: [k.summary, ...k.body].join(" ") }])} /> : null}
      <Breadcrumbs trail={[{ href: "/keywords", name: "Keywords" }, { name: label }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">{label}</h1>
      {k ? (
        <>
          <p className="mt-3 max-w-3xl text-lg leading-relaxed text-slate-200">{k.summary}</p>
          <div className="mt-4 max-w-3xl space-y-3 text-[15px] leading-relaxed text-slate-300">
            {k.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
          {label} is a keyword Scryfall lists on {int(r.total)} Magic card{r.total === 1 ? "" : "s"}. Read the card&apos;s Oracle text for what it does.
        </p>
      )}
      <p className="mt-3 text-sm text-slate-400">Cards that give {label} to other permanents are listed too.</p>
      <section className="mt-8">
        <SectionHeader title={`${int(r.total)} cards with ${label}`} sub={`most played first${pages > 1 ? ` · page ${page} of ${pages}` : ""}`} />
        {r.items.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {r.items.map((o) => (
              <li key={o.no} className="card-surface p-3">
                <Link href={`/cards/name/${o.slug}`} className="font-semibold text-white hover:text-brand-400">
                  {o.name}
                </Link>
                <p className="mt-0.5 text-xs text-slate-400">
                  {o.typeLine} · {identityName(o.identity)} · {int(o.nPrint)} printing{o.nPrint === 1 ? "" : "s"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-400">No card in the catalogue has it yet.</p>
        )}
        <Pagination page={page} totalPages={pages} params={{}} basePath={path} />
      </section>
      <nav className="mt-10" aria-label="Other keywords">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Other keywords</h2>
        <ul className="flex flex-wrap gap-2">
          {index.filter((x) => x.slug !== r.keyword!.slug && KEYWORD_BY_SLUG.has(x.slug)).map((x) => (
            <li key={x.slug}>
              <Link href={`/keywords/${x.slug}`} className="chip border border-ink-700 bg-ink-850 text-slate-200 hover:border-ink-600">
                {keywordLabel(x.slug)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
