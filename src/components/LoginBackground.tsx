import { cn } from "../lib/utils";

interface LoginBackgroundProps {
  className?: string;
}

// Deterministic PRNG (mulberry32) so the "random" crest heights below are
// stable across renders — same seed always produces the same wave shape.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds an organic, non-repeating crest across a 1200-wide viewBox: random
 * (but seeded) anchor heights joined by smooth curves. The first and last
 * anchor are forced equal so the shape still tiles seamlessly for the
 * duplicated-and-shifted 200%-width scroll trick in WaveLayer below —
 * without that constraint the loop point would visibly jump.
 */
function buildOrganicCrest(seed: number, anchorCount: number, baseline: number, amplitude: number) {
  const width = 1200;
  const rand = mulberry32(seed);
  const heights: number[] = [];
  for (let i = 0; i < anchorCount; i++) {
    heights.push(baseline + (rand() * 2 - 1) * amplitude);
  }
  heights.push(heights[0]);

  const segmentWidth = width / anchorCount;
  let d = `M0,${heights[0].toFixed(1)}`;
  for (let i = 0; i < anchorCount; i++) {
    const x1 = (i + 1) * segmentWidth;
    const cx0 = i * segmentWidth + segmentWidth * 0.5;
    const cx1 = x1 - segmentWidth * 0.5;
    d += ` C${cx0.toFixed(1)},${heights[i].toFixed(1)} ${cx1.toFixed(1)},${heights[i + 1].toFixed(1)} ${x1.toFixed(1)},${heights[i + 1].toFixed(1)}`;
  }
  return d;
}

// Four organic crests, each with its own seed/anchor density/amplitude so
// the layers read as genuinely different water, not the same shape restacked.
const CREST_BACK = buildOrganicCrest(7, 9, 60, 9); // farthest: calm, frequent small ripples
const CREST_MID = buildOrganicCrest(23, 6, 60, 26); // medium rolling swell
const CREST_ROSE = buildOrganicCrest(31, 5, 60, 32); // transitional band, coral -> rose
const CREST_FRONT = buildOrganicCrest(41, 4, 60, 42); // closest: big, chunky swell

interface WaveLayerProps {
  animationClass: string;
  crest: string;
  fill: string;
  opacity: number;
  bottom: string;
  height: string;
  crestStrokeOpacity?: number;
  crestStrokeWidth?: number;
}

function WaveLayer({
  animationClass,
  crest,
  fill,
  opacity,
  bottom,
  height,
  crestStrokeOpacity = 0.5,
  crestStrokeWidth = 1.5,
}: WaveLayerProps) {
  const fillPath = `${crest} L1200,200 L0,200 Z`;
  return (
    <svg
      className={cn("absolute left-0 w-[200%]", animationClass)}
      style={{ bottom, height }}
      viewBox="0 0 2400 200"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* fill opacity is set per-path (not on the <svg>) so it never dims the
          crest highlight stroke drawn on top of it below */}
      <path d={fillPath} fill={fill} fillOpacity={opacity} />
      <path d={fillPath} fill={fill} fillOpacity={opacity} transform="translate(1200,0)" />
      {/* warm highlight along the crest line, for a bit of shimmer/dimension */}
      <path
        d={crest}
        fill="none"
        stroke="#FFFBEA"
        strokeOpacity={crestStrokeOpacity}
        strokeWidth={crestStrokeWidth}
      />
      <path
        d={crest}
        fill="none"
        stroke="#FFFBEA"
        strokeOpacity={crestStrokeOpacity}
        strokeWidth={crestStrokeWidth}
        transform="translate(1200,0)"
      />
    </svg>
  );
}

/** Small oil-tanker silhouette that sails across the background — a real
 * tanker color scheme (dark hull, red boot-topping stripe, white
 * superstructure) and a smoothly curved bow instead of a sharp triangle
 * point, with tank domes along the deck as the giveaway for "tanker". */
