"use client";

import { SegmentedTabs, type SegmentedTab } from "./ui/SegmentedTabs";

export type EbayTab = SegmentedTab;

/**
 * The tab shell for the card page's and QuickView's eBay panels (RiftCompare's
 * EbayTabs): a thin wrapper over ui/SegmentedTabs, uncontrolled. Tabs with no
 * content are dropped by the CALLER: a tab that opens onto "nothing here" is
 * worse than none. With a single tab the tablist is not drawn at all.
 */
export function EbayTabs({ tabs, label, className }: { tabs: EbayTab[]; label: string; className?: string }) {
  return <SegmentedTabs tabs={tabs} label={label} className={className} />;
}
