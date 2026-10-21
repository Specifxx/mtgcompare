"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";

// Cached pages render once per import, so "3 hours ago" computed on the server
// would freeze. Render the server's value, then correct it in the browser.
export function Ago({ iso, initial }: { iso: string; initial: string }) {
  const [text, setText] = useState(initial);
  useEffect(() => setText(timeAgo(iso)), [iso]);
  return (
    <time dateTime={iso} title={new Date(iso).toUTCString()} suppressHydrationWarning>
      {text}
    </time>
  );
}
