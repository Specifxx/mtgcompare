import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CardQuickLink from "@/components/CardQuickLink";
import { CardArt } from "@/components/CardTile";
import { Breadcrumbs, InShort, JsonLd, SectionHeader, StatTile } from "@/components/ui";
import { affiliateUrl, outboundRel } from "@/lib/affiliate";
import { COUNTRIES, type Country } from "@/lib/country";
import { getCatalog, getSealedCatalog, getStoreListings, getStoreStats, type Catalog, type SealedLite, type StoreListing } from "@/lib/data";
import { int, money } from "@/lib/format";
import { pageOg } from "@/lib/og/meta";
import { STORE_BY_KEY, STORES, type StoreInfo } from "@/lib/stores";

// /stores/[slug] — one tracked store (RiftCompare's per-store pages): what it
// stocks in One Piece, how often it is the cheapest listing in its market, and
// its most valuable listings, each linking to the card and to the store's own
// page. Reads the cached store stats and listings; rendered on demand.
type Props = { params: { slug: string } };

const THIN = 10;

function storeOf(slug: string): StoreInfo | null {
  return STORE_BY_KEY[slug.toLowerCase()] ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = storeOf(params.slug);
  if (!s) return { title: "Store not found" };
  const stats = await getStoreStats().catch(() => null);
  const st = stats?.find((x) => x.source === `store:${s.key}` && x.market === s.country);
  const place = COUNTRIES[s.country];
  return {
    title: `${s.name} One Piece Cards — Prices & Stock (${place.label})`,
    description: `${s.name} (${place.label})${st ? `: ${int(st.inStock)} One Piece listings in stock, the cheapest in ${place.place} for ${int(st.cheapest)} of them` : ""}. Compare its prices with every other store OP Compare tracks.`,
    alternates: { canonical: `/stores/${s.key}` },
    openGraph: pageOg(`/stores/${s.key}`),
    // Thin or empty (nothing matched yet): not indexed, and not in the sitemap.
    ...(!st || st.inStock < THIN ? { robots: { index: false, follow: true } } : {}),
  };
}

function nameOf(id: number, cat: Catalog, sealed: Map<number, SealedLite>): { label: string; slug: string | null; sub: string; hasImage: boolean; kind: "card" | "sealed"; img: string | null } | null {
  const c = cat.byId.get(id);
  if (c) return { label: `${c.name}${c.variant ? ` (${c.variant})` : ""}`, slug: c.slug, sub: `${cat.setById.get(c.setId)?.code ?? ""}${c.number ? ` · ${c.number}` : ""}`, hasImage: c.hasImage, kind: "card", img: null };
  const s = sealed.get(id);
  if (s) return { label: s.name, slug: s.slug, sub: s.kind, hasImage: Boolean(s.imageUrl), kind: "sealed", img: s.imageUrl };
  return null;
}

