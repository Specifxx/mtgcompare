"use client";

// One `return_visit` event per returning visitor per day (lib/return-visit.ts). Renders nothing.
import { useEffect } from "react";
import { track } from "@/lib/track";
import { ARM_KEYS, RV_KEY, dayOf, pageType, parseRecord, step, viaOf } from "@/lib/return-visit";

export function ReturnBeacon() {
  useEffect(() => {
    try {
      const ls = window.localStorage;
      const { next, event } = step(
        parseRecord(ls.getItem(RV_KEY)),
        dayOf(new Date()),
        pageType(window.location.pathname),
        viaOf(document.referrer, window.location.search, window.location.hostname),
      );
      ls.setItem(RV_KEY, JSON.stringify(next));
      if (!event) return;
      const props: Record<string, string> = { ...event };
      for (const [name, key] of Object.entries(ARM_KEYS)) {
        const v = ls.getItem(key);
        if (v && /^[a-z0-9_-]{1,12}$/i.test(v)) props[name] = v;
      }
      track("return_visit", props);
    } catch {
      // storage blocked: count nothing
    }
  }, []);
  return null;
}
