"use client";
import { useEffect, useRef, useState } from "react";
import { cardImage, cardPath, usd } from "@/lib/format";

interface Hit { game: string; set: string; s: string; n: string; no: string; v: number; id: number }

// The header search: a plain GET form to /search (works without scripts), with suggestions after a pause in typing.
export function SearchBox({ game }: { game?: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term.toLowerCase())}${game ? `&game=${game}` : ""}`);
        const j = (await r.json()) as { hits: Hit[] };
        if (mine === seq.current) setHits(j.hits.slice(0, 6));
      } catch {
        // Suggestions are a convenience: the form still submits.
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, game]);
  return (
    <form className="search" action="/search" method="get" role="search" onBlur={() => setTimeout(() => setOpen(false), 150)}>
      <input name="q" type="search" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Card name, set or number" aria-label="Search cards" autoComplete="off" enterKeyHint="search" />
      {game ? <input type="hidden" name="game" value={game} /> : null}
      {open && hits.length > 0 && (
        <ul className="sug">
          {hits.map((h) => (
            <li key={`${h.game}-${h.id}`}>
              <a href={cardPath(h.game, h.set, h.s)}>
                <img src={cardImage(h.id)} alt="" width={30} height={42} loading="lazy" />
                <span>
                  {h.n} <span className="m">{h.no ? `#${h.no}` : ""} {h.v ? usd(h.v) : ""}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
