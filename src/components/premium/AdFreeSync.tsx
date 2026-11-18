"use client";

import { useEffect } from "react";
import { usePremium } from "./usePremium";

/** Keeps <html data-adfree> in step with the membership (the boot script set it from the cache; this follows the hourly re-check). */
export function AdFreeSync() {
  const v = usePremium();
  useEffect(() => {
    if (v.status === "loading") return;
    const el = document.documentElement;
    if (v.status === "member") el.setAttribute("data-adfree", "");
    else el.removeAttribute("data-adfree");
  }, [v.status]);
  return null;
}
