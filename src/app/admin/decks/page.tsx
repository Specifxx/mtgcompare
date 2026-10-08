import type { Metadata } from "next";
import Link from "next/link";
import { AdminDeckImport, AdminDeckToggle } from "@/components/admin/AdminDeckImport";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { adminDecks, type AdminDeckRow } from "@/lib/admin-decks";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "Decks" });

// Import tournament lists as JSON and hide or restore any published deck.

export default async function AdminDecksPage() {
  await requireAdminPage();
  const decks: AdminDeckRow[] = await adminDecks().catch(() => []);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-extrabold text-white">Published decks</h1>
      <AdminDeckImport />
      <section className="card-surface overflow-hidden">
        <h2 className="border-b border-ink-800 p-4 font-bold text-white">{decks.length} decks</h2>
        <ul className="divide-y divide-ink-800">
          {decks.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="min-w-0 flex-1">
                <Link href={`/decks/${d.slug}`} className="font-semibold text-white hover:underline">
                  {d.title}
                </Link>
                <span className="block text-xs text-slate-500">
                  {d.commanderName} · {d.format} · {d.authorName ?? "—"} · {d.source} · {d.status} · {d.createdAt.toISOString().slice(0, 10)}
                </span>
              </span>
              <AdminDeckToggle id={d.id} status={d.status} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
