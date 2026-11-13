"use client";

import { useEffect } from "react";
import { retargetHref } from "@/lib/nav";
import { REGIONS } from "@/lib/regions";
import { useSoftRegion } from "../RegionSuggest";
import { WaysIn, type Way } from "./Hero";

/**
 * The landing page's ways in (components/home/Hero.tsx WaysIn), in the visitor's region. The server's HTML has the default region's
 * (`links`, built for it), so they work without script and crawl; in the browser they move to the suggested or picked region with
 * the same labels, so nothing reflows. It also points the hero's plain GET search form (`formId`, server markup) at that region's
 * search, by changing its action attribute only: the US until then, and when no region is suggested.
 */
export function SoftWaysIn({ formId, links }: { formId?: string; links: Way[] }) {
  const region = useSoftRegion();
  useEffect(() => {
    if (formId) document.getElementById(formId)?.setAttribute("action", `/${region}/sealed`);
  }, [formId, region]);
  return <WaysIn links={links.map((l) => ({ ...l, href: retargetHref(l.href, region) }))} label={`Popular pages in ${REGIONS[region].inName}`} />;
}
