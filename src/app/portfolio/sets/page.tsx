import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { SET_KINDS } from "@/lib/constants";
import { getCatalog, getSetChecklist, type SetLite } from "@/lib/data";
import { ownedBySet, ownedDb, ownedTakeFor } from "@/lib/set-owned";
import { PROMO_SET_KINDS, preReleaseLine, summarise, summarisePreRelease, type ChecklistCard, type OwnedMap } from "@/lib/set-scope";
import { FREE_PORTFOLIO_LIMIT } from "@/lib/free-limits";
import { NavIcon } from "@/components/NavIcon";

// Personal page, never indexed, and per-request: it reads the signed-in account.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set checklist — what your binder is missing",
  robots: { index: false, follow: false },
};

// THE SET TRACKER'S INDEX — RiftCompare's /portfolio/sets, ported in wave 2
// (2026-10-03; DECISIONS.md, "Set checklist"): one bar per set, grouped by kind
// (booster, extra, premium, starter; promo and event groups behind
// ?promos=1). Each set's catalogue is lib/data.ts getSetChecklist's own cached
// entry (not per-request work); the only per-request read is the account's
// owned cards for the listed sets, one narrow groupBy (lib/set-owned.ts). A set
// that has not released shows "N cards revealed so far" and no bar, fraction or
// percentage. No P&L anywhere on this page.
const MAIN_KINDS = ["booster", "extra", "premium", "starter"];

export default async function SetChecklistIndex({ searchParams }: { searchParams: { promos?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/portfolio/sets");

  const country = getCountry();
  const info = COUNTRIES[country];
  const today = new Date().toISOString().slice(0, 10);
  const withPromos = searchParams.promos === "1";

  const cat = await getCatalog();
  const kinds = withPromos ? [...MAIN_KINDS, ...PROMO_SET_KINDS] : MAIN_KINDS;
  const sets = cat.sets
    .filter((s) => kinds.includes(s.kind) && s.cardCount > 0)
    .sort((a, b) => (SET_KINDS[a.kind]?.order ?? 9) - (SET_KINDS[b.kind]?.order ?? 9) || (b.releasedOn ?? "9999").localeCompare(a.releasedOn ?? "9999"));

  let failed = false;
  const lists = await Promise.all(
    sets.map(async (set) => ({
      set,
      cards: await getSetChecklist(set.id, country).catch((): ChecklistCard[] => {
        failed = true;
        return [];
      }),
    })),
  );
  const shown = lists.filter((l) => l.cards.length > 0);
  const owned: OwnedMap = shown.length
    ? await ownedBySet(await ownedDb(), user.id, shown.map((l) => l.set.id), ownedTakeFor(shown.map((l) => l.cards.length))).catch(() => {
        failed = true;
        return {};
      })
    : {};

  const groups = kinds
    .map((k) => ({ kind: k, label: SET_KINDS[k]?.plural ?? k, items: shown.filter((l) => l.set.kind === k) }))
    .filter((g) => g.items.length);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <Link href="/portfolio" className="text-xs text-slate-500 hover:text-slate-300">← My binder</Link>
        <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-extrabold text-white">
          <NavIcon name="collection" className="h-6 w-6 text-brand-400" />
          Set checklist
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Tick what&apos;s in your binder and see how far through each set you are, what&apos;s missing, and the cheapest listing for
          each missing card in {info.place}. Free for your first {FREE_PORTFOLIO_LIMIT} cards; Plus removes the limit so a whole set
          fits, and nobody loses cards they already have.
        </p>
      </div>

      {failed && (
        <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
          Some sets couldn&apos;t be loaded just now, so they may be missing below. Reload in a minute.
        </p>
      )}

      {shown.length === 0 && !failed ? (
        <p className="card-surface p-6 text-center text-sm text-slate-400">No set has cards in our catalogue yet.</p>
      ) : (
        groups.map((g) => (
          <section key={g.kind} aria-labelledby={`kind-${g.kind}`}>
            <h2 id={`kind-${g.kind}`} className="mb-3 text-lg font-extrabold text-white">{g.label}</h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {g.items.map(({ set, cards }) => (
                <SetCard key={set.id} set={set} cards={cards} owned={owned} pre={!!set.releasedOn && set.releasedOn > today} />
              ))}
            </ul>
          </section>
        ))
      )}

      <p className="text-xs text-slate-500">
        <Link href={withPromos ? "/portfolio/sets" : "/portfolio/sets?promos=1"} className="font-semibold text-brand-400 hover:underline">
          {withPromos ? "Hide promos & events" : "Show promos & events"}
        </Link>
      </p>

      <p className="text-xs text-slate-500">
        Any condition counts as owned, and each printing is its own card. Prices are the cheapest in-stock listing at a store in{" "}
        {info.place}, before postage. To bring in a whole binder, import a CSV (a TCGplayer export, or a card number and printing) from{" "}
        <Link href="/portfolio#collection" className="text-brand-400 hover:underline">My binder</Link>.
      </p>
    </div>
  );
}

function SetCard({ set, cards, owned, pre }: { set: SetLite; cards: ChecklistCard[]; owned: OwnedMap; pre: boolean }) {
  const href = `/portfolio/sets/${set.slug}`;
  if (pre) {
    const p = summarisePreRelease(cards, owned);
    return (
      <li className="card-surface flex flex-col gap-2 p-5" data-set={set.code} data-prerelease>
        <h3 className="text-lg font-extrabold text-white">{set.name}</h3>
        <p className="text-sm text-slate-300">{preReleaseLine(p)}</p>
        <p className="text-xs text-slate-500">
          {p.owned > 0 ? `You have ${p.owned} in your binder. ` : ""}Not released yet, so there is no total to count against.
        </p>
        <Link href={href} className="mt-auto pt-2 text-sm font-semibold text-brand-300 hover:underline">Tick what you pull →</Link>
      </li>
    );
  }
  const base = summarise(cards, owned, "base");
  const all = summarise(cards, owned, "all");
  return (
    <li className="card-surface flex flex-col gap-2 p-5" data-set={set.code}>
      <h3 className="text-lg font-extrabold text-white">
        {set.name} <span className="text-sm font-semibold text-slate-500">{set.code}</span>
      </h3>
      <p className="text-sm text-slate-300">
        <span className="num font-bold text-white">{base.owned}</span> of {base.total} base cards
        {base.percent != null && <span className="ml-1 text-brand-300">· {base.percent}%</span>}
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={base.percent ?? 0}
        aria-label={`${set.name} base set owned`}
        className="h-2.5 overflow-hidden rounded-full bg-ink-800"
      >
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${base.percent ?? 0}%` }} />
      </div>
      <p className="text-xs text-slate-500">
        Every printing we track: {all.owned} of {all.total}. Counts are printings in our catalogue.
      </p>
      <Link href={href} className="mt-auto pt-2 text-sm font-semibold text-brand-300 hover:underline">
        {base.missing > 0 || all.missing > 0 ? "See what's missing →" : "Open the checklist →"}
      </Link>
    </li>
  );
}
