import type { Metadata } from "next";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { byValue, products, setById } from "@/lib/data";
import { SEALED_ORDER as ORDER, SEALED_PLURAL as PLURAL, sealedHref } from "@/lib/hubs";
import Link from "@/components/Link";
import { TileGrid } from "@/components/ProductTile";

export const revalidate = 86400; // data only changes with a release (DECISIONS.md, "Vercel cost")
export const metadata: Metadata = {
  title: `${SITE.gameShort} booster box prices — cheapest sealed product`,
  description: `Compare ${SITE.game} booster box, booster pack, starter deck and sealed product prices across TCGplayer, eBay and ${SITE.stores.length} stores.`,
  ...canon("/sealed"),
};


export default function Sealed() {
  const sealed = products().filter((p) => p.kind === "sealed");
  const groups = ORDER.map((t) => ({ t, items: byValue(sealed.filter((p) => p.sealedType === t)) })).filter((g) => g.items.length);
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-3xl font-black">{SITE.gameShort} booster box and sealed prices</h1>
        <p className="mt-2 text-muted">Newest sets first within each type. Open any product to compare every store.</p>
      </header>
      {groups.map((g) => (
        <section key={g.t}>
          <h2 className="mb-3 text-xl font-bold">{sealedHref(g.t) ? <Link className="hover:underline" href={sealedHref(g.t)!}>{PLURAL[g.t] ?? g.t} →</Link> : PLURAL[g.t] ?? g.t}</h2>
          <TileGrid items={g.items.sort((a, b) => (setById(b.setId)?.releasedOn ?? "").localeCompare(setById(a.setId)?.releasedOn ?? "")).slice(0, 24)} />
        </section>
      ))}
    </div>
  );
}
