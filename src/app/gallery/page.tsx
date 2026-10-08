import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, JsonLd } from "@/components/ui";
import { SET_KINDS } from "@/lib/constants";
import { getSets, type SetLite } from "@/lib/data";
import { galleryDescription, galleryTitle } from "@/lib/gallery-seo";
import { int, longDate } from "@/lib/format";
import { breadcrumbLd, itemListLd } from "@/lib/jsonld";
import { pageOg } from "@/lib/og/meta";

// Every route that reaches the published data is dynamic: a build reads no data host (CLAUDE.md, contract C26).
export const dynamic = "force-dynamic";

// The gallery hub: every set with cards, newest first, each linking to its own
// gallery (/sets/[slug]/gallery). Reads the published set list only.
async function gallerySets(): Promise<{ sets: SetLite[]; total: number }> {
  // the hidden kinds (Art Series, oversized) keep their own pages but are not part of the hub
  const sets = (await getSets()).filter((s) => s.cardCount > 0 && !SET_KINDS[s.kind]?.hidden);
  return { sets, total: sets.reduce((n, s) => n + s.cardCount, 0) };
}

export async function generateMetadata(): Promise<Metadata> {
  const { sets, total } = await gallerySets();
  const names = [...sets].sort((a, b) => (a.releasedOn ?? "").localeCompare(b.releasedOn ?? "")).map((s) => s.name);
  return {
    title: galleryTitle(total),
    description: galleryDescription(total, names),
    alternates: { canonical: "/gallery" },
    openGraph: pageOg("/gallery"),
  };
}

export default async function GalleryHub() {
  const { sets: listed, total } = await gallerySets();
  const counts = new Map(listed.map((s) => [s.id, s.cardCount] as const));
  const sets = [...listed].sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? "") || a.code.localeCompare(b.code));
  const kinds = Object.entries(SET_KINDS).sort((a, b) => a[1].order - b[1].order);
  return (
    <div>
      <JsonLd data={itemListLd("Magic card galleries", "/gallery", sets.map((s) => ({ name: `${s.name} gallery`, path: `/sets/${s.slug}/gallery` })))} />
      <Breadcrumbs trail={[{ name: "Gallery" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Magic: The Gathering card gallery</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        Every Magic card as art, set by set: {int(total)} printings across {int(sets.length)} sets. Pick a set to filter its gallery by colour, rarity or treatment (Borderless, Extended Art, Showcase, foil patterns); each card opens its live prices. Looking for prices first? The{" "}
        <Link href="/price-guide" className="text-brand-400 hover:underline">
          price guide
        </Link>{" "}
        lists every card in one table.
      </p>
      {kinds.map(([kind, info]) => {
        const group = sets.filter((s) => s.kind === kind);
        if (!group.length) return null;
        return (
          <section key={kind} className="mt-8">
            <h2 className="mb-3 text-xl text-white">{info.plural}</h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((s) => (
                <li key={s.id}>
                  <Link href={`/sets/${s.slug}/gallery`} className="card-surface block p-3 transition-colors hover:border-ink-600">
                    <span className="block text-sm font-semibold text-white">{s.name}</span>
                    <span className="num block text-xs text-slate-400">
                      {s.code} · {int(counts.get(s.id) ?? 0)} cards{s.releasedOn ? ` · ${longDate(s.releasedOn)}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
