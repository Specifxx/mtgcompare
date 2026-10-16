import Link from "next/link";
import { Callout, SimpleTable } from "@/components/blog/BlogBits";
import { int } from "../../format";
import { STAR_TREK, longDateOf } from "../../preorders";
import { SCRYFALL, SCRYFALL_TEXT, STAR_TREK_CHECKED, WIZARDS_SAYS, namedOracle, starTrekView, type NamedCard } from "../star-trek";
import type { Post, StarTrekView } from "../types";

// Star Trek's mechanics in plain English (RiftCompare's "deploy explained" pattern): what each does in Wizards of the Coast's own
// words (its Collecting Star Trek article), the rules text of revealed cards exactly as Scryfall prints it, and what follows from
// them. No reminder text is paraphrased into a card's mouth: a quote is Scryfall's (lib/blog/star-trek.ts SCRYFALL_TEXT, read
// 16 October 2026) or Wizards'. Card names link to their name page once the catalogue has the card, and each mechanic links its
// keyword page once one exists (PostContext.starTrek); until then they are plain text. No prices: the set page has them.
const quote = (name: NamedCard) => SCRYFALL_TEXT[name] ?? "";

function CardName({ view, name }: { view: StarTrekView | null; name: NamedCard }) {
  const o = namedOracle(view, name);
  return o ? <Link href={`/cards/name/${o.slug}`}>{name}</Link> : <em>{name}</em>;
}

function CardQuote({ view, name }: { view: StarTrekView | null; name: NamedCard }) {
  return (
    <blockquote>
      <p>
        <strong>
          <CardName view={view} name={name} />
        </strong>
        : &ldquo;{quote(name)}&rdquo;
      </p>
    </blockquote>
  );
}

