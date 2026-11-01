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
export const SEASON_BOOT_SCRIPT = `(function(){try{var W=${JSON.stringify(WINDOWS)},i,q=(location.search.match(/[?&]season=([a-z]+)/)||[])[1];var s=null;if(q){for(i=0;i<W.length;i++)if(W[i][0]===q)s=q}else{var d=new Date(),v=(d.getMonth()+1)*100+d.getDate();for(i=0;i<W.length;i++)if(v>=W[i][1]&&v<=W[i][2])s=W[i][0]}if(s)document.documentElement.setAttribute("data-season",s)}catch(e){}})();`;