function Tanker({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 46"
      className={cn("h-full w-full animate-boat-bob", className)}
      aria-hidden="true"
    >
      {/* wake — the ship sails bow-first to the right, so the wake trails to
          the left of the stern: a classic V spreading astern plus a few
          fading foam dots, both giveaways that the ship is actually moving. */}
      <path
        d="M44,26 Q22,15 3,10"
        fill="none"
        stroke="#FFFBEA"
        strokeOpacity={0.45}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M44,26 Q22,37 3,42"
        fill="none"
        stroke="#FFFBEA"
        strokeOpacity={0.45}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <ellipse cx="33" cy="26" rx="3" ry="1.3" fill="#FFFBEA" fillOpacity={0.5} />
      <ellipse cx="23" cy="26" rx="2.4" ry="1" fill="#FFFBEA" fillOpacity={0.35} />
      <ellipse cx="14" cy="26" rx="1.8" ry="0.8" fill="#FFFBEA" fillOpacity={0.2} />

      {/* main hull — dark, with a smoothly curved (not pointed) bow */}
      <path
        d="M44,18 L128,18 Q144,18 152,26 Q144,34 128,34 L44,34 Z"
        fill="#332B3D"
      />
      {/* red boot-topping stripe along the waterline */}
      <path
        d="M44,30 L128,30 Q138,30 145,26.5 Q138,34 128,34 L44,34 Z"
        fill="#B23A2E"
      />
      {/* deck line */}
      <line x1="44" y1="18" x2="128" y2="18" stroke="#F7F3E8" strokeOpacity={0.5} strokeWidth={1} />
      {/* tank domes along the deck — the visual cue that reads as "oil tanker" */}
      <ellipse cx="84" cy="18" rx="7" ry="3.2" fill="#332B3D" />
      <ellipse cx="102" cy="18" rx="7" ry="3.2" fill="#332B3D" />
      <ellipse cx="120" cy="18" rx="7" ry="3.2" fill="#332B3D" />
      {/* bridge / superstructure toward the stern, white with dark windows */}
      <rect x="48" y="6" width="18" height="12" fill="#F7F3E8" />
      <rect x="51" y="10" width="12" height="4.5" fill="#332B3D" fillOpacity={0.6} />
      {/* funnel */}
      <rect x="54" y="1" width="6" height="5" fill="#B23A2E" />
    </svg>
  );
}

/**
 * Full-bleed animated wave background for the login screen: a warm brand-color
 * gradient sky with three horizontally-drifting SVG wave layers for depth.
 * Pure CSS animation — automatically respects prefers-reduced-motion (see
 * index.css), no JS animation loop and nothing to clean up on unmount.
 */
export default function LoginBackground({ className }: LoginBackgroundProps) {
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{
        background: "linear-gradient(180deg, #FFF5C5 0%, #F58C77 100%)",
      }}
      aria-hidden="true"
    >
      {/* soft ambient glow, like a low sun catching the sky */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 55% at 28% 18%, rgba(255,255,255,0.45), transparent 70%)",
        }}
      />

      <WaveLayer
        animationClass="animate-wave-back"
        crest={CREST_BACK}
        fill="#FFC978"
        opacity={0.65}
        bottom="18%"
        height="52%"
      />
      <WaveLayer
        animationClass="animate-wave-mid"
        crest={CREST_MID}
        fill="#F58C77"
        opacity={0.8}
        bottom="10%"
        height="46%"
      />
      <WaveLayer
        animationClass="animate-wave-back"
        crest={CREST_ROSE}
        fill="#C15B72"
        opacity={0.65}
        bottom="4%"
        height="40%"
      />
      <WaveLayer
        animationClass="animate-wave-front"
        crest={CREST_FRONT}
        fill="#5A305A"
        opacity={0.6}
        bottom="0%"
        height="34%"
        crestStrokeOpacity={0.6}
        crestStrokeWidth={2}
      />

      {/* Wrapper drives the edge-to-edge sail (animates `left`); Tanker itself
          only handles the gentle bob, so the two animations don't fight. */}
      <div
        className="absolute bottom-[17%] w-28 h-10 lg:w-40 lg:h-14 animate-tanker-sail"
        style={{ left: "6%" }}
      >
        <Tanker className="block" />
      </div>
    </div>
  );
}
