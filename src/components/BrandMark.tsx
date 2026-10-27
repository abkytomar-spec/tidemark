/** Tidemark's logo: a rising wave crossing a tide line. Pure SVG so it inherits colour from its container. */
export function BrandMark() {
  return <svg className="brand-svg" viewBox="0 0 32 32" aria-hidden="true">
    <path d="M4 19c3.2-3.6 6.4-3.6 9.6 0s6.4 3.6 9.6 0c1.4-1.6 2.9-2.4 4.8-2.4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <path d="M4 25c3.2-2.4 6.4-2.4 9.6 0s6.4 2.4 9.6 0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity=".55" />
    <circle cx="23" cy="9" r="3.4" fill="currentColor" />
  </svg>;
}
