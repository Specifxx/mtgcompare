import { NextResponse } from "next/server";
import { ipKey, rateLimit } from "@/lib/rate-limit";
import {
  CLICK_BODY_MAX_BYTES,
  CLICK_IP_LIMIT,
  clickLogOn,
  type ClickSettings,
  countryOfRequest,
  flushClicks,
  getClickBatcher,
  pageOfReferer,
  parseClickBody,
  recordClick,
  sameOrigin,
} from "@/lib/click-event";

// POST /api/click: the outbound click log (contract 10.32). OutboundBeacon (components/OutboundBeacon.tsx) sends one small JSON body per click on a link
// that carries data-retailer. This route answers 204 at once and writes NOTHING itself: the click is appended to the instance's buffer (ClickBatcher) and
// the buffer is written in ONE insert inside the first minute of each wall-clock half hour, shared with the card-view counter, so the database wakes at
// most 48 times a day however many instances run. CLICK_LOG=0 turns it off, CLICK_SAMPLE_RATE samples it; crawlers, other origins, oversized bodies and
// a flood from one address are ignored with the same empty 204 (the client never learns which). No session is read: a click is anonymous.
export const dynamic = "force-dynamic";

/** The one place the log's switches are read (CLICK_LOG, CLICK_SAMPLE_RATE, and VIEW_FLUSH_MINUTES shared with the view counter). */
const settings = (): ClickSettings => ({ log: process.env.CLICK_LOG, sampleRate: process.env.CLICK_SAMPLE_RATE, flushMinutes: process.env.VIEW_FLUSH_MINUTES });
const noContent = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!clickLogOn(settings())) return noContent();
  const host = req.headers.get("host");
  if (!sameOrigin(req.headers.get("origin"), req.headers.get("referer"), host)) return noContent();
  if (!rateLimit(`click-ip:${ipKey(req)}`, CLICK_IP_LIMIT, 60 * 60 * 1000).ok) return noContent();
  // A beacon body is a few hundred bytes: say no before reading anything bigger than the cap (the length is the client's word, text.length below is the truth).
  if (Number(req.headers.get("content-length") ?? 0) > CLICK_BODY_MAX_BYTES) return noContent();
  let raw: unknown = null;
  try {
    const text = await req.text();
    if (text.length > CLICK_BODY_MAX_BYTES) return noContent();
    raw = JSON.parse(text);
  } catch {
    return noContent();
  }
  const country = countryOfRequest(req.headers.get("cookie"), req.headers.get("x-vercel-ip-country"));
  const row = parseClickBody(raw, country, pageOfReferer(req.headers.get("referer"), host));
  if (!row) return noContent();
  const batcher = getClickBatcher(settings());
  recordClick(batcher, row, req.headers.get("user-agent"));
  // The window is open and rows are waiting: this request pays the one insert (a beacon's response is not waited for by the page).
  await flushClicks(batcher).catch(() => 0);
  return noContent();
}
