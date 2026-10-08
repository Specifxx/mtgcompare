"use client";

import { useState } from "react";
import { LIMITS, SUPPORT_CATEGORIES, SUPPORT_CATEGORY_LABELS, isIn } from "@/lib/inbox-rules";

const field = "mt-1 block w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-slate-100";

// The /support form (RiftCompare's SupportForm): Payment / billing, Account or
// Something else, prefilled from ?category and ?subject. Posts to /api/support
// and shows the ticket number on screen (MC-<n>); no email is sent. The hidden
// `website` field is the honeypot every public form carries.
export function SupportForm({ defaultName, defaultEmail, defaultCategory, defaultSubject }: { defaultName?: string; defaultEmail?: string; defaultCategory?: string; defaultSubject?: string }) {
  const [form, setForm] = useState({
    name: defaultName ?? "",
    email: defaultEmail ?? "",
    category: isIn(SUPPORT_CATEGORIES, defaultCategory) ? defaultCategory : "OTHER",
    subject: (defaultSubject ?? "").slice(0, LIMITS.supportSubjectMax),
    message: "",
    website: "",
  });
  const [state, setState] = useState<{ status: "idle" | "busy" | "done" | "error"; error?: string; ticket?: string }>({ status: "idle" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ status: "busy" });
    try {
      const res = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; ticket?: string };
      setState(res.ok ? { status: "done", ticket: data.ticket } : { status: "error", error: data.error ?? "Couldn't send your message. Try again shortly." });
    } catch {
      setState({ status: "error", error: "Network error. Try again." });
    }
  }

  if (state.status === "done") {
    return (
      <div className="card-surface p-6 text-center" role="status">
        <p className="text-lg font-bold text-emerald-300">{state.ticket ? `Sent. Your ticket is ${state.ticket}.` : "Sent. Your message is in."}</p>
        <p className="mt-1 text-sm text-slate-400">Keep that number: it is how we find your message. The reply comes by email from the owner.</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="card-surface flex flex-col gap-3 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-300">
          Your name
          <input required maxLength={LIMITS.contactNameMax} value={form.name} onChange={set("name")} autoComplete="name" className={field} />
        </label>
        <label className="text-sm text-slate-300">
          Email
          <input required type="email" maxLength={LIMITS.contactEmail} value={form.email} onChange={set("email")} autoComplete="email" className={field} />
        </label>
      </div>
      <label className="text-sm text-slate-300">
        What&apos;s this about?
        <select value={form.category} onChange={set("category")} className={field}>
          {SUPPORT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {SUPPORT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-slate-300">
        Subject
        <input required minLength={LIMITS.supportSubjectMin} maxLength={LIMITS.supportSubjectMax} value={form.subject} onChange={set("subject")} className={field} />
      </label>
      <label className="text-sm text-slate-300">
        Message
        <textarea required minLength={LIMITS.supportMessageMin} maxLength={LIMITS.supportMessageMax} rows={6} value={form.message} onChange={set("message")} className={`${field} resize-none`} />
      </label>
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
        </label>
      </div>
      {state.status === "error" ? (
        <p className="text-sm text-rose-300" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={state.status === "busy"} className="btn-primary self-start disabled:opacity-50">
        {state.status === "busy" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
