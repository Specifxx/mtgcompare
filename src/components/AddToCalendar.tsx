"use client";

import { buildIcs, icsFileName } from "@/lib/ics";
import { Icon } from "./Icon";

/**
 * "Add to calendar" for a set's English release date: the browser builds the .ics file (lib/ics.ts) and downloads it as a Blob.
 * No request, no database, no account; the event links back to the set page, so release day brings the visitor back to compare.
 * A plain button the server renders at its final size: nothing moves when it hydrates.
 */
export function AddToCalendar({
  code,
  name,
  date,
  slug,
  url,
  when,
  className = "",
}: {
  code: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  slug: string;
  /** The set page, absolute (SITE_URL + path), computed on the server. */
  url: string;
  /** The date as the page prints it ("6 Nov 2026"), for the button's accessible name. */
  when: string;
  className?: string;
}) {
  function download() {
    const blob = new Blob([buildIcs({ code, name, date, url })], { type: "text/calendar;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = icsFileName(slug);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
  }
  return (
    <button type="button" onClick={download} aria-label={`Add to calendar: ${name} release, ${when}`} className={`btn-ghost min-h-11 whitespace-nowrap ${className}`}>
      <Icon name="calendar" size={18} />
      Add to calendar
    </button>
  );
}
