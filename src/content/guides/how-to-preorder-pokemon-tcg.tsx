// Guide: how to pre-order Pokémon TCG sets. What a pre-order listing means here (sets.ts's English release date; stores may ship a
// few days either side, the release calendar's wording), how to compare (per pack from packs.ts, the number of stores, US MSRP from
// rrp.ts with RRP_NOTE), a checklist phrased as checks (never claims about stores), and a live block of the upcoming sets: dates, how
// many products are open for pre-order and the cheapest box, ETB and bundle of each.
import Link from "next/link";
import { CALENDAR_TYPES } from "@/lib/data";
import { money, plural, relativeDay } from "@/lib/format";
import type { RegionInfo } from "@/lib/regions";
import { formatRelease } from "@/lib/release";
import { usMsrpCents } from "@/lib/rrp";
import type { GuideData } from "./data";
import { fixedPacks, msrpSeries, packsBySeries, regularSet, seriesPhrase, upcomingSets } from "./facts";
import { GUIDE_BY_SLUG } from "./index";
import {
  Checklist,
  GuideBody,
  guideHref,
  Lede,
  LiveBlock,
  linesFor,
  MsrpNote,
  Note,
  PriceTable,
  Prose,
  SetGroup,
  SetTitle,
  setHref,
  setOf,
  typeHref,
  whereToBuy,
  type BodyProps,
  type GuideOutline,
} from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("how-to-preorder-pokemon-tcg")!;

