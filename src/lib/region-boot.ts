/**
 * The visitor's own region by default (owner, 2026-11-01: "the default region is the region that the visitor is located
 * in, and if they can't determine it, the default should be the US"). An inline script, run before first paint on every
 * page: a visitor on a regional page of another region than theirs (the one they last picked, else their time zone's,
 * else the US) is sent to the same page in their region, when the page lists it as an hreflang alternate. Until
 * DOMContentLoaded `<main>` is hidden (html[data-geo="pending"], at most 1.5 s). Crawlers, link previews and audit
 * tools are never moved, so every regional page stays indexable. A page without its region's copy stays as it is. No
 * request, no cookie: one CDN copy per page for everyone. A click on any `[data-region-pick]` link remembers that region.
 */
export interface RegionBootOptions {
  /** localStorage key that holds the region the visitor picked. */
  key: string;
  /** region code → hreflang of its pages. */
  hreflang: Record<string, string>;
  /** [region, RegExp source] in order; the first whose pattern matches the browser's time zone wins. */
  zones: [string, string][];
  /** The region when no zone matches. */
  fallback: string;
  /** JS expression for the page's region from `p` (the path) and `s` (its first segment); null for a page of no region. */
  pageRegion: string;
}

export const BOT_UA_SOURCE = "bot|crawl|spider|slurp|google|bing|yandex|baidu|duckduck|lighthouse|headless|preview|facebookexternalhit|embedly|whatsapp";

export function regionBootScript(o: RegionBootOptions): string {
  const codes = Object.keys(o.hreflang);
  return `(function(){try{
var d=document.documentElement,K=${JSON.stringify(o.key)},C=${JSON.stringify(codes)};
document.addEventListener("click",function(e){var t=e.target,a=t&&t.closest&&t.closest("[data-region-pick]");if(a)try{localStorage.setItem(K,a.getAttribute("data-region-pick"))}catch(x){}},true);
if(new RegExp(${JSON.stringify(BOT_UA_SOURCE)},"i").test(navigator.userAgent||""))return;
var p=location.pathname,s=p.split("/")[1]||"",page=(${o.pageRegion});
if(!page)return;
var want=null;try{want=localStorage.getItem(K)}catch(e){}
if(C.indexOf(want)<0){var z="";try{z=Intl.DateTimeFormat().resolvedOptions().timeZone||""}catch(e){}
want=${JSON.stringify(o.fallback)};var Z=${JSON.stringify(o.zones)};for(var i=0;i<Z.length;i++)if(new RegExp(Z[i][1]).test(z)){want=Z[i][0];break}}
if(want===page)return;
var from=null;try{from=sessionStorage.getItem("geo-from")}catch(e){}
if(from===p)return;
var H=${JSON.stringify(o.hreflang)};
d.setAttribute("data-geo","pending");
var done=function(){d.removeAttribute("data-geo")};
setTimeout(done,1500);
var go=function(){var l=document.querySelector('link[rel="alternate"][hreflang="'+H[want]+'"]');
if(l&&l.href){var u=new URL(l.href,location.href);if(u.pathname!==p){try{sessionStorage.setItem("geo-from",u.pathname)}catch(e){}location.replace(u.pathname+location.search+location.hash);return}}
d.setAttribute("data-geo-miss",want);done()};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",go);else go();
}catch(e){}})();`;
}
