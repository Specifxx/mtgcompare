import type { Metadata } from "next";
import { lineOfSet, setLabel } from "@/lib/lines";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { byValue, priceOf, productsInSet, refCents, setBySlug, sets, summaryOf } from "@/lib/data";
import { preorderSetList, rarityHref, sealedInSet } from "@/lib/hubs";
import { isPreorder, preorderPath } from "@/lib/preorders";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { money, pct } from "@/lib/format";
import { shortName } from "@/lib/names";
import { TileGrid } from "@/components/ProductTile";
import { EbayCardStrip, TcgplayerCardStrip } from "@/components/CardAds";
import { adSearch, cardAds } from "@/lib/card-ads";
import { JsonLd } from "@/components/JsonLd";
import { abs } from "@/lib/site";
import { fitTitle, setTitleCandidates } from "@/lib/seo-title";
import { postsAbout } from "@/lib/posts";
import { imageAt } from "@/lib/image";
import { SealedQuickBuy } from "@/components/SealedQuickBuy";

export const revalidate = 86400; // data only changes with a release (DECISIONS.md, "Vercel cost")
// Empty list = nothing prerendered at build, but each page is cached (ISR)
// after its first visit instead of rendering on every request.
export const generateStaticParams = () => [];

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const s = setBySlug(params.slug);
  if (!s) return {};
  // List intent first, prices second, as on Rift Compare's set pages ("<set> card list" is the bigger query).
  const count = productsInSet(s.id).filter((p) => p.kind === "card").length;
  const spoilers = !!s.upcoming && count > 0;
  const title = fitTitle(setTitleCandidates(setLabel(s), count, spoilers));
  return {
    title,
    description: spoilers
      ? `Every ${s.name} card revealed so far (${count} and counting), with pre-order prices as stores list them${s.releasedOn ? `. Releases ${s.releasedOn}` : ""}. Updated daily as new spoilers land.`
      : `${count > 0 ? `All ${count} ${s.name} cards` : `The ${s.name} card list`} with prices: the most valuable cards, every card's TCGplayer market price, and the cheapest store and eBay listings. Updated daily.`,
    ...canon(`/sets/${s.slug}`),
    openGraph: { ...canon(`/sets/${s.slug}`).openGraph, title: title.absolute },
  };
}

