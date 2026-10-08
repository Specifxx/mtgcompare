import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

// eBay Marketplace Account Deletion / Closure notifications. Required to enable
// PRODUCTION keys for the eBay application MTG Compare uses (its own or, in
// EBAY_KEYSET_MODE=shared, RiftCompare's: the notification is per keyset). MTG
// Compare stores no eBay USER data (EbayBest, EbayPanel and EbayBanner hold a
// listing's item id, price, title and image — no seller id, username or EIAS
// token), so there is nothing to delete: we answer eBay's
// validation challenge and acknowledge notifications. If anything ever stores
// seller.username or seller.userId, POST must start deleting by it.
//
// THIS ROUTE MUST STAY DEPLOYED FOR AS LONG AS THE KEYSET EXISTS: unacknowledged
// notifications mark the endpoint down after 24h, and after 30 days the account
// is non-compliant, which risks API access.
//
// Portal: Application Keys → Notifications → Alerts and Notifications →
// Marketplace Account Deletion. Endpoint = EBAY_DELETION_ENDPOINT (exactly
// https://mtgcompare.app/api/ebay/marketplace-deletion — apex, no trailing slash;
// it is part of the hash and www. redirects), token = EBAY_VERIFICATION_TOKEN.
// Both are read inside the handlers (Vercel, Production).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = process.env.EBAY_VERIFICATION_TOKEN ?? "";
  const endpoint = process.env.EBAY_DELETION_ENDPOINT ?? "";
  if (!token || !endpoint) return NextResponse.json({ error: "not configured" }, { status: 500 });
  const code = new URL(req.url).searchParams.get("challenge_code");
  if (!code) return NextResponse.json({ error: "missing challenge_code" }, { status: 400 });
  // ORDER matters: challenge code, then token, then endpoint.
  const challengeResponse = createHash("sha256").update(code).update(token).update(endpoint).digest("hex");
  return NextResponse.json({ challengeResponse }, { status: 200 });
}

export async function POST(req: Request) {
  await req.text().catch(() => "");
  return new NextResponse(null, { status: 200 }); // acknowledge immediately
}
