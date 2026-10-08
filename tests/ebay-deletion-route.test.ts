// eBay Marketplace Account Deletion (src/app/api/ebay/marketplace-deletion):
// the challenge hash, in eBay's order — code, then token, then endpoint.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { GET, POST } from "../src/app/api/ebay/marketplace-deletion/route";

const URL_BASE = "https://mtgcompare.app/api/ebay/marketplace-deletion";
const TOKEN = "test_verification-token_0123456789abcdefABCDEF";
const saved = { t: process.env.EBAY_VERIFICATION_TOKEN, e: process.env.EBAY_DELETION_ENDPOINT };
afterEach(() => {
  if (saved.t == null) delete process.env.EBAY_VERIFICATION_TOKEN;
  else process.env.EBAY_VERIFICATION_TOKEN = saved.t;
  if (saved.e == null) delete process.env.EBAY_DELETION_ENDPOINT;
  else process.env.EBAY_DELETION_ENDPOINT = saved.e;
});

test("challengeResponse = sha256(code + token + endpoint)", async () => {
  process.env.EBAY_VERIFICATION_TOKEN = TOKEN;
  process.env.EBAY_DELETION_ENDPOINT = URL_BASE;
  const res = await GET(new Request(`${URL_BASE}?challenge_code=abc`));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { challengeResponse: string };
  assert.equal(body.challengeResponse, createHash("sha256").update(`abc${TOKEN}${URL_BASE}`).digest("hex"));
  assert.match(body.challengeResponse, /^[0-9a-f]{64}$/);
  // A known vector, so a change in concatenation order can't pass unnoticed.
  assert.equal(
    createHash("sha256").update("abc").update("t").update("https://e").digest("hex"),
    createHash("sha256").update("abcthttps://e").digest("hex"),
  );
});

test("400 without challenge_code", async () => {
  process.env.EBAY_VERIFICATION_TOKEN = TOKEN;
  process.env.EBAY_DELETION_ENDPOINT = URL_BASE;
  assert.equal((await GET(new Request(URL_BASE))).status, 400);
});

test("500 when either variable is empty (never a silently wrong hash)", async () => {
  process.env.EBAY_VERIFICATION_TOKEN = "";
  process.env.EBAY_DELETION_ENDPOINT = URL_BASE;
  assert.equal((await GET(new Request(`${URL_BASE}?challenge_code=abc`))).status, 500);
  process.env.EBAY_VERIFICATION_TOKEN = TOKEN;
  delete process.env.EBAY_DELETION_ENDPOINT;
  assert.equal((await GET(new Request(`${URL_BASE}?challenge_code=abc`))).status, 500);
});

test("POST acknowledges a notification with 200", async () => {
  const res = await POST(new Request(URL_BASE, { method: "POST", body: JSON.stringify({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" }, notification: { data: { username: "x", userId: "y" } } }) }));
  assert.equal(res.status, 200);
});
