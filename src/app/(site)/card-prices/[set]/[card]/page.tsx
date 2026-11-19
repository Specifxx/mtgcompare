import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "@/components/Link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CardTiles } from "@/components/CardTiles";
import { OutboundLink } from "@/components/OutboundLink";
import { Section } from "@/components/Section";
import { CardOwnButton } from "@/components/vault/CardOwnButton";
import { AFFILIATE_NOTE_SHORT, REL_SPONSORED, TCGPLAYER_RETAILER, ebayCardSearchUrl, ebayRetailer, tcgplayerAffiliateUrl } from "@/lib/affiliate";
import { CARDS_HUB, cardImage, cardIndexable, cardPath, cardTitle, cardValue, rarityName, readSet, readSets, setBySlug, tcgplayerCardUrl, usd, type CardRow, type CardSet } from "@/lib/cards";
import { shortDate } from "@/lib/hub-copy";
import { breadcrumbJsonLd, jsonLd, pageMeta, withMtg } from "@/lib/seo";
import { SET_BY_CODE } from "@/lib/sets";
import { SITE_NAME } from "@/lib/site";

// One card's price page (DECISIONS.md "Card prices: every card"). The price is TCGplayer's market price only (recent sales, US$),
// never a seller's ask. Rows: "Check on eBay" first (a tagged search, no eBay API call), TCGplayer second. One page per card, not
// one per region: TCGplayer is a US marketplace and its price is one figure for everyone. Indexable once the import has released it
// to Google (lib/cards.ts); every other card is live and noindex. A card that left TCGplayer's list redirects to its set; an unknown
// set is a 404. Rendered per request and kept by Vercel's CDN for a day.
export const dynamic = "force-dynamic";

type Loaded = { set: CardSet; c: CardRow; cards: CardRow[] };

function load(params: { set: string; card: string }): Loaded | "set" | null {
  const set = setBySlug(params.set);
  if (!set) return null;
  const cards = readSet(set.slug);
  const c = cards.find((x) => x.s === params.card);
  return c ? { set, c, cards } : "set";
}

function describe(set: CardSet, c: CardRow): string {
  const parts = [c.p[0] ? `${usd(c.p[0])} normal` : null, c.p[1] ? `${usd(c.p[1])} foil` : null, c.p[2] ? `${usd(c.p[2])} etched foil` : null].filter(Boolean);
  const where = `${set.name}${c.no ? ` #${c.no}` : ""}`;
  const d = parts.length
    ? `${c.n} (${where}) price: ${parts.join(", ")} at TCGplayer's market price, updated daily. Check eBay and TCGplayer listings.`
    : `${c.n} (${where}): no recent TCGplayer sales. Check eBay and TCGplayer listings for this card.`;
  return d.length <= 160 ? d : d.slice(0, 157).replace(/\s+\S*$/, "") + "…";
}

export function generateMetadata({ params }: { params: { set: string; card: string } }): Metadata {
  const x = load(params);
  if (!x || x === "set") return {};
  const { set, c } = x;
  return pageMeta({
    title: cardTitle(c, set),
    description: describe(set, c),
    path: cardPath(set.slug, c.s),
    image: cardImage(c.id, 1000),
    noindex: !cardIndexable(c),
  });
}

