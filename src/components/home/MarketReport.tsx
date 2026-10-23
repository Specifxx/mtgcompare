// The landing page's written market report: what Magic sealed costs today, what is cheapest, how the seven regions differ and how
// stock looks, every number from lib/home-report.ts (the public data files, read at render) and every sentence built from it. No
// template text without a number behind it; when a read is empty the sentence says so. Server-rendered: nothing waits on a script.
// The words follow lib/copy-rules.ts: "today", never a history claim the files cannot back.
import Link from "@/components/Link";
import { COUNTRY_GUIDE } from "@/content/guides/country-prices";
import { guideHref } from "@/content/guides/kit";
import type { ProductCardData } from "@/lib/data";
import { money, plural } from "@/lib/format";
import type { HomeReport, ReportType, TypeRange } from "@/lib/home-report";
import { REGIONS, type RegionInfo } from "@/lib/regions";
import { TYPE_BY_LABEL } from "@/lib/sealed-title";

const A = "font-semibold text-brand underline-offset-2 hover:underline";

const WORDS: Record<ReportType, { many: string; one: string; note: string }> = {
  "Play Booster Box": {
    many: "Play Booster boxes",
    one: "Play Booster box",
    note: "A Play Booster box is the standard way to buy a set by the box: 36 packs in the first Play Booster sets and 30 in later ones.",
  },
  "Collector Booster Box": {
    many: "Collector Booster boxes",
    one: "Collector Booster box",
    note: "A Collector Booster box holds 12 premium packs, so it costs more than a Play Booster box with fewer packs inside.",
  },
  Bundle: { many: "Bundles", one: "Bundle", note: "A Bundle is a set’s gift box: booster packs, basic lands and a storage box." },
  "Commander Deck": { many: "Commander decks", one: "Commander deck", note: "A Commander precon is a ready-to-play 100-card deck for the multiplayer format." },
};

const typeHref = (r: RegionInfo, t: ReportType) => {
  const x = TYPE_BY_LABEL.get(t);
  return x ? `/${r.region}/type/${x.slug}` : `/${r.region}/sealed`;
};
const P = ({ r, p }: { r: RegionInfo; p: ProductCardData }) => (
  <Link href={`/${r.region}/p/${p.slug}`} prefetch={false} className={A}>
    {p.name}
  </Link>
);

function RangeParagraph({ r, x }: { r: RegionInfo; x: TypeRange }) {
  const w = WORDS[x.type];
  const m = (c: number) => money(c, r.market);
  return (
    <div>
      <h3 className="font-display text-lg font-bold text-ink">
        <Link href={typeHref(r, x.type)} prefetch={false} className="hover:text-brand">
          {w.many[0].toUpperCase() + w.many.slice(1)} in {r.inName}
        </Link>
      </h3>
      <p className="mt-1.5">
        {w.note} We read {plural(x.n, w.one, w.many)} open in {r.inName} today, from <strong className="text-ink">{m(x.low)}</strong> to {m(x.high)}; the middle price is{" "}
        {m(x.median)}, so half of them cost less than that.
        {x.widest && x.widest.inStockStores > 1 && (
          <>
            {" "}
            The one most stores hold is <P r={r} p={x.widest} />, in stock at {plural(x.widest.inStockStores, "store")}, the easiest one to compare: its cheapest store is{" "}
            {m(x.widest.lowestPriceCents ?? 0)}.
          </>
        )}
      </p>
      {x.top.length > 0 && (
        <p className="mt-1.5">
          Cheapest today:{" "}
          {x.top.map((p, i) => (
            <span key={p.slug}>
              {i > 0 && (i === x.top.length - 1 ? " and " : ", ")}
              <P r={r} p={p} /> ({m(p.lowestPriceCents ?? 0)})
            </span>
          ))}
          .
        </p>
      )}
    </div>
  );
}

