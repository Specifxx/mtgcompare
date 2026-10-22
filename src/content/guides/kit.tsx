// The pieces every guide is built from, so the guides read and behave as one series: sections with anchored H2s (the table of
// contents is built from them), live blocks that say when the prices were checked, tables that stack on a phone, the one eBay
// strip, and the closing "Where to buy" with the US TCGplayer link. Server components (Ago and EbayStrip are client islands).
//
// Running text sits in prose blocks (<Prose>); the tables, cards and the strip sit between them, never inside: the prose class
// styles every descendant <a>, <p> and <ul>, which would underline a card's link and put bullets on a row of chips.
//
// No JSX runs when this module loads (the tests set globalThis.React after their imports): everything here is a function.
import Link from "@/components/Link";
import { Fragment, type ReactNode } from "react";
import { AdSenseUnit } from "@/components/AdSenseUnit";
import { Ago } from "@/components/Ago";
import { EbayStrip } from "@/components/EbayStrip";
import { Icon } from "@/components/Icon";
import { OutboundLink } from "@/components/OutboundLink";
import { ADSENSE_CLIENT, ADSENSE_GUIDE_SLOT } from "@/lib/adsense";
import { AFFILIATE_NOTE_SHORT, REL_SPONSORED, TCGPLAYER_RETAILER, tcgplayerSearchUrl } from "@/lib/affiliate";
import type { ProductCardData } from "@/lib/data";
import { money, plural, timeAgo } from "@/lib/format";
import type { RegionInfo } from "@/lib/regions";
import { formatRelease } from "@/lib/release";
import { TYPE_BY_KEY } from "@/lib/sealed-title";
import { familyOf, perPackOf, whereText } from "../families";
export { whereText };
import type { GuideData } from "./data";
import type { Guide } from "./index";


// ─── The shape of a guide module ───────────────────────────────────────────────

/** One H2 of a guide: its anchor, its heading (also the table of contents' entry) and what follows it. */
export interface GuideSection {
  id: string;
  title: string;
  /** A block of the region's live prices. The guide's one eBay strip goes after the first. */
  live?: boolean;
  body: ReactNode;
}

export interface GuideOutline {
  /** What comes before the first H2: the answer in a sentence or two. */
  intro: ReactNode;
  sections: GuideSection[];
}

export interface BodyProps {
  r: RegionInfo;
  data: GuideData;
}

/** A guide module (src/content/guides/<slug>.tsx). */
export interface GuideModule {
  outline: (r: RegionInfo, data: GuideData) => GuideOutline;
  Body: (props: BodyProps) => ReactNode;
}

/** Where the strip goes: after the first live section, or after the first section when a guide has none. */
export function stripIndex(sections: readonly GuideSection[]): number {
  return Math.max(0, sections.findIndex((s) => s.live));
}

/**
 * Where the guide's AdSense unit goes (only when lib/adsense.ts has a guide slot): after the section two past the eBay strip, so the
 * two units are at least two sections apart, and never after the closing "Where to buy". -1: the guide is too short for one.
 */
export function adsenseIndex(sections: readonly GuideSection[]): number {
  const i = stripIndex(sections) + 2;
  return i < sections.length - 1 ? i : -1;
}

/** The article's body: the intro, then each section under its anchored H2, with the guide's one eBay strip after the first live block. */
export function GuideBody({ guide, r, outline }: { guide: Guide; r: RegionInfo; outline: GuideOutline }) {
  const at = stripIndex(outline.sections);
  const adAt = ADSENSE_CLIENT && ADSENSE_GUIDE_SLOT ? adsenseIndex(outline.sections) : -1;
  return (
    <>
      <div className="mt-8">{outline.intro}</div>
      {outline.sections.map((s, i) => (
        <Fragment key={s.id}>
          <section aria-labelledby={s.id} className="mt-12">
            <h2 id={s.id} className="mb-4 font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {s.title}
            </h2>
            {s.body}
          </section>
          {i === at && <GuideStrip guide={guide} r={r} />}
          {i === adAt && <AdSenseUnit client={ADSENSE_CLIENT!} slot={ADSENSE_GUIDE_SLOT!} placement="adsense-guide" />}
        </Fragment>
      ))}
    </>
  );
}

