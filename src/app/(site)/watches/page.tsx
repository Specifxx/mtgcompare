import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { WatchesView } from "@/components/premium/WatchesView";
import { SITE_NAME } from "@/lib/site";

// A member's own watches, drawn in their browser from RiftCompare's service. Private, so never indexed.
export const metadata: Metadata = { title: "My watches", robots: { index: false, follow: false } };

export default function WatchesPage() {
  return (
    <div className="page max-w-3xl py-12">
      <Breadcrumbs items={[{ href: "/", label: SITE_NAME }, { label: "My watches" }]} />
      <h1 className="page-title mt-6">My watches</h1>
      <div className="mt-6">
        <WatchesView />
      </div>
    </div>
  );
}
