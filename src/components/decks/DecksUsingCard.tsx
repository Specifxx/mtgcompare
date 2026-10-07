import Link from "next/link";
import { getDecksUsingCard } from "@/lib/data";

// "Decks using this card" on the card page (RiftCompare's decksUsingCard
// block): up to six live published decks that play this printing, from the
// cached library loader. Nothing at all when none do, or when the read fails.
export async function DecksUsingCard({ cardId, className = "mt-10" }: { cardId: number; className?: string }) {
  const decks = await getDecksUsingCard(cardId).catch(() => []);
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
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{d.leaderName}</span>
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
