import Link from "@/components/Link";
import { saleStrip } from "@/lib/black-friday";
import { REGIONS, type Region } from "@/lib/regions";
import { sectionHref } from "@/lib/site";

// One line under the header on every region page from 1 November to the day after Cyber Monday, linking that region's Black
// Friday page, then its Cyber Monday page (lib/black-friday.ts saleStrip; DECISIONS.md, "Black Friday strip", 2026-11-07). A plain
// link in the server HTML: never a pop-up, a countdown or an urgency claim (BANNED_COPY).
export function HolidayStrip({ region, today = new Date().toISOString().slice(0, 10) }: { region: Region; today?: string }) {
  const s = saleStrip(today);
  if (!s) return null;
  const r = REGIONS[region];
  return (
    <div className="border-b border-line bg-brand-soft" data-holiday-strip={s.key}>
      <p className="page truncate py-1.5 text-center text-xs sm:text-sm">
        <Link href={sectionHref(region, s.key)} prefetch={false} className="hover:text-ink">
          <b>{s.name} MTG deals in {r.inName}</b><span className="hidden sm:inline"> · sealed under the median store price today</span> · <span className="font-semibold text-brand-strong">see the deals →</span>
        </Link>
      </p>
    </div>
  );
}
