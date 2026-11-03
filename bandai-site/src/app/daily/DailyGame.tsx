"use client";
// The daily Price Duel's board (lib/daily.ts). Progress and the streak live in
// this browser's localStorage only; nothing is sent anywhere but two Vercel
// events: daily_done { score } and share { medium: "daily" }.
import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import Link from "@/components/Link";
import { money } from "@/lib/format";
import { imageAt } from "@/lib/image";
import { SITE_URL } from "@/lib/site";
import { shareUrl } from "@/lib/share";
import { dayKey, isRight, nextStreak, puzzleFor, shareResult, type DailyPuzzle } from "@/lib/daily";

type Pick = 0 | 1;
const KEY = "daily-duel";

function load<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function save(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

export function DailyGame({ puzzles, game }: { puzzles: DailyPuzzle[]; game: string }) {
  const [p, setP] = useState<DailyPuzzle | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [streak, setStreak] = useState(0);
  const [note, setNote] = useState("");

  useEffect(() => {
    const today = puzzleFor(puzzles, dayKey(new Date()));
    setP(today);
    if (!today) return;
    const saved = load<Pick[]>(`${KEY}:${today.n}`) ?? [];
    setPicks(saved);
    setRevealed(false);
    setStreak(load<{ last: number; count: number }>(`${KEY}:streak`)?.count ?? 0);
  }, [puzzles]);

  if (!p) return <div className="mt-6 h-72 animate-pulse rounded-xl bg-ink-900" />;
  const total = p.rounds.length;
  const marks = picks.map((k, i) => isRight(p.rounds[i], k));
  const done = picks.length >= total;
  const i = revealed ? picks.length - 1 : picks.length;
  const round = p.rounds[Math.min(i, total - 1)];

  function choose(k: Pick) {
    if (!p || revealed || done) return;
    const next = [...picks, k];
    setPicks(next);
    setRevealed(true);
    save(`${KEY}:${p.n}`, next);
    if (next.length === total) {
      const s = nextStreak(load(`${KEY}:streak`), p.n);
      save(`${KEY}:streak`, s);
      setStreak(s.count);
      try {
        track("daily_done", { score: next.filter((x, j) => isRight(p.rounds[j], x)).length });
      } catch {}
    }
  }

  async function share() {
    if (!p) return;
    const text = shareResult(game, p.n, marks, streak, shareUrl(SITE_URL, "/daily", "daily"));
    try {
      track("share", { medium: "daily" });
    } catch {}
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setNote("Copied: paste it anywhere");
    } catch {
      setNote("Couldn’t copy");
    }
    setTimeout(() => setNote(""), 2500);
  }

  const grid = (
    <p className="font-mono text-lg tracking-widest" aria-label={`${marks.filter(Boolean).length} of ${marks.length} right`}>
      {p.rounds.map((_, j) => (j < marks.length ? (marks[j] ? "🟩" : "🟥") : "⬜")).join("")}
    </p>
  );

  if (done && !revealed) {
    const score = marks.filter(Boolean).length;
    return (
      <div className="mt-6 space-y-5">
        <div className="card-surface p-5 text-center">
          <p className="text-xs uppercase text-muted">Puzzle #{p.n}</p>
          <p className="mt-1 text-4xl font-black">{score}/{total}</p>
          <div className="mt-2">{grid}</div>
          {streak > 1 && <p className="mt-1 text-sm font-semibold">🔥 {streak} day streak</p>}
          <div className="relative mt-4 inline-flex">
            <button type="button" onClick={share} className="btn-primary">Share your score</button>
            <span role="status" aria-live="polite" className={`pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-fg px-2.5 py-1 text-xs font-semibold text-ink-950 transition-opacity ${note ? "opacity-100" : "opacity-0"}`}>{note}</span>
          </div>
          <p className="mt-3 text-sm text-muted">A new puzzle at midnight UTC.</p>
        </div>
        <div>
          <h2 className="text-lg font-bold">Today&apos;s cards</h2>
          <ul className="mt-2 divide-y divide-ink-800 text-sm">
            {p.rounds.flat().sort((a, b) => b.cents - a.cents).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <Link className="hover:underline" href={`/card/${c.slug}`}>{c.name} <span className="text-muted">· {c.set}</span></Link>
                <span className="shrink-0 font-semibold">{money(c.cents)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">TCGplayer US market price when the puzzle was built. Tap a card for every store&apos;s price.</p>
        </div>
      </div>
    );
  }

  const last = revealed ? picks[picks.length - 1] : null;
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-1 text-sm text-muted">
        <span>Puzzle #{p.n} · round {i + 1} of {total}</span>
        {grid}
      </div>
      <p className="mt-3 text-center text-lg font-bold">Which is worth more?</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-5">
        {round.map((c, k) => {
          const win = revealed && c.cents > round[1 - k].cents;
          const picked = last === k;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => choose(k as Pick)}
              disabled={revealed}
              className={`card-surface flex flex-col items-center p-3 text-center transition ${revealed ? (win ? "ring-2 ring-up" : "opacity-70") : "hover:border-brand"} ${picked && !win ? "ring-2 ring-down" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageAt(c.image) ?? ""} alt={c.name} loading="eager" className="aspect-[5/7] w-full max-w-[220px] rounded-lg object-contain" />
              <span className="mt-2 line-clamp-2 text-sm font-semibold">{c.name}</span>
              <span className="text-xs text-muted">{c.set}</span>
              <span className={`mt-1 text-xl font-black ${revealed ? "" : "invisible"}`}>{money(c.cents)}</span>
            </button>
          );
        })}
      </div>
      {revealed && (
        <div className="mt-4 text-center">
          <p className="font-semibold">{last != null && isRight(round, last) ? "Right!" : "Not this time."}</p>
          <button type="button" className="btn-primary mt-2" onClick={() => setRevealed(false)}>
            {picks.length >= total ? "See your score" : "Next pair"}
          </button>
        </div>
      )}
    </div>
  );
}
