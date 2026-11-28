import Link from "@/components/Link";
import { BfModeBar } from "@/components/BfModeBar";
import { TcgSalePopup } from "@/components/TcgSalePopup";
import { OutboundLink } from "@/components/OutboundLink";
import { REL_SPONSORED, TCGPLAYER_RETAILER, tcgplayerSearchUrl } from "@/lib/affiliate";
import { bfModeOn, bfPhase } from "@/lib/bf-mode";
import { TCGPLAYER_STANDING } from "@/lib/offer-calendar";
import { saleStrip } from "@/lib/black-friday";
import { REGIONS, type Region } from "@/lib/regions";
import { sectionHref } from "@/lib/site";
import { StripClose } from "./StripClose";

// One line under the header on every region page from 1 November to the day after Cyber Monday, linking that region's Black
// Friday page, then its Cyber Monday page (lib/black-friday.ts saleStrip; DECISIONS.md, "Black Friday strip", 2026-11-07). A plain
// link in the server HTML: never a pop-up, a countdown or an urgency claim (BANNED_COPY).
// For Black Friday itself (lib/bf-mode.ts, owner 2026-11-27) the line becomes the bold Black Friday bar, which falls back to it.
export function HolidayStrip({ region, today = new Date().toISOString().slice(0, 10) }: { region: Region; today?: string }) {
  const s = saleStrip(today);
  const r = REGIONS[region];
  const strip = s ? (
    <div className="relative border-b border-line bg-raised" data-holiday-strip={s.key}>
      <p className="page truncate py-1.5 pr-10 text-center text-xs sm:text-sm">
        <Link href={sectionHref(region, s.key)} prefetch={false} className="hover:text-ink">
          <b>{s.name} MTG deals in {r.inName}</b><span className="hidden sm:inline"> · sealed under the median store price today</span> · <span className="font-semibold text-brand-strong">see the deals →</span>
        </Link>
      </p>
      <StripClose id={s.key} />
    </div>
  ) : null;
  const now = Date.now();
  const on = bfModeOn(now);
  // After the sale the bar and the card keep running with the offer calendar (lib/offer-calendar.ts, owner 2026-11-28).
  return (
    <>
    <BfModeBar
      on={on} phase={bfPhase(now)} now={now}
      href={sectionHref(region, "blackFriday")}
      evergreen={{
        title: `MTG sealed deals in ${r.inName}`,
        line: "booster boxes and bundles under the median store price today",
        href: sectionHref(region, "deals"),
        hrefs: { afterChristmas: sectionHref(region, "boxingDay"), newYear: sectionHref(region, "januarySales") },
        ad: (
        <OutboundLink
          href={tcgplayerSearchUrl("", region, "tcgplayer-offer-bar")}
          rel={REL_SPONSORED}
          retailer={TCGPLAYER_RETAILER}
          placement="tcgplayer-offer-bar"
          className="underline underline-offset-2"
        >
          <span style={{ color: "#fff" }}>{TCGPLAYER_STANDING.short}</span> · Ad
        </OutboundLink>
        ),
      }}
      title={`MTG sealed deals in ${r.inName}`}
      line="booster boxes and bundles under the median store price today"
      ad={
        <OutboundLink
          href={tcgplayerSearchUrl("", region, "tcgplayer-bf-mode")}
          rel={REL_SPONSORED}
          retailer={TCGPLAYER_RETAILER}
          placement="tcgplayer-bf-mode"
          className="underline underline-offset-2"
        >
          <span style={{ color: "#fff" }}>TCGplayer sale: 10% store credit on everything</span> · Ad
        </OutboundLink>
      }
    >
      {strip}
    </BfModeBar>
    {/* TCGplayer's sale card (owner, 2026-11-27): once a visit, never while typing, closes for good (TcgSalePopup.tsx). */}
    <TcgSalePopup slotKey="ce_prompt_slot" dealsHref={sectionHref(region, "blackFriday")} offerHref={sectionHref(region, "deals")}>
      <OutboundLink href={tcgplayerSearchUrl("booster box", region, "tcgplayer-sale-popup")} rel={REL_SPONSORED} retailer={TCGPLAYER_RETAILER} placement="tcgplayer-sale-popup">Booster boxes</OutboundLink>
      <OutboundLink href={tcgplayerSearchUrl("bundle", region, "tcgplayer-sale-popup")} rel={REL_SPONSORED} retailer={TCGPLAYER_RETAILER} placement="tcgplayer-sale-popup">Bundles</OutboundLink>
      <OutboundLink href={tcgplayerSearchUrl("", region, "tcgplayer-sale-popup")} rel={REL_SPONSORED} retailer={TCGPLAYER_RETAILER} placement="tcgplayer-sale-popup">All sealed</OutboundLink>
    </TcgSalePopup>
    </>
  );
}
