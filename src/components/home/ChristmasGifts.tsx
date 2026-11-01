import Link from "@/components/Link";
import { seasonMarkupLive } from "@/lib/season";
import { X_DEFAULT_REGION } from "@/lib/regions";

// Christmas (until Boxing Day): one festive line in the hero that sends gift
// shoppers to the sealed prices. In the HTML only around the season, shown
// only while <html> carries data-season="christmas" (globals.css .xmas-pill-row).
export function ChristmasGifts() {
  if (!seasonMarkupLive("christmas")) return null;
  return (
    <div className="xmas-pill-row mb-3 justify-center sm:mb-4">
      <Link href={`/${X_DEFAULT_REGION}/sealed`} className="xmas-pill">
        <span className="xmas-pill-icon" aria-hidden="true" />
        <b>Christmas gifts</b>
        <span className="xmas-pill-more hidden sm:inline">· booster boxes, bundles and Commander decks, cheapest first →</span>
      </Link>
    </div>
  );
}
