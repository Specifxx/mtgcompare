import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { adminJsonBody, adminLog, requireAdminApi } from "@/lib/admin";
import { SITE_URL } from "@/lib/site";
import { getCachedRisingCards, getRisingWeekAgo, RISING_SNAPSHOTS_TAG } from "@/lib/data";
import { entitlementOf } from "@/lib/premium";
import { parseRiseScope } from "@/lib/rise-predictor";
import { generateRisingTitle, toSnapshotData } from "@/lib/rising-snapshot";
import { createRisingSnapshot, deleteRisingSnapshot, listRisingSnapshots } from "@/lib/admin-rising";

export const dynamic = "force-dynamic";

// The MTG Compare Hot 40 snapshots (RiftCompare's /api/admin/rising-snapshot).
// Admin only through requireAdminApi (session or the ADMIN_TOKEN header, never
// a query string). Mutations are POST + same-origin + JSON and log with
// adminLog:
//   { "action": "mint", "scope": "GLOBAL" | "US" | … }   freeze the ranking now
//   { "action": "delete", "id": "…" }                      the link dies for everyone
// GET lists the 25 newest.

export async function GET(req: Request) {
  const gate = await requireAdminApi(req, { mutation: false });
  if (gate instanceof NextResponse) return gate;
  const rows = await listRisingSnapshots();
  return NextResponse.json({ snapshots: rows.map((r) => ({ ...r, url: `${SITE_URL}/rising/${r.token}` })) });
}

export async function POST(req: Request) {
  const gate = await requireAdminApi(req, { mutation: true });
  if (gate instanceof NextResponse) return gate;
  const body = await adminJsonBody(req);
  if (body instanceof NextResponse) return body;
  const b = body ?? {};

  if (b.action === "delete") {
    const id = typeof b.id === "string" ? b.id.slice(0, 64) : "";
    if (!id) return NextResponse.json({ error: "missing snapshot id" }, { status: 400 });
    const token = await deleteRisingSnapshot(id);
    if (!token) return NextResponse.json({ error: "No such snapshot" }, { status: 404 });
    adminLog(gate, "rising.snapshot.delete", { id });
    revalidateTag(RISING_SNAPSHOTS_TAG);
    revalidatePath(`/rising/${token}`);
    return NextResponse.json({ ok: true });
  }

  if (b.action !== "mint") return NextResponse.json({ error: "unknown action" }, { status: 400 });
  const scope = parseRiseScope(typeof b.scope === "string" ? b.scope : "GLOBAL", "GLOBAL");

  // The SAME cached analysis /tools/rising and the admin page read — minting
  // never starts a second scan (getCachedRisingCards caches itself, so it is
  // called directly and never wrapped).
  // The admin gate above is the authority; an admin counts as Premium, so the
  // loader serves the full analysis (nothing here compares a tier).
  const who = entitlementOf({ isAdmin: true, premiumUntil: null, premiumTier: "premium" });
  const result = await getCachedRisingCards(scope, who);
  // A FAILED LOAD IS NEVER MINTED: frozen, it would be a permanent public page
  // presenting a blip as a fact about the market.
  if (result.failed || result.locked) {
    return NextResponse.json({ error: "Rising Cards failed to load, so nothing was minted. Try again in a few minutes." }, { status: 409 });
  }
  const now = new Date();
  // The ranking a week ago, for the movement frozen into this one. Never a
  // reason not to mint: null means the snapshot carries no arrows.
  const weekAgo = await getRisingWeekAgo(scope, who);
  const data = toSnapshotData(result.analysis, scope, now, weekAgo);
  // An empty run is still mintable, deliberately: a link that says so honestly
  // beats a 400 that leaves the admin guessing whether the feature broke.
  const snap = await createRisingSnapshot(scope, generateRisingTitle(data, now), data);
  adminLog(gate, "rising.snapshot.mint", { scope, picks: data.picks.length });
  return NextResponse.json({
    ok: true,
    title: snap.title,
    url: `${SITE_URL}/rising/${snap.token}`,
    picks: data.picks.length,
    comparedWith: weekAgo ? { asOf: weekAgo.asOf } : null,
  });
}
