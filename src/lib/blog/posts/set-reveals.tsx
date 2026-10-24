// Set-reveal posts: the newest and the next Magic set's mythic rares, special treatments and what each sealed product holds, tied to
// the boxes that carry them. Card facts are Scryfall's and Wizards' (src/content/set-reveals.ts, src/content/star-trek.ts); every
// price is a store's live listing. No card prices: the site has none, so a "chase card" here is a mythic rare or a rare treatment
// by Wizards' own numbers, never a value claim.
import Link from "@/components/Link";
import type { ReactNode } from "react";
import type { MarketCard } from "@/content/families";
import {
  CARDS_CHECKED,
  FRA_DATES,
  FRA_MAKEUP,
  FRA_PRODUCTS,
  FRA_TREATMENTS,
  REALITY_FRACTURE_MYTHICS,
  SCRYFALL_FRA,
  SCRYFALL_TRK,
  STAR_TREK_MYTHICS,
  WIZARDS_COLLECTING_FRA,
  WIZARDS_FRA_GALLERY,
  type ScryfallCard,
} from "@/content/set-reveals";
import {
  longDate,
  STAR_TREK_CHECKED,
  STAR_TREK_DATES,
  STAR_TREK_PRODUCTS,
  STAR_TREK_TRADEMARK,
  STAR_TREK_TREATMENTS,
  starTrekLine,
  WIZARDS_COLLECTING_STAR_TREK,
  WIZARDS_STAR_TREK,
} from "@/content/star-trek";
import { money } from "@/lib/format";
import type { PostData } from "../data";
import {
  ByMarket,
  Lede,
  MarketsBlock,
  NoFx,
  Prose,
  StackTable,
  type PostOutline,
  type PostSection,
} from "../kit";

type Source = { label: string; url: string };
const Src = ({ s }: { s: Source }) => (
  <a href={s.url} rel="noopener">
    {s.label}
  </a>
);

