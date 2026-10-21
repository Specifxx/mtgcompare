import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { OG_SIZE } from "@/lib/og-card";
import { preorderGuideBySlug } from "@/lib/preorder-guides";
import { PREORDER_OG_ART } from "@/lib/preorder-og";
import { formatRelease } from "@/lib/release";
import { REGION_LIST } from "@/lib/regions";

// /og/preorders/<set>: the pre-order page's share card (its og:image in every region), modelled on RiftCompare's
// /radiance-preorders image: the logo, an "OUT <date>" pill, the set's name, "pre-order prices", one line on what the page compares,
// the region chips and "Daily", with the set's real sealed products on the right. No price and no live count: Reddit, Discord and X
// cache a share image, so anything that changes would go stale. The date is lib/sets.ts's, the art is committed under
// public/preorders/<set slug>/ (TCGplayer's product photos, downloaded once) and read from disk: no database, no network.
// Not prerendered (no generateStaticParams): drawn on its first request and kept by Vercel's CDN for a day (the header below).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INK = "#15171c";
const MUTED = "#5c606c";
const BRAND = "#d2300a";
const LINE = "#e4e3de";
const CDN = "public, s-maxage=86400, stale-while-revalidate=86400";

const font = (file: string) => readFileSync(join(process.cwd(), "src/app/fonts", file));
const art = (slug: string, file: string) =>
  `data:image/jpeg;base64,${readFileSync(join(process.cwd(), "public", "preorders", slug, file)).toString("base64")}`;

// Where each product sits (matching PREORDER_OG_ART's order): the ETB and bundle behind, the box in front, the pack leaning on it.
const POSE = [
  { left: 0, top: 90, w: 290, rotate: -6 },
  { left: 275, top: 70, w: 195, rotate: 5 },
  { left: 80, top: 270, w: 225, rotate: 0 },
  { left: 300, top: 285, w: 145, rotate: 8 },
];

export function GET(_req: Request, { params }: { params: { set: string } }) {
  const found = preorderGuideBySlug(params.set);
  if (!found) return new Response("Not found", { status: 404 });
  const { set } = found;
  const arts = (PREORDER_OG_ART[set.slug] ?? []).map((f) => art(set.slug, f));
  const nameSize = set.name.length > 14 ? 64 : 84;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#f6f6f3",
          backgroundImage:
            "radial-gradient(circle at 0% 0%, rgba(210,48,10,0.14), rgba(210,48,10,0) 45%), radial-gradient(circle at 85% 50%, rgba(255,203,5,0.30), rgba(255,203,5,0) 45%)",
          fontFamily: "Bricolage",
          color: INK,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 660, padding: "56px 0 56px 64px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width="56" height="56" viewBox="0 0 64 64">
              <rect width="64" height="64" rx="16" fill={BRAND} />
              <path d="M18 16h14c10 0 16 6.5 16 16s-6 16-16 16H18z" fill="#fff" />
              <path d="M26 24h5.5c5 0 8 3 8 8s-3 8-8 8H26z" fill={BRAND} />
              <rect x="18" y="30" width="30" height="4" fill={BRAND} />
            </svg>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>
              Dex<span style={{ color: BRAND }}>Compare</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                padding: "8px 18px",
                borderRadius: 999,
                background: "rgba(210,48,10,0.10)",
                border: `2px solid ${BRAND}`,
                color: BRAND,
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: 2,
              }}
            >
              {`OUT ${formatRelease(set.releaseDate).toUpperCase()}`}
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 20 }}>
              <span style={{ fontSize: nameSize, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>{set.name}</span>
              <span style={{ fontSize: 54, fontWeight: 800, color: BRAND, letterSpacing: -2, lineHeight: 1.15 }}>pre-order prices</span>
            </div>
            <div style={{ display: "flex", marginTop: 18, fontSize: 28, fontWeight: 600, color: MUTED, lineHeight: 1.3 }}>
              Booster boxes, ETBs and bundles at every store we track, side by side.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {REGION_LIST.map((r) => (
              <div key={r.region} style={{ display: "flex", padding: "6px 14px", borderRadius: 999, border: `2px solid ${LINE}`, background: "#ffffff", fontSize: 22, fontWeight: 600 }}>
                {r.short}
              </div>
            ))}
            <div style={{ display: "flex", marginLeft: 6, color: BRAND, fontSize: 24, fontWeight: 800 }}>Daily</div>
          </div>
        </div>
        <div style={{ display: "flex", position: "relative", width: 540, height: 630 }}>
          {arts.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              width={POSE[i].w}
              style={{
                position: "absolute",
                left: 30 + POSE[i].left,
                top: POSE[i].top,
                transform: `rotate(${POSE[i].rotate}deg)`,
                borderRadius: 14,
                boxShadow: "0 24px 48px -12px rgba(24,22,18,0.35)",
              }}
            />
          ))}
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      headers: { "Cache-Control": "public, max-age=0", "Vercel-CDN-Cache-Control": CDN },
      fonts: [
        { name: "Bricolage", data: font("BricolageGrotesque-ExtraBold.ttf"), weight: 800, style: "normal" },
        { name: "Bricolage", data: font("BricolageGrotesque-SemiBold.ttf"), weight: 600, style: "normal" },
      ],
    },
  );
}
