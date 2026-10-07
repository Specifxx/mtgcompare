import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { adminLog, readJsonBody, requireAdminApi } from "@/lib/admin";
import { setDeckStatus } from "@/lib/admin-decks";
import { PUBLISHED_DECKS_TAG, checkPublishText } from "@/lib/published-decks";
import { publishDeck } from "@/lib/published-decks-server";

export const dynamic = "force-dynamic";

// Admin-only deck import and moderation (/admin/decks; RiftCompare's
// /api/admin/decks). POST + same-origin + JSON, logged with adminLog.
//   { "decks": [{ "title": "…", "list": "1xOP01-001\n4x…", "author": "Player, Event", "description": "…" }] }
// Each item goes through the same resolution and checks as a player's publish.
//   { "action": "hide" | "show", "id": "…" } moderates a deck.
const MAX_BYTES = 256 * 1024;

export async function POST(req: Request) {
  const gate = await requireAdminApi(req, { mutation: true });
  if (gate instanceof NextResponse) return gate;
  const read = await readJsonBody(req, MAX_BYTES);
  if (!read.ok) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const body = (read.body && typeof read.body === "object" ? read.body : {}) as Record<string, unknown>;

  if (body.action === "hide" || body.action === "show") {
    const id = typeof body.id === "string" ? body.id : "";
    const row = await setDeckStatus(id, body.action === "hide" ? "hidden" : "live");
    if (!row) return NextResponse.json({ error: "No such deck." }, { status: 404 });
    adminLog(gate, `deck.${body.action}`, { id, slug: row.slug });
    revalidateTag(PUBLISHED_DECKS_TAG);
    revalidatePath("/decks");
    revalidatePath(`/decks/${row.slug}`);
    revalidatePath(`/decks/leader/${row.leaderSlug}`);
    return NextResponse.json({ ok: true });
  }

  const items: unknown[] = Array.isArray(body.decks) ? body.decks : [];
  if (!items.length || items.length > 50) return NextResponse.json({ error: "Send 1–50 decks as { decks: [...] }." }, { status: 400 });
  const results: { title: string; ok: boolean; slug?: string; error?: string }[] = [];
  for (const raw of items) {
    const it = (raw ?? {}) as Record<string, unknown>;
    const text = checkPublishText(it.title, it.description);
    if (!text.ok) {
      results.push({ title: String(it.title ?? ""), ok: false, error: text.error });
      continue;
    }
    const res = await publishDeck({
      title: text.title,
      description: text.description,
      text: typeof it.list === "string" ? it.list.slice(0, 20_000) : "",
      userId: null,
      authorName: typeof it.author === "string" ? it.author.trim().slice(0, 80) || null : null,
      source: "import",
    }).catch(() => ({ ok: false as const, error: "Import failed." }));
    results.push(res.ok ? { title: text.title, ok: true, slug: res.slug } : { title: text.title, ok: false, error: res.error });
    if (res.ok) revalidatePath(`/decks/leader/${res.leaderSlug}`);
  }
  adminLog(gate, "deck.import", { items: items.length, imported: results.filter((r) => r.ok).length });
  revalidateTag(PUBLISHED_DECKS_TAG);
  revalidatePath("/decks");
  return NextResponse.json({ ok: true, results });
}
