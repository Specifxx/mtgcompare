import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { CardTiles } from "@/components/CardTiles";
import { PriceChart } from "@/components/PriceChart";
import { AFFILIATE_NOTE, REL_SPONSORED, ebayCardSearchUrl, tcgplayerOutUrl } from "@/lib/affiliate";
import { cardIndexable, cardTitle, cardValue, dayIndex, tcgplayerCardUrl, type CardRow, type CardSet } from "@/lib/cards";
import { cardImage, cardPath, shortDate, usd } from "@/lib/format";
import { breadcrumbLd, jsonLd, pageMeta } from "@/lib/seo";
import { readHistory, readSet, readSets, setBySlug } from "@/lib/store";
import { SITE, gameBySlug, type Game } from "@/site.config";

// One card's price page. The price is TCGplayer's market price only (recent sales, US$), never a seller's ask. Rows: "Check on
// eBay" first (a tagged search; no eBay API call and no price claimed), TCGplayer second. Indexable once the import has released
// the card to Google (lib/cards.ts); every other card is live and noindex. A card that left TCGplayer's list redirects to its set.
export const dynamic = "force-dynamic";

type Loaded = { g: Game; set: CardSet; c: CardRow; cards: CardRow[] };
function load(params: { game: string; set: string; card: string }): Loaded | "set" | null {
  const g = gameBySlug(params.game);
  const set = g && setBySlug(g.slug, params.set);
  if (!g || !set) return null;
  const cards = readSet(g.slug, set.slug);
  const c = cards.find((x) => x.s === params.card);
  return c ? { g, set, c, cards } : "set";
}
const printings = (c: CardRow) => Object.entries(c.p).sort((a, b) => b[1] - a[1]);

function describe(g: Game, set: CardSet, c: CardRow): string {
  const parts = printings(c).slice(0, 3).map(([k, v]) => `${usd(v)} ${k.toLowerCase()}`);
  const where = `${g.name} ${set.name}${c.no ? ` #${c.no}` : ""}`;
  const d = parts.length ? `${c.n} (${where}) price: ${parts.join(", ")} at TCGplayer's market price, updated daily, with price history.` : `${c.n} (${where}): no recent TCGplayer sales. Check eBay and TCGplayer listings for this card.`;
  return d.length <= 160 ? d : d.slice(0, 157).replace(/\s+\S*$/, "") + "…";
}

export function generateMetadata({ params }: { params: { game: string; set: string; card: string } }): Metadata {
  const x = load(params);
  if (!x || x === "set") return {};
  const { g, set, c } = x;
  return pageMeta({ title: cardTitle(c, set, SITE.name), description: describe(g, set, c), path: cardPath(g.slug, set.slug, c.s), image: cardImage(c.id, 1000), noindex: !cardIndexable(c) });
}

