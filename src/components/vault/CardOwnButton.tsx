"use client";

// "I own this" on a card page: pick the finish you own (only finishes with a TCGplayer price are offered, else Normal), then add
// it to the visitor's collection in this browser (src/lib/vault.ts), valued at that finish's TCGplayer market price in US$.
// No account, no server, no eBay call.
import { useState } from "react";
import { CARD_FINISHES, cardItemId } from "@/lib/vault";
import { VaultAddButton } from "./VaultAddButton";

export function CardOwnButton({ id, name, setSlug, setName, href, image, prices }: { id: number; name: string; setSlug: string; setName: string; href: string; image: string; prices: (number | null)[] }) {
  const priced = CARD_FINISHES.map((_, f) => f).filter((f) => typeof prices[f] === "number" && (prices[f] as number) > 0);
  const options = priced.length ? priced : [0];
  const [finish, setFinish] = useState(options[0]);
  const label = CARD_FINISHES[finish];
  return (
    <div className="mt-5 max-w-md">
      {options.length > 1 && (
        <div role="radiogroup" aria-label="Which finish do you own?" className="mb-2 inline-flex rounded-full border border-line p-0.5 text-xs font-semibold">
          {options.map((f) => (
            <button key={f} type="button" role="radio" aria-checked={finish === f} onClick={() => setFinish(f)} className={`rounded-full px-3 py-1 ${finish === f ? "bg-brand-soft text-brand-strong" : "text-muted"}`}>
              {CARD_FINISHES[f]}
            </button>
          ))}
        </div>
      )}
      <VaultAddButton
        key={finish}
        id={cardItemId(id, finish)}
        name={`${name}${finish ? ` (${label.toLowerCase()})` : ""} · ${setName}`}
        href={href}
        image={image}
        market="US"
        currency="USD"
        addedCents={(prices[finish] as number | null) ?? 0}
        set={setSlug}
      />
    </div>
  );
}
