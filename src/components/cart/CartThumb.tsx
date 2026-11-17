"use client";

// A cart line's picture (owner, 2026-11-17: "sometimes the images in the cart don't render, even
// TCGplayer's"). The product tiles load the same URL with the browser's normal referrer; the cart
// used to force no-referrer and hide the image on the first error, so a CDN that wants a referrer,
// or one that refuses an empty one, left a blank square. Now: try the way the tiles do, then once
// with no referrer, then a quiet placeholder of the same size (no layout jump, never a broken icon).
import { useEffect, useState } from "react";
import { CartIcon } from "./CartIcon";

const secure = (u: string) => (u.startsWith("//") ? `https:${u}` : u.replace(/^http:\/\//i, "https://"));

export function CartThumb({ image, alt, noimgClass }: { image?: string | null; alt: string; noimgClass: string }) {
  const [stage, setStage] = useState(0); // 0: as the tiles do, 1: no referrer, 2: placeholder
  useEffect(() => setStage(0), [image]);
  if (!image || stage > 1) {
    return (
      <span className={noimgClass} aria-hidden="true">
        <CartIcon size={18} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- store and card photos are hotlinked, never optimised
    <img key={stage} src={secure(image)} alt={alt} decoding="async" {...(stage === 1 ? { referrerPolicy: "no-referrer" as const } : {})} onError={() => setStage((s) => s + 1)} />
  );
}