export default function SetPage({ params }: { params: { slug: string } }) {
  const s = setBySlug(params.slug);
  if (!s) notFound();
  const all = byValue(productsInSet(s.id));
  const cards = all.filter((p) => p.kind === "card");
  const sealed = all.filter((p) => p.kind === "sealed");
  const value = cards.reduce((a, p) => a + (refCents(p.id) ?? 0), 0);
  const rarityOrder = (r: string | null) => { const i = SITE.rarityOrder.indexOf(r ?? ""); return i < 0 ? 99 : i; };
  const byNumber = cards.slice();
  // A multi-game site walks and suggests sets of the same game.
  const listed = sets().filter((x) => x.productCount > 0 && x.line === s.line);
  const game = lineOfSet(s);
  const i = listed.findIndex((x) => x.id === s.id);
  const newer = i > 0 ? listed[i - 1] : null;
  const older = i >= 0 && i < listed.length - 1 ? listed[i + 1] : null;
  const others = listed.filter((x) => x.id !== s.id && x.productCount > 20).slice(0, 12);
  const guides = postsAbout([s.name, s.code]).slice(0, 4);
  return (
    <div className="flex flex-col gap-8">
      {cards.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `${s.name} card list`,
            numberOfItems: cards.length,
            itemListElement: cards.slice(0, 30).map((p, i) => ({ "@type": "ListItem", position: i + 1, name: shortName(p.name), url: abs(`/card/${p.slug}`) })),
          }}
        />
      )}
      <div>
      <Breadcrumbs items={game ? [{ name: game.name, href: `/games/${game.slug}` }, { name: s.name }] : [{ name: "Sets", href: "/sets" }, { name: s.name }]} />
      <header>
        <p className="text-xs uppercase tracking-wide text-brand-400">{game && <Link href={`/games/${game.slug}`} className="game-chip mr-2" style={{ ["--game" as string]: game.color }}>{game.name}</Link>}{s.upcoming ? "Upcoming" : "Released"} {s.releasedOn}</p>
        <h1 className="font-display text-3xl font-black">{s.upcoming && cards.length > 0 ? <>{s.name} spoilers: every card revealed so far</> : <>{s.name} card list &amp; prices</>}</h1>
        <p className="mt-2 text-muted">{cards.length} cards · one of each is worth {money(value)} at TCGplayer market · {sealed.length} sealed products.</p>
        {preorderSetList().some((x) => x.id === s.id) && (
          <p className="mt-2"><Link className="link font-semibold" href={preorderPath(s)}>{isPreorder(s) ? `${s.name} pre-order prices at every store →` : `${s.name} booster box prices at every store →`}</Link></p>
        )}
      </header>
      </div>
      {/* Booster boxes first with a buy button each (components/SealedQuickBuy.tsx), before the card list. */}
      <SealedQuickBuy
        title={`Buy ${s.name} booster boxes and sealed`}
        items={sealedInSet(s.id).slice(0, 6).map((p) => ({ id: p.id, slug: p.slug, name: shortName(p.name), image: imageAt(p.image, "200w"), best: summaryOf(p.id).best, stores: summaryOf(p.id).listedSources }))}
      />
      {cards.length > 0 && (<section><h2 className="mb-3 text-xl font-bold">Most valuable {s.name} cards</h2><TileGrid items={cards.slice(0, 18)} /></section>)}
      <EbayCardStrip ads={{ ebay: cardAds({ setId: s.id, fill: true }).ebay }} page="set" query={adSearch(s.name, s).ebayQuery} title={`${s.name} & more on eBay right now`} />
      {sealed.length > 0 && (<section><h2 className="mb-3 text-xl font-bold">{s.name} booster boxes and sealed</h2><TileGrid items={sealed.slice(0, 12)} /></section>)}
      <TcgplayerCardStrip ads={{ tcgplayer: cardAds({ setId: s.id, fill: true }).tcgplayer }} page="set" searchUrl={adSearch(s.name, s).tcgplayerUrl} title={`Shop ${s.name} & more on TCGplayer`} />
      {cards.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold">Full {s.name} card list with prices</h2>
          <div className="overflow-x-auto rounded-xl border border-ink-700/60">
            <table className="w-full text-sm">
              <thead className="bg-ink-850 text-left text-xs uppercase text-muted"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Card</th><th className="px-3 py-2">Rarity</th><th className="px-3 py-2 text-right">Market</th><th className="px-3 py-2 text-right">7d</th><th className="px-3 py-2 text-right">Stores</th></tr></thead>
              <tbody>
                {byNumber.sort((a, b) => rarityOrder(a.rarity) - rarityOrder(b.rarity) || (parseInt(a.number ?? "") || 0) - (parseInt(b.number ?? "") || 0)).map((p) => {
                  const e = priceOf(p.id);
                  return (
                    <tr key={p.id} className="border-t border-ink-800">
                      <td className="px-3 py-1.5 text-muted">{p.number}</td>
                      <td className="px-3 py-1.5"><Link className="hover:underline" href={`/card/${p.slug}`}>{shortName(p.name)}</Link></td>
                      <td className="px-3 py-1.5 text-muted">{rarityHref(p.rarity) ? <Link className="hover:underline" href={rarityHref(p.rarity)!}>{p.rarity}</Link> : p.rarity}</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{money(refCents(p.id))}</td>
                      <td className={`px-3 py-1.5 text-right ${(e.change7d ?? 0) >= 0 ? "text-up" : "text-down"}`}>{pct(e.change7d)}</td>
                      <td className="px-3 py-1.5 text-right text-muted">{new Set(e.offers.filter((o) => o.inStock).map((o) => o.source)).size}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {guides.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">{s.name} guides</h2>
          <ul className="list-disc pl-5 text-sm">{guides.map((g) => <li key={g.slug}><Link className="link" href={`/blog/${g.slug}`}>{g.title}</Link></li>)}</ul>
        </section>
      )}
      <nav className="flex flex-wrap justify-between gap-3 text-sm" aria-label="Neighbouring sets">
        {older ? <Link className="link" href={`/sets/${older.slug}`}>← {older.name}</Link> : <span />}
        {newer && <Link className="link" href={`/sets/${newer.slug}`}>{newer.name} →</Link>}
      </nav>
      {others.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Other {SITE.gameShort} card lists</h2>
          <div className="flex flex-wrap gap-2">{others.map((x) => <Link key={x.id} href={`/sets/${x.slug}`} className="chip hover:border-brand">{x.name}</Link>)}</div>
        </section>
      )}
    </div>
  );
}
