import Link from "next/link";
import { EbaySearchPanel } from "@/components/EbaySearchPanel";
import { HubFaq } from "@/components/HubFaq";
import { PreorderProduct } from "@/components/PreorderProduct";
import { ReleaseAlertSlot } from "@/components/ReleaseAlertSlot";
import { Breadcrumbs, JsonLd } from "@/components/ui";
import { COUNTRIES, type Country } from "@/lib/country";
import { getSealedBySet, getSealedDetail, getSetIndex, type SealedLite, type SetLite } from "@/lib/data";
import { andList } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { faqPage, webPage } from "@/lib/jsonld";
import { boardSummary, commanderDeckNames, dateRangeOf, daysUntil, isOut, lineOf, longDateOf, orderProducts, preorderRows, releaseDateOf, releaseSets, type PreorderRelease, type PreorderRow } from "@/lib/preorders";
import { sealedEbayQuery } from "@/lib/sealed-quick-view";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// ─────────────────────────────────────────────────────────────────────────────
// One pre-order page per release (/star-trek-preorders): the same box, at every
// store, before it ships. RiftCompare's /radiance-preorders and OP Compare's
// /eb05-preorders on MTG Compare's data: before a set is out the product is the
// same at every seller (nobody has opened one), so price is the only variable,
// and stores pick very different opening prices.
//
// EVERY PRICE HERE IS A PRE-ORDER, and the page says so in the heading, on each
// row and in its structured data (schema.org PreOrder, never InStock).
//
// DATE-DRIVEN and self-retiring: the release date is the catalogue's (else the
// announced one in lib/preorders.ts), so on release day the page switches to its
// released state, pointing at the set page and /sealed. Reads the published data
// only (sets, the sealed list and each product's offers): no database, no eBay.
// A route is a PreorderRelease of lib/preorders.ts and a page.tsx that renders this.
// ─────────────────────────────────────────────────────────────────────────────

const todayIso = () => new Date().toISOString().slice(0, 10);

function faqsFor(r: PreorderRelease, date: string, decks: string[], hasCollector: boolean, hasCollectorsEdition: boolean): { q: string; a: string }[] {
  const L = r.label;
  const reported = r.facts.filter((f) => f.kind === "reported").map((f) => f.text.replace(/\.$/, "").replace(/^\w/, (x) => x.toLowerCase()));
  return [
    {
      q: `How much does a ${L} Play Booster display cost to pre-order?`,
      a: `Pre-order prices vary between stores because nothing has shipped and each store sets its own opening price. This page lists every tracked store's pre-order price in your market, cheapest first, beside TCGplayer's lowest listing in the US. We show no list price: we quote one only with a published source and its date, and none is cited for ${L}.`,
    },
    {
      q: `When does Magic: The Gathering ${L} release?`,
      a: `${longDateOf(date)}.${r.facts.some((f) => f.kind === "official" && /releases on/.test(f.text)) ? ` That is the date on ${r.productSource.label} (read ${longDateOf(r.productSource.checked)}).` : ""}${reported.length ? ` Fan trackers report that ${reported.join(", and that ")}.` : ""}`,
    },
    ...(hasCollector && r.lines.some((l) => l.name === "Collector Booster")
      ? [{ q: `What is the difference between a ${L} Play Booster and a Collector Booster?`, a: `The Play Booster is the set's main booster, the one to open and to play with. The Collector Booster is ${r.lines.find((l) => l.name === "Collector Booster")!.detail.replace(/^\w/, (x) => x.toLowerCase())} They are priced very differently, so compare each with its own kind.` }]
      : []),
    {
      q: "Is it cheaper to pre-order or to wait until release?",
      a: "It depends on what you want. Sealed product often sits near its opening price during pre-orders, and the risk of waiting is a store's allocation running out rather than a price change. Singles are usually at their most expensive in the first days after release and settle once supply catches up. If you want to open product, compare pre-orders; if you want particular cards, waiting and buying singles is usually cheaper.",
    },
    {
      q: "Are these pre-order prices final?",
      a: "No. A pre-order price is what a store asks today, and stores change them before release as allocations firm up. We read the stores once a day; nothing here is a commitment from a store or from us. Confirm the price and the store's pre-order terms at checkout.",
    },
    {
      q: "Do the prices include postage?",
      a: "No. They are item prices, ranked as listed. A sealed box ships as a parcel, so check each store's checkout for postage, and for import tax if the store is abroad.",
    },
    ...(decks.length
      ? [{ q: `What are the ${L} Commander decks?`, a: `TCGplayer lists ${decks.length === 1 ? "one" : decks.length === 4 ? "four" : decks.length} ${L} Commander ${decks.length === 1 ? "deck" : "decks"}: ${andList(decks)}.${hasCollectorsEdition ? " It also lists Collector's Edition versions, which Wizards describes as 100-card Commander decks in Surge Foil." : ""} Every one a store takes pre-orders for is priced on this page.` }]
      : []),
    {
      q: "How does MTG Compare earn money from this page?",
      a: "TCGplayer and eBay links are affiliate links, so we may earn a commission on a qualifying purchase at no cost to you. Store rows are not paid placements and no store can buy a better position: every row is ranked by its item price.",
    },
  ];
}

