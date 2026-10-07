import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// One indexed count (RiftCompare's poll target). OP Compare does NOT poll it:
// the count rides /api/me (lib/use-unread.ts). Kept for parity and scripts.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ unreadCount: 0 });
  const n = await unreadCount(user.id).catch(() => 0);
  return NextResponse.json({ unreadCount: n }, { headers: { "Cache-Control": "no-store" } });
}
