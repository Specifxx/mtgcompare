"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { track } from "@vercel/analytics";
import { PriceAlertForm, parseAmount, suggestTarget } from "@/components/PriceAlertForm";
import { readStored, setPriceWatch, writeStored } from "@/lib/premium-member";
import { usePremium } from "./usePremium";

const SYMBOL: Record<string, string> = { US: "US$", CA: "CA$", AU: "A$", NZ: "NZ$", SG: "S$", UK: "£", EU: "€" };
const money = (cents: number, region: string) => `${SYMBOL[region] ?? ""}${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

type Props = Parameters<typeof PriceAlertForm>[0];

/**
 * The price alert with ONE TAP for anyone signed in (boardroom, 2026-11-19: "one-tap restock / price-drop alert on sealed product
 * pages", free for all, alerts stay free). Signed in (a free account or Premium) and the product has a price today: one button sets an
 * alert at 10% under today's lowest in-stock price (the form's own suggestion), with "Pick my price" beside it; the account's token
 * names the address, so there is no email field. Signed out, or no price today: the ordinary form (PriceAlertForm), unchanged.
 * The server HTML is the ordinary button (usePremium starts "loading"); nothing opens by itself. Event `alert_created` {oneTap}.
 */
export function PriceAlert(props: Props) {
  const v = usePremium();
  const signedIn = v.status === "member" || v.status === "free";
  const [s, setS] = useState<{ t: "idle" | "busy" | "pick" } | { t: "done"; cents: number; active: boolean } | { t: "error"; m: string }>({ t: "idle" });
  const now = props.priceCents;
  if (!signedIn || now == null) return <PriceAlertForm {...props} />;
  const suggested = suggestTarget(now);

  async function save(cents: number) {
    const cur = readStored();
    if (!cur) return setS({ t: "error", m: "Sign in again to set alerts with one tap." });
    setS({ t: "busy" });
    const r = await setPriceWatch(cur.t, props.productId, props.region, cents);
    if (r.ok) {
      track("alert_created", { region: props.region, oneTap: true, weekly: false, prominent: !!props.prominent });
      setS({ t: "done", cents, active: r.active });
    } else {
      if (r.signIn) writeStored(null);
      setS({ t: "error", m: r.message });
    }
  }

  function pick(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cents = parseAmount(String(new FormData(e.currentTarget).get("target") ?? ""));
    if (!cents) return setS({ t: "error", m: "Enter the price you want, like 45 or 45.50." });
    void save(cents);
  }

  if (s.t === "done") {
    return (
      <p className={`${props.className ?? ""} text-sm`} role="status">
        <strong>{s.active ? "Alert on." : "Check your inbox to confirm."}</strong>{" "}
        {s.active ? `We'll email you when a ${props.region} store has it for ${money(s.cents, props.region)} or less.` : "One click in the email we just sent turns it on."}{" "}
        <Link className="underline" href="/watches" prefetch={false}>My watches</Link>
      </p>
    );
  }

  return (
    <div className={props.className}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={props.buttonClassName} disabled={s.t === "busy"} onClick={() => save(suggested)}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "-3px", marginRight: 6 }}>
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {s.t === "busy" ? "Saving…" : `Alert me under ${money(suggested, props.region)}`}
        </button>
        {s.t !== "pick" && (
          <button type="button" className="text-sm underline" onClick={() => setS({ t: "pick" })}>
            Pick my price
          </button>
        )}
      </div>
      {s.t === "pick" && (
        <form onSubmit={pick} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor={`pa1-${props.productId}`}>Email me at {SYMBOL[props.region] ?? ""}</label>
          <input id={`pa1-${props.productId}`} name="target" inputMode="decimal" required defaultValue={(suggested / 100).toFixed(0)} className="w-24 rounded-lg border border-line bg-transparent px-2 py-1.5 text-base" autoComplete="off" />
          <button type="submit" className="btn-ghost">Set alert</button>
        </form>
      )}
      {s.t === "error" && <p className="mt-1 text-sm" role="alert">{s.m}</p>}
    </div>
  );
}
