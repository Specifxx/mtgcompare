import test from "node:test";
import assert from "node:assert/strict";

import {
  ALERT_EMAIL_FULL_ROWS,
  alertRowText,
  buildAlertConfirmationEmail,
  buildPriceDropEmail,
  checkedLabel,
  dropRow,
  emailShell,
  marketCardLink,
  priceDropCopy,
  resendPayload,
  sendPriceDropEmail,
  sortAlertItems,
  storePriceText,
  type AlertStore,
  type PriceDropItem,
} from "../src/lib/email";
import { alertActionLinks } from "../src/lib/alert-actions";
import { SITE_URL } from "../src/lib/site";

// ─────────────────────────────────────────────────────────────────────────────
// Every price-alert email variant, RENDERED (2026-09-25 rebuild): what changed
// in money and %, the watching-since price, condition, up to three stores with
// postage and a delivered total and a Buy button, the checked time, the
// one-tap actions, a plain-text part, List-Unsubscribe headers, and a layout
// with no fixed width wider than a phone.
// ─────────────────────────────────────────────────────────────────────────────

// Action links are signed with EMAIL_LINK_SECRET and absent without it (fail closed).
process.env.EMAIL_LINK_SECRET = "test-link-secret-0123456789abcdef0123456789abcdef";

const CHECKED = new Date("2026-09-25T07:10:00Z"); // 17:10 AEST

const store = (over: Partial<AlertStore> = {}): AlertStore => ({
  retailer: "store:cherry",
  name: "Cherry",
  url: "https://cherry.example/luffy",
  priceCents: 1840,
  condition: "Near Mint",
  postageCents: 895,
  postageBasis: "measured",
  postageUpTo: false,
  deliveredCents: 2735,
  ...over,
});

function item(over: Partial<PriceDropItem> = {}): PriceDropItem {
  const base: PriceDropItem = {
    kind: "drop",
    alertId: "alert1",
    cardId: 100001,
    name: "Monkey.D.Luffy",
    setCode: "OP01",
    number: "OP01-003",
    url: `${SITE_URL}/card/monkey-d-luffy`,
    market: "AU",
    currency: "AUD",
    currentCents: 1840,
    referenceCents: 2090,
    referenceBasis: "emailed",
    startPriceCents: 2500,
    change: { cents: 250, pct: 12 },
    condition: "Near Mint",
    stores: [store()],
    checkedAt: CHECKED,
    targetCents: null,
    tcgMarket: null,
    soldOutAt: null,
    preorder: false,
    releasedOn: null,
    actions: alertActionLinks({ alertId: "alert1", currentCents: 1840, targetCents: null, canTarget: false, now: CHECKED }),
  };
  return { ...base, ...over };
}

const paidActions = (targetCents: number | null, current = 1840) =>
  alertActionLinks({ alertId: "alert1", currentCents: current, targetCents, canTarget: true, now: CHECKED });

const VARIANTS: Record<string, PriceDropItem> = {
  drop: item(),
  target: item({ kind: "target", targetCents: 2000, actions: paidActions(2000) }),
  below_market: item({
    kind: "below_market",
    tcgMarket: { marketCents: 2300, marketUsdCents: 1520, belowCents: 460, belowPct: 20 },
    actions: paidActions(null),
  }),
  restock: item({ kind: "restock", referenceCents: 1900, referenceBasis: "before_soldout", change: { cents: 60, pct: 3 }, soldOutAt: new Date("2026-09-12T03:00:00Z") }),
  listed: item({ kind: "listed", referenceCents: null, referenceBasis: null, change: null, startPriceCents: null }),
  preorder: item({ kind: "preorder", referenceCents: null, referenceBasis: null, change: null, preorder: true, releasedOn: "2026-10-23", setCode: "OP99" }),
};

test("the drop subject names the card, the price, the store and the saving", () => {
  assert.equal(priceDropCopy([VARIANTS.drop!]).subject, "Monkey.D.Luffy: A$18.40 at Cherry, 12% off");
  const c = priceDropCopy([VARIANTS.drop!]);
  assert.match(c.preheader, /^Save A\$2\.50 · checked 17:10 AEST 25 Sep$/);
  assert.equal(c.heading, "A card you're watching got cheaper", "the heading no longer repeats the subject");
});

