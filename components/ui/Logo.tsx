/** Marca de Panduro: la «P» en Baloo 2 sobre una ficha mandarina con canto. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 52" width={size} height={(size * 52) / 48} aria-hidden focusable="false" className="shrink-0">
      <rect x="0" y="4" width="48" height="48" rx="13" fill="#b4470b" />
      <rect x="0" y="0" width="48" height="48" rx="13" fill="#f26a1b" />
      <text
        x="24"
        y="36"
        textAnchor="middle"
        fontFamily="'Baloo 2 Variable', 'Baloo 2', system-ui, sans-serif"
        fontWeight="800"
        fontSize="34"
        fill="#fff"
      >
        P
      </text>
    </svg>
  );
}
