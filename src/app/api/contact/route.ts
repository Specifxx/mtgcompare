import { NextResponse } from "next/server";
import { createContactMessage } from "@/lib/inbox";
import { parseContactMessage } from "@/lib/inbox-rules";
import { publicFormGate } from "@/lib/public-form";

export const dynamic = "force-dynamic";

// The /contact form. The owner replies by hand from their own mail client;
// nothing here sends email.
export async function POST(req: Request) {
  const gate = await publicFormGate(req, { name: "contact", perHour: 6 });
  if ("response" in gate) return gate.response;
  const parsed = parseContactMessage(gate.body);
  if (!parsed.ok) return gate.reject(parsed.error);
  return NextResponse.json(await createContactMessage(parsed.value, gate.userId));
}
