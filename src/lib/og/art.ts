// Card / product art for share images, fetched by the route itself so a failed
// fetch draws a placeholder instead of satori's empty bordered box. JPEG and PNG
// only (satori cannot decode WebP; the TCGplayer CDN serves JPEG).
import { cardImage } from "../images";

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

/** Fill each row's `art` with its card thumbnail (_200w), in parallel. */
export async function withThumbs<T extends { id: number; art?: string | null }>(rows: T[], size: "thumb" | "tile" = "thumb"): Promise<T[]> {
  const arts = await Promise.all(rows.map((r) => ogArt(cardImage[size](r.id))));
  return rows.map((r, i) => ({ ...r, art: arts[i] }));
}
