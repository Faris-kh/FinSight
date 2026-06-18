// onDark=true  → white wordmark (for navy chrome nav)
// onDark=false → ink wordmark (for cream/surface backgrounds)
export default function FinSightLogo({ height = 32, onDark = true }) {
  const iconPx = Math.round(height * 0.875); // 28px at h=32
  const fontSize = Math.round(height * 0.5625); // 18px at h=32

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 8, height, userSelect: 'none' }}
      aria-label="FinSight"
    >
      {/* Icon mark — cream box, navy trend line, single gold peak dot */}
      <svg
        width={iconPx}
        height={iconPx}
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
      >
        {/* Cream backing */}
        <rect
          width="28" height="28" rx="3"
          fill="var(--panel)"
          stroke={onDark ? 'none' : 'var(--hairline)'}
          strokeWidth={onDark ? 0 : 1}
        />
        {/* Trend line — ascending with one realistic dip, navy on cream */}
        <polyline
          points="4,22 9,17 13,19 18,12 23,8"
          stroke="var(--navy-950)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Signal-gold peak dot — one accent element only */}
        <circle cx="23" cy="8" r="3.5" fill="var(--signal)" />
      </svg>

      {/* Wordmark */}
      <span
        style={{
          fontFamily: 'Manrope, ui-sans-serif, system-ui, sans-serif',
          fontSize,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          color: onDark ? '#ffffff' : 'var(--ink)',
        }}
      >
        Fin
        <span style={{
          fontWeight: 600,
          color: onDark ? 'rgba(255,255,255,0.72)' : 'var(--ink-muted)',
        }}>
          Sight
        </span>
      </span>
    </div>
  );
}
