// This site's forum settings: the engine part. Topics and the intro are the
// game's own, in src/content/forum.ts.
import { SITE } from "@/site.config";
import { FORUM_CATEGORIES, FORUM_INTRO } from "@/content/forum";
import { SITE_REPOS } from "@/lib/reports-github";
import type { ForumSite } from "./core";

export const FORUM_SITE: ForumSite = {
  site: `${SITE.key}compare`,
  siteName: SITE.name,
  repo: SITE_REPOS[`${SITE.key}compare`] ?? "",
  hosts: [SITE.domain, `www.${SITE.domain}`],
  base: "/forum",
  topic: SITE.game,
  intro: FORUM_INTRO,
  categories: FORUM_CATEGORIES,
  reserved: [SITE.shortName, SITE.key],
};
