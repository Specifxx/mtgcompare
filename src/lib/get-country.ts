// Server-side market reader: the `country` cookie a visitor chose, else Vercel's
// IP-geo header, else the US — RiftCompare's order. Reading it makes a page
// per-request; the DATA behind it still comes from the cached loaders.
import { cookies, headers } from "next/headers";
import { COUNTRY_COOKIE, DEFAULT_COUNTRY, isCountry, normalizeCountry, type Country } from "./country";

export function getCountry(): Country {
  const c = cookies().get(COUNTRY_COOKIE)?.value;
  if (c && isCountry(c)) return c;
  const geo = headers().get("x-vercel-ip-country");
  return geo ? normalizeCountry(geo) : DEFAULT_COUNTRY;
}
