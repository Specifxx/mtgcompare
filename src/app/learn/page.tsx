import type { Metadata } from "next";
import Link from "next/link";
import { HubFaq } from "@/components/HubFaq";
import { SealedTile } from "@/components/SealedTile";
import { Breadcrumbs, JsonLd } from "@/components/ui";
import { getCatalog, getSealedCatalog } from "@/lib/data";
import { getCountry } from "@/lib/get-country";
import { breadcrumbLd, faqLd } from "@/lib/jsonld";
import { pageOg } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: "How to Play the One Piece Card Game: Rules Basics & Starter Decks",
  description: "The basics of the One Piece Card Game: the deck, Leaders, DON!!, Life and the turn, then the starter decks to begin with at their live prices in your market.",
  alternates: { canonical: "/learn" },
  openGraph: pageOg("/learn"),
};

// Written for One Piece, from the game's own published rules. It states the
// basics only; Bandai's comprehensive rules are the authority for anything else,
// and nothing here is a ruling on a specific card.
const FAQ = [
  { q: "How many cards are in a One Piece Card Game deck?", a: "A deck is exactly 50 cards plus one Leader, with no more than four copies of any card number. The ten DON!! cards sit in their own deck beside it and are not counted in the 50." },
  { q: "How do you win?", a: "You win by dealing damage to your opponent's Leader when they have no Life cards left. Each time a Leader takes damage it loses one Life card, which goes to its owner's hand." },
  { q: "What is DON!!?", a: "DON!! cards are the game's resource. You add them to your cost area each turn to pay for cards, and you can give them to a Leader or Character to raise its power by 1,000 each for that turn." },
  { q: "What should a new player buy first?", a: "A starter deck: each is a complete, playable 50-card deck built around one Leader. The prices below are the cheapest in-stock offers we track in your market." },
  { q: "Where do I look up a card's rules text?", a: "Every card page shows the printed text with its keywords explained. The [keywords](/keywords) pages list each one, and Bandai's rules are the final word." },
];

const STEPS = [
  { t: "Refresh", d: "Return all your rested cards and given DON!! to active." },
  { t: "Draw", d: "Draw a card (the player going first skips this on turn one)." },
  { t: "DON!!", d: "Add two DON!! cards from your DON!! deck to your cost area (one on the first player's first turn)." },
  { t: "Main", d: "Play Characters, Events and Stages, give DON!! to your cards, and attack with active Leaders and Characters." },
  { t: "End", d: "Your turn ends and your opponent's begins." },
];

export default async function LearnPage() {
  const country = getCountry();
  const [cat, sealed] = await Promise.all([getCatalog(), getSealedCatalog()]);
  const decks = sealed
    .filter((s) => s.kind === "Starter Deck" && (s.low[country] != null || s.marketUsd != null))
    .sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? "") || a.name.localeCompare(b.name))
    .slice(0, 8);
  return (
    <div>
      <JsonLd data={faqLd(FAQ.map((f) => ({ q: f.q, a: f.a.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") })))} />
      <Breadcrumbs trail={[{ name: "Learn" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">How to play the One Piece Card Game</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        The basics in a few minutes: what is in a deck, what the Leader does, how DON!! and Life work, and what a turn looks like, then the starter decks to begin with and what they cost in your market. For anything more precise, Bandai&apos;s comprehensive rules are the authority.
      </p>

      <section className="mt-8 max-w-3xl space-y-3 text-[15px] leading-relaxed text-slate-300">
        <h2 className="text-xl text-white">The deck and the Leader</h2>
        <p>
          Every deck is built around one <strong className="text-white">Leader</strong>. The Leader starts the game in play, sets the deck&apos;s colours (you can only run cards of those colours) and its Life, and its effect shapes every other choice. Beside the Leader you build a 50-card deck of Characters, Events and Stages, with at most four copies of any card number, and a separate deck of ten DON!! cards.
        </p>
        <p>
          <Link href="/leaders" className="text-brand-400 hover:underline">Browse every Leader</Link> with its price, or see the six <Link href="/colors" className="text-brand-400 hover:underline">colours</Link>. How a whole list prices out is one paste away in the <Link href="/deck" className="text-brand-400 hover:underline">deck calculator</Link>.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-3 text-[15px] leading-relaxed text-slate-300">
        <h2 className="text-xl text-white">Life and winning</h2>
        <p>
          At the start of the game each player sets aside Life cards face down equal to their Leader&apos;s Life. When a Leader is hit by an attack that gets through, it loses one Life card to its owner&apos;s hand (some cards deal two). You win by dealing damage when your opponent has no Life left. Cards with a <Link href="/keywords/trigger" className="text-brand-400 hover:underline">[Trigger]</Link> can take effect the moment they are revealed from Life.
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
          In the Main phase, a Character attacks by resting; the defender can block with a <Link href="/keywords/blocker" className="text-brand-400 hover:underline">[Blocker]</Link> or play a Counter from hand to add power, and the higher power wins the battle.
        </p>
      </section>

      {decks.length ? (
        <section className="mt-10">
          <h2 className="mb-3 text-xl text-white">Starter decks to begin with</h2>
          <p className="mb-3 max-w-3xl text-sm text-slate-400">
            Each is a complete, playable deck built around one Leader. Prices are the cheapest in-stock offer we track in your market; tap a tile for every store.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {decks.map((s) => (
              <SealedTile key={s.id} s={s} country={country} setCode={s.setId ? cat.setById.get(s.setId)?.code : null} />
            ))}
          </div>
          <p className="mt-3 text-sm">
            <Link href="/sealed?kind=Starter+Deck" className="text-brand-400 hover:underline">
              All starter decks →
            </Link>
          </p>
        </section>
      ) : null}
      <HubFaq faqs={FAQ.map((f) => ({ q: f.q, a: f.a.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") }))} />
    </div>
  );
}
