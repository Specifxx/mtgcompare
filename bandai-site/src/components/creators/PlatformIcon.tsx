import type { CreatorPlatform } from "@/lib/creators";

// Each platform's own colour (white text on all of them is 4.5:1 or better) and a simple glyph, drawn inline: no icon font, no
// third-party script.
export const PLATFORM_STYLE: Record<CreatorPlatform, { bg: string; fg: string }> = {
  Instagram: { bg: "#C13584", fg: "#fff" },
  YouTube: { bg: "#CC0000", fg: "#fff" },
  Threads: { bg: "#000000", fg: "#fff" },
  TikTok: { bg: "#000000", fg: "#fff" },
  Facebook: { bg: "#1877F2", fg: "#fff" },
  X: { bg: "#000000", fg: "#fff" },
  Twitch: { bg: "#7A3FD1", fg: "#fff" },
  Website: { bg: "#3f3f46", fg: "#fff" },
};

export function PlatformIcon({ platform, size = 16 }: { platform: CreatorPlatform; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true, fill: "none", stroke: "currentColor", strokeWidth: 2 } as const;
  switch (platform) {
    case "Instagram":
      return (
        <svg {...p}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "YouTube":
      return (
        <svg {...p}>
          <rect x="2" y="5" width="20" height="14" rx="4" />
          <path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "Threads":
      return (
        <svg {...p}>
          <path d="M17 9.5C16.3 6.6 14.4 5 12 5c-3.6 0-6 2.8-6 7s2.4 7 6 7c2.9 0 5-1.7 5-4.2 0-2.3-1.9-3.6-4.4-3.6-2.1 0-3.4 1-3.4 2.4 0 1.3 1.1 2.1 2.6 2.1 2.6 0 3.6-2.2 3.4-5.7" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
        </svg>
      );
  }
}
