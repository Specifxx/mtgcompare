// The body of "Pokémon booster box prices by country" (/guides/pokemon-booster-box-prices-by-country): the lead set's booster box in
// every market, the recent sets' boxes, the lead set's ETB and bundle, how to compare across currencies, why prices differ, importing,
// links into every region, and the FAQ. Built from the guides' kit (sections with anchored H2s, stacking tables), with no ad unit and no
// affiliate link: it links to product, pre-order and region pages only. Pure functions of CountryData (src/content/guides/
// country-prices-data.ts), so tests render it from fixtures. No JSX runs when this module loads.
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Checked, Lede, Note, PACK_SOURCE, Prose, StackTable, type GuideSection } from "./kit";
import { money } from "@/lib/format";
import { preorderPath } from "@/lib/preorder-guides";
import { REGION_LIST, type RegionInfo } from "@/lib/regions";
import { formatRelease } from "@/lib/release";
import { RRP_NOTE, usMsrpCents } from "@/lib/rrp";
import type { PokemonSet } from "@/lib/sets";
import type { CountryData } from "./country-prices-data";
import { BOX, countryFaqs, leadSummary, marketLines, setByCode, whereOpen, type MarketLine } from "./country-prices";

/** A small count in words ("seven markets"). */
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const inWords = (n: number) => WORDS[n] ?? String(n);

/** The block every live table sits in: "Today in seven markets", when the stores were read, the table. */
function MarketsBlock({ checked, children, footer }: { checked: string | null; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="card my-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-raised px-4 py-2.5 sm:px-5">
        <span className="eyebrow flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-open" />
          Today in {inWords(REGION_LIST.length)} markets
        </span>
        {checked && (
          <span className="text-xs text-muted">
            <Checked iso={checked} />
          </span>
        )}
      </div>
      <div className="px-4 py-4 sm:px-5">{children}</div>
      {footer && <div className="border-t border-line px-4 py-3 text-xs leading-5 text-muted sm:px-5">{footer}</div>}
    </div>
  );
}

/** Where a market's row links: the region's pre-order page for an upcoming set that has one, else the product page, else the set page. */
function rowHref(l: MarketLine, set: PokemonSet, today: string): string {
  const pre = set.releaseDate > today ? preorderPath(l.r.region, set.code) : null;
  return pre ?? (l.p ? `/${l.r.region}/p/${l.p.slug}` : `/${l.r.region}/sets/${set.slug}`);
}

/** A market's header cell: its flag and name, linked into that region. */
function MarketTh({ r, href, sub }: { r: RegionInfo; href: string; sub?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <Link href={href} prefetch={false} className="font-semibold text-ink hover:text-brand hover:underline">
        <span aria-hidden="true">{r.flag}</span> {r.name}
      </Link>
      {sub && <span className="truncate text-xs text-muted">{sub}</span>}
    </span>
  );
}

/** One set's booster box in every market: price in the market's own currency, per pack, where it is open; US MSRP on the US row only. */
function BoxTable({ set, lines, today }: { set: PokemonSet; lines: MarketLine[]; today: string }) {
  const pre = set.releaseDate > today;
  return (
    <StackTable
      caption={`${set.name} booster box: the cheapest ${pre ? "pre-order" : "in-stock price"} in each market, in its own currency`}
      head={["Market", pre ? "Cheapest pre-order" : "Cheapest today", "Per pack", "Open at"]}
      rows={lines.map((l) => {
        const msrp = l.r.market === "US" ? usMsrpCents("booster-box", set.code) : null;
        return {
          key: l.r.region,
          type: "booster-box",
          th: <MarketTh r={l.r} href={rowHref(l, set, today)} sub={l.p ? l.r.currency : undefined} />,
          cells: l.p
            ? [
                <span key="p" className="flex flex-col">
                  <span className="font-semibold">{money(l.p.lowestPriceCents, l.r.market)}</span>
                  {msrp != null && <span className="text-xs font-normal text-muted">US MSRP {money(msrp, "US")}</span>}
                </span>,
                <span key="pp">{l.perPack != null ? money(l.perPack, l.r.market) : "—"}</span>,
                <span key="w" className="text-muted">
                  {whereOpen(l.p)}
                </span>,
              ]
            : [
                <span key="m" className="text-faint">
                  {pre ? "No pre-orders right now" : "None in stock right now"}
                </span>,
                <span key="a" className="text-faint">
                  —
                </span>,
                <span key="b" className="text-faint">
                  —
                </span>,
              ],
        };
      })}
    />
  );
}

