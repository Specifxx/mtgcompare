"use client";

import { useEffect } from "react";
import { REFERRAL_COOKIE } from "@/lib/referral-cookie";
import { captureEntrySource } from "@/lib/entry-source";

// Persists an inbound referral code (?ref=<userId>) into a cookie so it
// survives the browse → sign-up journey and the OAuth round trip, and records
// the landing's traffic source (lib/entry-source.ts) — RiftCompare's
// ReferralCapture. Mounted once in the root layout; reads no session.
export function ReferralCapture() {
  useEffect(() => {
    captureEntrySource();
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (!ref || !/^[a-z0-9]{6,40}$/i.test(ref)) return;
    document.cookie = `${REFERRAL_COOKIE}=${encodeURIComponent(ref)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  }, []);
  return null;
}

export default ReferralCapture;
