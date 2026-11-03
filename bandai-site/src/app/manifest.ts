import type { MetadataRoute } from "next";
import { SITE } from "@/site.config";

export default function manifest(): MetadataRoute.Manifest {
  return { name: SITE.name, short_name: SITE.shortName, start_url: "/", display: "standalone", background_color: SITE.theme.pageDark, theme_color: SITE.theme.pageDark, icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] };
}