/** Per product: its rows in the visitor's market. One read of the product's detail file each (offers in every market, filtered here). */
async function boardsFor(products: SealedLite[], country: Country, path: string): Promise<{ s: SealedLite; rows: PreorderRow[] }[]> {
  const details = await Promise.all(products.map((p) => getSealedDetail(p.slug)));
  return products.map((s, i) => ({ s, rows: preorderRows(details[i]?.offers ?? [], country, path) }));
}

/** What the page shows, read from the published data: the release's sets, its products in display order, and (until release day) each product's rows in the visitor's market. */
export interface PreorderData {
  country: Country;
  today: string;
  sets: SetLite[];
  products: SealedLite[];
  boards: { s: SealedLite; rows: PreorderRow[] }[];
}

export async function loadPreorder(release: PreorderRelease, country: Country, today: string): Promise<PreorderData> {
  const sets = releaseSets(release, (await getSetIndex()).byTok);
  const products = orderProducts(release, (await Promise.all(sets.map((s) => getSealedBySet(s.id)))).flat(), sets);
  const boards = isOut(releaseDateOf(release, sets), today) ? [] : await boardsFor(products, country, release.path);
  return { country, today, sets, products, boards };
}

/** The route's component: the visitor's market, today's data, the release alert while the set is ahead. */
export async function PreorderPage({ release }: { release: PreorderRelease }) {
  const data = await loadPreorder(release, getCountry(), todayIso());
  const main = data.sets[0] ?? null;
  return <PreorderView release={release} data={data} alert={main ? <ReleaseAlertSlot setSlug={main.slug} setName={main.name} releasedOn={main.releasedOn} source="sealed" unreleasedOnly className="mt-6 max-w-lg" /> : null} />;
}

