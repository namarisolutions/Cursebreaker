const GOLD = "var(--cb-gold)";
const KNOCKOUT = "#000000"; // the mark is designed to sit on black

const SUN_RING = "M16 45 A16 16 0 0 1 48 45 L44 45 A12 12 0 0 0 20 45 Z";
const INNER_RAYS =
  "M27.18 43.66 L22.76 41.17 L27.65 42.54 Z M28.06 41.92 L24.93 37.93 L28.92 41.06 Z M31.39 40.04 L32.00 34.00 L32.61 40.04 Z M35.08 41.06 L39.07 37.93 L35.94 41.92 Z M36.35 42.54 L41.24 41.17 L36.82 43.66 Z";
const OUTER_RAYS =
  "M14.46 39.13 L7.98 35.05 L15.44 36.75 Z M18.04 32.86 L13.62 26.62 L19.86 31.04 Z M30.71 26.55 L32.00 16.00 L33.29 26.55 Z M44.14 31.04 L50.38 26.62 L45.96 32.86 Z M48.56 36.75 L56.02 35.05 L49.54 39.13 Z";
const BAND = "M13 45.5 Q32 42 51 45.5 L51 52 Q32 48.5 13 52 Z";

type LogoProps = {
  size?: number;
  /** Accessible name. Leave empty when the logo sits next to the wordmark. */
  label?: string;
};

/**
 * Cursebreaker mark: hollow rising sun with an inverted compass.
 * Under 48px it switches to the bolder small version.
 */
export default function Logo({ size = 36, label }: LogoProps) {
  const small = size < 48;
  const a11y = label
    ? { role: "img", "aria-label": label }
    : { "aria-hidden": true as const };

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" {...a11y}>
      <g fill={GOLD}>
        <path d={SUN_RING} />
        <path d={INNER_RAYS} />
        <path d={OUTER_RAYS} />
        <path d={BAND} />
      </g>
      {small ? (
        <g strokeLinecap="round">
          <path d="M32 45 L22.43 21.90 M32 45 L41.57 21.90" stroke={KNOCKOUT} strokeWidth={7.5} />
          <circle cx="32" cy="45" r="5.5" fill={KNOCKOUT} />
          <path d="M32 45 L22.43 21.90 M32 45 L41.57 21.90" stroke={GOLD} strokeWidth={3.6} />
          <circle cx="32" cy="45" r="3.4" fill={GOLD} />
        </g>
      ) : (
        <>
          <g fill={KNOCKOUT}>
            <circle cx="22" cy="48.3" r="1.5" />
            <circle cx="32" cy="47.6" r="1.5" />
            <circle cx="42" cy="48.3" r="1.5" />
          </g>
          <g strokeLinecap="round" strokeLinejoin="round">
            <path d="M32 45 L21.67 20.06 M32 45 L42.33 20.06" stroke={KNOCKOUT} strokeWidth={4.6} />
            <circle cx="32" cy="45" r="4" fill={KNOCKOUT} />
            <path d="M32 45 L23.20 23.75 M32 45 L40.80 23.75" stroke={GOLD} strokeWidth={2} />
            <path
              d="M24.59 23.72 L21.67 20.06 L22.19 24.71 Z M41.81 24.71 L42.33 20.06 L39.41 23.72 Z"
              fill={GOLD}
              stroke={GOLD}
              strokeWidth={0.6}
            />
            <circle cx="32" cy="45" r="2.6" fill={GOLD} />
            <circle cx="32" cy="45" r="0.9" fill={KNOCKOUT} />
          </g>
        </>
      )}
    </svg>
  );
}
