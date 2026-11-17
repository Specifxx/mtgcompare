// Seasonal themes, ported from RiftCompare (Specifxx/TCGEmpire, 2026-10-16) at the
// owner's request (2026-10-24: Halloween-themed like RiftCompare, reverting by
// itself after Halloween). A season is a date window in the VISITOR's local
// time; inside it, SEASON_BOOT_SCRIPT stamps `data-season` on <html> before
// first paint, and globals.css and the landing hero
// (HalloweenDecor, InnistradComing) dress the site from that attribute.
//
// Why the client decides, not the server: every page is kept by the CDN for six to
// 24 hours, so a server-side date check would switch the theme on and off up
// to a day late. The attribute flips at the visitor's own midnight. The server
// only decides whether to include season-only MARKUP at all
// (`seasonMarkupLive`), with a day of slack either side so the cached HTML
// always has it while the attribute could be on; CSS hides it otherwise.
//
// Preview / test override: `?season=halloween` turns it on for that page load,
// `?season=off` turns it off, whatever the date.

// Christmas (owner, 2026-11-01: "now that it's November, we want to make all of
// the sites Christmas themed"): 1 November to Boxing Day. To switch it off
// early, set its `to` to yesterday's date (or delete the entry): no other file
// decides it. `?season=christmas` previews it, `?season=off` hides any season.
export type Season = "halloween" | "christmas";

/** Inclusive month/day window, in the visitor's local time. Month is 1-12. */
export const SEASONS: Record<Season, { from: [number, number]; to: [number, number] }> = {
  // Through Halloween night; gone on 1 November.
  halloween: { from: [10, 16], to: [10, 31] },
  // From 1 November through Boxing Day; gone on 27 December.
  christmas: { from: [11, 1], to: [12, 26] },
};

function md(d: Date): number {
  return (d.getMonth() + 1) * 100 + d.getDate();
}

export function seasonAt(d: Date): Season | null {
  const v = md(d);
  for (const [name, w] of Object.entries(SEASONS) as [Season, (typeof SEASONS)[Season]][]) {
    if (v >= w.from[0] * 100 + w.from[1] && v <= w.to[0] * 100 + w.to[1]) return name;
  }
  return null;
}

/** Server-side: include season-only markup? A day of slack either side of the
 *  window, so a page cached just before the start (or rendered in a timezone a
 *  day behind the visitor's) still carries it. */
export function seasonMarkupLive(season: Season, now: Date = new Date()): boolean {
  const day = 86_400_000;
  return [now, new Date(now.getTime() - day), new Date(now.getTime() + day)].some((d) => seasonAt(d) === season);
}

// Inline, dependency-free, never throws. Kept in step with seasonAt() by
// tests/season.test.ts, which runs it in a VM against the same dates.
const WINDOWS = (Object.entries(SEASONS) as [Season, (typeof SEASONS)[Season]][]).map(([n, w]) => [
  n,
  w.from[0] * 100 + w.from[1],
  w.to[0] * 100 + w.to[1],
]);
// EVENTS (UI/UX squad, 2026-11-16): a short event layer on top of the season, stamped as `data-event` (the season keeps
// `data-season`, so the Christmas gift guide stays through Black Friday). Today one event: "blackfriday", the week up to
// Black Friday through Cyber Monday (the day after US Thanksgiving, minus 7 days to plus 3). CSS keys on
// :root[data-event="blackfriday"] to swap the hairline's cranberry and pine for ONE amber. Windows are computed here for each
// year and embedded as YYYYMMDD numbers, so the boot script needs no date maths. `?event=blackfriday` previews, `?event=off` hides.
export type SiteEvent = "blackfriday";

function ymd(y: number, m: number, d: number): number {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
}

/** Black Friday week for a year: [first day, last day] as YYYYMMDD. */
export function blackFridayWindow(year: number): [number, number] {
  const first = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const bf = 23 + ((4 - first + 7) % 7);
  return [ymd(year, 11, bf - 7), ymd(year, 11, bf + 3)];
}

export function eventAt(d: Date): SiteEvent | null {
  const v = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const [a, b] = blackFridayWindow(d.getFullYear());
  return v >= a && v <= b ? "blackfriday" : null;
}

const EVENT_WINDOWS: [string, number, number][] = [];
for (let y = 2026; y <= 2032; y++) EVENT_WINDOWS.push(["blackfriday", ...blackFridayWindow(y)]);

export const SEASON_BOOT_SCRIPT = `(function(){try{var W=${JSON.stringify(WINDOWS)},E=${JSON.stringify(EVENT_WINDOWS)},i,q=(location.search.match(/[?&]season=([a-z]+)/)||[])[1],x=(location.search.match(/[?&]event=([a-z]+)/)||[])[1];var s=null,ev=null;if(q){for(i=0;i<W.length;i++)if(W[i][0]===q)s=q}else{var d=new Date(),v=(d.getMonth()+1)*100+d.getDate();for(i=0;i<W.length;i++)if(v>=W[i][1]&&v<=W[i][2])s=W[i][0]}if(x){for(i=0;i<E.length;i++)if(E[i][0]===x)ev=x}else{var n=d||new Date(),y=n.getFullYear()*10000+(n.getMonth()+1)*100+n.getDate();for(i=0;i<E.length;i++)if(y>=E[i][1]&&y<=E[i][2])ev=E[i][0]}var r=document.documentElement;if(s)r.setAttribute("data-season",s);if(ev)r.setAttribute("data-event",ev)}catch(e){}})();`;

// The festive layer (owner, 2026-11-12: "more festive again", after the 8 November tone-down): a gift-guide card on the home page
// (ChristmasGifts), a 3px cranberry-and-pine hairline at the top of every page and the same two colours on the gifts pill and the
// Black Friday strip, all CSS keyed on data-season="christmas" plus data-festive (layout.tsx). THE ONE OFF SWITCH: set this to
// false after New Year (or simply let the window above end on 26 December, when data-season goes) and the card markup, the
// hairline and the accents all go; the quiet gifts pill of 8 November stays. Never snow, lights, hats, stripes or a palette swap.
export const CHRISTMAS_FESTIVE_LAYER = true;
