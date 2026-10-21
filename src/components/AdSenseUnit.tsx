"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * One Google AdSense in-article unit (the guides only: content/guides/kit.tsx). Rendered only when NEXT_PUBLIC_ADSENSE_CLIENT and the
 * slot are set; the script itself is in the root layout's <head>. Labelled "Advertisement", with its height reserved so it doesn't
 * push the article when it fills, and `data-ad` so the site's ad-density sweep counts it like every other unit.
 */
export function AdSenseUnit({ client, slot, placement }: { client: string; slot: string; placement: string }) {
  const pushed = useRef(false);
  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // A blocked or failed script leaves the reserved box empty: nothing else depends on it.
    }
  }, []);
  return (
    <aside data-ad={placement} aria-label="Advertisement" className="my-10 min-h-[280px] rounded-xl border border-dashed border-line px-2 pb-2 pt-1">
      <div className="text-center text-[11px] uppercase tracking-wide text-faint">Advertisement</div>
      <ins className="adsbygoogle" style={{ display: "block", textAlign: "center" }} data-ad-layout="in-article" data-ad-format="fluid" data-ad-client={client} data-ad-slot={slot} />
    </aside>
  );
}
