"use client";

import { useEffect, useState } from "react";
import { OutboundLink } from "@/components/OutboundLink";
import { REL_SPONSORED, TCGPLAYER_RETAILER } from "@/lib/affiliate";
import { creativeImage, cyberBannerState, cyberBannerText, pickCreatives } from "@/lib/tcgplayer-cyber";

// TCGplayer's Cyber Weekend banner (lib/tcgplayer-cyber.ts): under the price table and on the Black Friday and Cyber Monday pages,
// never above a price, labelled Ad. The moment is read again in the browser, so a page the CDN kept a day still switches on and off
// on time. TCGplayer's own creative when one is set, else our own text version. Its link is the page's tagged TCGplayer search.
export function TcgplayerCyberBanner({ href, at, className = "" }: { href: string; at: number; className?: string }) {
  const [now, setNow] = useState(at);
  useEffect(() => setNow(Date.now()), []);
  const state = cyberBannerState(now);
  if (state === "off") return null;
  const { wide, small } = pickCreatives(now);
  const text = cyberBannerText(state);
  const alt = `${text.head}: ${text.line}`;
  const link = (children: React.ReactNode, extra = "") => (
    <OutboundLink href={href} rel={REL_SPONSORED} retailer={TCGPLAYER_RETAILER} placement="tcgplayer-cyber-banner" className={extra}>
      {children}
    </OutboundLink>
  );
  return (
    <aside aria-label="Advertisement: TCGplayer Cyber Weekend" data-tcgplayer-cyber="" className={`relative ${className}`}>
      <span className="absolute right-2 top-2 z-10 rounded border border-line bg-surface px-1.5 text-[11px] font-semibold uppercase leading-5 text-muted">Ad</span>
      {wide || small ? (
        <div className="flex justify-center">
          {wide &&
            link(
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creativeImage(wide)} width={wide.width} height={wide.height} alt={alt} loading="lazy" className="h-auto max-w-full" />,
              small ? "hidden sm:block" : "block",
            )}
          {small &&
            link(
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creativeImage(small)} width={small.width} height={small.height} alt={alt} loading="lazy" className="h-auto max-w-full" />,
              wide ? "block sm:hidden" : "block",
            )}
        </div>
      ) : (
        link(
          <span className="card flex flex-col gap-1 px-5 py-4 pr-12 sm:flex-row sm:items-center sm:gap-4">
            <span className="font-display text-lg font-bold text-ink">{text.head}</span>
            <span className="text-sm text-muted">{text.line}</span>
            <span className="text-sm font-semibold text-ink underline decoration-line underline-offset-2 sm:ml-auto sm:shrink-0">Shop on TCGplayer →</span>
          </span>,
          "block",
        )
      )}
    </aside>
  );
}
