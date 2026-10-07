"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// RiftCompare's GAPageViewTracker: fires GA4's page_view explicitly on the
// first load and every client-side route change (GoogleAnalytics configures
// send_page_view:false), with the previous URL as the referrer. /admin is
// never measured. A no-op without gtag on the page (GA unset).
function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevUrl = useRef<string | null>(null);

  useEffect(() => {
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    if (typeof window === "undefined" || !gtag) return;
    if (pathname === "/admin" || pathname.startsWith("/admin/")) return;
    const query = searchParams.toString();
    const path = query ? `${pathname}?${query}` : pathname;
    const location = `${window.location.origin}${path}`;
    gtag("event", "page_view", {
      page_location: location,
      page_path: path,
      page_title: document.title,
      ...(prevUrl.current ? { page_referrer: prevUrl.current } : {}),
    });
    prevUrl.current = location;
  }, [pathname, searchParams]);

  return null;
}

export function GAPageViewTracker() {
  return (
    <Suspense fallback={null}>
      <PageViewTracker />
    </Suspense>
  );
}
