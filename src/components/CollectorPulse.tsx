"use client";

// COLLECTOR PULSE (2026-11-26, community plan move 1; DECISIONS.md "Collector pulse"). One quiet, inline question under the price
// table: what is this visitor doing with the product today, buying, holding or skipping? Answers are stored by RiftCompare's
// /api/sentiment (no sign-in, no address kept, voter is a keyed hash there), and once 10 people answered the box shows the split,
// which the weekly market posts quote. Never a pop-up, never beside a price or a buy button, never in the quick view, and it never
// orders anything. UX guard (owner, 2026-11-23: one question a visit): until ToolInterest's test ends (read 4 Dec) the box shows
// only to a visitor who already answered that one. If RiftCompare can't be reached the box is simply not drawn.
import { useEffect, useState, type CSSProperties } from "react";
import { track } from "@/lib/track";
import { TOOL_INTEREST_KEY } from "./ToolInterest";

export const PULSE_API = "https://riftcompare.com/api/sentiment";
export const PULSE_SITE = "mtg";
export const PULSE_MIN = 10;
/** The day ToolInterest's demand test is read; from then the pulse shows to everyone. */
export const PULSE_OPEN_TO_ALL = Date.UTC(2026, 11, 5);
const MINE_KEY = "pulse:";

export const CHOICES = [
  { id: "buy", label: "Buying" },
  { id: "hold", label: "Holding" },
  { id: "skip", label: "Skipping" },
] as const;
type Choice = (typeof CHOICES)[number]["id"];
type Pulse = { n: number; buy?: number; hold?: number; skip?: number };

const box: CSSProperties = { border: "1px solid rgba(127,127,127,.35)", borderRadius: 10, padding: "12px 14px" };
const btn = (on: boolean): CSSProperties => ({
  flex: "1 1 0",
  minHeight: 40,
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${on ? "currentColor" : "rgba(127,127,127,.45)"}`,
  background: on ? "rgba(127,127,127,.15)" : "transparent",
  color: "inherit",
  font: "inherit",
  fontWeight: on ? 700 : 600,
  cursor: "pointer",
});

/** Whole percentages of the split, or null below the minimum. */
export function split(p: Pulse | null): Record<Choice, number> | null {
  if (!p || p.n < PULSE_MIN || p.buy == null || p.hold == null || p.skip == null) return null;
  const pc = (x: number) => Math.round((x / p.n) * 100);
  return { buy: pc(p.buy), hold: pc(p.hold), skip: pc(p.skip) };
}

export function CollectorPulse({ productId, productName, className }: { productId: string; productName: string; className?: string }) {
  const [show, setShow] = useState(false);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [mine, setMine] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let answeredOther = false;
    try {
      answeredOther = window.localStorage.getItem(TOOL_INTEREST_KEY) != null;
      const m = window.localStorage.getItem(MINE_KEY + productId);
      if (m === "buy" || m === "hold" || m === "skip") setMine(m);
    } catch {
      /* private mode: no memory, still one answer per visitor on the server */
    }
    if (!answeredOther && Date.now() < PULSE_OPEN_TO_ALL) return;
    let live = true;
    fetch(`${PULSE_API}?site=${PULSE_SITE}&ids=${encodeURIComponent(productId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { pulses?: Record<string, Pulse> }) => {
        if (!live) return;
        setPulse(d.pulses?.[productId] ?? { n: 0 });
        setShow(true);
      })
      .catch(() => {
        /* RiftCompare unreachable: draw nothing */
      });
    return () => {
      live = false;
    };
  }, [productId]);

  if (!show) return null;

  const answer = async (c: Choice) => {
    if (busy) return;
    const next = mine === c ? "clear" : c;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(PULSE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: productId, choice: next }),
      });
      const d = (await r.json().catch(() => ({}))) as { pulse?: Pulse; mine?: Choice | null; error?: string };
      if (!r.ok) throw new Error(d.error ?? "Couldn't save your answer.");
      setMine(d.mine ?? null);
      if (d.pulse) setPulse(d.pulse);
      try {
        if (d.mine) window.localStorage.setItem(MINE_KEY + productId, d.mine);
        else window.localStorage.removeItem(MINE_KEY + productId);
      } catch {
        /* ignore */
      }
      try {
        if (d.mine) track("pulse", { k: d.mine });
      } catch {
        /* analytics must never get in the way */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your answer.");
    } finally {
      setBusy(false);
    }
  };

  const s = split(pulse);
  const n = pulse?.n ?? 0;
  return (
    <aside className={className} style={box} aria-label="Collector pulse" data-pulse="">
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Collector pulse: what are you doing with {productName} today?</p>
      <p style={{ margin: "2px 0 0", fontSize: 12, opacity: 0.75 }}>
        {s
          ? `${n.toLocaleString("en-US")} collectors answered. One tap, no sign-in. Tap again to take it back.`
          : n > 0
            ? `${n} of the first ${PULSE_MIN} answers are in. The split shows at ${PULSE_MIN}.`
            : `One tap, no sign-in. The split shows once ${PULSE_MIN} collectors answered.`}
      </p>
      <div role="group" aria-label="Your answer" style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {CHOICES.map((c) => (
          <button key={c.id} type="button" style={btn(mine === c.id)} aria-pressed={mine === c.id} disabled={busy} onClick={() => answer(c.id)}>
            {c.label}
            {s && <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>{s[c.id]}%</span>}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" style={{ margin: "8px 0 0", fontSize: 12 }}>
          {error}
        </p>
      )}
    </aside>
  );
}
