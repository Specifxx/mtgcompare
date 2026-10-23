"use client";

import { FEE_BY_KEY, FEES_CHECKED, scheduleText, sellingFees, type FeeSchedule } from "@/lib/fees";
import { money } from "@/lib/format";
import { parseMoney, parsePct } from "@/lib/tools";
import { currencyPrefix, Field, Figure, INPUT, NumberField, ToolCard, useRemembered } from "./ui";

interface State {
  preset: string;
  item: string;
  postage: string;
  postageCost: string;
  cost: string;
  rate: string;
  orderFee: string;
}

/** `schedules`: the region's eBay presets (lib/fees.ts schedulesFor), passed from the server so the page's HTML names them. */
export function FeeCalculator({ region, market, schedules }: { region: string; market: string; schedules: Pick<FeeSchedule, "key">[] }) {
  const presets = schedules.map((s) => FEE_BY_KEY.get(s.key)!).filter(Boolean);
  const [st, setSt] = useRemembered<State>(`mtg-tool-fees-${region}`, {
    preset: presets[0]?.key ?? "custom",
    item: "",
    postage: "",
    postageCost: "",
    cost: "",
    rate: "13",
    orderFee: "0.30",
  });
  const set = (k: keyof State) => (v: string) => setSt((p) => ({ ...p, [k]: v }));
  const m = (c: number) => money(c, market);
  const prefix = currencyPrefix(m(0));
  const preset = presets.find((p) => p.key === st.preset) ?? null;
  const item = parseMoney(st.item) ?? 0;
  const postage = parseMoney(st.postage) ?? 0;
  const fees = sellingFees(item, postage, preset ?? { ratePct: parsePct(st.rate) ?? 0, orderFeeCents: parseMoney(st.orderFee) ?? 0 });
  const postageCost = parseMoney(st.postageCost) ?? 0;
  const cost = parseMoney(st.cost) ?? 0;
  const keep = fees.afterFeesCents - postageCost;
  const profit = keep - cost;

  return (
    <ToolCard label="Selling fee calculator">
      <Field label="How you sell">
        {(id) => (
          <select id={id} value={preset ? preset.key : "custom"} onChange={(e) => set("preset")(e.target.value)} className={INPUT}>
            {presets.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom: enter your own rate</option>
          </select>
        )}
      </Field>
      {preset ? (
        <p className="mt-2 text-xs leading-5 text-muted">
          {preset.who} eBay’s published rate: {scheduleText(preset, m)}. Checked {FEES_CHECKED} on{" "}
          <a href={preset.source} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-brand underline underline-offset-2">
            eBay’s fee page ↗
          </a>
          ; confirm your own rate in Seller Hub.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <NumberField label="Final value fee" value={st.rate} onChange={set("rate")} suffix="%" placeholder="13" hint="Of the total the buyer pays, postage included." />
          <NumberField label="Fee per order" value={st.orderFee} onChange={set("orderFee")} prefix={prefix} />
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <NumberField label="Sale price" value={st.item} onChange={set("item")} prefix={prefix} />
        <NumberField label="Postage you charge the buyer" value={st.postage} onChange={set("postage")} prefix={prefix} />
        <NumberField label="What the postage costs you" value={st.postageCost} onChange={set("postageCost")} prefix={prefix} />
        <NumberField label="What you paid for it (optional)" value={st.cost} onChange={set("cost")} prefix={prefix} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">
        <Figure label="eBay’s fees" value={m(fees.feesCents)} sub={fees.totalCents ? `${fees.effectivePct.toFixed(1)}% of ${m(fees.totalCents)}` : "Enter a sale price"} tone="brand" />
        <Figure label="eBay pays you" value={m(fees.afterFeesCents)} sub={`Fee ${m(fees.variableCents)} + order fee ${m(fees.orderCents)}`} />
        <Figure label="After postage" value={m(keep)} tone={keep < 0 ? "sold" : "ink"} sub="What the sale leaves you" />
        <Figure label="Profit" value={cost ? m(profit) : "—"} tone={cost ? (profit < 0 ? "sold" : "open") : "ink"} sub={cost ? "After what you paid" : "Add what you paid"} />
      </div>
    </ToolCard>
  );
}
