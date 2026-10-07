import { NextResponse } from "next/server";
import { createStoreSuggestion } from "@/lib/inbox";
import { parseStoreSuggestion } from "@/lib/inbox-rules";
import { publicFormGate } from "@/lib/public-form";

export const dynamic = "force-dynamic";

// /stores/suggest. A store we already read, or one already suggested, answers
// ok without writing a second row.
export async function POST(req: Request) {
  const gate = await publicFormGate(req, { name: "suggest", perHour: 5 });
  if ("response" in gate) return gate.response;
  const parsed = parseStoreSuggestion(gate.body);
  if (!parsed.ok) return gate.reject(parsed.error);
  return NextResponse.json(await createStoreSuggestion(parsed.value, gate.userId));
}
