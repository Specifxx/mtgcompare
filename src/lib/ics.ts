// RFC 5545 pieces for /release-dates/calendar (RiftCompare's release calendar
// route, extracted so the escaping and folding are tested). Pure.
import { SITE_URL } from "./site";

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newline are the only characters TEXT values must escape. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/**
 * RFC 5545 §3.1: lines over 75 OCTETS fold with CRLF + a leading space (the
 * space counts toward the next line's 75). Folds on character boundaries, never
 * inside a multi-byte character.
 */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // the continuation's leading space takes one octet
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** yyyy-mm-dd plus `days` as yyyymmdd (UTC; DTEND of an all-day event is exclusive). */
export function addDaysCompact(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, "0")}${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export interface ReleaseEvent {
  /** yyyy-mm-dd */
  date: string;
  name: string;
  code: string;
  slug: string;
}

/**
 * An all-day VEVENT calendar for a set's release. All-day, not timed: the date is
 * the listing date, not an announced hour, so a precise instant would invent a
 * time nobody published (and an all-day event needs no timezone at all).
 */
export function releaseIcs(e: ReleaseEvent, now: Date = new Date()): string {
  const stamp = `${now.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
  const description = `Compare prices across every store from the moment it drops: ${SITE_URL}/sets/${e.slug}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MTG Compare//Release Calendar//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:magic-release-${e.code.toLowerCase()}-${e.date}@mtgcompare.app`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`,
    `DTEND;VALUE=DATE:${addDaysCompact(e.date, 1)}`,
    foldLine(`SUMMARY:${icsEscape(`Magic: The Gathering ${e.name} (${e.code}) releases`)}`),
    foldLine(`DESCRIPTION:${icsEscape(description)}`),
    foldLine(`URL:${SITE_URL}/sets/${e.slug}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}
