// How a postage quote reads on screen — shared by Best Basket and the
// portfolio's replacement cost so the two say the same thing about the same
// figure. Pure, TYPE-only imports: this ships in client bundles, and
// lib/shipping.ts (with the whole rates snapshot and the store list) must not.
//
// The rule behind every prefix: say what kind of number it is. "est." — not
// measured (the store, or the buyer's "Elsewhere" region), or not a bound
// either way (a bigger order than we measured, priced at the dearest region
// because the region is unknown). "from" — postage is at least this: the order
// is bigger than anything the store's checkout was asked about, or it is going
// somewhere remoter than every address we measured (Alaska, Hawaii, Canada's
// north). "up to" — the buyer's region is unknown and this is the dearest
// region's rate. A FREE quote carries "est." as well when the region was not
// measured: free to New York is not free to Honolulu.

import type { PostageQuote } from "./shipping";
import type { BasketPlan, BasketStoreGroup } from "./basket";

type QuoteLike = Pick<PostageQuote, "basis" | "beyondMeasured" | "upTo" | "unmeasuredRegion" | "atLeast"> | undefined | null;

/** The word in front of a PAID postage figure: "est. ", "from ", "up to " or "". */
export function postagePrefix(p: QuoteLike): string {
  if (!p) return "";
  if (p.basis === "estimate") return "est. ";
  if (p.unmeasuredRegion) return p.atLeast ? "from " : "est. ";
  // Region unknown AND bigger than we measured: the dearest region's figure is
  // not a floor for a buyer somewhere cheaper, nor a ceiling for this order.
  if (p.beyondMeasured && p.upTo) return "est. ";
  if (p.beyondMeasured) return "from ";
  if (p.upTo) return "up to ";
  return "";
}

/** The word in front of "free": "est. " where the free rate was not measured to the buyer's region. */
export function freePrefix(p: Pick<PostageQuote, "unmeasuredRegion"> | undefined | null): string {
  return p?.unmeasuredRegion ? "est. " : "";
}

/** "A", "A and B", "A, B and C". */
export function joinList(list: readonly string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

const stores = (n: number) => `${n} store${n === 1 ? "" : "s"}`;

/**
 * The notes under a plan's headline total — each a reason the total is less
 * certain than it looks. `regionPicked`: the buyer chose a MEASURED region.
 * `regionUnmeasured`: they chose "Elsewhere" (or their location did) — a
 * choice all the same, so the plan must not tell them to pick one.
 */
export function planPostageNotes(plan: Pick<BasketPlan, "stores">, regionPicked: boolean, regionUnmeasured = false): string[] {
  const out: string[] = [];
  const est = plan.stores.filter((s) => s.postage?.basis === "estimate").length;
  if (est) out.push(`includes estimated postage for ${stores(est)}`);
  const measured = plan.stores.filter((s) => s.postage && s.postage.basis !== "estimate");
  const beyond = measured.filter((s) => !s.freeShipping && s.postage.beyondMeasured).length;
  if (beyond) out.push(`postage for ${stores(beyond)} is for a bigger order than we measured — at least this`);
  const freeBeyond = measured.filter((s) => s.freeShipping && s.postage.beyondMeasured).length;
  if (freeBeyond) out.push(`free postage for ${stores(freeBeyond)} was measured on smaller orders than yours — confirm at checkout`);
  const unm = measured.filter((s) => s.postage.unmeasuredRegion);
  if (unm.length) {
    out.push(
      `postage for ${stores(unm.length)} is not measured to your region${unm.some((s) => s.postage.atLeast) ? " — delivery there usually costs more" : ""}`,
    );
  }
  if (!regionPicked) {
    const places = [...new Set(plan.stores.flatMap((s) => s.postage?.notServed ?? []))];
    const n = plan.stores.filter((s) => s.postage?.notServed?.length).length;
    if (n) {
      out.push(
        `${stores(n)} in this plan ${n === 1 ? "doesn't" : "don't"} post to ${joinList(places)}${
          regionUnmeasured ? ` — ${n === 1 ? "it" : "they"} may not post to you either; check at checkout` : " — pick your region"
        }`,
      );
    }
  }
  const border = plan.stores.filter((s) => s.postage?.crossBorder && !/duties are included/.test(s.postage.crossBorder)).length;
  if (border) out.push(`${stores(border)} ${border === 1 ? "ships" : "ship"} from abroad — import charges may be due on delivery`);
  return out;
}

/** The small print beside a store's rate name, in order. `fmt` formats cents in the plan's currency. */
export function postageLineBits(group: Pick<BasketStoreGroup, "postage" | "topUpCents">, fmt: (c: number) => string): string[] {
  const p = group.postage;
  const bits: string[] = [];
  if (p.otherOption && p.otherOption.tracked === false && p.tracked !== false) {
    bits.push(`untracked letter ${fmt(p.otherOption.cents)} also offered`);
  } else if (p.otherOption) {
    // Only a rate whose NAME says tracked is called tracked: Mana Market's
    // "Small Bubble Mailer" and a plain "Standard" say nothing either way.
    const o = p.otherOption;
    bits.push(`${o.tracked === true ? "tracked" : "or"}: ${o.label} ${fmt(o.cents)}${o.tracked === null ? " (tracking not stated)" : ""}`);
  }
  if (p.freeFromCents != null && !p.free) {
    bits.push(`free postage from ${fmt(p.freeFromCents)}${p.unmeasuredRegion ? " (to the addresses we measured)" : ""}`);
  }
  if (group.topUpCents > 0 && p.minOrderCents) bits.push(`no postage under ${fmt(p.minOrderCents)} — ${fmt(group.topUpCents)} to add`);
  if (p.notServed?.length) bits.push(`doesn't post to ${p.notServed.join(", ")}`);
  if (p.unmeasuredRegion) {
    bits.push(
      p.free
        ? "free to every address we measured, but not measured to your region — the store may charge for delivery there; confirm at checkout"
        : p.atLeast
          ? "not measured to your region — delivery there usually costs more than the highest rate we measured; confirm at checkout"
          : "not measured to your region — this is the highest rate we measured",
    );
  }
  if (p.beyondMeasured) {
    bits.push(
      p.free
        ? "free on the orders we measured, but this one is bigger than any of them — confirm at checkout"
        : p.upTo
          ? "a bigger order than any we measured, priced at the dearest region — pick yours"
          : "a bigger order than any we measured here, so at least this — confirm at checkout",
    );
  }
  if (p.crossBorder) bits.push(p.crossBorder);
  return bits;
}

/** "(tracked)", "(untracked letter)" or "(tracking not stated)" after a rate's name. */
export function trackedTag(p: Pick<PostageQuote, "tracked">): string {
  return p.tracked === true ? "tracked" : p.tracked === false ? "untracked letter" : "tracking not stated";
}
