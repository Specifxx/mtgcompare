// ONE PROMPT A VISIT (owner, 2026-11-23: "keep user experience high and not flooding them with ads and information";
// ops/product-ux/page-budget.md). A visit gets at most one self-opening prompt: the sign-in slide, the rating card, the
// return nudge, an install or share prompt. The first one to show claims the visit's slot here (sessionStorage); every other
// prompt asks first and stands down. Nothing self-opening ever shows on a visit's first page (each prompt arms on its own count).
// Browser only. No storage at all reads as "taken": a prompt never shows when it cannot remember that it did.
export const PROMPT_SLOT_KEY = "ce_prompt_slot";

/** Session keys older prompts already write when they show; any of them set means the slot went to that prompt. */
const OLDER_PROMPTS: { key: string; shown: (v: string) => boolean }[] = [
  { key: "srv_rate_seen", shown: (v) => v === "1" },
  { key: "rn-state", shown: (v) => /"shown":true/.test(v) },
  // The heavy arm of the ad-intensity test (lib/ad-heavy.ts): its pop-up or slide-in had the visit.
  { key: "heavy-popups", shown: (v) => Number(v) > 0 },
  { key: "heavy-slides", shown: (v) => Number(v) > 0 },
];

/** Who holds this visit's prompt slot, or null when it is free. */
export function promptSlotHolder(): string | null {
  try {
    const own = sessionStorage.getItem(PROMPT_SLOT_KEY);
    if (own) return own;
    for (const p of OLDER_PROMPTS) {
      const v = sessionStorage.getItem(p.key);
      if (v && p.shown(v)) return p.key;
    }
    return null;
  } catch {
    return "no-storage";
  }
}

/** Take the slot for `name`. True when it was free (or already this prompt's). */
export function claimPromptSlot(name: string): boolean {
  const h = promptSlotHolder();
  if (h && h !== name) return false;
  try {
    sessionStorage.setItem(PROMPT_SLOT_KEY, name);
    return true;
  } catch {
    return false;
  }
}

/** A prompt the visitor closed stays away this long (page budget: 7 days). */
export const PROMPT_SILENCE_DAYS = 7;
