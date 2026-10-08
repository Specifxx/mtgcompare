import { NextResponse } from "next/server";
import { getDataRef, planeHealth } from "@/lib/data";
import { privateHeaders } from "@/lib/data/plane/headers";

// What THIS instance is serving: the commit of the data it reads, the age of that publish, which host answered last, whether it is running on a stale pointer or a rejected token, and the size of its in-memory file cache.
// Counts and names only, no secrets, no auth: the publisher polls it after the warm call until the site serves the new commit, and the watchdog compares it with latest.json (POINTER_BEHIND). Neither Neon nor a data file is read.
export const dynamic = "force-dynamic";

export async function GET() {
  await getDataRef().catch(() => null);                         // a cold instance has no pointer yet; the read is the 20-second memo (3.5 s at most when cold) and never throws here
  return NextResponse.json(planeHealth(), { headers: privateHeaders() });
}
