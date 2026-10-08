"use client";

import { useEffect } from "react";

// Last-resort boundary for errors thrown in the ROOT layout itself (which the
// route-level error.tsx can't catch). It must render its own <html>/<body>. Kept
// deliberately minimal and dependency-free so it can never itself fail to render.
const CHUNK_RE = /ChunkLoadError|Loading chunk [\d]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module/i;

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isChunkError = error?.name === "ChunkLoadError" || CHUNK_RE.test(error?.message || "");

  useEffect(() => {
    if (!isChunkError) return;
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
    <html lang="en">
      <body style={{ background: "#0c0b14", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "64px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 48 }} aria-hidden>🛠️</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginTop: 12 }}>
            {isChunkError ? "Refreshing to the latest version…" : "Something went wrong"}
          </h1>
          <p style={{ fontSize: 14, color: "#94a3b8", marginTop: 8, lineHeight: 1.6 }}>
            {isChunkError
              ? "We just shipped an update. This page is reloading itself to pick it up."
              : "A hiccup stopped the page from loading. Please try again."}
          </p>
          <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => reset()}
              style={{ background: "#9140da", color: "#ffffff", border: 0, borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{ background: "transparent", color: "#e2e8f0", border: "1px solid #2a293e", borderRadius: 10, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}
            >
              Reload page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
