"use client";

import { useEffect, useState } from "react";
import { readStored, refreshPremium, type StoredPremium } from "@/lib/premium-member";

export type PremiumView = { status: "loading" } | { status: "out" } | { status: "member"; info: StoredPremium } | { status: "free"; info: StoredPremium };

/** The visitor's membership as this browser knows it (cached, re-checked hourly). Renders "loading" until the browser has looked. */
export function usePremium(): PremiumView {
  const [v, setV] = useState<PremiumView>({ status: "loading" });
  useEffect(() => {
    let live = true;
    const cached = readStored();
    if (!cached) setV({ status: "out" });
    else setV(cached.premium ? { status: "member", info: cached } : { status: "free", info: cached });
    refreshPremium().then((info) => {
      if (!live) return;
      setV(!info ? { status: "out" } : info.premium ? { status: "member", info } : { status: "free", info });
    });
    return () => {
      live = false;
    };
  }, []);
  return v;
}
