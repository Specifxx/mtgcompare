import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { challengeResponse } from "@/lib/ebay-deletion";

test("challenge response is sha256(code + token + endpoint), hex", () => {
  const want = crypto.createHash("sha256").update("abc" + "tok" + "https://x/api/ebay/account-deletion").digest("hex");
  assert.equal(challengeResponse("abc", "tok", "https://x/api/ebay/account-deletion"), want);
});
