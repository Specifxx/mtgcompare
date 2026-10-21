// Guide: the Pokémon Build & Battle Box. What it holds (type-about.ts's words and packs.ts's count; the newest box's deck size and promos
// from its pre-order guide, lib/preorder-guides.ts, each with the report it comes from), the region's live Build & Battle Box prices for
// the newest sets, the next box's Prerelease dates, how a box is used, and what a pack in one costs today against the bundle, ETB and
// booster box of the same set. No US list price for the box anywhere: the reports for Delta Reign's disagree with rrp.ts (the guide's
// `msrp: false`), and the site prints only list prices it can confirm.
import Link from "next/link";
import { cardOpen } from "@/lib/compact";
import type { ProductCardData } from "@/lib/data";
import { money } from "@/lib/format";
import { packsFor } from "@/lib/packs";
import { preorderGuide, preorderPath, type PreorderGuide } from "@/lib/preorder-guides";
import type { RegionInfo } from "@/lib/regions";
import { formatRelease } from "@/lib/release";
import type { PokemonSet } from "@/lib/sets";
import { TYPE_ABOUT } from "@/lib/type-about";
import { BB_COMPARE_TYPES, type GuideData } from "./data";
import { andList, packsBySeries, seriesPhrase } from "./facts";
import { GUIDE_BY_SLUG } from "./index";
import {
  Decisions,
  FactRows,
  GuideBody,
  guideHref,
  Lede,
  LiveBlock,
  linesFor,
  NextLinks,
  Note,
  PACK_SOURCE,
  perPackOf,
  PriceTable,
  Prose,
  productHref,
  SetGroup,
  SetTitle,
  setHref,
  setOf,
  StackTable,
  typeHref,
  whereText,
  whereToBuy,
  type BodyProps,
  type GuideOutline,
  type GuideSection,
} from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("pokemon-build-and-battle-box")!;

/** At most this many sets in the live table: the newest with a Build & Battle Box open here. */
const BB_ROWS = 6;

/** "US stores and TCGplayer" / "Australian stores": who the live prices come from. */
const storesPhrase = (r: RegionInfo) => (r.market === "US" ? "US stores and TCGplayer" : `${r.adjective} stores`);

/** "A, B, C or D". */
const orList = (xs: readonly string[]) => andList(xs, "or");

/** A small count in words ("four promos"), the figure past ten. */
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const inWords = (n: number) => WORDS[n] ?? String(n);

/** Whole days from one ISO date to a later one. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000);

/** The newest of the guide's sets whose pre-order guide describes its Prerelease kit (Delta Reign's: deck size, promos, the report). */
export function kitOf(data: Pick<GuideData, "sets">): { set: PokemonSet; guide: PreorderGuide & { prerelease: NonNullable<PreorderGuide["prerelease"]> } } | null {
  for (const code of data.sets) {
    const set = setOf(code);
    const guide = preorderGuide(code);
    if (set && guide?.prerelease) return { set, guide: guide as PreorderGuide & { prerelease: NonNullable<PreorderGuide["prerelease"]> } };
  }
  return null;
}

/**
 * The data-driven answer to "is it the cheapest way to buy packs?": within one set today, whether the Build & Battle Box or another of
 * the compared products works out cheaper per pack. Null when the box or every other product is missing.
 */
