import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin, readJsonBody } from "@/lib/admin-guard";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { IMPORT_MAX_TEXT_CHARS, importCollection } from "@/lib/collection-server";

export const dynamic = "force-dynamic";
// The CSV path can write up to 2,000 lines, one guarded write each. Its own
// budget (40 s in lib/collection-server.ts) stops well inside this, so a slow
// database ends in a REPORT of the lines not reached, never a function killed
// mid-file with the response lost.
export const maxDuration = 60;

// Bulk-add cards from a pasted list ("4 Lightning Bolt (M11) 146 *F*") or a
// binder CSV (a TCGplayer, Moxfield, Deckbox or ManaBox export, or ours: a
// Product ID, or a set and a number, and a finish). Every read and
// write is in lib/collection-server.ts importCollection.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const rl = rateLimit(`collection:import:${user.id}`, 20, 3_600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  // The JSON wrapper around a 500 KB file: read no more than that plus slack.
  const read = await readJsonBody(req, IMPORT_MAX_TEXT_CHARS + 64 * 1024);
  if (!read.ok) return NextResponse.json({ error: "That file is over 500 KB. Split it into two and import them one after the other." }, { status: 413 });
  const body = read.body as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  try {
    const res = await importCollection(user, text);
    return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't import that right now — please try again." }, { status: 500 });
  }
}
