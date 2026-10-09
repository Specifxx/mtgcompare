import type { Metadata } from "next";
import Link from "next/link";
import { getBoxPools, getSealedAll, getSealedDetail, getSets } from "@/lib/data";
import type { CardMini } from "@/lib/data/types";
import { SITE_URL } from "@/lib/site";
import { MARKETS } from "@/lib/country";
import { affiliateUrl } from "@/lib/affiliate";
import { sourceLabel, storeForSource } from "@/lib/stores";
import { pageOg } from "@/lib/og/meta";
import { BoxEvCalculator, type BoxEvBooster, type BoxEvOffers, type BoxEvSet, type PullCard } from "@/components/BoxEvCalculator";
import { BOOSTER_SET_KINDS, cheapestBoxOffer, defaultBoxSet, isReleased, poolOf, POOL_ORDER, type PoolKey } from "@/lib/box-ev";
import { boosterTypeOf } from "@/lib/pack-composition";
import { HubIntro } from "@/components/HubIntro";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";

// ─────────────────────────────────────────────────────────────────────────────
// /tools/box-ev: what is a sealed box actually worth if you open it?
// ─────────────────────────────────────────────────────────────────────────────
// Rendered per request (it reads the published data, so never at build) and cached by the CDN. Nothing here reads the country cookie: every card is valued in USD
// and the CLIENT converts to the viewer's currency, so one render serves
// every visitor and every crawler. Every read is a published-file loader
// (getSets, getSealedAll, getBoxPools, getSealedDetail), called at the top
// level of the page and never inside a cache.
export const dynamic = "force-dynamic";   // reads the published data: never at build

const TITLE = "Magic: The Gathering Booster Box EV Calculator | MTG Compare";
const DESCRIPTION =
  "Expected value of a Magic: The Gathering Play Booster or Draft Booster box, from real TCGplayer prices, with the booster structure Wizards of the Coast publishes. Borderless, extended art, showcase and special foil pulls sit in their own pools, and you can tune every rate.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "Magic the Gathering box EV",
    "Play Booster box value",
    "is a Play Booster box worth it",
    "MTG expected value",
    "TCG box EV calculator",
  ],
  alternates: { canonical: "/tools/box-ev" },
  openGraph: pageOg("/tools/box-ev", { title: "Magic: The Gathering Booster Box EV Calculator", description: "Expected value per box from real market prices: is opening worth it?" }),
};

// How many cards per pool to ship for the visual "what you're chasing" grid.
// Capped hard: the POOLS are computed from every card, but only a handful get a
// picture. The grid's job is to show the top of each pool, not all of it.
const GRID_PER_POOL = 8;
/** The newest sets only: a pool read is one board file per set, and the calculator is about boxes people can still buy. */
const MAX_SETS = 40;

