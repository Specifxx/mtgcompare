import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardLinkGrid } from "@/components/CardLinkGrid";
import { KeywordText } from "@/components/KeywordTooltip";
import { Pagination } from "@/components/Pagination";
import { Breadcrumbs, InShort, SectionHeader } from "@/components/ui";
import { ORACLE_FLAGS, identityName } from "@/lib/constants";
import { COUNTRIES } from "@/lib/country";
import { getOracleBySlug, getOraclePrintings, isIndexableOracleHub } from "@/lib/data";
import { int, money } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { keywordLabel } from "@/lib/keywords";
import { pageOg } from "@/lib/og/meta";

// /cards/name/[oracleSlug] — the card hub: one rules object (Lightning Bolt, Sol Ring) and every printing of it, most valuable first, 48 a page (the largest hub, the basic
// lands, has 774). Indexable only when the oracle has at least two listed printings and one of them is not THIN (isIndexableOracleHub); a hub that fails the rule still renders,
// as noindex. Pages past the first are noindex too (follow stays on): the first page carries the hub. No generateStaticParams: rendered on demand.
export const dynamic = "force-dynamic";
type Props = { params: { oracleSlug: string }; searchParams: { page?: string } };
const PER = 48;
const pageNo = (v: string | undefined): number => Math.max(1, parseInt(v ?? "1", 10) || 1);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const o = await getOracleBySlug(params.oracleSlug);
  if (!o) return { title: "Card not found", robots: { index: false, follow: false } };
  const page = pageNo(searchParams.page), first = await getOraclePrintings(o.no, 1, PER);
  const path = `/cards/name/${o.slug}${page > 1 ? `?page=${page}` : ""}`, index = page === 1 && isIndexableOracleHub(first.total, first.items);
  return {
    title: `${o.name} — Every Printing & Price`,
    description: `${int(first.total)} printing${first.total === 1 ? "" : "s"} of ${o.name}, the ${o.typeLine.toLowerCase()}, with live prices compared across stores in six markets. Most valuable first.`,
    alternates: { canonical: path },
    openGraph: pageOg(path),
    robots: index ? undefined : { index: false, follow: true },
  };
}

export default async function OracleHub({ params, searchParams }: Props) {
  const o = await getOracleBySlug(params.oracleSlug);
  if (!o) notFound();
  const country = getCountry(), page = pageNo(searchParams.page);
  const { total, items } = await getOraclePrintings(o.no, page, PER);
  const pages = Math.max(1, Math.ceil(total / PER)), top = items.find((c) => c.marketUsd != null), path = `/cards/name/${o.slug}`;
  return (
    <div>
      <Breadcrumbs trail={[{ href: "/cards", name: "Cards" }, { href: "/cards/all", name: "A–Z" }, { name: o.name }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">{o.name}</h1>
      <p className="mt-2 text-slate-300">
        {o.typeLine}
        {o.manaCost ? <span className="num ml-2 text-slate-400">{o.manaCost}</span> : null}
        {o.pt ? <span className="num ml-2 text-slate-400">{o.pt}</span> : null}
      </p>
      {o.oracleText ? (
        <p className="mt-3 max-w-3xl whitespace-pre-line text-[15px] leading-relaxed text-slate-200">
          <KeywordText text={o.oracleText} />
        </p>
      ) : null}
      <p className="mt-3 text-sm text-slate-400">
        Colour identity {identityName(o.identity)}
        {o.keywords.length ? (
          <>
            {" · "}
            {o.keywords.map((k, i) => (
              <span key={k}>
                {i ? ", " : ""}
                <Link href={`/keywords/${k}`} className="text-brand-400 hover:underline">
                  {keywordLabel(k)}
                </Link>
              </span>
            ))}
          </>
        ) : null}
        {(o.flags & ORACLE_FLAGS.COMMANDER) !== 0 ? (
          <>
            {" · "}
            <Link href={`/commanders/${o.slug}`} className="text-brand-400 hover:underline">
              Commander page
            </Link>
          </>
        ) : null}
      </p>
      <div className="mt-6">
        <InShort>
          {total ? (
            <>
              {o.name} has {int(total)} listed printing{total === 1 ? "" : "s"}
              {top?.marketUsd != null ? <>; the most valuable is {top.label ? `the ${top.label} ` : "the "}printing from {top.setCode} at {money(top.marketUsd, "US")} on TCGplayer&apos;s market price</> : null}. Prices below are the cheapest
              in-stock listing in {COUNTRIES[country].place}.
            </>
          ) : (
            <>No printing of {o.name} is listed with a price yet.</>
          )}
        </InShort>
      </div>
      <section className="mt-8">
        <SectionHeader title={`Every ${o.name} printing`} sub={pages > 1 ? `page ${page} of ${pages}` : undefined} />
        {items.length ? <CardLinkGrid cards={items} country={country} /> : <p className="text-slate-400">No printings yet.</p>}
        <Pagination page={page} totalPages={pages} params={{}} basePath={path} />
      </section>
    </div>
  );
}
