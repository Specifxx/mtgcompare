import Link from "next/link";
import { cache } from "react";
import type { Metadata } from "next";
import { Ago } from "@/components/Ago";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { NoPreFooter } from "@/components/Ebay";
import { EbayStrip } from "@/components/EbayStrip";
import { Icon } from "@/components/Icon";
import { Empty, Section } from "@/components/Section";
import { lastCheckedAt } from "@/lib/data";
import { fitTitle, nearestRegion, packsCopy, perPackLeaders, stockLabel, type PerPackRow } from "@/lib/deals";
import { money, plural, timeAgo } from "@/lib/format";
import { thumb } from "@/lib/images";
import { isPreorderSet } from "@/lib/release";
import { REGIONS, regionOrNotFound, type Market, type RegionInfo } from "@/lib/regions";
import { RRP_NOTE } from "@/lib/rrp";
import { TYPE_BY_LABEL } from "@/lib/sealed-title";
import { itemListJsonLd, jsonLd, pageMeta, regionAlternates } from "@/lib/seo";
import { SET_BY_CODE } from "@/lib/sets";

// /[region]/cheapest-packs: every product that holds a fixed number of booster packs, ranked by today's cheapest price ÷ its packs
// (packs.ts), overall and per type. One capped read (lib/deals.ts perPackLeaders: the 24 cheapest open products of each pack type, at
// most 192 rows); cached at the CDN until the next release. In the US, TPCi's MSRP per pack beside each row (rrp.ts, with RRP_NOTE).
// One eBay strip, after the overall table. Below sm each table row stacks into its product cell: no sideways scrolling at 320 px.

// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

const getLeaders = cache((market: Market) => perPackLeaders(market));

/** Rows shown per type (of the 24 read: price order is not quite per-pack order, since an ETB holds 8 to 11 packs). */
const PER_TYPE = 8;

export async function generateMetadata({ params }: { params: { region: string } }): Promise<Metadata> {
  const r = regionOrNotFound(params.region);
  const leaders = await getLeaders(r.market);
  return {
    ...pageMeta({
      title: packsCopy.title(r),
      description: packsCopy.description(r, leaders.top10[0] ?? null),
      path: `/${r.region}/cheapest-packs`,
      alternates: regionAlternates(r.region, "/cheapest-packs"),
      noindex: leaders.top10.length < 3,
    }),
    title: fitTitle(packsCopy.title(r)),
  };
}