/** A set's heading inside a block: its name and its release date. */
function SetHead({ set, today }: { set: PokemonSet; today: string }) {
  const pre = set.releaseDate > today;
  return (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <h3 className="font-display text-lg font-bold leading-snug">{set.name} booster box</h3>
      <span className="text-xs text-muted">
        {pre ? "Releases" : "Released"} <time dateTime={set.releaseDate}>{formatRelease(set.releaseDate)}</time>
        {pre && " · pre-orders"}
      </span>
    </div>
  );
}

const footnote = (us: boolean) => (
  <>
    Each market’s cheapest open listing (in stock, or a pre-order before release), the store’s own price in its own currency, excluding shipping; never converted. In
    the US the cheapest can be TCGplayer’s. Per pack: the price ÷ the packs inside. {PACK_SOURCE}
    {us && <> {RRP_NOTE}</>}
  </>
);

/** The page's outline: its intro and its H2 sections (the table of contents is built from them). */
export function countryOutline(data: CountryData): { intro: ReactNode; sections: GuideSection[] } {
  const sets = data.sets.map(setByCode).filter((s): s is PokemonSet => !!s);
  const lead = sets[0] ?? null;
  const leadLines = lead ? marketLines(data.cards, lead.code, BOX) : [];
  const summary = lead ? leadSummary(lead, leadLines, data.today) : null;
  // RRP_NOTE goes under a table only when its US row printed an MSRP (the US has the product open, and rrp.ts prices it).
  const usMsrp = (code: string) => usMsrpCents("booster-box", code) != null && !!marketLines(data.cards, code, BOX).find((l) => l.r.market === "US")?.p;
  const etb = lead ? marketLines(data.cards, lead.code, "Elite Trainer Box") : [];
  const bundle = lead ? marketLines(data.cards, lead.code, "Booster Bundle") : [];
  const faqs = countryFaqs(lead ? { set: lead, lines: leadLines } : null, data.today);

  const sections: GuideSection[] = [];
  if (lead) {
    const pre = lead.releaseDate > data.today;
    sections.push({
      id: "lead-set",
      title: `${lead.name} booster box in each country`,
      live: true,
      body: (
        <>
          <Prose>
            <p>
              {pre ? (
                <>
                  {lead.name} releases on <strong>{formatRelease(lead.releaseDate)}</strong>, so these are pre-order prices.
                </>
              ) : (
                <>The newest set sold as a booster box, in stock today.</>
              )}{" "}
              {summary}
            </p>
          </Prose>
          <MarketsBlock checked={data.checked} footer={footnote(usMsrp(lead.code))}>
            <BoxTable set={lead} lines={leadLines} today={data.today} />
          </MarketsBlock>
        </>
      ),
    });
  }
  const recent = sets.slice(1);
  if (recent.length) {
    sections.push({
      id: "recent-sets",
      title: "Recent sets: the booster box in each country",
      body: (
        <>
          <Prose>
            <p>The same comparison for the {recent.length === 1 ? "previous set" : `${inWords(recent.length)} sets before it`}: what each market’s cheapest box costs today, and per pack.</p>
          </Prose>
          <MarketsBlock checked={data.checked} footer={footnote(recent.some((s) => usMsrp(s.code)))}>
            {recent.map((s) => (
              <div key={s.code} className="border-t border-line pt-5 first:border-0 first:pt-0 [&+&]:mt-6">
                <SetHead set={s} today={data.today} />
                <BoxTable set={s} lines={marketLines(data.cards, s.code, BOX)} today={data.today} />
              </div>
            ))}
          </MarketsBlock>
        </>
      ),
    });
  }
  if (lead && (etb.some((l) => l.p) || bundle.some((l) => l.p))) {
    const pre = lead.releaseDate > data.today;
    const cell = (l: MarketLine, type: "etb" | "booster-bundle") => {
      if (!l.p) return <span className="text-faint">{pre ? "No pre-orders" : "None in stock"}</span>;
      const msrp = l.r.market === "US" ? usMsrpCents(type, lead.code) : null;
      return (
        <span className="flex flex-col">
          <Link href={`/${l.r.region}/p/${l.p.slug}`} prefetch={false} className="font-semibold hover:text-brand hover:underline">
            {money(l.p.lowestPriceCents, l.r.market)}
          </Link>
          <span className="text-xs text-muted">
            {l.perPack != null ? `${money(l.perPack, l.r.market)} a pack` : ""}
            {msrp != null && ` · US MSRP ${money(msrp, "US")}`}
          </span>
        </span>
      );
    };
    sections.push({
      id: "etb-and-bundle",
      title: `${lead.name} Elite Trainer Box and booster bundle by country`,
      body: (
        <>
          <Prose>
            <p>
              A country’s price for a box says little about its price for an Elite Trainer Box or a bundle: each product is priced on its own. Here are {lead.name}’s,{" "}
              {pre ? "on pre-order" : "in stock"} today.
            </p>
          </Prose>
          <MarketsBlock
            checked={data.checked}
            footer={footnote(
              (usMsrpCents("etb", lead.code) != null && !!etb.find((l) => l.r.market === "US")?.p) || (usMsrpCents("booster-bundle", lead.code) != null && !!bundle.find((l) => l.r.market === "US")?.p),
            )}
          >
            <StackTable
              caption={`${lead.name}: the cheapest Elite Trainer Box and booster bundle in each market, in its own currency`}
              head={["Market", "Elite Trainer Box", "Booster bundle"]}
              rows={REGION_LIST.map((r, i) => ({
                key: r.region,
                th: <MarketTh r={r} href={preorderPath(r.region, lead.code) ?? `/${r.region}/sets/${lead.slug}`} sub={r.currency} />,
                cells: [cell(etb[i], "etb"), cell(bundle[i], "booster-bundle")],
              }))}
            />
          </MarketsBlock>
        </>
      ),
    });
  }

  sections.push(
    {
      id: "comparing",
      title: "How to compare prices across countries",
      body: (
        <>
          <Prose>
            <p>
              <strong>We don’t convert currencies.</strong> Exchange rates move every day, and the rate you pay is your bank’s or your card’s, so every price here is the
              store’s own, in its own currency. That’s why this page never names a “cheapest country”. To compare two markets yourself:
            </p>
            <ol>
              <li>Convert the per-pack price at your card’s rate on the day.</li>
              <li>
                Add tax where the price leaves it out. Prices in Australia, New Zealand, the UK, the eurozone and Singapore usually include GST or VAT; US and Canadian
                prices usually don’t, and tax is added at checkout.
              </li>
              <li>Add shipping to your address, and any import tax or duty your country charges.</li>
            </ol>
          </Prose>
          <Note>Store prices change between our reads, so compare on the day you buy, and treat a store’s own page as final.</Note>
        </>
      ),
    },
    {
      id: "why-prices-differ",
      title: "Why prices differ between countries",
      body: (
        <Prose>
          <ul>
            <li>
              <strong>Distribution.</strong> Each country gets its stock through its own distributors, at its own wholesale prices and allocations.
            </li>
            <li>
              <strong>Tax.</strong> A price that includes GST or VAT and one that doesn’t aren’t the same kind of number.
            </li>
            <li>
              <strong>Currency.</strong> A box priced in Australian dollars or pounds drifts against the US dollar from week to week, even if the store never changes its
              price.
            </li>
            <li>
              <strong>Competition.</strong> The more stores sell the same box, the more chances one of them prices it low: the “Open at” column shows how many do.
            </li>
            <li>
              <strong>Stock timing.</strong> Around release week, a store with little stock can ask more for it.
            </li>
          </ul>
        </Prose>
      ),
    },
    {
      id: "importing",
      title: "Should you import a booster box?",
      body: (
        <Prose>
          <p>Before you order a box from another country, add up:</p>
          <ul>
            <li>
              <strong>International shipping.</strong> A booster box is a bulky parcel, and shipping it overseas often costs more than the difference in price.
            </li>
            <li>
              <strong>Import tax and duty.</strong> Your country may charge them on arrival: check your customs authority’s current rules for the value you’d import.
            </li>
            <li>
              <strong>Returns.</strong> Sending a damaged or resealed box back overseas is slow and costly.
            </li>
            <li>
              <strong>Release timing.</strong> English sets share a release date, but stock reaches each country at its own pace.
            </li>
          </ul>
          <p>Import only when the delivered price beats your local cheapest by enough to cover the risk. For a single box, that’s rare.</p>
        </Prose>
      ),
    },
    {
      id: "your-country",
      title: "Find the cheapest box in your country",
      body: (
        <>
          <Prose>
            <p>Every market has its own pages, in its own currency: today’s booster boxes, the cheapest price per pack, and the release calendar.</p>
          </Prose>
          <ul role="list" className="my-5 grid gap-3 sm:grid-cols-2">
            {REGION_LIST.map((r) => (
              <li key={r.region} className="card p-4">
                <Link href={`/${r.region}`} prefetch={false} className="font-display text-lg font-bold hover:text-brand hover:underline">
                  <span aria-hidden="true">{r.flag}</span> {r.name}
                </Link>
                <span className="ml-2 text-xs text-muted">{r.currency}</span>
                <ul role="list" className="mt-2 flex flex-wrap gap-2">
                  <li>
                    <Link href={`/${r.region}/type/booster-boxes`} prefetch={false} className="chip min-h-10">
                      Booster boxes
                    </Link>
                  </li>
                  <li>
                    <Link href={`/${r.region}/cheapest-packs`} prefetch={false} className="chip min-h-10">
                      Cheapest per pack
                    </Link>
                  </li>
                  <li>
                    <Link href={`/${r.region}/releases`} prefetch={false} className="chip min-h-10">
                      Releases
                    </Link>
                  </li>
                </ul>
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      id: "faq",
      title: "Questions",
      body: (
        <div className="grid gap-3">
          {faqs.map((f) => (
            <details key={f.q} className="card p-5">
              <summary className="cursor-pointer font-semibold">{f.q}</summary>
              <p className="mt-2 text-sm leading-6 text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      ),
    },
  );

  return {
    intro: (
      <Lede>
        DexCompare compares Pokémon sealed prices in {inWords(REGION_LIST.length)} markets: {REGION_LIST.map((r) => r.inName).join(", ").replace(/, ([^,]*)$/, " and $1")}. Here’s
        what the same booster box costs in each today, in each market’s own currency and per pack, and how to compare them fairly.
      </Lede>
    ),
    sections,
  };
}

/** The article's body: the intro, then each section under its anchored H2. */
export function CountryBody({ data }: { data: CountryData }) {
  const { intro, sections } = countryOutline(data);
  return (
    <>
      <div className="mt-8">{intro}</div>
      {sections.map((s) => (
        <Fragment key={s.id}>
          <section aria-labelledby={s.id} className="mt-12">
            <h2 id={s.id} className="mb-4 font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {s.title}
            </h2>
            {s.body}
          </section>
        </Fragment>
      ))}
    </>
  );
}
