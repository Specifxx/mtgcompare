import type { Metadata } from "next";
import { PremiumReturn } from "@/components/premium/PremiumReturn";

// The landing of RiftCompare's sign-in (lib/premium-member.ts): the token is in the fragment, read in the browser.
export const metadata: Metadata = { title: "Signing you in", robots: { index: false, follow: false } };

export default function PremiumReturnPage() {
  return (
    <div className="page max-w-2xl py-16">
      <PremiumReturn />
    </div>
  );
}
