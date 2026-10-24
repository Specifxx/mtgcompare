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

export type Season = "halloween";

/** Inclusive month/day window, in the visitor's local time. Month is 1-12. */
export const SEASONS: Record<Season, { from: [number, number]; to: [number, number] }> = {
  // Through Halloween night; gone on 1 November.
  halloween: { from: [10, 16], to: [10, 31] },
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
export const SEASON_BOOT_SCRIPT = `(function(){try{var q=(location.search.match(/[?&]season=([a-z]+)/)||[])[1];var s=null;if(q){s=q==="halloween"?"halloween":null}else{var d=new Date(),v=(d.getMonth()+1)*100+d.getDate();if(v>=${SEASONS.halloween.from[0] * 100 + SEASONS.halloween.from[1]}&&v<=${SEASONS.halloween.to[0] * 100 + SEASONS.halloween.to[1]})s="halloween"}if(s)document.documentElement.setAttribute("data-season",s)}catch(e){}})();`;
