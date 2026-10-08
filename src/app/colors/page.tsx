import { HubIntro } from "@/components/HubIntro";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, InShort } from "@/components/ui";
import { COLORS, COLOR_GROUPS, COLOR_KEYS } from "@/lib/constants";
import { colorPageQuery, getCardPage } from "@/lib/data";
import { int, money } from "@/lib/format";
import { pageOg } from "@/lib/og/meta";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Magic Card Colours — White, Blue, Black, Red, Green, Colorless & Multicolor",
  description: "Browse Magic: The Gathering cards by colour, each with its cards and live prices compared across stores.",
  alternates: { canonical: "/colors" },
  openGraph: pageOg("/colors"),
};

const PAGES = [
  ...COLOR_KEYS.map((k) => ({ slug: COLORS[k].slug, label: COLORS[k].label, hex: COLORS[k].hex, tagline: COLORS[k].tagline })),
  { slug: "colorless" as const, label: COLOR_GROUPS.colorless.label, hex: COLOR_GROUPS.colorless.hex, tagline: COLOR_GROUPS.colorless.tagline },
  { slug: "multicolor" as const, label: COLOR_GROUPS.multicolor.label, hex: COLOR_GROUPS.multicolor.hex, tagline: COLOR_GROUPS.multicolor.tagline },
];

export default async function ColorsPage() {
  const rows = await Promise.all(
    PAGES.map(async (p) => {
      const r = await getCardPage({ colors: colorPageQuery(p.slug as Parameters<typeof colorPageQuery>[0]), sort: "value", page: 1, per: 24 });
      return { p, total: r.total, top: r.items.find((c) => c.marketUsd != null) ?? null };
    }),
  );
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Colours" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Magic cards by colour</h1>
      <HubIntro path="/colors" />
      <div className="mt-6">
        <InShort>
          Each card is on one page only: a gold card sits under Multicolor, not under each of its colours, so the counts below add up to the listed cards that have a colour
          or none. Cards with no colour are Colorless.
        </InShort>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(({ p, total, top }) => (
          <Link key={p.slug} href={`/colors/${p.slug}`} className="card-surface group relative overflow-hidden p-5 hover:border-ink-600">
            <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: p.hex }} />
            <h2 className="text-2xl text-white group-hover:text-brand-400">{p.label}</h2>
            <p className="text-sm text-slate-400">{p.tagline}</p>
            <p className="num mt-3 text-sm text-slate-300">{int(total)} printings</p>
            {top ? (
              <p className="mt-1 truncate text-xs text-slate-500">
                Top card: {top.name} <span className="num text-accent">{money(top.marketUsd, "US")}</span>
              </p>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
