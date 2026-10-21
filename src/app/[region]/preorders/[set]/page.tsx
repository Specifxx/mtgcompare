import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import { Ago } from "@/components/Ago";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PreorderMarketplaces } from "@/components/Marketplaces";
import { OfferTable } from "@/components/OfferTable";
import { Empty, Section } from "@/components/Section";
import { lastCheckedAt, setMarketplaceOffers, setOfferGroups, setStoreReach, type SetOfferGroup, type UsMarketplaceOffer } from "@/lib/data";
import { cardOpen } from "@/lib/compact";
import { money, plural, relativeDay, timeAgo } from "@/lib/format";
import { packsForLabel, perPackCents } from "@/lib/packs";
import { COUNTRY_GUIDE } from "@/content/guides/country-prices";
import { titleText } from "@/lib/hub-copy";
import {
  cheapestStoreByType,
  cheapestStoreOffer,
  glanceFacts,
  msrpPerPack,
  msrpValueSentence,
  preorderDescription,
  preorderFaqs,
  preorderSummary,
  preorderTitle,
  reachLine,
  storeOffers,
  type GlanceFact,
  type PreorderSummary,
} from "@/lib/preorder-copy";
import { preorderOgPath } from "@/lib/preorder-og";
import { guideShowsMsrp, preorderGuideBySlug, type PreorderGuide } from "@/lib/preorder-guides";
import { formatRelease, isPreorderSet } from "@/lib/release";
import { regionOrNotFound, type RegionInfo } from "@/lib/regions";
import { RRP_NOTE, usMsrpCents } from "@/lib/rrp";
import { offerStock } from "@/lib/sealed-offers";
import { storesInMarket } from "@/lib/stores";
import { jsonLd, pageMeta, regionAlternates } from "@/lib/seo";
import { TYPE_BY_KEY, TYPE_BY_LABEL } from "@/lib/sealed-title";
import { type PokemonSet } from "@/lib/sets";
import { SITE_URL } from "@/lib/site";

// ─────────────────────────────────────────────────────────────────────────────
// /<region>/preorders/<set> — the same box, at every store, before it ships.
// ─────────────────────────────────────────────────────────────────────────────
// Ported from Rift Compare's /radiance-preorders (its biggest pre-release
// landing page). Pre-order is the one window where the product is identical at
// every store (nobody has opened one), so price is the only variable, and the
// spread between stores is at its widest.
//
// EVERY PRICE HERE IS A PRE-ORDER, and the page says so in the heading, on each
// row (StockPill "Pre-order") and in its structured data (schema.org PreOrder,
// never InStock). A set is a pre-order until its lib/sets.ts releaseDate
// (isPreorderSet): from release day this page says the set is out, points at the
// set page, is noindexed and leaves the sitemap — it retires itself.
//
// The facts (dates, contents) are lib/preorder-guides.ts's, sourced and dated;
// US MSRP is lib/rrp.ts's and printed on the US page only, as everywhere else.
// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

type Params = { params: { region: string; set: string } };

const getGroups = cache((market: RegionInfo["market"], setCode: string) => setOfferGroups(market, setCode));

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const r = regionOrNotFound(params.region);
  const found = preorderGuideBySlug(params.set);
  if (!found) return {};
  const { guide, set } = found;
  const pre = isPreorderSet(set.code);
  // The title and description lead with the release date as well as the pre-order prices: "delta reign release date" is the
  // search people make before they pre-order (lib/preorder-copy.ts).
  const title = preorderTitle(set, r, pre);
  return {
    ...pageMeta({
      title: titleText(title),
      description: preorderDescription(set, guide, r, pre),
      path: `/${r.region}/preorders/${set.slug}`,
      // Every region's copy carries the facts, the dates and that market's price
      // lists, so all seven are advertised while the set is upcoming.
      alternates: pre ? regionAlternates(r.region, `/preorders/${set.slug}`) : undefined,
      // Its own share card (app/og/preorders/[set]): the date, the set and its products, the same image in every region.
      image: `${SITE_URL}${preorderOgPath(set.slug)}`,
      noindex: !pre,
    }),
    title,
  };
}

