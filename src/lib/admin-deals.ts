// The admin Deal Finder preview (/admin/deals): what each audience is served by the real loader for one market. Uncached and owner-only; called only
// from src/app/admin/deals/page.tsx behind requireAdminPage(). It asks getDealList with an Entitlement minted exactly the way a request mints one
// (src/lib/premium.ts entitlementOf over a user shape), so the preview cannot drift from what a visitor gets: nothing here compares a tier or cuts a row itself.
import type { Country } from "./country";
import { getCardsByIds, getDealCount, getDealList, type DealRow } from "./data";
import { FEATURE_RULES, accessFor, gateMatrix, type Access, type Viewer } from "./premium-gates";
import { entitlementOf, type EntitlementFields } from "./premium";

export type AudienceKey = "signed-out" | "free" | "plus" | "premium";
export interface Audience { key: AudienceKey; label: string; viewer: Viewer; user: EntitlementFields | null }

const SOON = new Date(Date.now() + 86_400_000);
const paid = (premiumTier: string): EntitlementFields => ({ isAdmin: false, premiumUntil: SOON, premiumTier });
export const AUDIENCES: readonly Audience[] = [
  { key: "signed-out", label: "Signed out", viewer: { signedIn: false, tier: null }, user: null },
  { key: "free", label: "Free account", viewer: { signedIn: true, tier: null }, user: { isAdmin: false, premiumUntil: null, premiumTier: "premium" } },
  { key: "plus", label: "Plus", viewer: { signedIn: true, tier: "plus" }, user: paid("plus") },
  { key: "premium", label: "Premium", viewer: { signedIn: true, tier: "premium" }, user: paid("premium") },
];

export interface AudiencePreview {
  audience: Audience;
  access: Access;
  /** the loader's true length of the list */
  total: number;
  /** rows the audience is served on its first page */
  rows: { row: DealRow; name: string; setCode: string; number: string | null }[];
  locked: boolean;
}

/** What each audience gets from getDealList for this market (first page, default view). A failed read is an empty preview, said by the page. */
export async function previewDeals(country: Country): Promise<{ count: number | null; previews: AudiencePreview[]; matrix: ReturnType<typeof gateMatrix>[number] }> {
  const count = await getDealCount(country).catch(() => null);
  const previews: AudiencePreview[] = [];
  for (const audience of AUDIENCES) {
    const who = entitlementOf(audience.user);
    const list = await getDealList(country, {}, who).catch(() => null);
    const cards = list?.rows.length ? await getCardsByIds([...new Set(list.rows.map((r) => r.uid >> 1))]).catch(() => new Map()) : new Map();
    previews.push({
      audience,
      access: accessFor("deal-finder", audience.viewer),
      total: list?.total ?? 0,
      locked: list?.locked ?? true,
      rows: (list?.rows ?? []).slice(0, 10).map((row) => {
        const c = cards.get(row.uid >> 1);
        return { row, name: c?.name ?? `#${row.uid >> 1}`, setCode: c?.setCode ?? "", number: c?.number ?? null };
      }),
    });
  }
  return { count, previews, matrix: gateMatrix().find((g) => g.feature === "deal-finder")! };
}

export const dealFinderRule = (): { minTier: string; label: string; path: string } => {
  const r = FEATURE_RULES["deal-finder"];
  return { minTier: r.minTier, label: r.label, path: r.path };
};