export default async function StorePage({ params }: Props) {
  const s = storeOf(params.slug);
  if (!s) notFound();
  const source = `store:${s.key}`;
  const country: Country = s.country;
  const place = COUNTRIES[country];
  const [stats, listings, cat, sealedList] = await Promise.all([getStoreStats(), getStoreListings(source, country), getCatalog(), getSealedCatalog()]);
  const sealed = new Map(sealedList.map((x) => [x.id, x]));
  const st = stats.find((x) => x.source === source && x.market === country);
  const peers = stats.filter((x) => x.market === country && x.inStock > 0).sort((a, b) => b.cheapest - a.cheapest);
  const rank = st ? peers.findIndex((x) => x.source === source) + 1 : 0;
  const page = `/stores/${s.key}`;
  const out = (url: string) => affiliateUrl(url, s.key, page);
  const share = st && st.inStock ? Math.round((st.cheapest / st.inStock) * 100) : 0;

  const Row = ({ l }: { l: StoreListing }) => {
    const n = nameOf(l[0], cat, sealed);
    if (!n) return null;
    return (
      <li className="flex items-center gap-3 py-2">
        {n.kind === "card" && n.slug ? (
          <CardQuickLink slug={n.slug} className="w-10 shrink-0">
            <CardArt id={l[0]} hasImage={n.hasImage} alt="" size="thumb" />
          </CardQuickLink>
        ) : (
          <span className="block w-10 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          {n.kind === "card" && n.slug ? (
            <CardQuickLink slug={n.slug} className="block truncate font-semibold text-white hover:text-brand-400">
              {n.label}
            </CardQuickLink>
          ) : (
            <Link href={`/sealed/${n.slug}`} className="block truncate font-semibold text-white hover:text-brand-400">
              {n.label}
            </Link>
          )}
          <p className="text-xs text-slate-400">
            {n.sub}
            {l[2] && l[2] !== "NM" ? ` · ${l[2]}` : ""}
          </p>
        </div>
        <a href={out(l[3])} target="_blank" rel={outboundRel()} data-retailer={s.key} data-page="stores" className="num shrink-0 font-semibold text-white hover:text-brand-400">
          {money(l[1], country)} →
        </a>
      </li>
    );
  };

  return (
    <div>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Store", name: s.name, url: s.base, areaServed: place.label }} />
      <Breadcrumbs trail={[{ href: "/stores", name: "Stores we track" }, { name: s.name }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">{s.name}</h1>
      <p className="mt-2 text-sm text-slate-400">
        {place.label} · prices in {s.currency ?? place.currency} ·{" "}
        <a href={out(s.base)} target="_blank" rel={outboundRel()} data-retailer={s.key} data-page="stores" className="text-brand-400 hover:underline">
          {s.base.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="In stock" value={st ? int(st.inStock) : "—"} sub={st ? `${int(st.offers)} listings matched` : "nothing matched yet"} />
        <StatTile label="Singles" value={st ? int(st.singlesInStock) : "—"} tone="text-white" />
        <StatTile label="Sealed" value={st ? int(st.sealedInStock) : "—"} tone="text-white" />
        <StatTile label={`Cheapest in ${place.code}`} value={st ? int(st.cheapest) : "—"} sub={st && st.inStock ? `${share}% of its stock${rank ? ` · #${rank} of ${peers.length} stores` : ""}` : undefined} />
      </div>
      <div className="mt-6">
        <InShort>
          OP Compare reads {s.name}&apos;s public One Piece listings twice a day and matches each one to the exact printing it is. A listing counts as the
          cheapest when no other store we track in {place.place}
          {country === "US" ? ", TCGplayer included," : ""} has it for less today. Prices are the store&apos;s own; postage is charged at checkout.
        </InShort>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="card-surface p-5">
          <SectionHeader title={`Where ${s.name} is cheapest`} sub={`its most valuable cards that no other store in ${place.place} beats`} />
          {listings.cheapestHere.length ? (
            <ul className="divide-y divide-ink-800">
              {listings.cheapestHere.map((l) => (
                <Row key={l[0]} l={l} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">It is not the cheapest store for any priced card today.</p>
          )}
        </section>
        <section className="card-surface p-5">
          <SectionHeader title="Its most valuable listings" sub="in stock today, highest price first" />
          {listings.top.length ? (
            <ul className="divide-y divide-ink-800">
              {listings.top.map((l) => (
                <Row key={l[0]} l={l} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">Nothing in stock today.</p>
          )}
        </section>
      </div>
      <nav className="mt-10" aria-label={`Other stores in ${place.label}`}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Other stores in {place.label}</h2>
        <ul className="flex flex-wrap gap-2">
          {STORES.filter((x) => x.country === country && x.key !== s.key).map((x) => (
            <li key={x.key}>
              <Link href={`/stores/${x.key}`} className="chip border border-ink-700 bg-ink-850 text-slate-200 hover:border-ink-600">
                {x.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
