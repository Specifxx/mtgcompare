"use client";

import type { ComponentProps } from "react";
import { Dialog as UiDialog } from "./ui/Dialog";

// Wave 1's top-level Dialog, kept as a thin re-export of RiftCompare's
// components/ui/Dialog.tsx (wave 2, 2026-10-03) so its default-export callers
// (QuickViewProvider) keep compiling. New code imports { Dialog } from
// "@/components/ui/Dialog" directly. The one prop default that differs: this
// shell sat at z-overlay (QuickView's layer on RiftCompare too), so it still
// does unless a caller asks for another layer.
export { useScrollLock, useModalFlag, useEscapeLayer } from "./ui/Dialog";
export type { DialogSize, DialogPlacement, DialogZ } from "./ui/Dialog";

export default function Dialog({ z = "overlay", ...props }: ComponentProps<typeof UiDialog>) {
  return <UiDialog z={z} {...props} />;
}