export function MarketReport({ report }: { report: HomeReport }) {
  const r = REGIONS[report.region];
  const lines = report.regions;
  const withBox = lines.filter((l) => l.cheapest["Play Booster Box"]);
  const most = lines.slice().sort((a, b) => b.stores - a.stores)[0];
  const fewest = lines.slice().sort((a, b) => a.stores - b.stores)[0];
  const cheapToday = report.ranges.map((x) => ({ x, p: x.top[0] })).filter((y) => y.p);
  const wrapBy = new Map(report.wrapCards.map((c) => [c.slug, c]));
  const moves = [...report.wrap.lower, ...report.wrap.higher].filter((m) => wrapBy.has(m.slug)).slice(0, 6);
  if (!lines.length && !report.ranges.length) return null;
  return (
    <section className="page mt-14" aria-labelledby="report-h">
      <div className="mx-auto max-w-3xl space-y-10 text-[15px] leading-7 text-muted">
        <div>
          <h2 id="report-h" className="font-display text-2xl font-bold tracking-tight text-ink">
            Magic sealed prices today: booster boxes, bundles and Commander decks
          </h2>
          <p className="mt-3">
            What Magic: The Gathering sealed product costs right now, from the listings we read today. Prices below are for {r.inName}, in {r.currency} before shipping; the
            region table further down gives every region its own figures in its own currency.
          </p>
          <div className="mt-5 space-y-6">
            {report.ranges.map((x) => (
              <RangeParagraph key={x.type} r={r} x={x} />
            ))}
          </div>
        </div>

        {cheapToday.length > 0 && (
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink">What’s cheapest this week</h2>
            <p className="mt-3">
              The lowest open price of each kind of product in {r.inName} today. A low price on an older set often means only one or two stores still hold it, so check the
              store count on the product page before you decide.
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              {cheapToday.map(({ x, p }) => (
                <li key={x.type}>
                  The cheapest {WORDS[x.type].one}: <P r={r} p={p} />, {money(p.lowestPriceCents ?? 0, r.market)}
                  {p.inStockStores > 0 ? `, in stock at ${plural(p.inStockStores, "store")}` : " on TCGplayer"}.
                </li>
              ))}
            </ul>
            {moves.length > 0 ? (
              <>
                <p className="mt-3">
                  Week on week ({report.wrap.from} to {report.wrap.through}), these moved the most among products in stock at two or more stores on both days:
                </p>
                <ul className="mt-2 list-disc space-y-1.5 pl-5">
                  {moves.map((mv) => (
                    <li key={mv.slug}>
                      <P r={r} p={wrapBy.get(mv.slug)!} />: {money(mv.before, r.market)} → {money(mv.after, r.market)} ({mv.pct > 0 ? "+" : ""}
                      {mv.pct}%).
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-3">
                Week-on-week moves need seven days of our daily snapshots; until then the{" "}
                <Link href={guideHref(r, "magic-sealed-market-wrap")} prefetch={false} className={A}>
                  weekly market wrap
                </Link>{" "}
                says so rather than guess, and today’s cheapest prices above are the figures to go by.
              </p>
            )}
          </div>
        )}

        {lines.length > 0 && (
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink">How prices differ by region</h2>
            <p className="mt-3">
              Each region compares only stores that charge in its own currency, and we never convert a price: an Australian dollar figure and a US dollar figure are two
              different shelves, not one price in two currencies. What changes between regions is how many stores we read, how much of the catalogue they carry and where
              the cheapest box sits.
              {most && fewest && most.region !== fewest.region && (
                <>
                  {" "}
                  {REGIONS[most.region].name} has the most stores we compare ({most.stores}), {REGIONS[fewest.region].name} the fewest ({fewest.stores}), so a product
                  sold out in one region can be on several shelves in another.
                </>
              )}
            </p>
            <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <caption className="sr-only">Stores, open products and the cheapest Play and Collector Booster box in each region today, in local currency</caption>
                <thead className="text-xs uppercase tracking-wide text-faint">
                  <tr>
                    <th scope="col" className="px-3 py-2">Region</th>
                    <th scope="col" className="px-3 py-2">Stores</th>
                    <th scope="col" className="px-3 py-2">Open products</th>
                    <th scope="col" className="px-3 py-2">Cheapest Play box</th>
                    <th scope="col" className="px-3 py-2">Cheapest Collector box</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lines.map((l) => {
                    const x = REGIONS[l.region];
                    const pb = l.cheapest["Play Booster Box"];
                    const cb = l.cheapest["Collector Booster Box"];
                    return (
                      <tr key={l.region}>
                        <th scope="row" className="px-3 py-2 font-semibold text-ink">
                          <Link href={`/${x.region}`} prefetch={false} className="hover:text-brand">
                            {x.name}
                          </Link>
                        </th>
                        <td className="px-3 py-2 tabular">{l.stores}</td>
                        <td className="px-3 py-2 tabular">{l.open.toLocaleString("en")}</td>
                        <td className="px-3 py-2 tabular">{pb ? <Link href={`/${x.region}/p/${pb.slug}`} prefetch={false} className={A}>{money(pb.lowestPriceCents, x.market)}</Link> : "—"}</td>
                        <td className="px-3 py-2 tabular">{cb ? <Link href={`/${x.region}/p/${cb.slug}`} prefetch={false} className={A}>{money(cb.lowestPriceCents, x.market)}</Link> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 space-y-3">
              {withBox.map((l) => {
                const x = REGIONS[l.region];
                const pb = l.cheapest["Play Booster Box"]!;
                const cd = l.cheapest["Commander Deck"];
                const bu = l.cheapest.Bundle;
                return (
                  <p key={l.region}>
                    <strong className="text-ink">{x.name}:</strong> {plural(l.open, "product")} open at {plural(l.stores, `${x.adjective} store`)}
                    {x.market === "US" ? " and TCGplayer" : ""}. The cheapest booster box there today is <P r={x} p={pb} /> at {money(pb.lowestPriceCents, x.market)}
                    {bu ? <>, the cheapest Bundle {money(bu.lowestPriceCents, x.market)}</> : null}
                    {cd ? <> and the cheapest Commander deck {money(cd.lowestPriceCents, x.market)}</> : null}.{" "}
                    <Link href={`/${x.region}/guides/mtg-booster-box-prices`} prefetch={false} className={A}>
                      MTG booster box prices in {x.inName}
                    </Link>
                    .
                  </p>
                );
              })}
            </div>
            <p className="mt-3">
              The cheapest box is often a different set from one region to the next: each region’s stores hold different leftovers of older sets, and a set’s release
              stock arrives in each region on its own schedule. The{" "}
              <Link href={COUNTRY_GUIDE.path} prefetch={false} className={A}>
                booster box prices by country
              </Link>{" "}
              guide lines up the same box in all seven.
            </p>
          </div>
        )}

        {lines.length > 0 && (
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink">Stock: what is on the shelf, and when it changes</h2>
            <p className="mt-3">
              We keep a product listed after it sells out, so its page shows which stores had it and when we last read them. Of the products we list in each region, this
              many are open (in stock somewhere, or on pre-order) today:{" "}
              {lines
                .filter((l) => l.products > 0)
                .map((l, i, all) => (
                  <span key={l.region}>
                    {i > 0 && (i === all.length - 1 ? " and " : ", ")}
                    {REGIONS[l.region].name} {Math.round((l.open / l.products) * 100)}% ({l.open.toLocaleString("en")} of {l.products.toLocaleString("en")})
                  </span>
                ))}
              .
            </p>
            <p className="mt-3">
              The pattern behind those numbers is the release cycle. A new set’s Play Booster boxes, Collector Booster boxes and Bundles reach most stores in the same
              week, so in its first weeks a box is usually open at many stores at once and the gap between the cheapest and the next store is small. As a set ages, stores
              stop reordering it, the store count on its page falls, and the boxes that are left are spread across fewer shelves, sometimes cheaper, sometimes dearer.
              Commander decks follow their own releases, and a deck can stay on shelves for a long time after its set.
            </p>
            <p className="mt-3">
              Stores are read about twice a day, so a product that returns to a store’s shelf shows up here at the next read, with the time we read it. For a set that is
              not out yet, the pre-order pages and the{" "}
              <Link href={guideHref(r, "magic-release-dates-preorder-calendar")} prefetch={false} className={A}>
                release calendar
              </Link>{" "}
              list who takes orders and when it ships.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
