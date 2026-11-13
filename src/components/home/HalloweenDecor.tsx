import { seasonMarkupLive } from "@/lib/season";

// Halloween set dressing for the landing hero (owner, 2026-10-24, after RiftCompare's): cobwebs in the top corners, candlelit
// jack-o'-lanterns in the bottom ones and a few bats crossing the sky. Pure decoration, aria-hidden, behind the hero's content
// (which sits above it), never over a control. In the HTML only around the season (seasonMarkupLive, a day of slack for the CDN
// copy) and shown only while <html> carries data-season="halloween" (lib/season.ts, globals.css .mc-decor), so it goes at the
// visitor's own midnight on 1 November with no deploy. Reduced motion: the bats stay home and nothing flickers.
// Not placed on the page since 2026-11-13 (the minimal look: the hero is words, the search and six ways in); the dressing and its
// CSS (.mc-*) stay for next October's decision.
export function HalloweenDecor() {
  if (!seasonMarkupLive("halloween")) return null;
  return (
    <div className="mc-decor" aria-hidden="true">
      <span className="mc-web mc-web-l" />
      <span className="mc-web mc-web-r" />
      <span className="mc-bat mc-bat-1" />
      <span className="mc-bat mc-bat-2" />
      <span className="mc-bat mc-bat-3" />
      <span className="mc-pumpkins mc-pumpkins-l">
        <span className="mc-pumpkin" />
        <span className="mc-pumpkin mc-pumpkin-sm" />
      </span>
      <span className="mc-pumpkins mc-pumpkins-r">
        <span className="mc-pumpkin mc-pumpkin-sm" />
        <span className="mc-pumpkin" />
      </span>
    </div>
  );
}
