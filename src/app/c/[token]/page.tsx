import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSharedCollection, shareUrlForCollection, collectionPostText } from "@/lib/collection-share";
import { displayName } from "@/lib/collection-server";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { money } from "@/lib/format";
import { CopyPostButton } from "@/components/CopyPostButton";
import { CONDITIONS } from "@/lib/collection-conditions";

// A shared binder (/c/[token]).
//
// Reads the visitor's own market (a shared binder should be valued in the
// currency of whoever OPENED the link, not whoever posted it), which makes the
// route dynamic anyway.
export const dynamic = "force-dynamic";

// NEVER INDEXED, and this is not negotiable. The token in the URL is a
// capability — holding it is the whole authorisation check — so letting a
// crawler index the page would publish a link that was meant to be handed to
// specific people, and would keep serving it from a search result long after the
// owner rotated the token. `nofollow` too: every card link on the page is a
// normal indexable URL reachable elsewhere.
//
// No opengraph-image.tsx beside it: share images read only data/
// loaders (CLAUDE.md, "Share images"), and a binder is one account's rows, so
// the link unfurls with the site's root image (DECISIONS, "Shared binder").
export const metadata: Metadata = {
  title: "Shared collection",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SharedCollectionPage({ params }: { params: { token: string } }) {
  const country = getCountry();
  const shared = await getSharedCollection(params.token, country);
  // 404 for an unknown OR rotated token — never a "this link expired" page,
  // which would confirm the token had once been real.
  if (!shared) notFound();

  const info = COUNTRIES[country];
  const url = shareUrlForCollection(params.token);
  const priced = shared.holdings.filter((h) => h.unitCents != null).length;
  const post = collectionPostText({
    ownerName: shared.ownerName,
    distinctCards: shared.distinctCards,
    totalCopies: shared.totalCopies,
    totalCents: shared.totalCents,
    country,
    top: shared.holdings.slice(0, 3).map((h) => ({ card: h.card, isFoil: h.isFoil, unitCents: h.unitCents })),
    url,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-400">Shared collection</p>
        <h1 className="text-3xl font-extrabold text-white">{shared.ownerName}&apos;s Magic collection</h1>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-slate-400">
          <span>
            <strong className="text-white">{shared.distinctCards}</strong> card{shared.distinctCards === 1 ? "" : "s"}
            {shared.totalCopies !== shared.distinctCards && <> · {shared.totalCopies} copies</>}
          </span>
          <span>
            Valued at <strong className="num text-brand-400">{money(shared.totalCents, country)}</strong> in{" "}
            {info.flag} {info.place}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          Valued at TCGplayer&apos;s market price for the finish each copy is held in, in your market&apos;s currency, adjusted for condition.
          {priced < shared.holdings.length && (
            <> {shared.holdings.length - priced} card{shared.holdings.length - priced === 1 ? " has" : "s have"} no live price and count as zero.</>
          )}
        </p>
        <CopyPostButton text={post} label="Copy share post" />
      </header>

      {shared.holdings.length === 0 ? (
        <p className="rounded-xl border border-ink-800 bg-ink-950/60 p-6 text-center text-slate-400">
          This collection is empty right now.
        </p>
      ) : (
        <ul className="divide-y divide-ink-800 overflow-hidden rounded-xl border border-ink-800 bg-ink-950/60">
          {shared.holdings.map((h, i) => (
            <li key={`${h.card.id}-${h.condition}-${h.isFoil}-${i}`} className="flex items-center gap-3 px-3 py-2.5">
              <Link href={`/card/${h.card.slug}`} className="flex min-w-0 flex-1 items-center gap-3 hover:text-brand-300">
                {h.card.img && (
                  // Empty alt + aria-hidden: the card name/set/number text right
                  // beside it already describes this thumbnail.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.card.img} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-12 w-9 shrink-0 rounded object-cover" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">{displayName(h.card)}{h.isFoil ? ` · ${h.card.foilLabel}` : ""}</span>
                  <span className="block text-[11px] text-slate-500">
                    {h.card.setCode}
                    {h.card.number ? ` · ${h.card.number}` : ""} · {CONDITIONS[h.condition]?.label ?? h.condition}
                    {h.quantity > 1 && ` · ×${h.quantity}`}
                  </span>
                </span>
              </Link>
              <div className="shrink-0 text-right">
                {h.unitCents != null ? (
                  <>
                    <div className="num text-sm font-extrabold text-white">{money(h.unitCents * h.quantity, country)}</div>
                    {h.quantity > 1 && <div className="text-[11px] text-slate-500">{money(h.unitCents, country)} each</div>}
                  </>
                ) : (
                  <div className="text-[11px] text-slate-600">No price yet</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-xl border border-ink-800 bg-ink-950/60 p-5 text-center">
        <h2 className="font-bold text-white">Track your own collection</h2>
        <p className="mt-1 text-sm text-slate-400">
          Add your cards once and MTG Compare values them daily against live prices from every store we track.
        </p>
        {/* Straight to /login, not /portfolio's signed-out bounce, so the
            sign-up carries its source. */}
        <Link href="/login?next=/portfolio&src=shared_collection" rel="nofollow" className="btn-primary mt-3 inline-flex">
          Start your collection
        </Link>
      </section>
    </div>
  );
}
