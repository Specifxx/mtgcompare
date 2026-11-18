"use client";

// Feedback asks (owner, 2026-11-18: "we need more feedback"). The same file in every Compare Empire site.
//
// - <FeedbackAsk />: one quiet line at the top of the footer, "Was this page useful? Yes / No". A tap is the whole ask and is
//   sent at once (a vote alone counts); only then does a box offer "What would make it better?", optional. Inline, never a
//   pop-up, nothing fixed or floating, nothing for a new visitor to dismiss. Hidden for the rest of the visit on a page
//   already answered.
// - <FeedbackForm />: the full form on /feedback (an idea, something wrong, something missing), linked from the menu and footer.
//
// Both POST to /api/report as kind "feedback" (lib/reports-github.ts): one file on the site's public `reports` branch, read by
// the daily triage with every price report and store suggestion. So nothing asks for an email address; a visitor who wants a
// reply is shown the site's inbox instead. Styling is inherited (currentColor, translucent borders) so the file sits on light
// and dark sites alike; a site passes its own button class.
import Link from "next/link";
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";

const box: CSSProperties = { border: "1px solid rgba(127,127,127,.35)", borderRadius: 10, padding: "12px 14px", marginTop: 8 };
const field: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid rgba(127,127,127,.45)", borderRadius: 8, background: "transparent", color: "inherit", font: "inherit", fontSize: 14 };
const label: CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, margin: "10px 0 4px" };
const hint: CSSProperties = { fontSize: 12, opacity: 0.75, margin: "8px 0 0" };
const pill: CSSProperties = { padding: "4px 14px", borderRadius: 999, border: "1px solid rgba(127,127,127,.45)", background: "transparent", color: "inherit", font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", minHeight: 32 };
const defaultButton: CSSProperties = { marginTop: 10, padding: "8px 16px", borderRadius: 8, border: "1px solid currentColor", background: "transparent", color: "inherit", font: "inherit", fontWeight: 600, cursor: "pointer" };
const hidden: CSSProperties = { position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" };

export const FEEDBACK_TOPICS: [string, string][] = [
  ["idea", "An idea or a feature you'd like"],
  ["problem", "Something is wrong or confusing"],
  ["missing", "A product, game or store we're missing"],
  ["other", "Something else"],
];

type State = { status: "idle" | "sending" | "sent" } | { status: "error"; message: string };

async function send(body: Record<string, unknown>): Promise<State> {
  try {
    const r = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "feedback", page: location.pathname, ...body }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return r.ok && j.ok ? { status: "sent" } : { status: "error", message: j.error || "Couldn't send that. Please try again." };
  } catch {
    return { status: "error", message: "Couldn't send that. Check your connection and try again." };
  }
}

const seenKey = (path: string) => `fb-ask:${path}`;

function ReplyLine({ email }: { email?: string }) {
  if (!email) return null;
  return (
    <p style={hint}>
      Want a reply? Email <a href={`mailto:${email}`} style={{ color: "inherit", textDecoration: "underline" }}>{email}</a>. What we build from your notes is listed on <Link href="/feedback" prefetch={false} style={{ color: "inherit", textDecoration: "underline" }}>our feedback page</Link>.
    </p>
  );
}

/** "Was this page useful?" One tap, sent at once; an optional note after it. */
export function FeedbackAsk({ email, buttonClassName, className }: { email?: string; buttonClassName?: string; className?: string }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [answered, setAnswered] = useState(false);
  const [note, setNote] = useState<State>({ status: "idle" });
  const [path, setPath] = useState("");

  useEffect(() => {
    setPath(location.pathname);
    try {
      if (sessionStorage.getItem(seenKey(location.pathname))) setAnswered(true);
    } catch {
      /* storage blocked: ask anyway */
    }
  }, []);

  // /feedback has the full form; the line would only repeat it.
  if (!path || path === "/feedback" || (answered && !vote)) return null;

  async function tap(v: "up" | "down") {
    setVote(v);
    try {
      sessionStorage.setItem(seenKey(location.pathname), v);
    } catch {
      /* nothing to keep it in */
    }
    await send({ vote: v });
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setNote({ status: "sending" });
    setNote(await send({ note: fd.get("note"), issue: vote === "down" ? "after-down" : "after-up", website: fd.get("website") }));
  }

  return (
    <div className={className} style={{ fontSize: 14, margin: "0 0 16px" }} data-feedback-ask>
      {!vote ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Was this page useful?</span>
          <button type="button" style={pill} onClick={() => tap("up")}>Yes</button>
          <button type="button" style={pill} onClick={() => tap("down")}>No</button>
        </div>
      ) : note.status === "sent" ? (
        <div style={box} role="status">
          <p style={{ margin: 0, fontWeight: 600 }}>Thank you. We read every note, and the next things we build come from them.</p>
          <ReplyLine email={email} />
        </div>
      ) : (
        <form onSubmit={submit} style={box}>
          <p style={{ margin: 0, fontWeight: 600 }}>Thanks! {vote === "down" ? "What were you looking for?" : "What would make it even better?"}</p>
          <label style={{ ...label, fontWeight: 400, opacity: 0.8 }} htmlFor="fb-ask-note">Optional, a few words is plenty</label>
          <textarea id="fb-ask-note" name="note" required minLength={3} style={{ ...field, minHeight: 64 }} maxLength={1000} />
          <div style={hidden} aria-hidden="true">
            <label>Leave empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
          </div>
          <button type="submit" className={buttonClassName} style={buttonClassName ? { marginTop: 10 } : defaultButton} disabled={note.status === "sending"}>
            {note.status === "sending" ? "Sending…" : "Send"}
          </button>
          {note.status === "error" && <p role="alert" style={{ ...hint, opacity: 1, color: "#c0392b" }}>{note.message}</p>}
          <p style={hint}>No sign-up and no email needed. Notes are kept in our public records, so please don&apos;t include personal details.</p>
        </form>
      )}
    </div>
  );
}

