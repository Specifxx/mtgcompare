/**
 * Writes docs/DECISIONS-INDEX.md: every `## ` heading of DECISIONS.md, grouped
 * by month (newest first), each linked to its line. Then checks that every
 * `../DECISIONS.md#L<n>` link in docs/CURRENT-STATE.md still lands on a heading
 * carrying the date its link text names.
 *
 *   npm run decisions:index            # regenerate the file, check the links
 *   npm run decisions:index -- --check # exit 1 if the committed index is stale
 *                                      # or a CURRENT-STATE link is broken
 *
 * Why (2026-09-23): DECISIONS.md reached ~11,400 lines and ~126 entries in RiftCompare, and
 * sessions kept re-proposing things an entry had already settled — the UI pass
 * alone declined several — because nobody reads 11k lines to find out. The index
 * is the table of contents; docs/CURRENT-STATE.md is the distilled "what still
 * stands". This file only lists; it never interprets an entry.
 *
 * Output is a pure function of DECISIONS.md — no timestamps, no git calls — so
 * running it twice produces no diff, and --check can gate on it.
 *
 * Heading conventions it has to cope with (all present in the file today):
 *   "Title — 2026-09-23"                      em dash, the common form
 *   "Title, 2026-09-23"                       comma
 *   "Title (2026-09-10)"                      parenthesised
 *   "Title (2026-09-10, same day, second pass)"
 *   "Title — 2026-09-11 (same day, follow-up)"
 *   "Phase 1 — Orient & Baseline (2026-08-17)"
 *   "1. Fresh-vs-committed diff"              no date: a sub-section of the
 *                                             entry above it → "Undated"
 * `## ` lines inside fenced code blocks are not headings and are skipped.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SOURCE = "DECISIONS.md";
const OUTPUT = "docs/DECISIONS-INDEX.md";
const CURRENT_STATE = "docs/CURRENT-STATE.md";
// The index lives in docs/, so links climb one level to reach the log.
const LINK_BASE = "../DECISIONS.md";

type Entry = {
  line: number; // 1-based line of the heading in DECISIONS.md
  title: string; // heading text with the date (and its punctuation) removed
  note: string | null; // a trailing qualifier such as "same day, follow-up"
  date: string | null; // YYYY-MM-DD, or null when the heading carries none
  parent: Entry | null; // for undated headings: the nearest dated entry above
};

const DATE = String.raw`(\d{4}-\d{2}-\d{2})`;
// "Title (2026-09-10)" or "Title (2026-09-10, same day, second pass)".
const PAREN_DATE = new RegExp(String.raw`^(.*?)\s+\(` + DATE + String.raw`(?:,\s*([^()]*))?\)\s*$`);
// "Title — 2026-09-23", "Title, 2026-09-23", "Title — 2026-09-11 (same day, follow-up)".
const SUFFIX_DATE = new RegExp(String.raw`^(.*?)(?:\s+[—–-]\s+|,\s+)` + DATE + String.raw`(?:\s+\(([^()]*)\))?\s*$`);

function parseHeading(raw: string): Pick<Entry, "title" | "note" | "date"> {
  const text = raw.trim();
  const m = PAREN_DATE.exec(text) ?? SUFFIX_DATE.exec(text);
  if (m) {
    const [, title, date, note] = m;
    return { title: title.trim(), date, note: note?.trim() || null };
  }
  // A date somewhere other than the end: keep the whole title, date the entry
  // by the LAST date it mentions (entries are titled "…, <entry date>").
  const all = text.match(new RegExp(DATE, "g"));
  return { title: text, date: all ? all[all.length - 1] : null, note: null };
}

function parseDecisions(markdown: string): Entry[] {
  const entries: Entry[] = [];
  let inFence = false;
  let fenceMarker = "";
  let lastDated: Entry | null = null;
  markdown.split(/\r?\n/).forEach((line, i) => {
    const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1];
      } else if (fence[1][0] === fenceMarker[0] && fence[1].length >= fenceMarker.length) {
        inFence = false;
      }
      return;
    }
    if (inFence || !line.startsWith("## ")) return;
    const parsed = parseHeading(line.slice(3));
    const entry: Entry = { line: i + 1, ...parsed, parent: parsed.date ? null : lastDated };
    if (entry.date) lastDated = entry;
    entries.push(entry);
  });
  return entries;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Heading text goes inside a link inside a table cell. A "|" ends a GFM cell
// even inside a code span, so it is always escaped; "[" / "]" would end the
// link text, but a backslash inside a code span renders literally, so brackets
// are escaped only outside backticks.
const cell = (s: string) =>
  s
    .split(/(`[^`]*`)/)
    .map((part) => (part.startsWith("`") ? part : part.replace(/([\\[\]])/g, "\\$1")))
    .join("")
    .replace(/\|/g, "\\|");
const link = (e: Entry) => `[${cell(e.title)}](${LINK_BASE}#L${e.line})`;
const titleCell = (e: Entry) => (e.note ? `${link(e)} _(${cell(e.note)})_` : link(e));

function renderIndex(entries: Entry[], sourceLines: number): string {
  const dated = entries.filter((e) => e.date);
  const undated = entries.filter((e) => !e.date);

  // Newest first throughout: by date, then — for entries sharing a date, which
  // DECISIONS.md appends in the order they were written — by line, descending.
  const byMonth = new Map<string, Entry[]>();
  for (const e of [...dated].sort((a, b) => (a.date === b.date ? b.line - a.line : a.date! < b.date! ? 1 : -1))) {
    const month = e.date!.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(e);
  }

  const out: string[] = [
    "# DECISIONS.md — index",
    "",
    "<!-- GENERATED FILE: do not edit by hand. -->",
    "",
    "Generated by `scripts/decisions-index.ts` from every `## ` heading of",
    // Thousands separator by hand: toLocaleString depends on the runtime's ICU
    // build, and this file must come out byte-identical everywhere.
    `[DECISIONS.md](${LINK_BASE}) (${String(sourceLines).replace(/\B(?=(\d{3})+$)/g, ",")} lines, ${entries.length} headings).`,
    "Regenerate after adding an entry:",
    "",
    "```",
    "npm run decisions:index",
    "```",
    "",
    "`npm run decisions:index -- --check` exits non-zero if this file is stale,",
    "or if a link in CURRENT-STATE.md no longer lands on the entry it names.",
    "",
    "Newest month first; within a month, newest entry first. Links point at the",
    "heading's line (`#L<line>`); where a viewer renders the markdown and ignores",
    "line anchors, open DECISIONS.md at the number in the Line column.",
    "For what is still in force, read [CURRENT-STATE.md](CURRENT-STATE.md) first.",
    "",
  ];

  const months = [...byMonth.keys()];
  out.push(
    "Months: " +
      [...months.map((m) => monthLabel(m)), ...(undated.length ? ["Undated"] : [])]
        .map((label) => `[${label}](#${anchor(label)})`)
        .join(" · "),
    "",
  );

  for (const month of months) {
    const rows = byMonth.get(month)!;
    out.push(`## ${monthLabel(month)}`, "", `${rows.length} ${rows.length === 1 ? "entry" : "entries"}.`, "");
    out.push("| Date | Entry | Line |", "| --- | --- | ---: |");
    for (const e of rows) out.push(`| ${e.date} | ${titleCell(e)} | ${e.line} |`);
    out.push("");
  }

  if (undated.length) {
    out.push(
      "## Undated",
      "",
      "Headings with no date of their own: sub-sections of the dated entry they",
      "sit under, which the last column names.",
      "",
      "| Line | Heading | Under |",
      "| ---: | --- | --- |",
    );
    for (const e of undated) {
      const under = e.parent ? `${link(e.parent)} (${e.parent.date})` : "—";
      out.push(`| ${e.line} | ${titleCell(e)} | ${under} |`);
    }
    out.push("");
  }

  return out.join("\n");
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

// GitHub's heading slug for the labels this file emits ("September 2026").
const anchor = (label: string) => label.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-");

// CURRENT-STATE.md cites its sources by hand as `[<date>](../DECISIONS.md#L<n>)`.
// Why this check exists (2026-09-23): the index regenerates, the page does not,
// and an edit inside an older DECISIONS.md entry shifts every `#L` anchor below
// it. The page had 171 such links when this was written, checked once by hand.
// A link passes when line <n> is a `## ` heading and the date in its text is
// that heading's date (for an undated sub-section, its parent entry's date). A
// shifted anchor almost always lands on a body line, and fails loudly.
const CITATION = /\[([^\]]*)\]\(\.\.\/DECISIONS\.md#L(\d+)\)/g;

function checkCurrentState(entries: Entry[]): string[] {
  let page: string;
  try {
    page = readFileSync(join(ROOT, CURRENT_STATE), "utf8");
  } catch {
    return [`${CURRENT_STATE} is missing`];
  }
  const byLine = new Map(entries.map((e) => [e.line, e]));
  const problems: string[] = [];
  for (const m of page.matchAll(CITATION)) {
    const [, text, n] = m;
    const where = `${CURRENT_STATE}:${page.slice(0, m.index).split("\n").length}`;
    const target = byLine.get(Number(n));
    const named = new RegExp(DATE).exec(text)?.[1];
    const date = target ? (target.date ?? target.parent?.date) : null;
    if (!target) problems.push(`${where}: #L${n} is not a heading of ${SOURCE}`);
    else if (!named) problems.push(`${where}: the link to #L${n} names no date`);
    else if (date !== named) problems.push(`${where}: #L${n} is "${target.title}" (${date}), not an entry of ${named}`);
  }
  return problems;
}

function main() {
  const src = readFileSync(join(ROOT, SOURCE), "utf8");
  const sourceLines = src.split(/\r?\n/).length - (src.endsWith("\n") ? 1 : 0);
  const entries = parseDecisions(src);
  const next = renderIndex(entries, sourceLines);
  const target = join(ROOT, OUTPUT);
  let failed = false;

  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(target, "utf8");
    } catch {
      /* missing counts as stale */
    }
    if (current !== next) {
      console.error(`${OUTPUT} is stale — run: npm run decisions:index`);
      failed = true;
    } else {
      console.log(`${OUTPUT} is up to date.`);
    }
  } else {
    writeFileSync(target, next);
    console.log(`Wrote ${OUTPUT}.`);
  }

  const problems = checkCurrentState(entries);
  if (problems.length) {
    console.error(
      `${problems.length} link(s) in ${CURRENT_STATE} no longer land on the entry they name.\n` +
        `Find each entry's new line in ${OUTPUT} and fix the #L number:\n` +
        problems.map((p) => `  ${p}`).join("\n"),
    );
    failed = true;
  } else {
    console.log(`${CURRENT_STATE}: every DECISIONS.md link lands on its entry.`);
  }
  if (failed) process.exit(1);
}

main();
