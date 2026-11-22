"use client";

import { useEffect, useState } from "react";

// The public half of a giveaway page: the winner's trophy once drawn, the counts and the top 100 by points (owner, 2026-11-19
// and 2026-11-22). Reads the CDN-held RiftCompare leaderboard (?site=), so it works on the sister sites too (a copy in each repo).
type Winner = {
  name: string;
  country: string | null;
  ticket: number;
  totalTickets: number;
  entrants: number;
  drandRound: number;
  randomness: string;
  attempt: number;
  status: string;
  drawnAt: string;
};
type Board = { entrants: number; points: number; top: { name: string; points: number }[]; winner: Winner | null; state?: string };

const fmt = (n: number) => n.toLocaleString("en-AU");
const MEDAL = ["🥇", "🥈", "🥉"];

export function useGiveawayBoard(url: string) {
  const [b, setB] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(url)
      .then((r) => r.json())
      .then(setB)
      .catch(() => setFailed(true));
  }, [url]);
  return { b, failed };
}

export function GiveawayWinner({ w, prize }: { w: Winner; prize: string }) {
  const when = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(w.drawnAt));
  return (
    <section className="gw-trophy relative overflow-hidden rounded-2xl border border-spark/60 p-5 text-center sm:p-7" aria-label="Winner">
      <div className="text-5xl" aria-hidden="true">
        🏆
      </div>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand-strong">We have a winner{w.attempt > 0 ? " (redraw)" : ""}</p>
      <p className="mt-1 text-3xl font-extrabold">{w.name}</p>
      {w.country && <p className="text-sm opacity-80">{w.country}</p>}
      <p className="mt-3 text-sm opacity-90">
        Winning ticket <b className="text-brand-strong">#{fmt(w.ticket)}</b> of {fmt(w.totalTickets)} · {fmt(w.entrants)} entrants · drawn {when}
      </p>
      <p className="mt-1 text-sm opacity-80">Prize: {prize}</p>
      <p className="mt-1 text-sm opacity-80">
        {w.status === "shipped" ? "✓ Posted to the winner." : w.status === "claimed" ? "✓ Claimed: on its way soon." : "We've emailed the winner to claim it."}
      </p>
      <details className="mx-auto mt-3 max-w-lg text-left text-xs opacity-80">
        <summary className="cursor-pointer text-center underline">Check the draw yourself</summary>
        <p className="mt-2 leading-relaxed">
          Every point was one numbered ticket, in the order people entered. The random number is drand round{" "}
          <a className="underline" href={`https://api.drand.sh/public/${w.drandRound}`} rel="nofollow noopener" target="_blank">
            {w.drandRound}
          </a>{" "}
          (the League of Entropy&apos;s public beacon, published after entries closed, so nobody could know it in advance). Its randomness{" "}
          <code className="break-all">{w.randomness}</code>
          {w.attempt === 0 ? (
            <>, read as a number, modulo {fmt(w.totalTickets)}, plus 1, is {fmt(w.ticket)}.</>
          ) : (
            <>: for redraw {w.attempt}, SHA-256 of &quot;randomness:{w.attempt}&quot;, read as a number, modulo the {fmt(w.totalTickets)} tickets left, plus 1.</>
          )}
        </p>
      </details>
    </section>
  );
}

export function GiveawayBoard({ url, prize }: { url: string; prize: string }) {
  const { b, failed } = useGiveawayBoard(url);
  if (failed) return <p className="mt-3 text-sm opacity-70">The leaderboard didn&apos;t load. Try again later.</p>;
  if (!b) return <div className="mt-3 min-h-[160px] rounded-2xl border border-line" aria-busy="true" />;
  return (
    <div className="mt-3 space-y-5">
      {b.winner && <GiveawayWinner w={b.winner} prize={prize} />}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line p-3">
          <p className="text-2xl font-extrabold tabular-nums">{fmt(b.entrants)}</p>
          <p className="text-xs uppercase tracking-wide opacity-70">entrants</p>
        </div>
        <div className="rounded-xl border border-line p-3">
          <p className="text-2xl font-extrabold tabular-nums">{fmt(b.points)}</p>
          <p className="text-xs uppercase tracking-wide opacity-70">tickets in the draw</p>
        </div>
      </div>
      {b.top.length === 0 ? (
        <p className="text-sm">No entries yet. Be the first.</p>
      ) : (
        <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line text-sm">
          {b.top.map((r, i) => (
            <li key={i} className={`flex items-center justify-between gap-3 px-3 py-2 ${i < 3 ? "bg-spark/10" : ""}`}>
              <span className="truncate">
                <span className="mr-2 inline-block w-7 text-right opacity-70">{MEDAL[i] ?? `${i + 1}.`}</span>
                {r.name}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">
                {fmt(r.points)} pts
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs opacity-60">Updated every few hours. First name and last initial only; hide yours from your entry box.</p>
    </div>
  );
}
