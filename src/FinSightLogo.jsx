export default function FinSightLogo({ height = 32 }) {
  const iconPx = Math.round(height * 0.875); // ~28px at h=32
  const fontSize = Math.round(height * 0.5625); // ~18px at h=32

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 8, height, userSelect: 'none' }}
      aria-label="FinSight"
    >
      {/* Icon mark — cream box with geometric F + signal-gold dot */}
      <svg
        width={iconPx}
        height={iconPx}
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
      >
        {/* Cream backing — reads on dark chrome */}
        <rect width="28" height="28" rx="3" fill="var(--panel)" />
        {/* Geometric F — vertical stem */}
        <rect x="6" y="5" width="5" height="18" fill="var(--navy-950)" />
        {/* Top arm */}
        <rect x="6" y="5" width="14" height="5" fill="var(--navy-950)" />
        {/* Middle arm */}
        <rect x="6" y="16" width="11" height="4" fill="var(--navy-950)" />
        {/* Signal-gold accent dot — one element, at the cap of the top arm */}
        <circle cx="22" cy="7" r="3.5" fill="var(--signal)" />
      </svg>

      {/* Wordmark — Manrope 700, white on dark chrome */}
      <span
        style={{
          fontFamily: 'Manrope, ui-sans-serif, system-ui, sans-serif',
          fontSize,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          color: '#ffffff',
        }}
      >
        Fin
        <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.72)' }}>Sight</span>
      </span>
    </div>
  );
}
