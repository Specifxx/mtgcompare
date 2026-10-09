import type { Country } from "./country";
import { moneyCode as formatMoney } from "./format";
import { SITE_URL } from "./site";
import { EMAIL_COLORS as C, SITE_LINE, alertListHeaders, checkedLabel, emailButton, emailShell, escapeHtml, sendEmail } from "./email";
import { watchActionLinks, type WatchActionLinks } from "./alert-actions";
import { SEALED_CHECK_CADENCE, SEALED_CHECK_SENTENCE } from "./alert-limits";

// MTG Compare (wave 2, 2026-10-03): RiftCompare's lib/watch-emails.ts. A sealed
// watch is keyed by Sealed.id (RiftCompare: a listing groupKey), and MTG Compare
// has no MSRP table yet (lib/alert-limits.ts SEALED_RRP_MARKETS = []), so a
// sealed email names no RRP. The deck price watch's run is the tools track's
// (lib/deck-watch.ts runDeckWatches); its email lives here beside the sealed one.

/** The deck watch's minimum condition, in words (RiftCompare lib/basket-condition.ts MIN_CONDITION_PHRASE). */
export const MIN_CONDITION_PHRASE: Record<"nm" | "lp", string> = { nm: "Near Mint only", lp: "Lightly Played or better" };

// ─────────────────────────────────────────────────────────────────────────────
// THE DECK PRICE WATCH AND SEALED WATCH EMAILS (2026-09-29, "Premium works
// while you're away"). One email per watch, never a digest: each is about one
// list or one product, with its own stop / snooze links (lib/alert-actions.ts,
// kind "deck" / "sealed"). Same shell, same honesty rules as the card alerts:
// the figures are the run's own, "checked" names when the listing was seen,
// and the store's checkout is final.
// ─────────────────────────────────────────────────────────────────────────────

const utm = (campaign: string) => `utm_source=email&utm_medium=email&utm_campaign=${encodeURIComponent(campaign)}`;

// A watch email's List-Unsubscribe is what a mail client's "Unsubscribe" button
// uses, so it must STOP: its one-click POST (RFC 8058) deletes this one watch
// through the same signed route the confirmation page uses (the token is the
// watch's stop token, so it can do nothing else). The URL also answers a plain
// GET — mail clients that do not do one-click open it in a browser — with a
// redirect to the confirmation page, which changes nothing until its button is
// pressed (api/alerts/action). Snooze stays a link in the body.
function watchHeaders(links: WatchActionLinks): Record<string, string> {
  return alertListHeaders({ oneClick: `${SITE_URL}/api/alerts/action?t=${encodeURIComponent(new URL(links.stop).searchParams.get("t") ?? "")}` });
}

// The cadence a sealed watch is honestly sold at: the import publishes once a
// day (schedule.ts; SEALED_CHECK_CADENCE reads it); the scheduler can start one late. Never "instant". A Discord stock
// bot polls faster than a price site can, so the copy says so instead of
// pretending otherwise.
const SEALED_CADENCE_NOTE = SEALED_CHECK_SENTENCE;

