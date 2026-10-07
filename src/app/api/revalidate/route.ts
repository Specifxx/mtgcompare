import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { PRICES_TAG } from "@/lib/data";

// Called by the import (lib/import.ts revalidateSite) after every run, with
// `Authorization: Bearer $CRON_SECRET`. Purges every cached loader at once.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  revalidateTag(PRICES_TAG);
  return NextResponse.json({ ok: true, revalidated: PRICES_TAG, at: new Date().toISOString() });
}
