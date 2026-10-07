"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// The results region of the price guide: marks itself busy (aria-busy and a dim)
// from the moment an in-page link or control starts a navigation until the new
// query arrives, so a slow render never looks like a dead click.
export function GuideBusy({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const params = useSearchParams();
  const key = params.toString();
  const [busy, setBusy] = useState(false);
  useEffect(() => setBusy(false), [key]);
  return (
    <div
      aria-busy={busy}
      className={`${className} transition-opacity ${busy ? "opacity-60" : ""}`}
      onClickCapture={(e) => {
        const a = (e.target as Element).closest?.("a[href]");
        if (a && a.getAttribute("href")?.startsWith("/price-guide")) setBusy(true);
      }}
    >
      {children}
    </div>
  );
}
