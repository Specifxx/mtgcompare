import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CardQuickLink from "@/components/CardQuickLink";
import { CardLinkGrid } from "@/components/CardLinkGrid";
import { CardArt } from "@/components/CardTile";
import { Breadcrumbs, ColorBadge, InShort, SectionHeader, StatTile } from "@/components/ui";
import { COUNTRIES, MARKETS } from "@/lib/country";
import { getCardDetail, getCardTextByNumber, getCatalog, type CardLite, type Catalog } from "@/lib/data";
import { encodeDeckParam } from "@/lib/deck";
import { leaderSlug } from "@/lib/facets";
import { money } from "@/lib/format";
import { usdCentsToCountry } from "@/lib/fx";
import { getCountry } from "@/lib/get-country";
import { KEYWORD_BY_SLUG } from "@/lib/keywords";
import { pageOg } from "@/lib/og/meta";
import { headline } from "@/lib/price";
import { DATA_TABLE } from "@/components/prose";

// /leaders/[slug] — one One Piece Leader (RiftCompare's /champions/[slug]):
// every printing priced, the base print in all six markets, and the cards that
// share a type with it in its colours. Reads the cached catalogue, the cached
// card-text index and the Leader's own cached card detail. Rendered on demand.
type Props = { params: { slug: string } };

function findLeader(cat: Catalog, slug: string): { base: CardLite; prints: CardLite[] } | null {
  const prints = cat.cards.filter((c) => c.cardType === "Leader" && c.number && leaderSlug(c.name, c.number) === slug);
  if (!prints.length) return null;
  const sorted = [...prints].sort((a, b) => Number(b.printing === "standard") - Number(a.printing === "standard") || a.id - b.id);
  return { base: sorted[0], prints: sorted };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cat = await getCatalog().catch(() => null);
  const l = cat ? findLeader(cat, params.slug) : null;
  if (!l) return { title: "Leader not found" };
  const slug = leaderSlug(l.base.name, l.base.number);
  return {
    title: `${l.base.name} ${l.base.number} Leader — Prices, Printings & Cards`,
    description: `${l.base.name} (${l.base.number}), a ${l.base.colors.join("/")} One Piece Leader: every printing priced across stores, its life and power, and the cards that share its types.`,
    alternates: { canonical: `/leaders/${slug}` },
    openGraph: pageOg(`/leaders/${slug}`),
  };
}

