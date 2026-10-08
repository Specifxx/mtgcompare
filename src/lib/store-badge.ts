// "Listed on MTG Compare" badge for a store's own site: pure markup, no data
// and no tracking. The snippet links to the store's page here; the badge
// image is an inline SVG data URI so the store hosts nothing of ours.
import { SITE_NAME, SITE_URL } from "./site";

export function storeBadgeSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="40" viewBox="0 0 180 40" role="img" aria-label="Listed on ${SITE_NAME}"><rect width="180" height="40" rx="8" fill="#2b1d4a"/><rect x="1" y="1" width="178" height="38" rx="7" fill="none" stroke="#b08d3c"/><text x="90" y="25" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#f3e9cf">Listed on ${SITE_NAME}</text></svg>`;
}

export function storeBadgeSnippet(storeKey: string, siteUrl: string = SITE_URL): string {
  const href = `${siteUrl}/stores/${encodeURIComponent(storeKey)}`;
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(storeBadgeSvg())}`;
  return `<a href="${href}" rel="noopener"><img src="${src}" width="180" height="40" alt="Listed on ${SITE_NAME}"></a>`;
}
