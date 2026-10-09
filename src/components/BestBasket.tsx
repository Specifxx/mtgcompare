"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { useCountry } from "./CountryProvider";
import PlanButton from "./PlanButton";
import { QtyInput } from "./QtyInput";
import { CardPicker, type PickerCard } from "./CardPicker";
import { outboundRel, ebaySearchUrl, magicEbayQuery } from "@/lib/affiliate";
import { COUNTRIES, type Country } from "@/lib/country";
import { money } from "@/lib/format";
import { parseDeckList, formatDeckLine, DECK_LINE_CAP } from "@/lib/deck";
import { canWatchPricedResult } from "@/lib/deck-watch-pure";
import { DeckWatchForm } from "./DeckWatchForm";
import { DiscoveryTip } from "./DiscoveryTip";
import type { BasketAlternatives, BasketPlan, BasketPreview, BasketStoreGroup, TwoStoresNone } from "@/lib/basket";
import { trackEvent } from "@/lib/analytics";
import { effectiveRegion, readPostagePrefs, writePostagePrefs } from "@/lib/postage-prefs";
import { freePrefix, joinList, planPostageNotes, postageLineBits, postagePrefix, trackedTag } from "@/lib/postage-display";
import { useMe } from "@/lib/use-me";
import { useWatchedIds } from "@/lib/use-watchlist";
import { basketSavingPitch } from "@/lib/basket-saving";
import { planPrice } from "@/lib/plans";
import { RARITY_KEYS, rarityLabel } from "@/lib/constants";
import { SET_SCOPES, type SetScope } from "@/lib/set-scope";
import { SET_GAP_CHUNK, nextChunkLabel, setGapNote, type SetGapSummary } from "@/lib/set-gap";
import { DEFAULT_MIN_CONDITION, MIN_CONDITIONS, MIN_CONDITION_LABEL, MIN_CONDITION_PHRASE, playedCopiesNote, type MinCondition } from "@/lib/basket-condition";

export type BasketSource = "deck" | "watchlist" | "binder" | "set";

// "Finish a set": the sets the picker offers (the slug is what a request
// carries), and what a link into the source hands in (?source=set&set=&scope=&rarity=).
export interface BasketSetOption {
  code: string;
  slug: string;
  name: string;
  released: boolean;
}
export interface BasketSetStart {
  slug: string;
  scope: SetScope;
  rarity: string | null;
}

interface PickedLine {
  card: PickerCard;
  qty: number;
}

// The Premium price the upgrade line quotes ("Unlock it for $4.99/mo").
const PREMIUM_PRICE_LABEL = `${planPrice("premium", "month")}/mo`;

export interface BasketRegionOption {
  key: string;
  label: string; // the picker's text, a name short enough for a phone: "Northeast", "Elsewhere (not measured)"
  phrase: string; // in a sentence: "the Northeast"
  pricedTo: string; // under the picker: "priced to New York, the one address we measured there"
  unmeasured?: boolean; // "Elsewhere (not measured)"
}

// What /api/basket returns to Premium: the preview numbers plus the plans.
interface FullResult extends BasketPreview {
  setGap?: SetGapSummary;
  plan: BasketPlan;
  alternatives: BasketAlternatives;
  fuzzy: { raw: string; matchedAs: string }[];
  skippedOwned: number;
  skippedHoldings: number;
  // The floor the plan was priced at (Premium's; lib/basket-condition.ts).
  minCondition?: MinCondition;
  // Finish this set: the set's name and (Premium only) the missing cards no
  // real store has in stock, named.
  setName?: string;
  notStocked?: { name: string; setCode: string; number: string | null }[];
}
// A non-Premium answer to the set source adds counts only: no store, line or link.
type Result = (BasketPreview & { setGap?: SetGapSummary }) | FullResult;
const isFull = (r: Result): r is FullResult => "plan" in r;

type PlanKey = "split" | "single" | "two";

const TABS: { key: BasketSource; label: string }[] = [
  { key: "deck", label: "Paste a list" },
  { key: "watchlist", label: "My watchlist" },
  { key: "binder", label: "My binder" },
  { key: "set", label: "Finish a set" },
];

