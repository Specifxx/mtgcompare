import test from "node:test";
import assert from "node:assert/strict";

import { sendEmailBrevo, getLastEmailError } from "../src/lib/email";

// Brevo's account-level "Authorised IPs" setting rejects every request from a
// platform with rotating outbound IPs — every Vercel serverless invocation —
// with a 401 and this exact body. First diagnosed 2026-09-14 after a live
// premium-offer batch came back sent 0/90 with nothing else to go on (see
// DECISIONS.md, "why Brevo failed"). It is a Brevo dashboard setting, not
// something this code can retry or route around, so a caller batching
// hundreds of sends deserves the real cause on the FIRST failure rather than
// re-deriving it from a raw 401 body dozens of times.
const IP_BLOCK_BODY = JSON.stringify({
  code: "unauthorized",
  message: "unrecognised IP address 3.235.121.214, please add it under authorised IPs",
});

test("a Brevo 401 for an unrecognised IP surfaces the actual, actionable cause", async (t) => {
  const originalKey = process.env.BREVO_API_KEY;
  process.env.BREVO_API_KEY = "test-key";
  const originalFetch = global.fetch;
  global.fetch = (async () =>
    new Response(IP_BLOCK_BODY, { status: 401 })) as typeof fetch;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = originalKey;
  });

  const ok = await sendEmailBrevo("someone@example.com", "subject", "<p>body</p>");
  assert.equal(ok, false);
  const error = getLastEmailError();
  assert.ok(error, "a failed send must record a reason");
  assert.match(error!, /Authorised IPs/, "must name the actual Brevo setting, not just echo the raw 401");
  assert.match(error!, /not static/i, "must say why allow-listing one IP will not fix it");
  // Never a recipient address in the recorded error — this string can end up
  // in a workflow log or an admin console, neither of which should carry PII.
  assert.doesNotMatch(error!, /someone@example\.com/);
});

test("an unrelated Brevo failure still gets the plain provider/status/body message", async (t) => {
  const originalKey = process.env.BREVO_API_KEY;
  process.env.BREVO_API_KEY = "test-key";
  const originalFetch = global.fetch;
  global.fetch = (async () =>
    new Response(JSON.stringify({ code: "invalid_parameter", message: "sender not verified" }), { status: 400 })) as typeof fetch;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = originalKey;
  });

  const ok = await sendEmailBrevo("someone@example.com", "subject", "<p>body</p>");
  assert.equal(ok, false);
  const error = getLastEmailError();
  assert.match(error!, /^Brevo 400:/);
  assert.match(error!, /sender not verified/);
});
