"use client";

import { useEffect } from "react";
import { installPaidVisitTagger } from "@/lib/paid-visit";
import { readCampaign } from "@/lib/campaign";

// A paid creator's (or paid ad's) visitor adds its marker to the sub-id of every affiliate link it opens, so RiftCompare's
// earnings dashboard can say what that creator earned (lib/paid-visit.ts), and the tab's first-touch campaign is kept for
// the click events (lib/campaign.ts). Organic visits are untouched.
export function PaidVisitTagger() {
  useEffect(() => {
    readCampaign();
    installPaidVisitTagger();
  }, []);
  return null;
}
