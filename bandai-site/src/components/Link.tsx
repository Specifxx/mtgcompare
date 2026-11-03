import NextLink from "next/link";
import type { ComponentProps } from "react";

// next/link with prefetching OFF by default (cost; MTG Compare and Rift Compare
// did the same). In production a <Link> to an ISR page prefetches that page's
// whole RSC payload as soon as it scrolls into view, and a target nobody has
// opened since the release renders and writes to the ISR cache on the prefetch
// alone. A set page shows hundreds of card tiles. A click still navigates
// client-side. Pass prefetch explicitly to opt one link back in.
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
