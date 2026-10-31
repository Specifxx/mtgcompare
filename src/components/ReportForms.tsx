"use client";

// "Report a wrong price" and "Suggest a store": the two visitor forms every
// Compare Empire site shares. Both POST to /api/report, which files them in the
// private reports repo (src/lib/reports-github.ts). Inline only: the price form
// opens in place under a quiet link, never as a pop-up (owner, 2026-10-27).
// Nothing asks for an email address. Styling is inherited (currentColor and
// translucent borders) so the same file sits on light and dark sites; a site
// passes its own button class.
import { useState, type CSSProperties, type FormEvent } from "react";

export interface ReportStore {
  /** the store's name as the page shows it */
  name: string;
  /** the price the page shows for it, with currency ("A$12.95") */
  price?: string | null;
}

const box: CSSProperties = { border: "1px solid rgba(127,127,127,.35)", borderRadius: 10, padding: "12px 14px", marginTop: 8 };
const field: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid rgba(127,127,127,.45)", borderRadius: 8, background: "transparent", color: "inherit", font: "inherit", fontSize: 14 };
const label: CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, margin: "10px 0 4px" };
const hint: CSSProperties = { fontSize: 12, opacity: 0.75, margin: "8px 0 0" };
const defaultButton: CSSProperties = { marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "1px solid currentColor", background: "transparent", color: "inherit", font: "inherit", fontWeight: 600, cursor: "pointer" };
const hidden: CSSProperties = { position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" };

const ISSUES: [string, string][] = [
  ["wrong-price", "The price is wrong"],
  ["out-of-stock", "It's out of stock"],
  ["wrong-product", "It's a different product"],
  ["broken-link", "The link doesn't work"],
  ["other", "Something else"],
];

type State = { status: "idle" | "sending" | "sent" } | { status: "error"; message: string };

async function send(body: Record<string, unknown>): Promise<State> {
  try {
    const r = await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, page: location.pathname }) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return r.ok && j.ok ? { status: "sent" } : { status: "error", message: j.error || "Couldn't send that. Please try again." };
  } catch {
    return { status: "error", message: "Couldn't send that. Check your connection and try again." };
  }
}

function Result({ state, sentText }: { state: State; sentText: string }) {
  if (state.status === "sent") return <p role="status" style={{ ...hint, opacity: 1, fontWeight: 600 }}>{sentText}</p>;
  if (state.status === "error") return <p role="alert" style={{ ...hint, opacity: 1, color: "#c0392b" }}>{state.message}</p>;
  return null;
}

