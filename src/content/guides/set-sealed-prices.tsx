// One set's sealed price guide (2026-11-05): everything the region's stores list of a single set, drawn from the set's own open
// products (more-data.ts openOfSets into byType.set, setCountsOf into sets). Three guides share it (Final Fantasy, The Lord of the
// Rings, Avatar: The Last Airbender), each a thin module that names its set code. The guide states no pack count, MSRP or product
// list of its own: the product kinds, their counts and their prices all come from what stores list today, and the set-specific
// prose in `about` says only what is certain about that set.
import type { ReactNode } from "react";
import Link from "@/components/Link";
import type { ProductCardData } from "@/lib/data";
import { money, plural } from "@/lib/format";
import { perPackCents } from "@/lib/packs";
import type { RegionInfo } from "@/lib/regions";
import { formatRelease, isPreorderSet } from "@/lib/release";
import { SET_BY_CODE } from "@/lib/sets";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG, type GuideSlug } from "./index";
import { GuideBody, guideHref, Lede, LiveBlock, NextLinks, productHref, Prose, StackTable, storesPhrase, whereToBuy, type BodyProps, type GuideOutline } from "./kit";
import { CardTable, faqSection, packsOfCard, SetLink } from "./kit-more";

export interface SetGuideSpec {
  slug: GuideSlug;
  code: string;
  /** The short name the prose uses ("Final Fantasy"). */
  short: string;
  /** What is certain about the set's sealed line: one or two paragraphs, no numbers the data does not back. */
  about: () => ReactNode;
  /** The eBay search words for the where-to-buy section. */
  tcgQuery: string;
  /** The type labels to pull out of the table as their own section, in order, when the set has them. */
  focus: readonly string[];
  /** Adds "Which <set> product should you buy?" (MTG-2, 2026-11-10): the buying guides for upcoming sets. */
  which?: boolean;
}


/** The order the type table lists product kinds in: boxes, then packs, then everything else as the data has it. */
const TYPE_ORDER = [
  "Play Booster Box",
  "Draft Booster Box",
  "Set Booster Box",
  "Collector Booster Box",
  "Jumpstart Booster Box",
  "Play Booster Pack",
  "Draft Booster Pack",
  "Set Booster Pack",
  "Collector Booster Pack",
  "Jumpstart Booster Pack",
  "Bundle",
  "Gift Bundle",
  "Special Bundle",
  "Commander Deck",
  "Commander Deck Set",
  "Starter Kit",
  "Prerelease Pack",
  "Scene Box",
  "Deck",
];
const orderOf = (t: string) => {
  const i = TYPE_ORDER.indexOf(t);
  return i < 0 ? TYPE_ORDER.length : i;
};

/** Cheapest open product per type label, in TYPE_ORDER then alphabetical, with how many of that kind are open. */
export function byTypeOf(products: readonly ProductCardData[]): { type: string; cheapest: ProductCardData; open: number }[] {
  const acc = new Map<string, { type: string; cheapest: ProductCardData; open: number }>();
  for (const p of products) {
    const row = acc.get(p.productType);
    if (row) row.open++;
    else acc.set(p.productType, { type: p.productType, cheapest: p, open: 1 });
  }
  return [...acc.values()].sort((a, b) => orderOf(a.type) - orderOf(b.type) || a.type.localeCompare(b.type));
}

