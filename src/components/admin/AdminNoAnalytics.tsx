"use client";

import { useEffect } from "react";
import { GA_ENABLED, GA_MEASUREMENT_ID } from "@/lib/ga";

// Keeps GA4 off while an admin page is open (client navigations included). The
// init script in GoogleAnalytics.tsx already skips the first page view on a
// hard load of /admin; together no /admin page view is ever sent.
export function AdminNoAnalytics() {
  useEffect(() => {
    if (!GA_ENABLED) return;
    const k = `ga-disable-${GA_MEASUREMENT_ID}`;
    const w = window as unknown as Record<string, unknown>;
    w[k] = true;
    return () => {
      delete w[k];
    };
  }, []);
  return null;
}
