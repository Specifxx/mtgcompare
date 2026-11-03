import type { Metadata } from "next";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { Trade } from "./Trade";

export const revalidate = 86400;
export const metadata: Metadata = {
  title: `${SITE.gameShort} trade calculator — is your trade fair?`,
  description: `Value both sides of a ${SITE.game} trade at today's TCGplayer market price. Free, no account.`,
  ...canon("/tools/trade"),
};

export default function Page() {
  return (
    <div>
      <h1 className="font-display text-3xl font-black">{SITE.gameShort} trade calculator</h1>
      <p className="mt-2 text-muted">One card per line on each side (&ldquo;2 Card Name&rdquo; works). Valued at today&apos;s TCGplayer market price.</p>
      <Trade />
    </div>
  );
}
