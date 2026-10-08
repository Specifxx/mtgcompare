import { prisma } from "./db";
import { MARKETS, type Country } from "./country";
import { getBrowseIndex, getCardsByIds, getSealedBySet, getSets } from "./data";
import { readSealedListings } from "./sealed-alert-read";
import { emailShell, isEmailEnabled, sendEmail } from "./email";
import {
  RELEASE_ALERT_SEND_CAP,
  buildReleaseEmail,
  groupByEmail,
  isUnreleased,
  releaseAlertSets,
  releaseCounterKey,
  releaseOneClickUrl,
  renderReleaseEmailHtml,
  renderReleaseEmailText,
  restockTransitions,
  singlesNotices,
  type OfferState,
  type ReleaseAlertRow,
  type RestockNotice,
  type SinglesFacts,
  type SinglesNotice,
} from "./release-alerts";
import { offerStock } from "./sealed-watch-run";

// THE RELEASE-ALERT RUN — RiftCompare's lib/release-alerts-run.ts, ported in
// wave 2 (2026-10-03) and generalised over every set that takes release alerts
// (lib/release-alerts.ts releaseAlertSets: unreleased, or released within 30
// days). Called by scripts/alerts.ts after the daily import. Reads are per-set
// and narrow: the browse index's store columns for the singles counts, the few
// card-scoped cards, one set's presale products (their published detail files).
//
// EMAIL OFF: a release alert is an email (the signup is an address, often with
// no account), so nothing is sent and no row is stamped — the alerts wait,
// pending, for email to be configured. The restock memory (Counter rows) still
// advances, so the first run with email on reports only a restock it saw.
// Only rows that exist can be pending: the signup form renders only while
// email is on (components/ReleaseAlertSignup).

export interface ReleaseRunSummary {
  sets: number;
  pending: number;
  sent: number;
  failed: number;
  held: number;
  restocked: Record<string, string[]>;
  emailOn: boolean;
}

/** The singles of a set that a real store lists in stock, per market: the browse index's store-only minimum (never TCGplayer's own low), over both finishes. Keyed `${market}:${productId}`. */
export type SetSinglesReader = (setId: number, markets: readonly Country[]) => Promise<Map<string, number>>;

export const liveSetSingles: SetSinglesReader = async (setId, markets) => {
  const ix = await getBrowseIndex({ withStores: true });
  const out = new Map<string, number>();
  for (let i = 0; i < ix.n; i++) {
    if (ix.setId[i] !== setId) continue;
    for (const m of markets) {
      const mi = MARKETS.indexOf(m);
      let best = -1;
      for (const f of [0, 1]) {
        const v = ix.smin[(i * 2 + f) * 6 + mi]!;
        if (v > 0 && (best < 0 || v < best)) best = v;
      }
      if (best > 0) out.set(`${m}:${ix.id[i]}`, best);
    }
  }
  return out;
};

export interface ReleaseRunIo {
  singles?: SetSinglesReader;
  /** Presale sealed products of a set: id and name. */
  presale?: (setId: number) => Promise<{ id: number; name: string }[]>;
  /** Real-store listings of products in a market (sealed-alert-read.ts). */
  listings?: (ids: readonly number[], market: Country) => Promise<Map<number, { inStock: boolean; lastSeen: string }[]>>;
}

const livePresale: NonNullable<ReleaseRunIo["presale"]> = async (setId) => (await getSealedBySet(setId)).filter((p) => p.presale).map((p) => ({ id: p.id, name: p.name }));
const liveListings: NonNullable<ReleaseRunIo["listings"]> = async (ids, market) => {
  const read = await readSealedListings(null, ids.map((sealedId) => ({ sealedId, market })));
  const out = new Map<number, { inStock: boolean; lastSeen: string }[]>();
  for (const [id, ls] of read.get(market) ?? []) out.set(id, ls.map((l) => ({ inStock: l.inStock, lastSeen: l.lastSeen })));
  return out;
};

