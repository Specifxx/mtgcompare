import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, parseSupportTicket } from "../src/lib/inbox-rules";
import { parseTicketPatch } from "../src/lib/admin-support";
import { SEED, formatTicketNumber, nextNumber, type CounterClient } from "../src/lib/order-number";

const ok = { name: "Bill", email: "bill@example.com", category: "PAYMENT", subject: "Charged twice", message: "I was charged twice for Plus this month." };

test("a ticket parses; an unknown category is Something else, never an error", () => {
  const r = parseSupportTicket(ok);
  assert.ok(r.ok && r.value.category === "PAYMENT");
  const old = parseSupportTicket({ ...ok, category: "ORDER" });
  assert.ok(old.ok && old.value.category === "OTHER");
  const none = parseSupportTicket({ ...ok, category: undefined });
  assert.ok(none.ok && none.value.category === "OTHER");
});

test("every field is checked: over-long is rejected, never truncated", () => {
  assert.equal(parseSupportTicket(null).ok, false);
  assert.equal(parseSupportTicket({ ...ok, name: "" }).ok, false);
  assert.equal(parseSupportTicket({ ...ok, email: "not an email" }).ok, false);
  assert.equal(parseSupportTicket({ ...ok, email: "a?bcc=x@y.com" }).ok, false);
  assert.equal(parseSupportTicket({ ...ok, subject: "hi" }).ok, false);
  assert.equal(parseSupportTicket({ ...ok, subject: "x".repeat(LIMITS.supportSubjectMax + 1) }).ok, false);
  assert.equal(parseSupportTicket({ ...ok, message: "short" }).ok, false);
  assert.equal(parseSupportTicket({ ...ok, message: "x".repeat(LIMITS.supportMessageMax + 1) }).ok, false);
  const trimmed = parseSupportTicket({ ...ok, name: "  Bill  ", subject: "  Charged twice  " });
  assert.ok(trimmed.ok && trimmed.value.name === "Bill" && trimmed.value.subject === "Charged twice");
});

test("ticket numbers are MC-n and come from an atomic counter seeded below the first", async () => {
  assert.equal(formatTicketNumber(10001), "MC-10001");
  assert.equal(formatTicketNumber(null), null);
  const rows = new Map<string, number>();
  const client: CounterClient = {
    counter: { upsert: async ({ where, create }) => void (rows.has(where.key) || rows.set(where.key, create.value)) },
    $queryRaw: (async (_s: TemplateStringsArray, key: string) => {
      rows.set(key, rows.get(key)! + 1);
      return [{ value: rows.get(key)! }];
    }) as CounterClient["$queryRaw"],
  };
  assert.equal(await nextNumber("support", client), SEED.support + 1);
  assert.equal(await nextNumber("support", client), SEED.support + 2);
});

test("an admin patch needs an id and a known status or a note", () => {
  assert.deepEqual(parseTicketPatch({ id: "abc", status: "RESOLVED" }), { ok: true, id: "abc", patch: { status: "RESOLVED" } });
  assert.deepEqual(parseTicketPatch({ id: "abc", adminNote: "refunded" }), { ok: true, id: "abc", patch: { adminNote: "refunded" } });
  assert.equal(parseTicketPatch({ id: "abc", status: "DONE" }).ok, false);
  assert.equal(parseTicketPatch({ id: "abc" }).ok, false);
  assert.equal(parseTicketPatch({ status: "OPEN" }).ok, false);
  assert.equal(parseTicketPatch({ id: "abc", adminNote: "x".repeat(4001) }).ok, false);
  assert.equal(parseTicketPatch(null).ok, false);
});
