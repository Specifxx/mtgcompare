import type { Metadata } from "next";
import { SignIn } from "@/components/premium/SignIn";

// Sign in ON MTG Compare (owner, 2026-11-10): Google or an emailed link; the account lives with RiftCompare's (lib/premium-member.ts).
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: true } };

export default function AccountPage() {
  return (
    <div className="page py-12 sm:py-16">
      <SignIn />
    </div>
  );
}
