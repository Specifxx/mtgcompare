// Never interrupt a visitor who is typing (owner, 2026-11-23 UX review, P0 1: "A full-screen TCGplayer modal opened while I was
// typing in search and swallowed the query … Ads must never fire during typing or cover content, and should appear at most once
// per session"). Every self-opening ad or prompt asks visitorBusy() at the moment it would open and stands down when it says yes.
// Busy = a text field, select or editable element has focus, or a key was pressed in the last QUIET_MS. Browser only.
export const QUIET_MS = 5000;

let lastKey = 0;
let armed = false;

/** Starts listening for keys (idempotent). Called by every component that may self-open. */
export function watchTyping(): void {
  if (armed || typeof window === "undefined") return;
  armed = true;
  window.addEventListener("keydown", () => (lastKey = Date.now()), { capture: true, passive: true });
  window.addEventListener("input", () => (lastKey = Date.now()), { capture: true, passive: true });
}

export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = ((el as HTMLInputElement).type || "text").toLowerCase();
  return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image", "hidden"].includes(type);
}

/** True while the visitor is typing or has a text field focused: nothing may open over them now. */
export function visitorBusy(now = Date.now()): boolean {
  if (typeof document === "undefined") return true;
  if (isTypingTarget(document.activeElement)) return true;
  return now - lastKey < QUIET_MS;
}
