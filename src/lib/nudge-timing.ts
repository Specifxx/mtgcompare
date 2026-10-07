// HOW LONG A CORNER NUDGE WAITS, AND WHEN IT MUST STOP ASKING. One set of
// numbers, read by both corner cards (PremiumSlideIn and AnnualSwitchNudge),
// so they behave as one system. Ported unchanged from RiftCompare's
// lib/nudge-timing.ts, where each number has a history:
//
//   • 12 seconds after the card became ELIGIBLE (lib/nudge-gate.ts), not after
//     the page opened. RiftCompare measured an instant corner card once: 78%
//     dismissed it, bounce rose and pages per visit fell. Google also treats a
//     card covering a phone's first page from search as an intrusive
//     interstitial.
//   • Two dismissals and it never comes back; a dismissal snoozes it for a
//     week, a click (engaging is not refusing) for two weeks without burning a
//     strike. A dismiss button that "waits" before it works was declined in
//     RiftCompare (Better Ads Standards: "ads with countdown").
export const NUDGE_DELAY_MS = 12_000;

export const MAX_NUDGE_DISMISSALS = 2;
export const SNOOZE_AFTER_DISMISS_MS = 7 * 864e5; // 7 days
export const SNOOZE_AFTER_CLICK_MS = 14 * 864e5; // 14 days