// The Best Basket tool (RiftCompare's BestBasket, for MTG Compare). One list in
// — pasted (or searched card by card) or your watchlist — and the cheapest
// delivered way to buy it out.
//
// `full` is Premium: the three plans side by side and every store line with its
// condition and a tracked link. Anyone else signed in gets a click-only preview
// of their own real numbers (the route withholds the store lines; see
// api/basket/route.ts), and nothing runs until they click.
//
// POSTAGE (2026-09-25): each store's own checkout rate for the order it would
// get, measured — not a flat guess. The buyer picks where it is going; the
// picker starts from their location (geoRegion, from Vercel's geo headers —
// a US visitor in Ohio starts on "Midwest", priced to Chicago; one in Maryland
// on "South Atlantic", priced at the dearer of New York and Dallas), and their
// own pick is remembered in this browser. Unset, every store is priced at its
// HIGHEST regional rate and says "up to"; "Elsewhere (not measured)" is priced
// the same way and marked "est." — "from" in the US and Canada, where it means
// Alaska, Hawaii or the north and costs more. The buyer can rule out untracked
// letters. Each store line names the store's own rate, says when a cheaper
// untracked letter was skipped, marks an order bigger than any measured
// "from", and marks any store still on an estimate "est.". See lib/shipping.ts
// and lib/postage-display.ts. A changed delivery choice re-prices Premium's
// plan on screen; a preview is cleared instead (a re-run is one of the five).
export function BestBasket({
  full,
  initialList,
  initialSource = "deck",
  initialSkipOwned = false,
  sets = [],
  initialSet = null,
  initialMinCondition = DEFAULT_MIN_CONDITION,
  autoRun = false,
  market,
  regions,
  zonePriced,
  measuredAt,
  measuredTo,
  geoRegion,
  watch = null,
  emailOn = false,
}: {
  full: boolean;
  initialList?: string;
  initialSource?: BasketSource;
  initialSkipOwned?: boolean;
  // "Finish a set": the sets the picker offers, and the set, scope and rarity a
  // link handed in.
  sets?: BasketSetOption[];
  initialSet?: BasketSetStart | null;
  // The starting minimum condition: the member's last choice, "LP or better"
  // for a new session, or a saved watch's own floor. Premium's switch; anyone
  // else is priced at any condition (the route ignores it).
  initialMinCondition?: MinCondition;
  autoRun?: boolean;
  market: string;
  // A saved deck price watch being re-run for its owner (?watch=, 2026-09-29):
  // its name, and the delivery it was saved with, which overrides the
  // remembered postage choice so the plan matches the email.
  watch?: { id: string; name: string; region: string | null; trackedOnly: boolean; minCondition: MinCondition } | null;
  regions: BasketRegionOption[];
  zonePriced: boolean;
  measuredAt: string | null; // "25 Sep 2026"
  measuredTo: string[]; // the addresses the market was measured to: ["New York", "San Francisco", …]
  geoRegion: string | null; // the region the visitor's location suggests (a regions[] key), or null
  // Email is configured (getEmailStatus): only then may the copy promise an email.
  emailOn?: boolean;
}) {
  const { country } = useCountry();
  const fmt = (c: number) => money(c, country);
  const watchedIds = useWatchedIds();
  const [tab, setTab] = useState<BasketSource>(initialSource);
  const [picked, setPicked] = useState<PickedLine[]>([]);
  const [pasteText, setPasteText] = useState(initialList ?? "");
  const [skipOwned, setSkipOwned] = useState(initialSkipOwned);
  // Finish a set. `chunkStart` is what run() sends as `after` (the cursor the
  // last answer gave for its next chunk): set in the same tick as a step to the
  // next chunk, and put back to null by any other change.
  const [setSlug, setSetSlug] = useState(initialSet?.slug ?? "");
  const [setScope, setSetScope] = useState<SetScope>(initialSet?.scope ?? "base");
  const [setRarity, setSetRarity] = useState(initialSet?.rarity ?? "");
  const [ceilingText, setCeilingText] = useState("");
  const chunkStart = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [shown, setShown] = useState<PlanKey>("split");
  // Bumped by every run and every input change: a response that comes back
  // for an older request is dropped, not shown under inputs it doesn't match.
  const reqSeq = useRef(0);

  // Delivery. The server knows the visitor's location, so the first render
  // already shows their region; a remembered choice replaces it after mount.
  const validRegion = (k: string) => regions.some((r) => r.key === k);
  const geo = geoRegion && validRegion(geoRegion) ? geoRegion : null;
  const [region, setRegion] = useState<string | null>(geo);
  const [regionGuessed, setRegionGuessed] = useState(!!geo);
  const [trackedOnly, setTrackedOnly] = useState(false);
  // What run() prices with — set in the same tick as a change, so a run
  // started by that change (or by the auto-run below, in the same commit as
  // the prefs load) never reads the choice from before it.
  const delivery = useRef<{ region: string | null; trackedOnly: boolean }>({ region: geo, trackedOnly: false });

  // Minimum condition (Premium). The ref is what run() prices with, set in the
  // same tick as a change, like the delivery choice above. `saveNext` marks the
  // run that follows the member's own change, which is remembered server-side.
  const [minCondition, setMinCondition] = useState<MinCondition>(initialMinCondition);
  const floor = useRef<MinCondition>(initialMinCondition);
  const saveFloor = useRef(false);

  // Remembered choices load after mount (localStorage is not readable on the
  // server); an unknown region prices at each store's highest regional rate.
  // Declared before the auto-run effect, which relies on it having run.
  useEffect(() => {
    const p = readPostagePrefs(market);
    const r = watch ? (watch.region && validRegion(watch.region) ? watch.region : null) : effectiveRegion(p, geoRegion, validRegion);
    const tracked = watch ? watch.trackedOnly : p.trackedOnly;
    setRegion(r);
    setRegionGuessed(!watch && !p.regionChosen && !!geoRegion && validRegion(geoRegion));
    setTrackedOnly(tracked);
    delivery.current = { region: r, trackedOnly: tracked };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, regions, geoRegion]);

  // The list as text, for "Watch this list": cards added by search first
  // (as pinned lines), then the paste — the order the route prices them in.
  const watchListText = useMemo(
    () => [...picked.map((p) => formatDeckLine(p.qty, { id: p.card.id, name: p.card.name, number: p.card.number, setCode: p.card.set, flags: 0 }, true)), pasteText.trim()].filter(Boolean).join("\n"),
    [picked, pasteText],
  );
  const watchDefaultName = watch?.name ?? (picked[0] ? `${picked[0].card.name} deck` : (parseDeckList(pasteText)[0]?.name || "My list").slice(0, 60));

  const watchable = !!result && isFull(result) && canWatchPricedResult({ skippedOwned: result.skippedOwned, coveredCopies: result.plan.coveredCopies });

  // Any change to what's being asked for clears the old answer, so a plan on
  // screen always belongs to the inputs above it — including an answer still
  // on its way for the inputs as they were.
  function touched() {
    chunkStart.current = null;
    setResult(null);
    setError(null);
    reqSeq.current++;
    setLoading(false);
  }

  // A market switch (CountryProvider's router.refresh() keeps this state) makes
  // any plan on screen another market's: its cents would be formatted in the
  // new currency, with the old market's store links.
  const shownCountry = useRef(country);
  useEffect(() => {
    if (shownCountry.current === country) return;
    shownCountry.current = country;
    touched();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  // Lines as the route counts them (picked cards first, then pasted lines,
  // DECK_LINE_CAP in all), so the page can say when a list runs past the cap.
  const pastedLines = useMemo(() => (tab === "deck" ? parseDeckList(pasteText).length : 0), [tab, pasteText]);
  const listLines = tab === "deck" ? picked.length + pastedLines : 0;
  const overCap = listLines > DECK_LINE_CAP;

  // The per-card ceiling, in whole cents; empty or unreadable = no ceiling.
  const ceilingCents = (() => {
    const n = parseFloat(ceilingText.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  })();

  // "Plan the next 200": the same set, scope, rarity and ceiling, strictly after
  // the last card of the chunk on screen (a cursor, not a rank).
  function nextChunk(cursor: string) {
    chunkStart.current = cursor;
    void run();
  }

  async function run() {
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    setResult(null);
    setShown("split");
    const q = new URLSearchParams();
    if (delivery.current.region) q.set("region", delivery.current.region);
    if (delivery.current.trackedOnly) q.set("tracked", "1");
    const saveMin = saveFloor.current;
    saveFloor.current = false;
    try {
      const res = await fetch(`/api/basket${q.toString() ? `?${q}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: tab,
          skipOwned: tab === "set" || (tab !== "binder" && skipOwned),
          ...(full ? { minCondition: floor.current, saveMinCondition: saveMin } : {}),
          ...(tab === "deck" ? { text: pasteText, lines: picked.map((p) => ({ cardId: String(p.card.id), qty: p.qty })) } : {}),
          ...(tab === "watchlist" ? { ids: [...(watchedIds ?? [])].slice(0, DECK_LINE_CAP) } : {}),
          ...(tab === "set"
            ? { set: setSlug, scope: setScope, rarity: setRarity || undefined, maxPriceCents: ceilingCents ?? undefined, after: chunkStart.current ?? undefined }
            : {}),
        }),
      });
      const d = await res.json().catch(() => null);
      if (seq !== reqSeq.current) return; // the inputs changed while it ran
      if (!res.ok || !d) {
        setError(d?.error ?? "Something went wrong — try again.");
        return;
      }
      const built = d as Result;
      setResult(built);
      const size = listSize(built, tab, Math.min(listLines, DECK_LINE_CAP));
      trackEvent("best_basket_build", {
        source: tab,
        market: country,
        lines: size.lines,
        matched: size.matched,
        stores: built.storeCount,
        savedCents: built.savedCents,
        ...(full ? { min_condition: floor.current } : {}),
      });
    } catch {
      if (seq === reqSeq.current) setError("Network error — try again.");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }

  // A list or source handed in by link (/deck's "Buy this deck for less",
  // the watchlist's "Price my watchlist, delivered") runs straight away — for
  // Premium only. A free preview is click-only: it counts against 5 a day. The
  // watchlist waits for the shared store to load its ids.
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoRun || autoRan.current) return;
    if (initialSource === "deck" && !initialList?.trim()) return;
    if (initialSource === "watchlist" && watchedIds == null) return;
    if (initialSource === "set" && !initialSet?.slug) return;
    autoRan.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedIds]);

  function addCard(c: PickerCard) {
    touched();
    setPicked((prev) => {
      const i = prev.findIndex((p) => p.card.id === c.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: Math.min(99, next[i].qty + 1) };
        return next;
      }
      return [...prev, { card: c, qty: 1 }];
    });
  }

  function setQty(cardId: number, qty: number) {
    touched();
    setPicked((prev) => prev.map((p) => (p.card.id === cardId ? { ...p, qty: Math.max(1, Math.min(99, qty)) } : p)));
  }

  function removeCard(cardId: number) {
    touched();
    setPicked((prev) => prev.filter((p) => p.card.id !== cardId));
  }

  // A changed delivery choice: Premium's plan on screen (or on its way) is
  // re-priced for it; a free preview is cleared, since re-running it would
  // spend one of the day's five.
  function changePostage(nextRegion: string | null, nextTracked: boolean) {
    setRegion(nextRegion);
    setRegionGuessed(false);
    setTrackedOnly(nextTracked);
    delivery.current = { region: nextRegion, trackedOnly: nextTracked };
    writePostagePrefs(market, { region: nextRegion, trackedOnly: nextTracked });
    if (full && (result || loading)) void run();
    else touched();
  }
  // The switch: Premium's plan on screen (or on its way) is re-priced at the new
  // floor; the choice is remembered for next time.
  function changeMinCondition(next: MinCondition) {
    if (next === floor.current) return;
    setMinCondition(next);
    floor.current = next;
    saveFloor.current = true;
    if (result || loading) void run();
    else touched();
  }
  const regionOpt = regions.find((r) => r.key === region) ?? null;
  // A MEASURED region the buyer is pricing for ("the Northeast"); "Elsewhere"
  // is priced like an unknown region and says so.
  const regionLabel = regionOpt && !regionOpt.unmeasured ? regionOpt.phrase : null;
  const places = joinList(measuredTo);
  const postageView: PostageView = { regionLabel, regionOpt, measuredAt, places };

  const canRun = tab === "watchlist" ? (watchedIds?.size ?? 0) > 0 : tab === "set" ? !!setSlug : tab !== "deck" || pasteText.trim().length > 0 || picked.length > 0;
  const adjective = COUNTRIES[country].adjective;

  return (
    <div className="space-y-5">
      <div className="card-surface p-5">
        <div role="tablist" aria-label="What to price" className="mb-4 flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => {
                touched();
                setTab(t.key);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                tab === t.key ? "border-brand-500 bg-brand-500/15 text-white" : "border-ink-700 text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "deck" && (
          <>
            <label htmlFor="basket-paste" className="mb-1 block text-xs font-medium text-slate-400">
              Paste a decklist or any card list — quantities optional, one card per line
            </label>
            {/* sm:text-sm, not text-sm: .input is 16px below sm so iOS doesn't zoom the page on focus (2026-09-23). */}
            <textarea
              id="basket-paste"
              value={pasteText}
              onChange={(e) => {
                touched();
                setPasteText(e.target.value);
              }}
              rows={6}
              placeholder={"4 Lightning Bolt (M11) 149\n1 Sol Ring (C21) 263\n2 Counterspell"}
              className="input font-mono sm:text-sm"
            />
            {overCap && <CapNote lines={listLines} picked={picked.length} />}

            <label className="mb-1 mt-4 block text-xs font-medium text-slate-400">…or search for a card and add it</label>
            <CardPicker placeholder="e.g. Lightning Bolt or Sol Ring (C21)" onPick={addCard} />
            {picked.length > 0 && (
              <ul className="mt-3 divide-y divide-ink-800 rounded-lg border border-ink-800">
                {picked.map((p) => (
                  <li key={p.card.id} className="flex items-center gap-3 p-2.5">
                    {p.card.img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.card.img} alt="" width={28} height={40} loading="lazy" className="h-10 w-7 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-10 w-7 shrink-0 rounded bg-ink-800" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-white">
                        {p.card.name}
                        {p.card.variant ? ` (${p.card.variant})` : ""}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {p.card.set}
                        {p.card.number ? ` · ${p.card.number}` : ""}
                      </div>
                    </div>
                    <QtyInput value={p.qty} onChange={(q) => setQty(p.card.id, q)} label={`Quantity for ${p.card.name}`} />
                    <button
                      type="button"
                      onClick={() => removeCard(p.card.id)}
                      aria-label={`Remove ${p.card.name}`}
                      className="shrink-0 text-slate-600 hover:text-rose-300"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === "watchlist" && (
          <p className="text-sm text-slate-400">
            Prices one copy of every card on your <Link href="/watchlist" className="text-brand-400 hover:underline">watchlist</Link> in
            this market (up to {DECK_LINE_CAP} cards).
            {watchedIds != null && watchedIds.size === 0 ? " Your watchlist has no cards yet: heart a card to add it." : ""}
          </p>
        )}

        {tab === "binder" && (
          <p className="text-sm text-slate-400">
            Prices re-buying the cards in your <Link href="/portfolio" className="text-brand-400 hover:underline">binder</Link> at the
            quantities you hold — what replacing it would cost, delivered. A big binder is priced on its 200 most valuable cards.
          </p>
        )}

        {tab === "set" && (
          <SetSourcePanel
            sets={sets}
            slug={setSlug}
            scope={setScope}
            rarity={setRarity}
            ceiling={ceilingText}
            currency={COUNTRIES[country].currency}
            onChange={(next) => {
              touched();
              if (next.slug !== undefined) setSetSlug(next.slug);
              if (next.scope !== undefined) setSetScope(next.scope);
              if (next.rarity !== undefined) setSetRarity(next.rarity);
              if (next.ceiling !== undefined) setCeilingText(next.ceiling);
            }}
          />
        )}

        <label className={`mt-4 flex items-center gap-2 text-sm ${tab === "binder" ? "text-slate-600" : "text-slate-300"}`}>
          <input
            type="checkbox"
            checked={tab === "set" || (tab !== "binder" && skipOwned)}
            disabled={tab === "binder" || tab === "set"}
            onChange={(e) => {
              touched();
              setSkipOwned(e.target.checked);
            }}
            className="h-4 w-4 accent-brand-500"
          />
          Skip copies I already own
          {tab === "binder" && <span className="text-xs">(not for the binder itself)</span>}
          {tab === "set" && <span className="text-xs">(always on: only what you&apos;re missing is priced)</span>}
        </label>

        {/* Delivery: where it is going, and whether untracked letters count. */}
        <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2 rounded-lg border border-ink-800 p-2.5">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
            Deliver to
            {/* sm:text-sm: .input is 16px below sm so iOS doesn't zoom the page on focus. */}
            <select
              value={region ?? ""}
              onChange={(e) => changePostage(e.target.value || null, trackedOnly)}
              className="input py-1 sm:text-sm"
              aria-label="Delivery region"
            >
              <option value="">Not sure (highest rate)</option>
              {regions.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-xs text-slate-300 sm:[@media(pointer:fine)]:min-h-0">
            <input
              type="checkbox"
              checked={trackedOnly}
              onChange={(e) => changePostage(region, e.target.checked)}
              className="h-4 w-4 accent-brand-500"
            />
            Tracked postage only
          </label>
          <p className="basis-full text-[11px] leading-snug text-slate-500">
            {regionGuessed && regionOpt ? `Picked from your location: ${regionOpt.phrase}. Change it if that's wrong. ` : ""}
            {regionOpt && (zonePriced || regionOpt.unmeasured) ? `${regionOpt.unmeasured ? "Elsewhere" : regionOpt.label}: ${regionOpt.pricedTo}. ` : ""}
            {zonePriced
              ? `Some stores charge more to some regions — pick yours. We measured delivery to ${places || "a few addresses"}; a region between two of them is priced at the dearer.`
              : `Every store we measured charges the same to every ${market === "AU" ? "state and territory (all eight capitals)" : `address we tried${places ? ` (${places})` : ""}`}, so this changes nothing yet.`}{" "}
            An untracked letter is only counted for orders no bigger than the ones the store offered it on. &ldquo;Tracked
            postage only&rdquo; leaves those letters out; a rate whose name doesn&apos;t say is marked &ldquo;tracking not stated&rdquo;.
          </p>
        </div>

        {/* Minimum condition (Premium, 2026-09-29): the cheapest copy in the
            condition you'll play. Below Premium it is one plain line, no
            button: the total says how many played copies it includes. */}
        {full ? (
          <div className="mt-4 rounded-lg border border-ink-800 p-2.5" data-min-condition>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span id="min-condition-label" className="text-xs font-medium text-slate-400">
                Minimum condition
              </span>
              <div role="radiogroup" aria-labelledby="min-condition-label" className="flex flex-wrap gap-1.5">
                {MIN_CONDITIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={minCondition === c}
                    onClick={() => changeMinCondition(c)}
                    className={`min-h-9 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      minCondition === c ? "border-brand-500 bg-brand-500/15 text-white" : "border-ink-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {MIN_CONDITION_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
              The cheapest copy in the condition you&apos;ll play.{" "}
              {minCondition === "any"
                ? "Every store's cheapest copy counts, whatever its condition; each line still shows it."
                : `Only listings at ${MIN_CONDITION_PHRASE[minCondition]} are used, in the total and in every plan. A card with none in stock is listed as not covered, never filled with a played copy.`}
              {watch ? " A saved watch keeps its own setting; change it on your watchlist." : ""}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-[11px] leading-snug text-slate-500" data-min-condition-free>
            Your total counts each store&apos;s cheapest copy in any condition, and says how many played copies that includes. Premium can
            limit it to NM only or LP or better.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void run()} disabled={loading || !canRun} className="btn-primary text-sm disabled:opacity-50">
            {loading ? "Working it out…" : full ? "🧺 Find the cheapest basket" : "See my total"}
          </button>
          {!full && (
            <span className="text-xs text-slate-500">
              Best Basket is a Premium tool.
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-rose-400">
            {error}
          </p>
        )}
      </div>

      {result && result.setGap && <SetGapNotes gap={result.setGap} place={COUNTRIES[country].place} fmt={fmt} full={full} onNext={nextChunk} busy={loading} />}
      {result && !isFull(result) && <PreviewCard r={result} fmt={fmt} adjective={adjective} overCap={overCap} postage={postageView} />}
      {result && !isFull(result) && tab === "deck" && (
        <DiscoveryTip id="basket-watch" surface="tip:basket" tier="premium" cta="See Premium">
          Premium can watch this deck&apos;s price for you: it re-prices the list after every price update and{" "}
          {emailOn ? "emails you" : "tells you in your notifications"} when the delivered total reaches your price.
        </DiscoveryTip>
      )}

      {result && isFull(result) && (
        <FullResultView
          r={result}
          shown={shown}
          setShown={setShown}
          fmt={fmt}
          country={country}
          adjective={adjective}
          overCap={overCap}
          postage={postageView}
        />
      )}
      {result && isFull(result) && result.notStocked && result.setGap && (
        <NotStockedList items={result.notStocked} total={result.setGap.notStockedCount} place={COUNTRIES[country].place} />
      )}
      {/* Watch this list (Premium, 2026-09-29): saves the pasted / picked list
          with a delivered-price target for the paid run (lib/deck-watch.ts).
          A pasted list only — the watchlist and binder sources change on
          their own. A watch being re-run (?watch=) is already saved. */}
      {/* A total priced with "skip copies I already own" is a smaller list than
          the one a watch would price every run: say so instead of saving a
          watch whose target could never be met (lib/deck-watch-pure.ts). */}
      {result && isFull(result) && tab === "deck" && !watch && result.plan.coveredCopies > 0 && !watchable && (
        <p className="text-xs text-slate-400" data-watch-skipowned>
          A deck watch prices the whole list, and this total leaves out the {result.skippedOwned} {plural(result.skippedOwned, "copy", "copies")} you own. To watch
          this list, untick &quot;skip copies I already own&quot; and price it again.
        </p>
      )}
      {result && isFull(result) && tab === "deck" && !watch && watchable && (
        <DeckWatchForm
          listText={watchListText}
          defaultName={watchDefaultName}
          totalCents={result.totalCents}
          region={delivery.current.region}
          trackedOnly={delivery.current.trackedOnly}
          minCondition={result.minCondition ?? floor.current}
          emailOn={emailOn}
        />
      )}
      {watch && result && isFull(result) && (
        <p className="text-xs text-slate-400">
          This is your saved watch <strong className="text-slate-200">{watch.name}</strong>,{" "}
          {result.skippedOwned > 0
            ? "priced without the copies you own, so its total is lower than the watch's own."
            : (result.minCondition ?? floor.current) === watch.minCondition
              ? "priced the way its alerts are."
              : `priced at ${MIN_CONDITION_PHRASE[result.minCondition ?? floor.current]}, not at the ${MIN_CONDITION_PHRASE[watch.minCondition]} its alerts use, so the totals can differ.`}{" "}
          <Link href="/watching#decks" className="text-brand-400 hover:underline">
            Change its target or stop it →
          </Link>
        </p>
      )}
    </div>
  );
}

// FINISH A SET: the picker. Set, which printings count, an optional rarity, an
// optional per-card price limit. Everything is a request field; the route
// checks the set is a known, released one.
function SetSourcePanel({
  sets,
  slug,
  scope,
  rarity,
  ceiling,
  currency,
  onChange,
}: {
  sets: BasketSetOption[];
  slug: string;
  scope: SetScope;
  rarity: string;
  ceiling: string;
  currency: string;
  onChange: (next: { slug?: string; scope?: SetScope; rarity?: string; ceiling?: string }) => void;
}) {
  const picked = sets.find((x) => x.slug === slug) ?? null;
  return (
    <div className="space-y-3" data-set-source>
      <p className="text-sm text-slate-400">
        Prices the cards you&apos;re missing from a set: the set checklist&apos;s list, one copy of each, with everything you already own left
        out. Listings at real stores. One plan holds up to {SET_GAP_CHUNK} cards; if you&apos;re missing more, it plans the {SET_GAP_CHUNK}{" "}
        cheapest first and offers the next {SET_GAP_CHUNK}, so a whole master set is planned in steps, not in one order.
        {picked?.released && (
          <>
            {" "}
            <Link href={`/portfolio/sets/${picked.slug}`} className="text-brand-400 hover:underline">
              See what&apos;s missing →
            </Link>
          </>
        )}
      </p>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
          Set
          <select value={slug} onChange={(e) => onChange({ slug: e.target.value })} className="input py-1 sm:text-sm" aria-label="Set to finish">
            <option value="">Choose a set…</option>
            {sets.map((x) => (
              <option key={x.slug} value={x.slug} disabled={!x.released}>
                {x.code} {x.name}
                {x.released ? "" : " (not out yet)"}
              </option>
            ))}
          </select>
        </label>
        <div role="group" aria-label="Which printings count" className="flex flex-wrap gap-1.5">
          {SET_SCOPES.map((x) => (
            <button
              key={x.key}
              type="button"
              aria-pressed={scope === x.key}
              title={x.hint}
              onClick={() => onChange({ scope: x.key })}
              className={`min-h-9 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                scope === x.key ? "border-brand-500 bg-brand-500/15 text-white" : "border-ink-700 text-slate-400 hover:text-slate-200"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
          Rarity
          <select value={rarity} onChange={(e) => onChange({ rarity: e.target.value })} className="input py-1 sm:text-sm" aria-label="Rarity">
            <option value="">All rarities</option>
            {RARITY_KEYS.map((k) => (
              <option key={k} value={k}>
                {rarityLabel(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
          Leave out cards dearer than ({currency}, optional)
          <input
            type="text"
            inputMode="decimal"
            value={ceiling}
            onChange={(e) => onChange({ ceiling: e.target.value })}
            placeholder="No limit"
            aria-label="Most you'd pay for one card"
            className="input w-32 py-1 sm:text-sm"
          />
        </label>
      </div>
    </div>
  );
}

// What a set answer says about itself, before the plan: the one chunk line (the
// gap is never silently partial), the step to the next chunk, the cards left out
// by the member's own ceiling, and the cards no store has. Counts only, so it is
// safe for a non-Premium answer; the not-stocked names are Premium's list below.
function SetGapNotes({
  gap,
  place,
  fmt,
  full,
  onNext,
  busy,
}: {
  gap: SetGapSummary;
  place: string;
  fmt: (c: number) => string;
  full: boolean;
  onNext: (cursor: string) => void;
  busy: boolean;
}) {
  const note = setGapNote(gap);
  return (
    <div className="card-surface p-4 text-sm text-slate-300" data-set-gap>
      <p>
        You&apos;re missing {gap.gapTotal} {plural(gap.gapTotal, "card", "cards")} in this list; {gap.stocked}{" "}
        {plural(gap.stocked, "has", "have")} a listing we can price delivered in {place}.
      </p>
      {note && (
        <p className="mt-1.5 font-semibold text-amber-300" data-set-chunk-note>
          {note}
        </p>
      )}
      {gap.nextCursor != null && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onNext(gap.nextCursor!)} disabled={busy} className="btn-ghost text-xs disabled:opacity-50" data-set-next>
            {nextChunkLabel(gap)} →
          </button>
          {!full && <span className="text-xs text-slate-500">Another total, another of today&apos;s runs.</span>}
        </div>
      )}
      {gap.overCeiling > 0 && gap.maxPriceCents != null && (
        <p className="mt-1.5 text-xs text-slate-400">
          {gap.overCeiling} {plural(gap.overCeiling, "card is", "cards are")} dearer than your {fmt(gap.maxPriceCents)} limit and{" "}
          {plural(gap.overCeiling, "isn't", "aren't")} in this plan.
        </p>
      )}
      {gap.noPostageCount > 0 && (
        <p className="mt-1.5 text-xs text-slate-400" data-set-no-postage>
          {gap.noPostageCount} {plural(gap.noPostageCount, "card is", "cards are")} only stocked at stores we can&apos;t price postage for, so{" "}
          {plural(gap.noPostageCount, "it isn't", "they aren't")} in the total. The set list shows their listing prices.
        </p>
      )}
      {gap.belowFloorCount > 0 && (
        <p className="mt-1.5 text-xs text-slate-400" data-set-below-floor>
          {gap.belowFloorCount} {plural(gap.belowFloorCount, "card is", "cards are")} only in stock below your minimum condition, so{" "}
          {plural(gap.belowFloorCount, "it isn't", "they aren't")} in the total. Choose Anything above to include {plural(gap.belowFloorCount, "it", "them")}.
        </p>
      )}
      {gap.notStockedCount > 0 && (
        <p className="mt-1.5 text-xs text-slate-400" data-set-not-stocked>
          {gap.notStockedCount} {plural(gap.notStockedCount, "card isn't", "cards aren't")} stocked at a tracked store in {place}, so{" "}
          {plural(gap.notStockedCount, "it isn't", "they aren't")} in the total.{full ? "" : " Premium lists them."}
        </p>
      )}
    </div>
  );
}

// Premium's list of the missing cards no real store has in stock: named, never
// dropped, with the eBay search the other unbuyable lists carry.
function NotStockedList({ items, total, place }: { items: { name: string; setCode: string; number: string | null }[]; total: number; place: string }) {
  const { country } = useCountry();
  if (!items.length) return null;
  return (
    <div className="card-surface p-4 text-sm" data-set-not-stocked-list>
      <p className="font-semibold text-slate-300">Not stocked in {place}:</p>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5">
        {items.map((u, i) => (
          <li key={i}>
            <a
              href={ebaySearchUrl(country as Country, magicEbayQuery(u.name), "basket-set-not-stocked")}
              target="_blank"
              rel={outboundRel()}
              data-retailer="ebay_basket"
              data-page="best_basket"
              className="font-medium text-brand-400 hover:underline"
            >
              {u.name} →
            </a>
          </li>
        ))}
      </ul>
      {total > items.length && <p className="mt-2 text-xs text-slate-500">…and {total - items.length} more.</p>}
      <p className="mt-2 text-xs text-slate-500">No tracked store has these in stock right now. They are not in the plan or its total.</p>
      <AffiliateDisclosure partner="ebay" tight />
    </div>
  );
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

// The delivery choice a result was priced for, for the copy around it.
interface PostageView {
  regionLabel: string | null; // a MEASURED region: "the Northeast"
  regionOpt: BasketRegionOption | null;
  measuredAt: string | null;
  places: string; // "New York, Chicago, Dallas and San Francisco"
}

// best_basket_build's `lines` and `matched` are LINES — list entries and how
// many of them matched a card — not the copy counts `requested`/`covered`
// carry. A paste is counted here as the route counts it; a watchlist is one
// copy per card, so its copies are its lines; Premium's plan has the card
// counts for the binder. The free binder preview has no line count (its copies
// are the quantities held), so the event leaves them out rather than guess.
function listSize(r: Result, tab: BasketSource, pricedLines: number): { lines?: number; matched?: number } {
  if (tab === "deck") return { lines: pricedLines, matched: pricedLines - r.unmatched.length };
  if (tab === "watchlist" || tab === "set") return { lines: r.requested, matched: r.requested };
  if (isFull(r)) {
    const cards = r.plan.matchedCards + r.plan.unbuyable.length;
    return { lines: cards, matched: cards };
  }
  return {};
}

// Past the line cap, said before the run (it costs one of the five) and again
// beside the answer.
function CapNote({ lines, picked }: { lines: number; picked: number }) {
  return (
    <p className="mt-2 text-xs text-amber-300">
      This list has {lines} lines. Only the first {DECK_LINE_CAP} are priced
      {picked > 0 ? " (cards added by search first, then the pasted lines)" : ""}; the rest aren&apos;t in the total or the counts.
    </p>
  );
}

// Nothing to price: say which of the two reasons it is. Every line unmatched
// is not the same as "out of stock", and the preview used to say the latter
// for both.
function NothingPriced({ r, adjective, floor = "any" }: { r: BasketPreview; adjective: string; floor?: MinCondition }) {
  const unmatchedCopies = r.unmatched.reduce((n, u) => n + u.qty, 0);
  const noneMatched = r.unmatched.length > 0 && r.requested === unmatchedCopies;
  // Under a minimum condition "not in stock" would be untrue of a card that only
  // has played copies: say which floor nothing met.
  const at = floor === "any" ? "" : ` at ${MIN_CONDITION_PHRASE[floor]}`;
  return (
    <p>
      {noneMatched
        ? "None of these lines matched a card."
        : r.unmatched.length > 0
          ? `None of the cards we matched is in stock${at} at a tracked ${adjective} store right now.`
          : `None of these cards is in stock${at} at a tracked ${adjective} store right now.`}
    </p>
  );
}

// The free preview: the user's own real numbers and nothing else.
function PreviewCard({
  r,
  fmt,
  adjective,
  overCap,
  postage,
}: {
  r: BasketPreview;
  fmt: (c: number) => string;
  adjective: string;
  overCap: boolean;
  postage: PostageView;
}) {
  const { me } = useMe();
  if (r.covered === 0) {
    return (
      <div className="card-surface p-5 text-sm text-slate-300">
        <NothingPriced r={r} adjective={adjective} />
        <UnmatchedList unmatched={r.unmatched} />
        {overCap && <ResultCapNote />}
      </div>
    );
  }
  const stores = `${r.storeCount} ${plural(r.storeCount, "store", "stores")}`;
  // THE UPGRADE LEADS WITH THIS LIST'S OWN SAVING (lib/basket-saving.ts,
  // 2026-09-28), and only when it is at least a whole unit of the list's
  // currency; below that, the plain line with no money claim.
  const pitch = basketSavingPitch(r.savedCents, fmt, { plusMember: me.tier === "plus", priceLabel: PREMIUM_PRICE_LABEL });
  return (
    <div className="card-surface p-5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Your delivered total</div>
      <div className="font-display text-4xl font-extrabold text-white">{fmt(r.totalCents)}</div>
      {pitch && (
        <p data-basket-saving className="mt-3 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-sm font-semibold leading-relaxed text-white">
          {pitch}
        </p>
      )}
      <p className="mt-2 text-sm leading-relaxed text-slate-300">
        {r.savedCents > 0 && pitch ? (
          <>Your list: {fmt(r.totalCents)} delivered from {stores}.</>
        ) : r.savedCents > 0 ? (
          <>
            Your list: {fmt(r.totalCents)} delivered from {stores}. Premium shows which store to buy each card from.
          </>
        ) : r.naiveTotalCents < r.totalCents ? (
          <>
            Your list: {fmt(r.totalCents)} delivered from {stores}. <RiskyNaive naiveCents={r.naiveTotalCents} fmt={fmt} /> Premium
            shows which store to buy each card from.
          </>
        ) : (
          <>
            Your list: {fmt(r.totalCents)} delivered from {stores}. Buying each card&apos;s cheapest copy is already the cheapest way for
            this list.
          </>
        )}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {fmt(r.totalCents - r.shippingCents - r.topUpCents)} cards + {fmt(r.shippingCents)} postage
        {r.topUpCents > 0 && <> + {fmt(r.topUpCents)} to reach a minimum order</>}
        {postage.regionLabel ? ` · delivered to ${postage.regionLabel}` : ""}
      </p>
      {r.postageNotes.length > 0 && <p className="mt-0.5 text-xs text-amber-300/80">{r.postageNotes.join(" · ")}</p>}
      {/* The honesty line, not an entitlement: any account is told when its
          cheapest-copy total includes played copies. The button below is the
          upgrade prompt beside it. */}
      {r.playedCopies > 0 && (
        <p data-played-copies className="mt-0.5 text-xs text-amber-300/80">
          {playedCopiesNote(r.playedCopies)}. Premium can leave them out and price only NM or LP copies.
        </p>
      )}
      <Coverage r={r} />
      {overCap && <ResultCapNote />}
      <UnmatchedList unmatched={r.unmatched} />
      <div className="mt-4">
        <PlanButton surface="gate:basket-limit" tier="premium" />
      </div>
      <PostageFooter postage={postage} className="mt-4 text-left" />
    </div>
  );
}

// The chosen plan can REPORT more than buying each card's cheapest copy only
// one way: the search allows for postage that was still rising past the
// biggest order a store's checkout was measured on (lib/basket.ts), and the
// naive split leans on such a store's "from" figure. Say so rather than claim
// the plan is cheapest.
function RiskyNaive({ naiveCents, fmt }: { naiveCents: number; fmt: (c: number) => string }) {
  return (
    <>
      Buying each card&apos;s cheapest copy shows {fmt(naiveCents)}, but that puts a bigger order on a store than its checkout was
      measured on, where postage was still rising with size — this total doesn&apos;t count on that store&apos;s &ldquo;from&rdquo; figure.
    </>
  );
}

function ResultCapNote() {
  return (
    <p className="mt-1 text-xs text-amber-300">
      Only the first {DECK_LINE_CAP} lines of this list are priced — the lines past that aren&apos;t in the total or the counts.
    </p>
  );
}

function Coverage({ r, floor = "any" }: { r: BasketPreview; floor?: MinCondition }) {
  if (r.covered >= r.requested) return null;
  return (
    <p className="mt-1 text-xs text-amber-300">
      Covers {r.covered} of the {r.requested} cards you asked for — the rest aren&apos;t matched or in stock
      {floor === "any" ? "" : ` at ${MIN_CONDITION_PHRASE[floor]}`} at a tracked store, and aren&apos;t in the total.
    </p>
  );
}

function UnmatchedList({ unmatched }: { unmatched: { raw: string; qty: number }[] }) {
  if (!unmatched.length) return null;
  return (
    <div className="mt-3 text-sm">
      <p className="font-semibold text-amber-300">We couldn&apos;t match {plural(unmatched.length, "this line", "these lines")}:</p>
      <ul className="mt-1 space-y-0.5">
        {unmatched.map((u, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-xs text-slate-400">{u.raw}</span>
            <Link
              href={`/browse?q=${encodeURIComponent(u.raw.replace(/^\d+\s*[xX×]?\s*/, ""))}`}
              target="_blank"
              className="text-xs text-brand-400 hover:underline"
            >
              search for it →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FullResultView({
  r,
  shown,
  setShown,
  fmt,
  country,
  adjective,
  overCap,
  postage,
}: {
  r: FullResult;
  shown: PlanKey;
  setShown: (k: PlanKey) => void;
  fmt: (c: number) => string;
  country: string;
  adjective: string;
  overCap: boolean;
  postage: PostageView;
}) {
  const { plan, alternatives } = r;
  if (plan.storeCount === 0) {
    return (
      <div className="card-surface p-5 text-sm text-slate-300">
        <NothingPriced r={r} adjective={adjective} floor={r.minCondition ?? "any"} />
        {overCap && <ResultCapNote />}
        <UnmatchedList unmatched={r.unmatched} />
        <Unbuyable plan={plan} country={country} floor={r.minCondition ?? "any"} />
        <LeftOut plan={plan} />
      </div>
    );
  }
  const selected = shown === "single" ? alternatives.singleStore : shown === "two" ? alternatives.twoStores : plan;
  const view = selected ?? plan;

  return (
    <>
      <div className="card-surface p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <PlanCard
            title="Cheapest split"
            plan={plan}
            cheapest={plan.totalCents}
            active={shown === "split"}
            onShow={() => setShown("split")}
            fmt={fmt}
            empty=""
          />
          <PlanCard
            title="Best single store"
            plan={alternatives.singleStore}
            cheapest={plan.totalCents}
            active={shown === "single"}
            onShow={() => setShown("single")}
            fmt={fmt}
            empty="No single store has every card in stock."
          />
          <PlanCard
            title="Best two stores"
            plan={alternatives.twoStores}
            cheapest={plan.totalCents}
            active={shown === "two"}
            onShow={() => setShown("two")}
            fmt={fmt}
            empty={TWO_STORES_NONE[alternatives.twoStoresNone ?? "no-pair"]}
          />
        </div>
        <p className="mt-4 text-sm text-slate-300">
          {plan.savedCents > 0 ? (
            <>
              The cheapest split is <strong className="text-brand-400">{fmt(plan.savedCents)} less</strong> than buying each card&apos;s
              cheapest copy separately ({fmt(plan.naiveTotalCents)} across {plan.naiveStoreCount}{" "}
              {plural(plan.naiveStoreCount, "store", "stores")}).
            </>
          ) : plan.naiveTotalCents < plan.totalCents ? (
            <RiskyNaive naiveCents={plan.naiveTotalCents} fmt={fmt} />
          ) : (
            <>Buying each card&apos;s cheapest copy is already the cheapest way for this list.</>
          )}
        </p>
        <Coverage r={r} floor={r.minCondition ?? "any"} />
        {r.minCondition && r.minCondition !== "any" && (
          <p className="mt-1 text-xs text-slate-500" data-priced-at>
            Priced at {MIN_CONDITION_PHRASE[r.minCondition]}: cheaper copies in a lower condition are left out.
          </p>
        )}
        {(!r.minCondition || r.minCondition === "any") && r.playedCopies > 0 && (
          <p className="mt-1 text-xs text-amber-300/80" data-played-copies>
            {playedCopiesNote(r.playedCopies)}. Set a minimum condition above to leave them out.
          </p>
        )}
        {overCap && <ResultCapNote />}
        {r.skippedOwned > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            Skipped {r.skippedOwned} {plural(r.skippedOwned, "copy", "copies")} you already own.
          </p>
        )}
        {r.skippedHoldings > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            Priced on your 200 most valuable binder cards; {r.skippedHoldings} cheaper {plural(r.skippedHoldings, "one is", "ones are")} not
            included.
          </p>
        )}
      </div>

      {r.fuzzy.length > 0 && (
        <div className="card-surface p-4 text-sm">
          <p className="font-semibold text-amber-300">Check {plural(r.fuzzy.length, "this match", "these matches")} — we guessed:</p>
          <ul className="mt-1 space-y-0.5 text-slate-400">
            {r.fuzzy.map((f, i) => (
              <li key={i}>
                <span className="font-mono text-xs">{f.raw}</span> → matched as <span className="text-slate-200">{f.matchedAs}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.unmatched.length > 0 && (
        <div className="card-surface p-4">
          <UnmatchedList unmatched={r.unmatched} />
        </div>
      )}

      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
          {shown === "single" ? "Best single store" : shown === "two" ? "Best two stores" : "Cheapest split"}: {view.storeCount}{" "}
          {plural(view.storeCount, "order", "orders")}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {fmt(view.itemsCents)} cards + {fmt(view.shippingCents)} postage
          {view.topUpCents > 0 && <> + {fmt(view.topUpCents)} to reach a minimum order</>} = {fmt(view.totalCents)}
          {postage.regionLabel ? ` · delivered to ${postage.regionLabel}` : ""}
        </p>
        <PlanNotes plan={view} regionLabel={postage.regionLabel} regionOpt={postage.regionOpt} />
      </div>
      {view.stores.map((s) => (
        <div key={s.key} className="card-surface overflow-hidden">
          <div className="border-b border-ink-700 px-4 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">{s.name}</h3>
              <span className="text-xs text-slate-400">
                {fmt(s.subtotalCents)}
                {s.freeShipping ? (
                  <span className="ml-1 text-emerald-400">+ {freePrefix(s.postage)}free postage</span>
                ) : (
                  <span className="ml-1 text-slate-500">
                    + {postagePrefix(s.postage)}
                    {fmt(s.shippingCents)} postage
                  </span>
                )}
              </span>
            </div>
            <PostageLine group={s} fmt={fmt} />
          </div>
          <ul className="divide-y divide-ink-800">
            {s.lines.map((l, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-8 shrink-0 text-slate-500">×{l.qty}</span>
                <div className="min-w-0 flex-1">
                  <a
                    href={l.url}
                    target="_blank"
                    rel={outboundRel()}
                    data-retailer={s.key}
                    data-page="best_basket"
                    data-card={l.slug ?? undefined}
                    className="block truncate font-medium text-white hover:text-brand-400"
                  >
                    {l.name}
                  </a>
                  <div className="truncate text-[11px] text-slate-500">
                    {l.setCode ? `${l.setCode} · ` : ""}
                    {l.condition ?? "Condition not stated"}
                  </div>
                </div>
                <span className="shrink-0 text-slate-300">
                  {fmt(l.unitCents)}
                  {l.qty > 1 ? " ea" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <Unbuyable plan={plan} country={country} floor={r.minCondition ?? "any"} />
      <LeftOut plan={plan} />

      <PostageFooter postage={postage} className="text-center">
        {" "}A store may also hold fewer copies than you need.
      </PostageFooter>
    </>
  );
}

// The notes under a plan's total — each a reason it is less certain than it
// looks (lib/postage-display.ts).
function PlanNotes({
  plan,
  regionLabel,
  regionOpt,
}: {
  plan: BasketPlan;
  regionLabel: string | null;
  regionOpt: BasketRegionOption | null;
}) {
  const notes = planPostageNotes(plan, !!regionLabel, !!regionOpt?.unmeasured);
  return notes.length ? <p className="mt-0.5 text-xs text-amber-300/80">{notes.join(" · ")}</p> : null;
}

// Stores that stock a card on the list but were left out, each with its own
// reason. Neutral: a store is left out because it quoted no postage to the
// buyer's region, it offers only untracked postage under "Tracked postage
// only", or it posts nowhere we measured — and "doesn't post to you" was wrong
// for two of those.
function LeftOut({ plan }: { plan: BasketPlan }) {
  if (!plan.excludedStores.length) return null;
  return (
    <div className="card-surface p-4 text-xs text-slate-400">
      <p className="font-semibold text-slate-300">Left out of this plan:</p>
      <ul className="mt-1 space-y-0.5">
        {plan.excludedStores.map((x) => (
          <li key={x.key}>
            <span className="text-slate-300">{x.name}</span> — {x.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Where every postage figure comes from, under every kind of answer.
function PostageFooter({ postage, className, children }: { postage: PostageView; className: string; children?: ReactNode }) {
  const { regionLabel, regionOpt, measuredAt, places } = postage;
  return (
    <p className={`text-[11px] leading-relaxed text-slate-600 ${className}`}>
      Postage is priced from the nearest order sizes each store&apos;s checkout quoted
      {measuredAt ? `, measured ${measuredAt}` : ""}
      {regionLabel
        ? ` for delivery to ${regionLabel}`
        : ` — the highest rate we measured${places ? ` (to ${places})` : ""}${
            regionOpt?.unmeasured ? `, since we haven't measured delivery ${regionOpt.phrase}` : ", until you pick your region"
          }`}
      . Stores marked <span className="text-slate-400">est.</span> haven&apos;t been measured yet (or not to your region);{" "}
      <span className="text-slate-400">from</span> means postage is at least that — an order bigger than any we measured, or a
      region further than any address we measured. Stores change their rates: the store&apos;s own checkout is final.
      {children}
    </p>
  );
}

// The line under each store's name: its own rate name, and what else a buyer
// should know about it — a skipped untracked letter, a free-postage threshold
// within reach, a minimum order, an order bigger than any we measured, a store
// posting from abroad (lib/postage-display.ts).
function PostageLine({ group, fmt }: { group: BasketStoreGroup; fmt: (c: number) => string }) {
  const p = group.postage;
  if (p.basis === "estimate") {
    return (
      <p className="mt-0.5 text-[11px] text-amber-300/80">
        est. {fmt(p.cents)} — this store&apos;s postage hasn&apos;t been measured yet, so it&apos;s priced at the dearest one-card
        tracked rate of the stores we checked here; check at checkout.
      </p>
    );
  }
  const kind = trackedTag(p);
  const bits = postageLineBits(group, fmt);
  return (
    <p className="mt-0.5 text-[11px] text-slate-500">
      <span className="text-slate-400">
        {p.label} ({kind}) {p.free ? `${freePrefix(p)}free` : `${postagePrefix(p)}${fmt(p.cents)}`}
      </span>
      {p.note ? ` · ${p.note}` : ""}
      {bits.length > 0 && <> · {bits.join(" · ")}</>}
    </p>
  );
}

// Why there's no two-store card — three different situations (lib/basket.ts).
const TWO_STORES_NONE: Record<TwoStoresNone, string> = {
  "no-pair": "No two stores between them stock every card.",
  "one-card": "There's only one card on this list, so there's nothing to split.",
  "one-store-cheaper": "No two-store split we found beats buying the whole list from one store — see Best single store.",
};

function PlanCard({
  title,
  plan,
  cheapest,
  active,
  onShow,
  fmt,
  empty,
}: {
  title: string;
  plan: BasketPlan | null;
  cheapest: number;
  active: boolean;
  onShow: () => void;
  fmt: (c: number) => string;
  empty: string;
}) {
  if (!plan) {
    return (
      <div className="rounded-lg border border-ink-800 p-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</div>
        <p className="mt-2 text-xs text-slate-500">{empty}</p>
      </div>
    );
  }
  const extra = plan.totalCents - cheapest;
  return (
    <button
      type="button"
      onClick={onShow}
      aria-pressed={active}
      className={`rounded-lg border p-3 text-left transition ${active ? "border-brand-500 bg-brand-500/10" : "border-ink-700 hover:border-ink-600"}`}
    >
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 font-display text-2xl font-extrabold text-white">{fmt(plan.totalCents)}</div>
      <div className="text-[11px] text-slate-500">
        {fmt(plan.itemsCents)} cards + {plan.shippingCents > 0 ? `${fmt(plan.shippingCents)} postage` : "free postage"}
        {plan.topUpCents > 0 ? ` + ${fmt(plan.topUpCents)} to a minimum order` : ""}
      </div>
      <div className="text-[11px] text-slate-500">
        {plan.storeCount} {plural(plan.storeCount, "order", "orders")}
        {plan.storeCount <= 2 ? `: ${plan.stores.map((s) => s.name).join(" + ")}` : ""}
      </div>
      {/* Below the headline only by leaning on a store's "from" postage past
          its measured sizes (see RiskyNaive): said, not crowned. */}
      <div className={`mt-1 text-[11px] font-semibold ${extra !== 0 ? "text-slate-400" : "text-brand-400"}`}>
        {extra > 0 ? `+${fmt(extra)} vs the cheapest split` : extra < 0 ? `${fmt(-extra)} less on "from" postage` : "Cheapest"}
      </div>
    </button>
  );
}

function Unbuyable({ plan, country, floor }: { plan: BasketPlan; country: string; floor: MinCondition }) {
  if (!plan.unbuyable.length) return null;
  return (
    <div className="card-surface p-4 text-sm" data-not-covered>
      <p className="font-semibold text-amber-300">{floor === "any" ? "No in-stock store listing for:" : `Not covered — nothing in stock at ${MIN_CONDITION_PHRASE[floor]} for:`}</p>
      {/* Each card is a live eBay search: no tracked store has it, and eBay
          usually carries the long tail. */}
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5">
        {plan.unbuyable.map((u, i) => (
          <li key={i}>
            <a
              href={ebaySearchUrl(country as Country, magicEbayQuery(u.name), "basket-unbuyable")}
              target="_blank"
              rel={outboundRel()}
              data-retailer="ebay_basket"
              data-page="best_basket"
              className="font-medium text-brand-400 hover:underline"
            >
              {u.qty}× {u.name} →
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        {floor === "any"
          ? "No tracked store has these in stock right now — eBay usually carries the long tail."
          : `No tracked store has these in stock at ${MIN_CONDITION_PHRASE[floor]} right now. A played copy was not used in their place; choose Anything above to see the cheapest copy in any condition. eBay usually carries the long tail.`}
      </p>
      <AffiliateDisclosure partner="ebay" tight />
    </div>
  );
}
