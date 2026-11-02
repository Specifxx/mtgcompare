/**
 * The visitor's own region (owner, 2026-11-01: "the default region is the region that the visitor is located in, and if
 * they can't determine it, the default should be the US"), without moving anyone on a guess (2026-11-02: Search Console
 * read regional copies as duplicates of the home region's, and Google's guidance is no automatic redirect on a guessed
 * location). An inline script, run before first paint on every page:
 *
 * - A visitor who PICKED a region (a click on any `[data-region-pick]` link, kept in localStorage) and opens a regional
 *   page of another region is sent to the same page in theirs, when the page lists it as an hreflang alternate. Until
 *   DOMContentLoaded `<main>` is hidden (html[data-geo="pending"], at most 1.5 s).
 * - A visitor who never picked stays on the URL they opened; when their time zone's region (else the US) has a copy of
 *   the page, one line at the top offers it ("Switch to <region> prices", or "Stay", which remembers this region).
 * - Crawlers, link previews and audit tools are never moved and never see the line. A page of no region is left alone.
 *
 * No request, no cookie: one CDN copy per page for everyone.
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

/** How the offer names a region's prices: "Switch to Australian prices". */
export const REGION_PRICE_NAMES: Record<string, string> = { us: "US", uk: "UK", au: "Australian", nz: "NZ", ca: "Canadian", sg: "Singapore", eu: "EU" };

export function regionBootScript(o: RegionBootOptions): string {
  const codes = Object.keys(o.hreflang);
  const names = Object.fromEntries(codes.map((c) => [c, REGION_PRICE_NAMES[c] ?? c.toUpperCase()]));
  return `(function(){try{
var d=document.documentElement,K=${JSON.stringify(o.key)},C=${JSON.stringify(codes)};
document.addEventListener("click",function(e){var t=e.target,a=t&&t.closest&&t.closest("[data-region-pick]");if(a)try{localStorage.setItem(K,a.getAttribute("data-region-pick"))}catch(x){}},true);
if(new RegExp(${JSON.stringify(BOT_UA_SOURCE)},"i").test(navigator.userAgent||""))return;
var p=location.pathname,s=p.split("/")[1]||"",page=(${o.pageRegion});
if(!page)return;
var want=null;try{want=localStorage.getItem(K)}catch(e){}
var picked=C.indexOf(want)>=0;
if(!picked){var z="";try{z=Intl.DateTimeFormat().resolvedOptions().timeZone||""}catch(e){}
want=${JSON.stringify(o.fallback)};var Z=${JSON.stringify(o.zones)};for(var i=0;i<Z.length;i++)if(new RegExp(Z[i][1]).test(z)){want=Z[i][0];break}}
if(want===page)return;
var H=${JSON.stringify(o.hreflang)},N=${JSON.stringify(names)};
var alt=function(){var l=document.querySelector('link[rel="alternate"][hreflang="'+H[want]+'"]');if(!l||!l.href)return null;var u=new URL(l.href,location.href);return u.pathname!==p?u.pathname:null};
if(!picked){var offer=function(){try{var to=alt();if(!to||!document.body||document.getElementById("region-offer"))return;
var b=document.createElement("div");b.id="region-offer";b.setAttribute("role","region");b.setAttribute("aria-label","Region");
b.style.cssText="display:flex;flex-wrap:wrap;gap:4px 16px;justify-content:center;align-items:center;padding:8px 16px;font-size:14px;line-height:1.4;background:rgba(127,127,127,.12);border-bottom:1px solid rgba(127,127,127,.25)";
var t=document.createElement("span");t.textContent="This page shows "+N[page]+" prices.";
var a=document.createElement("a");a.href=to+location.search+location.hash;a.setAttribute("data-region-pick",want);a.textContent="Switch to "+N[want]+" prices";a.style.cssText="font-weight:600;text-decoration:underline";
var k=document.createElement("button");k.type="button";k.textContent="Stay";k.style.cssText="background:none;border:0;padding:0;font:inherit;color:inherit;opacity:.7;cursor:pointer;text-decoration:underline";
k.onclick=function(){try{localStorage.setItem(K,page)}catch(x){}b.remove()};
b.appendChild(t);b.appendChild(a);b.appendChild(k);document.body.insertBefore(b,document.body.firstChild)}catch(x){}};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",offer);else offer();return}
var from=null;try{from=sessionStorage.getItem("geo-from")}catch(e){}
if(from===p)return;
d.setAttribute("data-geo","pending");
var done=function(){d.removeAttribute("data-geo")};
setTimeout(done,1500);
var go=function(){var to=alt();
if(to){try{sessionStorage.setItem("geo-from",to)}catch(e){}location.replace(to+location.search+location.hash);return}
d.setAttribute("data-geo-miss",want);done()};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",go);else go();
}catch(e){}})();`;
}
