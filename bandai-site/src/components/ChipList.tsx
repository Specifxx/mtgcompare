import Link from "@/components/Link";

export interface Chip { key: string | number; href: string; label: string }

/** A row of link chips that shows the first `limit` and folds the rest behind "Show N more", so a
 *  game with hundreds of sets or dozens of rarities doesn't bury the page (no JS needed). */
export function ChipList({ items, limit = 12, more = "more" }: { items: Chip[]; limit?: number; more?: string }) {
  const chip = (c: Chip) => <Link key={c.key} href={c.href} className="chip hover:border-brand">{c.label}</Link>;
  const rest = items.slice(limit);
  return (
    <div>
      <div className="flex flex-wrap gap-2">{items.slice(0, limit).map(chip)}</div>
      {rest.length > 0 && (
        <details className="group mt-2">
          <summary className="cursor-pointer text-sm text-brand hover:underline group-open:mb-2">
            <span className="group-open:hidden">Show {rest.length} {more}</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <div className="flex flex-wrap gap-2">{rest.map(chip)}</div>
        </details>
      )}
    </div>
  );
}
