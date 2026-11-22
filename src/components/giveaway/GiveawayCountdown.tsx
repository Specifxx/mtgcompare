"use client";

import { useEffect, useState } from "react";

// "Closes in 22d 04h 13m": the giveaway's close, ticking each minute. Browser-only (the static page shows the date until it mounts).
export function GiveawayCountdown({ closesAt, fallback }: { closesAt: string; fallback: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span>{fallback}</span>;
  const left = Date.parse(closesAt) - now;
  if (left <= 0) return <span>Entries closed</span>;
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const cell = (v: number, u: string) => (
    <span className="inline-flex min-w-[3.2rem] flex-col items-center rounded-lg bg-raised px-2 py-1">
      <b className="text-xl tabular-nums leading-tight">{String(v).padStart(2, "0")}</b>
      <span className="text-[10px] uppercase tracking-wide opacity-70">{u}</span>
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`Closes in ${d} days ${h} hours ${m} minutes`}>
      {cell(d, "days")}
      {cell(h, "hours")}
      {cell(m, "mins")}
    </span>
  );
}
