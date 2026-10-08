import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const rules = createRequire(import.meta.url)("../config/security-headers.js") as { source: string; headers: { key: string; value: string }[] }[];

test("every page is frame-restricted except /embed", () => {
  const keys = (src: string) => rules.find((r) => r.source === src)!.headers.map((h) => h.key);
  assert.ok(keys("/embed/:path*").every((k) => k !== "X-Frame-Options"));
  const page = rules.find((r) => r.source !== "/embed/:path*")!;
  assert.ok(page.headers.some((h) => h.key === "X-Frame-Options" && h.value === "SAMEORIGIN"));
  assert.ok(page.headers.some((h) => h.key === "X-Content-Type-Options"));
  const re = new RegExp(`^${page.source.replace(/^\//, "\\/")}$`);
  assert.ok(re.test("/card/lightning-bolt") && !re.test("/embed/index"));
});
