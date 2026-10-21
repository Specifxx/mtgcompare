// A set's English release date as an iCalendar file (RFC 5545), for "Add to calendar" (components/AddToCalendar.tsx). Built in
// the browser from sets.ts's date and the page's own URL: no request, no database, no account. Pure, so tests/hubs.test.ts pins
// the exact output and parses it back.
//
// One all-day VEVENT: DTSTART;VALUE=DATE is the release date, DTEND the next day (an all-day event's end is exclusive). The UID
// is the set's, so adding the same set twice (from two regions, or twice from one) updates one event instead of making two.
// Lines end in CRLF and are folded at 75 octets; TEXT values escape backslashes, semicolons, commas and newlines.

export interface IcsRelease {
  /** sets.ts code: the UID is `${code}-release@dexcompare.app`. */
  code: string;
  /** The set's name ("Delta Reign"). */
  name: string;
  /** English release date, YYYY-MM-DD. */
  date: string;
  /** The set page to come back to (absolute). */
  url: string;
  /** DTSTAMP, when the file was made. Fixed in tests; now in the browser. */
  stamp?: Date;
}

/** RFC 5545 §3.3.11 TEXT: backslash, semicolon and comma are escaped; a newline becomes "\n". */
export function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** RFC 5545 §3.1: a line longer than 75 octets continues on the next line after CRLF and one space. Never splits a character. */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // the leading space of a continuation line is one of its 75 octets
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

/** "2026-11-06" → "2026-11-07". */
export function nextDay(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);
}

function icsDate(iso: string): string {
  return iso.replace(/-/g, "");
}

function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildIcs(e: IcsRelease): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DexCompare//Pokemon TCG release dates//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.code}-release@dexcompare.app`,
    `DTSTAMP:${icsStamp(e.stamp ?? new Date())}`,
    `DTSTART;VALUE=DATE:${icsDate(e.date)}`,
    `DTEND;VALUE=DATE:${icsDate(nextDay(e.date))}`,
    `SUMMARY:${escapeIcsText(`Pokémon TCG ${e.name} release (English)`)}`,
    `DESCRIPTION:${escapeIcsText(`Compare ${e.name} prices: ${e.url}`)}`,
    `URL:${e.url}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/** The download's file name: "pokemon-tcg-delta-reign-release.ics". */
export function icsFileName(slug: string): string {
  return `pokemon-tcg-${slug}-release.ics`;
}
