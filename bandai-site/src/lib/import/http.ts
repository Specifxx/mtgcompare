// Polite fetch for the importers: a browser-like UA, a timeout, retries with
// backoff on 429/5xx, and JSON parsing that names the URL when it fails.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function fetchJson<T>(url: string, init: RequestInit = {}, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw Object.assign(new Error(`HTTP ${res.status} ${body.slice(0, 200)}`), { fatal: true });
      }
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      if ((e as { fatal?: boolean }).fatal) break;
      await sleep(1000 * 2 ** i);
    }
  }
  throw new Error(`${url}: ${(lastErr as Error)?.message ?? lastErr}`);
}

/** The same, for an HTML page (a Neto shop's category pages). */
export async function fetchText(url: string, tries = 3): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { fatal: true });
      return await res.text();
    } catch (e) {
      lastErr = e;
      if ((e as { fatal?: boolean }).fatal) break;
      await sleep(1000 * 2 ** i);
    }
  }
  throw new Error(`${url}: ${(lastErr as Error)?.message ?? lastErr}`);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
