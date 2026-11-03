import { SITE } from "@/site.config";

// This site's key in RiftCompare's shared review service (riftcompare.com,
// src/lib/site-reviews/sites.ts there): SITE.key, which must be on that list.
export const SITE_REVIEWS = { key: SITE.key, name: SITE.name } as const;
