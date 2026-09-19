import type { Sky } from "@/lib/integrations/weather";

/**
 * The sky, drawn in line work rather than set in an emoji font.
 *
 * Emoji would render in whatever colour and style the platform decides,
 * which on this screen means a full-colour sticker sitting in the middle of
 * a monochrome instrument.
 */
export function WeatherIcon({ sky, size = 24, night }: { sky: Sky; size?: number; night?: boolean }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const cloud = <path d="M7 18h9.5a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.2A3.4 3.4 0 0 0 7 18Z" />;

  switch (sky) {
    case "clear":
      return night ? (
        <svg {...common}>
          <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />
        </svg>
      ) : (
        <svg {...common}>
          <circle cx="12" cy="12" r="4.2" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <line key={deg} x1="12" y1="2.6" x2="12" y2="5" transform={`rotate(${deg} 12 12)`} />
          ))}
        </svg>
      );
    case "partly":
      return (
        <svg {...common}>
          <circle cx="8.5" cy="8.5" r="3" />
          {[0, 90, 180, 270].map((deg) => (
            <line key={deg} x1="8.5" y1="3" x2="8.5" y2="4.4" transform={`rotate(${deg} 8.5 8.5)`} />
          ))}
          {cloud}
        </svg>
      );
    case "fog":
      return (
        <svg {...common}>
          {cloud}
          <line x1="4" y1="21" x2="14" y2="21" />
          <line x1="17" y1="21" x2="20" y2="21" />
        </svg>
      );
    case "drizzle":
      return (
        <svg {...common}>
          {cloud}
          <line x1="9" y1="20.5" x2="8.3" y2="22" />
          <line x1="14" y1="20.5" x2="13.3" y2="22" />
        </svg>
      );
    case "rain":
      return (
        <svg {...common}>
          {cloud}
          <line x1="8.5" y1="20" x2="7.4" y2="22.5" />
          <line x1="12" y1="20" x2="10.9" y2="22.5" />
          <line x1="15.5" y1="20" x2="14.4" y2="22.5" />
        </svg>
      );
    case "snow":
      return (
        <svg {...common}>
          {cloud}
          <circle cx="8.5" cy="21.4" r="0.8" fill="currentColor" stroke="none" />
          <circle cx="12" cy="21.4" r="0.8" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="21.4" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case "thunder":
      return (
        <svg {...common}>
          {cloud}
          {/* Kept inside the 24-unit box: the bolt used to run to y=26 and
              was being clipped off at the baseline. */}
          <path d="M13.4 18.4 10.6 21.4h2.2L10.6 23.4" />
        </svg>
      );
    default:
      return <svg {...common}>{cloud}</svg>;
  }
}
