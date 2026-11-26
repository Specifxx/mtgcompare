"use client";

import { useEffect, useState } from "react";
import { PREMIUM_SERVICE, readStored, trackPremium } from "@/lib/premium-member";

// The Premium price ladder test (owner, 2026-11-26; RiftCompare DECISIONS.md "A Week Pass and a Founder Lifetime, as a
// test on the sister sites' Premium pages"), 7 to 21 Dec 2026. The shared Premium service decides who is offered what
// (half of signed-in members, never anyone already paying, Founder only for accounts at least 14 days old while seats
// last) and answers [] to everyone else, so outside the test or for arm A this renders nothing. Two one-off purchases
// under the subscription card, charged once, never renewed. Prices come from the service's answer, never from here.
type Pass = { kind: "week" | "founder"; label: string; left: number | null };

const COPY: Record<Pass["kind"], { title: string; line: string; cta: string }> = {
  week: { title: "Week Pass", line: "Every Premium feature for 7 days. Charged once, never renews.", cta: "Get a Week Pass" },
  founder: { title: "Founder Lifetime", line: "Premium for good, one payment.", cta: "Become a Founder" },
};

async function call(path: string, body: unknown): Promise<{ status: number; j: Record<string, unknown> }> {
  try {
    const r = await fetch(`${PREMIUM_SERVICE}/api/sister-premium/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
    });
    return { status: r.status, j: ((await r.json().catch(() => ({}))) as Record<string, unknown>) || {} };
  } catch {
    return { status: 0, j: { error: "Couldn't reach the server. Check your connection and try again." } };
  }
}

export function PassOffers() {
  const [passes, setPasses] = useState<Pass[]>([]);
  const [busy, setBusy] = useState<Pass["kind"] | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const cur = readStored();
    if (!cur) return;
    call("status", { token: cur.t }).then(({ j }) => {
      const list = Array.isArray(j.passes) ? (j.passes as Pass[]).filter((p) => p && (p.kind === "week" || p.kind === "founder")) : [];
      setPasses(list);
      if (list.length) trackPremium("premium_pass_shown", { passes: list.map((p) => p.kind).join(",") });
    });
  }, []);

  async function buy(kind: Pass["kind"]) {
    const cur = readStored();
    if (!cur) return;
    setBusy(kind);
    setNote("");
    trackPremium("premium_pass_click", { pass: kind });
    const { j } = await call("pass", { token: cur.t, pass: kind });
    if (typeof j.url === "string") {
      trackPremium("premium_checkout_open", { plan: `pass-${kind}` });
      location.href = j.url;
      return;
    }
    setBusy(null);
    setNote(typeof j.error === "string" ? j.error : "Couldn't open checkout. Try again.");
  }

  if (!passes.length) return null;
  return (
    <div className="border-t border-line px-6 py-5 sm:px-8" data-pass-offers>
      <p className="text-sm font-semibold">Rather not subscribe?</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {passes.map((p) => (
          <div key={p.kind} className="rounded-xl border border-line p-4">
            <p className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{COPY[p.kind].title}</span>
              <span className="font-display text-xl font-bold">{p.label}</span>
            </p>
            <p className="mt-1 text-sm text-muted">
              {COPY[p.kind].line}
              {p.kind === "founder" && p.left !== null ? ` ${p.left} of 100 places left.` : ""}
            </p>
            <button type="button" className="btn-ghost mt-3 w-full justify-center" disabled={busy !== null} onClick={() => buy(p.kind)}>
              {busy === p.kind ? "Opening secure checkout…" : COPY[p.kind].cta}
            </button>
          </div>
        ))}
      </div>
      {note && <p className="mt-3 text-sm text-red-600" aria-live="polite">{note}</p>}
    </div>
  );
}
