import Script from "next/script";
import { CONSENT_REGIONS, GA_ENABLED, GA_MEASUREMENT_ID } from "@/lib/ga";

// gtag.js with Consent Mode defaults set before `config`. Page views are sent
// by GAPageViewTracker on every route (first load included), as on
// RiftCompare: `config` carries send_page_view:false, so GA4's own
// history-change detection never double-counts a client navigation. Outbound buy clicks are
// sent as `buy_click` (RiftCompare's event name) from any link carrying
// data-retailer, so affiliate clicks per store and per page show up in GA
// (plus data-card, the product's slug, and data-surface, which block on the page).
// /admin is never measured: the tracker skips it, a hard load of /admin sets the
// ga-disable flag, and AdminNoAnalytics keeps it set on client navigation.
export function GoogleAnalytics() {
  if (!GA_ENABLED) return null;
  const init = `
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',region:${JSON.stringify(CONSENT_REGIONS)},wait_for_update:500});
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'granted'});
gtag('js',new Date());if(location.pathname.indexOf('/admin')===0){window['ga-disable-${GA_MEASUREMENT_ID}']=true;}gtag('config','${GA_MEASUREMENT_ID}',{send_page_view:false});
document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[data-retailer]');if(!a)return;
gtag('event','buy_click',{retailer:a.getAttribute('data-retailer'),page_type:a.getAttribute('data-page')||location.pathname.split('/')[1]||'home',card:a.getAttribute('data-card')||undefined,surface:a.getAttribute('data-surface')||undefined,link_url:a.href,transport_type:'beacon'});},true);`;
  return (
    <>
      {/* Inline and first (rendered in <head>), so gtag() and the consent
          defaults exist before React hydrates and GAPageViewTracker queues the
          first page_view behind `config`. The library itself loads after. */}
      <script id="ga-init" dangerouslySetInnerHTML={{ __html: init }} />
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
    </>
  );
}