/** The full form on /feedback. */
export function FeedbackForm({ email, buttonClassName }: { email?: string; buttonClassName?: string }) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState({ status: "sending" });
    setState(await send({ issue: fd.get("topic"), note: fd.get("note"), website: fd.get("website"), page: "/feedback" }));
  }

  if (state.status === "sent")
    return (
      <div style={box} role="status">
        <p style={{ margin: 0, fontWeight: 600 }}>Thank you. We read every note, usually within a day.</p>
        <ReplyLine email={email} />
      </div>
    );

  return (
    <form onSubmit={submit} style={box} data-feedback-form>
      <label style={{ ...label, marginTop: 0 }} htmlFor="fb-topic">What is it about?</label>
      <select id="fb-topic" name="topic" style={field} defaultValue="idea">
        {FEEDBACK_TOPICS.map(([v, t]) => (
          <option key={v} value={v}>{t}</option>
        ))}
      </select>
      <label style={label} htmlFor="fb-note">Tell us</label>
      <textarea id="fb-note" name="note" required minLength={3} style={{ ...field, minHeight: 110 }} maxLength={1000} placeholder="What would you add, change or fix?" />
      <div style={hidden} aria-hidden="true">
        <label>Leave empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <button type="submit" className={buttonClassName} style={buttonClassName ? { marginTop: 12 } : defaultButton} disabled={state.status === "sending"}>
        {state.status === "sending" ? "Sending…" : "Send feedback"}
      </button>
      {state.status === "error" && <p role="alert" style={{ ...hint, opacity: 1, color: "#c0392b" }}>{state.message}</p>}
      <p style={hint}>
        No sign-up and no email needed. Notes are kept in our public records, so please don&apos;t include personal details.
        {email ? <> For a reply, email <a href={`mailto:${email}`} style={{ color: "inherit", textDecoration: "underline" }}>{email}</a>.</> : null}
      </p>
    </form>
  );
}
