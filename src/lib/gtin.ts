/**
 * Barcodes (GTIN: UPC-A, EAN-13 / JAN, GTIN-14, EAN-8), read from TCGplayer's own catalogue
 * (`extendedData` "UPC") and shown on a sealed product's page, in its structured data and in
 * site search (owner, 2026-11-18: identifier searches are easy search results).
 *
 * A code is kept only when its check digit is right; an 11-digit UPC that lost its leading zero
 * is given it back when that makes the check digit right. A barcode TCGplayer files on two or
 * more products (a case code on every blister in it) is dropped by `uniqueGtins`: it would name
 * the wrong product on all but one page. Never invented, never taken from a store title.
 */

function checkOk(d: string): boolean {
  const body = d.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const n = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10 === Number(d[d.length - 1]);
}

/** The digits of a valid GTIN, or null. */
export function normaliseGtin(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").replace(/[^0-9]/g, "");
  if (!d || /^0+$/.test(d)) return null;
  if (d.length === 11 && checkOk(`0${d}`)) return `0${d}`;
  if (![8, 12, 13, 14].includes(d.length)) return null;
  return checkOk(d) ? d : null;
}

/** schema.org's property for a GTIN of this length. */
export function gtinLd(gtin: string | null | undefined): Record<string, string> {
  if (!gtin) return {};
  const key = { 8: "gtin8", 12: "gtin12", 13: "gtin13", 14: "gtin14" }[gtin.length];
  return key ? { [key]: gtin } : {};
}

/** "UPC" for 12 digits, "EAN" for 13, "GTIN" otherwise: how the box prints it. */
export function gtinLabel(gtin: string): string {
  return gtin.length === 12 ? "UPC" : gtin.length === 13 ? "EAN" : "GTIN";
}

/** Drops every barcode two or more products share, in place. */
export function uniqueGtins<T extends { upc?: string | null }>(products: T[]): T[] {
  const n = new Map<string, number>();
  for (const p of products) if (p.upc) n.set(p.upc, (n.get(p.upc) ?? 0) + 1);
  for (const p of products) if (p.upc && (n.get(p.upc) ?? 0) > 1) delete p.upc;
  return products;
}
