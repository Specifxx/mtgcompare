import { risingOg } from "@/lib/og/images";

// A shared Hot 40 link's unfurl: its frozen title beside the top three cards.
export const runtime = "nodejs";
export const revalidate = 21600;
export const alt = "OP Compare Hot 40 — One Piece cards ranked by demand and price-timing signals";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image({ params }: { params: { token: string } }) {
  return risingOg(params.token);
}
