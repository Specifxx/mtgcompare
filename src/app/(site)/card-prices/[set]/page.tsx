import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/Link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CardTiles } from "@/components/CardTiles";
import { Section } from "@/components/Section";
import { CARDS_HUB, cardIndexable, cardPath, cardValue, rarityName, readSet, readSets, setBySlug, usd } from "@/lib/cards";
import { shortDate } from "@/lib/hub-copy";
import { breadcrumbJsonLd, itemListJsonLd, jsonLd, pageMeta, withMtg } from "@/lib/seo";
import { SET_BY_CODE } from "@/lib/sets";
import { SITE_NAME } from "@/lib/site";

// One set's cards (DECISIONS.md "Card prices: every card"): the most valuable as tiles, then every card in collector-number order.
// Indexable while it has a card released to Google. CDN-cached a day like every page; no cookie, header or session read. The
// table shows SET_PAGE cards a page (`?page=2`…, noindex, follow): The List alone has 5,700 cards, 6 MB of HTML on one page.
export const dynamic = "force-dynamic";

const SET_PAGE = 300;
type Props = { params: { set: string }; searchParams?: { page?: string | string[] } };
function pageOf(sp: Props["searchParams"], cards: number): number | null {
  const raw = Array.isArray(sp?.page) ? sp?.page[0] : sp?.page;
  if (raw == null) return 1;
  const n = /^[1-9]\d{0,3}$/.test(raw) ? Number(raw) : NaN;
  return n >= 1 && n <= Math.max(1, Math.ceil(cards / SET_PAGE)) ? n : null;
}

function load(slug: string) {
  const set = setBySlug(slug);
  if (!set) return null;
  const cards = readSet(set.slug);
  return cards.length ? { set, cards } : null;
}

export function generateMetadata({ params, searchParams }: Props): Metadata {
  const x = load(params.set);
  if (!x) return {};
  const page = pageOf(searchParams, x.cards.length) ?? 1;
  const ranked = [...x.cards].sort((a, b) => (cardValue(b.p) ?? 0) - (cardValue(a.p) ?? 0));
  const top = ranked[0];
  const full = `${withMtg(x.set.name)} Card Prices`;
  const topV = top ? cardValue(top.p) : null;
  const d = `${withMtg(x.set.name)} card prices: all ${x.cards.length} cards at TCGplayer's market price, normal and foil${top && topV ? `, led by ${top.n} at ${usd(topV)}` : ""}.`;
  return pageMeta({
    title: full.length <= 46 ? full : `${x.set.name} Card Prices`.length <= 46 ? `${x.set.name} Card Prices` : x.set.name,
    description: d.length <= 160 ? d : `${withMtg(x.set.name)} card prices: all ${x.cards.length} cards at TCGplayer's market price, normal and foil.`.slice(0, 160),
    path: `${CARDS_HUB}/${x.set.slug}${page > 1 ? `?page=${page}` : ""}`,
    noindex: page > 1 || !x.cards.some(cardIndexable),
  });
}

export default function SetCardPrices({ params, searchParams }: Props) {
  const x = load(params.set);
  if (!x) notFound();
  const { set, cards } = x;
  const page = pageOf(searchParams, cards.length);
  if (page == null) notFound();
  const pages = Math.ceil(cards.length / SET_PAGE);
  const shown = cards.slice((page - 1) * SET_PAGE, page * SET_PAGE);
  const { generatedAt } = readSets();
  const sealed = set.sealed ? SET_BY_CODE.get(set.sealed) : null;
  const path = `${CARDS_HUB}/${set.slug}`;
  const top = [...cards]
    .filter((c) => (cardValue(c.p) ?? 0) > 0)
    .sort((a, b) => (cardValue(b.p) ?? 0) - (cardValue(a.p) ?? 0) || a.id - b.id)
    .slice(0, 10);
  const crumbs = [{ href: "/", label: SITE_NAME }, { href: CARDS_HUB, label: "Card prices" }, { label: set.name }];
  return (
    <div className="page py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd(crumbs)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(itemListJsonLd({ name: `${set.name} card prices`, path, items: top.map((c) => ({ path: cardPath(set.slug, c.s), name: c.n })) })) }} />
      <Breadcrumbs items={crumbs} />
      <h1 className="page-title">{withMtg(set.name)} card prices</h1>
      <p className="mt-3 max-w-3xl text-muted">
        All {cards.length} cards{set.abbr ? ` of ${set.name} (${set.abbr})` : ""} at TCGplayer&rsquo;s market price: recent sales on TCGplayer, in US
        dollars.{set.released ? ` Released ${shortDate(set.released)}.` : ""}{generatedAt ? ` Prices updated ${shortDate(generatedAt.slice(0, 10))}.` : ""}
        {sealed && (
          <>
            {" "}
            Opening packs instead?{" "}
            <Link href={`/us/sets/${sealed.slug}`} prefetch={false} className="font-semibold text-brand hover:underline">
              Compare {sealed.name} booster boxes and bundles
            </Link>{" "}
            across stores.
          </>
        )}
      </p>
      {top.length > 0 && (
        <Section id="top" title={`Most valuable ${set.name} cards`} className="mt-8">
          <CardTiles cards={top.map((c) => ({ set: set.slug, s: c.s, n: c.n, no: c.no, r: c.r, id: c.id, v: cardValue(c.p) ?? 0 }))} eager={5} />
        </Section>
      )}
      <Section id="all" title={`Every ${set.name} card`} kicker={pages > 1 ? `In collector-number order · page ${page} of ${pages}` : "In collector-number order"}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th scope="col" className="py-2 pr-3 font-semibold">#</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Card</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Rarity</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Normal</th>
                <th scope="col" className="py-2 text-right font-semibold">Foil</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="border-b border-line">
                  <td className="tabular py-1.5 pr-3 text-muted">{c.no}</td>
                  <td className="py-1.5 pr-3">
                    <Link href={cardPath(set.slug, c.s)} prefetch={false} className="font-medium hover:text-brand hover:underline">
                      {c.n}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-3 text-muted">{rarityName(c.r) ?? ""}</td>
                  <td className="tabular py-1.5 pr-3 text-right">{c.p[0] ? usd(c.p[0]) : "–"}</td>
                  <td className="tabular py-1.5 text-right">{c.p[1] ? usd(c.p[1]) : c.p[2] ? `${usd(c.p[2])} etched` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <nav aria-label="Pages" className="mt-4 flex flex-wrap gap-2 text-sm">
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) =>
              n === page ? (
                <span key={n} aria-current="page" className="chip font-semibold">
                  {(n - 1) * SET_PAGE + 1}–{Math.min(n * SET_PAGE, cards.length)}
                </span>
              ) : (
                <Link key={n} href={n === 1 ? path : `${path}?page=${n}`} prefetch={false} className="chip hover:text-brand">
                  {(n - 1) * SET_PAGE + 1}–{Math.min(n * SET_PAGE, cards.length)}
                </Link>
              ),
            )}
          </nav>
        )}
      </Section>
    </div>
  );
}
