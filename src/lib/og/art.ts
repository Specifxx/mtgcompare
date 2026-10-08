// Card / product art for share images, fetched by the route itself so a failed
// fetch draws a placeholder instead of satori's empty bordered box. JPEG and PNG
// only (satori cannot decode WebP): the URLs come from imageFor(c, "og"), which
// is a JPEG on both image hosts, whichever one NEXT_PUBLIC_IMAGE_PRIMARY names.

const TIMEOUT_MS = 2500;
const WEEK = 60 * 60 * 24 * 7;

/** A data: URI for the image at url, or null on any failure (timeout, non-200, wrong type). */
export async function ogArt(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), next: { revalidate: WEEK } } as RequestInit);
    if (res.status !== 200) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (type !== "image/jpeg" && type !== "image/png") return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Fill each row's `art` from its `img` (the imageFor(c, "og") URL, or null for a card with no scan), in parallel. */
export async function withArt<T extends { img: string | null; art?: string | null }>(rows: T[]): Promise<T[]> {
  const arts = await Promise.all(rows.map((r) => ogArt(r.img)));
  return rows.map((r, i) => ({ ...r, art: arts[i] }));
}
