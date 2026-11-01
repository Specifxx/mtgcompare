import { seasonMarkupLive } from "@/lib/season";

// Christmas set dressing for the hero (owner, 2026-11-01: "Christmas trees,
// maybe like a Santa hat … stockings … candy canes"): falling snow, a strand of
// twinkling lights along the top, a tree and a present in the bottom-left
// corner, a candy cane and a small tree in the bottom-right.
//
// Pure decoration: aria-hidden, pointer-events none, in the hero's background
// layer under the content. In the HTML only around the season
// (seasonMarkupLive), shown only while <html> carries data-season="christmas"
// (globals.css, "xmas-common"), so on 27 December it is gone with no deploy.
export function ChristmasDecor() {
  if (!seasonMarkupLive("christmas")) return null;
  return (
    <div className="xmas-only xmas-hero" aria-hidden="true">
      <span className="xmas-snow" />
      <span className="xmas-lights" />
      <span className="xmas-corner xmas-corner-l">
        <span className="xmas-art xmas-tree" />
        <span className="xmas-art xmas-gift" />
      </span>
      <span className="xmas-corner xmas-corner-r">
        <span className="xmas-art xmas-cane" />
        <span className="xmas-art xmas-tree xmas-tree-sm" />
      </span>
    </div>
  );
}