function CardGrid({ cards }: { cards: readonly ScryfallCard[] }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {cards.map((c) => (
        <li key={c.number} className="min-w-0">
          <a href={c.url} rel="noopener" className="block">
            {/* Scryfall's own image, hotlinked unmodified. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.image}
              alt={c.name}
              width={146}
              height={204}
              loading="lazy"
              className="h-auto w-full rounded-lg"
            />
            <span className="mt-1 block text-sm font-semibold text-ink">
              {c.name}
            </span>
          </a>
          <span className="block text-xs text-muted">
            #{c.number} · {c.type}
          </span>
        </li>
      ))}
    </ul>
  );
}

function prices(
  d: PostData,
  title: string,
  keep: (p: MarketCard) => boolean = () => true,
  label?: (p: MarketCard) => string,
): PostSection {
  return {
    id: "prices",
    title,
    body: (
      <>
        <MarketsBlock checked={d.checked}>
          <ByMarket cards={d.named} keep={keep} take={10} label={label} />
        </MarketsBlock>
        <NoFx />
      </>
    ),
  };
}

function faq(items: { q: string; a: ReactNode }[]): PostSection {
  return {
    id: "faq",
    title: "FAQ",
    body: (
      <Prose>
        {items.map((i) => (
          <div key={i.q}>
            <h3>{i.q}</h3>
            <p>{i.a}</p>
          </div>
        ))}
      </Prose>
    ),
  };
}

function sources(list: Source[], read: string, extra?: string): PostSection {
  return {
    id: "sources",
    title: "Sources",
    body: (
      <Prose>
        <p>
          {list.map((s, i) => (
            <span key={s.url}>
              {i > 0 && "; "}
              <Src s={s} />
            </span>
          ))}
          . Read {longDate(read)}. Card images are Scryfall’s.
        </p>
        {extra && <p className="text-xs">{extra}</p>}
      </Prose>
    ),
  };
}

function treatmentsList(list: readonly { name: string; what: string }[]) {
  return (
    <Prose>
      <ul>
        {list.map((t) => (
          <li key={t.name}>
            <strong>{t.name}:</strong> {t.what}
          </li>
        ))}
      </ul>
    </Prose>
  );
}

const msrpTable = (
  caption: string,
  rows: readonly { name: string; msrpUsCents: number | null; each: string }[],
  from: string,
) => (
  <>
    <StackTable
      caption={caption}
      head={["Product", "US MSRP"]}
      rows={rows
        .filter((p) => p.msrpUsCents != null)
        .map((p) => ({
          key: p.name,
          th: <span className="font-semibold text-ink">{p.name}</span>,
          cells: [`${money(p.msrpUsCents, "US")} a ${p.each}`],
        }))}
    />
    <p className="mt-2 text-xs leading-5 text-muted">
      Wizards of the Coast’s US list prices, from its {from} article. Stores set
      their own.
    </p>
  </>
);

const stOut = (d: PostData) => d.today >= STAR_TREK_DATES.release;
const stLine = (p: MarketCard) => starTrekLine(p.name)?.name ?? "Star Trek";
const isSt = (names: string[]) => (p: MarketCard) =>
  names.includes(starTrekLine(p.name)?.name ?? "") ||
  /collector booster.*\b(box|display)\b/i.test(p.name);
const ST_PREORDER = "/us/preorders/star-trek";
const ST_SET = "/us/sets/star-trek";
const FRA_SET = "/us/sets/reality-fracture";
const stCollector = STAR_TREK_PRODUCTS.find(
  (p) => p.name === "Collector Booster",
)!;
const fraCollector = FRA_PRODUCTS.find((p) => p.name === "Collector Booster")!;

export const starTrekChase = {
  outline(d: PostData): PostOutline {
    return {
      intro: (
        <Lede>
          Magic: The Gathering | Star Trek {stOut(d) ? "came out" : "comes out"}{" "}
          on <strong>{longDate(STAR_TREK_DATES.release)}</strong>. Its chase
          cards are its {STAR_TREK_MYTHICS.length} main-set mythic rares, from
          Captain Jean-Luc Picard to the Borg Cube, and its rarest treatments: 7
          Signed Headliner cards, about 250 copies of each. Here is every
          mythic, which boxes carry them, and what stores ask for those boxes
          today.
        </Lede>
      ),
      sections: [
        {
          id: "mythics",
          title: `All ${STAR_TREK_MYTHICS.length} Star Trek mythic rares`,
          body: (
            <>
              <Prose>
                <p>
                  The mythic rares Scryfall lists in Star Trek’s main-set
                  numbering, read {longDate(CARDS_CHECKED)}. Each links to its
                  Scryfall page. We show no card prices: MTG Compare compares
                  sealed product only.
                </p>
              </Prose>
              <CardGrid cards={STAR_TREK_MYTHICS} />
            </>
          ),
        },
        {
          id: "treatments",
          title: "The rarest versions: Signed Headliners and Booster Fun",
          body: (
            <>
              {treatmentsList(STAR_TREK_TREATMENTS)}
              <Prose>
                <p>
                  Every one of those treatments is in Collector Boosters; the
                  Signed Headliner cards and the surge foils are in nothing
                  else.
                </p>
              </Prose>
            </>
          ),
        },
        {
          id: "which-box",
          title: "Which box to open for the chase cards",
          body: (
            <Prose>
              <ul>
                <li>
                  <strong>Collector Booster box (12 boosters):</strong> each
                  booster holds{" "}
                  {stCollector.holds.replace(/ 12 boosters to a box\.$/, "")}{" "}
                  The only place for Signed Headliners and surge foils.
                </li>
                <li>
                  <strong>Play Booster box (30 boosters):</strong> one rare or
                  mythic rare per booster, plus a wildcard and a foil of any
                  rarity, and the non-foil Stardates, LCARS, Classic Enterprise
                  and scene cards.
                </li>
                <li>
                  <strong>Beam Me Up Bundle:</strong> 8 Play Boosters and 1
                  Collector Booster, for one Collector Booster without a box.
                </li>
              </ul>
              <p>
                Compare them on the{" "}
                <Link href={ST_PREORDER}>Star Trek pre-order page</Link> or the{" "}
                <Link href={ST_SET}>Star Trek set page</Link>.
              </p>
            </Prose>
          ),
        },
        prices(
          d,
          "Star Trek boxes and boosters: today’s prices",
          isSt([
            "Play Booster",
            "Collector Booster",
            "Beam Me Up Bundle",
            "Bundle",
          ]),
          stLine,
        ),
        faq([
          {
            q: "What are the Star Trek MTG chase cards?",
            a: `By rarity, the ${STAR_TREK_MYTHICS.length} mythic rares above; by print run, the 7 Signed Headliner cards, about 250 copies each, found only in Collector Boosters.`,
          },
          {
            q: "Can you open Signed Headliner cards in Play Boosters?",
            a: "No. Wizards says they are found only in Collector Boosters, of any language, and are always in English.",
          },
          {
            q: "When is Star Trek released?",
            a: `${longDate(STAR_TREK_DATES.release)}, with prerelease events from ${longDate(STAR_TREK_DATES.prerelease.from)} and MTG Arena on ${longDate(STAR_TREK_DATES.arena)}.`,
          },
          {
            q: "How much are Star Trek chase cards worth?",
            a: "We don’t say: MTG Compare tracks sealed product only, and we never guess a card’s price.",
          },
        ]),
        sources(
          [SCRYFALL_TRK, WIZARDS_COLLECTING_STAR_TREK, WIZARDS_STAR_TREK],
          CARDS_CHECKED,
          STAR_TREK_TRADEMARK,
        ),
      ],
    };
  },
};

export const starTrekCollector = {
  outline(d: PostData): PostOutline {
    return {
      intro: (
        <Lede>
          A Star Trek Collector Booster holds 15 cards, five of them rare or
          mythic rare, and is the only booster with the Signed Headliner cards
          and surge foils. Here is what is in each pack, slot by slot, how it
          compares with a Play Booster, and what stores ask for a Collector
          Booster box today.
        </Lede>
      ),
      sections: [
        {
          id: "contents",
          title: "What’s in a Star Trek Collector Booster",
          body: (
            <StackTable
              caption="Star Trek Collector Booster, slot by slot (Wizards)"
              head={["Cards", "Slot"]}
              rows={[
                ["5", "Traditional foil commons"],
                ["3", "Traditional foil uncommons"],
                ["1", "Foil common or uncommon"],
                ["1", "Traditional foil basic land"],
                ["1", "Traditional foil rare or mythic rare"],
                ["1", "Non-foil extended-art rare or mythic rare"],
                ["2", "Booster Fun rares or mythic rares"],
                ["1", "Foil Booster Fun rare or mythic rare"],
                ["1", "Art card or traditional foil double-sided token"],
              ].map(([n, s]) => ({
                key: s,
                th: <span className="font-semibold text-ink">{n}</span>,
                cells: [s],
              }))}
            />
          ),
        },
        {
          id: "fun",
          title: "The Booster Fun you can open",
          body: treatmentsList(STAR_TREK_TREATMENTS),
        },
        {
          id: "vs-play",
          title: "Collector Booster vs Play Booster",
          body: (
            <>
              <Prose>
                <ul>
                  {STAR_TREK_PRODUCTS.filter(
                    (p) =>
                      p.name === "Play Booster" ||
                      p.name === "Collector Booster",
                  ).map((p) => (
                    <li key={p.name}>
                      <strong>{p.name}:</strong> {p.holds}
                    </li>
                  ))}
                </ul>
                <p>
                  Every product is on the{" "}
                  <Link href={ST_PREORDER}>Star Trek pre-order page</Link>.
                </p>
              </Prose>
              {msrpTable(
                "Star Trek booster US MSRP",
                STAR_TREK_PRODUCTS.filter(
                  (p) =>
                    /booster$/i.test(p.name) || p.name === "Beam Me Up Bundle",
                ),
                "Collecting Star Trek",
              )}
            </>
          ),
        },
        prices(
          d,
          "Star Trek Collector Boosters: today’s prices",
          (p) =>
            /collector/i.test(p.name) &&
            !/commander|collector['’]?s edition/i.test(p.name),
          stLine,
        ),
        faq([
          {
            q: "How many cards are in a Star Trek Collector Booster?",
            a: "15 Magic cards, plus an art card or a traditional foil double-sided token.",
          },
          { q: "How many Collector Boosters are in a box?", a: "12." },
          {
            q: "What is the US MSRP of a Star Trek Collector Booster?",
            a: `${money(stCollector.msrpUsCents, "US")} a booster, per Wizards. Wizards sets none for the box.`,
          },
          {
            q: "Is there a Collector Booster in any other Star Trek product?",
            a: "Yes: the Beam Me Up Bundle and Draft Night each hold one.",
          },
        ]),
        sources(
          [WIZARDS_COLLECTING_STAR_TREK, WIZARDS_STAR_TREK],
          STAR_TREK_CHECKED,
          STAR_TREK_TRADEMARK,
        ),
      ],
    };
  },
};

const fraOut = (d: PostData) => d.today >= FRA_DATES.release;

export const fracturesChase = {
  outline(d: PostData): PostOutline {
    return {
      intro: (
        <Lede>
          Reality Fracture {fraOut(d) ? "came out" : "comes out"} on{" "}
          <strong>{longDate(FRA_DATES.release)}</strong> with{" "}
          {FRA_MAKEUP.mythics} mythic rares, including Emrakul, the Exigent
          Doom, Tarmogoyf and The Theorist, Jace Beleren. Its rarest card is the
          serialized Bloodline Recollector: 500 copies, in under 1% of Collector
          Boosters. Here is every mythic, the rare treatments, and which boxes
          carry them.
        </Lede>
      ),
      sections: [
        {
          id: "mythics",
          title: `All ${REALITY_FRACTURE_MYTHICS.length} Reality Fracture mythic rares`,
          body: (
            <>
              <Prose>
                <p>
                  The mythic rares Scryfall lists in Reality Fracture’s main-set
                  numbering, read {longDate(CARDS_CHECKED)}; Wizards counts{" "}
                  {FRA_MAKEUP.mythics} in the main set, with {FRA_MAKEUP.rares}{" "}
                  rares, {FRA_MAKEUP.uncommons} uncommons and{" "}
                  {FRA_MAKEUP.commons} commons. We show no card prices: MTG
                  Compare compares sealed product only.
                </p>
              </Prose>
              <CardGrid cards={REALITY_FRACTURE_MYTHICS} />
            </>
          ),
        },
        {
          id: "treatments",
          title: "Serialized, shattered mirror and the other treatments",
          body: treatmentsList(FRA_TREATMENTS),
        },
        {
          id: "which-box",
          title: "Which box to open for the chase cards",
          body: (
            <Prose>
              <ul>
                <li>
                  <strong>Collector Booster box (12 boosters):</strong> the only
                  home of the serialized Bloodline Recollector, the facet foil
                  shattered mirror cards and the Japan Showcase cards. Each
                  booster has five rare or mythic slots.
                </li>
                <li>
                  <strong>Play Booster box (30 boosters):</strong> one rare or
                  mythic rare per booster, three echoed pairs cards, and 1
                  booster in 55 holds a Special Guests card.
                </li>
                <li>
                  <strong>Secret Lair Bundle:</strong> 6 Play Boosters and 2
                  Collector Boosters, with 2 of 10 Secret Lair promo cards.
                </li>
              </ul>
              <p>
                Compare every Reality Fracture product on the{" "}
                <Link href={FRA_SET}>Reality Fracture set page</Link>.
              </p>
            </Prose>
          ),
        },
        prices(d, "Reality Fracture boxes: today’s prices", (p) =>
          /booster|bundle/i.test(p.name),
        ),
        faq([
          {
            q: "What are the Reality Fracture chase cards?",
            a: `By rarity, the ${FRA_MAKEUP.mythics} mythic rares above; by print run, the 500 serialized Bloodline Recollectors and the facet foil shattered mirror mythics, about 3,000 of each.`,
          },
          {
            q: "Is the serialized Bloodline Recollector different in play?",
            a: "No. Wizards says serialized cards are mechanically identical to their non-serialized counterparts.",
          },
          {
            q: "Can you open serialized cards in Play Boosters?",
            a: "No: Collector Boosters only.",
          },
          {
            q: "How much are Reality Fracture chase cards worth?",
            a: "We don’t say: MTG Compare tracks sealed product only, and we never guess a card’s price.",
          },
        ]),
        sources(
          [SCRYFALL_FRA, WIZARDS_COLLECTING_FRA, WIZARDS_FRA_GALLERY],
          CARDS_CHECKED,
        ),
      ],
    };
  },
};

export const fracturesProducts = {
  outline(d: PostData): PostOutline {
    return {
      intro: (
        <Lede>
          Reality Fracture is sold in Play and Collector Boosters, a Bundle, a
          Secret Lair Bundle, Draft Night, a Prerelease Pack and six Commander
          decks. Here is what each holds, slot by slot for the Collector
          Booster, the US MSRP Wizards set, and what stores ask today.
        </Lede>
      ),
      sections: [
        {
          id: "collector",
          title: "What’s in a Reality Fracture Collector Booster",
          body: (
            <Prose>
              <p>{fraCollector.holds}</p>
              <p>
                Only Collector Boosters hold the serialized Bloodline
                Recollector, the facet foil shattered mirror cards and the Japan
                Showcase cards.
              </p>
            </Prose>
          ),
        },
        {
          id: "products",
          title: "Every product, and what it holds",
          body: (
            <>
              <Prose>
                <ul>
                  {FRA_PRODUCTS.map((p) => (
                    <li key={p.name}>
                      <strong>{p.name}:</strong> {p.holds}
                    </li>
                  ))}
                </ul>
              </Prose>
              {msrpTable(
                "Reality Fracture US MSRP",
                FRA_PRODUCTS,
                "Collecting Reality Fracture",
              )}
            </>
          ),
        },
        prices(d, "Reality Fracture: today’s prices"),
        faq([
          {
            q: "How many Collector Boosters are in a Reality Fracture box?",
            a: "12, each with 15 Magic cards.",
          },
          {
            q: "How many Play Boosters are in a box?",
            a: "30, each with 14 Magic cards.",
          },
          {
            q: "What are the Reality Fracture Commander decks?",
            a: "Multiverse Reforged, plus five Foundations Commander decks: Calling All Angels, Keen Engineering, Wretched Ranks, Reign of Dragons and Tramplesaurus Rex.",
          },
          {
            q: "When did Reality Fracture come out?",
            a: `${longDate(FRA_DATES.release)}; prerelease events ran from ${longDate(FRA_DATES.prerelease.from)} to ${longDate(FRA_DATES.prerelease.to)}.`,
          },
        ]),
        {
          id: "more",
          title: "More",
          body: (
            <Prose>
              <p>
                See the{" "}
                <Link href="/blog/reality-fracture-chase-cards">
                  Reality Fracture chase cards
                </Link>{" "}
                and the <Link href={FRA_SET}>Reality Fracture set page</Link>.
              </p>
            </Prose>
          ),
        },
        sources([WIZARDS_COLLECTING_FRA], CARDS_CHECKED),
      ],
    };
  },
};
