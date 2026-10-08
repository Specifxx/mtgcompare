import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/admin-guard";
import { collectionShareToken, disableCollectionShare, enableCollectionShare, rotateCollectionShare, shareUrlForCollection } from "@/lib/collection-share";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// The binder's public link (/c/<token>). The token lives on User.collectionShareId (lib/collection-share.ts).
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/** Current share state for the signed-in user. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: noStore });
  const token = await collectionShareToken(user.id);
  return NextResponse.json({ shared: token != null, url: token ? shareUrlForCollection(token) : null }, { headers: noStore });
}

/**
 * Turn sharing on (`action: "enable"`, the default) or mint a fresh token
 * (`action: "rotate"`). Rate-limited despite being cheap, because rotation is
 * the revocation mechanism: twenty an hour is far more than any real use.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const rl = rateLimit(`coll-share:${user.id}`, 20, 3600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const rotate = body?.action === "rotate";
  const token = rotate ? await rotateCollectionShare(user.id) : await enableCollectionShare(user.id);
  return NextResponse.json({ shared: true, url: shareUrlForCollection(token), rotated: rotate }, { headers: noStore });
}

/** Turn sharing off. The public page 404s from the next request onwards. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  await disableCollectionShare(user.id);
  return NextResponse.json({ shared: false, url: null }, { headers: noStore });
}
