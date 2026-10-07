import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardLinkGrid } from "@/components/CardLinkGrid";
import { Pagination } from "@/components/Pagination";
import { Breadcrumbs, JsonLd, SectionHeader } from "@/components/ui";
import { COUNTRIES } from "@/lib/country";
import { getCardTextByNumber, getCatalog, type CardLite } from "@/lib/data";
import { basePrinting } from "@/lib/deck";
import { pageSuffix, paginate } from "@/lib/facets";
import { int } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { faqLd } from "@/lib/jsonld";
import { KEYWORD_BY_SLUG, KEYWORDS } from "@/lib/keywords";
import { pageOg } from "@/lib/og/meta";

// /keywords/[slug] — one keyword: what it does and every card whose printed
// text has it (lib/keywords.ts reads Card.effect through the cached
// getCardText index). One tile per card number, its base printing.
type Props = { params: { slug: string }; searchParams: { page?: string } };
const PER = 48;

export function generateMetadata({ params, searchParams }: Props): Metadata {
  const k = KEYWORD_BY_SLUG.get(params.slug);
  if (!k) return { title: "Keyword not found" };
  return {
    title: `[${k.name}] in the One Piece Card Game — What It Does & Every Card`,
    description: `${k.summary} Every One Piece card whose text has [${k.name}], with live prices.`,
    alternates: { canonical: `/keywords/${k.slug}${pageSuffix(searchParams.page)}` },
    openGraph: pageOg(`/keywords/${k.slug}${pageSuffix(searchParams.page)}`),
  };
}

export default async function KeywordPage({ params, searchParams }: Props) {
  const k = KEYWORD_BY_SLUG.get(params.slug);
  if (!k) notFound();
  const country = getCountry();
  const [cat, text] = await Promise.all([getCatalog(), getCardTextByNumber()]);
  const byNumber = new Map<string, CardLite[]>();
  for (const c of cat.cards) if (c.number && c.printing !== "don" && text.get(c.number)?.keywords.includes(k.slug)) (byNumber.get(c.number) ?? byNumber.set(c.number, []).get(c.number)!).push(c);
  const cards = [...byNumber.values()]
    .map((ps) => basePrinting(ps)!)
    .sort((a, b) => (b.marketUsd ?? -1) - (a.marketUsd ?? -1) || a.id - b.id);
  const { page, pages, slice } = paginate(cards, searchParams.page, PER);
  const types = new Map<string, number>();
  for (const c of cards) if (c.cardType) types.set(c.cardType, (types.get(c.cardType) ?? 0) + 1);
  const path = `/keywords/${k.slug}`;
  return (
    <div>
      <JsonLd data={faqLd([{ q: `What does [${k.name}] do in the One Piece Card Game?`, a: [k.summary, ...k.body].join(" ") }])} />
      <Breadcrumbs trail={[{ href: "/keywords", name: "Keywords" }, { name: k.name }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">[{k.name}]</h1>
      <p className="mt-3 max-w-3xl text-lg leading-relaxed text-slate-200">{k.summary}</p>
      <div className="mt-4 max-w-3xl space-y-3 text-[15px] leading-relaxed text-slate-300">
        {k.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <p className="text-sm text-slate-400">
          A summary of Bandai&apos;s Comprehensive Rules, not a ruling on any one card. Cards that gain [{k.name}] from an effect are listed too.
        </p>
      </div>
      <section className="mt-8">
        <SectionHeader
          title={`${int(cards.length)} cards with [${k.name}]`}
          sub={`${[...types.entries()].map(([t, n]) => `${n} ${t}${n === 1 ? "" : "s"}`).join(" · ")} · most valuable first, cheapest listing in ${COUNTRIES[country].place}${pages > 1 ? ` · page ${page} of ${pages}` : ""}`}
        />
        {slice.length ? <CardLinkGrid cards={slice} cat={cat} country={country} /> : <p className="text-slate-400">No card in the catalogue has it yet.</p>}
        <Pagination page={page} totalPages={pages} params={{}} basePath={path} />
      </section>
      <nav className="mt-10" aria-label="Other keywords">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Other keywords</h2>
        <ul className="flex flex-wrap gap-2">
          {KEYWORDS.filter((x) => x.slug !== k.slug).map((x) => (
            <li key={x.slug}>
              <Link href={`/keywords/${x.slug}`} className="chip border border-ink-700 bg-ink-850 text-slate-200 hover:border-ink-600">
                {x.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