export async function runReleaseAlerts(opts: { dryRun?: boolean; now?: Date; emailEnabled?: boolean; io?: ReleaseRunIo } = {}): Promise<ReleaseRunSummary> {
  const io = opts.io ?? {};
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const emailOn = opts.emailEnabled ?? isEmailEnabled();
  const summary: ReleaseRunSummary = { sets: 0, pending: 0, sent: 0, failed: 0, held: 0, restocked: {}, emailOn };

  const sets = releaseAlertSets(
    (await getSets()).filter((s) => s.releasedOn != null).map((s) => ({ id: s.id, slug: s.slug, name: s.name, releasedOn: s.releasedOn!.slice(0, 10) as string | null })),
    today,
  );
  summary.sets = sets.length;
  let budget = RELEASE_ALERT_SEND_CAP;

  for (const set of sets) {
    const rows: ReleaseAlertRow[] = await prisma.setReleaseAlert.findMany({
      where: { setSlug: set.slug, OR: [{ singlesNotifiedAt: null }, { restockNotifiedAt: null }] },
      select: { id: true, email: true, scope: true, market: true, unsubToken: true, singlesNotifiedAt: true, restockNotifiedAt: true },
      orderBy: { createdAt: "asc" },
      take: 5000,
    });
    summary.pending += rows.length;
    if (!rows.length) continue;

    const muted = new Set(
      (await prisma.alertMute.findMany({ where: { email: { in: [...new Set(rows.map((r) => r.email))] } }, select: { email: true } })).map((m) => m.email),
    );
    const live = rows.filter((r) => !muted.has(r.email));
    const markets = [...new Set(live.map((r) => r.market))].filter((m): m is Country => (MARKETS as string[]).includes(m));

    // ── Singles facts: cards of the set with an in-stock store listing ──────
    const facts: SinglesFacts = { pricedCount: {}, cards: {} };
    if (markets.length) {
      const minBy = await (io.singles ?? liveSetSingles)(set.id, markets);
      for (const k of minBy.keys()) {
        const m = k.split(":")[0] as Country;
        facts.pricedCount[m] = (facts.pricedCount[m] ?? 0) + 1;
      }
      const cardIds = [...new Set(live.filter((r) => r.scope !== "set" && !r.singlesNotifiedAt).map((r) => Number(r.scope)))].filter((n) => Number.isSafeInteger(n));
      if (cardIds.length) {
        for (const [id, c] of await getCardsByIds(cardIds)) {
          if (c.setId !== set.id) continue;
          const price: Partial<Record<Country, number | null>> = {};
          for (const m of markets) price[m] = minBy.get(`${m}:${id}`) ?? null;
          facts.cards[String(id)] = { name: `${c.name}${c.variant ? ` (${c.variant})` : ""}`, href: `/card/${c.slug}`, price };
        }
      }
    }
    const singles = singlesNotices(live, facts);

    // ── Restock transitions (only while the set is unreleased) ─────────────
    const restockByMarket = new Map<Country, string[]>();
    if (isUnreleased(set.releasedOn, today)) {
      const presale = await (io.presale ?? livePresale)(set.id);
      for (const m of markets) {
        if (!presale.length || !live.some((r) => r.market === m && !r.restockNotifiedAt)) continue;
        const offers = await (io.listings ?? liveListings)(presale.map((p) => p.id), m);
        const products = presale.map((p) => {
          const ls = offers.get(p.id) ?? [];
          const states = ls.map((l) => offerStock(l, now.getTime()));
          const state: OfferState = ls.length && states.every((s) => s === "soldout") ? "soldout" : states.includes("open") ? "open" : "other";
          return { key: String(p.id), name: p.name, state };
        });
        const prefix = releaseCounterKey(set.slug, m, "");
        const prev = new Set(
          (await prisma.counter.findMany({ where: { key: { startsWith: prefix } }, select: { key: true } })).map((c) => c.key.slice(prefix.length)),
        );
        const t = restockTransitions(products, prev);
        if (!opts.dryRun) {
          for (const k of t.markSoldOut) {
            const key = releaseCounterKey(set.slug, m, k);
            await prisma.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: 1 } });
          }
          if (t.clear.length) await prisma.counter.deleteMany({ where: { key: { in: t.clear.map((k) => releaseCounterKey(set.slug, m, k)) } } });
        }
        if (t.restocked.length) {
          const names = t.restocked.map((k) => products.find((p) => p.key === k)?.name ?? k);
          restockByMarket.set(m, names);
          summary.restocked[`${set.slug}:${m}`] = names;
        }
      }
    }

    if (!emailOn) continue; // pending until email is configured (see the header)

    // ── Compose one email per address ─────────────────────────────────────
    const setPath = `/sets/${set.slug}`;
    for (const [email, own] of groupByEmail(live)) {
      const notices: (SinglesNotice | RestockNotice)[] = [];
      const singlesRows = own.filter((r) => singles.has(r.id));
      if (singlesRows.length) {
        const pick = singlesRows.map((r) => singles.get(r.id)!).sort((a, b) => Number(!!b.card) - Number(!!a.card))[0];
        notices.push(pick);
      }
      const restockRows = own.filter((r) => !r.restockNotifiedAt && restockByMarket.has(r.market as Country));
      if (restockRows.length) {
        const m = restockRows[0].market as Country;
        notices.push({ kind: "restock", market: m, products: restockByMarket.get(m)! });
      }
      if (!notices.length) continue;
      if (budget <= 0) {
        summary.held++;
        continue;
      }
      budget--;
      const token = own[0].unsubToken;
      const built = buildReleaseEmail(set.name, setPath, notices);
      if (opts.dryRun) {
        summary.sent++;
        continue;
      }
      const ok = await sendEmail(email, built.subject, renderReleaseEmailHtml(built, token, emailShell), {
        text: renderReleaseEmailText(built, token),
        headers: { "List-Unsubscribe": `<${releaseOneClickUrl(token)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      if (!ok) {
        summary.failed++;
        continue;
      }
      summary.sent++;
      const at = new Date();
      if (singlesRows.length) await prisma.setReleaseAlert.updateMany({ where: { id: { in: singlesRows.map((r) => r.id) } }, data: { singlesNotifiedAt: at } });
      if (restockRows.length) await prisma.setReleaseAlert.updateMany({ where: { id: { in: restockRows.map((r) => r.id) } }, data: { restockNotifiedAt: at } });
    }
  }
  return summary;
}
