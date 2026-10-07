// Admin status is granted BY EMAIL ADDRESS (lib/admin-emails.ts), so an OAuth
// email is a claim until the provider says it verified it: an unverified
// sign-in carrying the owner's address must never become, or attach to, an
// account. Adapted from RiftCompare's tests/oauth-email-verified.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { normaliseProfile } from "../src/lib/oauth";

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const accounts = stripComments(fs.readFileSync(path.resolve(__dirname, "../src/lib/accounts.ts"), "utf8"));

test("each provider's verification flag is read, never assumed", () => {
  const g = normaliseProfile("google", { sub: "1", email: "X@Y.com", email_verified: false });
  assert.equal(g.emailVerified, false);
  assert.equal(g.email, "x@y.com");
  assert.equal(normaliseProfile("google", { sub: "1", email: "x@y.com", email_verified: true }).emailVerified, true);
  assert.equal(normaliseProfile("discord", { id: "2", email: "x@y.com", verified: undefined }).emailVerified, false);
  assert.equal(normaliseProfile("discord", { id: "2", email: "x@y.com", verified: false }).emailVerified, false);
  assert.equal(normaliseProfile("discord", { id: "2", email: "x@y.com", verified: true }).emailVerified, true);
});

test("an unverified email stops before any lookup by email", () => {
  const guard = accounts.indexOf("if (!p.emailVerified) return null");
  const byEmail = accounts.indexOf("findUnique({ where: { email");
  assert.ok(guard > 0, "the verified-email guard exists");
  assert.ok(byEmail > 0, "the lookup by email exists");
  assert.ok(guard < byEmail, "the guard runs before the lookup by email");
});

test("signing in by provider id never rewrites the account's email", () => {
  const start = accounts.indexOf("if (byProvider)");
  assert.ok(start > 0);
  const block = accounts.slice(start, accounts.indexOf("return", start));
  const data = block.slice(block.indexOf("data:"));
  assert.doesNotMatch(data, /\bemail:/, "the provider-linked update must not touch email");
});
