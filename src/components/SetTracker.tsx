"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { RARITIES } from "@/lib/constants";
import { money } from "@/lib/format";
import type { Country } from "@/lib/country";
import {
  SET_FOOTER_COPY,
  SET_SCOPES,
  isOwned,
  listRows,
  compareByNumber,
  missingCsv,
  missingText,
  otherSourceLabel,
  preReleaseLine,
  raritiesIn,
  stockOf,
  summarise,
  summarisePreRelease,
  type ChecklistCard,
  type OwnedMap,
  type SetScope,
  type ShowFilter,
  type SortKey,
} from "@/lib/set-scope";
import { SET_GAP_CHUNK, revealedWithoutListing } from "@/lib/set-gap";
import { OwnedTick, SetLimitPanel, useSetOwned } from "./SetOwned";
import { SetMissingActions } from "./SetMissingActions";
import { PrintingChip } from "./MyCollection";

// THE SET CHECKLIST (/portfolio/sets/[set]): what a binder is missing from one
// set, and the cheapest listing for each missing card. Rows carry the collector
// number and a treatment chip (Borderless, Extended Art, Foil Etched…).
//
// A client component on purpose. The page hands over the set's published checklist
// and the account's owned map once; scope, filters, sort, the progress numbers,
// the cost to finish and the missing-list export all follow from those with the
// pure functions in lib/set-scope.ts, so a tick updates every number at once with
// no round trip, and the page needs no searchParams (a loading.tsx sits above
// /portfolio, and scripts/adsense-guard.ts refuses one above a searchParams
// route).
//
// NO P&L IN THIS VIEW. The cost to finish is "the cheapest listing today, before
// postage" for cards you do not have. Nothing here says what a card is worth,
// what a binder gained, or what to buy before it moves.

