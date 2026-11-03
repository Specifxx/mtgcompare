// eBay Marketplace Account Deletion notifications. eBay will not enable a
// production keyset until the app either registers an endpoint like this or
// files an exemption. Registered at
//   https://<site>/api/ebay/account-deletion
// with the verification token EBAY_VERIFICATION_TOKEN (32–80 characters, set
// the same value in Vercel and on eBay's developer page).
//
// GET  ?challenge_code=…  → { challengeResponse: sha256(code + token + endpoint) }
// POST (a deletion notice) → 200. This site stores no eBay user data — the
//      Browse API returns listings, not accounts — so there is nothing to
//      delete; acknowledging is all eBay requires.
import { NextResponse } from "next/server";
import { abs } from "@/lib/site";
import { ENDPOINT_PATH, challengeResponse } from "@/lib/ebay-deletion";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("challenge_code");
  const token = process.env.EBAY_VERIFICATION_TOKEN;
  if (!code || !token) return NextResponse.json({ error: "missing challenge_code or token" }, { status: 400 });
  return NextResponse.json(
    { challengeResponse: challengeResponse(code, token, abs(ENDPOINT_PATH)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  await req.text().catch(() => "");
  return new NextResponse(null, { status: 200 });
}