export function setGuideOutline(spec: SetGuideSpec, r: RegionInfo, data: GuideData, now: Date = new Date()): GuideOutline {
  const set = SET_BY_CODE.get(spec.code);
  const all = data.byType?.set ?? [];
  const counts = data.sets?.[spec.code];
  const open = counts?.open ?? all.length;
  const listed = counts?.products ?? all.length;
  const types = byTypeOf(all);
  const low = all[0] ?? null;
  const m = (c: number) => money(c, r.market);
  const pre = isPreorderSet(spec.code, now);
  const name = set?.name ?? spec.short;
  const released = set ? formatRelease(set.releaseDate) : null;
  const upcoming = !!set && set.releaseDate > data.today;
  const cheapestOf = (t: string) => all.find((p) => p.productType === t) ?? null;
  const focusRows = spec.focus.map((t) => ({ type: t, products: all.filter((p) => p.productType === t) })).filter((x) => x.products.length);
  return {
    intro: (
      <Lede>
        {low ? (
          <>
            {storesPhrase(r)} have <strong>{plural(open, `${spec.short} sealed product`)}</strong> open today
            {listed > open ? <> (of {listed} listed)</> : null}, across {plural(types.length, "kind")}. The cheapest is{" "}
            <Link href={productHref(r, low)} prefetch={false} className="font-semibold text-brand underline-offset-2 hover:underline">
              {low.name}
            </Link>{" "}
            at <strong>{m(low.lowestPriceCents!)}</strong>, in {r.currency} before shipping.{released ? (upcoming ? <> {name} comes out in English on {released}; stores are taking pre-orders.</> : <> {name} was released in English on {released}{pre ? " and is on pre-order" : ""}.</>) : null}
          </>
        ) : (
          <>
            {name} sealed product
            {released ? <> (English release {released})</> : null}: none is in stock at {storesPhrase(r)} right now. The tables below fill in as soon as a store lists one.
          </>
        )}
      </Lede>
    ),
    sections: [
      {
        id: "by-type",
        title: `Every kind of ${spec.short} sealed product, today`,
        live: true,
        body: (
          <>
            <Prose>
              <p>
                Each kind of {spec.short} product the stores in {r.inName} list, with how many listings are open and the cheapest one. A &ldquo;per pack&rdquo; price is
                shown only where the pack count is certain.
              </p>
            </Prose>
            <LiveBlock r={r} checked={data.checked}>
              {types.length ? (
                <StackTable
                  caption={`${name} sealed products by kind in ${r.inName} today`}
                  head={["Kind", "Open", "Cheapest", "Per pack"]}
                  rows={types.map((t) => {
                    const pp = perPackCents(t.cheapest.lowestPriceCents, packsOfCard(t.cheapest));
                    return {
                      key: t.type,
                      th: <span className="font-semibold">{t.type}</span>,
                      cells: [
                        <span key="n">{t.open}</span>,
                        <Link key="c" href={productHref(r, t.cheapest)} prefetch={false} className="font-semibold text-brand underline-offset-2 hover:underline">
                          {m(t.cheapest.lowestPriceCents!)} <span className="sr-only">for {t.cheapest.name}</span>
                        </Link>,
                        <span key="pp">{pp != null ? m(pp) : "—"}</span>,
                      ],
                    };
                  })}
                />
              ) : null}
            </LiveBlock>
            {set ? <NextLinks links={[{ href: `/${r.region}/sets/${set.slug}`, label: `Every ${spec.short} product in ${r.inName}`, icon: "arrow-right" }]} /> : null}
          </>
        ),
      },
      ...(spec.which ? [whichSection(spec, r, data, cheapestOf, m)] : []),
      {
        id: "cheapest",
        title: `The cheapest ${spec.short} sealed products in ${r.inName}`,
        body: (
          <LiveBlock r={r} checked={data.checked}>
            <CardTable r={r} caption={`The cheapest ${name} sealed products in ${r.inName} today`} products={all.slice(0, 12)} />
          </LiveBlock>
        ),
      },
      ...focusRows.map((x) => ({
        id: x.type.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        title: `${spec.short} ${x.type}s, cheapest first`,
        body: (
          <LiveBlock r={r} checked={data.checked}>
            <CardTable r={r} caption={`${name} ${x.type}s in ${r.inName} today`} products={x.products.slice(0, 10)} />
          </LiveBlock>
        ),
      })),
      {
        id: "about",
        title: `What ${spec.short} sealed product there is`,
        body: (
          <Prose>
            {spec.about()}
            <p>
              {set ? (
                <>
                  The <SetLink r={r} slug={set.slug}>{name} set page</SetLink> lists every product stores have of it, and{" "}
                </>
              ) : (
                <>The set page lists every product stores have of it, and </>
              )}
              <a href={guideHref(r, "magic-sealed-products-explained")}>Magic sealed products explained</a> says what each kind is for.
            </p>
          </Prose>
        ),
      },
      faqSection([
        {
          q: `How much is a ${spec.short} Play Booster box in ${r.inName}?`,
          a: (() => {
            const box = all.find((p) => p.productType === "Play Booster Box");
            return box ? `From ${m(box.lowestPriceCents!)} today (${box.name}) at the stores MTG Compare checks.` : `No ${spec.short} Play Booster box is in stock at the stores we compare right now.`;
          })(),
        },
        {
          q: `How much is a ${spec.short} Collector Booster box in ${r.inName}?`,
          a: (() => {
            const box = all.find((p) => p.productType === "Collector Booster Box");
            return box ? `From ${m(box.lowestPriceCents!)} today (${box.name}). A Collector Booster box holds 12 packs.` : `No ${spec.short} Collector Booster box is in stock at the stores we compare right now.`;
          })(),
        },
        {
          q: `What is the cheapest ${spec.short} sealed product?`,
          a: low ? `${low.name}, at ${m(low.lowestPriceCents!)} today in ${r.inName}.` : `Nothing from ${name} is in stock at the stores we compare right now.`,
        },
        upcoming
          ? { q: `When does ${name} come out?`, a: released ? `In English on ${released}. Stores are taking pre-orders now.` : "The English release date is on the set's page." }
          : { q: `When was ${name} released?`, a: released ? `In English on ${released}.` : "The English release date is on the set's page." },
      ]),
      whereToBuy(r, {
        tcg: { query: spec.tcgQuery, label: `${spec.short} sealed` },
        links: [
          { href: guideHref(r, "universes-beyond-sealed-price-guide"), label: "Universes Beyond sealed price guide" },
          { href: guideHref(r, "mtg-booster-box-prices"), label: "Play Booster box prices" },
        ],
      }),
    ],
  };
}

