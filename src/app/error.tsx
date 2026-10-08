"use client";

import { useEffect } from "react";
import Link from "next/link";
import { NavIcon } from "@/components/NavIcon";

// Route-segment error boundary. Without this, ANY client-side exception falls
// through to Next's bare "Application error: a client-side exception has
// occurred" dead-end with no way back. This catches the error, gives the visitor
// a branded recovery UI, and — crucially — auto-recovers from the most common
// cause: a stale JS chunk after a fresh deploy. When a tab has been open across a
// deploy, navigating can request a chunk hash the new build purged
// (ChunkLoadError); a one-time reload pulls the current build.
const CHUNK_RE = /ChunkLoadError|Loading chunk [\d]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|importScripts/i;

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isChunkError = error?.name === "ChunkLoadError" || CHUNK_RE.test(error?.message || "");

  useEffect(() => {
    if (!isChunkError) return;
    // Guard against a reload loop: only auto-reload if we haven't just done so.
    try {
      const KEY = "mc_chunk_reload_at";
      const last = Number(sessionStorage.getItem(KEY) || "0");
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }, [isChunkError]);

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <NavIcon name="wrench" className="mx-auto h-12 w-12 text-slate-500" />
      <h1 className="mt-3 text-2xl font-extrabold text-white">
        {isChunkError ? "Refreshing to the latest version…" : "Something went wrong"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        {isChunkError
          ? "We just shipped an update and your tab was running an older copy. This page is reloading itself — if it doesn't, tap reload below."
          : "A hiccup on our end stopped this page from loading. Try again — your place in the app is safe."}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button onClick={() => reset()} className="btn-primary">Try again</button>
        <button onClick={() => window.location.reload()} className="btn-ghost">Reload page</button>
        <Link href="/" className="btn-ghost">Go home</Link>
      </div>
      {error?.digest && (
        <p className="mt-6 text-[11px] text-slate-600">Reference: {error.digest}</p>
      )}
    </div>
  );
}
