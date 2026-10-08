"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// "Privacy settings" in the footer's link row (parity P32): the persistent, EVERY-REGION way back to the visitor's advertising and
// measurement choices. The privacy policy tells every reader, in every region, that they can change their answer with this link, so
// it must exist everywhere and lead somewhere real.
//   * Google's consent message applies (googlefc is present: EEA, UK, Switzerland, once AdSense is on) -> a button that re-opens it
//     through Google's documented API, googlefc.showRevocationMessage(), so the visitor can really change their answer.
//   * Nothing applies (every other region, or no AdSense yet) -> a link to the policy's advertising section, which carries the
//     opt-outs that do apply to them.
// googlefc is created by adsbygoogle.js, which loads async: poll for it a few seconds, then stop. Without AdSense it never appears and
// the link simply stays a link.
type GoogleFc = {
  callbackQueue?: { push: (cb: Record<string, () => void>) => void };
  showRevocationMessage?: () => void;
};

declare global {
  interface Window {
    googlefc?: GoogleFc;
  }
}

const POLL_MS = 500;
const GIVE_UP_MS = 15000;

export function PrivacySettingsLink({ className }: { className?: string }) {
  const [canReopen, setCanReopen] = useState(false);

  useEffect(() => {
    let done = false;
    const started = Date.now();
    const register = () => {
      const fc = window.googlefc;
      if (!fc) return false;
      fc.callbackQueue = fc.callbackQueue ?? ([] as unknown as GoogleFc["callbackQueue"]);
      fc.callbackQueue?.push({
        CONSENT_DATA_READY: () => {
          if (!done && typeof window.googlefc?.showRevocationMessage === "function") {
            done = true;
            setCanReopen(true);
          }
        },
      });
      return true;
    };
    if (register()) return;
    const poll = window.setInterval(() => {
      if (done || Date.now() - started > GIVE_UP_MS) return window.clearInterval(poll);
      if (register()) window.clearInterval(poll);
    }, POLL_MS);
    return () => window.clearInterval(poll);
  }, []);

  const cls = className ?? "tap-link text-slate-300 hover:text-brand-400";
  // The link row separates its items with its own gap: no "·" here (they dangle at a wrapped line's end and are read out as "middle dot").
  return canReopen ? (
    <button type="button" onClick={() => window.googlefc?.showRevocationMessage?.()} className={cls}>
      Privacy settings
    </button>
  ) : (
    <Link href="/privacy#advertising" className={cls}>
      Privacy settings
    </Link>
  );
}