export const starTrekMechanics: Post = {
  slug: "magic-star-trek-mechanics-explained",
  title: () => "MTG Star Trek Mechanics: Assimilate, Federation, Dilemma",
  description:
    "Assimilate, federation, face a dilemma and station explained in plain English: how each Magic: The Gathering Star Trek mechanic works, in Wizards' words and on the revealed cards.",
  tags: ["star trek", "mechanics", "keywords", "rules"],
  category: "blog",
  date: "2026-10-16",
  minutes: 7,
  faq: [
    {
      q: "What does assimilate do in MTG?",
      a: "Assimilate is a keyword action. In Wizards of the Coast's words it gives you control of a creature or puts a creature card onto the battlefield under your control; either way the creature gets a +1/+1 counter and becomes a Borg artifact creature, losing its other creature types. Which of the two happens depends on the card: Borg Queen, Perfection Manifest assimilates a creature card from an opponent's graveyard.",
    },
    {
      q: "Do Borg count for federation?",
      a: "No. Wizards describes federation as an ability word for abilities that count the creature types among the non-Borg creatures a player controls, and the revealed federation cards count non-Borg creatures you control. An assimilated creature becomes a Borg, so it stops counting.",
    },
    {
      q: "What does face a dilemma mean in MTG?",
      a: "You face a dilemma as you choose one or more modes for a spell or ability, which is the reminder text on Seven of Nine. Facing a dilemma does nothing on its own; cards such as Seven of Nine, which draws a card whenever you face a dilemma, reward it.",
    },
    {
      q: "Is federation a keyword?",
      a: "No, it is an ability word, like landfall: it labels a group of abilities and has no rules meaning of its own. Each federation ability counts the creature types among your non-Borg creatures and says what that number does.",
    },
    {
      q: "Are station and Spacecraft new in Star Trek?",
      a: "No. Both come from Edge of Eternities and return in Star Trek. A Spacecraft starts as an artifact; station lets you tap another creature you control to put charge counters on it equal to that creature's power, and at the numbers printed on the card it gains abilities and can become an artifact creature.",
    },
  ],
  related: [
    { href: "/keywords", label: "Keywords" },
    { href: STAR_TREK.path, label: "Star Trek pre-orders" },
    { href: "/commanders", label: "Commanders" },
  ],
  build: (ctx) => {
    const rv = starTrekView(ctx);
    const view = ctx.starTrek;
    const main = rv?.sets.find((s) => s.tok === STAR_TREK.toks[0]) ?? null;
    const kw = new Map((view?.keywords ?? []).map((k) => [k.slug, k] as const));
    const kwLink = (slug: string, text: string) => {
      const k = kw.get(slug);
      return k ? <Link href={`/keywords/${k.slug}`}>{text}</Link> : <>{text}</>;
    };
    const kwCount = (slug: string, name: string) => {
      const k = kw.get(slug);
      return k ? (
        <p>
          {k.count === 1 ? "One card in our data so far has" : `${int(k.count)} cards in our data have`} {name}:{" "}
          <Link href={`/keywords/${k.slug}`}>
            every card with {name}
            {k.count === 1 ? "" : ", most played first"}
          </Link>
          .
        </p>
      ) : null;
    };
    const named = (name: NamedCard) => <CardName view={view} name={name} />;
    const scry = (
      <a href={SCRYFALL.url} target="_blank" rel="noopener noreferrer">
        Scryfall
      </a>
    );
    const wizards = (
      <a href={STAR_TREK.msrp?.source.url ?? "https://magic.wizards.com/en/news/feature/collecting-star-trek"} target="_blank" rel="noopener noreferrer">
        Collecting Star Trek
      </a>
    );
    const hero = (rv?.cards ?? [])
      .flatMap((g) => g.items)
      .filter((c) => c.hasImage && ["Seven of Nine", "Hoshi Sato, Exolinguist", "U.S.S. Enterprise-D, Galaxy-Class", "Set Phasers to . . .", "Set Phasers to..."].includes(c.name))
      .filter((c, i, a) => a.findIndex((x) => x.name === c.name) === i)
      .slice(0, 3);

    return {
      heroCards: hero,
      summary: [
        <>
          <strong>Star Trek brings three new mechanics,</strong> assimilate, face a dilemma and federation, and brings back Spacecraft and station from Edge of Eternities,
          according to Wizards of the Coast.
        </>,
        <>Assimilate gives you a creature, by taking control of one or by putting a creature card onto the battlefield, and makes it a Borg artifact creature with a +1/+1 counter.</>,
        <>Federation abilities count the creature types among your non-Borg creatures, so a mixed crew beats a crowd of Humans, and an assimilated creature stops counting.</>,
        <>You face a dilemma whenever you choose modes for a spell or ability; cards such as {named("Seven of Nine")} reward it.</>,
      ],
      lede: (
        <p>
          <strong>What do Star Trek&apos;s new mechanics do?</strong> Below is each one in plain English: Wizards of the Coast&apos;s own description from its {wizards}{" "}
          article, then the rules text printed on the revealed cards, quoted exactly as {scry} has it on {longDateOf(STAR_TREK_CHECKED)}, then what follows from it. A card
          that is not revealed yet is not quoted, and nothing here is a guess at an unrevealed card. For the cards themselves, see{" "}
          <Link href="/blog/magic-star-trek-spoilers">the Star Trek card list so far</Link>.
        </p>
      ),
      sections: [
        {
          id: "summary",
          title: "The Star Trek mechanics at a glance",
          body: (
            <SimpleTable
              head={["Mechanic", "What it is", "What it does", "Revealed example"]}
              rows={[
                [<strong key="m">{kwLink("assimilate", "Assimilate")}</strong>, "Keyword action (new)", "Steals a creature or puts one onto the battlefield as a Borg artifact creature with a +1/+1 counter", named("Borg Queen, Perfection Manifest")],
                [<strong key="m">Federation</strong>, "Ability word (new)", "Counts the creature types among your non-Borg creatures", named("Hoshi Sato, Exolinguist")],
                [<strong key="m">{kwLink("face-a-dilemma", "Face a dilemma")}</strong>, "Game event (new)", "Happens whenever you choose modes for a spell or ability; other cards reward it", named("Seven of Nine")],
                [<strong key="m">{kwLink("station", "Station")}</strong>, "Keyword ability (returning)", "Tap a creature to put charge counters on a Spacecraft equal to its power", named("U.S.S. Enterprise-D, Galaxy-Class")],
                [<strong key="m">Spacecraft</strong>, "Artifact type (returning)", "Starts as an artifact; gains abilities and can become a creature as it is charged", named("U.S.S. Enterprise-D, Galaxy-Class")],
              ]}
            />
          ),
        },
        {
          id: "assimilate",
          title: "Assimilate",
          body: (
            <>
              <p>
                <strong>Resistance is futile.</strong> Assimilate is the Borg&apos;s mechanic. In Wizards&apos; words: &ldquo;{WIZARDS_SAYS.assimilate}&rdquo;
              </p>
              <p>A revealed card with it reads:</p>
              <CardQuote view={view} name="Borg Queen, Perfection Manifest" />
              <ul>
                <li>
                  <strong>Where the creature comes from depends on the card.</strong> Wizards describes both kinds, gaining control of a creature or putting a creature card onto the
                  battlefield; Borg Queen takes one from an opponent&apos;s graveyard.
                </li>
                <li>
                  <strong>It becomes an artifact creature.</strong> So every assimilated creature feeds artifact payoffs, and several revealed Borg cards are exactly that: Borg Queen
                  gives artifact creatures you control +2/+0, and {named("Assault Drone")} reads &ldquo;{quote("Assault Drone")}&rdquo;
                </li>
                <li>
                  <strong>It becomes a Borg and loses its other creature types.</strong> An assimilated Human Soldier&apos;s only creature type is Borg, which matters for typal
                  cards and for federation below.
                </li>
                <li>
                  <strong>It keeps a +1/+1 counter</strong>, so it is a little bigger than it was.
                </li>
              </ul>
              {kwCount("assimilate", "assimilate")}
              <p>
                The Borg precon is <Link href="/blog/magic-star-trek-commander-decks#we-are-the-borg">We Are the Borg</Link>; fan trackers report it is built around assimilate.
              </p>
            </>
          ),
        },
        {
          id: "federation",
          title: "Federation",
          body: (
            <>
              <p>
                Federation is an <strong>ability word</strong>, like landfall: it labels a group of abilities and has no rules meaning of its own. In Wizards&apos; words:
                &ldquo;{WIZARDS_SAYS.federation}&rdquo;
              </p>
              <p>Two revealed federation cards:</p>
              <CardQuote view={view} name="Hoshi Sato, Exolinguist" />
              <CardQuote view={view} name="Saavik, Stoic Student" />
              <ul>
                <li>
                  <strong>Variety counts, not numbers.</strong> X is the number of different creature types, so five Humans count as one, while a Human Officer, a Vulcan
                  Scientist and a Klingon Warrior count as six: Human, Officer, Vulcan, Scientist, Klingon and Warrior.
                </li>
                <li>
                  <strong>Borg never count.</strong> The abilities count non-Borg creatures only, and an assimilated creature is a Borg.
                </li>
                <li>
                  <strong>Changelings do not break it.</strong> Wizards&apos; aside, &ldquo;Sorry, Amoeboid Changeling. Maybe next time!&rdquo;, points at the reason: a changeling has
                  every creature type, Borg included, so it is a Borg creature and federation leaves it out.
                </li>
              </ul>
              <p>
                Federation is an ability word, so Scryfall lists no keyword for it and there is no keyword page; its cards are on the{" "}
                {main ? <Link href={`/sets/${main.slug}`}>{main.name} set page</Link> : "Star Trek set page"} as TCGplayer lists them.
              </p>
            </>
          ),
        },
        {
          id: "face-a-dilemma",
          title: "Face a dilemma",
          body: (
            <>
              <p>
                This is a new name for something Magic already does. In Wizards&apos; words: &ldquo;{WIZARDS_SAYS.dilemma}&rdquo; Facing a dilemma does nothing by itself;
                other cards reward it. A revealed payoff:
              </p>
              <CardQuote view={view} name="Seven of Nine" />
              <ul>
                <li>
                  <strong>Only your own choices count for Seven of Nine.</strong> It says &ldquo;whenever you face a dilemma&rdquo;, so an opponent&apos;s modal spell draws you
                  nothing.
                </li>
                <li>
                  <strong>Any modal spell or ability works.</strong> The reminder text names no set, so a &ldquo;choose one&rdquo; card from any era is a dilemma too. All that
                  matters, Wizards says, is that you make a choice.
                </li>
              </ul>
              <p>Star Trek has its own modal cards, which double as interaction:</p>
              <CardQuote view={view} name="Set Phasers to . . ." />
              <CardQuote view={view} name="Consider the Prime Directive" />
              {kwCount("face-a-dilemma", "face a dilemma")}
            </>
          ),
        },
        {
          id: "station",
          title: "Station and Spacecraft (returning)",
          body: (
            <>
              <p>
                Both debuted in <em>Edge of Eternities</em> and return here. In Wizards&apos; words: &ldquo;{WIZARDS_SAYS.station}&rdquo; The U.S.S. Enterprise-D, also one of
                the Beam Me Up Bundle&apos;s schematic promo cards, shows how it reads:
              </p>
              <CardQuote view={view} name="U.S.S. Enterprise-D, Galaxy-Class" />
              <ul>
                <li>
                  <strong>A Spacecraft starts as an artifact</strong>, not a creature: it cannot attack or block until enough charge counters make it one, where its text says so.
                </li>
                <li>
                  <strong>Station taps another creature you control</strong> and puts charge counters equal to that creature&apos;s power on the Spacecraft, only when you could cast a
                  sorcery.
                </li>
                <li>
                  <strong>The numbers on the card are thresholds.</strong> The Enterprise-D gains flying and vigilance at 7+ charge counters, and is an artifact creature from
                  then on.
                </li>
              </ul>
              {kwCount("station", "station")}
              <p>
                Fan trackers report that the Federation Fleet precon is about starships: see <Link href="/blog/magic-star-trek-commander-decks#federation-fleet">Federation Fleet</Link>.
              </p>
            </>
          ),
        },
        {
          id: "together",
          title: "How the mechanics interact",
          body: (
            <ul>
              <li>
                <strong>Assimilate against federation:</strong> every creature you assimilate becomes a Borg, so it stops counting for federation. Borg decks take creatures and
                federation decks want a varied crew, so the two pull in opposite directions.
              </li>
              <li>
                <strong>Assimilate with artifacts:</strong> every assimilated creature is an artifact creature, so artifact payoffs come along for free.
              </li>
              <li>
                <strong>Dilemmas with interaction:</strong> modal removal and counterspells such as {named("Set Phasers to . . .")} and{" "}
                {named("Consider the Prime Directive")} answer a threat and trigger dilemma payoffs at once.
              </li>
            </ul>
          ),
        },
        {
          id: "more",
          title: "Where to see and price the cards",
          body: (
            <>
              <ul>
                <li>
                  Every revealed card in our data: <Link href="/blog/magic-star-trek-spoilers">the Star Trek spoilers list</Link>
                  {main ? (
                    <>
                      , and the <Link href={`/sets/${main.slug}`}>{main.name} ({main.code}) set page</Link> with every store&apos;s price
                    </>
                  ) : null}
                  .
                </li>
                <li>
                  Dates and what is in each product: <Link href="/blog/magic-star-trek-release-date-products">the Star Trek release date and products guide</Link>.
                </li>
                <li>
                  The four precons: <Link href="/blog/magic-star-trek-commander-decks">the Star Trek Commander decks guide</Link>.
                </li>
                <li>
                  Every Magic keyword, from flying to station: <Link href="/keywords">the keywords glossary</Link>.
                </li>
              </ul>
              <Callout title="Rules text">
                The card text quoted here is Scryfall&apos;s on {longDateOf(STAR_TREK_CHECKED)}, before release. For a ruling on a card, read its Oracle text on the card&apos;s
                page and Wizards of the Coast&apos;s release notes when they are published.
              </Callout>
              {STAR_TREK.trademark ? <p className="text-xs text-slate-500">{STAR_TREK.trademark}</p> : null}
            </>
          ),
        },
      ],
    };
  },
};
