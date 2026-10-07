import type { Metadata } from "next";
import Link from "next/link";
import CardQuickLink from "@/components/CardQuickLink";
import { notFound } from "next/navigation";
import { CardTile } from "@/components/CardTile";
import { Pagination } from "@/components/Pagination";
import { Breadcrumbs, SectionHeader } from "@/components/ui";
import { COLORS, COLOR_KEYS, type ColorKey } from "@/lib/constants";
import { COUNTRIES } from "@/lib/country";
import { getCatalog } from "@/lib/data";
import { int } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { pageOg } from "@/lib/og/meta";

type Props = { params: { color: string }; searchParams: { page?: string } };
const keyOf = (slug: string): ColorKey | undefined =>
  COLOR_KEYS.find((k) => COLORS[k].slug === slug.toLowerCase());
const PER = 48;

export function generateMetadata({ params }: Props): Metadata {
  const k = keyOf(params.color);
  if (!k) return { title: "Colour not found" };
  return {
    title: `${k} One Piece Cards — Prices for Every ${k} Card`,
    description: `Every ${k} One Piece Card Game card with live prices compared across stores — Leaders, Characters, Events and Stages.`,
    alternates: { canonical: `/colors/${COLORS[k].slug}` },
    openGraph: pageOg(`/colors/${COLORS[k].slug}`),
  };
}

export default async function ColorPage({ params, searchParams }: Props) {
  const k = keyOf(params.color);
  if (!k) notFound();
  const country = getCountry();
  const cat = await getCatalog();
  const cards = cat.cards
    .filter((x) => x.colors.includes(k))
    .sort((a, b) => (b.marketUsd ?? -1) - (a.marketUsd ?? -1));
  const leaders = cards.filter(
    (x) => x.cardType === "Leader" && x.printing === "standard",
  );
  const pages = Math.max(1, Math.ceil(cards.length / PER));
  const page = Math.min(
    Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1),
    pages,
  );
  return (
    <div>
      <Breadcrumbs
        trail={[{ href: "/colors", name: "Colours" }, { name: k }]}
      />
      <div className="flex items-center gap-3">
        <span
          className="h-8 w-2 rounded-full"
          style={{ background: COLORS[k].hex }}
        />
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">{k} One Piece cards</h1>
      </div>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        {int(cards.length)} {k.toLowerCase()} printings, most valuable first —{" "}
        {COLORS[k].tagline.toLowerCase()} is the colour&apos;s usual identity.
        Prices are the cheapest in-stock listing in {COUNTRIES[country].place}.
        Narrow it by set, rarity or printing in the{" "}
        <Link href={`/browse?color=${COLORS[k].slug}`} className="text-brand-400 hover:underline">
          card database
        </Link>
        .
      </p>
      {leaders.length ? (
        <p className="mt-3 text-sm text-slate-400">
          {k} Leaders:{" "}
          {leaders.slice(0, 12).map((l, i) => (
            <span key={l.id}>
              {i ? ", " : ""}
              <CardQuickLink slug={l.slug} className="text-brand-400 hover:underline">
                {l.name}
              </CardQuickLink>
            </span>
          ))}
          {leaders.length > 12 ? ` and ${leaders.length - 12} more` : ""}.
        </p>
      ) : null}
      <section className="mt-8">
        <SectionHeader
          title={`Every ${k.toLowerCase()} card`}
          sub={`page ${page} of ${pages}`}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {cards.slice((page - 1) * PER, page * PER).map((c) => (
            <CardTile
              key={c.id}
              card={c}
              setCode={cat.setById.get(c.setId)?.code ?? ""}
              country={country}
            />
          ))}
        </div>
        <Pagination page={page} totalPages={pages} params={{}} basePath={`/colors/${COLORS[k].slug}`} />
      </section>
    </div>
  );
}
