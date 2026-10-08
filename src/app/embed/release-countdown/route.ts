import { getUpcomingSets } from "@/lib/data";
import { RELEASE_SET_KINDS } from "@/lib/constants";
import { embedPage, esc } from "@/lib/embed-html";
import { SITE_URL } from "@/lib/site";

// Days until the next Magic release (set kinds of RELEASE_SET_KINDS). Counted
// on the server per request, so the widget needs no script.
export const dynamic = "force-dynamic";

export function daysUntil(date: string, now: Date = new Date()): number {
  const t = Date.parse(`${date}T00:00:00Z`), n = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((t - n) / 86400000));
}

export async function GET() {
  try {
    const kinds: readonly string[] = RELEASE_SET_KINDS;
    const next = (await getUpcomingSets(24)).find((s) => kinds.includes(s.kind));
    if (!next?.releasedOn) return new Response("No release announced", { status: 404 });
    const d = daysUntil(next.releasedOn);
    const body = `<div><strong>${esc(next.name)}</strong><div class="big">${d === 0 ? "Today" : `${d} day${d === 1 ? "" : "s"}`}</div><div class="mut">releases ${esc(next.releasedOn)}</div></div>`;
    return embedPage(`${next.name} release countdown`, body, `${SITE_URL}/sets/${next.slug}`);
  } catch {
    return new Response("Releases are unavailable right now", { status: 503 });
  }
}