function watchFooter(kind: "deck" | "sealed", links: WatchActionLinks, manage: string): string {
  const what = kind === "deck" ? "this list's delivered price" : "this sealed product";
  const cadence = kind === "deck" ? "it is checked after every price update" : `sealed products are checked ${SEALED_CHECK_CADENCE}`;
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid ${C.border};font-size:12px;line-height:1.6;color:${C.muted}">
    You're getting this because you asked MTG Compare to watch ${what}${kind === "deck" ? " (Premium)" : " (Plus or Premium)"}; ${cadence}.<br/>
    <a href="${escapeHtml(links.stop)}" style="color:${C.link};text-decoration:underline">Stop watching</a>
    &nbsp;·&nbsp; <a href="${escapeHtml(links.snooze)}" style="color:${C.link};text-decoration:underline">Snooze 30 days</a>
    &nbsp;·&nbsp; <a href="${escapeHtml(manage)}" style="color:${C.link};text-decoration:underline">Manage your watches</a><br/>
    ${SITE_LINE}
  </td></tr>`;
}

export interface BuiltWatchEmail {
  subject: string;
  heading: string;
  preheader: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

// ── Deck price watch ─────────────────────────────────────────────────────────

export type DeckWatchKind = "deck_target" | "deck_drop";

export interface DeckWatchStoreLine {
  name: string;
  subtotalCents: number;
  shippingCents: number;
  items: number;
}

export interface DeckWatchItem {
  kind: DeckWatchKind;
  watchId: string;
  name: string;
  market: Country;
  currency: string;
  totalCents: number; // delivered: items + postage (+ any minimum-order top-up)
  itemsCents: number;
  shippingCents: number;
  storeCount: number;
  coveredCopies: number;
  requestedCopies: number;
  targetCents: number | null;
  // What the change is measured from: the total we last emailed (while live),
  // else the total the last run saw. null the first time.
  referenceCents: number | null;
  referenceBasis: "emailed" | "last" | null;
  // The watch's minimum condition (lib/basket-condition.ts); "any" or absent
  // prints nothing, "nm" / "lp" says cheaper played copies were left out.
  minCondition?: "nm" | "lp" | "any";
  stores: DeckWatchStoreLine[]; // the plan's stores, dearest first, at most 3
  checkedAt: Date;
  actions?: WatchActionLinks | null; // absent: sendDeckWatchEmail signs the stop and snooze links itself (the deck run builds none)
}

/** The page that re-runs this watch's saved list for its owner. */
export function deckWatchBasketUrl(watchId: string, campaign = "deck-watch"): string {
  return `${SITE_URL}/tools/best-basket?watch=${encodeURIComponent(watchId)}&${utm(campaign)}`;
}

export function deckWatchCopy(item: DeckWatchItem): { subject: string; heading: string; preheader: string; changeLine: string } {
  const m = (c: number) => formatMoney(c, item.currency);
  const total = m(item.totalCents);
  const change =
    item.referenceCents != null && item.referenceCents > item.totalCents
      ? { cents: item.referenceCents - item.totalCents, pct: Math.round(((item.referenceCents - item.totalCents) / item.referenceCents) * 100) }
      : null;
  const changeLine =
    change && item.referenceBasis === "emailed"
      ? `${m(change.cents)} (${change.pct}%) less than the ${m(item.referenceCents!)} we last emailed you.`
      : change
        ? `${m(change.cents)} (${change.pct}%) less than the ${m(item.referenceCents!)} it was at our last check.`
        : item.referenceCents != null
          ? `Last check: ${m(item.referenceCents)}.`
          : "";
  const subject =
    item.kind === "deck_target"
      ? `${item.name} is now ${total} delivered (target ${m(item.targetCents ?? item.totalCents)})`
      : `${item.name} is now ${total} delivered${change ? `, ${change.pct}% less` : ""}`;
  return {
    subject,
    heading: item.kind === "deck_target" ? "Your deck is under your target" : "Your deck got cheaper",
    preheader: `${total} delivered from ${item.storeCount} ${item.storeCount === 1 ? "store" : "stores"} · checked ${checkedLabel(item.checkedAt, item.market)}`,
    changeLine,
  };
}

export function buildDeckWatchEmail(item: DeckWatchItem): BuiltWatchEmail {
  const m = (c: number) => formatMoney(c, item.currency);
  const { subject, heading, preheader, changeLine } = deckWatchCopy(item);
  const campaign = item.kind.replace("_", "-");
  const basket = deckWatchBasketUrl(item.watchId, campaign);
  const manage = `${SITE_URL}/watching?${utm(campaign)}`;
  const stores = item.stores.slice(0, 3);
  const coverage =
    item.coveredCopies < item.requestedCopies
      ? `This covers ${item.coveredCopies} of the ${item.requestedCopies} copies on the list; the rest have no in-stock copy at a store that posts to you.`
      : `Every copy on the list is in stock.`;
  const postage = item.shippingCents === 0 ? "free postage" : `${m(item.shippingCents)} postage`;
  // The floor the total was priced at, so the email and the page agree.
  const floorLine = item.minCondition && item.minCondition !== "any" ? `Priced at ${MIN_CONDITION_PHRASE[item.minCondition]}: cheaper copies in a lower condition are left out.` : "";
  const storeRows = stores
    .map(
      (s) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid ${C.rule};font-size:13px;line-height:1.5;color:${C.text}"><strong style="color:${C.white}">${escapeHtml(s.name)}</strong> · ${s.items} ${s.items === 1 ? "card" : "cards"} · ${m(s.subtotalCents)}${s.shippingCents === 0 ? ", free postage" : ` + ${m(s.shippingCents)} postage`}</td></tr>`,
    )
    .join("");
  const actions = item.actions;
  const inner = `
    <tr><td style="padding:8px 32px 0;font-size:14px;line-height:1.6;color:${C.text}">
      <strong style="color:${C.white};font-size:15px">${escapeHtml(item.name)}</strong> <span style="border:1px solid ${C.border};border-radius:6px;padding:0 5px;font-size:12px;color:${C.muted}">${item.market}</span><br/>
      <span style="font-size:22px;font-weight:800;color:${C.accent}">${total(m, item)}</span> delivered: ${m(item.itemsCents)} of cards + ${postage}, from ${item.storeCount} ${item.storeCount === 1 ? "store" : "stores"}.
      ${item.kind === "deck_target" && item.targetCents != null ? `<br/>Your target is ${m(item.targetCents)}.` : ""}
      ${changeLine ? `<br/>${escapeHtml(changeLine)}` : ""}
      <br/><span style="font-size:12px;color:${C.muted}">${escapeHtml(coverage)}${floorLine ? ` ${escapeHtml(floorLine)}` : ""}</span>
    </td></tr>
    ${storeRows ? `<tr><td style="padding:10px 32px 0"><div style="font-size:12px;color:${C.muted};margin-bottom:2px">Where the plan buys${item.stores.length > 3 ? " (largest orders first)" : ""}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">${storeRows}</table></td></tr>` : ""}
    <tr><td style="padding:14px 32px 4px">${emailButton(basket, "See the store-by-store plan")}</td></tr>
    <tr><td style="padding:4px 32px 16px;font-size:12px;line-height:1.7;color:${C.muted}">
      Checked ${escapeHtml(checkedLabel(item.checkedAt, item.market))}. Prices and postage move, so the stores' checkouts are final.<br/>
      ${actions ? `<a href="${escapeHtml(actions.stop)}" style="color:${C.link};text-decoration:underline">Stop watching this list</a> &nbsp;·&nbsp; <a href="${escapeHtml(actions.snooze)}" style="color:${C.link};text-decoration:underline">Snooze 30 days</a>` : ""}
    </td></tr>`;
  const text = [
    heading,
    `${item.name} (${item.market}): ${m(item.totalCents)} delivered — ${m(item.itemsCents)} of cards + ${postage}, from ${item.storeCount} ${item.storeCount === 1 ? "store" : "stores"}.`,
    item.kind === "deck_target" && item.targetCents != null ? `Your target is ${m(item.targetCents)}.` : "",
    changeLine,
    coverage,
    floorLine,
    ...stores.map((s) => `  - ${s.name}: ${s.items} ${s.items === 1 ? "card" : "cards"}, ${m(s.subtotalCents)}${s.shippingCents === 0 ? ", free postage" : ` + ${m(s.shippingCents)} postage`}`),
    `See the store-by-store plan: ${basket}`,
    `Checked ${checkedLabel(item.checkedAt, item.market)}. Prices and postage move, so the stores' checkouts are final.`,
    ...(actions ? [`Stop watching this list: ${actions.stop}`, `Snooze 30 days: ${actions.snooze}`] : []),
    `Manage your watches: ${manage}`,
  ]
    .filter(Boolean)
    .join("\n");
  const links = actions ?? { stop: manage, snooze: manage };
  return {
    subject,
    heading,
    preheader,
    html: emailShell(heading, inner, watchFooter("deck", links, manage), preheader),
    text,
    headers: actions ? watchHeaders(actions) : {},
  };
}

