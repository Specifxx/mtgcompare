import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardLinkGrid } from "@/components/CardLinkGrid";
import { Pagination } from "@/components/Pagination";
import { Breadcrumbs, SectionHeader } from "@/components/ui";
import { COLORS, COLOR_GROUPS, COLOR_KEYS, COLOR_PAGES, type ColorPage } from "@/lib/constants";
import { COUNTRIES } from "@/lib/country";
import { MAX_PAGE, colorPageQuery, getCardPage } from "@/lib/data";
import { int } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { pageOg } from "@/lib/og/meta";

// /colors/[color] — the five colours plus colorless and multicolor (COLOR_PAGES). A mono-colour page lists the printings of cards of exactly that colour, so a
// gold card sits on /colors/multicolor only and the seven counts add up; colorless is the cards with no colour (artifacts, lands, Eldrazi). Rows with no joined
// Scryfall card have no colour and are on none of them.
export const dynamic = "force-dynamic";
type Props = { params: { color: string }; searchParams: { page?: string } };
const isPage = (s: string): s is ColorPage => (COLOR_PAGES as readonly string[]).includes(s);
const infoOf = (p: ColorPage) => (p === "colorless" || p === "multicolor" ? { ...COLOR_GROUPS[p], name: COLOR_GROUPS[p].label } : (() => { const k = COLOR_KEYS.find((x) => COLORS[x].slug === p)!; return { label: COLORS[k].label, slug: p, hex: COLORS[k].hex, tagline: COLORS[k].tagline, name: COLORS[k].label }; })());
const PER = 48;

export function generateMetadata({ params, searchParams }: Props): Metadata {
  const slug = params.color.toLowerCase();
  if (!isPage(slug)) return { title: "Colour not found" };
  const i = infoOf(slug), path = `/colors/${slug}${Number(searchParams.page) > 1 ? `?page=${Math.floor(Number(searchParams.page))}` : ""}`;
  return {
    title: `${i.label} Magic: The Gathering Cards — Prices for Every ${i.label} Card`,
    description: `Every ${i.label.toLowerCase()} Magic: The Gathering card (${i.tagline.toLowerCase()}) with live prices compared across stores in six markets.`,
    alternates: { canonical: path },
    openGraph: pageOg(path),
  };
}

export default async function ColorRoute({ params, searchParams }: Props) {
  const slug = params.color.toLowerCase();
  if (!isPage(slug)) notFound();
  const i = infoOf(slug), country = getCountry();
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const result = await getCardPage({ colors: colorPageQuery(slug), sort: "value", page, per: PER });
  const pages = Math.min(result.pages, MAX_PAGE), path = `/colors/${slug}`;
  return (
    <div>
      <Breadcrumbs trail={[{ href: "/colors", name: "Colours" }, { name: i.label }]} />
      <div className="flex items-center gap-3">
        <span className="h-8 w-2 rounded-full" style={{ background: i.hex }} />
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">{i.label} Magic cards</h1>
      </div>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        {int(result.total)} {i.label.toLowerCase()} printings, most valuable first. {i.tagline} is the usual identity of {slug === "multicolor" ? "gold cards" : `${i.label.toLowerCase()} cards`}.
        Prices are the cheapest in-stock listing in {COUNTRIES[country].place}. Narrow it by set, rarity or treatment in the{" "}
        <Link href={`/browse?color=${slug}`} className="text-brand-400 hover:underline">
          card database
        </Link>
        .
      </p>
      <p className="mt-3 text-sm text-slate-400">
        Building around a legendary creature? Commanders are sorted by colour identity at{" "}
        <Link href="/commanders" className="text-brand-400 hover:underline">
          Commanders
        </Link>
        .
      </p>
      <section className="mt-8">
        <SectionHeader title={`Every ${i.label.toLowerCase()} card`} sub={pages > 1 ? `page ${result.page} of ${pages}` : undefined} />
        {result.items.length ? <CardLinkGrid cards={result.items} country={country} /> : <p className="text-slate-400">No cards yet.</p>}
        <Pagination page={result.page} totalPages={pages} params={{}} basePath={path} />
      </section>
    </div>
  );
}
