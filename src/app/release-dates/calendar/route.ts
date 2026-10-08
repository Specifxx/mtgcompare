import { getUpcomingSets } from "@/lib/data";
import { releaseIcs } from "@/lib/ics";

// "Add to calendar" for the next dated Magic set: the phone and desktop half
// of taking the countdown elsewhere (a calendar syncs across every device its
// owner uses). Reads the published set list only.
export const dynamic = "force-dynamic";

export async function GET() {
  const next = (await getUpcomingSets(1))[0];
  if (!next?.releasedOn) {
    return new Response("No dated Magic release is currently scheduled.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response(releaseIcs({ date: next.releasedOn, name: next.name, code: next.code, slug: next.slug }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8; method=PUBLISH",
      "Content-Disposition": `attachment; filename="mtg-${next.code.toLowerCase()}-${next.releasedOn}.ics"`,
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex",
    },
  });
}
