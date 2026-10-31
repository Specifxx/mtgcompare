// Visitor reports in GitHub: "this price is wrong" and "please add this store".
//
// Every Compare Empire site files them in ONE PRIVATE repository,
// Specifxx/compare-reports, one JSON file per report at
// inbox/<site>/<YYYY-MM-DD>/<time>-<random>.json on its main branch. A daily job
// in that repo (.github/workflows/triage.yml) keeps one GitHub issue per site
// listing what is still open and flags what needs a look; a report that has been
// dealt with is moved to done/<site>/. This file is the same in every site repo.
//
// Private on purpose: the site repos are public, and a note is a stranger's free
// text. Even so nothing about the visitor is kept: no email, no IP, no hash of
// one (the per-visitor limit below lives only in the function's memory), and
// anything in a note that looks like an email address or a phone number is
// blanked before it is written.
//
// The token (REPORTS_GITHUB_TOKEN) is a fine-grained one with Contents
// read/write on that one repo only, set in Vercel and never sent to the browser.
// Without it the route answers 503 and the form says to email instead; a site
// that already stores or emails reports keeps doing that.
//
// Writes only create new files (no read, no sha), so two reports in the same
// second can never race. The commit subject never carries [deploy] or
// [preview], and the repo deploys nothing anyway. (A PUT is never cached by
// Next, so no cache option is needed.)

export type ReportKind = "wrong-price" | "suggest-store" | "other";
export const REPORT_KINDS: readonly ReportKind[] = ["wrong-price", "suggest-store", "other"];

export interface Report {
  v: 1;
  /** ISO time, UTC, to the second */
  at: string;
  /** the site's short id, e.g. "riftcompare" */
  site: string;
  kind: ReportKind;
  /** the page's path (no query string, no host) */
  page: string | null;
  /** what the report is about: a product's name or id */
  product: string | null;
  /** the store whose price is wrong, or the store suggested */
  store: string | null;
  /** the suggested store's website (host only) */
  storeUrl: string | null;
  /** region / market code as the site names it */
  region: string | null;
  /** the price the site showed, as text with its currency */
  shown: string | null;
  /** what the visitor says it really is */
  actual: string | null;
  /** short reason code, e.g. "wrong-price", "out-of-stock", "wrong-product" */
  issue: string | null;
  note: string | null;
}

export const LIMITS = { note: 1000, field: 160, page: 300 } as const;

export const reportsToken = () => (process.env.REPORTS_GITHUB_TOKEN || "").trim();
export const reportsRepo = () => (process.env.REPORTS_REPO || "Specifxx/compare-reports").trim();
export const reportsBranch = () => (process.env.REPORTS_BRANCH || "main").trim();
export const reportsConfigured = () => Boolean(reportsToken());

/** Blank what could identify a person: email addresses and IP addresses; in free
 *  text (`phones`) also phone-like runs of 8+ digits. Product fields keep their
 *  digits, since a barcode is how some sites name a product. */
export function redact(s: string, phones = true): string {
  const out = s
    .replace(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi, "[email removed]")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[ip removed]");
  return phones ? out.replace(/\+?\d[\d ().-]{6,}\d/g, (m) => (m.replace(/\D/g, "").length >= 8 ? "[number removed]" : m)) : out;
}

function text(raw: unknown, max: number, phones = false): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = redact(String(raw).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim(), phones).slice(0, max).trim();
  return s || null;
}