/**
 * "Which <set> product should you buy?": one line per goal, each with today's cheapest open listing of the product that serves it.
 * Only what is certain about every set's line: a Play Booster box is the packs to open or draft, a Collector Booster box (12 packs)
 * the foil and alternate-art versions and the dearest per pack, a Bundle fewer packs for less, a Commander deck ready to play. A
 * kind no store lists today is left out, not guessed.
 */
function whichSection(spec: SetGuideSpec, r: RegionInfo, data: GuideData, cheapestOf: (t: string) => ProductCardData | null, m: (c: number) => string) {
  const line = (t: string, goal: ReactNode, what: ReactNode) => {
    const p = cheapestOf(t);
    if (!p) return null;
    const pp = perPackCents(p.lowestPriceCents, packsOfCard(p));
    return (
      <li key={t}>
        <strong className="text-ink">{goal}</strong> {what}{" "}
        <Link href={productHref(r, p)} prefetch={false} className="font-semibold text-brand underline-offset-2 hover:underline">
          From {m(p.lowestPriceCents!)}
        </Link>
        {pp != null ? <> ({m(pp)} a pack)</> : null} today.
      </li>
    );
  };
  const items = [
    line("Play Booster Box", "To open packs or draft with friends:", "a Play Booster box, the set's main booster box."),
    line("Collector Booster Box", "For the foil and alternate-art cards:", "a Collector Booster box, 12 packs and the dearest per pack."),
    line("Bundle", "For a smaller start or a gift:", "a Bundle, fewer packs for less money."),
    line("Commander Deck", "To play Commander out of the box:", "one of the set's Commander decks, ready to play."),
    line("Play Booster Pack", "To try the set:", "a single Play Booster pack."),
  ].filter(Boolean);
  return {
    id: "which",
    title: `Which ${spec.short} product should you buy?`,
    live: true,
    body: (
      <>
        <Prose>
          <p>It depends on what you want from the set. Each line is the cheapest open listing of that kind in {r.inName} today, before shipping.</p>
        </Prose>
        <LiveBlock r={r} checked={data.checked}>
          {items.length ? <ul className="list-disc space-y-2 pl-5 text-sm">{items}</ul> : <p className="text-sm text-muted">No store in {r.inName} lists {spec.short} sealed product yet.</p>}
        </LiveBlock>
        <Prose>
          <p>
            <a href={guideHref(r, "play-booster-vs-collector-booster-vs-bundle")}>Play Booster vs Collector Booster vs Bundle</a> compares the three in more detail.
          </p>
        </Prose>
      </>
    ),
  };
}

export function setGuideBody(spec: SetGuideSpec) {
  const guide = GUIDE_BY_SLUG.get(spec.slug)!;
  return function Body({ r, data }: BodyProps) {
    return <GuideBody guide={guide} r={r} outline={setGuideOutline(spec, r, data)} />;
  };
}