test("each variant's subject leads with its news", () => {
  assert.equal(priceDropCopy([VARIANTS.target!]).subject, "Monkey.D.Luffy hit your A$20.00 target: A$18.40 at Cherry");
  assert.equal(priceDropCopy([VARIANTS.below_market!]).subject, "Monkey.D.Luffy: A$18.40 at Cherry, 20% under TCGplayer market");
  assert.equal(priceDropCopy([VARIANTS.restock!]).subject, "Monkey.D.Luffy is back in stock: A$18.40 at Cherry");
  assert.equal(priceDropCopy([VARIANTS.listed!]).subject, "Monkey.D.Luffy is now in stock from A$18.40 at Cherry");
  assert.equal(priceDropCopy([VARIANTS.preorder!]).subject, "Monkey.D.Luffy is open for pre-order from A$18.40 at Cherry");
});

test("every variant row: headline, watching-since, condition, stores with delivered total and Buy, checked time", () => {
  for (const [kind, it] of Object.entries(VARIANTS)) {
    const html = dropRow(it);
    assert.match(html, /Near Mint/, `${kind}: condition stated`);
    assert.match(html, /Cherry<\/strong> · A\$18\.40 \+ A\$8\.95 postage ≈ A\$27\.35 delivered/, `${kind}: delivered total`);
    assert.match(html, /href="https:\/\/cherry\.example\/luffy"[^>]*>Buy<\/a>/, `${kind}: a Buy button on the listing`);
    assert.match(html, /Checked 17:10 AEST 25 Sep\. Prices move, so confirm at the store\./, `${kind}: checked time`);
    assert.match(html, /Stop watching/, `${kind}: stop link`);
    assert.match(html, /Snooze 30 days/, `${kind}: snooze link`);
    assert.doesNotMatch(html, /NaN|Infinity|undefined|null/, `${kind}: no broken values`);
  }
  // Drop: money and %, from the price last emailed; the start price.
  const drop = dropRow(VARIANTS.drop!);
  assert.match(drop, /line-through">A\$20\.90<\/span> → <strong[^>]*>A\$18\.40<\/strong> · save A\$2\.50 \(−12%\)/);
  assert.match(drop, /Down from the price we last emailed you/);
  assert.match(drop, /You started watching at A\$25\.00 · Near Mint/);
  // Target.
  assert.match(dropRow(VARIANTS.target!), /Your target A\$20\.00 · now <strong[^>]*>A\$18\.40<\/strong> · A\$1\.60 under it/);
  // Below-market: the TCGplayer market figure, the USD original, the gap.
  assert.match(dropRow(VARIANTS.below_market!), /vs TCGplayer market ≈ A\$23\.00 \(\$15\.20 converted\) · 20% under, save A\$4\.60/);
  // Restock: since when, and the price before it sold out.
  assert.match(dropRow(VARIANTS.restock!), /Back in stock at <strong[^>]*>A\$18\.40<\/strong> · sold out since 12 Sep · A\$19\.00 before it sold out/);
  // Listed: no strikethrough, no start price.
  const listed = dropRow(VARIANTS.listed!);
  assert.match(listed, /Now in stock · from/);
  assert.doesNotMatch(listed, /line-through/);
  assert.match(listed, /No price when you started watching/);
  // Pre-order: labelled with the ship date, never "in stock".
  const pre = dropRow(VARIANTS.preorder!);
  assert.match(pre, /Open for pre-order at <strong[^>]*>A\$18\.40<\/strong> · ships ~23 Oct/);
  assert.doesNotMatch(`${pre} ${priceDropCopy([VARIANTS.preorder!]).subject}`, /in stock/i);
});

test("stores: up to three, and postage only as known — est., up to, free, or 'postage extra'", () => {
  const four = item({
    stores: [
      store(),
      store({ retailer: "store:b", name: "B", priceCents: 1900, postageCents: 800, postageBasis: "estimate", deliveredCents: 2700 }),
      store({ retailer: "store:c", name: "C", priceCents: 1950, postageCents: null, postageBasis: null, deliveredCents: null }),
      store({ retailer: "store:d", name: "D", priceCents: 2000 }),
    ],
  });
  const html = dropRow(four);
  assert.equal((html.match(/>Buy<\/a>/g) ?? []).length, 3);
  assert.doesNotMatch(html, />D<\/strong>/);
  assert.match(html, /A\$19\.00 \+ A\$8\.00 postage \(est\.\) ≈ A\$27\.00 delivered/);
  assert.match(html, /A\$19\.50 item price, postage extra/);
  assert.equal(storePriceText(store({ postageCents: 0, deliveredCents: 1840 }), "AUD"), "A$18.40, free postage = A$18.40 delivered");
  assert.equal(storePriceText(store({ postageUpTo: true }), "AUD"), "A$18.40 + up to A$8.95 postage ≈ up to A$27.35 delivered");
});

test("actions: paid rows get target links, free rows the Plus link — and every link is signed per row", () => {
  const paid = dropRow(VARIANTS.target!);
  assert.doesNotMatch(paid, /Set target at/, "a target at the price shown would re-fire at the next run");
  assert.match(paid, /Lower target to A\$16\.56/, "10% under the A$18.40 price, which is already under the A$20.00 target");
  assert.doesNotMatch(paid, /with Plus/);
  const noTarget = dropRow(VARIANTS.below_market!);
  assert.match(noTarget, /Target 10% under this price \(A\$16\.56\)/, "no target yet: 10% under the price");
  const free = dropRow(VARIANTS.drop!);
  assert.match(free, /Set a target price with Plus/);
  assert.doesNotMatch(free, /Set target at|Lower target|Target 10%/);
  for (const m of free.matchAll(/href="([^"]*alerts\/action\?t=[^"]*)"/g)) {
    assert.ok(m[1]!.startsWith(`${SITE_URL}/alerts/action?t=`), "actions land on the confirmation page, never act on GET");
  }
});

test("the card link carries the watch's market (via /api/market) and a utm tag", () => {
  const link = marketCardLink(VARIANTS.drop!, "price-alert-drop");
  assert.equal(
    link,
    `${SITE_URL}/api/market?m=AU&to=${encodeURIComponent("/card/monkey-d-luffy?utm_source=email&utm_medium=email&utm_campaign=price-alert-drop")}`,
  );
  assert.ok(dropRow(VARIANTS.drop!).includes(link.replace(/&/g, "&amp;")));
});

test("checked times are local to the watch's market", () => {
  assert.equal(checkedLabel(CHECKED, "AU"), "17:10 AEST 25 Sep");
  assert.equal(checkedLabel(CHECKED, "UK"), "08:10 BST 25 Sep");
  assert.equal(checkedLabel(CHECKED, "US"), "03:10 EDT 25 Sep");
  assert.equal(checkedLabel(CHECKED, "SG"), "15:10 SGT 25 Sep");
});

test("a digest is ordered by importance: kind first, then the biggest saving", () => {
  const small = item({ alertId: "s", name: "Small", change: { cents: 60, pct: 5 } });
  const big = item({ alertId: "b", name: "Big", change: { cents: 900, pct: 30 } });
  const listed = { ...VARIANTS.listed!, alertId: "l", name: "Listed" };
  const target = { ...VARIANTS.target!, alertId: "t", name: "Target" };
  assert.deepEqual(sortAlertItems([small, listed, big, target]).map((i) => i.name), ["Target", "Big", "Small", "Listed"]);
  const email = buildPriceDropEmail([small, listed, big, target], "tok", false);
  assert.equal(email.subject, "Target hit your A$20.00 target: A$18.40 at Cherry (+3 more)");
  const order = ["Target", "Big", "Small", "Listed"].map((n) => email.html.indexOf(`>${n}</a>`));
  assert.deepEqual([...order].sort((a, b) => a - b), order, "rendered in that order");
});

test("a big digest renders 10 full rows, then one line each — nothing silently dropped", () => {
  const items = Array.from({ length: 14 }, (_, i) => item({ alertId: `a${i}`, name: `Card ${i}`, change: { cents: 100 + i, pct: 5 } }));
  const email = buildPriceDropEmail(items, "tok", false);
  assert.equal((email.html.match(/>Buy<\/a>/g) ?? []).length, ALERT_EMAIL_FULL_ROWS);
  for (let i = 0; i < 14; i++) assert.ok(email.html.includes(`>Card ${i}</a>`), `Card ${i} is in the email`);
  for (let i = 0; i < 14; i++) assert.ok(email.text.includes(`Card ${i}`), `Card ${i} is in the plain text`);
});

test("the whole email: fluid layout, viewport, preheader, manage/pause/delete links, no wide fixed widths", () => {
  for (const [kind, it] of Object.entries(VARIANTS)) {
    for (const anonymous of [true, false]) {
      const { html } = buildPriceDropEmail([it], "tok-1", anonymous);
      assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
      assert.match(html, /width="100%"[^>]*style="width:100%;max-width:520px/);
      // Nothing fixed wider than a phone: no width attribute or CSS width over 100px.
      assert.doesNotMatch(html, /width="(?:[1-9]\d{2,})"/, `${kind}: no fixed width attribute`);
      assert.doesNotMatch(html, /(?<!max-)width:\s*(?:[1-9]\d{2,})px/, `${kind}: no fixed CSS width`);
      assert.doesNotMatch(html, /white-space:\s*nowrap/);
      assert.match(html, /display:none;max-height:0/, "hidden preheader");
      assert.match(html, /Pause alert emails \(your watchlist is kept\)/);
      assert.match(html, /\/unsubscribe\?token=tok-1&amp;mode=delete[^>]*>Delete all my watches/);
      assert.doesNotMatch(html, /Unsubscribe from price-drop emails/, "the footer no longer deletes everything");
      assert.match(html, /at most once a week/);
      if (anonymous) {
        assert.match(html, /\/alerts\/manage\?token=tok-1&amp;utm_source=email[^"]*"[^>]*>Manage your watchlist/);
        assert.match(html, /Create your free account/);
      } else {
        assert.match(html, /\/watching\?utm_source=email&amp;utm_medium=email&amp;utm_campaign=price-alert-/);
        assert.doesNotMatch(html, /Create your free account/);
      }
    }
  }
  // Every other email shares the shell, so it is fluid too.
  assert.doesNotMatch(emailShell("h", "", ""), /width="520"/);
});

test("the plain-text part says what the HTML says", () => {
  const { text } = buildPriceDropEmail([VARIANTS.drop!, VARIANTS.target!], "tok", false);
  assert.match(text, /^Price news on 2 cards you're watching/);
  assert.match(text, /A\$20\.90 → A\$18\.40 · save A\$2\.50 \(−12%\)/);
  assert.match(text, /- Cherry: A\$18\.40 \+ A\$8\.95 postage ≈ A\$27\.35 delivered\n {4}Buy: https:\/\/cherry\.example\/luffy/);
  assert.match(text, /Checked 17:10 AEST 25 Sep/);
  assert.match(text, /Stop watching: https:\/\/\S+\/alerts\/action\?t=/);
  assert.match(text, /Snooze 30 days: /);
  assert.match(text, /Pause alert emails \(your watchlist is kept\): \S+\/unsubscribe\?token=tok/);
  assert.match(text, /Delete all my watches: /);
  assert.doesNotMatch(text, /<[a-z]/i, "no HTML in the text part");
  assert.match(alertRowText(VARIANTS.preorder!), /Open for pre-order at A\$18\.40 · ships ~23 Oct/);
});

test("List-Unsubscribe points at the one-click PAUSE, and the send carries it with the text part", async () => {
  const email = buildPriceDropEmail([VARIANTS.drop!], "tok 1", false);
  assert.deepEqual(email.headers, {
    "List-Unsubscribe": `<${SITE_URL}/api/alerts/unsubscribe?token=tok%201&mode=pause>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
  assert.deepEqual(resendPayload({ from: "f", to: "t", subject: "s", html: "h" }), { from: "f", to: "t", subject: "s", html: "h" }, "other sends unchanged");

  // End to end through sendEmail, with the provider stubbed.
  const realFetch = globalThis.fetch;
  const realKey = process.env.RESEND_API_KEY;
  const realFrom = process.env.EMAIL_FROM;
  let body: Record<string, unknown> | null = null;
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "OP Compare <alerts@opcompare.app>";
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    body = JSON.parse(init.body);
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  try {
    assert.equal(await sendPriceDropEmail("a@example.com", [VARIANTS.drop!], "tok 1", false), true);
  } finally {
    globalThis.fetch = realFetch;
    if (realKey == null) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = realKey;
    if (realFrom == null) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = realFrom;
  }
  assert.ok(body);
  const b = body as unknown as { headers: Record<string, string>; text: string; subject: string };
  assert.equal(b.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(b.headers["List-Unsubscribe"]!, /mode=pause>$/);
  assert.match(b.text, /Monkey.D.Luffy/);
  assert.equal(b.subject, "Monkey.D.Luffy: A$18.40 at Cherry, 12% off");
});

test("scraped strings are escaped", () => {
  const html = dropRow(item({ name: "<script>x</script>", stores: [store({ name: "A&B <b>", url: 'https://x.example/"q' })] }));
  assert.doesNotMatch(html, /<script>|<b>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /A&amp;B &lt;b&gt;/);
  assert.match(html, /x\.example\/&quot;q/);
});

test("the confirmation names the cards, their market and today's price, and states the cadence", () => {
  const cards = [
    { name: "Monkey.D.Luffy", setCode: "OP01", number: "OP01-003", url: `${SITE_URL}/card/luffy`, market: "AU" as const, priceCents: 1840, storeName: "Cherry", condition: null },
    { name: "Roronoa Zoro", setCode: "OP01", number: "OP01-025", url: `${SITE_URL}/card/zoro`, market: "AU" as const, priceCents: null, storeName: null },
  ];
  const email = buildAlertConfirmationEmail(cards, 12, "tok", true);
  assert.equal(email.subject, "You're watching 12 cards on OP Compare");
  for (const part of [email.html, email.text]) {
    assert.match(part, /Monkey.D.Luffy/);
    // The alert price admits unstated-condition copies: never called Near Mint unless the store says so.
    assert.match(part, /cheapest now A\$18\.40 at Cherry · Condition not stated by the store/);
    assert.doesNotMatch(part, /cheapest Near Mint/);
    // The minimum drop in the market's own currency, not a hard-coded "50 cents".
    assert.match(part, /falls at least 5% \(and at least A\$0\.50\) to a new low/);
    assert.match(part, /not in stock at a store yet/);
    assert.match(part, /and 10 more\./);
    assert.match(part, /At most one email a week for free alerts/);
    assert.match(part, /Plus and Premium target, below-market and restock alerts can arrive after each price update/);
  }
  assert.match(email.html, /Manage these alerts/);
  assert.match(email.html, /\/api\/market\?m=AU/);
  assert.equal(email.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.doesNotMatch(email.html, /width="520"/);
  assert.equal(buildAlertConfirmationEmail([cards[0]!], 1, "tok").subject, "You're watching Monkey.D.Luffy on OP Compare");
  // A stated condition is printed as the store states it; a UK watch says pence.
  const uk = buildAlertConfirmationEmail([{ ...cards[0]!, market: "UK" as const, condition: "Near Mint" }], 1, "tok");
  assert.match(uk.text, /cheapest now £18\.40 at Cherry · Near Mint/);
  assert.match(uk.text, /at least £0\.50\)/);
  const mixed = buildAlertConfirmationEmail([cards[0]!, { ...cards[1]!, market: "US" as const }], 2, "tok");
  assert.match(mixed.text, /at least 50 cents or pence, in your market's currency/);
});
