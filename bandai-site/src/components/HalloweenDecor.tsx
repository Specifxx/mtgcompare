import { SITE } from "@/site.config";
import { seasonMarkupLive } from "@/lib/season";

// Season-only markup. Rendered while the window could be on somewhere; shown
// only when the boot script stamped data-season (globals.css .season-only).
export function HalloweenBanner() {
  if (!seasonMarkupLive("halloween")) return null;
  return (
    <div className="season-only relative overflow-hidden rounded-xl border border-orange-500/40 bg-gradient-to-r from-purple-950/80 to-orange-950/60 p-4" role="note">
      <svg className="bat" style={{ top: 8 }} viewBox="0 0 28 14" aria-hidden><path d="M14 4c-1-3-3-4-6-4 1 2 0 3-2 3-2 0-4-1-6-3 1 5 4 9 8 9 2 0 4-1 6-3 2 2 4 3 6 3 4 0 7-4 8-9-2 2-4 3-6 3-2 0-3-1-2-3-3 0-5 1-6 4z" fill="#000" /></svg>
      <svg className="bat" style={{ top: 30, animationDelay: "-6s" }} viewBox="0 0 28 14" aria-hidden><path d="M14 4c-1-3-3-4-6-4 1 2 0 3-2 3-2 0-4-1-6-3 1 5 4 9 8 9 2 0 4-1 6-3 2 2 4 3 6 3 4 0 7-4 8-9-2 2-4 3-6 3-2 0-3-1-2-3-3 0-5 1-6 4z" fill="#000" /></svg>
      <p className="font-display text-lg font-bold text-orange-300">🎃 {SITE.halloween.headline}</p>
      <p className="text-sm text-orange-100/80">{SITE.halloween.blurb}</p>
    </div>
  );
}
