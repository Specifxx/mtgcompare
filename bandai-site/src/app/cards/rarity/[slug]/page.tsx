import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { refCents } from "@/lib/data";
import { money } from "@/lib/format";
import { rarityHubs } from "@/lib/hubs";
import { ChipList } from "@/components/ChipList";
import { TileGrid } from "@/components/ProductTile";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const revalidate = 86400; // data only changes with a release (DECISIONS.md, "Vercel cost")
export const generateStaticParams = () => [];

const hub = (slug: string) => rarityHubs().find((h) => h.slug === slug) ?? null;

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const h = hub(params.slug);
  if (!h) return {};
  return {
    title: `${h.label} ${SITE.gameShort} card prices — most valuable first`,
    description: `All ${h.items.length} ${h.label} ${SITE.game} cards ranked by TCGplayer market price, with the cheapest store and eBay listing for each.`,
    ...canon(`/cards/rarity/${h.slug}`),
  };
}

export default function RarityHub({ params }: { params: { slug: string } }) {
  const h = hub(params.slug);
  if (!h) notFound();
  const priced = h.items.filter((p) => refCents(p.id) != null);
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ name: "Cards", href: "/cards" }, { name: h.label }]} />
      <header>
        <h1 className="font-display text-3xl font-black">{h.label} {SITE.gameShort} card prices</h1>
        <p className="mt-2 text-muted">{h.items.length} {h.label} cards{priced.length ? `, from ${money(refCents(priced[priced.length - 1].id))} to ${money(refCents(priced[0].id))}` : ""}. Open any card to compare every store.</p>
      </header>
      <TileGrid items={h.items.slice(0, 120)} />
      <section>
        <h2 className="mb-3 text-lg font-bold">Other rarities</h2>
        <ChipList items={rarityHubs().filter((x) => x.slug !== h.slug).map((x) => ({ key: x.slug, href: `/cards/rarity/${x.slug}`, label: x.label }))} more="rarities" />
      </section>
    </div>
  );
}
