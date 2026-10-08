import type { Metadata } from "next";
import Link from "next/link";
import { HubFaq } from "@/components/HubFaq";
import { SealedTile } from "@/components/SealedTile";
import { Breadcrumbs, JsonLd } from "@/components/ui";
import { getSealedPage, getSetIndex } from "@/lib/data";
import { getCountry } from "@/lib/get-country";
import { faqLd } from "@/lib/jsonld";
import { pageOg } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: "How to Play Magic: The Gathering: Rules Basics & Starter Decks",
  description: "The basics of Magic: The Gathering: the deck, lands and mana, card types, the turn and how you win, then Commander decks to begin with at their live prices in your market.",
  alternates: { canonical: "/learn" },
  openGraph: pageOg("/learn"),
};

// Written for Magic, from the game's published rules. It states the basics
// only; the Magic Comprehensive Rules and each card's Oracle text are the
// authority for anything else, and nothing here is a ruling on a specific card.
const FAQ = [
  { q: "How many cards are in a Magic deck?", a: "In most formats a deck has at least 60 cards, with no more than four copies of any card except basic lands. Commander is different: exactly 100 cards, including your commander, and only one copy of any card except basic lands." },
  { q: "How do you win?", a: "You win when your opponent's life total reaches 0 or less, when they have to draw from an empty library, or when they have ten or more poison counters. In Commander, a player who takes 21 or more combat damage from a single commander also loses. A card can also say you win or an opponent loses." },
  { q: "What is mana?", a: "Mana is the resource that pays for spells. Lands produce it: you may play one land on each of your turns, and tap lands for mana of their colour. The five colours are white, blue, black, red and green, and some cards are colourless." },
  { q: "What should a new player buy first?", a: "A Commander precon is a complete, ready-to-play 100-card deck. The prices below are the cheapest in-stock offers we track in your market. For a 60-card format, a theme or starter product is the usual first step." },
  { q: "Where do I look up a card's rules text?", a: "Every card page shows the Oracle text, the current wording of the card. The [keywords](/keywords) pages explain each keyword ability, and the Comprehensive Rules are the final word." },
];

const STEPS = [
  { t: "Untap", d: "Untap all your tapped permanents." },
  { t: "Upkeep", d: "Abilities that trigger at the start of your turn happen now." },
  { t: "Draw", d: "Draw a card (the player who goes first skips this on their first turn in a two-player game)." },
  { t: "First main phase", d: "Play a land (one per turn), cast creatures, artifacts, enchantments, planeswalkers and sorceries." },
  { t: "Combat", d: "Attack with your creatures; the defending player chooses blockers; damage is dealt." },
  { t: "Second main phase", d: "Play anything you held back, including the land if you have not played one." },
  { t: "End", d: "Abilities that trigger at the end of the turn happen, then you discard down to seven cards in hand if you hold more." },
];

export default async function LearnPage() {
  const country = getCountry();
  const [page, setIndex] = await Promise.all([getSealedPage({ kind: "Commander Deck", presale: false, sort: "newest", page: 1, per: 24 }), getSetIndex()]);
  const decks = page.items.filter((s) => s.low[country] != null || s.marketUsd != null).slice(0, 8);
  return (
    <div>
      <JsonLd data={faqLd(FAQ.map((f) => ({ q: f.q, a: f.a.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") })))} />
      <Breadcrumbs trail={[{ name: "Learn" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">How to play Magic: The Gathering</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        The basics in a few minutes: what is in a deck, how lands and mana work, the kinds of card, what a turn looks like and how a game is won, then the Commander decks to begin with and what they cost in your market. For anything more precise, the Magic Comprehensive Rules are the authority.
      </p>

      <section className="mt-8 max-w-3xl space-y-3 text-[15px] leading-relaxed text-slate-300">
        <h2 className="text-xl text-white">The deck, lands and mana</h2>
        <p>
          Each player starts with a shuffled deck, called a library, draws seven cards and may mulligan: draw seven new cards, then put cards from the hand on the bottom of the library, one for each time you mulliganed. A deck is built from <strong className="text-white">lands</strong>, which produce mana, and spells, which you pay for with it. Mana comes in five colours (white, blue, black, red and green) and a card&apos;s cost shows which you need. You may play one land per turn.
        </p>
        <p>
          Players begin at 20 life (40 in Commander). Browse the <Link href="/colors" className="text-brand-400 hover:underline">colours</Link>, find a <Link href="/commanders" className="text-brand-400 hover:underline">commander</Link>, or see how a whole list prices out in the <Link href="/deck" className="text-brand-400 hover:underline">deck calculator</Link>.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-3 text-[15px] leading-relaxed text-slate-300">
        <h2 className="text-xl text-white">Kinds of card</h2>
        <p>
          <strong className="text-white">Creatures</strong> attack and block. <strong className="text-white">Instants</strong> and <strong className="text-white">sorceries</strong> have a one-time effect, and only instants can be cast at any time. <strong className="text-white">Artifacts</strong> and <strong className="text-white">enchantments</strong> stay in play with an ongoing effect. <strong className="text-white">Planeswalkers</strong> are allies you activate once a turn, and opponents can attack them. <strong className="text-white">Lands</strong> make mana. Keyword abilities such as <Link href="/keywords/flying" className="text-brand-400 hover:underline">flying</Link> and <Link href="/keywords/trample" className="text-brand-400 hover:underline">trample</Link> are explained on the keywords pages.
        </p>
      </section>

      <section className="mt-8 max-w-3xl">
        <h2 className="text-xl text-white">A turn</h2>
        <ol className="mt-3 space-y-2">
          {STEPS.map((s, i) => (
            <li key={s.t} className="card-surface flex gap-3 p-3 text-sm">
              <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-400">{i + 1}</span>
              <span className="text-slate-300">
                <strong className="text-white">{s.t}.</strong> {s.d}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Spells and abilities go on the stack and resolve one at a time, last in first out, and each player gets the chance to respond before the top one resolves. Most game states you will meet are settled by that one rule.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-3 text-[15px] leading-relaxed text-slate-300">
        <h2 className="text-xl text-white">How you win</h2>
        <p>
          Reduce your opponent&apos;s life total to 0 with combat damage and spells. You also win if they must draw from an empty library, or if they have ten or more poison counters. In Commander, 21 combat damage from one commander is enough, and most games are multiplayer.
        </p>
      </section>

      {decks.length ? (
        <section className="mt-10">
          <h2 className="mb-3 text-xl text-white">Commander decks to begin with</h2>
          <p className="mb-3 max-w-3xl text-sm text-slate-400">
            Each is a complete, ready-to-play 100-card deck. Prices are the cheapest in-stock offer we track in your market; tap a tile for every store.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {decks.map((s) => (
              <SealedTile key={s.id} s={s} country={country} setCode={s.setId ? setIndex.byId.get(s.setId)?.code : null} />
            ))}
          </div>
          <p className="mt-3 text-sm">
            <Link href="/sealed?kind=Commander+Deck" className="text-brand-400 hover:underline">
              All Commander decks →
            </Link>
          </p>
        </section>
      ) : null}
      <HubFaq faqs={FAQ.map((f) => ({ q: f.q, a: f.a.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") }))} />
    </div>
  );
}
