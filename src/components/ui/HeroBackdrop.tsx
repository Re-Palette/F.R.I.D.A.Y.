/**
 * What sits behind the ring: the crosshair that quarters the frame and the
 * two orbital arcs that pass through it and run off both edges.
 *
 * Separate from StatusRing because these are deliberately larger than the
 * ring — they establish the ring as one instrument inside a bigger field,
 * which is the whole effect. Purely decorative, so it is hidden from
 * assistive technology and never intercepts a click.
 */
export function HeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <svg
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
      >
        <defs>
          <filter id="orbit-bloom" x="-20%" y="-200%" width="140%" height="500%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <linearGradient id="orbit-fade" x1="0" x2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0" />
            <stop offset="22%" stopColor="var(--color-accent)" stopOpacity="0.85" />
            <stop offset="50%" stopColor="var(--color-accent-soft)" stopOpacity="0.35" />
            <stop offset="78%" stopColor="var(--color-accent)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="crosshair-fade" x1="0" x2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0" />
            <stop offset="18%" stopColor="var(--color-accent)" stopOpacity="0.55" />
            <stop offset="50%" stopColor="var(--color-accent-soft)" stopOpacity="0.8" />
            <stop offset="82%" stopColor="var(--color-accent)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="crosshair-fade-v" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0" />
            <stop offset="50%" stopColor="var(--color-accent-soft)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <line x1="0" y1="450" x2="1600" y2="450" stroke="url(#crosshair-fade)" strokeWidth="1.25" />
        <line x1="800" y1="0" x2="800" y2="900" stroke="url(#crosshair-fade-v)" strokeWidth="1.25" />

        {/* Tilted in opposite directions so they read as one path seen edge-on
            rather than two unrelated ellipses. */}
        <g filter="url(#orbit-bloom)" opacity="0.75">
          <ellipse
            cx="800" cy="450" rx="740" ry="165"
            fill="none" stroke="url(#orbit-fade)" strokeWidth="2"
            transform="rotate(-7 800 450)"
          />
          <ellipse
            cx="800" cy="450" rx="700" ry="120"
            fill="none" stroke="url(#orbit-fade)" strokeWidth="1.5"
            transform="rotate(6 800 450)"
            opacity="0.6"
          />
        </g>

        {/* Markers sit far out on the crosshair rather than at the ring's
            edge: the ring is sized in CSS, so anything meant to touch it
            belongs in StatusRing where the geometry is known. */}
        {[150, 1450].map((x) => (
          <path
            key={x}
            d={`M ${x} 443 L ${x + 7} 450 L ${x} 457 L ${x - 7} 450 Z`}
            fill="var(--color-accent)"
            opacity="0.5"
          />
        ))}
      </svg>
    </div>
  );
}
