/**
 * HomePlan's own logomark — a simple abstracted floor plan (two rooms + a
 * doorway gap), original geometry, not a copy of any other product's logo.
 */
export function BrandMark({ className, size = 26 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="25" height="25" rx="7" fill="#111110" />
      <path
        d="M7 20V9.5L14 6l7 3.5V20"
        stroke="#f7f6f3"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7 14.5h6.2M16.4 14.5H21" stroke="#c9622d" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14 14.5v5.5" stroke="#f7f6f3" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