// ─── Text ──────────────────────────────────────────────────────────────────────

/** Running text, in the site's prose style. */
export function Prose({ children }: { children: ReactNode }) {
  return <div className="prose-dex [&_strong]:font-semibold [&_strong]:text-ink">{children}</div>;
}

/** The opening answer: a little larger than the prose under it. */
export function Lede({ children }: { children: ReactNode }) {
  return <p className="text-lg leading-8 text-ink/80 [&_strong]:font-semibold [&_strong]:text-ink">{children}</p>;
}

/** A quiet aside: an info icon and a sentence or two. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 flex gap-3 rounded-xl border border-line bg-raised p-4 text-sm leading-6 text-muted">
      <Icon name="info" size={18} className="mt-0.5 shrink-0 text-faint" />
      <div className="min-w-0 [&_a]:font-medium [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold [&_strong]:text-ink">{children}</div>
    </div>
  );
}


// ─── Links ─────────────────────────────────────────────────────────────────────

/** A product type's page, or null when the type table has no such key (the table is the importer's: lib/sealed-title.ts). */
export const typeHref = (r: RegionInfo, type: string): string | null => {
  const t = (TYPE_BY_KEY as ReadonlyMap<string, { slug: string }>).get(type);
  return t ? `/${r.region}/type/${t.slug}` : null;
};
export const productHref = (r: RegionInfo, p: Pick<ProductCardData, "slug">) => `/${r.region}/p/${p.slug}`;
export const guideHref = (r: RegionInfo, slug: string) => `/${r.region}/guides/${slug}`;

