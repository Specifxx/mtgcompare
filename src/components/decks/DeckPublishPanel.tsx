"use client";

import Link from "next/link";
import { useState } from "react";
import { useMe } from "@/lib/use-me";
import { DECK_DESC_MAX, DECK_TITLE_MAX } from "@/lib/published-decks";

// "Publish this deck" under the deck builder's results (RiftCompare's
// DeckPublishPanel). Signed-in only; the server resolves the list the same way
// the builder priced it and refuses anything that is not a real deck — one
// Leader and 50 cards (lib/published-decks-server.ts).
export function DeckPublishPanel({ listText, loginHref }: { listText: string; loginHref: string }) {
  const { me, loaded } = useMe();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" } | { kind: "error"; msg: string } | { kind: "done"; slug: string }>({ kind: "idle" });

  if (!loaded) return null;
  if (!me.user) {
    return (
      <div className="card-surface flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-slate-300">Share this deck in the public deck library, priced for every visitor.</p>
        <Link href={loginHref} rel="nofollow" className="btn-ghost text-sm">
          Sign in to publish →
        </Link>
      </div>
    );
  }
  if (state.kind === "done") {
    return (
      <div role="status" className="card-surface border-brand-500/40 p-4 text-sm text-slate-200">
        Published!{" "}
        <Link href={`/decks/${state.slug}`} className="font-semibold text-brand-400 underline">
          See your deck →
        </Link>
      </div>
    );
  }
  if (!open) {
    return (
      <div className="card-surface flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-slate-300">Happy with it? Publish it to the public deck library.</p>
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost text-sm">
          Publish this deck →
        </button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "busy") return;
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, text: listText, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setState({ kind: "error", msg: data?.error ?? "Couldn't publish — please try again." });
      setState(data?.slug ? { kind: "done", slug: data.slug } : { kind: "idle" });
    } catch {
      setState({ kind: "error", msg: "Network error — please try again." });
    }
  }

  return (
    <form onSubmit={submit} className="card-surface space-y-3 p-4">
      <h2 className="font-bold text-white">Publish this deck</h2>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">Title</span>
        <input required value={title} maxLength={DECK_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Budget Red Luffy aggro" className="input w-full" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">
          Description <span className="font-normal text-slate-500">— optional</span>
        </span>
        <textarea rows={3} value={description} maxLength={DECK_DESC_MAX} onChange={(e) => setDescription(e.target.value)} className="input w-full resize-y" />
      </label>
      <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <p className="text-xs text-slate-500">Published under your display name. A deck is one Leader and 50 cards; the Leader comes from your list. Links aren&apos;t allowed.</p>
      {state.kind === "error" && (
        <p role="alert" className="text-sm text-red-400">
          {state.msg}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={state.kind === "busy"} className="btn-primary">
          {state.kind === "busy" ? "Publishing…" : "Publish deck"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}
