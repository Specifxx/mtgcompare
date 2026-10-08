import type { Metadata } from "next";
import Link from "next/link";
import CardQuickLink from "@/components/CardQuickLink";
import { Breadcrumbs, Faq, InShort, JsonLd, SectionHeader } from "@/components/ui";
import { COLORS, COLOR_GROUPS, COLOR_KEYS, MAIN_SET_KINDS } from "@/lib/constants";
import { COUNTRY_LIST } from "@/lib/country";
import { getCardPage, getCatalogStats, getFacetCounts, getSets, isIndexableTreatment } from "@/lib/data";
import { RARITY_FACETS, TREATMENT_FACETS, TYPE_FACETS } from "@/lib/facets";
import { int, money } from "@/lib/format";
import { faqLd } from "@/lib/jsonld";
import { pageOg } from "@/lib/og/meta";
import { STORES } from "@/lib/stores";

// /singles — the "Magic singles" search intent (RiftCompare's /singles): market-neutral, linked into every way of finding a card, with real counts
// from the catalogue loaders (no card list is read here).
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Buy Magic: The Gathering Singles — Compare Prices in Six Markets",
  description:
    "The cheapest place to buy Magic: The Gathering singles: live prices from stores in the US, Australia, the UK, Singapore, Canada and the EU, plus TCGplayer, refreshed twice a day.",
  alternates: { canonical: "/singles" },
  openGraph: pageOg("/singles"),
};

const FAQS = [
  {
    q: "What are Magic singles?",
    a: "Single cards from Magic: The Gathering, bought one at a time instead of in booster packs or boxes. Singles get you exactly the cards a deck needs, in the printing you want, without opening packs.",
  },
  {
    q: "Where can I buy Magic singles?",
    a: "MTG Compare reads the Magic listings of stores in six markets and matches each one to its exact printing. Open any card to see every store's price, cheapest first, and go straight to the store you choose.",
  },
  {
    q: "How do I price a whole deck of singles?",
    a: "Paste the decklist into the deck price calculator: every card is matched and priced at the cheapest in-stock store in your market, with a total and the store for each card.",
  },
  {
    q: "Why does the same card have several prices?",
    a: "One card can have many printings: a standard print, a borderless or showcase version, a foil etching, reprints in other sets. Each is a different single with its own price, and MTG Compare prices each printing and each finish separately.",
  },
];

export default async function SinglesPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [stats, counts, sets, top] = await Promise.all([getCatalogStats(), getFacetCounts(), getSets(), getCardPage({ sort: "value", page: 1, per: 24 })]);
  const topNow = top.items.filter((c) => c.marketUsd != null).slice(0, 8);
  const newest = sets.filter((s) => (MAIN_SET_KINDS as readonly string[]).includes(s.kind) && s.releasedOn != null && s.releasedOn <= today).sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? "")).slice(0, 8);
  return (
    <div>
      <JsonLd data={faqLd(FAQS)} />
      <Breadcrumbs trail={[{ name: "Singles" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-4xl">Magic singles, compared</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        {int(stats.cards)} Magic: The Gathering printings, each priced at the cheapest in-stock listing among {int(STORES.length)} stores in six
        markets, plus TCGplayer in the US. Find a card by name in the{" "}
        <Link href="/browse" className="text-brand-400 hover:underline">
          card database
        </Link>
        , or start from a set, a colour, a rarity or a treatment below.
      </p>
      <div className="mt-6">
        <InShort>
          Building a deck? Paste the list into the{" "}
          <Link href="/deck" className="text-brand-400 hover:underline">
            deck price calculator
          </Link>{" "}
          and every card is priced at once.
        </InShort>
      </div>

      <section className="mt-8">
        <SectionHeader title="Priced, by market" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {COUNTRY_LIST.map((c) => (
            <div key={c.code} className="card-surface p-4">
              <p className="text-sm font-semibold text-white">{c.label}</p>
              <p className="num mt-1 text-xl font-bold text-accent">{int(stats.pricedByMarket[c.code])}</p>
              <p className="text-xs text-slate-400">printings priced · {STORES.filter((s) => s.country === c.code).length + (c.code === "US" ? 1 : 0)} sources</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <SectionHeader title="The most valuable singles" action={<Link href="/price-guide" className="text-brand-400 hover:underline text-sm">Full price guide →</Link>} />
        <ol className="grid gap-2 sm:grid-cols-2">
          {topNow.map((c, i) => (
            <li key={c.id} className="card-surface flex items-center justify-between gap-3 p-3">
              <span className="min-w-0 truncate">
                <span className="num mr-2 text-slate-500">{i + 1}</span>
                <CardQuickLink slug={c.slug} className="font-semibold text-white hover:text-brand-400">
                  {c.name}
                  {c.label ? ` (${c.label})` : ""}
                </CardQuickLink>{" "}
                <span className="text-xs text-slate-400">{c.setCode} {c.number}</span>
              </span>
              <span className="num shrink-0 text-sm font-semibold text-slate-200">{money(c.marketUsd, "US")}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <LinkBlock title="Newest sets" links={[...newest.map((x) => ({ href: `/sets/${x.slug}`, label: `${x.code} ${x.name}` })), { href: "/sets", label: "Every set →" }]} />
        <LinkBlock title="By colour" links={[...COLOR_KEYS.map((k) => ({ href: `/colors/${COLORS[k].slug}`, label: COLORS[k].label })), { href: `/colors/${COLOR_GROUPS.colorless.slug}`, label: COLOR_GROUPS.colorless.label }, { href: `/colors/${COLOR_GROUPS.multicolor.slug}`, label: COLOR_GROUPS.multicolor.label }, { href: "/commanders", label: "Commanders →" }]} />
        <LinkBlock title="By treatment" links={TREATMENT_FACETS.filter((f) => isIndexableTreatment(counts.treat[f.key] ?? 0)).map((f) => ({ href: `/cards/treatment/${f.slug}`, label: f.label }))} />
        <LinkBlock title="By rarity and type" links={[...RARITY_FACETS.map((f) => ({ href: `/cards/rarity/${f.slug}`, label: f.label })), ...TYPE_FACETS.map((f) => ({ href: `/cards/type/${f.slug}`, label: f.label }))]} />
      </div>

      <section className="mt-10 max-w-3xl">
        <h2 className="mb-3 text-2xl text-white">Questions</h2>
        <Faq items={FAQS} />
      </section>
    </div>
  );
}

function LinkBlock({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <section className="card-surface p-5">
      <h2 className="mb-3 text-lg text-white">{title}</h2>
      <ul className="flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="chip border border-ink-700 bg-ink-850 text-slate-200 hover:border-ink-600">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
