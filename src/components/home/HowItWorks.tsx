import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { SearchIcon, ScaleIcon, CartIcon, PlayIcon } from "@/components/icons/HomeIcons";

// RiftCompare's HowItWorks: four numbered steps (sm:2 lg:4), the store-list
// link and the trust line. Step 4's links are Magic's: the deck pricer,
// Commanders and the keyword glossary (no games).
const STEPS = [
  {
    n: 1,
    Icon: SearchIcon,
    title: "Search or browse",
    body: "Look up any Magic card by name, or browse the whole database by set, colour and Commander.",
  },
  {
    n: 2,
    Icon: ScaleIcon,
    title: "Compare every store",
    body: "See the latest prices from every store we track in your market side by side, read once a day — ranked by price, with TCGplayer's market price as a reference, plus eBay.",
  },
  {
    n: 3,
    Icon: CartIcon,
    title: "Buy for the best price",
    body: "Click straight through to the cheapest shop. Free, independent, and no sign-up needed.",
  },
  {
    n: 4,
    Icon: PlayIcon,
    title: "Then go and play",
    body: "Price a deck, pick a Commander, or look up a keyword. The prices are the means, not the point.",
    links: [
      { href: "/deck", label: "Deck pricer" },
      { href: "/commanders", label: "Commanders" },
      { href: "/keywords", label: "Keywords" },
    ],
  },
];

export function HowItWorks({ totalCards }: { totalCards: number }) {
  return (
    <section aria-labelledby="how-it-works-heading">
      <div className="mb-4">
        <h2 id="how-it-works-heading" className="text-xl font-extrabold text-white">
          How MTG Compare works
        </h2>
        <p className="mt-0.5 text-sm text-slate-400">
          Find the cheapest place to buy any of {totalCards.toLocaleString("en-US")} Magic cards — then get back to the game. Always free.
        </p>
      </div>
      <Reveal stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => (
          <div key={s.n} className="card-surface relative flex flex-col gap-2 p-5 transition-colors duration-200 hover:border-brand-500/40">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/15 text-brand-400">
                <s.Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="num text-sm font-bold text-brand-400">Step {s.n}</span>
            </div>
            <h3 className="text-base font-bold text-white">{s.title}</h3>
            <p className="text-sm leading-relaxed text-slate-400">{s.body}</p>
            {s.links && (
              <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                {s.links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs font-semibold text-slate-200 transition-colors hover:border-brand-500 hover:text-white"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </Reveal>
      <div className="mt-4">
        <Link
          href="/stores"
          className="inline-flex items-center gap-2 rounded-md border border-ink-600 bg-ink-900 px-4 py-2 font-mono text-sm font-semibold text-slate-200 transition-colors hover:border-brand-500 hover:text-white"
        >
          <span className="text-brand-400" aria-hidden>
            ▸
          </span>{" "}
          View our store list
        </Link>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Prices refreshed once a day ·{" "}
        <Link href="/methodology" className="underline-offset-2 hover:text-slate-300 hover:underline">
          See our methodology
        </Link>{" "}
        ·{" "}
        <Link href="/about" className="underline-offset-2 hover:text-slate-300 hover:underline">
          About MTG Compare
        </Link>{" "}
        ·{" "}
        <Link href="/editorial-policy" className="underline-offset-2 hover:text-slate-300 hover:underline">
          Editorial policy
        </Link>
      </p>
    </section>
  );
}
