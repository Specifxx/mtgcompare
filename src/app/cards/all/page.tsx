import type { Metadata } from "next";
import CardQuickLink from "@/components/CardQuickLink";
import { Breadcrumbs } from "@/components/ui";
import { getCatalog } from "@/lib/data";
import { int } from "@/lib/format";
import { pageOg } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: "Every One Piece Card A–Z — Full Card Index",
  description:
    "An A–Z index of every One Piece Card Game card name, each linking to its printings and live prices.",
  alternates: { canonical: "/cards/all" },
  openGraph: pageOg("/cards/all"),
};

// One line per card NAME (not per printing) — the index a crawler and a
// shopper can both read top to bottom. Each name links to its standard print.
export default async function AllCardsPage() {
  const cat = await getCatalog();
  const byName = new Map<string, (typeof cat.cards)[number][]>();
  for (const c of cat.cards) {
    if (c.printing === "don") continue;
    (byName.get(c.name) ?? byName.set(c.name, []).get(c.name)!).push(c);
  }
  const names = [...byName.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "en", { sensitivity: "base" }),
  );
  const letters = new Map<string, typeof names>();
  for (const e of names) {
    const L = /^[a-z]/i.test(e[0]) ? e[0][0].toUpperCase() : "#";
    (letters.get(L) ?? letters.set(L, []).get(L)!).push(e);
  }
  return (
    <div>
      <Breadcrumbs
        trail={[{ href: "/cards", name: "Cards" }, { name: "A–Z" }]}
      />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
        Every One Piece card, A–Z
      </h1>
      <p className="mt-3 max-w-3xl text-[15px] text-slate-300">
        {int(names.length)} card names across {int(cat.cards.length)} printings.
        Each name opens its standard print, where every other printing is
        listed.
      </p>
      <nav className="mt-4 flex flex-wrap gap-1" aria-label="Letters">
        {[...letters.keys()].map((L) => (
          <a
            key={L}
            href={`#l-${L}`}
            className="grid h-9 w-9 place-items-center rounded border border-ink-700 bg-ink-900 text-sm font-semibold text-slate-200 hover:border-brand-500"
          >
            {L}
          </a>
        ))}
      </nav>
      {[...letters.entries()].map(([L, list]) => (
        <section key={L} id={`l-${L}`} className="mt-8 scroll-mt-24">
          <h2 className="mb-2 text-2xl text-white">{L}</h2>
          <ul className="columns-1 gap-6 text-sm sm:columns-2 lg:columns-3 xl:columns-4">
            {list.map(([name, ps]) => {
              const base = ps.find((p) => p.printing === "standard") ?? ps[0];
              return (
                <li key={name} className="break-inside-avoid py-0.5">
                  <CardQuickLink
                    slug={base.slug}
                    className="text-slate-200 hover:text-brand-400 hover:underline"
                  >
                    {name}
                  </CardQuickLink>{" "}
                  <span className="text-xs text-slate-500">({ps.length})</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
