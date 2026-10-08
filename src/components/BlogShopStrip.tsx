import Link from "next/link";
import { cardEbayQuery, ebayLabel, ebaySearchUrl, onePieceEbayQuery, outboundRel } from "@/lib/affiliate";
import { COUNTRIES, type Country } from "@/lib/country";
import type { CardLite, SealedLite, SetLite } from "@/lib/data";
import { money } from "@/lib/format";
import { cardImage } from "@/lib/images";
import { headline } from "@/lib/price";
import CardQuickLink from "./CardQuickLink";

// "Shop the cards in this post" (RiftCompare's ArticleShopStrip, made from
// MTG Compare's own data): the cards and products the post names, each with its
// live cheapest price in the reader's market and two ways to buy — every
// store's price on our page (QuickView), or an affiliate eBay SEARCH on the
// reader's own eBay. A search, so it says "Search", never "Buy": it claims no
// listing exists. Rendered on the server with the post (same request, same
// cached catalogue), so it needs no fetch and no client state.
export function BlogShopStrip({
  cards,
  sealed = [],
  setById,
  country,
  placement = "end",
}: {
  cards: CardLite[];
  sealed?: SealedLite[];
  setById: Map<number, SetLite>;
  country: Country;
  placement?: "inline" | "end";
}) {
  if (!cards.length && !sealed.length) return null;
  const c = COUNTRIES[country];
  const source = placement === "inline" ? "blog-inline" : "blog-strip";
  const price = (p: Parameters<typeof headline>[0]) => {
    const h = headline(p, country);
    if (h.kind === "listing") return { text: money(h.cents, country), note: h.stores > 0 ? `${h.stores} ${c.adjective} store${h.stores === 1 ? "" : "s"}` : "Cheapest listing" };
    if (h.kind === "reference") return { text: `≈ ${money(h.cents, country)}`, note: "TCGplayer market" };
    return { text: "—", note: "No price yet" };
  };
  const row = "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5";
  const ebayBtn = (query: string, label: string) => (
    <a
      href={ebaySearchUrl(country, query, source)}
      target="_blank"
      rel={outboundRel()}
      data-retailer="ebay_search"
      data-page="blog"
      aria-label={`Search ${ebayLabel(country)} for ${label}`}
      className="btn-ebay-ghost min-h-9 w-full shrink-0 px-3 text-xs sm:w-auto"
    >
      Search eBay →
    </a>
  );
  return (
    <section className="not-prose card-surface mt-8 overflow-hidden" data-shop-strip={placement} aria-labelledby={`shop-${placement}`}>
      <div className="flex items-center justify-between gap-2 border-b border-ink-800 bg-ink-950/60 px-4 py-3 sm:px-5">
        <h2 id={`shop-${placement}`} className="text-sm font-extrabold uppercase tracking-wide text-white">
          {sealed.length ? "Shop this post" : "Shop the cards in this post"}
        </h2>
        <span className="num text-[11px] text-slate-500">Prices in {c.currency}</span>
      </div>
      <ul className="divide-y divide-ink-800">
        {cards.map((card) => {
          const p = price(card);
          const label = `${card.name}${card.variant ? ` (${card.variant})` : ""}`;
          return (
            <li key={`c-${card.id}`} className={row}>
              <CardQuickLink slug={card.slug} className="group flex min-w-0 flex-1 basis-56 items-center gap-3">
                {card.hasImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cardImage.thumb(card.id)} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded-sm bg-ink-800 object-cover" />
                ) : (
                  <span className="h-14 w-10 shrink-0 rounded-sm bg-ink-800" />
                )}
                <span className="min-w-0">
                  <span data-card-name className="block truncate text-[15px] font-semibold text-white group-hover:text-brand-400">
                    {card.name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {card.variant ? `${card.variant} · ` : ""}
                    {setById.get(card.setId)?.code ?? ""}
                    {card.number ? ` · ${card.number}` : ""}
                  </span>
                </span>
              </CardQuickLink>
              <span className="shrink-0 text-right">
                <span className="num block font-semibold text-accent">{p.text}</span>
                <span className="block text-[11px] text-slate-500">{p.note}</span>
              </span>
              {ebayBtn(cardEbayQuery(card), label)}
            </li>
          );
        })}
        {sealed.map((s) => {
          const p = price(s);
          return (
            <li key={`s-${s.id}`} className={row}>
              <Link href={`/sealed/${s.slug}`} className="group flex min-w-0 flex-1 basis-56 items-center gap-3">
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.imageUrl.replace("_in_1000x1000", "_200w")} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded-sm bg-white object-contain" />
                ) : (
                  <span className="h-14 w-10 shrink-0 rounded-sm bg-ink-800" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-white group-hover:text-brand-400">{s.name}</span>
                  <span className="block truncate text-xs text-slate-500">{s.kind}</span>
                </span>
              </Link>
              <span className="shrink-0 text-right">
                <span className="num block font-semibold text-accent">{p.text}</span>
                <span className="block text-[11px] text-slate-500">{p.note}</span>
              </span>
              {ebayBtn(onePieceEbayQuery(s.name), s.name)}
            </li>
          );
        })}
      </ul>
      <div className="border-t border-ink-800 px-4 py-2.5 sm:px-5">
        <p className="text-[11px] leading-snug text-slate-500">
          Prices are the cheapest in-stock listing we track in {c.place} (item price, before postage), or TCGplayer&apos;s market price (≈) where no {c.adjective} store has it. The eBay
          buttons are paid links that search {ebayLabel(country)}; we may earn a commission at no cost to you. Check seller ratings before buying.
        </p>
      </div>
    </section>
  );
}
