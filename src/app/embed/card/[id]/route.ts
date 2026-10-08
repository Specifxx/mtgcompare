import { getCardLookup } from "@/lib/data";
import { embedPage, esc } from "@/lib/embed-html";
import { usd } from "@/lib/format";
import { SITE_URL } from "@/lib/site";

// Price badge for one card: /embed/card/<slug or id>. Reads one card through the
// plane loader; an unknown card answers 404, a failing data host 503.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const key = decodeURIComponent(params.id);
  try {
    const n = /^\d+$/.test(key) ? Number(key) : null;
    const look = await getCardLookup(n != null ? { ids: [n] } : { slugs: [key] });
    const c = n != null ? look.byId.get(n) : look.bySlug.get(key);
    if (!c) return new Response("Not found", { status: 404 });
    const price = c.valueUsd != null ? usd(c.valueUsd) : "no price";
    const body = `<div><strong>${esc(c.name)}</strong><div class="mut">${esc(c.setCode)} ${esc(c.number ?? "")}${c.label ? ` · ${esc(c.label)}` : ""}</div><div class="big">${esc(price)}</div><div class="mut">${c.lowOnly ? "lowest listing, no market price" : "TCGplayer market price"}</div></div>`;
    return embedPage(`${c.name} price`, body, `${SITE_URL}/card/${c.slug}`);
  } catch {
    return new Response("Prices are unavailable right now", { status: 503 });
  }
}
