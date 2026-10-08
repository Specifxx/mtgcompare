import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, InShort, JsonLd } from "@/components/ui";
import { getKeywordIndex, type KeywordRow } from "@/lib/data";
import { int } from "@/lib/format";
import { itemListLd } from "@/lib/jsonld";
import { KEYWORD_BY_SLUG } from "@/lib/keywords";
import { pageOg } from "@/lib/og/meta";

// /keywords — every keyword Scryfall lists on a card of the catalogue, with the number of cards that carry it. The ones with a written definition (lib/keywords.ts)
// come first and show it; the rest, set mechanics and old abilities, are listed by name and count.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Magic: The Gathering Keywords — Flying, Trample, Deathtouch, Ward & More",
  description:
    "Every Magic: The Gathering keyword and ability word — Flying, First strike, Deathtouch, Ward, Cascade, Cycling and more — what each does and every card that has it, with live prices.",
  alternates: { canonical: "/keywords" },
  openGraph: pageOg("/keywords"),
};

export default async function KeywordsHub() {
  const rows = await getKeywordIndex();
  const defined = (kind: string) => rows.filter((r) => KEYWORD_BY_SLUG.get(r.slug)?.kind === kind);
  const groups: { title: string; sub: string; list: KeywordRow[] }[] = [
    { title: "Evergreen keywords", sub: "Printed in every set: the abilities most cards with evasion, speed or protection use.", list: defined("evergreen") },
    { title: "Keyword abilities", sub: "Abilities with their own rules, from Cascade to Ninjutsu, many tied to a set's mechanic.", list: defined("ability") },
    { title: "Keyword actions", sub: "Things a card tells you to do, such as scry, surveil or proliferate.", list: defined("action") },
    { title: "Other keywords", sub: "Set mechanics and older abilities Scryfall lists on cards.", list: rows.filter((r) => !KEYWORD_BY_SLUG.has(r.slug)) },
  ].filter((g) => g.list.length);
  return (
    <div>
      <JsonLd data={itemListLd("Magic: The Gathering keywords", "/keywords", rows.map((k) => ({ name: k.label, path: `/keywords/${k.slug}` })))} />
      <Breadcrumbs trail={[{ name: "Keywords" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Magic: The Gathering keywords</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        What each keyword means, and every card that carries it, priced. Counts are card names (a card with many printings counts once); a card that only grants a keyword to
        other creatures is counted too.
      </p>
      <div className="mt-6">
        <InShort>
          The definitions are short summaries of the Comprehensive Rules. For a ruling on a particular card, check the card&apos;s Oracle text and Wizards of the Coast&apos;s rules.
        </InShort>
      </div>
      {groups.map((g) => (
        <section key={g.title} className="mt-8">
          <h2 className="text-2xl text-white">{g.title}</h2>
          <p className="mb-3 mt-1 text-sm text-slate-400">{g.sub}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.list.map((k) => (
              <Link key={k.slug} href={`/keywords/${k.slug}`} className="card-surface p-4 hover:border-ink-600">
                <p className="font-bold text-white">{k.label}</p>
                {KEYWORD_BY_SLUG.get(k.slug) ? <p className="mt-1 text-sm text-slate-400">{KEYWORD_BY_SLUG.get(k.slug)!.summary}</p> : null}
                <p className="num mt-2 text-xs text-slate-500">{int(k.count)} cards</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
