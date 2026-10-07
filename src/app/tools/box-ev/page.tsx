import type { Metadata } from "next";
import Link from "next/link";
import { getCatalog, getSealedCatalog, getSealedDetail } from "@/lib/data";
import { SITE_URL } from "@/lib/site";
import { MARKETS } from "@/lib/country";
import { affiliateUrl } from "@/lib/affiliate";
import { sourceLabel, storeForSource } from "@/lib/stores";
import { pageOg } from "@/lib/og/meta";
import { BoxEvCalculator, type BoxEvOffers, type BoxEvSet, type PullCard } from "@/components/BoxEvCalculator";
import { BOOSTER_SET_KINDS, cheapestBoxOffer, poolOf, POOL_ORDER, type PoolKey } from "@/lib/box-ev";
import { PACKS_PER_BOX } from "@/lib/pack-composition";
import { HubIntro } from "@/components/HubIntro";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";

// ─────────────────────────────────────────────────────────────────────────────
// /tools/box-ev — what is a sealed box actually worth if you open it?
// (RiftCompare's /tools/box-ev, for One Piece; it replaces /tools/box-value,
// which summed one copy of every printing in a set — next.config.js redirects.)
// ─────────────────────────────────────────────────────────────────────────────
// REAL ISR. Nothing here reads the country cookie: every card is valued in USD
// and the CLIENT converts to the viewer's currency, so one cached render serves
// every visitor and every crawler. Every read is a cached data.ts loader
// (getCatalog, getSealedCatalog, getSealedDetail), called at the top level of
// the page and never inside another cache.
export const revalidate = 86400;

const TITLE = "One Piece Booster Box EV Calculator | OP Compare";
const DESCRIPTION =
  "Expected value of a One Piece Card Game booster box, from real TCGplayer prices — including Manga, SP, Treasure Rare and Parallel chase pulls. The pull rates are community estimates, set low, and you can tune every one.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "One Piece box EV",
    "One Piece booster box value",
    "is a One Piece booster box worth it",
    "One Piece TCG expected value",
    "TCG box EV calculator",
  ],
  alternates: { canonical: "/tools/box-ev" },
  openGraph: pageOg("/tools/box-ev", { title: "One Piece Booster Box EV Calculator", description: "Expected value per box from real market prices — is opening worth it?" }),
};

// How many cards per pool to ship for the visual "what you're chasing" grid.
// Capped hard: the POOLS are computed from every card, but only a handful get a
// picture. The grid's job is to show the top of each pool, not all of it.
const GRID_PER_POOL = 8;

