import Link from "@/components/Link";
import { seasonMarkupLive } from "@/lib/season";
import { X_DEFAULT_REGION } from "@/lib/regions";

// Halloween (until 31 October): an Innistrad-flavoured line above the landing hero's eyebrow, to the store search for
// Innistrad sealed product (the plain GET search the hero's own form uses; no new data read). Its own component so the whole
// season comes out by deleting it and its call. Same gating as HalloweenDecor: in the HTML around the season, shown only while
// <html> carries data-season="halloween" (globals.css .mc-moon).
export function InnistradComing() {
  if (!seasonMarkupLive("halloween")) return null;
  return (
    <div className="mb-4 flex justify-center">
      <Link href={`/${X_DEFAULT_REGION}/sealed?q=innistrad`} className="mc-moon">
        <span className="mc-eyes" aria-hidden="true">
          <i />
          <i />
        </span>
        <b>Night falls on Innistrad</b>
        <span className="hidden sm:inline">· find its sealed product before the moon turns →</span>
      </Link>
    </div>
  );
}
