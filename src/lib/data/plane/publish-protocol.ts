// src/lib/data/plane/publish-protocol.ts (owner WP01b, FROZEN). The PURE parts of the publish protocol (section 6.4): the next pointer, the squash plan and the rollback check. The git side (publisher.ts) calls these and nothing else decides.
import type { PointerFile } from "./formats";

export const TAG_PREFIX = "d-", TAG_KEEP_DAYS = 7, SQUASH_MAX_POINTER_AGE_DAYS = 5, HIST_CUT_DAYS = 28;
export const tagName = (priceDay: string, seq: number): string => `${TAG_PREFIX}${priceDay}-${seq}`;
export const seqOfTag = (tag: string): number | null => { const m = /^d-\d{4}-\d{2}-\d{2}-(\d+)$/.exec(tag); return m ? Number(m[1]) : null; };

export interface NextPointerInput { prev: PointerFile | null; ref: string; phase: "catalog" | "full"; priceDay: string; tcgcsv: string; scryfall: string; publishedAt: string; counts: PointerFile["counts"]; manifestSha256: string; repo: string; histCut: string; pvAt?: string | null }
/** The pointer commit B: seq + 1, `prev` = the previous pointer's ref. Written LAST: until it lands, readers see the previous publish whole. */
export function nextPointer(i: NextPointerInput): PointerFile {
  return { v: 1, seq: (i.prev?.seq ?? 0) + 1, ref: i.ref, publishedAt: i.publishedAt, priceDay: i.priceDay, tcgcsv: i.tcgcsv, scryfall: i.scryfall, phase: i.phase, format: "v1", counts: i.counts, manifestSha256: i.manifestSha256, prev: i.prev?.ref ?? null, repo: i.repo, histCut: i.histCut, pvAt: i.pvAt ?? i.prev?.pvAt ?? null };
}
/** Is a history cut due? Every HIST_CUT_DAYS days counted from the last cut, on a Sunday (the cut day rewrites every hist/p file; the weekly closes also change on Sundays, so the heavy push shares a day). */
export function isCutDay(priceDay: string, lastCut: string | null, cutDays = HIST_CUT_DAYS): boolean {
  const d = new Date(`${priceDay}T00:00:00Z`); if (d.getUTCDay() !== 0) return false;
  if (!lastCut) return true;
  return (Date.parse(`${priceDay}T00:00:00Z`) - Date.parse(`${lastCut}T00:00:00Z`)) / 86_400_000 >= cutDays;
}

export interface TagInfo { name: string; sha: string; at: Date }
export interface SquashPlan { skip: string | null; deleteTags: string[]; keepTags: string[] }
/** The weekly squash (critique DP-11, a failure mode verified by reasoning and by the bare-repository test with `git gc --prune=now`): it deletes the d-* tags older than TAG_KEEP_DAYS, because a tag keeps its whole ancestry reachable, EXCEPT the tags that name
 *  pointer.ref and pointer.prev (the commits every pinned URL and the rollback target depend on), and it REFUSES to run at all when the pointer is older than SQUASH_MAX_POINTER_AGE_DAYS: a publisher that has been stuck for a week must not also lose the commit the site is serving. */
export function planSquash(i: { now: Date; tags: readonly TagInfo[]; pointer: PointerFile | null; keepDays?: number; maxPointerAgeDays?: number }): SquashPlan {
  const keepDays = i.keepDays ?? TAG_KEEP_DAYS, maxAge = i.maxPointerAgeDays ?? SQUASH_MAX_POINTER_AGE_DAYS;
  if (!i.pointer) return { skip: "no pointer: nothing is being served, nothing to protect or squash", deleteTags: [], keepTags: i.tags.map((t) => t.name) };
  const ageDays = (i.now.getTime() - Date.parse(i.pointer.publishedAt)) / 86_400_000;
  if (ageDays > maxAge) return { skip: `the pointer is ${ageDays.toFixed(1)} days old (> ${maxAge}): the publisher is stuck; squashing would risk the commit the site serves`, deleteTags: [], keepTags: i.tags.map((t) => t.name) };
  const pinned = new Set([i.pointer.ref, i.pointer.prev].filter((x): x is string => !!x));
  const cutoff = i.now.getTime() - keepDays * 86_400_000; const del: string[] = [], keep: string[] = [];
  for (const t of i.tags) (t.name.startsWith(TAG_PREFIX) && t.at.getTime() < cutoff && !pinned.has(t.sha) ? del : keep).push(t.name);
  return { skip: null, deleteTags: del, keepTags: keep };
}
/** A rollback names a seq or a sha; it is possible only for a commit that is still fetchable and whose own record (v1/status.json) says it was a complete publish. */
export function rollbackTarget(i: { to: string | number; tags: readonly TagInfo[] }): TagInfo | null {
  const to = i.to;
  if (typeof to === "number") return i.tags.find((t) => seqOfTag(t.name) === to) ?? null;
  return i.tags.find((t) => t.sha === to || t.sha.startsWith(to)) ?? null;
}
/** The watchdog's size floor for a pointer move that is not a publish (rollback, overlay): the file counts must not collapse. */
export const sameShape = (a: PointerFile["counts"], b: PointerFile["counts"], ratio = 0.9): boolean => b.cards >= a.cards * ratio && b.units >= a.units * ratio && b.files >= a.files * ratio;