export default async function BoxEvPage() {
  const [cat, sealed] = await Promise.all([getCatalog().catch(() => null), getSealedCatalog().catch(() => [])]);

  // The sets a box can be opened from: booster, extra and premium booster sets
  // with a Booster Box in the catalogue (starter decks and collections are fixed
  // products). Newest first, as /sealed lists them.
  const boxesBySet = new Map<number, typeof sealed>();
  for (const s of sealed) {
    if (s.kind !== "Booster Box" || s.setId == null) continue;
    const list = boxesBySet.get(s.setId) ?? [];
    list.push(s);
    boxesBySet.set(s.setId, list);
  }
  const boxSets = (cat?.sets ?? [])
    .filter((s) => BOOSTER_SET_KINDS.has(s.kind) && boxesBySet.has(s.id))
    .sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? ""));

  // Aggregate per set, per pool, in USD cents end to end (Card.marketUsd, the
  // TCGplayer US market price); the single conversion happens in the browser.
  type Cell = { sum: number; priced: number; total: number; top: number; cards: PullCard[] };
  const bySet = new Map<number, Map<PoolKey, Cell>>();
  const wanted = new Set(boxSets.map((s) => s.id));
  for (const c of cat?.cards ?? []) {
    if (!wanted.has(c.setId)) continue;
    const pool = poolOf(c);
    if (!pool) continue;
    const pools = bySet.get(c.setId) ?? new Map<PoolKey, Cell>();
    bySet.set(c.setId, pools);
    const cell = pools.get(pool) ?? { sum: 0, priced: 0, total: 0, top: 0, cards: [] };
    cell.total += 1;
    const usd = c.marketUsd;
    if (usd != null && usd > 0) {
      cell.sum += usd;
      cell.priced += 1;
      if (usd > cell.top) cell.top = usd;
    }
    cell.cards.push({ id: c.id, slug: c.slug, name: c.name, rarity: c.rarity, number: c.number, usdCents: usd, hasImage: c.hasImage });
    pools.set(pool, cell);
  }

  const sets: BoxEvSet[] = boxSets
    .filter((s) => bySet.has(s.id))
    .map((s) => {
      const pools = bySet.get(s.id)!;
      const box = boxesBySet.get(s.id)!.find((b) => b.packCount != null && b.packCount > 1);
      return {
        setCode: s.code,
        setSlug: s.slug,
        setName: s.name,
        packs: box?.packCount ?? PACKS_PER_BOX,
        pools: POOL_ORDER.filter((p) => pools.has(p)).map((pool) => {
          const cell = pools.get(pool)!;
          return {
            pool,
            avgUsdCents: cell.total > 0 ? Math.round(cell.sum / cell.total) : 0,
            topUsdCents: cell.top,
            priced: cell.priced,
            total: cell.total,
            // Most valuable first — the grid answers "what am I actually chasing".
            top: [...cell.cards].sort((a, b) => (b.usdCents ?? 0) - (a.usdCents ?? 0)).slice(0, GRID_PER_POOL),
          };
        }),
      };
    });

  // The cheapest in-stock tracked-store Booster Box per set, per market, to
  // start the price field from (the calculator picks the visitor's market after
  // mount). getSealedDetail caches itself; it is called here, at the top level,
  // never inside another cache. Only sets × markets small objects reach the client.
  const boxOffers: BoxEvOffers = {};
  await Promise.all(
    sets.map(async (s) => {
      const set = boxSets.find((b) => b.code === s.setCode)!;
      const details = await Promise.all(boxesBySet.get(set.id)!.map((b) => getSealedDetail(b.slug).catch(() => null)));
      const offers = details.flatMap((d) => (d ? d.offers.map((o) => ({ ...o, boxSlug: d.slug })) : []));
      for (const market of MARKETS) {
        const o = cheapestBoxOffer(offers, market);
        if (!o) continue;
        const retailer = storeForSource(o.source)?.key ?? o.source;
        (boxOffers[s.setCode] ??= {})[market] = {
          priceCents: o.priceCents,
          retailer,
          retailerName: sourceLabel(o.source, market),
          href: affiliateUrl(o.url, retailer, "/tools/box-ev"),
          boxSlug: o.boxSlug,
        };
      }
    }),
  );

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Box EV Calculator", item: `${SITE_URL}/tools/box-ev` },
    ],
  };
  const appLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "One Piece Booster Box EV Calculator",
    url: `${SITE_URL}/tools/box-ev`,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    // USD, not the viewer's currency. The tool is free and the price basis is
    // USD; naming a converted currency here would imply a converted price.
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description:
      "Free One Piece Card Game booster box expected-value calculator: values every card at its TCGplayer market price, includes Manga, SP, Treasure Rare and Parallel chase pulls, and lets you tune the community pull-rate estimates.",
  };

  return (
    <div className="mx-auto max-w-4xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, appLd]) }} />

      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <Link href="/tools" className="hover:text-slate-300">Tools</Link>
          <span>/</span>
          <span className="text-slate-300">Box EV Calculator</span>
        </nav>
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">One Piece Booster Box EV Calculator</h1>
        <HubIntro path="/tools/box-ev" />
      </div>

      {sets.length === 0 ? (
        // Fails open: a DB blip renders an explanation, never a 500 on an
        // indexed page.
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-base font-semibold text-white">Price data is still warming up</p>
            <p className="mt-1 text-sm">
              This tool runs off the market prices our import reads twice a day. Check back shortly, or{" "}
              <Link href="/browse" className="text-brand-400 hover:underline">browse cards</Link> meanwhile.
            </p>
          </div>
        </div>
      ) : (
        <BoxEvCalculator sets={sets} offers={boxOffers} />
      )}

      {/* The guide behind the number, after the calculator. */}
      <RelatedGuides guides={guidesForTool("/tools/box-ev")} className="card-surface mt-6 p-5" />

      <section className="card-surface mt-6 p-5">
        <h2 className="font-bold text-white">What EV can&apos;t tell you</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Chase prints are counted on purpose: a Manga or SP card is rare enough that it barely moves a per-pack
          average, but across a whole box it is a real share of what you paid for, and leaving it out understates
          every box. What the number can&apos;t tell you is whether <em>your</em> box is worth opening. EV is an
          average across many boxes, and the distribution is brutally skewed — most boxes land under the average and
          a few land far over it, because that is exactly what a one-in-several-cases chase card does to a mean. It
          also assumes you could sell everything at market price, and bulk commons are close to unsellable in
          practice. Treat a box as entertainment with a partial refund, not an investment. If you want specific cards
          for a deck,{" "}
          <Link href="/browse" className="text-brand-400 hover:underline">buying the singles</Link> is almost
          always cheaper and always certain — and either way,{" "}
          <Link href="/sealed" className="text-brand-400 hover:underline">compare box prices</Link> before you buy.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Bandai publishes no pull rates for the English game, so the rates above are what box and case openers
          report, and where they disagree we take the lower figure. If you know a set pulls differently, change the
          rate: the expected value follows.
        </p>
      </section>
    </div>
  );
}
