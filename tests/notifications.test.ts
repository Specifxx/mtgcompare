// In-app notifications (lib/notifications.ts): the cross-track notify()
// contract, the mark-read body, and that nothing polls.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseReadBody, FEED_SIZE } from "../src/lib/notifications";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("notify(userId, type, title, body, href) is the contract the alert run writes through", () => {
  assert.match(read("src/lib/notifications.ts"), /export async function notify\(userId: string, type: string, title: string, body: string, href\?: string \| null\)/);
});

test("mark-read takes one id or all, nothing else", () => {
  assert.deepEqual(parseReadBody({ id: "n1" }), { id: "n1" });
  assert.deepEqual(parseReadBody({ all: true }), { all: true });
  assert.equal(parseReadBody({ all: "yes" }), null);
  assert.equal(parseReadBody({ id: "" }), null);
  assert.equal(parseReadBody(null), null);
  assert.equal(FEED_SIZE, 30);
});

test("the routes are scoped to the caller, and no client polls the count", () => {
  for (const p of ["src/app/api/notifications/route.ts", "src/app/api/notifications/read/route.ts", "src/app/api/notifications/unread-count/route.ts"]) {
    const src = read(p);
    assert.match(src, /getCurrentUser\(\)/);
    assert.doesNotMatch(src, /@\/lib\/db"/);
  }
  assert.match(read("src/lib/notifications.ts"), /where: \{ userId, readAt: null, \.\.\.\(which\.id \? \{ id: which\.id \} : \{\}\) \}/);
  for (const p of ["src/lib/use-unread.ts", "src/components/HeaderWatchButton.tsx", "src/components/RecentAlerts.tsx"]) assert.doesNotMatch(read(p), /setInterval/, p);
});
