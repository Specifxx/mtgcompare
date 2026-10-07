"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CONTACT_CATEGORIES, CONTACT_CATEGORY_LABELS, LIMITS, isIn, type ContactCategory } from "@/lib/inbox-rules";

const field = "mt-1 block w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-slate-100";

// The /contact form. The owner reads it in /admin/inbox and replies by hand.
// ?category=PAYMENT (linked from /account) preselects the topic; it is read on
// the client so /contact stays a static page.
export function ContactForm() {
  return (
    <Suspense fallback={<Form category={undefined} />}>
      <WithCategory />
    </Suspense>
  );
}

function WithCategory() {
  const category = useSearchParams()?.get("category") ?? undefined;
  return <Form key={category ?? ""} category={category} />;
}

function Form({ category }: { category?: string }) {
  const initial: ContactCategory = isIn(CONTACT_CATEGORIES, category) ? category : "OTHER";
  const [form, setForm] = useState({ name: "", email: "", subject: "", category: initial as string, message: "", website: "" });
  const [state, setState] = useState<{ status: "idle" | "busy" | "done" | "error"; error?: string }>({ status: "idle" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ status: "busy" });
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setState(res.ok ? { status: "done" } : { status: "error", error: data.error ?? "Something went wrong. Try again later." });
    } catch {
      setState({ status: "error", error: "Network error. Try again." });
    }
  };

  if (state.status === "done") return <p className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 p-4 text-emerald-300">Thanks — your message is in. The owner reads every one.</p>;
  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-ink-800 bg-ink-900 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-slate-300">
          Your name
          <input required maxLength={LIMITS.contactNameMax} value={form.name} onChange={set("name")} autoComplete="name" className={field} />
        </label>
        <label className="text-sm text-slate-300">
          Your email
          <input required type="email" maxLength={LIMITS.contactEmail} value={form.email} onChange={set("email")} autoComplete="email" className={field} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-slate-300">
          Topic
          <select value={form.category} onChange={set("category")} className={field}>
            {CONTACT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CONTACT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-300">
          Subject (optional)
          <input maxLength={LIMITS.contactSubject} value={form.subject} onChange={set("subject")} className={field} />
        </label>
      </div>
      <label className="block text-sm text-slate-300">
        Message
        <textarea required minLength={LIMITS.contactMessageMin} maxLength={LIMITS.contactMessageMax} rows={5} value={form.message} onChange={set("message")} className={field} />
      </label>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={form.website} onChange={set("website")} />
      {state.status === "error" ? <p className="text-sm text-red-300">{state.error}</p> : null}
      <button type="submit" disabled={state.status === "busy"} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50">
        {state.status === "busy" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