export default async function LeaderPage({ params }: Props) {
  const country = getCountry();
  const c = COUNTRIES[country];
  const [cat, text] = await Promise.all([getCatalog(), getCardTextByNumber()]);
  const l = findLeader(cat, params.slug);
  if (!l) notFound();
  const { base, prints } = l;
  const detail = await getCardDetail(base.slug);
  const slug = leaderSlug(base.name, base.number);
  const types = text.get(base.number ?? "")?.types ?? detail?.subtypes ?? [];
  const keywords = (text.get(base.number ?? "")?.keywords ?? []).map((k) => KEYWORD_BY_SLUG.get(k)).filter((k) => k != null);

  // Cards that share a type with the Leader and sit entirely in its colours:
  // the cards its deck is usually built from. Standard prints, one per number.
  const typeSet = new Set(types);
  const seen = new Set<string>();
  const related = cat.cards
    .filter((x) => x.printing === "standard" && x.cardType !== "Leader" && x.number && x.colors.length && x.colors.every((col) => base.colors.includes(col)))
    .filter((x) => (text.get(x.number!)?.types ?? []).some((t) => typeSet.has(t)))
    .sort((a, b) => (b.marketUsd ?? -1) - (a.marketUsd ?? -1))
    .filter((x) => (seen.has(x.number!) ? false : (seen.add(x.number!), true)))
    .slice(0, 24);
  const sameName = cat.cards
    .filter((x) => x.cardType === "Leader" && x.name === base.name && x.number !== base.number && x.printing === "standard")
    .filter((x, i, a) => a.findIndex((y) => y.number === x.number) === i);
  const h = headline(base, country);
  const deckLink = `/deck?list=${encodeDeckParam(`Leader\n1x${base.number}`)}`;

  return (
    <div>
      <Breadcrumbs trail={[{ href: "/leaders", name: "Leaders" }, { name: `${base.name} ${base.number}` }]} />
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <CardQuickLink slug={base.slug} className="block max-w-[240px]">
          <CardArt id={base.id} hasImage={base.hasImage} alt={`${base.name} ${base.number} One Piece Leader card`} size="large" />
        </CardQuickLink>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
            {base.name} <span className="whitespace-nowrap text-slate-400">{base.number}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">One Piece Card Game Leader · {cat.setById.get(base.setId)?.name}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {base.colors.map((col) => (
              <ColorBadge key={col} color={col} />
            ))}
            {types.map((t) => (
              <span key={t} className="chip border border-ink-700 bg-ink-850 text-slate-300">
                {t}
              </span>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Life" value={base.life ?? "—"} tone="text-white" />
            <StatTile label="Power" value={base.power?.toLocaleString("en-US") ?? "—"} tone="text-white" />
            <StatTile label={h.kind === "reference" ? "TCGplayer ≈" : `From (${c.code})`} value={h.cents == null ? "—" : money(h.cents, country)} />
            <StatTile label="Printings" value={prints.length} tone="text-white" />
          </div>
          {detail?.effect ? (
            <div className="card-surface mt-4 p-4 text-[15px] leading-relaxed text-slate-200">
              {detail.effect.split("\n").map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          ) : null}
          {keywords.length ? (
            <p className="mt-2 text-xs text-slate-400">
              Keywords:{" "}
              {keywords.map((k, i) => (
                <span key={k.slug}>
                  {i ? ", " : ""}
                  <Link href={`/keywords/${k.slug}`} className="text-brand-400 hover:underline">
                    {k.name}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <CardQuickLink slug={base.slug} className="btn-primary">
              Compare prices
            </CardQuickLink>
            <Link href={deckLink} className="btn-ghost">
              Price a deck with this Leader
            </Link>
          </div>
        </div>
      </div>

      <section className="mt-10">
        <SectionHeader title="Every printing" sub={`cheapest in-stock listing in ${c.place}, and TCGplayer's market price`} />
        <div className="card-surface overflow-x-auto">
          <table className={`${DATA_TABLE} min-w-[560px]`}>
            <thead>
              <tr>
                <th>Printing</th>
                <th>Set</th>
                <th className="text-right">Cheapest ({c.code})</th>
                <th className="text-right">TCGplayer market</th>
              </tr>
            </thead>
            <tbody>
              {prints.map((p) => (
                <tr key={p.id}>
                  <td>
                    <CardQuickLink slug={p.slug} className="font-semibold text-white hover:text-brand-400">
                      {p.variant ?? "Standard"}
                    </CardQuickLink>
                  </td>
                  <td className="text-sm text-slate-300">{cat.setById.get(p.setId)?.code}</td>
                  <td className="num text-right text-slate-100">{p.low[country] != null ? `${money(p.low[country], country)} · ${p.stores[country]} store${p.stores[country] === 1 ? "" : "s"}` : "—"}</td>
                  <td className="num text-right text-slate-300">{p.marketUsd != null ? money(p.marketUsd, "US") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <SectionHeader title="The standard print in every market" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {MARKETS.map((m) => (
            <StatTile
              key={m}
              label={COUNTRIES[m].label}
              value={base.low[m] != null ? money(base.low[m], m) : base.marketUsd != null ? `≈ ${money(usdCentsToCountry(base.marketUsd, m), m)}` : "—"}
              sub={base.low[m] != null ? `${base.stores[m]} store${base.stores[m] === 1 ? "" : "s"}` : "no store in stock"}
              tone={m === country ? "text-accent" : "text-white"}
            />
          ))}
        </div>
      </section>

      {related.length ? (
        <section className="mt-10">
          <SectionHeader
            title={`Cards for a ${base.name} deck`}
            sub={`the most valuable ${base.colors.join("/").toLowerCase()} cards that share a type with this Leader (${types.slice(0, 3).join(", ")}${types.length > 3 ? "…" : ""})`}
          />
          <CardLinkGrid cards={related} cat={cat} country={country} />
        </section>
      ) : null}

      {sameName.length ? (
        <section className="mt-10">
          <h2 className="mb-3 text-lg text-white">Other {base.name} Leaders</h2>
          <ul className="flex flex-wrap gap-2">
            {sameName.map((x) => (
              <li key={x.id}>
                <Link href={`/leaders/${leaderSlug(x.name, x.number)}`} className="chip border border-ink-700 bg-ink-850 text-slate-200 hover:border-ink-600">
                  {x.number} · {x.colors.join("/")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-10">
        <InShort>
          A One Piece deck is one Leader and 50 cards in its colours. The cards above share a type with {base.name}, which many of its effects ask for;
          they are a starting point, not a decklist. Paste a full list into the{" "}
          <Link href={deckLink} className="text-brand-400 hover:underline">
            deck price calculator
          </Link>{" "}
          to price it.
        </InShort>
      </div>
    </div>
  );
}
