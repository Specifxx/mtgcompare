"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface UsingDeck { slug: string; title: string; commanderName: string }

// "Decks using this card" on the card page: up to six live published decks that play this printing. The list lives in Neon, which a public render never
// wakes, so it loads here in the browser from GET /api/decks?card=<id> (cached at the CDN, REQ-WP11-1) and is skipped for crawlers, which never run it.
// Nothing at all while loading, when no deck plays the card, or when the read fails.
export function DecksUsingCard({ cardId, className = "mt-10" }: { cardId: number; className?: string }) {
  const [decks, setDecks] = useState<UsingDeck[]>([]);
  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/decks?card=${cardId}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { decks?: UsingDeck[] } | null) => setDecks(Array.isArray(j?.decks) ? j.decks.slice(0, 6) : []))
      .catch(() => setDecks([]));
    return () => ctl.abort();
  }, [cardId]);
  if (!decks.length) return null;
  return (
    <section className={className} aria-labelledby="decks-using-h">
      <h2 id="decks-using-h" className="text-xl font-extrabold text-white">
        Decks using this card
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {decks.map((d) => (
          <li key={d.slug}>
            <Link href={`/decks/${d.slug}`} className="card-surface block p-3 transition-colors hover:border-brand-500/60">
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{d.commanderName}</span>
              <span className="block font-semibold text-white">{d.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        <Link href="/decks" className="text-brand-400 hover:underline">
          Every published deck →
        </Link>
      </p>
    </section>
  );
}
