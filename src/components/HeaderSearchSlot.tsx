"use client";

import type { ReactNode } from "react";

// RiftCompare's HeaderSearchSlot: one wrapper for the header's two search
// positions (inline from xl, a second row below it). It once carried a resize
// observer; today it is a plain full-width block, kept so both call sites stay
// identical to RiftCompare's markup (tests/header-search-resize.test.ts).
export function HeaderSearchSlot({ children, mobile = false }: { children: ReactNode; mobile?: boolean }) {
  void mobile;
  return <div className="block w-full min-w-0">{children}</div>;
}