export default async function PreorderPage({ params }: Params) {
  const r = regionOrNotFound(params.region);
  const found = preorderGuideBySlug(params.set);
  if (!found) notFound();
  const { guide, set } = found;
  const pre = isPreorderSet(set.code);
  const us = r.market === "US";
  // Three scoped reads while the set is upcoming: the market's price lists (setOfferGroups), outside the US the set's TCGplayer offers
  // in US$ for the marketplace rows (≤ 30 rows), and the set's reach across every market (one GROUP BY by store).
  const [groups, checked, tcgOffers, reach] = await Promise.all([
    pre ? getGroups(r.market, set.code) : Promise.resolve([]),
    lastCheckedAt(r.market),
    pre && !us ? setMarketplaceOffers(set.code) : Promise.resolve(new Map<string, UsMarketplaceOffer>()),
    pre ? setStoreReach(set.code) : Promise.resolve(null),
  ]);
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const listed = groups.filter((g) => g.offers.length > 0);
  const open = listed.filter((g) => cardOpen(g.product));
  // The FAQ's live answers and the summary strip: the cheapest open STORE pre-order of each type and who has it, from the price lists
  // this page renders (no extra read). TCGplayer is a marketplace row, never the "cheapest store".
  const FAQS = preorderFaqs(set, guide, r, cheapestStoreByType(listed, now), pre);
  const summary = preorderSummary(listed, storesInMarket(r.market).length, set, today, now);
  const reachText = reachLine(set, reach);
  const msrpRows = msrpPerPack(set, guide, r);
  const path = `/${r.region}/preorders/${set.slug}`;

  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${set.name} pre-order prices in ${r.name}`,
      url: `${SITE_URL}${path}`,
    },
    // PreOrder availability, never InStock: none of this has shipped.
    ...(open.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `Pokémon ${set.name} pre-orders in ${r.name}`,
            url: `${SITE_URL}${path}`,
            itemListElement: open.slice(0, 30).map((g, i) => ({
              "@type": "ListItem",
              position: i + 1,
              item: {
                "@type": "Product",
                name: g.product.name,
                url: `${SITE_URL}/${r.region}/p/${g.product.slug}`,
                ...(g.product.imageUrl ? { image: g.product.imageUrl } : {}),
                offers: {
                  "@type": "AggregateOffer",
                  availability: "https://schema.org/PreOrder",
                  priceCurrency: r.currency,
                  lowPrice: ((g.product.lowestPriceCents ?? 0) / 100).toFixed(2),
                  offerCount: g.offers.filter((o) => offerStock(o, now) === "open").length,
                },
              },
            })),
          },
        ]
      : []),
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { href: `/${r.region}/releases`, label: "Releases" }, { label: `${set.name} pre-orders` }]} />

      <span className="inline-flex rounded-full bg-pre-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-pre">
        {pre ? `Pre-order · releases ${formatRelease(set.releaseDate)}` : `Released ${formatRelease(set.releaseDate)}`}
      </span>
      <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        Pokémon {set.name} pre-order prices in {r.name}
      </h1>
      {pre ? (
        <p className="mt-2 max-w-2xl text-muted">
          {guide.fullName} is out {relativeDay(set.releaseDate, today)}, so every store is picking its own opening price — and they pick very different
          ones. Below is every {set.name} product {r.adjective} stores we track are taking pre-orders on, each with its stores cheapest first, in{" "}
          {r.currency}.
          {checked && (
            <>
              {" "}
              Prices checked <Ago iso={checked.toISOString()} initial={timeAgo(checked)} />.
            </>
          )}
        </p>
      ) : (
        <p className="mt-2 max-w-2xl text-muted">
          {set.name} has released, so its products are priced alongside every other set:{" "}
          <Link href={`/${r.region}/sets/${set.slug}`} prefetch={false} className="font-semibold text-brand hover:underline">
            see live {set.name} prices in {r.name}
          </Link>
          .
        </p>
      )}

      {pre && <SummaryStrip r={r} s={summary} reach={reachText} />}

      <ReleaseGlance set={set} facts={glanceFacts(set, guide)} today={today} />

      {pre && open.length > 0 && <AtAGlance r={r} groups={open} now={now} />}

      {pre &&
        (listed.length ? (
          <Section title={`${set.name} pre-orders by product`} kicker={`${plural(listed.length, "product")} listed in ${r.name}`}>
            <div className="grid gap-8">
              {listed.map((g) => (
                <ProductPrices key={g.product.slug} g={g} r={r} guide={guide} tcgplayer={us ? null : tcgOffers.get(g.product.slug) ?? null} now={now} />
              ))}
            </div>
            <p className="mt-4 max-w-3xl text-xs text-muted">
              Every price on this page is a pre-order: the product ships on or after {formatRelease(set.releaseDate)}. Sold-out rows are stores whose
              pre-order allocation has gone; they stay listed so you can see who had it.
            </p>
          </Section>
        ) : (
          <Section title={`No ${set.name} pre-orders in ${r.name} yet`}>
            <Empty>
              We list pre-orders as soon as the stores we track publish them, and none have appeared in {r.name} yet. This page fills in on its own
              — nothing here is ever an estimate or a placeholder price.{" "}
              <Link href={`/${r.region}/sealed`} prefetch={false} className="font-semibold text-brand hover:underline">
                Sealed you can buy today
              </Link>
            </Empty>
          </Section>
        ))}

      <Section title={`What each ${set.name} product is`} kicker={`${guide.cardCount} · headlined by ${guide.headliners[0]}`}>
        <p className="max-w-3xl text-sm text-muted">
          Stores list the same product under different names, so here is what is in each box. Contents are from The Pokémon Company&rsquo;s
          announcement{r.market === "US" ? "; list prices are TPCi's US MSRP" : ""}.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {guide.products.map((p) => {
            const t = TYPE_BY_KEY.get(p.type);
            const msrp = r.market === "US" && p.msrp !== false ? usMsrpCents(p.type, set.code) : null;
            const perPack = msrpRows.find((x) => x.type === p.type)?.perPack;
            return (
              <div key={p.type} className="card p-4">
                <dt className="font-semibold">{t?.label ?? p.type}</dt>
                {msrp != null && (
                  <dd className="mt-0.5 text-xs font-semibold text-pre">
                    US MSRP {money(msrp, "US")}
                    {perPack != null && <span className="font-normal text-muted"> · {money(perPack, "US")} a pack</span>}
                  </dd>
                )}
                <dd className="mt-1.5 text-sm leading-6 text-muted">{p.contents}.</dd>
                {p.type === "build-battle" && guide.prerelease && (
                  <dd className="mt-1.5 text-sm leading-6 text-muted">
                    The promos: {guide.prerelease.promos.slice(0, -1).join(", ")} or {guide.prerelease.promos.at(-1)} ({guide.prerelease.source}).{" "}
                    <Link href={`/${r.region}/guides/pokemon-build-and-battle-box`} prefetch={false} className="font-semibold text-brand hover:underline">
                      What’s in a Build & Battle Box →
                    </Link>
                  </dd>
                )}
              </div>
            );
          })}
        </dl>
        {msrpValueSentence(msrpRows) && <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">{msrpValueSentence(msrpRows)}</p>}
        {r.market === "US" && <p className="mt-3 text-xs text-muted">{RRP_NOTE}</p>}
      </Section>

      {guide.makeup.length > 0 && (
        <Section title={`What’s in ${set.name}`} kicker={`The set · ${guide.cardCount}`}>
          <div className="card max-w-3xl p-6 text-sm leading-6 text-muted">
            <p>
              Pokémon TCG: {guide.fullName} has {guide.cardCount}, headlined by {guide.headliners[0]}. It includes:
            </p>
            <ul className="mt-3 grid list-disc gap-1 pl-5">
              {guide.makeup.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            {guide.newFeature && (
              <p className="mt-4">
                <strong className="text-ink">New in this set: {guide.newFeature.name}.</strong> {guide.newFeature.text} ({guide.newFeature.source}).
              </p>
            )}
            <p className="mt-4 text-xs text-faint">Per {guide.makeupSource}.</p>
          </div>
        </Section>
      )}

      {pre && (
        <Section title={`When to pre-order ${set.name} — and when to wait`}>
          <div className="card max-w-3xl p-6 text-sm leading-6 text-muted">
            <p>
              Two dates move these prices before release.
              {guide.prereleaseFrom && (
                <>
                  {" "}
                  <strong className="text-ink">Prerelease events start {formatRelease(guide.prereleaseFrom)}</strong> at participating stores, which is
                  when the first {set.name} cards change hands and the chase cards get a price.
                </>
              )}{" "}
              Then <strong className="text-ink">{formatRelease(set.releaseDate)} is release day</strong>, when pre-orders ship and stores without an
              allocation start listing what they could get.
            </p>
            <ul className="mt-4 grid gap-2">
              <li>
                <strong className="text-ink">Want to open product?</strong> Pre-ordering is reasonable, because allocation — not price — is what runs
                out. The spread between the cheapest and dearest store above is the whole case for comparing first: it is the same sealed box
                either way.
              </li>
              <li>
                <strong className="text-ink">Want particular cards?</strong> Waiting is usually cheaper. Singles are at their most volatile around
                Prerelease and release week, when supply is a handful of opened boxes, and they typically settle a few weeks after release.
              </li>
              <li>
                <strong className="text-ink">Ordering from a store you haven&rsquo;t used?</strong> Read its pre-order terms before you pay: when it
                charges, whether it ships on release day, and what happens if its allocation is cut.
              </li>
            </ul>
            {guide.notes.map((n) => (
              <p key={n.text} className="mt-4">
                <strong className="text-ink">Reported:</strong> {n.text} ({n.source}).
              </p>
            ))}
            <p className="mt-4">
              We don&rsquo;t forecast prices and won&rsquo;t tell you the number is going up. What this page can tell you is what every store we
              track is asking right now, in your currency.{" "}
              <Link href={`/${r.region}/guides/how-to-preorder-pokemon-tcg`} prefetch={false} className="font-semibold text-brand hover:underline">
                How to pre-order Pokémon TCG sets →
              </Link>
            </p>
          </div>
        </Section>
      )}

      <div className="mt-10 flex flex-wrap gap-2 text-sm">
        <Link href={`/${r.region}/sets/${set.slug}`} prefetch={false} className="chip py-2">
          All {set.name} products
        </Link>
        <Link href={`/${r.region}/releases`} prefetch={false} className="chip py-2">
          Pokémon release calendar
        </Link>
        <Link href={`/${r.region}/type/booster-boxes`} prefetch={false} className="chip py-2">
          Booster boxes in stock
        </Link>
        <Link href={`/${r.region}/type/elite-trainer-boxes`} prefetch={false} className="chip py-2">
          Elite Trainer Boxes in stock
        </Link>
        <Link href={`/${r.region}/guides/pokemon-build-and-battle-box`} prefetch={false} className="chip py-2">
          Build &amp; Battle Box guide
        </Link>
        <Link href={COUNTRY_GUIDE.path} prefetch={false} className="chip py-2">
          Booster box prices by country
        </Link>
      </div>

      <section className="mt-14 max-w-3xl" aria-labelledby="faq">
        <h2 id="faq" className="font-display text-2xl font-bold tracking-tight sm:text-[28px]">
          Frequently asked questions
        </h2>
        <div className="mt-5 grid gap-3">
          {FAQS.map((f) => (
            <details key={f.q} className="card p-5">
              <summary className="cursor-pointer font-semibold">{f.q}</summary>
              <p className="mt-2 text-sm leading-6 text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="mt-8 max-w-3xl text-xs text-faint">
        Sources, checked {formatRelease(guide.checked)}:{" "}
        {guide.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && " · "}
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">
              {s.label}
            </a>
          </span>
        ))}
        .
      </p>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
    </div>
  );
}

/**
 * The release date at a glance, under the H1: the answer to "when does <set> come out", with the prerelease, Pokémon TCG Live and the
 * set's size (lib/preorder-copy.ts glanceFacts). Two columns on a phone, four from sm.
 */
function ReleaseGlance({ set, facts, today }: { set: PokemonSet; facts: GlanceFact[]; today: string }) {
  return (
    <section aria-labelledby="release-date" className="card mt-6 max-w-4xl p-4 sm:p-5">
      <h2 id="release-date" className="font-display text-lg font-bold tracking-tight">
        Pokémon {set.name} release date
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        {facts.map((f) => (
          <div key={f.key} className="min-w-0">
            <dt className="text-xs font-medium text-muted">{f.label}</dt>
            <dd className="mt-0.5 font-display text-base font-bold leading-snug text-ink sm:text-lg">
              {f.iso ? <time dateTime={f.iso}>{formatRelease(f.iso)}</time> : f.value}
            </dd>
            {(f.iso || f.note) && (
              <dd className="mt-0.5 text-xs leading-5 text-muted">
                {f.iso && relativeDay(f.iso, today).replace(/^./, (c) => c.toUpperCase())}
                {f.iso && f.note && " · "}
                {f.note}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}

/** One row per product: its cheapest pre-order, per pack where the pack count is fixed, and how many stores have it open. */
/** One row per product: its cheapest open STORE pre-order (never TCGplayer: it sits above the stores), per pack, and how many stores have it open. */
function AtAGlance({ r, groups, now }: { r: RegionInfo; groups: SetOfferGroup[]; now: number }) {
  return (
    <div className="card mt-6 overflow-hidden">
      <table className="w-full text-sm">
        <caption className="sr-only">Cheapest store pre-order per product</caption>
        <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-semibold">Product</th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">Cheapest store</th>
            <th scope="col" className="hidden px-4 py-2.5 text-right font-semibold sm:table-cell">Per pack</th>
            <th scope="col" className="hidden px-4 py-2.5 text-right font-semibold sm:table-cell">Stores</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {groups.map((g) => {
            const best = cheapestStoreOffer(g.offers, now);
            const packs = packsForLabel(g.product.productType, g.product.setCode, g.product.name);
            const perPack = best ? perPackCents(best.priceCents, packs) : null;
            return (
              <tr key={g.product.slug}>
                <th scope="row" className="px-4 py-2.5 text-left font-medium">
                  <a href={`#${g.product.slug}`} className="hover:text-brand">
                    {g.product.name}
                  </a>
                </th>
                <td className="tabular px-4 py-2.5 text-right font-semibold">
                  {best ? money(best.priceCents, r.market) : <span className="font-normal text-muted">{g.product.marketplaceOpen ? "TCGplayer only" : "—"}</span>}
                </td>
                <td className="tabular hidden px-4 py-2.5 text-right text-muted sm:table-cell">{perPack != null ? money(perPack, r.market) : "—"}</td>
                <td className="tabular hidden px-4 py-2.5 text-right text-muted sm:table-cell">{g.product.inStockStores}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The strip under the intro: the comparison in four numbers (stores checked in the market, how many take pre-orders, the cheapest booster
 * box pre-order and who has it, days to release), then the set's reach across every market. Every number is the page's own data or the
 * store registry (lib/preorder-copy.ts preorderSummary): it is what a link post quotes.
 */
function SummaryStrip({ r, s, reach }: { r: RegionInfo; s: PreorderSummary; reach: string | null }) {
  const tiles: { key: string; value: string; label: string }[] = [
    { key: "checked", value: s.storesChecked.toLocaleString("en"), label: `stores checked in ${r.inName}` },
    { key: "taking", value: s.taking.toLocaleString("en"), label: s.taking === 1 ? "store taking pre-orders" : "stores taking pre-orders" },
    {
      key: "box",
      value: s.cheapestBox ? money(s.cheapestBox.cents, r.market) : "—",
      label: s.cheapestBox
        ? `cheapest booster box, at ${s.cheapestBox.store}${s.cheapestBox.perPack != null ? ` (${money(s.cheapestBox.perPack, r.market)} a pack)` : ""}`
        : "no booster box pre-order open yet",
    },
    { key: "days", value: String(Math.max(0, s.days)), label: s.days === 1 ? "day to release" : "days to release" },
  ];
  return (
    <section aria-label="Pre-orders at a glance" className="mt-6 max-w-4xl">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {tiles.map((t) => (
          <div key={t.key} data-summary={t.key} className="flex min-w-0 flex-col-reverse justify-end rounded-xl border border-line bg-surface px-3.5 py-3">
            <dt className="mt-0.5 text-xs leading-4 text-muted">{t.label}</dt>
            <dd className="tabular font-display text-2xl font-extrabold leading-tight text-ink">{t.value}</dd>
          </div>
        ))}
      </dl>
      {reach && <p className="mt-2 text-xs text-muted">{reach}</p>}
    </section>
  );
}

/**
 * One product's price list: the pinned marketplace rows at the top (eBay's search, then TCGplayer: labelled, unnumbered, never compared),
 * then the stores alone, numbered by price (open pre-orders cheapest first, the cheapest marked), sold out and not checked last.
 */
function ProductPrices({ g, r, guide, tcgplayer, now }: { g: SetOfferGroup; r: RegionInfo; guide: PreorderGuide; tcgplayer: UsMarketplaceOffer | null; now: number }) {
  const type = TYPE_BY_LABEL.get(g.product.productType);
  const packs = packsForLabel(g.product.productType, g.product.setCode, g.product.name);
  const msrp = r.market === "US" && type && guideShowsMsrp(guide, type.key) ? usMsrpCents(type.key, guide.setCode) : null;
  const stores = storeOffers(g.offers, now);
  // In the US TCGplayer is one of the market's offers; elsewhere its US$ offer comes from the set's TCGplayer read (or none: a search).
  const tcg = r.market === "US" ? g.offers.find((o) => o.marketplace) ?? null : tcgplayer;
  return (
    <section id={g.product.slug} className="scroll-mt-24">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-display text-xl font-bold">
          <Link href={`/${r.region}/p/${g.product.slug}`} prefetch={false} className="hover:text-brand">
            {g.product.name}
          </Link>
        </h3>
        <span className="text-sm text-muted">
          {g.product.inStockStores
            ? `Pre-order open at ${plural(g.product.inStockStores, "store")}`
            : stores.length
              ? "Sold out at every store we track"
              : `No ${r.adjective} store we track lists it yet`}
          {msrp != null && ` · US MSRP ${money(msrp, "US")}`}
        </span>
      </div>
      <OfferTable
        offers={stores}
        region={r.region}
        preorder
        packs={packs}
        placement="preorders"
        numbered
        bestLabel={{ short: "Cheapest", full: "Cheapest store" }}
        ranked="Stores only: open pre-orders first, cheapest first."
        notes={["eBay and TCGplayer sit above the stores and are not ranked with them."]}
        top={
          <>
            <PreorderMarketplaces region={r.region} productName={g.product.name} tcgplayer={tcg} />
            <div className="flex items-center justify-between gap-3 border-b border-line bg-raised px-4 py-2 sm:px-5">
              <span className="eyebrow">Stores, cheapest first</span>
              <span className="text-[11px] text-muted">
                {plural(stores.length, "store")} {stores.length === 1 ? "lists" : "list"} it
              </span>
            </div>
            {stores.length === 0 && <p className="border-b border-line px-4 py-3 text-sm text-muted sm:px-5">No {r.adjective} store we track lists it yet.</p>}
          </>
        }
      />
    </section>
  );
}