function total(m: (c: number) => string, item: { totalCents: number }): string {
  return escapeHtml(m(item.totalCents));
}

export async function sendDeckWatchEmail(to: string, item: DeckWatchItem): Promise<boolean> {
  const e = buildDeckWatchEmail(item.actions === undefined ? { ...item, actions: watchActionLinks({ kind: "deck", id: item.watchId }) } : item);
  return sendEmail(to, e.subject, e.html, { text: e.text, headers: e.headers });
}

// ── Sealed watch ─────────────────────────────────────────────────────────────

export type SealedWatchKind = "sealed_restock" | "sealed_rrp" | "sealed_target" | "sealed_drop";

export interface SealedWatchItem {
  kind: SealedWatchKind;
  watchId: string;
  sealedId: number;
  slug: string;
  name: string;
  productType: string;
  setCode: string | null;
  market: Country;
  currency: string;
  priceCents: number; // the cheapest open listing at a real store
  rrpCents: number | null; // always null on MTG Compare until an MSRP table exists
  store: { name: string; url: string; retailer: string }; // affiliate-tagged, loc /email-alert-sealed
  storeCount: number; // real stores with an open listing
  targetCents: number | null;
  referenceCents: number | null; // the price we last emailed (live), else the last price
  referenceBasis: "emailed" | "last" | null;
  soldOutAt: Date | null; // for a restock: since when
  checkedAt: Date; // the lead listing's last successful read
  actions: WatchActionLinks | null;
}

