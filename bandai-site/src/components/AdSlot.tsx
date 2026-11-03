"use client";
import { useEffect } from "react";

const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

/** One AdSense display unit (future). Renders nothing until a client and slot id are configured.
 */
export function AdSlot({ slot, className = "" }: { slot?: string; className?: string }) {
  useEffect(() => {
    if (!CLIENT || !slot) return;
    try {
      ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ||= []).push({});
    } catch {}
  }, [slot]);
  if (!CLIENT || !slot) return null;
  return (
    <div data-ad className={className}>
      <ins className="adsbygoogle block" data-ad-client={CLIENT} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />
    </div>
  );
}
