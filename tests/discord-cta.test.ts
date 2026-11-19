import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DISCORD_INVITE } from "../src/lib/site";

// The Discord hub (owner, 2026-11-20): this site's own invite, shown with a reason, under the price table and in the footer.
test("the Discord box links this site's own hub invite, under the price table", () => {
  assert.match(DISCORD_INVITE, /^https:\/\/discord\.gg\/[A-Za-z0-9]+$/);
  const page = readFileSync("src/app/[region]/p/[slug]/page.tsx", "utf8");
  assert.ok(page.indexOf("<DiscordCta") > page.indexOf("<PriceAlert"), "the box sits below the best price and alert");
  assert.match(readFileSync("src/components/Footer.tsx", "utf8"), /<DiscordCta href=\{DISCORD_INVITE\}/);
  assert.match(readFileSync("src/components/DiscordCta.tsx", "utf8"), /Restock and deal alerts/);
});
