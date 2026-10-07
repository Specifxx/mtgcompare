import { cardImage } from "@/lib/images";

// Card art. RiftCompare's CardImage in shape: a rounded-lg, isolated box on a
// near-black ground with the scan object-cover inside it, lazy unless it is the
// page's priority image. OP Compare's scans are TCGplayer's 300×419 product
// images (lib/images.ts); there is no blur placeholder or AVIF manifest.
export function CardImage({
  id,
  hasImage,
  alt,
  size = "tile",
  priority = false,
  className = "",
}: {
  id: number;
  hasImage: boolean;
  alt: string;
  size?: "thumb" | "tile" | "large";
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative isolate overflow-hidden rounded-lg ${className}`} style={{ backgroundColor: "#080b11" }}>
      <div className="absolute inset-0 bg-ink-950/40" />
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cardImage[size](id)}
          alt={alt}
          {...(priority ? { loading: "eager" as const, fetchPriority: "high" as const } : { loading: "lazy" as const, decoding: "async" as const })}
          width={300}
          height={419}
          className="relative z-10 h-full w-full object-cover"
        />
      ) : (
        <div className="relative z-10 grid h-full w-full place-items-center text-xs text-slate-500">No image</div>
      )}
    </div>
  );
}

// The plain art block used by detail pages and lists (card page hero, leader
// pages, store pages, CardLinkGrid).
export function CardArt({ id, hasImage, alt, size = "tile", className = "" }: { id: number; hasImage: boolean; alt: string; size?: "thumb" | "tile" | "large"; className?: string }) {
  if (!hasImage) {
    return (
      <div className={`grid aspect-[300/419] place-items-center rounded-md bg-ink-800 text-xs text-slate-500 ${className}`}>
        No image
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cardImage[size](id)}
      alt={alt}
      loading={size === "large" ? "eager" : "lazy"}
      decoding="async"
      width={300}
      height={419}
      className={`aspect-[300/419] w-full rounded-md bg-ink-800 object-cover ${className}`}
    />
  );
}
