// PAID AD VISITS ARE TAGGED ON THEIR WAY OUT (2026-11-14, owner: "with the ads, we got to
// make sure that we keep track to see if they actually are giving us ROI").
//
// The A$35 Meta tests (Rift, Dex, Cyberpunk, 14-21 Nov 2026) send visitors with
// `utm_source=facebook&utm_medium=paid&utm_campaign=<site>-test-…`. Counting their visits
// is easy; knowing what they EARNED needs the sale itself to say it came from an ad.
// The only field a sale carries back is the click's sub-id (EPN `customid`, Impact
// `sharedid`/`subId1`, Amazon `ascsubtag`), so a paid visit's affiliate clicks get the
// marker `fbad` added to that sub-id, and the earnings dashboard's "Ad tests" panel sums
// the sales whose tag carries it.
//
// First touch per tab (sessionStorage), like the entry source: a visitor who lands from
// the ad and browses three pages before clicking eBay is still the ad's visitor. Nothing
// about the visitor is stored; the marker is one fixed word per ad network.
//
// THE SAME FILE lives in TCGEmpire (Rift), CompareEmpire (Dex), mtgcompare and the card engine
// (Cyberpunk, Lorcana); keep them alike.

const KEY = "ce_paid";
const SUBID_MAX = 60;
/** Sub-id parameters, in every network our links use. */
const SUB_PARAMS = ["customid", "sharedid", "subId1", "ascsubtag", "clickref"];

/** Pure: the marker for a landing's query string, or null when it is not a paid visit. */
export function paidMarkFor(search: string): string | null {
  const q = new URLSearchParams(search);
  const medium = (q.get("utm_medium") ?? "").trim().toLowerCase();
  const source = (q.get("utm_source") ?? "").trim().toLowerCase();
  const paid = /^(paid|cpc|ppc|paid_social|paidsocial)$/.test(medium) || /_ads$/.test(source);
  if (!paid) return null;
  if (/^(facebook|instagram|meta|fb|ig)/.test(source)) return "fbad";
  if (/^reddit/.test(source)) return "rdad";
  if (/^google/.test(source)) return "ggad";
  return "paidad";
}

// CREATOR VISITS ARE TAGGED THE SAME WAY (2026-11-20, owner: "Let's do it" to the
// pay-per-click creator programme, up to A$300 a month, each creator cut unless they
// return 1.5x within 21 days). A landing with `utm_medium=creator` and
// `utm_campaign=<handle>` gets the marker `cr` + the first six letters and digits of the
// handle (`?utm_campaign=pokechamp__` → `crpokech`), so the earnings dashboard's
// "Creator deals" panel can sum what each paid creator's visitors really earned
// (lib/earnings/creator-deals.ts; its test keeps every deal's marker unique). A free
// creator's link is tagged too, which only adds information.

/** Pure: the creator marker for a landing's query string, or null. */
export function creatorMarkFor(search: string): string | null {
  const q = new URLSearchParams(search);
  if ((q.get("utm_medium") ?? "").trim().toLowerCase() !== "creator") return null;
  return creatorMark(q.get("utm_campaign") ?? "");
}

/** Pure: the marker a creator's utm_campaign maps to ("cr" + six letters or digits), or null. */
export function creatorMark(campaign: string): string | null {
  const core = campaign.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
  return core.length >= 2 ? `cr${core}` : null;
}

/** Pure: the marker for a landing, paid ad first, then creator, or null. */
export const visitMarkFor = (search: string): string | null => paidMarkFor(search) ?? creatorMarkFor(search);

/** Pure: does a sub-id already carry this marker as a whole segment? */
export const hasMark = (sub: string, mark: string) => new RegExp(`(^|[-_])${mark}([-_]|$)`).test(sub.toLowerCase());

/**
 * Pure: `href` with `mark` added to each affiliate sub-id it carries, or null when it
 * carries none (or already has the mark). Only the parameter VALUE is edited, as a
 * string: the rest of the URL (eBay's own rotation, `_trkparms`, encodings) is left
 * byte for byte, because eBay asks for its affiliate URLs to be used as returned.
 * A relative `/go?` link (the card engine's redirect) gets `ad=<mark>` instead, and
 * /go adds the marker when it builds the sub-id.
 */
export function tagHref(href: string, mark: string): string | null {
  if (/^\/go\?/.test(href)) {
    if (/[?&]ad=/.test(href)) return null;
    const hash = href.indexOf("#");
    return hash < 0 ? `${href}&ad=${mark}` : `${href.slice(0, hash)}&ad=${mark}${href.slice(hash)}`;
  }
  let changed = false;
  const out = href.replace(new RegExp(`([?&](?:${SUB_PARAMS.join("|")})=)([^&#]*)`, "g"), (whole, key: string, value: string) => {
    let v = value;
    try {
      v = decodeURIComponent(value);
    } catch {
      /* keep it raw */
    }
    if (hasMark(v, mark)) return whole;
    const base = v.slice(0, SUBID_MAX - mark.length - 1).replace(/-+$/, "");
    changed = true;
    return `${key}${encodeURIComponent(base ? `${base}-${mark}` : mark)}`;
  });
  return changed ? out : null;
}

/** Client: the stored marker for this tab, if the visit came from a paid ad. */
export function readPaidMark(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v && /^[a-z0-9]{2,8}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

let installed = false;

/**
 * Client: remember a paid or creator landing (first touch per tab) and, for those visits only,
 * add the marker to every affiliate link the visitor opens (click, middle-click, or
 * the context menu's "open in new tab"). Safe to call on every page; installs once.
 */
export function installPaidVisitTagger(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  try {
    if (!sessionStorage.getItem(KEY)) {
      const mark = visitMarkFor(window.location.search);
      if (mark) sessionStorage.setItem(KEY, mark);
    }
  } catch {
    /* storage blocked: nothing to tag */
  }
  const mark = readPaidMark();
  if (!mark) return;
  const onPointer = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a) return;
    const raw = a.getAttribute("href") ?? "";
    const next = tagHref(raw, mark);
    if (next) a.setAttribute("href", next);
  };
  for (const type of ["mousedown", "click", "auxclick", "contextmenu", "keydown", "touchstart"]) {
    document.addEventListener(type, onPointer, { capture: true, passive: true });
  }
}
