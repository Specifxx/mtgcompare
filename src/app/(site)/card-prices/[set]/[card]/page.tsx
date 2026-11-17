import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "@/components/Link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CardTiles } from "@/components/CardTiles";
import { OutboundLink } from "@/components/OutboundLink";
import { Section } from "@/components/Section";
import { AFFILIATE_NOTE_SHORT, REL_SPONSORED, TCGPLAYER_RETAILER, ebayCardSearchUrl, ebayRetailer, tcgplayerAffiliateUrl } from "@/lib/affiliate";
import { CARDS_HUB, cardBySlug, cardImage, cardIndexable, cardPath, cardsOfSet, cardTitle, cardValue, rarityName, readCards, usd, type CardRow } from "@/lib/cards";
import { shortDate } from "@/lib/hub-copy";
import { breadcrumbJsonLd, jsonLd, pageMeta, withMtg } from "@/lib/seo";
import { SET_BY_SLUG, type MtgSet } from "@/lib/sets";
import { SITE_NAME } from "@/lib/site";

// One card's price page (DECISIONS.md, 2026-11-17 "Card prices"). The price is TCGplayer's market price only (recent sales, US$),
// never a seller's ask. Rows: "Check on eBay" first (a tagged search, no eBay call), TCGplayer second. One page per card, not one per
// region: TCGplayer is a US marketplace and its price is the same for everyone. A card that lost its page (TCGplayer stopped listing
// it) redirects to its set's card list; an unknown set is a 404. Rendered per request and kept by Vercel's CDN for a day.
export const dynamic = "force-dynamic";

function load(params: { set: string; card: string }): { s: MtgSet; c: CardRow } | "set" | null {
  const s = SET_BY_SLUG.get(params.set);
  if (!s) return null;
  const c = cardBySlug(s.code, params.card);
  return c ? { s, c } : cardsOfSet(s.code).length ? "set" : null;
}

function describe(s: MtgSet, c: CardRow): string {
  const v = cardValue(c);
  const parts = [c.normal ? `${usd(c.normal)} normal` : null, c.foil ? `${usd(c.foil)} foil` : null, c.etched ? `${usd(c.etched)} etched foil` : null].filter(Boolean);
  const d = `${c.name} price from ${s.name} (#${c.number}): ${parts.join(", ") || (v ? usd(v) : "no recent sales")} at TCGplayer's market price, updated daily. Compare on eBay and TCGplayer.`;
  return d.length <= 160 ? d : d.slice(0, 157).replace(/\s+\S*$/, "") + "…";
}

export function generateMetadata({ params }: { params: { set: string; card: string } }): Metadata {
  const x = load(params);
  if (!x || x === "set") return {};
  const { s, c } = x;
  return pageMeta({
    title: cardTitle(c, s.name),
    description: describe(s, c),
    path: cardPath(s.slug, c),
    image: cardImage(c.imageUrl, 1000),
    noindex: !cardIndexable(c),
  });
}

export default function CardPricePage({ params }: { params: { set: string; card: string } }) {
  const x = load(params);
  if (x === "set") permanentRedirect(`${CARDS_HUB}/${params.set}`);
  if (!x) notFound();
  const { s, c } = x;
  const { generatedAt } = readCards();
  const value = cardValue(c);
  const img = cardImage(c.imageUrl, 1000);
  const rarity = rarityName(c.rarity);
  const query = `${c.name} ${s.name} ${c.number}`;
  const ebay = ebayCardSearchUrl(query, "us", "card-ebay");
  const tcg = tcgplayerAffiliateUrl(c.url, "us", "card-tcgplayer");
  const others = cardsOfSet(s.code).filter((o) => o.id !== c.id).slice(0, 10);
  const crumbs = [{ href: "/", label: SITE_NAME }, { href: CARDS_HUB, label: "Card prices" }, { href: `${CARDS_HUB}/${s.slug}`, label: s.name }, { label: c.name }];
  const finishes: [string, number | null][] = [
    ["Normal", c.normal],
    ["Foil", c.foil],
    ["Etched foil", c.etched],
  ];
  return (
    <div className="page py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd(crumbs)) }} />
      <Breadcrumbs items={crumbs} />
      <div className="grid gap-6 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] sm:gap-10">
        <div className="mx-auto w-full max-w-[18rem]">
          {img && <img src={img} alt={`${c.name}, ${s.name} #${c.number}`} width={488} height={680} fetchPriority="high" decoding="async" className="w-full rounded-xl" />}
        </div>
        <div className="min-w-0">
          <div className="eyebrow">
            {s.name} · #{c.number}
            {rarity ? ` · ${rarity}` : ""}
          </div>
          <h1 className="page-title mt-1">{c.name} price</h1>
          {value != null && (
            <p className="mt-3">
              <span className="tabular font-display text-3xl font-extrabold">{usd(value)}</span>{" "}
              <span className="text-sm text-muted">TCGplayer market price{c.foil && c.normal && c.foil > c.normal ? " (foil)" : ""}</span>
            </p>
          )}
          <table className="mt-4 w-full max-w-md text-sm">
            <tbody>
              {finishes
                .filter(([, v]) => v != null)
                .map(([label, v]) => (
                  <tr key={label} className="border-b border-line">
                    <th scope="row" className="py-2 text-left font-medium text-muted">{label}</th>
                    <td className="tabular py-2 text-right font-semibold">{usd(v!)}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          {/* Where to buy: eBay first (a search on the visitor's US eBay, tagged; no price claimed), TCGplayer second. */}
          <ul className="mt-6 grid max-w-md gap-2">
            <li className="card flex items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="block font-semibold">eBay</span>
                <span className="text-xs text-muted">Search listings for this card</span>
              </span>
              <OutboundLink href={ebay} rel={REL_SPONSORED} retailer={ebayRetailer("us")} placement="card-ebay" className="btn-primary min-h-11 shrink-0">
                Check on eBay <span aria-hidden="true">↗</span>
              </OutboundLink>
            </li>
            <li className="card flex items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="block font-semibold">TCGplayer</span>
                <span className="text-xs text-muted">{value != null ? `Market price ${usd(value)}` : "See listings"}</span>
              </span>
              <OutboundLink href={tcg} rel={REL_SPONSORED} retailer={TCGPLAYER_RETAILER} placement="card-tcgplayer" className="btn-ghost min-h-11 shrink-0">
                View on TCGplayer <span aria-hidden="true">↗</span>
              </OutboundLink>
            </li>
          </ul>
          <p className="mt-2 text-xs text-muted">{AFFILIATE_NOTE_SHORT}</p>

          <p className="mt-6 max-w-2xl text-sm text-muted">
            {c.name} is card #{c.number} in {withMtg(s.name)}
            {rarity ? `, a ${rarity.toLowerCase()}` : ""}. The price above is TCGplayer&rsquo;s market price: what copies have
            recently sold for on TCGplayer, in US dollars.{generatedAt ? ` Updated ${shortDate(generatedAt.slice(0, 10))}.` : ""} Chasing it in
            packs?{" "}
            <Link href={`/us/sets/${s.slug}`} prefetch={false} className="font-semibold text-brand hover:underline">
              Compare {s.name} booster boxes across stores
            </Link>
            .
          </p>
        </div>
      </div>

      {others.length > 0 && (
        <Section id="more" title={`More ${s.name} card prices`} href={`${CARDS_HUB}/${s.slug}`} linkLabel="Every card">
          <CardTiles cards={others} />
        </Section>
      )}
    </div>
  );
}
