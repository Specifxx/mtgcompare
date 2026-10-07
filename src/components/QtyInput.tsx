"use client";

import { useEffect, useState } from "react";

// A quantity box that can be edited like a normal text field (RiftCompare's
// QtyInput). A controlled `value={qty}` input with `parseInt(...) || 1` puts
// the 1 straight back when you backspace it to type "3", producing 13. This
// keeps the typed text locally (empty is allowed while typing), commits every
// valid number as it is typed, and snaps back to the committed value on blur.
export function QtyInput({
  value,
  onChange,
  max = 99,
  label,
  className = "input w-14 shrink-0 py-1 text-center sm:text-sm",
}: {
  value: number;
  onChange: (qty: number) => void;
  max?: number;
  label: string;
  className?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    // sm:text-sm, not text-sm: .input is 16px below sm so iOS doesn't zoom the page on focus.
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9]/g, "").slice(0, 3);
        setText(t);
        const n = parseInt(t, 10);
        if (n >= 1) onChange(Math.min(max, n));
      }}
      onBlur={() => setText(String(value))}
      aria-label={label}
      className={className}
    />
  );
}
