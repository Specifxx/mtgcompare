import type { ReactNode } from "react";
import { getEmailStatus } from "@/lib/data";

// Renders its children only while email is configured (Meta "email" = on, via
// the cached getEmailStatus — no session, no cookie). Every email-capture field
// (newsletter, release alerts) mounts inside this, so while email is off no
// email field renders anywhere and no copy promises mail (wave2-plan §1).
export async function EmailOnly({ children }: { children: ReactNode }) {
  const status = await getEmailStatus().catch(() => "off" as const);
  return status === "on" ? <>{children}</> : null;
}
