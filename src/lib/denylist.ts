// The shared scam denylist (owner, 2026-11-16): TCGEmpire's weekly scam sweep writes data/store-vetting/denylist.json
// (banned shops + shops the sweep auto-hides). Imports skip a denied store entirely. Best-effort: a failed fetch keeps
// every store (the weekly sweep and the site's own checks still apply); it never throws. Rollback is on the sweep's side
// (repository variable SCAM_AUTOHIDE=0 or data/store-vetting/overrides.json). Script-side only: never import from src/app.
const DENYLIST_URL = "https://raw.githubusercontent.com/Specifxx/TCGEmpire/main/data/store-vetting/denylist.json";

export function hostOf(base: string): string {
  try {
    return new URL(base).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export async function loadDenylist(): Promise<Set<string>> {
  try {
    const r = await fetch(DENYLIST_URL, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return new Set();
    const j = (await r.json()) as { domains?: { domain: string }[] };
    return new Set((j.domains ?? []).map((d) => d.domain.replace(/^www\./, "").toLowerCase()));
  } catch {
    return new Set();
  }
}

/** Drop stores whose host is on the denylist, logging each. */
export function withoutDenied<T extends { base: string; name?: string }>(stores: T[], deny: Set<string>): T[] {
  return stores.filter((s) => {
    const h = hostOf(s.base);
    const denied = h !== "" && deny.has(h);
    if (denied) console.log(`[denylist] ${s.name ?? h} (${h}) skipped: shared scam denylist`);
    return !denied;
  });
}
