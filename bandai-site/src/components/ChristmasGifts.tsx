import Link from "@/components/Link";
import { SITE } from "@/site.config";
import { seasonMarkupLive } from "@/lib/season";

// Christmas (until Boxing Day): one festive line at the top of the hero, in
// each game's own words (SITE.christmas), to the sealed prices. In the HTML
// only around the season, shown only while <html> carries
// data-season="christmas" (globals.css .xmas-pill-row).
export function ChristmasGifts() {
  if (!seasonMarkupLive("christmas")) return null;
  return (
    <div className="xmas-pill-row mb-4">
      <Link href="/sealed" className="xmas-pill">
        <span className="xmas-pill-icon" aria-hidden="true" />
        <b>{SITE.christmas.headline}</b>
        <span className="xmas-pill-more hidden sm:inline">· {SITE.christmas.blurb} →</span>
      </Link>
    </div>
  );
}
