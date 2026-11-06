// A cart outline, drawn in currentColor so it takes each site's own text colour.
export function CartIcon({ size = 18, plus = false }: { size?: number; plus?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2.5 3h2.6l2.2 11.2a1.6 1.6 0 0 0 1.6 1.3h8.7a1.6 1.6 0 0 0 1.6-1.2L21 7H6" />
      {plus && <path d="M13 8.5v4.5M10.75 10.75h4.5" />}
    </svg>
  );
}
