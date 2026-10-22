import NextLink from "next/link";
import type { ComponentProps } from "react";

// next/link with prefetching OFF by default (2026-10-22, cost). Every page here is force-dynamic, so a prefetch is a server render:
// a page with 60 product links in view asked the server for up to 60 renders nobody may click, each a billed function invocation.
// A click still navigates client-side. Pass prefetch explicitly to opt one link back in.
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