export default async function BoxEvPage() {
  const [allSets, sealed] = await Promise.all([getSets().catch(() => []), getSealedAll().catch(() => [])]);

  // The sets a box can be opened from: expansion, core and masters sets with a
  // Booster Box whose booster type has a published structure (Play, Draft).
  // Newest first, as /sealed lists them.
  const boxesBySet = new Map<number, typeof sealed>();
  for (const s of sealed) {
    if (s.kind !== "Booster Box" || s.setId == null || !boosterTypeOf(s.name)) continue;
    const list = boxesBySet.get(s.setId) ?? [];
    list.push(s);
    boxesBySet.set(s.setId, list);
  }
  const boxSets = allSets
    .filter((s) => BOOSTER_SET_KINDS.has(s.kind) && boxesBySet.has(s.id))
    .sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? ""))
    .slice(0, MAX_SETS);

  // Aggregate per set, per pool, in USD cents end to end (the TCGplayer US
  // market price of the card's headline finish); the single conversion happens
  // in the browser. A low-only card (no market price) counts as unpriced.
  type Cell = { sum: number; priced: number; total: number; top: number; cards: PullCard[] };
  const poolsOfSet = await Promise.all(boxSets.map((s) => getBoxPools(s.id).catch(() => [] as CardMini[])));
  const bySet = new Map<number, Map<PoolKey, Cell>>();
  boxSets.forEach((set, i) => {
    const pools = new Map<PoolKey, Cell>();
    for (const c of poolsOfSet[i]!) {
      const pool = poolOf(c);
      if (!pool) continue;
      const cell = pools.get(pool) ?? { sum: 0, priced: 0, total: 0, top: 0, cards: [] };
      cell.total += 1;
      const usd = c.marketUsd;
      if (usd != null && usd > 0) {
        cell.sum += usd;
        cell.priced += 1;
        if (usd > cell.top) cell.top = usd;
      }
      cell.cards.push({ id: c.id, slug: c.slug, name: c.name, rarity: c.rarity, number: c.number, label: c.label, usdCents: usd, hasImage: true });
      pools.set(pool, cell);
    }
    if (pools.size) bySet.set(set.id, pools);
  });

  // "Released" is judged on the day of the request (UTC), here, so the picker's
  // labels and the opening set hydrate exactly as rendered.
  const today = new Date().toISOString().slice(0, 10);
  const sets: BoxEvSet[] = boxSets
    .filter((s) => bySet.has(s.id))
    .map((s) => {
      const pools = bySet.get(s.id)!;
      const boosters: BoxEvBooster[] = [];
      for (const b of boxesBySet.get(s.id)!) {
        const type = boosterTypeOf(b.name)!;
        if (boosters.some((x) => x.key === type.key)) continue;
        boosters.push({ key: type.key, packs: b.packCount != null && b.packCount > 1 ? b.packCount : type.defaultPacks });
      }
      return {
        setCode: s.code.toUpperCase(),
        setSlug: s.slug,
        setName: s.name,
        releasedOn: s.releasedOn,
        released: isReleased(s.releasedOn, today),
        boosters,
        pools: POOL_ORDER.filter((p) => pools.has(p)).map((pool) => {
          const cell = pools.get(pool)!;
          return {
            pool,
            avgUsdCents: cell.total > 0 ? Math.round(cell.sum / cell.total) : 0,
            topUsdCents: cell.top,
            priced: cell.priced,
            total: cell.total,
            // Most valuable first: the grid answers "what am I actually chasing".
            top: [...cell.cards].sort((a, b) => (b.usdCents ?? 0) - (a.usdCents ?? 0)).slice(0, GRID_PER_POOL),
          };
        }),
      };
    });

  // The cheapest in-stock tracked-store Booster Box per set, per market, to
  // start the price field from (the calculator picks the visitor's market after
  // mount). Only sets x markets small objects reach the client.
  const boxOffers: BoxEvOffers = {};
  await Promise.all(
    sets.map(async (s) => {
      const set = boxSets.find((b) => b.slug === s.setSlug)!;
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
    name: "Magic: The Gathering Booster Box EV Calculator",
    url: `${SITE_URL}/tools/box-ev`,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    // USD, not the viewer's currency. The tool is free and the price basis is
    // USD; naming a converted currency here would imply a converted price.
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description:
      "Free Magic: The Gathering booster box expected-value calculator: values every card at its TCGplayer market price, uses the booster structure Wizards of the Coast publishes, keeps borderless, extended art, showcase and special foil pulls in their own pools, and lets you tune every rate.",
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
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Magic: The Gathering Booster Box EV Calculator</h1>
        <HubIntro path="/tools/box-ev" />
      </div>

      {sets.length === 0 ? (
        // Fails open: a failed file read renders an explanation, never a 500 on an
        // indexed page.
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-base font-semibold text-white">Price data is still warming up</p>
            <p className="mt-1 text-sm">
              This tool runs off the market prices our import reads once a day. Check back shortly, or{" "}
              <Link href="/browse" className="text-brand-400 hover:underline">browse cards</Link> meanwhile.
            </p>
          </div>
        </div>
      ) : (
        // Opens on the newest RELEASED set with a computed EV, never on a set not out yet (lib/box-ev.ts defaultBoxSet).
        <BoxEvCalculator sets={sets} offers={boxOffers} initialSetCode={defaultBoxSet(sets)?.setCode} />
      )}

      {/* The guide behind the number, after the calculator. */}
      <RelatedGuides guides={guidesForTool("/tools/box-ev")} className="card-surface mt-6 p-5" />

      <section className="card-surface mt-6 p-5">
        <h2 className="font-bold text-white">What EV can&apos;t tell you</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Chase treatments are counted on purpose: a borderless or serialized mythic is rare enough that it barely moves a
          per-pack average, but across a whole box it is a real share of what you paid for, and leaving it out
          understates every box. What the number can&apos;t tell you is whether <em>your</em> box is worth opening. EV is an
          average across many boxes, and the distribution is brutally skewed — most boxes land under the average and
          a few land far over it, because that is exactly what a one-in-a-hundred-packs chase card does to a mean. It
          also assumes you could sell everything at market price, and bulk commons are close to unsellable in
          practice. Treat a box as entertainment with a partial refund, not an investment. If you want specific cards
          for a deck,{" "}
          <Link href="/browse" className="text-brand-400 hover:underline">buying the singles</Link> is almost
          always cheaper and always certain — and either way,{" "}
          <Link href="/sealed" className="text-brand-400 hover:underline">compare box prices</Link> before you buy.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Wizards of the Coast publishes the slot structure of its boosters, not a probability for every card. The
          calculator uses that structure and nothing else: a Play Booster&apos;s rare slot is a rare six times in
          seven and a mythic once, and the two wildcard slots, which can be any rarity and any treatment, are
          valued at zero until you give them a rate. Collector Boosters, Set Boosters and Jumpstart vary set by set
          and are not modelled; the sealed pages show what each product contains.
        </p>
      </section>
    </div>
  );
}
