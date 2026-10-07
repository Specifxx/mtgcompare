import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, InShort, JsonLd } from "@/components/ui";
import { getCardText } from "@/lib/data";
import { int } from "@/lib/format";
import { itemListLd } from "@/lib/jsonld";
import { KEYWORDS } from "@/lib/keywords";
import { pageOg } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: "One Piece Card Game Keywords — Rush, Blocker, Banish, Trigger & More",
  description:
    "Every One Piece Card Game keyword and timing — Rush, Blocker, Double Attack, Banish, Trigger, On Play, Activate: Main and more — what each does and every card whose text has it.",
  alternates: { canonical: "/keywords" },
  openGraph: pageOg("/keywords"),
};

export default async function KeywordsHub() {
  const text = await getCardText();
  const count = new Map<string, number>();
  for (const [, , ks] of text.rows) for (const i of ks) count.set(text.kws[i], (count.get(text.kws[i]) ?? 0) + 1);
  const groups = [
    { title: "Keywords", sub: "Abilities printed in brackets that change how a card attacks, blocks or deals damage.", list: KEYWORDS.filter((k) => k.kind === "keyword") },
    { title: "Timings", sub: "When an effect can be used or applies.", list: KEYWORDS.filter((k) => k.kind === "timing") },
  ];
  return (
    <div>
      <JsonLd data={itemListLd("One Piece Card Game keywords", "/keywords", KEYWORDS.map((k) => ({ name: k.name, path: `/keywords/${k.slug}` })))} />
      <Breadcrumbs trail={[{ name: "Keywords" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">One Piece Card Game keywords</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        What each bracketed keyword and timing on a One Piece card means, and every card whose text carries it, priced. Counts are card numbers (all
        printings of a number share their text).
      </p>
      <div className="mt-6">
        <InShort>
          The definitions are short summaries of Bandai&apos;s Comprehensive Rules. For a ruling on a particular card, check the rules on the official
          One Piece Card Game site.
        </InShort>
      </div>
      {groups.map((g) => (
        <section key={g.title} className="mt-8">
          <h2 className="text-2xl text-white">{g.title}</h2>
          <p className="mb-3 mt-1 text-sm text-slate-400">{g.sub}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.list.map((k) => (
              <Link key={k.slug} href={`/keywords/${k.slug}`} className="card-surface p-4 hover:border-ink-600">
                <p className="font-bold text-white">[{k.name}]</p>
                <p className="mt-1 text-sm text-slate-400">{k.summary}</p>
                <p className="num mt-2 text-xs text-slate-500">{int(count.get(k.slug) ?? 0)} cards</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