/** "A$118, RRP A$120 — A$2 under" / "A$150, RRP A$120 — A$30 over" / "" */
export function rrpGapText(priceCents: number, rrpCents: number | null, currency: string): string {
  if (rrpCents == null) return "";
  const m = (c: number) => formatMoney(c, currency);
  const diff = priceCents - rrpCents;
  if (diff === 0) return `${m(priceCents)}, at RRP (${m(rrpCents)})`;
  return `${m(priceCents)}, RRP ${m(rrpCents)} — ${m(Math.abs(diff))} ${diff < 0 ? "under" : "over"}`;
}

export function sealedWatchCopy(item: SealedWatchItem): { subject: string; heading: string; preheader: string } {
  const m = (c: number) => formatMoney(c, item.currency);
  const price = m(item.priceCents);
  const at = ` at ${item.store.name}`;
  const change =
    item.referenceCents != null && item.referenceCents > item.priceCents
      ? Math.round(((item.referenceCents - item.priceCents) / item.referenceCents) * 100)
      : 0;
  let subject: string;
  let heading: string;
  switch (item.kind) {
    case "sealed_restock":
      subject = `${item.name} is back in stock: ${price}${at}`;
      heading = "Back in stock";
      break;
    case "sealed_rrp":
      subject = `${item.name} is at RRP: ${price}${at}${item.rrpCents != null ? ` (RRP ${m(item.rrpCents)})` : ""}`;
      heading = "In stock at RRP";
      break;
    case "sealed_target":
      subject = `${item.name} hit your ${item.targetCents != null ? `${m(item.targetCents)} ` : ""}target: ${price}${at}`;
      heading = "Your target price is met";
      break;
    default:
      subject = `${item.name}: ${price}${at}${change > 0 ? `, ${change}% off` : ""}`;
      heading = "A sealed product you're watching got cheaper";
  }
  return { subject, heading, preheader: `${rrpGapText(item.priceCents, item.rrpCents, item.currency) || price} · checked ${checkedLabel(item.checkedAt, item.market)}` };
}

