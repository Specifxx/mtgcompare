import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { notificationFeed } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// The signed-in account's notification feed (RiftCompare's /api/notifications):
// the 30 newest plus one indexed unread count. ?take=10 for the dashboard panel.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const take = Number(new URL(req.url).searchParams.get("take")) || undefined;
  try {
    return NextResponse.json(await notificationFeed(user.id, take), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load notifications right now." }, { status: 500 });
  }
}
