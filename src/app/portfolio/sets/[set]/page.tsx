import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { getCatalog, getSetChecklist } from "@/lib/data";
import { ownedBySet, ownedDb } from "@/lib/set-owned";
import type { ChecklistCard, OwnedMap } from "@/lib/set-scope";
import { FREE_PORTFOLIO_LIMIT } from "@/lib/free-limits";
import { longDate } from "@/lib/format";
import { SetOwnedProvider } from "@/components/SetOwned";
import { SetTracker } from "@/components/SetTracker";

// Personal page, never indexed, per-request (it reads the signed-in account).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set checklist — what your binder is missing",
  robots: { index: false, follow: false },
};

// ONE SET'S CHECKLIST — RiftCompare's /portfolio/sets/[set], ported in wave 2
// (2026-10-03; DECISIONS.md, "Set checklist").
//
// It takes no query string and never throws a not-found (a loading boundary
// sits above /portfolio): scope, filters and sort live in the client component
// and an unknown set bounces to the index. The catalogue is lib/data.ts
// getSetChecklist's cached entry; the only per-request read is the account's
// owned cards for THIS set, one narrow groupBy. Called directly, never inside
// an unstable_cache.
export default async function SetChecklistPage({ params }: { params: { set: string } }) {
  const cat = await getCatalog();
  const set = cat.setBySlug.get(params.set);
  if (!set) redirect("/portfolio/sets");
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/portfolio/sets/${set.slug}`);

  const country = getCountry();
  const info = COUNTRIES[country];

  let cards: ChecklistCard[] = [];
  let owned: OwnedMap = {};
  let failed = false;
  try {
    [cards, owned] = await Promise.all([getSetChecklist(set.id, country), ownedDb().then((db) => ownedBySet(db, user.id, set.id))]);
  } catch {
    failed = true;
  }

  const preRelease = !!set.releasedOn && set.releasedOn > new Date().toISOString().slice(0, 10);
  const releasedLabel = set.releasedOn ? longDate(set.releasedOn) : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/portfolio" className="hover:text-slate-300">My binder</Link>
          <span>/</span>
          <Link href="/portfolio/sets" className="hover:text-slate-300">Set checklist</Link>
          <span>/</span>
          <span className="text-slate-300">{set.name}</span>
        </nav>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-white">{set.name} checklist</h1>
        <p className="mt-1 text-sm text-slate-400">
          {preRelease
            ? `Tick the ${set.name} cards you have as they're revealed.`
            : `What your binder is missing from ${set.name} (${set.code}), and the cheapest listing for each card in ${info.place} (${info.currency}).`}
        </p>
      </div>

      {failed ? (
        <p role="alert" className="card-surface p-6 text-center text-sm text-amber-200">
          Couldn&apos;t load {set.name} just now. Reload in a minute.
        </p>
      ) : cards.length === 0 ? (
        <p className="card-surface p-6 text-center text-sm text-slate-400">
          There are no {set.name} cards in our catalogue yet. <Link href="/portfolio/sets" className="text-brand-400 hover:underline">Back to the checklist</Link>
        </p>
      ) : (
        <SetOwnedProvider setSlug={set.slug} initial={owned}>
          <SetTracker
            setName={set.name}
            setSlug={set.slug}
            cards={cards}
            initialOwned={owned}
            currency={info.currency}
            place={info.place}
            country={country}
            preRelease={preRelease}
            releasedLabel={releasedLabel}
            freeLimit={FREE_PORTFOLIO_LIMIT}
          />
        </SetOwnedProvider>
      )}
    </div>
  );
}