export default function CardPricePage({ params }: { params: { set: string; card: string } }) {
  const x = load(params);
  if (x === "set") permanentRedirect(`${CARDS_HUB}/${params.set}`);
  if (!x) notFound();
  const { set, c, cards } = x;
  const { generatedAt } = readSets();
  const value = cardValue(c.p);
  const rarity = rarityName(c.r);
  const sealed = set.sealed ? SET_BY_CODE.get(set.sealed) : null;
  const ebay = ebayCardSearchUrl(`${c.n} ${set.name}${c.no ? ` ${c.no}` : ""}`, "us", "card-ebay");
  const tcg = tcgplayerAffiliateUrl(tcgplayerCardUrl(c.id), "us", "card-tcgplayer");
  const i = cards.indexOf(c);
  const prev = i > 0 ? cards[i - 1] : null;
  const next = i < cards.length - 1 ? cards[i + 1] : null;
  const others = cards
    .filter((o) => o.id !== c.id && (cardValue(o.p) ?? 0) > 0)
    .sort((a, b) => (cardValue(b.p) ?? 0) - (cardValue(a.p) ?? 0) || a.id - b.id)
    .slice(0, 10);
  const crumbs = [{ href: "/", label: SITE_NAME }, { href: CARDS_HUB, label: "Card prices" }, { href: `${CARDS_HUB}/${set.slug}`, label: set.name }, { label: c.n }];
  const finishes: [string, number | null][] = [
    ["Normal", c.p[0]],
    ["Foil", c.p[1]],
    ["Etched foil", c.p[2]],
  ];
  const headlineFinish = value == null ? null : finishes.find(([, v]) => v === value)?.[0];
  return (
    <div className="page py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd(crumbs)) }} />
      <Breadcrumbs items={crumbs} />
      <div className="grid gap-6 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] sm:gap-10">
        <div className="mx-auto w-full max-w-[16rem] sm:max-w-[18rem]">
          <div className="aspect-[5/7] w-full overflow-hidden rounded-xl bg-raised">
            <img src={cardImage(c.id, 1000)} alt={`${c.n}, ${set.name}${c.no ? ` #${c.no}` : ""}`} width={488} height={680} fetchPriority="high" decoding="async" className="h-full w-full object-contain" />
          </div>
        </div>
        <div className="min-w-0">
          <div className="eyebrow">
            {set.name}
            {c.no ? ` · #${c.no}` : ""}
            {rarity ? ` · ${rarity}` : ""}
          </div>
          <h1 className="page-title mt-1">{c.n} price</h1>
          {value != null ? (
            <p className="mt-3">
              <span className="tabular font-display text-3xl font-extrabold">{usd(value)}</span>{" "}
              <span className="text-sm text-muted">TCGplayer market price{headlineFinish && headlineFinish !== "Normal" ? ` (${headlineFinish.toLowerCase()})` : ""}</span>
            </p>
          ) : (
            <p className="mt-3 text-muted">No recent TCGplayer sales of this card. Check the listings below.</p>
          )}
          {value != null && (
            <table className="mt-4 w-full max-w-md text-sm">
              <tbody>
                {finishes
                  .filter(([, v]) => v != null)
                  .map(([label, v]) => (
                    <tr key={label} className="border-b border-line">
                      <th scope="row" className="py-2 text-left font-medium text-muted">
                        {label}
                      </th>
                      <td className="tabular py-2 text-right font-semibold">{usd(v!)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}

          {/* Where to buy: eBay first (a tagged search; no price claimed), TCGplayer second. */}
          <ul className="mt-6 grid max-w-md gap-2">
            <li className="card flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block font-semibold">eBay</span>
                <span className="text-xs text-muted">Search listings for this card</span>
              </span>
              <OutboundLink href={ebay} rel={REL_SPONSORED} retailer={ebayRetailer("us")} placement="card-ebay" className="btn-primary min-h-11 shrink-0">
                Check on eBay <span aria-hidden="true">↗</span>
              </OutboundLink>
            </li>
            <li className="card flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block font-semibold">TCGplayer</span>
                <span className="text-xs text-muted">{value != null ? `Market price ${usd(value)}` : "See listings"}</span>
              </span>
              <OutboundLink href={tcg} rel={REL_SPONSORED} retailer={TCGPLAYER_RETAILER} placement="card-tcgplayer" className="btn-ghost min-h-11 shrink-0">
                View on TCGplayer <span aria-hidden="true">↗</span>
              </OutboundLink>
            </li>
          </ul>
          <p className="mt-2 text-xs text-muted">{AFFILIATE_NOTE_SHORT}</p>

          {/* My collection (lib/vault.ts): below the buy rows, never above a price. */}
          <CardOwnButton id={c.id} name={c.n} setSlug={set.slug} setName={set.name} href={cardPath(set.slug, c.s)} image={cardImage(c.id)} prices={c.p} />

          <p className="mt-6 max-w-2xl text-sm text-muted">
            {c.n} is {c.no ? `card #${c.no} in ` : "a card from "}
            {withMtg(set.name)}
            {set.abbr ? ` (${set.abbr})` : ""}
            {rarity ? `, a ${rarity.toLowerCase()}` : ""}. The price is TCGplayer&rsquo;s market price: what copies have recently sold for on TCGplayer,
            in US dollars.{generatedAt ? ` Updated ${shortDate(generatedAt.slice(0, 10))}.` : ""}
            {sealed && (
              <>
                {" "}
                Chasing it in packs?{" "}
                <Link href={`/us/sets/${sealed.slug}`} prefetch={false} className="font-semibold text-brand hover:underline">
                  Compare {sealed.name} booster boxes across stores
                </Link>
                .
              </>
            )}
          </p>

          {(prev || next) && (
            <nav aria-label="Next and previous card" className="mt-6 flex flex-wrap gap-2 text-sm">
              {prev && (
                <Link href={cardPath(set.slug, prev.s)} prefetch={false} className="btn-ghost min-h-10">
                  ← {prev.no ? `#${prev.no} ` : ""}
                  {prev.n}
                </Link>
              )}
              {next && (
                <Link href={cardPath(set.slug, next.s)} prefetch={false} className="btn-ghost min-h-10">
                  {next.no ? `#${next.no} ` : ""}
                  {next.n} →
                </Link>
              )}
            </nav>
          )}
        </div>
      </div>

      {others.length > 0 && (
        <Section id="more" title={`More ${set.name} card prices`} href={`${CARDS_HUB}/${set.slug}`} linkLabel="Every card">
          <CardTiles cards={others.map((o) => ({ set: set.slug, s: o.s, n: o.n, no: o.no, r: o.r, id: o.id, v: cardValue(o.p) ?? 0 }))} />
        </Section>
      )}
    </div>
  );
}
