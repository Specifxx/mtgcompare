import Script from "next/script";
import { ADSENSE_CLIENT_ID, adsenseLoaderSrc } from "@/lib/adsense";

// The AdSense loader (and nothing else) from the root layout, ONLY when
// NEXT_PUBLIC_ADSENSE_CLIENT_ID is set. Absent, it renders nothing: no third-party
// script, no consent surface, no layout cost. Which slots fill is AdSlot's call.
export function AdSenseLoader() {
  if (!ADSENSE_CLIENT_ID) return null;
  return <Script id="adsense-loader" async strategy="afterInteractive" src={adsenseLoaderSrc(ADSENSE_CLIENT_ID)} crossOrigin="anonymous" />;
}
