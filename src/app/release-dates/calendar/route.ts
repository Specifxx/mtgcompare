import { getCatalog } from "@/lib/data";
import { releaseIcs } from "@/lib/ics";
import { upcomingSets } from "@/lib/selectors";

// "Add to calendar" for the next dated One Piece set: the phone and desktop half
// of taking the countdown elsewhere (a calendar syncs across every device its
// owner uses). Reads the cached catalogue only.
export const revalidate = 3600;

export async function GET() {
  const cat = await getCatalog();
  const next = upcomingSets(cat.sets)[0];
  if (!next?.releasedOn) {
    return new Response("No dated One Piece release is currently scheduled.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response(releaseIcs({ date: next.releasedOn, name: next.name, code: next.code, slug: next.slug }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8; method=PUBLISH",
      "Content-Disposition": `attachment; filename="one-piece-${next.code.toLowerCase()}-${next.releasedOn}.ics"`,
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex",
    },
  });
}
