"use client";

import { useState } from "react";

// Copy the missing list, or download it as a CSV (2026-09-29, set tracker).
// The text is one `1 Shanks OP01-120 (Parallel) #id` line per card, each naming its exact
// printing, so it pastes straight into Best Basket or the deck pricer
// (lib/set-scope.ts missingText). Both strings are built on the server from the
// rows the page is showing, so the export is exactly the visible list.
export function SetMissingActions({ text, csv, filename, count }: { text: string; csv: string; filename: string; count: number }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  if (count === 0) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied("idle"), 2500);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={copy} className="btn-ghost text-xs">
        {copied === "ok" ? "✓ Copied" : copied === "fail" ? "Couldn't copy" : `Copy list (${count})`}
      </button>
      <button type="button" onClick={download} className="btn-ghost text-xs">
        ⬇ CSV
      </button>
    </div>
  );
}
