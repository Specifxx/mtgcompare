import { NextResponse } from "next/server";
import { createFeedback } from "@/lib/inbox";
import { parseFeedback } from "@/lib/inbox-rules";
import { publicFormGate } from "@/lib/public-form";

export const dynamic = "force-dynamic";

// /feedback. Shown publicly only with the author's consent and after review.
export async function POST(req: Request) {
  const gate = await publicFormGate(req, { name: "feedback", perHour: 5, perIpHour: 6 });
  if ("response" in gate) return gate.response;
  const parsed = parseFeedback(gate.body);
  if (!parsed.ok) return gate.reject(parsed.error);
  return NextResponse.json(await createFeedback(parsed.value, gate.userId));
}
