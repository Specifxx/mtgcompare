import { SET_BY_CODE } from "./sets";

/** Has this set not shipped yet? Open offers for it are pre-orders. */
export function isPreorderSet(setCode: string | null | undefined, now: Date = new Date()): boolean {
  if (!setCode) return false;
  const s = SET_BY_CODE.get(setCode);
  if (!s) return false;
  return s.releaseDate > now.toISOString().slice(0, 10);
}

export function formatRelease(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
