"use client";

import { useEffect, useId, useState } from "react";
import { useMe } from "@/lib/use-me";
import { COUNTRIES, isCountry } from "@/lib/country";
import { money } from "@/lib/format";
import { targetAlertLimit } from "@/lib/alert-limits";
import { centsToInput, clampTargetCents, parseMoneyInput } from "@/lib/target-price";
import PlanButton from "./PlanButton";

// "NOTIFY ME AT $__" — the Plus target price on one watch. RiftCompare's
// TargetPriceField, ported in wave 2 (2026-10-03). Rendered on each /watching
// tile and each watchlist-drawer row.
//
//   • Plus / Premium: a money input in the WATCH'S OWN market currency (a card
//     watched in AU takes A$, whatever market the viewer is browsing). Saves
//     via PATCH /api/alerts/watchlist/[cardId] on blur or Enter; an empty
//     field clears the target. A typo is clamped on blur to what the route
//     accepts, so the saved number is always the one on screen. Plus shows
//     "N of 25 used" (lib/alert-limits.ts, the constant the route enforces).
//   • A target held beyond the tier's limit (a Premium member now on Plus) is
//     stored but inert: the parent passes active={false}.
//   • A free account sees the field DISABLED with the Plus gate beside it.
//   • Signed out: nothing.
//
// The saved line promises an email only once a mailer is configured
// (me.emailOn). Until then a met target is flagged on the watchlist and in the
// dashboard's Recent alerts.
export function TargetPriceField({
  cardId,
  cardName,
  market,
  initialCents,
  used,
  active = true,
  onSaved,
  onUpgradeClick,
  className,
}: {
  cardId: number;
  cardName: string;
  market: string;
  initialCents: number | null;
  /** How many of this account's watches carry a target, when the parent knows. */
  used?: number;
  /** false: this watch's target is over the account's limit, so the run skips it. */
  active?: boolean;
  onSaved?: (targetCents: number | null, used: number | null) => void;
  /** The gate's button was pressed — a parent dialog closes itself first. */
  onUpgradeClick?: () => void;
  className?: string;
}) {
  const { me, loaded } = useMe();
  const user = me.user;
  const premium = me.tier != null;
  const id = useId();
  const mkt = isCountry(market) ? market : "US";
  const currency = COUNTRIES[mkt].currency;
  const symbol = COUNTRIES[mkt].symbol;

  const [saved, setSaved] = useState<number | null>(initialCents);
  const [text, setText] = useState(centsToInput(initialCents));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [usedNow, setUsedNow] = useState<number | null>(used ?? null);
  useEffect(() => {
    if (used != null) setUsedNow(used);
  }, [used]);

  const limit = targetAlertLimit(me.tier);
  const finiteLimit = Number.isFinite(limit) ? limit : null;

  // No count from the parent: ask once, and only for a Plus member.
  const needCount = used === undefined && loaded && !!user && premium && finiteLimit != null;
  useEffect(() => {
    if (!needCount) return;
    let cancelled = false;
    fetch("/api/alerts/watchlist?targets=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { used?: number | null } | null) => {
        if (!cancelled && typeof d?.used === "number") setUsedNow(d.used);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needCount]);

  if (!loaded || !user) return null;
  const atLimit = premium && finiteLimit != null && usedNow != null && usedNow >= finiteLimit && saved == null;

  async function save(cents: number | null) {
    if (cents === saved) {
      setStatus("idle");
      return;
    }
    setStatus("saving");
    setError(null);
    const res = await fetch(`/api/alerts/watchlist/${encodeURIComponent(String(cardId))}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ market: mkt, targetCents: cents }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { used?: number; error?: string } | null;
    if (res?.ok) {
      setSaved(cents);
      setStatus("saved");
      if (typeof data?.used === "number") setUsedNow(data.used);
      onSaved?.(cents, typeof data?.used === "number" ? data.used : null);
    } else {
      // Put the last saved value back, so the field never shows a number that
      // isn't the one we'll alert on.
      setText(centsToInput(saved));
      setStatus("error");
      setError(data?.error ?? "Couldn't save that — try again.");
    }
  }

  function commit() {
    const parsed = parseMoneyInput(text);
    const cents = parsed == null ? null : clampTargetCents(parsed);
    setText(centsToInput(cents));
    void save(cents);
  }

  const disabled = !premium || atLimit || status === "saving";
  const flag = me.emailOn;

  return (
    <div className={className}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
        className="flex flex-wrap items-center gap-x-2 gap-y-1"
      >
        <label htmlFor={id} className="text-xs font-semibold text-slate-300">
          Notify me at
        </label>
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500" aria-hidden>
            {symbol}
          </span>
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="__"
            value={text}
            disabled={disabled}
            aria-label={`Notify me when ${cardName} is at or below this price, in ${currency}`}
            aria-describedby={`${id}-note`}
            onChange={(e) => {
              setText(e.target.value);
              if (status !== "saving") setStatus("idle");
            }}
            onBlur={() => {
              if (!disabled) commit();
            }}
            className="input w-24 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </form>
      <p id={`${id}-note`} className="mt-1 text-[11px] leading-snug text-slate-500" aria-live="polite">
        {!premium ? (
          <span onClickCapture={onUpgradeClick}>
            <PlanButton tier="plus" surface="gate:target-alert" className="font-semibold text-gold underline-offset-2 hover:underline">
              Set your own price with Plus
            </PlanButton>
          </span>
        ) : atLimit ? (
          <>
            All {finiteLimit} target prices are in use — clear one, or{" "}
            <span onClickCapture={onUpgradeClick}>
              <PlanButton tier="premium" surface="gate:target-limit" className="font-semibold text-gold underline-offset-2 hover:underline">
                go unlimited with Premium
              </PlanButton>
            </span>
            .
          </>
        ) : status === "error" ? (
          <span className="text-down">{error}</span>
        ) : (
          <>
            {status === "saving"
              ? "Saving…"
              : status === "saved"
                ? saved == null
                  ? "Target cleared."
                  : flag
                    ? `Saved. We'll email you, naming the store, when it's ${money(saved, mkt)} or less.`
                    : `Saved. We'll flag it on your watchlist when a store has it at ${money(saved, mkt)} or less.`
                : saved == null
                  ? flag
                    ? "Leave empty for new-low and below-market alerts only."
                    : "Leave empty to watch for new lows only."
                  : !active
                    ? "Not active: over your Plus limit. Clear another target to switch this one on."
                    : flag
                      ? "We email you, naming the store, when it's at or below this."
                      : "We flag it here when a store is at or below this."}
            {finiteLimit != null && usedNow != null && (
              <span className="num">
                {" "}
                · {usedNow} of {finiteLimit} used
              </span>
            )}
          </>
        )}
      </p>
    </div>
  );
}