export function buildSealedWatchEmail(item: SealedWatchItem): BuiltWatchEmail {
  const m = (c: number) => formatMoney(c, item.currency);
  const { subject, heading, preheader } = sealedWatchCopy(item);
  const campaign = item.kind.replace("_", "-");
  const manage = `${SITE_URL}/watching?${utm(campaign)}`;
  const sealed = `${SITE_URL}/sealed/${encodeURIComponent(item.slug)}?${utm(campaign)}`;
  const gap = rrpGapText(item.priceCents, item.rrpCents, item.currency);
  const changeLine =
    item.referenceCents != null && item.referenceCents !== item.priceCents
      ? `${item.referenceBasis === "emailed" ? "We last emailed you at" : "Our last check saw"} ${m(item.referenceCents)}.`
      : "";
  const since = item.kind === "sealed_restock" && item.soldOutAt ? `Sold out at every store we track since ${checkedLabel(item.soldOutAt, item.market)}.` : "";
  // When the store's page was last read, in the body and in bold: a restock is
  // only worth acting on while it is still true, and the reader should see how
  // old this reading is before they click, not in the small print.
  const checked = `Checked ${checkedLabel(item.checkedAt, item.market)} at ${item.store.name}.`;
  const actions = item.actions;
  const inner = `
    <tr><td style="padding:8px 32px 0;font-size:14px;line-height:1.6;color:${C.text}">
      <strong style="color:${C.white};font-size:15px">${escapeHtml(item.name)}</strong> <span style="border:1px solid ${C.border};border-radius:6px;padding:0 5px;font-size:12px;color:${C.muted}">${item.market}</span><br/>
      <span style="font-size:12px;color:${C.muted}">${escapeHtml(item.productType)}${item.setCode ? ` · ${escapeHtml(item.setCode)}` : ""}</span><br/>
      <span style="font-size:22px;font-weight:800;color:${C.accent}">${escapeHtml(m(item.priceCents))}</span> at <strong style="color:${C.white}">${escapeHtml(item.store.name)}</strong>${item.storeCount > 1 ? `, the cheapest of ${item.storeCount} stores with it in stock` : ""}.
      ${gap ? `<br/>${escapeHtml(gap)}.` : ""}
      ${item.kind === "sealed_target" && item.targetCents != null ? `<br/>Your target is ${m(item.targetCents)}.` : ""}
      ${changeLine ? `<br/>${escapeHtml(changeLine)}` : ""}
      ${since ? `<br/>${escapeHtml(since)}` : ""}
      <br/><strong style="color:${C.white}">${escapeHtml(checked)}</strong> <span style="color:${C.link}">Stock can sell out again before you get there.</span>
    </td></tr>
    <tr><td style="padding:14px 32px 4px">${emailButton(item.store.url, `Buy at ${escapeHtml(item.store.name)}`)}
      <div style="margin-top:10px;font-size:13px"><a href="${escapeHtml(sealed)}" style="color:${C.accent};font-weight:700;text-decoration:none">Compare every store →</a></div></td></tr>
    <tr><td style="padding:4px 32px 16px;font-size:12px;line-height:1.7;color:${C.muted}">
      ${escapeHtml(SEALED_CADENCE_NOTE)} The store's checkout is final.<br/>
      ${actions ? `<a href="${escapeHtml(actions.stop)}" style="color:${C.link};text-decoration:underline">Stop watching this product</a> &nbsp;·&nbsp; <a href="${escapeHtml(actions.snooze)}" style="color:${C.link};text-decoration:underline">Snooze 30 days</a>` : ""}
    </td></tr>`;
  const text = [
    heading,
    `${item.name} (${item.productType}${item.setCode ? ` · ${item.setCode}` : ""} · ${item.market}): ${m(item.priceCents)} at ${item.store.name}${item.storeCount > 1 ? `, the cheapest of ${item.storeCount} stores with it in stock` : ""}.`,
    gap ? `${gap}.` : "",
    item.kind === "sealed_target" && item.targetCents != null ? `Your target is ${m(item.targetCents)}.` : "",
    changeLine,
    since,
    `${checked} Stock can sell out again before you get there.`,
    `Buy at ${item.store.name}: ${item.store.url}`,
    `Compare every store: ${sealed}`,
    `${SEALED_CADENCE_NOTE} The store's checkout is final.`,
    ...(actions ? [`Stop watching this product: ${actions.stop}`, `Snooze 30 days: ${actions.snooze}`] : []),
    `Manage your watches: ${manage}`,
  ]
    .filter(Boolean)
    .join("\n");
  const links = actions ?? { stop: manage, snooze: manage };
  return {
    subject,
    heading,
    preheader,
    html: emailShell(heading, inner, watchFooter("sealed", links, manage), preheader),
    text,
    headers: actions ? watchHeaders(actions) : {},
  };
}

export async function sendSealedWatchEmail(to: string, item: SealedWatchItem): Promise<boolean> {
  const e = buildSealedWatchEmail(item);
  return sendEmail(to, e.subject, e.html, { text: e.text, headers: e.headers });
}
