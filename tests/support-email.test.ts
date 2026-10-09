import test from "node:test";
import assert from "node:assert/strict";
import { SUPPORT_MAIL_PER_RUN, buildTicketConfirmation, buildTicketNotification, drainSupportEmails, sendTicketEmails, supportMailKey, ticketRef, type SupportTicketInfo } from "../src/lib/support-email";

// Support and contact confirmation emails (parity P37): the owner is told, the sender gets their ticket number, nothing is sent
// from a request, and nothing is sent while email is off.

const T: SupportTicketInfo = { number: 42, name: "Sam <b>", email: "sam@example.com", category: "PRICE", subject: "Lightning Bolt\r\nBcc: x@example.com", message: "Sol Ring shows $1.\nIt is $2 at the store <script>alert(1)</script>" };

test("the reference is MC-<number>, the notification names everything and escapes it, a subject never carries a newline", () => {
  assert.equal(ticketRef(42), "MC-42");
  const n = buildTicketNotification(T, "owner@example.com");
  assert.equal(n.to, "owner@example.com");
  assert.equal(n.subject, "[MC-42] Lightning Bolt Bcc: x@example.com");
  assert.match(n.html, /From: Sam &lt;b&gt; &lt;sam@example\.com&gt;/);
  assert.match(n.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(n.html, /<script>/);
  assert.match(n.html, /\/admin\/support/);
});

test("the confirmation goes to the sender with the ticket number", () => {
  const c = buildTicketConfirmation(T);
  assert.equal(c.to, "sam@example.com");
  assert.equal(c.subject, "We got your message: MC-42");
  assert.match(c.html, /MC-42/);
  assert.doesNotMatch(c.html, /One Piece|OP Compare|Riftcompare/i);
});

test("email off sends nothing; email on mails the contact inbox and the sender", async () => {
  const sent: string[] = [];
  const send = async (e: { to: string }) => (sent.push(e.to), true);
  assert.deepEqual(await sendTicketEmails(T, send, false), { notified: false, confirmed: false });
  assert.deepEqual(sent, []);
  const r = await sendTicketEmails(T, send, true);
  assert.deepEqual(r, { notified: true, confirmed: true });
  assert.deepEqual(sent, ["riftcompare@gmail.com", "sam@example.com"]);
});

function fakeDb(tickets: { number: number }[]) {
  const claimed = new Set<string>();
  const db = {
    supportTicket: { findMany: async () => tickets.map((t) => ({ ...T, number: t.number })) },
    counter: {
      createMany: async (a: { data: { key: string }[] }) => {
        let count = 0;
        for (const d of a.data) if (!claimed.has(d.key)) (claimed.add(d.key), count++);
        return { count };
      },
      deleteMany: async (a: { where: { key: string } }) => ({ count: claimed.delete(a.where.key) ? 1 : 0 }),
    },
  };
  return { db: db as never, claimed };
}

test("the outbox mails each ticket once, releases the claim on a failed send, and does nothing while email is off", async () => {
  const f = fakeDb([{ number: 1 }, { number: 2 }]);
  const NOW = new Date("2026-10-08T09:00:00Z");
  assert.deepEqual(await drainSupportEmails(NOW, { db: f.db, enabled: false }), { pending: 0, sent: 0, failed: 0, skipped: 0 });
  assert.equal(f.claimed.size, 0, "off: nothing claimed, so the first run with email on finds every recent ticket");
  const flaky = async (t: SupportTicketInfo) => ({ notified: true, confirmed: t.number === 1 });
  const r1 = await drainSupportEmails(NOW, { db: f.db, enabled: true, send: flaky as never });
  assert.deepEqual([r1.sent, r1.failed], [1, 1]);
  assert.deepEqual([...f.claimed], [supportMailKey(1)], "the failed ticket's claim is released");
  const r2 = await drainSupportEmails(NOW, { db: f.db, enabled: true, send: (async () => ({ notified: true, confirmed: true })) as never });
  assert.deepEqual([r2.sent, r2.skipped], [1, 1], "ticket 1 is not mailed again, ticket 2 is retried");
  assert.ok(SUPPORT_MAIL_PER_RUN > 0);
});
