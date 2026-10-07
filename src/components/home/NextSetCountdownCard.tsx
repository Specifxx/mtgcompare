import Link from "next/link";

// RiftCompare's NextSetCountdownCard: one centred line under "Explore the
// database" — "<Set> is coming · N days to go — Full release details →".
// Nothing renders once the set is out (Explore's "New" chip covers it then)
// or when nothing upcoming is listed.
export function NextSetCountdownCard({ set, now }: { set: { name: string; code: string; slug: string; releasedOn: string | null } | null | undefined; now: number }) {
  if (!set) return null;
  const releaseMs = set.releasedOn ? Date.parse(`${set.releasedOn}T00:00:00Z`) : NaN;
  const hasDate = !Number.isNaN(releaseMs);
  const days = hasDate ? Math.max(0, Math.ceil((releaseMs - now) / 86_400_000)) : null;
  if (days === 0) return null;
  return (
    <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-slate-400">
      <span className="chip bg-brand-500/15 text-[11px] font-bold uppercase tracking-wider text-brand-300">{set.name} is coming</span>
      <span>
        {hasDate ? (
          <>
            <span className="num font-bold text-white">{days}</span> {days === 1 ? "day" : "days"} to go —{" "}
          </>
        ) : (
          "Release window not yet announced. "
        )}
        <Link href="/release-dates" className="tap-link font-semibold text-brand-300 underline-offset-2 hover:underline">
          Full release details →
        </Link>
      </span>
      <Link href={`/sets/${set.slug}`} className="tap-link font-semibold text-brand-300 underline-offset-2 hover:underline">
        Every {set.code} card listed so far →
      </Link>
    </p>
  );
}
