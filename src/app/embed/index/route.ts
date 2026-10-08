import { getIndexSeries } from "@/lib/data";
import { embedPage } from "@/lib/embed-html";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// Market index badge: the latest value and its change over the last seven days.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const s = await getIndexSeries();
    const last = s[s.length - 1];
    if (!last) return new Response("No index yet", { status: 404 });
    const prev = s[Math.max(0, s.length - 8)];
    const ch = prev && prev.value ? ((last.value - prev.value) / prev.value) * 100 : null;
    const body = `<div><strong>${SITE_NAME} Index</strong><div class="big">${last.value.toFixed(1)}</div><div class="mut">${ch == null ? "" : `${ch >= 0 ? "+" : ""}${ch.toFixed(1)}% over 7 days · `}${last.day}</div></div>`;
    return embedPage(`${SITE_NAME} Index`, body, `${SITE_URL}/market`);
  } catch {
    return new Response("Prices are unavailable right now", { status: 503 });
  }
}
