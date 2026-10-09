import { permanentRedirect } from "next/navigation";

// The pre-order price page is not built yet: the sets that have not released are the "announced" part of /release-dates, so the nav link and any old URL land there instead of on a 404.
export default function Preorders(): never {
  permanentRedirect("/release-dates");
}