/** A path on this site, never a full URL or a query string (which could carry anything). */
export function cleanPage(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  let p = raw.trim();
  try {
    if (/^https?:\/\//i.test(p)) p = new URL(p).pathname;
  } catch {
    return null;
  }
  p = p.split(/[?#]/)[0] ?? "";
  if (!p.startsWith("/")) return null;
  return p.slice(0, LIMITS.page);
}

/** A store website, reduced to its host name ("shop.example.com"). */
export function cleanHost(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = raw.trim();
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

export type Cleaned = { ok: true; report: Report } | { ok: false; error: string };

/** Validate a form body into a Report. Pure. */
export function cleanReport(body: unknown, site: string, now = new Date()): Cleaned {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const kind = REPORT_KINDS.includes(b.kind as ReportKind) ? (b.kind as ReportKind) : null;
  if (!kind) return { ok: false, error: "Pick what you're reporting." };
  const report: Report = {
    v: 1,
    at: now.toISOString().slice(0, 19) + "Z",
    site,
    kind,
    page: cleanPage(b.page),
    product: text(b.product, LIMITS.field),
    store: text(b.store, LIMITS.field),
    storeUrl: cleanHost(b.storeUrl),
    region: text(b.region, 12),
    shown: text(b.shown, 40),
    actual: text(b.actual, 40),
    issue: text(b.issue, 40),
    note: text(b.note, LIMITS.note, true),
  };
  if (kind === "suggest-store") {
    if (!report.store && !report.storeUrl) return { ok: false, error: "Tell us the store's name or website." };
    if (typeof b.storeUrl === "string" && b.storeUrl.trim() && !report.storeUrl) return { ok: false, error: "That website address doesn't look right." };
  } else if (kind === "wrong-price") {
    if (!report.product && !report.page) return { ok: false, error: "Which product is it?" };
    if (!report.store && !report.note && !report.actual) return { ok: false, error: "Tell us which store, or what's wrong." };
  } else if (!report.note) {
    return { ok: false, error: "Tell us what's wrong." };
  }
  return { ok: true, report };
}

/** inbox/<site>/<day>/<HHMMSS>-<kind>-<random>.json */
export function reportPath(r: Report, rand = Math.random().toString(36).slice(2, 8)): string {
  const day = r.at.slice(0, 10);
  const time = r.at.slice(11, 19).replace(/:/g, "");
  const site = r.site.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "site";
  return `inbox/${site}/${day}/${time}-${r.kind}-${rand}.json`;
}

export type SaveResult = "saved" | "off" | "failed";

/** Create the report's file in the reports repo. Never throws. */
export async function saveReport(r: Report, f: typeof fetch = fetch): Promise<SaveResult> {
  if (!reportsConfigured()) return "off";
  const path = reportPath(r);
  try {
    const res = await f(`https://api.github.com/repos/${reportsRepo()}/contents/${path}`, {
      method: "PUT",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${reportsToken()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": `${r.site}-reports`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `${r.site}: ${r.kind}${r.store ? ` (${r.store.slice(0, 40)})` : ""}`,
        content: Buffer.from(JSON.stringify(r, null, 1) + "\n").toString("base64"),
        branch: reportsBranch(),
      }),
    });
    if (res.ok) return "saved";
    console.warn(`[reports] GitHub said HTTP ${res.status} saving a ${r.kind} report`);
    return "failed";
  } catch (e) {
    console.warn(`[reports] saving a ${r.kind} report failed: ${(e as Error).message}`);
    return "failed";
  }
}

// ---- the per-visitor limit, in memory only (never stored) --------------------

export const PER_VISITOR_PER_HOUR = 6;
/** Every visitor together, per function instance per hour: a flood, not shoppers. */
export const ALL_PER_HOUR = 120;
const hits = new Map<string, number[]>();

/** true when this visitor (or everyone) is over the limit. Exported for tests. */
export function overLimit(visitor: string, now = Date.now()): boolean {
  const hourAgo = now - 3_600_000;
  if (hits.size > 5000) hits.clear();
  const all = (hits.get("*") ?? []).filter((t) => t > hourAgo);
  const mine = (hits.get(visitor) ?? []).filter((t) => t > hourAgo);
  if (all.length >= ALL_PER_HOUR || mine.length >= PER_VISITOR_PER_HOUR) return true;
  all.push(now);
  mine.push(now);
  hits.set("*", all);
  hits.set(visitor, mine);
  return false;
}

function visitorOf(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0]!.trim() : req.headers.get("x-real-ip")) || "unknown";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export interface HandleOptions {
  /** where to tell visitors to write when GitHub is not set up */
  email?: string;
  /** a site that also stores or emails the report itself; true counts as delivered */
  also?: (r: Report) => Promise<boolean>;
}

/** The whole POST handler: same-origin JSON in, { ok } or { error } out. */
export async function handleReportPost(req: Request, site: string, opts: HandleOptions = {}): Promise<Response> {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return json({ error: "Not allowed." }, 403);
    } catch {
      return json({ error: "Not allowed." }, 403);
    }
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: "Couldn't read that." }, 400);
  // Honeypot: a field no person sees. Say thanks and keep nothing.
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true });
  if (overLimit(visitorOf(req))) return json({ error: "That's a lot of reports in a short time. Please try again in an hour." }, 429);
  const c = cleanReport(body, site);
  if (!c.ok) return json({ error: c.error }, 400);
  const [saved, also] = await Promise.all([saveReport(c.report), opts.also ? opts.also(c.report).catch(() => false) : Promise.resolve(false)]);
  if (saved === "saved" || also) return json({ ok: true });
  const mail = opts.email ? ` Please email ${opts.email} instead.` : "";
  return saved === "off"
    ? json({ error: `Reports aren't switched on yet.${mail}` }, 503)
    : json({ error: `Couldn't send that right now. Please try again in a minute.${mail}` }, 502);
}