/** A quiet "Report a wrong price" link that opens a short form in place. */
export function ReportPrice({
  product,
  stores = [],
  region,
  className,
  buttonClassName,
  summary = "Report a wrong price",
}: {
  /** the product's name (and id, if useful to us) */
  product: string;
  stores?: ReportStore[];
  region?: string;
  className?: string;
  buttonClassName?: string;
  summary?: string;
}) {
  const [state, setState] = useState<State>({ status: "idle" });
  const uniq = stores.filter((s, i) => s.name && stores.findIndex((x) => x.name === s.name) === i).slice(0, 60);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const store = String(fd.get("store") || "");
    const picked = uniq.find((s) => s.name === store);
    setState({ status: "sending" });
    setState(
      await send({
        kind: "wrong-price",
        product,
        region,
        store: store || null,
        shown: picked?.price ?? null,
        issue: fd.get("issue"),
        actual: fd.get("actual"),
        note: fd.get("note"),
        website: fd.get("website"),
      }),
    );
  }

  return (
    <details className={className} style={{ marginTop: 12, fontSize: 14 }} data-report-price>
      <summary style={{ cursor: "pointer", opacity: 0.8, textDecoration: "underline", textUnderlineOffset: 3, width: "fit-content" }}>{summary}</summary>
      {state.status === "sent" ? (
        <div style={box}>
          <Result state={state} sentText="Thanks. We check every report and fix the price if it's wrong." />
        </div>
      ) : (
        <form onSubmit={submit} style={box}>
          <label style={label} htmlFor="rp-store">Which store?</label>
          {uniq.length ? (
            <select id="rp-store" name="store" style={field} defaultValue="">
              <option value="">Not sure / several</option>
              {uniq.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                  {s.price ? ` (${s.price})` : ""}
                </option>
              ))}
            </select>
          ) : (
            <input id="rp-store" name="store" style={field} maxLength={160} placeholder="Store name" />
          )}
          <label style={label} htmlFor="rp-issue">What&apos;s wrong?</label>
          <select id="rp-issue" name="issue" style={field} defaultValue="wrong-price">
            {ISSUES.map(([v, t]) => (
              <option key={v} value={v}>{t}</option>
            ))}
          </select>
          <label style={label} htmlFor="rp-actual">The store&apos;s real price (optional)</label>
          <input id="rp-actual" name="actual" style={field} maxLength={40} inputMode="decimal" placeholder="e.g. 54.95" />
          <label style={label} htmlFor="rp-note">Anything else? (optional)</label>
          <textarea id="rp-note" name="note" style={{ ...field, minHeight: 64 }} maxLength={1000} />
          <div style={hidden} aria-hidden="true">
            <label>Leave empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
          </div>
          <button type="submit" className={buttonClassName} style={buttonClassName ? { marginTop: 12 } : defaultButton} disabled={state.status === "sending"}>
            {state.status === "sending" ? "Sending…" : "Send report"}
          </button>
          <Result state={state} sentText="" />
          <p style={hint}>No sign-up and no email needed. Please don&apos;t include personal details.</p>
        </form>
      )}
    </details>
  );
}

/** The "Suggest a store" form, for its own page. */
export function SuggestStore({
  regions,
  buttonClassName,
  what = "products",
}: {
  /** region codes and names the site covers, e.g. [["AU", "Australia"]] */
  regions?: [string, string][];
  buttonClassName?: string;
  /** what the stores sell, for the copy: "One Piece cards" */
  what?: string;
}) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState({ status: "sending" });
    setState(await send({ kind: "suggest-store", store: fd.get("store"), storeUrl: fd.get("storeUrl"), region: fd.get("region"), note: fd.get("note"), website: fd.get("website") }));
  }

  if (state.status === "sent")
    return (
      <div style={box} data-suggest-store>
        <Result state={state} sentText="Thanks! We'll look at the store and add it if we can read its prices." />
      </div>
    );
  return (
    <form onSubmit={submit} style={{ ...box, maxWidth: 560 }} data-suggest-store>
      <label style={{ ...label, marginTop: 0 }} htmlFor="ss-store">Store name</label>
      <input id="ss-store" name="store" style={field} maxLength={160} required />
      <label style={label} htmlFor="ss-url">Website</label>
      <input id="ss-url" name="storeUrl" style={field} maxLength={300} placeholder="example.com" inputMode="url" autoCapitalize="none" />
      {regions?.length ? (
        <>
          <label style={label} htmlFor="ss-region">Where does it ship from?</label>
          <select id="ss-region" name="region" style={field} defaultValue={regions[0]?.[0]}>
            {regions.map(([v, t]) => (
              <option key={v} value={v}>{t}</option>
            ))}
            <option value="OTHER">Somewhere else</option>
          </select>
        </>
      ) : null}
      <label style={label} htmlFor="ss-note">Anything we should know? (optional)</label>
      <textarea id="ss-note" name="note" style={{ ...field, minHeight: 64 }} maxLength={1000} placeholder={`e.g. which ${what} it sells`} />
      <div style={hidden} aria-hidden="true">
        <label>Leave empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <button type="submit" className={buttonClassName} style={buttonClassName ? { marginTop: 12 } : defaultButton} disabled={state.status === "sending"}>
        {state.status === "sending" ? "Sending…" : "Suggest this store"}
      </button>
      <Result state={state} sentText="" />
      <p style={hint}>No sign-up and no email needed. Store owners are welcome too: listing is free.</p>
    </form>
  );
}