export function perPackVerdict(products: readonly ProductCardData[], set: Pick<PokemonSet, "name">, r: Pick<RegionInfo, "market">): string | null {
  const per = BB_COMPARE_TYPES.map((label) => {
    const p = products.find((x) => x.productType === label && cardOpen(x));
    return { label, perPack: p ? perPackOf(p).perPack : null };
  }).filter((x): x is { label: string; perPack: number } => x.perPack != null);
  const bb = per.find((x) => x.label === "Build & Battle Box");
  const others = per.filter((x) => x.label !== "Build & Battle Box").sort((a, b) => a.perPack - b.perPack);
  if (!bb || !others.length) return null;
  const best = others[0];
  const name = (label: string) => (label === "Elite Trainer Box" ? "the Elite Trainer Box" : `the ${label.toLowerCase()}`);
  if (best.perPack < bb.perPack) {
    return `In ${set.name} today, ${name(best.label)} works out cheaper per pack (${money(best.perPack, r.market)}) than the Build & Battle Box (${money(bb.perPack, r.market)}).`;
  }
  return `In ${set.name} today, the Build & Battle Box is the cheapest per pack of the ${inWords(per.length)} (${money(bb.perPack, r.market)}).`;
}

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const packs = packsFor("build-battle", null) ?? 4;
  const sets = data.sets.map(setOf).filter((s): s is PokemonSet => !!s);
  const kit = kitOf(data);
  const next = kit && kit.set.releaseDate > data.today && kit.guide.prereleaseFrom ? kit : null;
  const kitBox = kit?.guide.products.find((p) => p.type === "build-battle") ?? null;
  const pick = data.cards[0]?.setCode ? setOf(data.cards[0].setCode) : null;
  const stadium = packsBySeries("build-battle-stadium");
  // The table's rows: the sets with a Build & Battle Box open here (a set that never had one, or has none in stock, gets no row).
  const listed = sets
    .map((s) => ({ s, p: (data.bySet[s.code] ?? []).find(cardOpen) ?? null }))
    .filter((x): x is { s: PokemonSet; p: ProductCardData } => !!x.p)
    .slice(0, BB_ROWS);
  const anyUpcoming = listed.some(({ s }) => s.releaseDate > data.today);

  const sections: GuideSection[] = [
    {
      id: "whats-inside",
      title: "What’s in a Build & Battle Box",
      body: (
        <>
          <Prose>
            <p>
              <strong>{TYPE_ABOUT["build-and-battle-boxes"]}</strong>
            </p>
          </Prose>
          <FactRows
            rows={[
              {
                key: "packs",
                type: "build-battle",
                figure: packs,
                unit: "packs",
                title: "Booster packs of the new set",
                body: <>The packs are from the set the box is made for. {PACK_SOURCE}</>,
              },
              kit
                ? {
                    key: "deck",
                    figure: kit.guide.prerelease.deckCards,
                    unit: "cards",
                    title: "A ready-to-play deck",
                    body: (
                      <>
                        In the {kit.set.name} box, a {kit.guide.prerelease.deckCards}-card deck to build the packs’ cards into ({kit.guide.prerelease.source}), smaller than the
                        60-card decks of standard play.
                      </>
                    ),
                  }
                : { key: "deck", figure: 1, unit: "deck", title: "A deck to build on", body: <>The cards to build a deck around the packs, so it can be played straight away.</> },
              {
                key: "promo",
                figure: 1,
                unit: "promo",
                title: "A promo card",
                body: kit ? (
                  <>
                    The {kit.set.name} box comes with one of {inWords(kit.guide.prerelease.promos.length)}: {orList(kit.guide.prerelease.promos)} ({kit.guide.prerelease.source}).
                  </>
                ) : (
                  <>One promo card in each box.</>
                ),
              },
            ]}
          />
        </>
      ),
    },
    {
      id: "prices-today",
      title: `Build & Battle Box prices in ${r.inName} today`,
      live: true,
      body: (
        <>
          <Prose>
            <p>
              The cheapest Build & Battle Box of each of the newest sets at {storesPhrase(r)} right now, and what a pack in it works out to.
              {anyUpcoming && <> A set that isn’t out yet is a pre-order.</>}
            </p>
          </Prose>
          <LiveBlock r={r} checked={data.checked}>
            {listed.length === 0 ? (
              <p className="text-sm leading-6 text-muted">
                No Build & Battle Box is in stock in {r.inName} right now. The type page lists every one, sold out included.
              </p>
            ) : (
            <StackTable
              caption={`The cheapest Build & Battle Box of each new set in ${r.inName} today, with the price per pack`}
              head={["Set", "Price", "Per pack", "In stock at"]}
              rows={listed.map(({ s, p }) => {
                const pre = s.releaseDate > data.today;
                const perPack = perPackOf(p).perPack;
                return {
                  key: s.code,
                  type: "build-battle",
                  th: (
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-ink">
                        <Link href={setHref(r, s)} prefetch={false} className="hover:text-brand hover:underline">
                          {s.name}
                        </Link>
                        {pre && <span className="rounded-full bg-pre-soft px-1.5 text-[11px] font-semibold text-pre">Pre-order</span>}
                      </span>
                      <Link href={productHref(r, p)} prefetch={false} className="truncate text-xs font-medium text-brand underline-offset-2 hover:underline">
                        {p.name}
                      </Link>
                    </span>
                  ),
                  cells: [
                    <span key="p" className="font-semibold">
                      {money(p.lowestPriceCents, r.market)}
                    </span>,
                    <span key="pp">{perPack != null ? money(perPack, r.market) : "—"}</span>,
                    <span key="w" className="text-muted">
                      {whereText(p)}
                    </span>,
                  ],
                };
              })}
            />
            )}
          </LiveBlock>
          <p className="text-xs leading-5 text-muted">
            Each store’s listed price, excluding shipping. The per-pack price is the whole box divided by its {packs} packs; the deck and the promo aren’t priced in.{" "}
            <Link href={typeHref(r, "build-battle")} prefetch={false} className="font-semibold text-brand hover:underline">
              Every Build & Battle Box in {r.inName} →
            </Link>
          </p>
        </>
      ),
    },
  ];

  if (next && kitBox) {
    const { set, guide } = next;
    const pre = preorderPath(r.region, set.code);
    const days = daysBetween(guide.prereleaseFrom!, set.releaseDate);
    sections.push({
      id: "next-box",
      title: `The ${set.name} Build & Battle Box`,
      body: (
        <>
          <Prose>
            <p>
              <strong>It’s sold from {formatRelease(guide.prereleaseFrom!)}</strong> at {guide.prerelease.where}, for the set’s Prerelease events: {days} days before{" "}
              {set.name} is released on {formatRelease(set.releaseDate)}.
            </p>
            <p>
              It holds {kitBox.contents.replace(/:.*$/, "")}. The promos are {andList(guide.prerelease.promos)} ({guide.prerelease.source}).
            </p>
          </Prose>
          <NextLinks
            links={[
              ...(pre ? [{ href: pre, label: `${set.name} pre-order prices`, icon: "tag" as const }] : []),
              { href: setHref(r, set), label: `All ${set.name} products`, icon: "arrow-right" },
            ]}
          />
          {r.market === "US" && (
            <Note>
              We don’t print a US list price for this box: the reports we’ve seen for it differ, and we print only list prices we can confirm. The store prices above are
              today’s.
            </Note>
          )}
        </>
      ),
    });
  }

  sections.push({
    id: "prerelease",
    title: "How a Build & Battle Box is used at a Prerelease",
    body: (
      <>
        <Prose>
          <ol>
            <li>
              <strong>Find a participating store.</strong> Prerelease events run at participating Play! Pokémon stores, and each store sets its own entry and schedule: ask
              what the entry includes.
            </li>
            <li>
              <strong>Open the packs and build.</strong> The cards you pull go into the box’s deck, so you play with the new set from the first game.
            </li>
            <li>
              <strong>Play.</strong> Everyone at the event plays a deck built the same way, from the same set.
            </li>
          </ol>
          <p>
            Not going to a Prerelease? Stores sell Build & Battle Boxes too, before and after release day: the prices above are theirs.
          </p>
        </Prose>
      </>
    ),
  });

  sections.push({
    id: "worth-it",
    title: "Is a Build & Battle Box worth it?",
    body: (
      <>
        {pick && data.cards.length > 0 && (
          <>
            <Prose>
              <p>
                Within one set, here’s what a pack costs in each product at {storesPhrase(r)} today. {pick.name} is the newest set with a Build & Battle Box in stock in{" "}
                {r.inName}.
              </p>
            </Prose>
            <LiveBlock r={r} checked={data.checked}>
              <SetGroup title={<SetTitle r={r} set={pick} today={data.today} />}>
                <PriceTable r={r} caption={`${pick.name}: a Build & Battle Box against its bundle, ETB and booster box in ${r.inName} today, per pack`} lines={linesFor(data.cards, BB_COMPARE_TYPES, pick)} />
              </SetGroup>
            </LiveBlock>
          </>
        )}
        <Decisions
          rows={[
            {
              when: "You want the set early",
              then: next ? (
                <>
                  It’s sold from the Prerelease, before release day: {next.set.name}’s from {formatRelease(next.guide.prereleaseFrom!)},{" "}
                  {daysBetween(next.guide.prereleaseFrom!, next.set.releaseDate)} days early.
                </>
              ) : (
                <>It’s sold from a set’s Prerelease, before release day.</>
              ),
            },
            { when: "You’re new to the game", then: <>It’s a deck to play straight away, with packs to add to it.</> },
            {
              when: "You collect the promos",
              then: kit ? (
                <>
                  Each box holds one promo card; {kit.set.name}’s comes in {inWords(kit.guide.prerelease.promos.length)} versions.
                </>
              ) : (
                <>Each box holds one promo card.</>
              ),
            },
            {
              when: "You want the most packs for your money",
              then: (
                <>
                  {(pick && perPackVerdict(data.cards, pick, r)) || "Compare its price per pack with a bundle or a booster box of the same set before you buy."} The{" "}
                  <Link href={guideHref(r, "cheapest-way-to-buy-pokemon-packs")}>cheapest way to buy packs</Link> guide ranks every product by price per pack.
                </>
              ),
            },
          ]}
        />
      </>
    ),
  });

  if (stadium.length) {
    sections.push({
      id: "stadium",
      title: "Build & Battle Box or Build & Battle Stadium?",
      body: (
        <>
          <Prose>
            <p>
              {TYPE_ABOUT["build-and-battle-stadiums"]} That’s {stadium.map((row) => `${row.packs} packs in ${seriesPhrase(row.series)} sets`).join(", ")}, against the
              box’s {packs}. Not every set has one.
            </p>
          </Prose>
          <NextLinks
            links={[
              { href: typeHref(r, "build-battle-stadium"), label: "Build & Battle Stadiums", icon: "tag" },
              { href: guideHref(r, "how-many-packs-in-pokemon-products"), label: "Packs in every product", icon: "arrow-right" },
            ]}
          />
        </>
      ),
    });
  }

  sections.push({
    id: "buying-safely",
    title: "Buying one safely",
    body: (
      <Prose>
        <p>
          Buy a Build & Battle Box the way you’d buy any sealed product: from a store you trust, checking the wrap and seals when it arrives. A listing of an opened box,
          with the deck but not the packs, isn’t the same product, whatever its price. The{" "}
          <Link href={guideHref(r, "how-to-avoid-resealed-pokemon-products")}>guide to avoiding resealed product</Link> has the checks to make.
        </p>
      </Prose>
    ),
  });

  sections.push(
    whereToBuy(r, {
      tcg: { query: "Build & Battle Box", label: "Pokémon Build & Battle Boxes" },
      links: [{ href: typeHref(r, "build-battle"), label: "Build & Battle Boxes" }],
    }),
  );

  return {
    intro: (
      <Lede>
        A Pokémon Build & Battle Box is the Prerelease kit: <strong>{packs} booster packs</strong> of a new set, a promo card and a deck to build them into. Here’s what’s
        inside, how it’s used, and what a pack in one costs in {r.inName} today against a bundle or an Elite Trainer Box of the same set.
      </Lede>
    ),
    sections,
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
