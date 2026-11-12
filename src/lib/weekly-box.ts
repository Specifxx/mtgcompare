// When the hub pages start drawing the weekly-drops box (components/WeeklyDropsBox.tsx). RiftCompare's alert service takes
// its sign-up (kind "weekly") from the release after 2026-11-12, and a box that posts to the older service would only show
// an error, so the server leaves it out until this moment; the pages are CDN-cached for a day, so it appears within a day
// of it. Server-side on purpose: nothing is added in the browser, so nothing moves. DECISIONS.md, 2026-11-12.
export const WEEKLY_BOX_FROM = "2026-11-14T00:00:00Z";

export function weeklyBoxLive(now: Date = new Date()): boolean {
  return now.getTime() >= Date.parse(WEEKLY_BOX_FROM);
}
