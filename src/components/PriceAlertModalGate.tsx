import { getEmailStatus } from "@/lib/data";
import { enabledProviders } from "@/lib/oauth";
import { PriceAlertModal } from "./PriceAlertModal";

// The root layout's mount for the email-only price-alert modal (wave 2,
// 2026-10-03). Renders NOTHING unless email is on (getEmailStatus: one cached
// Meta row — no session, no cookie) AND the owner has enabled the anonymous
// door (NEXT_PUBLIC_ANON_ALERTS=1). While email is off no email field may
// render anywhere (wave2-plan §1).
export async function PriceAlertModalGate() {
  if (process.env.NEXT_PUBLIC_ANON_ALERTS !== "1") return null;
  const status = await getEmailStatus().catch(() => "off" as const);
  if (status !== "on") return null;
  return <PriceAlertModal providers={enabledProviders()} />;
}