/** A row of internal links as quiet buttons: the next step after a section. */
export function NextLinks({ links }: { links: { href: string; label: string; icon?: "tag" | "store" | "calendar" | "arrow-right" | "search" }[] }) {
  return (
    <ul role="list" className="my-5 flex flex-wrap gap-2">
      {links.map((l) => (
        <li key={l.href}>
          <Link href={l.href} prefetch={false} className="btn-ghost min-h-11 px-4">
            {l.icon && <Icon name={l.icon} size={16} className="text-muted" />}
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ─── Live blocks ───────────────────────────────────────────────────────────────

/** "Prices checked 2 hours ago": the server's value, corrected in the browser (cached pages render once per import). */
export function Checked({ iso }: { iso: string | null }) {
  if (!iso) return null;
  return (
    <>
      Prices checked <Ago iso={iso} initial={timeAgo(iso)} />
    </>
  );
}

/** A block of the region's live prices: what it is, when the prices were checked, the content, and where to go next. */
export function LiveBlock({ r, checked, title, children, footer }: { r: RegionInfo; checked: string | null; title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="card my-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-raised px-4 py-2.5 sm:px-5">
        <span className="eyebrow flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-open" />
          Today in {r.inName}
        </span>
        {checked && (
          <span className="text-xs text-muted">
            <Checked iso={checked} />
          </span>
        )}
      </div>
      <div className="px-4 py-4 sm:px-5">
        {title && <div className="mb-3">{title}</div>}
        {children}
      </div>
      {footer && <div className="border-t border-line px-4 py-3 text-sm sm:px-5">{footer}</div>}
    </div>
  );
}


/** One set's part of a live block that covers several: a rule between sets, its heading, then its table. */
export function SetGroup({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="border-t border-line pt-5 first:border-0 first:pt-0 [&+&]:mt-6">
      <div className="mb-2">{title}</div>
      {children}
    </div>
  );
}

/** "Cheapest per pack": the badge on the row a buyer is looking for. */
export function CheapestBadge({ children = "Cheapest per pack" }: { children?: ReactNode }) {
  return <span className="whitespace-nowrap rounded-full border border-open/40 bg-surface px-2 py-0.5 text-[11px] font-bold text-open">{children}</span>;
}


const COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };
const SPAN: Record<number, string> = { 1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4" };

export interface StackRow {
  key: string;
  /** The row's header cell: what the row is (a product type, a product). */
  th: ReactNode;
  cells: ReactNode[];
  highlight?: boolean;
  /** For the tests and the sweep: the product type key the row is about. */
  type?: string;
  /** In a compact table, on a phone: the value goes under the row's header instead of beside it (a list of counts, say). */
  wide?: boolean;
}

/**
 * A table that stays a table from sm up and stacks on a phone: each row becomes a block, its header cell on top and each value
 * under a small label (the column's heading, shown only there). No horizontal scrolling at 320 px. A `compact` table (one value
 * column) keeps its value beside the header on a phone, with no label, or under it for a `wide` row.
 */
export function StackTable({ caption, head, rows, align = "right", compact = false }: { caption: string; head: string[]; rows: StackRow[]; align?: "right" | "left"; compact?: boolean }) {
  const n = head.length - 1;
  const num = align === "right" ? "sm:text-right" : "";
  return (
    <table className="block w-full text-sm sm:table">
      <caption className="sr-only">{caption}</caption>
      <thead className="hidden sm:table-header-group">
        <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
          {head.map((h, i) => (
            <th key={h} scope="col" className={`whitespace-nowrap pb-2 font-semibold ${i ? `pl-3 ${num}` : `pr-3 ${compact ? "sm:w-1/2" : ""}`}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="block sm:table-row-group">
        {rows.map((row) => {
          const inline = compact && !row.wide;
          const grid = compact ? "grid-cols-[minmax(0,1fr)_auto]" : COLS[n] ?? "grid-cols-3";
          const span = compact ? (row.wide ? "col-span-2" : "col-span-1") : SPAN[n] ?? "col-span-3";
          return (
            <tr
              key={row.key}
              data-type={row.type}
              className={`grid ${grid} items-start gap-x-3 gap-y-2 border-b border-line px-2 py-3 last:border-0 sm:table-row sm:px-0 ${row.highlight ? "rounded-lg bg-open-soft/50 sm:rounded-none" : ""}`}
            >
              <th scope="row" className={`${span} text-left align-top font-normal sm:py-3 sm:pl-2 sm:pr-3`}>
                {row.th}
              </th>
              {row.cells.map((c, i) => (
                <td
                  key={i}
                  className={`tabular min-w-0 align-top sm:py-3 sm:pl-3 ${num} ${i === row.cells.length - 1 ? "sm:pr-2" : ""} ${inline ? `text-right ${align === "left" ? "sm:text-left" : ""}` : ""} ${compact && row.wide ? "col-span-2" : ""}`}
                >
                  {!compact && <span className="block text-[11px] uppercase tracking-wide text-faint sm:hidden">{head[i + 1]}</span>}
                  {c}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** A row's header cell: what the row is, then the product's own name as the link to its page. */
export function ProductTh({ r, label, p, badge }: { r: RegionInfo; label: string; p: ProductCardData | null; badge?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-ink">
        {label} {badge}
      </span>
      {p && (
        <Link href={productHref(r, p)} prefetch={false} className="truncate text-xs font-medium text-brand underline-offset-2 hover:underline">
          {p.name}
        </Link>
      )}
    </span>
  );
}

/** One row of a live price table: a product, or why there is none. */
export interface PriceLine {
  label: string;
  p: ProductCardData | null;
  missing?: string;
}

/**
 * The live price table: per line, the product, its price, its price per pack (only where the pack count is known: lib/../live.ts
 * packsOf) and where it is open. The cheapest per pack is marked when two or more lines have one.
 */
export function PriceTable({ r, caption, lines, whereHead = "In stock at" }: { r: RegionInfo; caption: string; lines: PriceLine[]; whereHead?: string }) {
  const packs = lines.map((l) => (l.p ? perPackOf(l.p) : null));
  const known = packs.filter((x): x is number => x != null);
  const floor = known.length > 1 ? Math.min(...known) : null;
  return (
    <StackTable
      caption={caption}
      head={["Product", "Price", "Per pack", whereHead]}
      rows={lines.map((l, i) => {
        if (!l.p) {
          return {
            key: `${l.label}-${i}`,
            th: <ProductTh r={r} label={l.label} p={null} />,
            cells: [<span key="m" className="text-faint">{l.missing ?? "None in stock right now"}</span>, <span key="a" className="text-faint">—</span>, <span key="b" className="text-faint">—</span>],
          };
        }
        const best = floor != null && packs[i] === floor;
        return {
          key: `${l.label}-${l.p.slug}`,
          type: familyOf(l.p.name)?.key,
          highlight: best,
          th: <ProductTh r={r} label={l.label} p={l.p} badge={best ? <CheapestBadge /> : undefined} />,
          cells: [
            <span key="p" className="font-semibold">{money(l.p.lowestPriceCents, r.market)}</span>,
            <span key="pp">{packs[i] != null ? money(packs[i], r.market) : "—"}</span>,
            <span key="w" className="text-muted">{whereText(l.p)}</span>,
          ],
        };
      })}
    />
  );
}

/** Lines for a list of products under one label each (their family's name, else the given label). */
export function linesOf(products: readonly ProductCardData[] | undefined, label: string, missing?: string): PriceLine[] {
  if (!products?.length) return [{ label, p: null, missing }];
  return products.map((p) => ({ label: familyOf(p.name)?.label ?? label, p }));
}

/** "the US stores and TCGplayer" / "Australian stores": who the live prices come from. */
export const storesPhrase = (r: RegionInfo) => (r.market === "US" ? "US stores and TCGplayer" : `${r.adjective} stores`);

/** A block's empty state: said, never hidden. */
export function NoneYet({ children = "Nothing in stock at the stores we compare right now." }: { children?: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

// ─── Lists ─────────────────────────────────────────────────────────────────────

/** A checklist: each item a check to make, with a tick. */
export function Checklist({ items }: { items: ReactNode[] }) {
  return (
    <ol className="my-6 grid gap-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 rounded-xl border border-line bg-surface p-3.5 text-[15px] leading-6 text-ink/90">
          <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-open-soft text-open">
            <Icon name="check" size={14} strokeWidth={2.5} />
          </span>
          <span className="min-w-0">{it}</span>
        </li>
      ))}
    </ol>
  );
}

/** "If you… → consider…": a decision list, two columns from sm. */
export function Decisions({ rows }: { rows: { when: ReactNode; then: ReactNode }[] }) {
  return (
    <dl className="my-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {rows.map((row, i) => (
        <div key={i} className="grid gap-1 p-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-6">
          <dt className="font-semibold leading-6 text-ink">{row.when}</dt>
          <dd className="text-[15px] leading-6 text-muted [&_a]:font-medium [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold [&_strong]:text-ink">{row.then}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A spec sheet: a big figure beside each line ("36 packs" · what a booster box is). */
export function FactRows({ rows }: { rows: { key: string; figure: ReactNode; unit: string; title: ReactNode; body: ReactNode; type?: string }[] }) {
  return (
    <ul role="list" className="my-6 grid gap-3">
      {rows.map((row) => (
        <li key={row.key} data-type={row.type} className="card flex gap-4 p-4 sm:gap-5 sm:p-5">
          <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center self-start rounded-lg bg-brand-soft text-brand-strong sm:h-20 sm:w-20">
            <span className="tabular font-display text-2xl font-extrabold leading-none sm:text-3xl">{row.figure}</span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide">{row.unit}</span>
          </div>
          <div className="min-w-0">
            <div className="font-display text-lg font-bold leading-snug text-ink">{row.title}</div>
            <div className="mt-1 text-[15px] leading-6 text-muted [&_a]:font-medium [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2">{row.body}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── The strip, and where to buy ───────────────────────────────────────────────

// ─── The strip, and where to buy ───────────────────────────────────────────────

/** The guide's one eBay unit (placement listings-guide): the sealed feed, in the article's narrow column. */
export function GuideStrip({ guide, r }: { guide: Guide; r: RegionInfo }) {
  return (
    <div className="my-10">
      <EbayStrip
        region={r.region}
        context="sealed"
        placement="listings-guide"
        narrow
        headings={{ sealed: guide.ebay.heading }}
        search={{ kind: "sealed", query: guide.ebay.query, label: `Search ${guide.ebay.query} on eBay` }}
      />
    </div>
  );
}

/**
 * The closing section: how the comparison works, what to check with a new store, internal links, and in the US one labelled
 * TCGplayer search (guide-tcgplayer). TCGplayer is a link, not a unit, and its label says "affiliate link" beside it.
 */
export function whereToBuy(r: RegionInfo, opts: { tcg?: { query: string; label: string }; links?: { href: string; label: string }[] } = {}): GuideSection {
  const us = r.market === "US";
  return {
    id: "where-to-buy",
    title: "Where to buy",
    body: (
      <>
        <Prose>
          <p>
            MTG Compare puts {r.adjective} stores{us ? " and TCGplayer" : ""} side by side: each one’s own listed price in {r.currency}, excluding shipping, ranked by
            price and stock. Stores pay nothing to be listed, and commissions never change the order.
          </p>
          <p>
            Buying from a store you haven’t used before? Check its contact details, delivery costs and returns policy first, and check the shrink-wrap and seals when
            your order arrives.
          </p>
        </Prose>
        <NextLinks
          links={[
            { href: `/${r.region}/stores`, label: `Stores in ${r.inName}`, icon: "store" },
            { href: `/${r.region}/deals`, label: "Today’s deals", icon: "tag" },
            ...(opts.links ?? []).map((l) => ({ ...l, icon: "arrow-right" as const })),
          ]}
        />
        {us && opts.tcg && (
          <div className="mt-5 rounded-xl border border-line bg-surface p-4">
            <p className="text-sm leading-6 text-muted">TCGplayer, a US marketplace of many sellers, lists sealed product too.</p>
            <p className="mt-1 text-[15px] leading-6">
              <OutboundLink
                href={tcgplayerSearchUrl(opts.tcg.query, r.region, "guide-tcgplayer")}
                rel={REL_SPONSORED}
                retailer={TCGPLAYER_RETAILER}
                placement="guide-tcgplayer"
                className="inline-flex min-h-11 items-center font-semibold text-brand underline-offset-2 hover:underline"
              >
                Search {opts.tcg.label} on TCGplayer&nbsp;<span aria-hidden="true">↗</span>
              </OutboundLink>{" "}
              <span className="whitespace-nowrap text-xs font-medium text-muted">· affiliate link</span>
            </p>
            <p className="text-xs leading-5 text-muted">{AFFILIATE_NOTE_SHORT}</p>
          </div>
        )}
      </>
    ),
  };
}

// ─── Table of contents ─────────────────────────────────────────────────────────

/** The desktop table of contents: every H2, in order. */
export function Toc({ sections }: { sections: readonly Pick<GuideSection, "id" | "title">[] }) {
  return (
    <nav aria-label="On this page">
      <div className="eyebrow mb-3">On this page</div>
      <ol className="border-l border-line text-sm">
        {sections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className="-ml-px block border-l-2 border-transparent py-1.5 pl-3 leading-5 text-muted hover:border-brand hover:text-ink">
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** The phone table of contents: closed by default, so the answer stays in the first screen. */
export function TocDisclosure({ sections }: { sections: readonly Pick<GuideSection, "id" | "title">[] }) {
  return (
    <details className="card mt-6 lg:hidden">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 font-semibold">
        <span>On this page</span>
        <span className="text-xs font-normal text-muted">{plural(sections.length, "section")}</span>
      </summary>
      <nav aria-label="On this page">
        <ol className="border-t border-line px-2 py-1.5">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="flex min-h-11 items-center rounded-lg px-2 text-[15px] text-muted hover:bg-raised hover:text-ink">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </details>
  );
}

/** A guide as a card (the index, and "More guides"). */
export function GuideCard({ r, guide, headingLevel = 2 }: { r: RegionInfo; guide: Guide; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <Link href={guideHref(r, guide.slug)} prefetch={false} className="card group flex h-full flex-col p-5 transition-shadow hover:shadow-lift sm:p-6">
      <span className="eyebrow">{guide.kicker}</span>
      <H className="mt-2 font-display text-xl font-bold leading-snug tracking-tight group-hover:text-brand">{guide.title}</H>
      <p className="mt-2 flex-1 text-[15px] leading-6 text-muted">{guide.description}</p>
      <span className="mt-4 flex items-center justify-between gap-3 text-xs text-muted">
        <span>
          Updated <time dateTime={guide.updated}>{formatRelease(guide.updated)}</time>
        </span>
        <span className="flex items-center gap-1 font-semibold text-brand">
          Read <Icon name="arrow-right" size={14} />
        </span>
      </span>
    </Link>
  );
}