export default async function CheapestPacksPage({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const us = r.market === "US";
  const [leaders, checked] = await Promise.all([getLeaders(r.market), lastCheckedAt(r.market)]);
  const best = leaders.top10[0] ?? null;
  const lede = packsCopy.lede(r);
  const other = REGIONS[nearestRegion(r.region)];
  const ranked = leaders.byType.flatMap((g) => g.rows).sort((a, b) => a.perPack - b.perPack || a.p.lowestPriceCents! - b.p.lowestPriceCents!);
  const groups = leaders.byType.map((g) => ({ ...g, info: TYPE_BY_LABEL.get(g.type), rows: g.rows.slice(0, PER_TYPE) }));

  // The page's one eBay unit, between the overall top ten and the per-type tables.
  const strip = <EbayStrip region={r.region} context="sealed" placement="listings-packs" search={{ kind: "sealed", query: "" }} />;
  // The slim strip above the footer stays only with well over a viewport of tables under this one (lib/ebay-ads.ts GAP is 960 px;
  // 1,500 also keeps the two units far inside the 25% density ceiling).
  const phoneBelow = 260 + groups.reduce((n, g) => n + 130 + g.rows.length * 74, 0);
  const deskBelow = 220 + groups.reduce((n, g) => n + 120 + g.rows.length * 50, 0);
  const room = best != null && phoneBelow >= 1500 && deskBelow >= 1500;

  const ld =
    ranked.length > 0
      ? itemListJsonLd({
          name: packsCopy.h1(r),
          path: `/${r.region}/cheapest-packs`,
          items: ranked.slice(0, 50).map((row) => ({ path: `/${r.region}/p/${row.p.slug}`, name: row.p.name, image: row.p.imageUrl })),
        })
      : null;

  return (
    <div className="page py-8">
      {!room && <NoPreFooter />}
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { label: "Cheapest per pack" }]} />
      <header className="max-w-3xl">
        <div className="eyebrow">Price per pack · {r.name}</div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{packsCopy.h1(r)}</h1>
        <p className="mt-3 leading-7 text-muted">
          {lede.lead} {checked ? <Ago iso={checked.toISOString()} initial={timeAgo(checked)} /> : "twice a day"}
          {lede.tail}
        </p>
      </header>

      {best ? (
        <>
          <Answer r={r} row={best} />
          <nav aria-label="On this page" className="scroller -mx-4 mt-6 gap-2 px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:[-webkit-mask-image:none] sm:[mask-image:none]">
            <a href="#top-10" className="chip min-h-10">
              Top 10
            </a>
            {groups.map((g) => (
              <a key={g.type} href={`#${g.info?.slug ?? g.type}`} className="chip min-h-10">
                {g.info?.plural ?? g.type}
              </a>
            ))}
          </nav>
          <Section id="top-10" title="Top 10 across every product type" kicker="Cheapest per pack first">
            <PackTable r={r} rows={leaders.top10} showType caption={`The ten cheapest Pokémon products per booster pack in ${r.inName} today`} />
            {us && <p className="mt-3 text-xs text-muted">{RRP_NOTE}</p>}
          </Section>
        </>
      ) : (
        <div className="mt-8">
          <Empty
            actions={[
              { href: `/${r.region}/sealed?stock=in`, label: "Everything in stock" },
              { href: `/${r.region}/releases`, label: "Pre-orders" },
              { href: `/${other.region}/cheapest-packs`, label: `Per pack in ${other.inName}` },
            ]}
          >
            No booster box, ETB, bundle or pack is in stock at a {r.adjective} store we track right now.
          </Empty>
        </div>
      )}

      <div className="mt-10">{strip}</div>

      {groups.map((g) => {
        const counts = [...new Set(g.rows.map((x) => x.packs))].sort((a, b) => a - b);
        const each = counts.length === 1 ? `${plural(counts[0], "pack")} each` : `${counts[0]}–${counts[counts.length - 1]} packs each`;
        const name = g.info?.plural ?? g.type;
        return (
          <Section
            key={g.type}
            id={g.info?.slug ?? g.type}
            title={`${name}: cheapest per pack`}
            kicker={each}
            href={g.info ? `/${r.region}/type/${g.info.slug}` : undefined}
            linkLabel={`All ${name}`}
          >
            <PackTable r={r} rows={g.rows} caption={`${name} in ${r.inName}, cheapest per booster pack today`} />
          </Section>
        );
      })}

      <aside className="mt-14 rounded-xl border border-line bg-raised p-5 text-sm leading-6 text-muted sm:p-6" aria-labelledby="method">
        <h2 id="method" className="flex items-center gap-2 font-display text-base font-bold text-ink">
          <Icon name="info" size={18} /> How per pack is worked out
        </h2>
        <p className="mt-2">{packsCopy.method}</p>
        <p className="mt-2">
          Pack counts are the ones the product line fixes: 36 in a booster box, 6 in a booster bundle, 8 to 10 in an Elite Trainer Box depending on the
          series (9 from Scarlet &amp; Violet on), two more in a Pokémon Center ETB. Collections, tins and blisters whose count varies are left out
          rather than guessed. Each price is the cheapest {r.adjective} {us ? "store or TCGplayer seller" : "store"} listing today, in {r.currency}.
        </p>
        {us && <p className="mt-2">{RRP_NOTE}</p>}
      </aside>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />}
    </div>
  );
}

/** The one-line answer to "what is the cheapest way to buy packs here today?": the top row, with its picture. */
function Answer({ r, row }: { r: RegionInfo; row: PerPackRow }) {
  const img = thumb(row.p.imageUrl, 200);
  const pre = isPreorderSet(row.p.setCode);
  // A grid, so a phone gets picture · name · price on one row and the details under all three; from sm the details sit under the name.
  return (
    <Link
      href={`/${r.region}/p/${row.p.slug}`}
      prefetch={false}
      className="group card mt-6 grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-4 transition-shadow hover:shadow-lift sm:max-w-3xl sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:gap-x-5 sm:p-5"
    >
      <span className="plate flex h-14 w-14 items-center justify-center sm:row-span-2 sm:h-20 sm:w-20">
        {img ? <img src={img} alt="" width={80} height={80} decoding="async" fetchPriority="high" className="h-full w-full object-contain p-1.5" /> : <Icon name="tag" className="text-faint" />}
      </span>
      <span className="min-w-0 sm:self-end">
        <span className="eyebrow block text-open">
          Cheapest per pack<span className="hidden sm:inline"> today</span>
        </span>
        <span className="mt-0.5 block font-display text-base font-bold leading-snug group-hover:text-brand sm:text-xl">{row.p.name}</span>
      </span>
      <span className="text-right sm:row-span-2">
        <span className="tabular block font-display text-2xl font-extrabold sm:text-3xl">{money(row.perPack, r.market)}</span>
        <span className="block text-xs text-muted">a pack</span>
      </span>
      <span className="col-span-3 text-sm text-muted sm:col-span-1 sm:col-start-2 sm:self-start">
        {money(row.p.lowestPriceCents, r.market)} for {plural(row.packs, "pack")} · {stockLabel(row.p, pre)}
        {row.msrpPerPack != null && <> · US MSRP {money(row.msrpPerPack, r.market)} a pack</>}
      </span>
    </Link>
  );
}

