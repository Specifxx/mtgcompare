// Small drawings for the account pages and sign-in slides: plain inline SVG in the site's own tokens (currentColor), no outside art.
type P = { className?: string };
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function BellArt({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} {...base}>
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}
export function BoxesArt({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} {...base}>
      <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" />
      <path d="M3 8.5v7L12 20l9-4.5v-7" />
      <path d="M12 13v7" />
    </svg>
  );
}
export function GiftArt({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} {...base}>
      <rect x="3.5" y="8" width="17" height="4" rx="1" />
      <path d="M5 12v8h14v-8M12 8v12" />
      <path d="M12 8S10.5 3.5 8 4.5 9 8 12 8Zm0 0s1.5-4.5 4-3.5S15 8 12 8Z" />
    </svg>
  );
}
export function KeyArt({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} {...base}>
      <circle cx="8" cy="14" r="4" />
      <path d="m11 11 8-8M16 6l2 2M14 8l2 2" />
    </svg>
  );
}
export function StarArt({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} {...base}>
      <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8L12 3.5Z" />
    </svg>
  );
}
export function UsersArt({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} {...base}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5" />
      <path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.5 3.5 5.2" />
    </svg>
  );
}
export function ChevronArt({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} {...base}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
