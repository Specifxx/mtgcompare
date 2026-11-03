import { SITE } from "@/site.config";

export const SITE_HOST = SITE.apexHost ? SITE.domain : `www.${SITE.domain}`;
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || `https://${SITE_HOST}`).replace(/\/$/, "");
export const abs = (p: string) => `${SITE_URL}${p.startsWith("/") ? p : `/${p}`}`;

/** The site's share image (src/app/opengraph-image.jpg). A page that sets
 *  its own `openGraph` loses the root file's og:image, so every page names it
 *  again: without it Reddit, Discord and iMessage show no thumbnail. */
export const SHARE_IMAGE = { url: "/opengraph-image.jpg", width: 2400, height: 1260, alt: `${SITE.name}: compare ${SITE.gameShort} card and booster box prices across stores` };

/** The model-kit section's own share image (SITE.kits.shareImage), else the site's. */
export const KITS_SHARE_IMAGE = SITE.kits?.shareImage ? { width: 2400, height: 1260, ...SITE.kits.shareImage } : SHARE_IMAGE;

/** Self-canonical plus a matching og:url (the layout sets no og:url, so a
 *  page without this would share the homepage's) and the share image. */
export const canon = (path: string, image: { url: string; alt: string } = SHARE_IMAGE) => ({
  alternates: { canonical: path },
  openGraph: { type: "website" as const, siteName: SITE.name, url: path, images: [image] },
  twitter: { card: "summary_large_image" as const, images: [image] },
});
