import { test } from "node:test";
import assert from "node:assert/strict";
import { inviteOnlyUrl, inviteText, isInviteOnly } from "../src/lib/invite-only";
import { priceOf } from "../src/lib/importer";
import type { FeedProduct } from "../src/lib/feeds";

const INVITE = [
  "Prismatic Evolutions Super Premium Collection - Invite Only",
  "Charizard Ultra Premium Collection (invitation only)",
  "Available by invitation",
  "Raffle entry: Elite Trainer Box",
  "Lottery sale - Booster Bundle",
  "This product is only available to invited customers",
  "Request an invite to purchase this item",
  "Enter the draw for a chance to buy",
  "Purchase ballot: winners will be contacted by email",
];
const BUYABLE = [
  "Destined Rivals Booster Box",
  "Lucky Hits Pokémon Booster Box",
  "Invite your friends and earn store credit with every order",
  "Join our Discord: invite link on the home page",
  "Pokémon TCG: Draw Deck Starter",
  "Shuffle and draw: Commander Deck",
  "Power Reserve (Jungle) Theme Deck",
];

test("invite-only wordings are caught, ordinary titles are not", () => {
  for (const t of INVITE) assert.equal(isInviteOnly(t), true, t);
  for (const t of BUYABLE) assert.equal(isInviteOnly(t), false, t);
});

test("a listing link says it too", () => {
  assert.equal(inviteOnlyUrl("https://www.cellysports.com/products/raffle-purchase?variant=46453179515128"), true);
  assert.equal(inviteOnlyUrl("https://shop.example/products/ultra-premium-invite-only"), true);
  assert.equal(inviteOnlyUrl("https://luckyhits.shop/products/destined-rivals-booster-box?variant=1"), false);
});

test("inviteText strips HTML", () => {
  assert.equal(isInviteOnly(inviteText(["Box", "tags", "<p>Sold <b>invite only</b>.</p>"])), true);
});

test("priceOf never prices an invite-only product", () => {
  const p: FeedProduct = { id: "x", title: "x", url: "https://s/x", imageUrl: null, currency: null, variants: [{ priceCents: 5000, available: true }], inviteOnly: true };
  assert.equal(priceOf(p, 0), null);
  assert.notEqual(priceOf({ ...p, inviteOnly: false }, 0), null);
});
