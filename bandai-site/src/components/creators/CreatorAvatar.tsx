import { initials, type Creator } from "@/lib/creators";

/** A creator's round photo (already cut to a circle in public/img/creators/), or their initials. A plain <img>: no image optimisation. */
export function CreatorAvatar({ creator, size, eager = false, decorative = false, className = "" }: { creator: Creator; size: number; eager?: boolean; decorative?: boolean; className?: string }) {
  const style = { width: size, height: size };
  if (creator.avatar)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={creator.avatar}
        alt={decorative ? "" : `Profile picture of ${creator.name}`}
        width={size}
        height={size}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={`rounded-full bg-ink-800 object-cover ${className}`}
        style={style}
      />
    );
  return (
    <span aria-hidden className={`flex items-center justify-center rounded-full bg-brand font-bold text-ink-950 ${className}`} style={{ ...style, fontSize: size / 3 }}>
      {initials(creator.name)}
    </span>
  );
}
