import { useId } from "react";

interface HexGlyphLogoProps {
  /**
   * "icon"       — mark only (square viewport) — used for app icon / badge
   * "horizontal" — mark + wordmark side-by-side (wide viewport) — used for dashboard header
   * "badge"      — mark inside outer hex ring + "HEX BADGE" label below
   */
  variant?: "icon" | "horizontal" | "badge";
  className?: string;
  "aria-label"?: string;
}

/**
 * HexGlyphLogo
 *
 * Faithful SVG recreation of the reference brand mark:
 *   • Metallic-silver H (left bar + crossbar + right bar)
 *   • Blue pointy-top hexagon connector node between H and G
 *   • Silver G as an open flat-top hexagonal stroke with inward spur
 *
 * Three variants:
 *   icon       — square, mark only            (Image 3 / app icon)
 *   horizontal — wide, mark + HEXGLYPH CODE   (Image 2 / dashboard)
 *   badge      — outer hex ring + HEX BADGE   (Image 1)
 */
export function HexGlyphLogo({
  variant = "horizontal",
  className,
  "aria-label": ariaLabel = "HexGlyph Code",
}: HexGlyphLogoProps) {
  const uid = useId().replace(/:/g, "");
  const svId   = `sv-${uid}`;
  const sv2Id  = `sv2-${uid}`;
  const glowId = `glow-${uid}`;
  const mgId   = `mg-${uid}`;
  const bgId   = `bg-${uid}`;

  // ── Shared defs ──────────────────────────────────────────────
  const defs = (
    <defs>
      {/* Dark navy background gradient */}
      <radialGradient id={bgId} cx="50%" cy="30%" r="70%">
        <stop offset="0%"   stopColor="#1B2540"/>
        <stop offset="100%" stopColor="#090C18"/>
      </radialGradient>

      {/* Metallic silver — top-lit bevel */}
      <linearGradient id={svId} x1="0.1" y1="0" x2="0.1" y2="1">
        <stop offset="0%"   stopColor="#E8EFF8"/>
        <stop offset="28%"  stopColor="#C8D4E8"/>
        <stop offset="70%"  stopColor="#8898B8"/>
        <stop offset="100%" stopColor="#5C6E90"/>
      </linearGradient>

      {/* Metallic silver — side-lit (for G stroke) */}
      <linearGradient id={sv2Id} x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0%"   stopColor="#D8E2F4"/>
        <stop offset="45%"  stopColor="#9AAAC8"/>
        <stop offset="100%" stopColor="#6678A0"/>
      </linearGradient>

      {/* Blue hex node glow */}
      <filter id={glowId} x="-70%" y="-70%" width="240%" height="240%">
        <feGaussianBlur stdDeviation="2.5" result="b"/>
        <feMerge>
          <feMergeNode in="b"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>

      {/* Subtle mark glow */}
      <filter id={mgId} x="-12%" y="-12%" width="124%" height="124%">
        <feGaussianBlur stdDeviation="1.5" result="b"/>
        <feMerge>
          <feMergeNode in="b"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
  );

  /**
   * The core HG mark, drawn in a local 158×92 coordinate space.
   * Caller applies a transform to position it.
   *
   * H spans x 0–71, G spans x 83–168, node at (83, 46).
   * Total height = 92 (bars from 0–92).
   */
  const Mark = ({ silver = `url(#${svId})`, silver2 = `url(#${sv2Id})` } = {}) => (
    <g filter={`url(#${mgId})`}>
      {/* ── H ── */}
      {/* Left vertical bar */}
      <rect x="0"  y="0"  width="13" height="92" rx="2.5" fill={silver}/>
      {/* Crossbar */}
      <rect x="13" y="39" width="29" height="12" fill={silver}/>
      {/* Right vertical bar */}
      <rect x="40" y="0"  width="13" height="92" rx="2.5" fill={silver}/>

      {/* ── Blue pointy-top hex node ──
           Center (68, 46), r = 11
           Pointy-top angles: top=90°, then every 60°
           (68, 35) top
           (77.5, 40.5) top-right
           (77.5, 51.5) btm-right
           (68, 57) bottom
           (58.5, 51.5) btm-left
           (58.5, 40.5) top-left
      */}
      <polygon
        points="68,35  77.5,40.5  77.5,51.5  68,57  58.5,51.5  58.5,40.5"
        fill="#2858CC"
        filter={`url(#${glowId})`}
        opacity="0.85"
      />
      <polygon
        points="68,35  77.5,40.5  77.5,51.5  68,57  58.5,51.5  58.5,40.5"
        fill="#3B6EF0"
        opacity="0.95"
      />
      {/* Top-facet highlight */}
      <polygon
        points="58.5,40.5  68,44  77.5,40.5  68,35"
        fill="#90BBFF"
        opacity="0.5"
      />

      {/* ── G — flat-top hexagonal open stroke ──
           Center (120, 46), r = 40
           flat-top vertices (angle 0°=right, step 60°):
             right     (160, 46)
             top-right (140, 11.4)  ← ≈ (140, 12)
             top-left  (100, 11.4)  ← ≈ (100, 12)
             left      ( 80, 46)
             btm-left  (100, 80.6)  ← ≈ (100, 80)
             btm-right (140, 80.6)  ← ≈ (140, 80)
           Path: top-right → top-left → left → btm-left → btm-right → right (OPEN gap)
           then inward spur from right → (133, 46)
      */}
      <path
        d="M 140,12 L 100,12 L 80,46 L 100,80 L 140,80 L 160,46 L 133,46"
        stroke={silver2}
        strokeWidth="12"
        fill="none"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </g>
  );

  // ── ICON variant (mark-only, square) ─────────────────────────
  if (variant === "icon") {
    return (
      <svg
        viewBox="0 0 180 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label={ariaLabel}
        role="img"
      >
        {defs}
        <g transform="translate(10, 14)">
          <Mark/>
        </g>
      </svg>
    );
  }

  // ── BADGE variant (mark inside outer hex ring) ────────────────
  if (variant === "badge") {
    // Square canvas 200×220 (hex + label below)
    return (
      <svg
        viewBox="0 0 200 230"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label={ariaLabel}
        role="img"
      >
        {defs}

        {/* Outer flat-top hexagon border, center (100, 97), r=90 */}
        {/* Flat-top: right(190,97) tr(145,19) tl(55,19) l(10,97) bl(55,175) br(145,175) */}
        <polygon
          points="190,97  145,19  55,19  10,97  55,175  145,175"
          fill="none"
          stroke="#3A4A6A"
          strokeWidth="6"
        />
        {/* Inner hex border (slightly inset) */}
        <polygon
          points="182,97  139,26  61,26  18,97  61,168  139,168"
          fill="none"
          stroke="#2A3A5A"
          strokeWidth="2"
          opacity="0.5"
        />

        {/* HG Mark — centered at (100, 97), mark is 160×92 */}
        <g transform="translate(20, 51)">
          <Mark/>
        </g>

        {/* "HEX BADGE" label */}
        <text
          x="100" y="208"
          textAnchor="middle"
          fontFamily="'Inter', system-ui, sans-serif"
          fontSize="13"
          fontWeight="600"
          letterSpacing="5"
          fill="#8898B8"
        >
          HEX BADGE
        </text>
      </svg>
    );
  }

  // ── HORIZONTAL variant (mark + HEXGLYPH CODE wordmark) ────────
  // Viewport: 400×110
  return (
    <svg
      viewBox="0 0 400 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={ariaLabel}
      role="img"
    >
      {defs}

      {/* HG mark — left side, scaled to fit 110px height */}
      <g transform="translate(8, 9)">
        <Mark/>
      </g>

      {/* Vertical divider */}
      <line x1="185" y1="14" x2="185" y2="96" stroke="#2A3A5A" strokeWidth="1.5"/>

      {/* "HEXGLYPH" — split blue/silver */}
      <text
        x="200" y="56"
        fontFamily="'Inter', system-ui, sans-serif"
        fontSize="32"
        fontWeight="800"
        letterSpacing="3"
      >
        <tspan fill="#3A70F0">HEX</tspan>
        <tspan fill="#C0CCDE">GLYPH</tspan>
      </text>

      {/* "— CODE —" tagline */}
      <text
        x="200" y="78"
        fontFamily="'Inter', system-ui, sans-serif"
        fontSize="11.5"
        fontWeight="500"
        letterSpacing="6"
        fill="#3A70F0"
        opacity="0.85"
      >
        ─── CODE ───
      </text>
    </svg>
  );
}

export default HexGlyphLogo;
