import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import { AddToCalendar } from "@/components/AddToCalendar";
import { Ago } from "@/components/Ago";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { NoPreFooter, setSealedHighlight } from "@/components/Ebay";
import { EbayStrip } from "@/components/EbayStrip";
import { Icon } from "@/components/Icon";
import { OutboundLink } from "@/components/OutboundLink";
import { ProductGrid } from "@/components/ProductGrid";
import { Empty, Section } from "@/components/Section";
import { AFFILIATE_NOTE_SHORT, REL_SPONSORED, TCGPLAYER_RETAILER, tcgplayerSearchUrl } from "@/lib/affiliate";
import { lastCheckedAt, marketsWithSet, productsBySet, type ProductCardData } from "@/lib/data";
import { cardOpen } from "@/lib/compact";
import { gridPageHasRoomForFooter } from "@/lib/ebay-ads";
import { money, timeAgo } from "@/lib/format";
import { cheapestWayIn, prevNextSet, releaseChip, setDescription, setFacts, setIntro, setTitle, shortDate, titleText } from "@/lib/hub-copy";
import { thumb } from "@/lib/images";
import { cheapestPerPackByType, type PerPackPick } from "@/lib/per-pack";
import { isPreorderSet } from "@/lib/release";
import { preorderPath } from "@/lib/preorder-guides";
import { regionOfMarket, regionOrNotFound, type Market, type RegionInfo } from "@/lib/regions";
import { RRP_NOTE } from "@/lib/rrp";
import { itemListJsonLd, jsonLd, pageMeta, regionAlternates, withPokemon } from "@/lib/seo";
import { ShareButton } from "@/components/ShareButton";
import { PRODUCT_TYPES } from "@/lib/sealed-title";
import { SET_BY_SLUG, type PokemonSet } from "@/lib/sets";
import { SITE_URL } from "@/lib/site";

// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

const getProducts = cache((market: Market, setCode: string) => productsBySet(market, setCode));

// The strip above the footer only where the page is long enough for its two strips to stay under a quarter of it on a desktop
// (the §C4 density ceiling): from three rows of products, with the hero, the per-pack row and the about block around them.
const FOOTER_STRIP_MIN = 12;

export async function generateMetadata({ params }: { params: { region: string; set: string } }): Promise<Metadata> {
  const r = regionOrNotFound(params.region);
  const s = SET_BY_SLUG.get(params.set);
  if (!s) return {};
  const products = await getProducts(r.market, s.code);
  // Empty here: noindex, and no hreflang set. Otherwise advertise only the
  // regions that list the set (their copies are the indexable ones).
  const regions = products.length ? (await marketsWithSet(s.code)).map(regionOfMarket).filter((x): x is RegionInfo => !!x) : [];
  // The title follows the release state (pre-order wording and the date until the set is out; never "booster box" for a set sold
  // without one), and the description is built from the products loaded above. No image: the site's share card (pageMeta's default).
  const title = setTitle(s, r);
  return {
    ...pageMeta({
      title: titleText(title),
      description: setDescription(s, r, products),
      path: `/${r.region}/sets/${s.slug}`,
      alternates: products.length ? regionAlternates(r.region, `/sets/${s.slug}`, regions) : undefined,
      noindex: products.length === 0,
    }),
    title,
  };
}

