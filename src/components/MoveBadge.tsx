import type { Movement } from "@/lib/demand-movement";

// Billboard-style chart movement beside a rank (RiftCompare's MoveBadge): ▲
// climbed, ▼ fell, = held, NEW had no place on the previous chart. Shared by
// /admin/demand, Demand Finder, Rising Cards (public and admin) and the frozen
// Hot 40 pages, so a symbol means the same thing everywhere. `newTitle` says
// what "NEW" means on THIS chart.
export function MoveBadge({ move, newTitle }: { move: Movement | null | undefined; newTitle: string }) {
  if (!move) return null;
  if (move.kind === "new") {
    return (
      <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-300" title={newTitle}>
        NEW
      </span>
    );
  }
  if (move.kind === "same") {
    return (
      <span className="text-xs text-slate-500" title={`Held #${move.prev}`}>
        =
      </span>
    );
  }
  const up = move.kind === "up";
  return (
    <span
      className={`whitespace-nowrap text-xs font-semibold tabular-nums ${up ? "text-emerald-400" : "text-rose-400"}`}
      title={`${up ? "Up" : "Down"} ${move.by} from #${move.prev}`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      <span className="sr-only">{up ? "Up" : "Down"}</span> {move.by}
    </span>
  );
}
