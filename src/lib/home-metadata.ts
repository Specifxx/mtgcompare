import type { Metadata } from "next";
import { getHomeStats, getSiteStats } from "./data";
import { MARKETS, type Country } from "./country";
import { pageOg, pageOgOwnImage } from "./og/meta";
import {
  REGION_HOME_PATH,
  homeDescription,
  homeSocialDescription,
  homeSocialTitle,
  homeTitle,
  regionHomeDescription,
  regionHomeHreflang,
  regionHomeTitle,
} from "./seo";

// The homepage's and region homes' <title>, description, Open Graph and
// hreflang (RiftCompare's lib/home-metadata.ts). "/" has its own share image
// (app/opengraph-image.tsx), so its openGraph carries no `images` key. Live counts from the cached
// home stats; any error falls back to count-free copy, never a 500.
async function liveStats() {
  try {
    return await getHomeStats();
  } catch {
    return null;
  }
}

export async function homeMetadata(): Promise<Metadata> {
  const [stats, site] = await Promise.all([liveStats(), getSiteStats().catch(() => null)]);
  const ebayLive = site?.ebayLive ?? false;
  const title = homeTitle(stats?.liveStoresAll, ebayLive);
  return {
    title: { absolute: title },
    description: homeDescription(stats?.totalCards, stats?.liveStoresAll, ebayLive),
    alternates: { canonical: "/", languages: regionHomeHreflang() },
    openGraph: pageOgOwnImage("/", { title: homeSocialTitle(stats?.liveStoresAll, ebayLive), description: homeSocialDescription(stats?.liveStoresAll, ebayLive) }),
    twitter: { card: "summary_large_image", title: homeSocialTitle(stats?.liveStoresAll, ebayLive), description: homeSocialDescription(stats?.liveStoresAll, ebayLive) },
  };
}

export async function regionMetadata(region: Exclude<Country, "US">): Promise<Metadata> {
  const stats = await liveStats();
  const path = REGION_HOME_PATH[region];
  const s = stats?.statsByCountry[region];
  const title = regionHomeTitle(region, s?.stores);
  const description = regionHomeDescription(region, s?.priced, s?.stores);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path, languages: regionHomeHreflang() },
    openGraph: pageOg(path, { title, description }),
  };
}

export const REGION_CODES = MARKETS.filter((m): m is Exclude<Country, "US"> => m !== "US");