/** The page itself, from loaded data (pure: tests/preorders.test.ts renders it). `alert` is the release-alert mount, shown only before release day. */
export function PreorderView({ release, data, alert }: { release: PreorderRelease; data: PreorderData; alert?: React.ReactNode }) {
  const { country, today, sets, products, boards } = data;
  const info = COUNTRIES[country];
  const main: SetLite | null = sets[0] ?? null;
  const date = releaseDateOf(release, sets);
  const out = isOut(date, today);
  const days = daysUntil(date, today);
  const priced = boards.filter((b) => boardSummary(b.rows).cheapest);
  const decks = commanderDeckNames(products);
  const faqs = faqsFor(release, date, decks, products.some((p) => /collector booster/i.test(p.name)), products.some((p) => p.kind === "Commander Deck" && /collector['\u2019]?s edition/i.test(p.name)));
  const L = release.label;
  const setCodeOf = new Map(sets.map((s) => [s.id, s.code] as const));
  const official = release.facts.filter((f) => f.kind === "official"), reported = release.facts.filter((f) => f.kind === "reported");
  const linkCls = "text-brand-400 underline-offset-2 hover:underline";

  return (
    <div className="mx-auto max-w-4xl">
      <JsonLd
        data={[
          webPage({ name: `Magic: The Gathering ${L} pre-order prices`, href: release.path, description: `Pre-order prices for Magic: The Gathering ${L} sealed products across the stores we track, refreshed once a day.`, type: "CollectionPage" }),
          // PreOrder availability, never InStock: none of this has shipped.
          ...(priced.length
            ? [
                {
                  "@context": "https://schema.org",
                  "@type": "ItemList",
                  name: `Magic: The Gathering ${L} pre-orders`,
                  url: `${SITE_URL}${release.path}`,
                  itemListElement: priced.slice(0, 30).map(({ s, rows }, i) => {
                    const sum = boardSummary(rows);
                    return {
                      "@type": "ListItem",
                      position: i + 1,
                      item: {
                        "@type": "Product",
                        name: s.name,
                        url: `${SITE_URL}/sealed/${s.slug}`,
                        brand: { "@type": "Brand", name: "Magic: The Gathering" },
                        offers: {
                          "@type": "AggregateOffer",
                          availability: "https://schema.org/PreOrder",
                          priceCurrency: info.currency,
                          lowPrice: ((sum.cheapest?.priceCents ?? 0) / 100).toFixed(2),
                          offerCount: rows.filter((r) => r.state === "open").length,
                        },
                      },
                    };
                  }),
                },
              ]
            : []),
          faqPage(faqs),
        ].filter(Boolean)}
      />
      <Breadcrumbs trail={[{ href: "/sealed", name: "Sealed" }, { name: `${L} pre-orders` }]} />

      <span className="chip mb-3 inline-flex bg-gold/15 text-[11px] font-bold uppercase tracking-wide text-gold [font-feature-settings:'lnum'_1]">
        {out ? `Out now · released ${longDateOf(date)}` : `Pre-order · releases ${longDateOf(date)}${days > 0 ? ` · ${days} ${days === 1 ? "day" : "days"} to go` : ""}`}
      </span>
      <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">{out ? `Magic: The Gathering ${L} is out` : `Magic: The Gathering ${L} pre-order prices`}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        {out
          ? `${L} released on ${longDateOf(date)}, so its products are priced with every other set: live prices, not pre-orders, are on the sealed and set pages.`
          : `Nothing has shipped yet, so every store is simply picking an opening price, and they are picking different ones. Below, each ${L} product lists the pre-orders of the stores we track in ${info.place}, cheapest first, in ${info.currency}${country === "US" ? ", beside TCGplayer's lowest listing" : ""}. Sold-out stores stay on the list, marked. Prices refresh once a day.`}
      </p>

      {!out && products.length ? (
        <div className="mt-4">
          <EbaySearchPanel
            heading={`Prefer eBay? Search it for ${L} boxes and decks.`}
            sub="Not part of the store price lists below."
            country={country}
            page="preorders"
            links={[
              { label: "Play Booster displays", query: sealedEbayQuery(`${L} Play Booster Display`) },
              { label: "Collector Booster displays", query: sealedEbayQuery(`${L} Collector Booster Display`) },
              { label: "Commander decks", query: sealedEbayQuery(`${L} Commander Deck`) },
            ]}
          />
        </div>
      ) : null}

      {boards.length ? (
        <div className="mt-5 space-y-4">
          <h2 className="sr-only">{L} pre-order prices by product</h2>
          {boards.map(({ s, rows }) => (
            <PreorderProduct key={s.id} s={s} rows={rows} line={lineOf(release, s.name)} setCode={s.setId != null ? setCodeOf.get(s.setId) ?? null : null} country={country} page={release.path.slice(1)} />
          ))}
        </div>
      ) : (
        <div className="card-surface mt-5 p-6">
          <h2 className="font-bold text-white">{out ? `${L} is out: see live prices` : `No ${L} products in our catalogue yet`}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            {out ? (
              <>
                Its products are priced alongside every other set:{" "}
                {main ? (
                  <>
                    <Link href={`/sealed?set=${main.slug}`} className={linkCls}>
                      live {L} sealed prices
                    </Link>{" "}
                    and{" "}
                    <Link href={`/sets/${main.slug}`} className={linkCls}>
                      every {main.code} card
                    </Link>
                  </>
                ) : (
                  <Link href="/sealed" className={linkCls}>
                    live sealed prices
                  </Link>
                )}
                .
              </>
            ) : (
              "We list a product as soon as TCGplayer does, and stores' pre-orders as the stores we track publish them. This page fills in on its own: nothing here is ever an estimate or a placeholder price."
            )}
          </p>
        </div>
      )}

      {!out ? alert : null}

      {!out ? (
        <section className="card-surface mt-8 p-6">
          <h2 className="text-xl font-extrabold text-white">What each {L} product is</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            From{" "}
            <a href={release.productSource.url} target="_blank" rel="noopener noreferrer" className={linkCls}>
              {release.productSource.label}
            </a>
            , read {longDateOf(release.productSource.checked)}. We show no list price: we quote one only with a published source and its date, and none is cited for {L}. The prices above are what stores are actually asking.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {release.lines.map((l) => (
              <div key={l.name} className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                <dt className="font-bold text-white">{l.name}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-slate-400">{l.detail}</dd>
              </div>
            ))}
          </dl>
          {decks.length ? <p className="mt-4 text-sm text-slate-400">TCGplayer lists the Commander decks as {andList(decks)}.</p> : null}
        </section>
      ) : null}

      <section className="card-surface mt-6 p-6">
        <h2 className="text-xl font-extrabold text-white">
          What is confirmed, as of {longDateOf(release.productSource.checked)}
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-400 marker:text-brand-400">
          {official.map((f) => (
            <li key={f.text}>
              {f.text}{" "}
              <span className="text-slate-500">
                (
                <a href={f.source.url} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  {f.source.label}
                </a>
                , {longDateOf(f.checked)})
              </span>
            </li>
          ))}
          {reported.map((f) => (
            <li key={f.text}>
              Reported by fan trackers: {f.text.replace(/^\w/, (x) => x.toLowerCase())}{" "}
              <span className="text-slate-500">
                (
                <a href={f.source.url} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  {f.source.label}
                </a>
                , {longDateOf(f.checked)})
              </span>
            </li>
          ))}
        </ul>
      </section>

      {!out ? (
        <section className="card-surface mt-6 p-6">
          <h2 className="text-xl font-extrabold text-white">When to pre-order {L}, and when to wait</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            {release.prerelease
              ? `Two dates matter before ${longDateOf(date)}. Prerelease events, ${release.prerelease.kind === "reported" ? "which fan trackers report" : "which Wizards lists"} for ${dateRangeOf(release.prerelease.from, release.prerelease.to)}, are when the first copies are opened and the first singles change hands. Release day is when stores ship pre-orders and singles go on general sale.`
              : `Release day, ${longDateOf(date)}, is when stores ship pre-orders and singles go on general sale; the first singles change hands at the prerelease events a week or so before.`}
          </p>
          <ul className="mt-4 grid gap-2 text-sm leading-relaxed text-slate-400 [font-feature-settings:'lnum'_1]">
            <li>
              <strong className="text-slate-200">Want to open product?</strong> Pre-ordering is reasonable, because a store&apos;s allocation, not its price, is what runs out. The spread between the cheapest and the dearest store above is the reason to compare first: it is the same box either way.
            </li>
            <li>
              <strong className="text-slate-200">Want particular cards?</strong> Waiting is usually cheaper. Singles are at their most volatile in prerelease week and the first days after release, and typically settle a few weeks later once supply catches up.{" "}
              {main ? (
                <Link href={`/sets/${main.slug}`} className={linkCls}>
                  The {main.code} cards revealed so far
                </Link>
              ) : (
                `The ${L} cards revealed so far`
              )}{" "}
              can be watched one by one.
            </li>
            <li>
              <strong className="text-slate-200">Not sure a box is worth opening?</strong> That needs real singles prices, which an unreleased set does not have. The{" "}
              <Link href="/tools/box-ev" className={linkCls}>
                box EV calculator
              </Link>{" "}
              answers it for every set that is out.
            </li>
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            We do not forecast prices here and will not tell you a number is going up. What this page can tell you is what every store we track is asking today, in your currency.
          </p>
        </section>
      ) : null}

      <nav aria-label="Related" className="mt-8 flex flex-wrap gap-2 text-sm">
        <Link href="/blog/where-to-buy-magic-star-trek" className="btn-ghost">
          Where to buy {L}
        </Link>
        <Link href="/blog/magic-star-trek-spoilers" className="btn-ghost">
          {L} spoilers so far
        </Link>
        {sets.map((s) => (
          <Link key={s.id} href={`/sets/${s.slug}`} className="btn-ghost">
            {s.name} card list
          </Link>
        ))}
        <Link href="/release-dates" className="btn-ghost">
          Release dates
        </Link>
        <Link href="/sealed" className="btn-ghost">
          All sealed prices
        </Link>
      </nav>

      <p className="mt-6 text-center text-xs text-slate-500">
        Affiliate links: as an eBay Partner Network affiliate and a TCGplayer affiliate, {SITE_NAME} earns from qualifying purchases, at no extra cost to you.{" "}
        <Link href="/methodology" className="underline hover:text-slate-300">
          How we compare prices
        </Link>
        .{release.trademark ? ` ${release.trademark}` : ""}
      </p>

      <HubFaq faqs={faqs} />
    </div>
  );
}
