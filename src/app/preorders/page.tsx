import { permanentRedirect } from "next/navigation";

// There is no pre-order price page: the sets that have not released are the "Coming up" part of /release-dates, each linking to its set page, where pre-order listings are priced. An old /preorders URL lands there
// instead of on a 404; nothing links here and the sitemap does not list it (tests/nav-routes.test.ts, tests/sitemap-sections.test.ts).
export default function Preorders(): never {
  permanentRedirect("/release-dates");
}