/** The release calendar's own words for what a release date means (src/app/[region]/releases/page.tsx). */
export const RELEASE_DATE_NOTE = "Release dates are the English-language dates from The Pokémon Company; stores may ship pre-orders a few days either side.";

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const upcoming = upcomingSets(data.today);
  const shown = data.sets.map(setOf).filter((s): s is NonNullable<typeof s> => !!s);
  const later = upcoming.filter((s) => !data.sets.includes(s.code));
  const next = upcoming[0] ?? null;
  const box = fixedPacks("booster-box");
  const bundle = fixedPacks("booster-bundle");
  const [etbNow] = packsBySeries("etb");
  // The US list prices of the next set's series, or of the newest series rrp.ts prices.
  const series = next && msrpSeries().includes(next.series) ? next.series : msrpSeries()[0];
  const ref = series ? regularSet(series) : null;
  const msrp = (t: "booster-box" | "etb" | "booster-bundle") => (ref ? usMsrpCents(t, ref.code) : null);

  return {
    intro: (
      <Lede>
        A pre-order lets you order a set’s products before the set is released. Here’s what a pre-order means on DexCompare, how to compare pre-order prices, what to check
        before you pay, and which sets you can pre-order in {r.inName} right now.
      </Lede>
    ),
    sections: [
      {
        id: "upcoming",
        title: "Upcoming sets and pre-orders",
        live: true,
        body: shown.length ? (
          <>
            <LiveBlock r={r} checked={data.checked}>
              {shown.map((s) => {
                const open = data.openCount[s.code] ?? 0;
                return (
                  <SetGroup key={s.code} title={<SetTitle r={r} set={s} today={data.today} extra={<> · {relativeDay(s.releaseDate, data.today)}</>} />}>
                    <p className="mb-2 text-sm text-muted">
                      {open ? (
                        <>
                          <strong className="font-semibold text-pre">{plural(open, "product")}</strong> open for pre-order in {r.inName} ·{" "}
                          <Link href={setHref(r, s)} prefetch={false} className="font-semibold text-brand hover:underline">
                            See them all →
                          </Link>
                        </>
                      ) : (
                        <>No store we compare in {r.inName} has it open for pre-order right now.</>
                      )}
                    </p>
                    {open > 0 && <PriceTable r={r} caption={`${s.name} pre-orders in ${r.inName}: the cheapest booster box, Elite Trainer Box and booster bundle`} lines={linesFor(data.bySet[s.code], CALENDAR_TYPES, s, true)} whereHead="Open at" />}
                  </SetGroup>
                );
              })}
            </LiveBlock>
            {later.length > 0 && (
              <Prose>
                <p>
                  Also coming:{" "}
                  {later.map((s, i) => (
                    <span key={s.code}>
                      {i > 0 && ", "}
                      <Link href={setHref(r, s)}>{s.name}</Link> ({formatRelease(s.releaseDate)})
                    </span>
                  ))}
                  .
                </p>
              </Prose>
            )}
            <p className="text-xs leading-5 text-muted">
              {RELEASE_DATE_NOTE}{" "}
              <Link href={`/${r.region}/releases`} prefetch={false} className="font-semibold text-brand hover:underline">
                Release calendar →
              </Link>
            </p>
          </>
        ) : (
          <Note>
            No announced set is waiting for release right now. New sets go on the <Link href={`/${r.region}/releases`}>release calendar</Link> as soon as they’re added,
            with the stores taking pre-orders.
          </Note>
        ),
      },
      {
        id: "what-it-means",
        title: "What a pre-order listing means here",
        body: (
          <Prose>
            <p>
              On DexCompare, a product is a pre-order when its set hasn’t been released yet and a store is taking orders for it. It’s marked <strong>Pre-order</strong>{" "}
              where a released product says <strong>In stock</strong>, and it’s compared on price the same way.
            </p>
            <p>
              The date beside each set is its English-language release date from The Pokémon Company. Stores may ship pre-orders a few days either side of it, so
              check the store’s own listing for when it expects to send yours.
            </p>
          </Prose>
        ),
      },
      {
        id: "compare",
        title: "How to compare pre-order prices",
        body: (
          <>
            <Prose>
              <ul>
                <li>
                  <strong>Per pack, not per box.</strong> A <Link href={typeHref(r, "booster-box")}>booster box</Link> holds {box} packs, an{" "}
                  <Link href={typeHref(r, "etb")}>Elite Trainer Box</Link> {etbNow.packs} (in {seriesPhrase(etbNow.series)} sets) and a{" "}
                  <Link href={typeHref(r, "booster-bundle")}>booster bundle</Link> {bundle}, so divide to compare them. The tables above do it for you.
                </li>
                <li>
                  <strong>How many stores are taking orders.</strong> More stores means more prices to compare: every product card shows how many have it open.
                </li>
                <li>
                  <strong>Shipping.</strong> Our prices are each store’s listed price, excluding shipping, so add delivery before you decide.
                </li>
                {r.market === "US" && msrp("booster-box") != null && msrp("etb") != null && msrp("booster-bundle") != null ? (
                  <li>
                    <strong>Against MSRP.</strong> In the US, a {series} booster box lists at {money(msrp("booster-box"), "US")}, an Elite Trainer Box at{" "}
                    {money(msrp("etb"), "US")} and a booster bundle at {money(msrp("booster-bundle"), "US")}. The <Link href={guideHref(r, "pokemon-tcg-msrp")}>MSRP guide</Link> has the
                    full list.
                  </li>
                ) : (
                  <li>
                    <strong>Store against store.</strong> We don’t show a list price for {r.inName}, so the comparison is between the stores themselves.
                  </li>
                )}
              </ul>
            </Prose>
            {r.market === "US" && <MsrpNote />}
          </>
        ),
      },
      {
        id: "checklist",
        title: "Before you pay: a pre-order checklist",
        body: (
          <Checklist
            items={[
              <>
                <strong>Check whether the store charges now or at dispatch</strong>, so you know when the money leaves your account.
              </>,
              <>
                <strong>Check the cancellation and refund terms</strong> for pre-orders, before you place one.
              </>,
              <>
                <strong>Check the expected dispatch date</strong> on the store’s listing, and remember stores may ship a few days either side of the release date.
              </>,
              <>
                <strong>Check delivery:</strong> what it costs, and where the parcel ships from.
              </>,
              <>
                <strong>Check for a per-customer limit</strong> on the product.
              </>,
              <>
                <strong>Check it’s the exact product:</strong> the right set, the right product type, and English-language.
              </>,
              <>
                <strong>Check you have an order confirmation,</strong> and keep it until the parcel arrives.
              </>,
              <>
                <strong>Check the shrink-wrap and seals</strong> when it arrives.
              </>,
            ]}
          />
        ),
      },
      whereToBuy(r, {
        tcg: next ? { query: next.name, label: next.name } : { query: "", label: "Pokémon sealed product" },
        links: [{ href: `/${r.region}/releases`, label: "Release calendar" }],
      }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