const btn = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
    on ? "border-brand-400/60 bg-brand-500/20 text-brand-200" : "border-ink-700 text-slate-300 hover:border-brand-500"
  }`;

export function SetTracker({
  setName,
  setSlug,
  cards,
  initialOwned,
  currency,
  place,
  country,
  preRelease,
  releasedLabel,
  freeLimit,
}: {
  setName: string;
  setSlug: string;
  cards: ChecklistCard[];
  initialOwned: OwnedMap;
  currency: string;
  /** "the United States", for "not in stock in …". */
  place: string;
  country: Country;
  /** The set has not released: "N revealed", no denominator, no prices. */
  preRelease: boolean;
  /** "23 October 2026", or null. */
  releasedLabel: string | null;
  freeLimit: number;
}) {
  const ctx = useSetOwned();
  const owned: OwnedMap = ctx?.owned ?? initialOwned;
  const [scope, setScope] = useState<SetScope>("base");
  const [show, setShow] = useState<ShowFilter>("missing");
  const [rarity, setRarity] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("cheapest");
  // What was owned when the page loaded. A card ticked just now stays in the
  // "missing" list, dimmed, so a row never jumps away under a finger.
  const atLoad = useRef<OwnedMap>(initialOwned);

  const base = useMemo(() => summarise(cards, owned, "base"), [cards, owned]);
  const all = useMemo(() => summarise(cards, owned, "all"), [cards, owned]);
  const s = scope === "base" ? base : all;
  const rarities = useMemo(() => raritiesIn(cards, scope), [cards, scope]);
  const activeRarity = rarities.includes(rarity) ? rarity : "";

  const rows = useMemo(() => {
    // "Missing" is judged against what was owned at load, so a fresh tick stays visible.
    const judge = show === "missing" ? atLoad.current : owned;
    return listRows(cards, judge, { scope, show, rarity: activeRarity || null, sort });
  }, [cards, owned, scope, show, activeRarity, sort]);
  // The export is the live missing list in the current scope, rarity and order.
  const missingNow = useMemo(
    () => listRows(cards, owned, { scope, show: "missing", rarity: activeRarity || null, sort }),
    [cards, owned, scope, activeRarity, sort],
  );
  const pre = useMemo(() => summarisePreRelease(cards, owned), [cards, owned]);

  if (preRelease) {
    const list = cards.filter((c) => !c.isPromo).sort(compareByNumber);
    return (
      <div className="flex flex-col gap-4">
        <section className="card-surface p-5" data-set-prerelease>
          <p className="font-display text-2xl font-extrabold text-white">{preReleaseLine(pre)}</p>
          <p className="mt-1 text-sm text-slate-400">
            {pre.owned > 0 ? `You have ${pre.owned} of them in your binder. ` : ""}
            {setName} isn&apos;t out yet, so there is no total to count against: cards appear here as they are revealed, and the
            progress bar and the cost to finish start once the set is released{releasedLabel ? ` on ${releasedLabel}` : ""}. Tick
            what you pull as you go.
          </p>
          <SetLimitPanel className="mt-3" />
        </section>
        <ul className="card-surface divide-y divide-ink-800 overflow-hidden">
          {list.map((c) => (
            <Row key={c.id} c={c} owned={owned} place={place} country={country} priced={false} />
          ))}
        </ul>
        <PlanThePurchase setName={setName} setSlug={setSlug} disabledReason={preReleasePlanLine(setName, releasedLabel, revealedWithoutListing(cards))} />
        <Notes setSlug={setSlug} setName={setName} freeLimit={freeLimit} />
      </div>
    );
  }

  const scopeInfo = SET_SCOPES.find((x) => x.key === scope)!;
  const counts = { missing: s.missing, owned: s.owned, all: s.total };
  return (
    <div className="flex flex-col gap-4">
      <section className="card-surface p-5" aria-labelledby="set-progress-h">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Which printings count">
          {SET_SCOPES.map((x) => (
            <button key={x.key} type="button" aria-pressed={scope === x.key} onClick={() => setScope(x.key)} className={btn(scope === x.key)}>
              {x.label} <span className="num text-slate-400">({(x.key === "base" ? base : all).total})</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{scopeInfo.hint} Counts are the printings in our price data.</p>

        <h2 id="set-progress-h" className="mt-4 font-display text-2xl font-extrabold text-white">
          {s.owned} of {s.total} {s.total === 1 ? "card" : "cards"}
          {s.percent != null && <span className="ml-2 text-base font-bold text-brand-300">{s.percent}%</span>}
        </h2>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={s.percent ?? 0}
          aria-label={`${setName} ${scopeInfo.label.toLowerCase()} owned`}
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-ink-800"
        >
          <div className="h-full rounded-full bg-brand-500 transition-[width] duration-base" style={{ width: `${s.percent ?? 0}%` }} />
        </div>

        {s.missing === 0 ? (
          <p className="mt-3 text-sm text-slate-300">Every printing we list in this set is ticked.</p>
        ) : (
          <div className="mt-3 text-sm text-slate-300" data-set-cost>
            <p>
              <span className="font-semibold text-white">{s.priced > 0 ? money(s.costCents, country) : "No store listing yet"}</span>
              {s.priced > 0 && (
                <>
                  {" "}
                  for the cheapest listing of {s.priced} missing {s.priced === 1 ? "card" : "cards"} in {place}
                </>
              )}
              .
            </p>
            {(s.notInStock > 0 || s.otherOnly > 0) && (
              <p className="mt-1 text-xs text-slate-400">
                Not in that total:{" "}
                {[
                  s.notInStock > 0 ? `${s.notInStock} not in stock in ${place}` : null,
                  s.otherOnly > 0 ? `${s.otherOnly} ${otherSourceLabel(country)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                .
              </p>
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">{SET_FOOTER_COPY}</p>
        <SetLimitPanel className="mt-3" />
      </section>

      <section className="flex flex-col gap-3" aria-label="Filter the list">
        <div className="flex flex-wrap items-center gap-2">
          {(["missing", "owned", "all"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)} className={btn(show === k)}>
              {k === "missing" ? "Missing" : k === "owned" ? "Owned" : "All"} <span className="num text-slate-400">({counts[k]})</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <label className="flex items-center gap-1.5">
            Rarity
            <select value={activeRarity} onChange={(e) => setRarity(e.target.value)} className="input py-1 text-xs sm:text-xs">
              <option value="">All</option>
              {rarities.map((r) => (
                <option key={r} value={r}>{RARITIES[r]?.label ?? r}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="input py-1 text-xs sm:text-xs">
              <option value="cheapest">Cheapest first</option>
              <option value="dearest">Dearest first</option>
              <option value="number">Card number</option>
            </select>
          </label>
          <SetMissingActions
            text={missingText(missingNow)}
            csv={missingCsv(missingNow, currency)}
            filename={`mtgcompare-${setSlug}-missing.csv`}
            count={missingNow.length}
          />
        </div>
      </section>

      {rows.length === 0 ? (
        <p className="card-surface p-6 text-center text-sm text-slate-400">
          {show === "missing" ? "Nothing missing here." : show === "owned" ? "Nothing ticked here yet." : "No cards match."}
        </p>
      ) : (
        <ul className="card-surface divide-y divide-ink-800 overflow-hidden">
          {rows.map((c) => (
            <Row key={c.id} c={c} owned={owned} place={place} country={country} priced justTicked={isOwned(owned, c.id) && !isOwned(atLoad.current, c.id)} />
          ))}
        </ul>
      )}
      {show === "missing" && missingNow.length > 0 && (
        <PlanThePurchase
          setName={setName}
          setSlug={setSlug}
          scope={scope}
          rarity={activeRarity}
          count={missingNow.filter((c) => stockOf(c) === "store").length}
        />
      )}
      <Notes setSlug={setSlug} setName={setName} freeLimit={freeLimit} />
    </div>
  );
}

// Radiance (and any set not out yet): the button is off, and says why with the
// number of revealed cards that have no listing yet, never a total.
function preReleasePlanLine(setName: string, releasedLabel: string | null, noListing: number): string {
  return `You can plan the purchase once ${setName} is released${releasedLabel ? ` on ${releasedLabel}` : ""}. ${noListing} ${
    noListing === 1 ? "revealed card has" : "revealed cards have"
  } no store listing yet.`;
}

// "Plan the purchase" (2026-09-29, Finish this set): the bottom of the missing
// list hands the set, the printings counted and the rarity on screen to Best
// Basket's "Finish a set" source. It is a link, not a request: Best Basket's
// own run (a free total, Premium's store-by-store plan) starts there.
function PlanThePurchase({
  setName,
  setSlug,
  scope,
  rarity,
  count,
  disabledReason,
}: {
  setName: string;
  setSlug: string;
  scope?: SetScope;
  rarity?: string;
  count?: number;
  disabledReason?: string;
}) {
  if (disabledReason) {
    return (
      <section className="card-surface p-4" data-plan-purchase="disabled">
        <button type="button" disabled className="btn-primary cursor-not-allowed text-sm opacity-50">
          Plan the purchase
        </button>
        <p className="mt-2 text-xs text-slate-400">{disabledReason}</p>
      </section>
    );
  }
  const q = new URLSearchParams({ source: "set", set: setSlug, scope: scope ?? "base" });
  if (rarity) q.set("rarity", rarity);
  return (
    <section className="card-surface p-4" data-plan-purchase>
      <Link href={`/tools/best-basket?${q}`} className="btn-primary inline-block text-sm">
        Plan the purchase
      </Link>
      <p className="mt-2 text-xs text-slate-400">
        Best Basket prices the {count} missing {setName} {count === 1 ? "card that has" : "cards that have"} a store listing, delivered, with each store&apos;s measured postage.
        Any account sees its total; Premium shows which store to buy each card from.
        {(count ?? 0) > SET_GAP_CHUNK ? ` A plan holds up to ${SET_GAP_CHUNK} cards, so it starts with the ${SET_GAP_CHUNK} cheapest and offers the next ${SET_GAP_CHUNK}.` : ""}
      </p>
    </section>
  );
}

function Row({
  c,
  owned,
  place,
  country,
  priced,
  justTicked = false,
}: {
  c: ChecklistCard;
  owned: OwnedMap;
  place: string;
  country: Country;
  priced: boolean;
  justTicked?: boolean;
}) {
  const r = c.rarity ? RARITIES[c.rarity] : undefined;
  const stock = stockOf(c);
  return (
    <li className={`flex items-center gap-3 px-3 py-2 sm:px-4 ${justTicked ? "opacity-60" : ""}`} data-card={c.id} data-owned={isOwned(owned, c.id) ? "1" : "0"}>
      <div className="w-[6.75rem] shrink-0 sm:w-[7.5rem]">
        <OwnedTick cardId={c.id} cardName={c.name} variant="row" />
      </div>
      <div className="min-w-0 flex-1">
        <Link href={`/card/${c.slug}`} className="block truncate text-sm font-semibold text-slate-100 hover:text-brand-300 hover:underline">
          {c.name}
        </Link>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
          <span className="num">{c.number ?? c.setCode}</span> ·{" "}
          <span className={r?.tone ?? "text-slate-300"}>{r?.label ?? c.rarity ?? "—"}</span>
          <PrintingChip printing={c.printing} />
        </p>
      </div>
      {priced && (
        <div className="shrink-0 text-right text-xs">
          {stock === "store" ? (
            <>
              <div className="num text-sm font-bold text-white">{money(c.minCents ?? 0, country)}</div>
              <div className="text-slate-500">
                {c.stores} {c.stores === 1 ? "store" : "stores"}
              </div>
            </>
          ) : stock === "other" ? (
            <span className="font-medium text-slate-400">{otherSourceLabel(country)}</span>
          ) : (
            <span className="font-medium text-slate-500">Not in stock in {place}</span>
          )}
        </div>
      )}
    </li>
  );
}

function Notes({ setSlug, setName, freeLimit }: { setSlug: string; setName: string; freeLimit: number }) {
  return (
    <div className="text-xs leading-relaxed text-slate-500">
      <p>
        Any condition and any finish counts as owned, one copy is enough, each printing is its own card (a Borderless one is not its plain print),
        and promos are not part of the list. A free account
        tracks up to {freeLimit} cards; if you already hold more you keep all of them, and a paid plan has no limit.
      </p>
      <p className="mt-1">
        Ticked a card by mistake? Change its quantity in <Link href="/portfolio#collection" className="text-brand-400 hover:underline">My binder</Link>.
        Bringing in a whole binder? Import a CSV (a TCGplayer, Moxfield, Deckbox or ManaBox export) from the same
        place: it keeps the printing and the finish and tells you what it skipped. To price the delivered order for what&apos;s missing, use &quot;Plan the purchase&quot; at the bottom of the missing list, or paste the copied list into{" "}
        <Link href="/tools/best-basket" className="text-brand-400 hover:underline">Best Basket</Link>.
      </p>
      <p className="mt-1">
        <Link href={`/sets/${setSlug}`} className="text-brand-400 hover:underline">Back to the {setName} card list &amp; prices →</Link>
      </p>
    </div>
  );
}
