import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { publicDataMode } from "@/lib/public-data/mode";

// Called by scripts/import.ts after each import: every cached page re-renders
// from the fresh data on its next visit (and only then — nothing is rebuilt
// up front, so an import never costs more database reads than visits do).
//
// NOT IN FILES MODE (2026-10-16). The site reads the data files its deployment
// bundled (src/lib/public-data/), so an import cannot change a page until its
// data commit deploys, and that deploy empties the page cache anyway. Purging
// here re-rendered every visited page with the OLD files a few minutes before
// the deploy threw them away: a second full set of ISR writes per import. The
// route answers 202 "skipped" unless ?force=1 (DEPLOY.md, "Where the data lives").
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (publicDataMode() === "files" && new URL(req.url).searchParams.get("force") !== "1") {
    return NextResponse.json({ ok: true, skipped: "files mode: pages change with the data commit's deploy" }, { status: 202 });
  }
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