// The table's cell styles live on the <table> (arbitrary variants keyed to a few marker classes), so a row carries only its
// content: the page has up to 74 rows, and repeating every cell's classes in the HTML and again in the RSC payload doubled its size.
//   c-sm / c-lg: a cell shown from sm / from lg (display:none below, so nothing is read twice); c-n: a number column;
//   c-sub: a small muted line under a cell's main content; c-pp: the per-pack cell, flush with the card's right edge.
const TABLE = [
  "w-full text-sm",
  "[&_th]:px-3 [&_th]:py-2.5 [&_th]:font-semibold",
  "[&_td]:py-3 [&_td]:pr-2 [&_td]:align-top sm:[&_td]:px-3 sm:[&_td]:align-middle [&_.c-pp]:pr-3",
  "[&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-raised",
  "[&_.c-sm]:hidden sm:[&_.c-sm]:table-cell [&_.c-lg]:hidden lg:[&_.c-lg]:table-cell",
  "[&_.c-n]:whitespace-nowrap [&_.c-n]:text-right [&_.c-n]:tabular-nums",
  "[&_.c-sub]:mt-0.5 [&_.c-sub]:text-xs [&_.c-sub]:font-normal [&_.c-sub]:text-muted",
].join(" ");

/**
 * A per-pack table. From lg every fact has its column; from sm the set, type, packs and stores fold into the product and price cells;
 * below sm a row is rank, the product cell (with price, packs and stores as lines under the name) and the per-pack price, so it never
 * scrolls sideways at 320 px.
 */
function PackTable({ r, rows, showType = false, caption }: { r: RegionInfo; rows: PerPackRow[]; showType?: boolean; caption: string }) {
  const us = r.market === "US";
  return (
    <div className="card overflow-hidden">
      <table className={TABLE}>
        <caption className="sr-only">{caption}</caption>
        <thead className="hidden border-b border-line bg-raised text-left text-xs uppercase tracking-wide text-muted sm:table-header-group">
          <tr>
            <th scope="col" className="w-12">
              #
            </th>
            <th scope="col">Product</th>
            <th scope="col" className="c-lg">
              Set
            </th>
            {showType && (
              <th scope="col" className="c-lg">
                Type
              </th>
            )}
            <th scope="col" className="c-n">
              Price
            </th>
            <th scope="col" className="c-lg c-n">
              Packs
            </th>
            <th scope="col" className="c-n">
              Per pack
            </th>
            {us && (
              <th scope="col" className="c-n">
                MSRP / pack
              </th>
            )}
            <th scope="col" className="c-lg">
              In stock at
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, i) => {
            const set = row.p.setCode ? SET_BY_CODE.get(row.p.setCode)?.name ?? null : null;
            const stock = stockLabel(row.p, isPreorderSet(row.p.setCode));
            const sub = [set, showType ? row.p.productType : null].filter(Boolean).join(" · ");
            const price = money(row.p.lowestPriceCents, r.market);
            const packs = plural(row.packs, "pack");
            const msrp = row.msrpPerPack != null ? money(row.msrpPerPack, r.market) : null;
            return (
              <tr key={row.p.slug}>
                <td className="w-10 pl-3 text-xs font-bold tabular-nums text-muted sm:w-12">
                  {i === 0 ? <span className="rounded-full bg-open-soft px-2 py-1 text-open">1</span> : i + 1}
                </td>
                <td>
                  {/* The whole cell is the link (on a phone it holds the row's facts: a tap target of 60 px and more, not one line of text). */}
                  <Link href={`/${r.region}/p/${row.p.slug}`} prefetch={false} className="group block">
                    <span className="line-clamp-2 font-semibold leading-snug group-hover:text-brand">{row.p.name}</span>
                    {sub && <span className="c-sub block lg:hidden">{sub}</span>}
                    <span className="c-sub block sm:hidden">
                      {price} for {packs}
                      {msrp && <> · MSRP {msrp}/pack</>}
                    </span>
                    <span className="c-sub block lg:hidden">{stock}</span>
                  </Link>
                </td>
                <td className="c-lg text-muted">{set ?? "—"}</td>
                {showType && <td className="c-lg text-muted">{row.p.productType}</td>}
                <td className="c-sm c-n">
                  {price}
                  <span className="c-sub block lg:hidden">{packs}</span>
                </td>
                <td className="c-lg c-n">{row.packs}</td>
                <td className="c-n c-pp">
                  <span className="font-display text-base font-bold">{money(row.perPack, r.market)}</span>
                  <span className="c-sub block sm:hidden">a pack</span>
                </td>
                {us && <td className="c-sm c-n text-muted">{msrp ?? "—"}</td>}
                <td className="c-lg text-muted">{stock}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