export default async function SetPage({ params }: { params: { region: string; set: string } }) {
  const r = regionOrNotFound(params.region);
  const s = SET_BY_SLUG.get(params.set);
  if (!s) notFound();
  const [products, checked] = await Promise.all([getProducts(r.market, s.code), lastCheckedAt(r.market)]);
  const pre = isPreorderSet(s.code);
  const open = products.filter(cardOpen);
  const perPack = cheapestPerPackByType(products);
  const way = cheapestWayIn(products);
  const name = withPokemon(s.name);
  const path = `/${r.region}/sets/${s.slug}`;
  const us = r.market === "US";
  const listedTypes = new Set(products.map((p) => p.productType));
  const facts = setFacts(s, listedTypes, r.market);
  const { prev, next } = prevNextSet(s.code);
  // Where a reader goes next from a set: the other sets, the calendar, and the product types this set is listed in here.
  const explore = [
    { href: `/${r.region}/sets`, label: "Every set in order" },
    { href: `/${r.region}/releases`, label: `Release dates ${new Date().getUTCFullYear()}` },
    ...PRODUCT_TYPES.filter((t) => listedTypes.has(t.label))
      .slice(0, 4)
      .map((t) => ({ href: `/${r.region}/type/${t.slug}`, label: `${t.plural} in ${r.inName}` })),
    { href: `/${r.region}/stores`, label: `Stores in ${r.inName}` },
  ];
  // This set's chase cards as an image strip of real listings (cascade: generic chase cards for a set with no feed of its own); with none
  // to list, the compact CTA row. It sits on a row of its own after the first products (ProductGrid `strip`), so the products come first.
  // Once a set is out, its strip's top line carries a highlighted eBay button (and it is the CTA's button): a search for the set's SEALED
  // product, what this page compares, beside its chase-card tiles. One of the owner's hot sets (lib/popular.ts) keeps its own "Shop <set>
  // on eBay" (hot-set); any other released set gets "Shop <set> sealed on eBay" (set-sealed); a pre-order set none (Ebay.tsx setSealedHighlight).
  const strip = (
    <EbayStrip
      region={r.region}
      context={`set:${s.slug}`}
      placement="listings-set"
      headings={{ set: `${s.name} chase cards on eBay`, chase: "Chase cards on eBay" }}
      search={{ kind: "card", query: `${s.name} special illustration rare`, label: `Search ${s.name} on eBay` }}
      highlight={setSealedHighlight(s)}
    />
  );
  const ld = itemListJsonLd({
    name: `${name} sealed products in ${r.inName}`,
    path,
    items: products.map((p) => ({ path: `/${r.region}/p/${p.slug}`, name: p.name })),
  });
  return (
    <div className="page py-8">
      {!(gridPageHasRoomForFooter(products.length) && products.length >= FOOTER_STRIP_MIN) && <NoPreFooter />}
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { href: `/${r.region}/sets`, label: "Sets" }, { label: s.name }]} />

      <section aria-labelledby="set-title" className="card p-5 sm:p-7">
        {/* Phone: the picture beside the title, the chips under both. From sm: the picture spans the title and the chips. */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-4 sm:gap-x-7 sm:gap-y-3">
          <div className="sm:row-span-2">
            <SetVisual s={s} products={products} />
          </div>
          <div className="min-w-0 sm:self-end">
            <div className="eyebrow">{s.series} series</div>
            <div className="mt-1 flex items-start justify-between gap-3">
              <h1 id="set-title" className="min-w-0 break-words font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {name}
              </h1>
              <ShareButton title={name} path={`/${r.region}/sets/${s.slug}`} kind="set" />
            </div>
          </div>
          <ul className="col-span-2 flex flex-wrap gap-2 sm:col-span-1 sm:col-start-2 sm:self-start">
            <SetChips s={s} pre={pre} open={open.length} total={products.length} />
          </ul>
        </div>

        {(way || pre || us) && (
          // Two fixed columns from sm (the cheapest pack; then the calendar and the labelled TCGplayer link stacked), so no line
          // wraps differently when the web font arrives and nothing below moves.
          <div className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-6">
            {way ? (
              <Link
                href={`/${r.region}/p/${way.p.slug}`}
                prefetch={false}
                className="group flex min-h-11 items-center gap-3 rounded-xl bg-open-soft px-4 py-2.5 text-sm text-ink transition-colors hover:bg-open-soft/70 sm:justify-self-start"
              >
                <Icon name="tag" size={18} className="text-open" />
                <span className="min-w-0">
                  <span className="text-muted">{pre ? "Cheapest pre-order per pack:" : "Cheapest way in:"}</span> <span className="font-semibold">{way.p.productType}</span> at{" "}
                  <span className="tabular font-bold">{money(way.perPack, r.market)}</span> a pack
                </span>
                <Icon name="arrow-right" size={18} className="ml-auto text-open transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {(pre || us) && (
              <div className="flex flex-col gap-2 sm:items-end">
                {pre && <AddToCalendar code={s.code} name={s.name} date={s.releaseDate} slug={s.slug} url={`${SITE_URL}${path}`} when={shortDate(s.releaseDate)} />}
                {us && (
                  <>
                    <OutboundLink href={tcgplayerSearchUrl(s.name, r.region, "set-tcgplayer")} rel={REL_SPONSORED} retailer={TCGPLAYER_RETAILER} placement="set-tcgplayer" className="btn-ghost min-h-11">
                      {pre ? `Search TCGplayer for ${s.name}` : `Shop ${s.name} on TCGplayer`} <span aria-hidden="true">↗</span>
                    </OutboundLink>
                    <span className="text-xs text-muted sm:text-right">{AFFILIATE_NOTE_SHORT}</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {checked && products.length > 0 && (
          <p className="mt-4 text-xs text-muted">
            Prices and stock in {r.inName}, checked <Ago iso={checked.toISOString()} initial={timeAgo(checked)} />.
          </p>
        )}
      </section>

      {pre && preorderPath(r.region, s.code) && (
        <Link
          href={preorderPath(r.region, s.code)!}
          prefetch={false}
          className="card mt-4 flex flex-wrap items-center justify-between gap-3 border-pre/40 bg-pre-soft/40 px-5 py-4 transition-shadow hover:shadow-lift"
        >
          <span>
            <span className="font-semibold">{s.name} pre-orders, store by store</span>
            <span className="block text-sm text-muted">Every {r.adjective} store taking pre-orders, cheapest first, with what is in each box and the key dates.</span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-pre">Compare pre-orders →</span>
        </Link>
      )}
      {perPack.length > 0 && (
        <Section id="per-pack" title={perPackHeading(perPack)} kicker={`Per booster pack, ${pre ? "cheapest pre-order" : "in stock now"}`}>
          <PerPackStrip r={r} items={perPack} />
          <p className="mt-3 text-xs text-muted">
            The lowest {pre ? "pre-order" : "in-stock"} price of each product type in {r.inName}, divided by the booster packs it holds. Extras (promos, sleeves, dice)
            aren&rsquo;t priced in.
          </p>
        </Section>
      )}

      <Section id="products" title={`${s.name} sealed products`} kicker={products.length ? `${products.length} listed in ${r.inName}` : undefined}>
        {products.length ? (
          <ProductGrid products={products} region={r.region} eager={4} tiles="set" strip={strip} />
        ) : (
          <>
            <Empty
              actions={[
                { href: `/${r.region}/sets`, label: "Every set" },
                { href: `/${r.region}/releases`, label: "Release calendar" },
              ]}
            >
              No {r.adjective} store we track lists {s.name} sealed product right now.
            </Empty>
            <div className="mt-4">{strip}</div>
          </>
        )}
      </Section>

      <section aria-labelledby="about-set" className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
        <div>
          <h2 id="about-set" className="font-display text-2xl font-bold tracking-tight sm:text-[28px]">
            About {name}
          </h2>
          <div className="mt-4 max-w-2xl space-y-3 leading-7 text-muted">
            {setIntro(s, r, products).map((t) => (
              <p key={t}>{t}</p>
            ))}
          </div>
          <nav aria-label="Keep exploring" className="mt-6">
            <h3 className="eyebrow">Keep exploring</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {explore.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} prefetch={false} className="chip min-h-10">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="card self-start p-5">
          <h3 className="eyebrow">Set facts</h3>
          <dl className="mt-3 divide-y divide-line text-sm">
            {facts.map((f) => (
              <div key={f.term} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-muted">{f.term}</dt>
                <dd className="text-right font-semibold">
                  {f.detail}
                  {f.msrp && <span className="block text-xs font-normal text-muted">US MSRP {f.msrp}</span>}
                </dd>
              </div>
            ))}
          </dl>
          {facts.some((f) => f.msrp) && <p className="mt-2 text-xs text-muted">{RRP_NOTE}</p>}
        </div>
      </section>

      {(prev || next) && (
        <nav aria-label="Previous and next sets" className="mt-12 grid gap-3 sm:grid-cols-2">
          {prev ? <SetLink r={r} s={prev} dir="prev" /> : <span className="hidden sm:block" />}
          {next && <SetLink r={r} s={next} dir="next" />}
        </nav>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
    </div>
  );
}

/** The release chip and the stock chip. */
function SetChips({ s, pre, open, total }: { s: PokemonSet; pre: boolean; open: number; total: number }) {
  return (
    <>
      <li>
        <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${pre ? "bg-pre-soft text-pre" : "bg-raised text-ink ring-1 ring-line"}`}>
          <Icon name="calendar" size={14} />
          <time dateTime={s.releaseDate}>{releaseChip(s)}</time>
        </span>
      </li>
      {total > 0 && (
        <li>
          <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${open ? (pre ? "bg-pre-soft text-pre" : "bg-open-soft text-open") : "bg-sold-soft text-sold"}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            {open ? `${open} ${pre ? "open for pre-order" : "in stock"}` : "None in stock right now"}
          </span>
        </li>
      )}
    </>
  );
}

/**
 * The hero's picture: the set's logo; a set without one in sets.ts (the newest, until pokemontcg.io has them) shows its first
 * booster box or ETB on a white plate, then any product photo, then the set's name set in type. Sized before it loads.
 */
function SetVisual({ s, products }: { s: PokemonSet; products: ProductCardData[] }) {
  if (s.logo) {
    return (
      <img
        src={s.logo}
        alt={`${s.name} logo`}
        width={192}
        height={80}
        fetchPriority="high"
        decoding="async"
        className="h-14 w-28 object-contain sm:h-20 sm:w-48"
      />
    );
  }
  const pick =
    products.find((p) => p.productType === "Booster Box" && p.imageUrl) ??
    products.find((p) => p.productType === "Elite Trainer Box" && p.imageUrl) ??
    products.find((p) => p.imageUrl);
  const src = thumb(pick?.imageUrl, 240);
  return (
    <div className="plate flex h-20 w-20 shrink-0 items-center justify-center sm:h-28 sm:w-28">
      {src ? (
        <img src={src} alt={`${s.name} ${pick!.productType}`} width={112} height={112} fetchPriority="high" decoding="async" className="h-full w-full object-contain p-1.5" />
      ) : (
        <span className="px-2 text-center font-display text-sm font-bold leading-tight text-[#5c606c]">{s.name}</span>
      )}
    </div>
  );
}

const SHORT: Record<string, string> = {
  "Booster Box": "Booster box",
  "Elite Trainer Box": "ETB",
  "Pokémon Center Elite Trainer Box": "Pokémon Center ETB",
  "Booster Bundle": "bundle",
  Blister: "blister",
  "Sleeved Booster": "sleeved booster",
  "Booster Pack": "loose pack",
  "Build & Battle Box": "Build & Battle",
};

const HEADLINE = ["Booster Box", "Elite Trainer Box", "Booster Bundle"];

/**
 * "Booster box vs ETB vs bundle: cheapest per pack" (what people search: "<set> booster box vs etb"), from the types actually
 * compared: the headline three first, then the others, so a set sold without a box never names one.
 */
function perPackHeading(items: PerPackPick[]): string {
  const types = items.map((i) => i.p.productType);
  const ordered = [...HEADLINE.filter((t) => types.includes(t)), ...types.filter((t) => !HEADLINE.includes(t))];
  const names = ordered.slice(0, 3).map((t) => SHORT[t] ?? t);
  if (names.length < 2) return `${names[0] ?? "Packs"}: price per pack`;
  const text = names.join(" vs ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}: cheapest per pack`;
}

function PerPackStrip({ r, items }: { r: RegionInfo; items: PerPackPick[] }) {
  const floor = Math.min(...items.map((i) => i.perPack));
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map(({ p, perPack, packs }) => {
        const t = PRODUCT_TYPES.find((x) => x.label === p.productType);
        const cheapest = perPack === floor;
        return (
          <li key={p.slug}>
            <Link href={`/${r.region}/p/${p.slug}`} prefetch={false} className={`card flex h-full flex-col gap-1 p-4 transition-shadow hover:shadow-lift ${cheapest ? "border-open" : ""}`}>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t?.label ?? p.productType}</span>
              <span className="tabular font-display text-xl font-extrabold sm:text-2xl">
                {money(perPack, r.market)} <span className="whitespace-nowrap text-sm font-semibold text-muted">/ pack</span>
              </span>
              <span className="text-xs text-muted">
                {money(p.lowestPriceCents, r.market)} for {packs} {packs === 1 ? "pack" : "packs"}
              </span>
              {cheapest && <span className="mt-1 w-fit rounded-full border border-open/40 px-2 py-0.5 text-[11px] font-bold text-open">Cheapest per pack</span>}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function SetLink({ r, s, dir }: { r: RegionInfo; s: PokemonSet; dir: "prev" | "next" }) {
  const pre = isPreorderSet(s.code);
  return (
    <Link
      href={`/${r.region}/sets/${s.slug}`}
      prefetch={false}
      className={`card group flex min-h-16 items-center gap-3 p-4 transition-shadow hover:shadow-lift ${dir === "next" ? "flex-row-reverse text-right" : ""}`}
    >
      <Icon name="arrow-right" size={20} className={`text-muted transition-transform group-hover:text-brand ${dir === "prev" ? "rotate-180 group-hover:-translate-x-0.5" : "group-hover:translate-x-0.5"}`} />
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase tracking-wide text-muted">{dir === "prev" ? "Previous set" : "Next set"}</span>
        <span className="block truncate font-semibold group-hover:text-brand">{withPokemon(s.name)}</span>
        <span className="block text-xs text-muted">{pre ? `Out ${shortDate(s.releaseDate)}` : `Released ${shortDate(s.releaseDate)}`}</span>
      </span>
    </Link>
  );
}
