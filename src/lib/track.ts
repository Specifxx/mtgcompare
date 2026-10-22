// Custom click events. OFF (owner, 2026-10-22: "I don't want MTG Compare doing more than $1 a day"): Vercel Web Analytics bills
// page views and custom events, so it is not loaded at all and track() records nothing. The call sites stay, so turning it back on
// is this one function and src/components/SiteAnalytics.tsx.
export function track(_name: string, _props?: Record<string, string | number | boolean | null>): void {}
