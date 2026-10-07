import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, JsonLd } from "@/components/ui";
import { SET_KINDS } from "@/lib/constants";
import { getCatalog } from "@/lib/data";
import { galleryDescription, galleryTitle } from "@/lib/gallery-seo";
import { int, longDate } from "@/lib/format";
import { breadcrumbLd, itemListLd } from "@/lib/jsonld";
import { pageOg } from "@/lib/og/meta";

// The gallery hub: every set with cards, newest first, each linking to its own
// gallery (/sets/[slug]/gallery). Reads the cached catalogue only.
export async function generateMetadata(): Promise<Metadata> {
  const cat = await getCatalog();
  const sets = cat.sets.filter((s) => cat.cards.some((c) => c.setId === s.id));
  const names = [...sets].sort((a, b) => (a.releasedOn ?? "").localeCompare(b.releasedOn ?? "")).map((s) => s.name);
  return {
    title: galleryTitle(cat.cards.length),
    description: galleryDescription(cat.cards.length, names),
    alternates: { canonical: "/gallery" },
    openGraph: pageOg("/gallery"),
  };
}

export default async function GalleryHub() {
  const cat = await getCatalog();
  const counts = new Map<number, number>();
  for (const c of cat.cards) counts.set(c.setId, (counts.get(c.setId) ?? 0) + 1);
  const sets = cat.sets.filter((s) => counts.has(s.id)).sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? "") || a.code.localeCompare(b.code));
  const kinds = Object.entries(SET_KINDS).sort((a, b) => a[1].order - b[1].order);
  return (
    <div>
      <JsonLd data={itemListLd("One Piece card galleries", "/gallery", sets.map((s) => ({ name: `${s.name} gallery`, path: `/sets/${s.slug}/gallery` })))} />
      <Breadcrumbs trail={[{ name: "Gallery" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">One Piece card gallery</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        Every One Piece Card Game card as art, set by set: {int(cat.cards.length)} printings across {int(sets.length)} sets. Pick a set to filter its gallery by colour, rarity or printing; each card opens its live prices. Looking for prices first? The{" "}
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