export default function CardPage({ params }: { params: { game: string; set: string; card: string } }) {
  const x = load(params);
  if (x === "set") permanentRedirect(`/${params.game}/${params.set}`);
  if (!x) notFound();
  const { g, set, c, cards } = x;
  const { generatedAt } = readSets(g.slug);
  const day = generatedAt.slice(0, 10);
  const value = cardValue(c.p);
  const rows = printings(c);
  const pts = readHistory(g.slug, set.slug, c.id);
  const ebay = ebayCardSearchUrl(`${g.short} ${c.n} ${set.name}${c.no ? ` ${c.no}` : ""}`, "card-ebay");
  const tcg = tcgplayerOutUrl(tcgplayerCardUrl(c.id), "card-tcgplayer");
  const i = cards.indexOf(c);
  const prev = i > 0 ? cards[i - 1] : null;
  const next = i < cards.length - 1 ? cards[i + 1] : null;
  const others = cards
    .filter((o) => o.id !== c.id && (cardValue(o.p) ?? 0) > 0)
    .sort((a, b) => (cardValue(b.p) ?? 0) - (cardValue(a.p) ?? 0) || a.id - b.id)
    .slice(0, 12);
  const crumbs = [{ label: SITE.name, href: "/" }, { label: g.name, href: `/${g.slug}` }, { label: set.name, href: `/${g.slug}/${set.slug}` }, { label: c.n }];
  const url = `${SITE.url}${cardPath(g.slug, set.slug, c.s)}`;
  // What an answer engine can quote: the card, the figure, the source and the date. No Offer: we do not sell the card.
  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${c.n}${c.no ? ` #${c.no}` : ""} (${g.name}, ${set.name})`,
    image: cardImage(c.id, 1000),
    url,
    category: `${g.name} trading card`,
    sku: String(c.id),
    additionalProperty: [
      ...rows.map(([k, v]) => ({ "@type": "PropertyValue", name: `TCGplayer market price (${k})`, value: (v / 100).toFixed(2), unitCode: "USD", ...(day ? { dateModified: day } : {}) })),
      ...(c.r ? [{ "@type": "PropertyValue", name: "Rarity", value: c.r }] : []),
      ...(c.no ? [{ "@type": "PropertyValue", name: "Collector number", value: c.no }] : []),
    ],
  };
  return (
    <div className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd(crumbs)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="/">{SITE.name}</a> <span>›</span> <a href={`/${g.slug}`}>{g.name}</a> <span>›</span> <a href={`/${g.slug}/${set.slug}`}>{set.name}</a> <span>›</span> <span>{c.n}</span>
      </nav>
      <div className="cardgrid">
        <div className="art">
          <img src={cardImage(c.id, 1000)} alt={`${c.n}, ${set.name}${c.no ? ` #${c.no}` : ""}`} width={488} height={680} fetchPriority="high" decoding="async" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">
            {g.name} · {set.name}
            {c.no ? ` · #${c.no}` : ""}
            {c.r ? ` · ${c.r}` : ""}
          </div>
          <h1>{c.n} price</h1>
          {value != null ? (
            <p style={{ margin: "12px 0 0" }}>
              <span className="price">{usd(value)}</span> <span className="small">TCGplayer market price{rows.length > 1 ? ` (${rows[0][0].toLowerCase()})` : ""}</span>
            </p>
          ) : (
            <p className="lede">No recent TCGplayer sales of this card. Check the listings below.</p>
          )}
          {rows.length > 0 && (
            <table className="list" style={{ maxWidth: "30rem", marginTop: 12 }}>
              <tbody>
                {rows.map(([k, v]) => (
                  <tr key={k}>
                    <th scope="row">{k}</th>
                    <td className="r">
                      <b>{usd(v)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <ul className="rows">
            <li className="card">
              <span>
                <b>eBay</b>
                <span className="small" style={{ display: "block" }}>
                  Search listings for this card
                </span>
              </span>
              <a className="btn primary" href={ebay} rel={REL_SPONSORED} target="_blank">
                Check on eBay ↗
              </a>
            </li>
            <li className="card">
              <span>
                <b>TCGplayer</b>
                <span className="small" style={{ display: "block" }}>
                  {value != null ? `Market price ${usd(value)}` : "See listings"}
                </span>
              </span>
              <a className="btn" href={tcg} rel={REL_SPONSORED} target="_blank">
                View on TCGplayer ↗
              </a>
            </li>
          </ul>
          <p className="small">{AFFILIATE_NOTE}</p>

          {pts.length >= 2 && day && (
            <section>
              <h2>Price history</h2>
              <PriceChart pts={pts} today={dayIndex(day)} />
            </section>
          )}

          <p className="lede" style={{ marginTop: 22 }}>
            {c.n} is {c.no ? `card #${c.no} in ` : "a card from "}the {g.name} set {set.name}
            {set.abbr ? ` (${set.abbr})` : ""}
            {c.r ? `, rarity ${c.r}` : ""}.{" "}
            {value != null ? `Its TCGplayer market price is ${usd(value)}${day ? ` as of ${shortDate(day)}` : ""}: what copies have recently sold for on TCGplayer, in US dollars.` : "It has no recent sales on TCGplayer."}
          </p>

          {(prev || next) && (
            <nav aria-label="Next and previous card" className="pager">
              {prev && (
                <a className="btn" href={cardPath(g.slug, set.slug, prev.s)}>
                  ← {prev.no ? `#${prev.no} ` : ""}
                  {prev.n}
                </a>
              )}
              {next && (
                <a className="btn" href={cardPath(g.slug, set.slug, next.s)}>
                  {next.no ? `#${next.no} ` : ""}
                  {next.n} →
                </a>
              )}
            </nav>
          )}
        </div>
      </div>
      {others.length > 0 && (
        <section>
          <h2>
            More <a href={`/${g.slug}/${set.slug}`}>{set.name}</a> card prices
          </h2>
          <CardTiles game={g.slug} cards={others.map((o) => ({ set: set.slug, s: o.s, n: o.n, no: o.no, r: o.r, id: o.id, v: cardValue(o.p) ?? 0 }))} />
        </section>
      )}
    </div>
  );
}
