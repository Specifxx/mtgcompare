// CSV cells for the admin accounts export. Pure (the client component and the
// tests share it). Display names come from Google/Discord profiles, so a cell
// that starts with = + - @ or a tab/CR would run as a formula in Excel or
// Sheets; such a cell is prefixed with a single quote, which the spreadsheet
// shows as text. Every cell is quoted, with quotes doubled.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (FORMULA_START.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export const csvRow = (cells: unknown[]): string => cells.map(csvCell).join(",");
