// Seasonal theme, as on Rift Compare (src/lib/season.ts there, owner
// 2026-10-16). A season is a window in the VISITOR's local time; the inline
// SEASON_BOOT_SCRIPT stamps data-season on <html> before first paint, so the
// theme switches off at the visitor's own midnight on 31 October → 1 November
// even though pages are ISR-cached for six hours or more. The server only
// decides whether to include season-only markup (with a day of slack).
//
// Preview: ?season=halloween forces it on, ?season=off forces it off.

// Christmas (owner, 2026-11-01: "now that it's November, we want to make all of
// the sites Christmas themed"): 1 November to Boxing Day. To switch it off
// early, set its `to` to yesterday's date (or delete the entry): no other file
// decides it. `?season=christmas` previews it, `?season=off` hides any season.
export type Season = "halloween" | "christmas";

export const SEASONS: Record<Season, { from: [number, number]; to: [number, number] }> = {
  // Through Halloween night; gone on 1 November.
  halloween: { from: [10, 16], to: [10, 31] },
  // From 1 November through Boxing Day; gone on 27 December.
  christmas: { from: [11, 1], to: [12, 26] },
};

const md = (d: Date) => (d.getMonth() + 1) * 100 + d.getDate();

export function seasonAt(d: Date): Season | null {
  const v = md(d);
  for (const [name, w] of Object.entries(SEASONS) as [Season, (typeof SEASONS)[Season]][])
    if (v >= w.from[0] * 100 + w.from[1] && v <= w.to[0] * 100 + w.to[1]) return name;
  return null;
}

export function seasonMarkupLive(season: Season, now: Date = new Date()): boolean {
  const day = 86_400_000;
  return [now, new Date(now.getTime() - day), new Date(now.getTime() + day)].some((d) => seasonAt(d) === season);
}

const WINDOWS = (Object.entries(SEASONS) as [Season, (typeof SEASONS)[Season]][]).map(([n, w]) => [
  n,
  w.from[0] * 100 + w.from[1],
  w.to[0] * 100 + w.to[1],
]);
export const SEASON_BOOT_SCRIPT = `(function(){try{var W=${JSON.stringify(WINDOWS)},i,q=(location.search.match(/[?&]season=([a-z]+)/)||[])[1];var s=null;if(q){for(i=0;i<W.length;i++)if(W[i][0]===q)s=q}else{var d=new Date(),v=(d.getMonth()+1)*100+d.getDate();for(i=0;i<W.length;i++)if(v>=W[i][1]&&v<=W[i][2])s=W[i][0]}if(s)document.documentElement.setAttribute("data-season",s)}catch(e){}})();`;
