// The profile page and the sign-in slides (owner, 2026-11-22), inside the page budget (ops/product-ux/page-budget.md, 2026-11-23).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BANNED_COPY } from "../src/lib/copy-rules";
import { claimPromptSlot, promptSlotHolder, PROMPT_SILENCE_DAYS, PROMPT_SLOT_KEY } from "../src/lib/prompt-slot";

const read = (p: string) => readFileSync(p, "utf8");

function fakeSession(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
  return m;
}

test("one prompt a visit: the first claims the slot, every other stands down", () => {
  fakeSession();
  assert.equal(promptSlotHolder(), null);
  assert.equal(claimPromptSlot("signin-corner"), true);
  assert.equal(claimPromptSlot("signin-corner"), true, "the holder may ask again");
  assert.equal(claimPromptSlot("extension"), false);
  assert.equal(promptSlotHolder(), "signin-corner");
});

test("the rating card or the return nudge already had the visit: the slot is taken", () => {
  fakeSession({ srv_rate_seen: "1" });
  assert.equal(claimPromptSlot("signin-corner"), false);
  fakeSession({ "rn-state": JSON.stringify({ t: 1, shown: true }) });
  assert.equal(claimPromptSlot("signin-corner"), false);
  fakeSession({ "heavy-popups": "1" });
  assert.equal(claimPromptSlot("signin-corner"), false);
  fakeSession({ "rn-state": JSON.stringify({ t: 1 }) });
  assert.equal(claimPromptSlot("signin-corner"), true);
  const m = fakeSession();
  claimPromptSlot("x");
  assert.equal(m.get(PROMPT_SLOT_KEY), "x");
});

test("no storage: no prompt", () => {
  (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(claimPromptSlot("signin-corner"), false);
});

test("the corner slide: never the first page, after a scroll, the visit's one prompt, closed for 7 days, never signed in", () => {
  const src = read("src/components/account/SignInCorner.tsx");
  assert.match(src, /const ARM_PAGES = 2;/);
  assert.match(src, /SCROLL_ARM = 0\.\d+/);
  assert.match(src, /claimPromptSlot\(SLOT\)/);
  assert.match(src, /close\(PROMPT_SILENCE_DAYS, true\)/);
  assert.equal(PROMPT_SILENCE_DAYS, 7);
  assert.match(src, /if \(readStored\(\)\) return;/);
  assert.match(src, /aria-label="Close"/);
  assert.doesNotMatch(src, /<dialog\b|role="dialog"/);
  assert.match(read("src/app/layout.tsx"), /<SignInCorner \/>/);
  assert.match(read("src/components/site-reviews/RateCard.tsx"), /promptSlotHolder\(\)/);
});

test("the slides sell the free account: no price, no Premium, nothing the copy rules ban", () => {
  const src = read("src/components/account/SignInSlides.tsx");
  const copy = [...src.matchAll(/(?:kicker|title|body|cta): (?:`([^`]*)`|"([^"]*)")/g)].map((m) => m[1] ?? m[2]);
  assert.ok(copy.length >= 12, "every slide's words are read");
  for (const c of copy.map((x) => x.replace(/\$\{[^}]*\}/g, ""))) {
    assert.ok(!BANNED_COPY.test(c), c);
    assert.doesNotMatch(c, /premium|\$|€|£|\d+%/i, c);
  }
  assert.match(src, /prefers-reduced-motion/);
  // One promo banner on the home page: the giveaway strip while the giveaway is open, the slides after it (2026-11-26).
  for (const f of ["src/app/(site)/page.tsx", "src/app/[region]/page.tsx"]) {
    const page = read(f);
    assert.match(page, /<GiveawayStrip surface="home" fallback=\{<SignInSlides surface="home" variant="banner" \/>\} \/>/, f);
    assert.equal((page.match(/<SignInSlides/g) ?? []).length, 1, f);
    assert.equal((page.match(/<GiveawayStrip/g) ?? []).length, 1, f);
  }
});

test("every sign-in carries the prompt that led to it, and is counted once", () => {
  const lib = read("src/lib/premium-member.ts");
  assert.equal((lib.match(/src: signInSource\(\)/g) ?? []).length, 2);
  assert.match(read("src/components/premium/SignIn.tsx"), /rememberSignInSource\(/);
  assert.match(read("src/components/premium/SignIn.tsx"), /trackSignedIn\("google"\)/);
  assert.match(read("src/components/premium/VerifyLink.tsx"), /trackSignedIn\("link"\)/);
});

test("the profile page reads only this browser and the shared account API, and never guesses a number", () => {
  const src = read("src/components/account/ProfileHub.tsx");
  assert.doesNotMatch(src, /cookies\(|headers\(|@\/lib\/db/);
  assert.match(src, /watches\.s === "error" \? "–"/);
  assert.match(read("src/components/premium/SignIn.tsx"), /<ProfileHub info=\{v\.info\} \/>/);
});
