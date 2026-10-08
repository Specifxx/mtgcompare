import { NextResponse } from "next/server";
import { createPriceReport } from "@/lib/inbox";
import { parsePriceReport } from "@/lib/inbox-rules";
import { publicFormGate } from "@/lib/public-form";

export const dynamic = "force-dynamic";

// "Spotted a wrong price?" from a card or sealed page. The price we showed is
// read from the published offers in lib/inbox.ts (readLiveOffers), never taken
// from this body.
export async function POST(req: Request) {
  const gate = await publicFormGate(req, { name: "report", perHour: 20 });
  if ("response" in gate) return gate.response;
  const parsed = parsePriceReport(gate.body);
  if (!parsed.ok) return gate.reject(parsed.error);
  const r = await createPriceReport(parsed.value, gate.userId);
  if (!r.ok) return r.status === 503 ? gate.unavailable(r.error) : gate.reject(r.error);
  return NextResponse.json({ ok: true });
}
