import Link from "@/components/Link";
import type { Kit } from "@/lib/site-types";
import { kitBestByMarket, kitImage, kitInStockStores, kitOffers } from "@/lib/kits";
import { KitPrice } from "./KitPrice";

export function KitTile({ k }: { k: Kit }) {
  const best = kitBestByMarket(k.jan);
  const stores = new Set(kitOffers(k.jan).map((o) => o.source)).size;
  return (
    <Link href={`/kit/${k.slug}`} className="group card-surface flex flex-col overflow-hidden transition hover:border-brand/60">
      <div className="aspect-square bg-white">
        {k.image ? (
          <img src={kitImage(k.image, 400)} alt={`${k.name} box`} loading="lazy" className="h-full w-full object-contain p-1.5 transition group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full items-center justify-center p-3 text-center text-xs text-neutral-500">No image yet</div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <p className="line-clamp-2 text-sm font-medium text-fg">{k.name}</p>
        <div className="mt-auto pt-1 font-bold text-brand-400"><KitPrice best={best} /></div>
        <p className="text-[11px] text-muted">{stores} store{stores === 1 ? "" : "s"} · {kitInStockStores(k.jan)} in stock</p>
      </div>
    </Link>
  );
}

export function KitGrid({ items }: { items: Kit[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {items.map((k) => <KitTile key={k.jan} k={k} />)}
    </div>
  );
}
