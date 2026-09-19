"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

const VB = 400;
const C = VB / 2;

type Layer = {
  width: number;
  dash: string;
  colour: string;
  opacity: number;
  /** Adds a blurred copy underneath, inside the same rotating group. */
  glow?: boolean;
};

type Ring = {
  r: number;
  duration: string;
  reverse?: boolean;
  /** Drawn together and turned together — see the note in the render. */
  layers: Layer[];
};

/**
 * The rings, outside in.
 *
 * Uneven dash patterns and mismatched rates are the whole trick: evenly
 * spaced segments turning at one speed read as a loading spinner, while
 * runs of different lengths turning at different rates read as an
 * instrument whose parts mean different things. All of them glide — what
 * makes this mechanical is the shape of the segments and the fixed
 * calipers they pass, not the motion stuttering.
 *
 * Layers sharing a radius are one ring, not several: the lit segment, the
 * structure it rides on, and the notches cut across it all belong to the
 * same object and have to turn as one.
 */
const RINGS: Ring[] = [
  { r: 194, duration: "150s", layers: [{ width: 1, dash: "1.5 5", colour: "var(--hud-metal)", opacity: 0.85 }] },
  { r: 186, duration: "110s", reverse: true, layers: [{ width: 1, dash: "30 14", colour: "var(--hud-metal)", opacity: 0.7 }] },
  {
    r: 176,
    duration: "95s",
    reverse: true,
    layers: [
      { width: 9, dash: "46 10 18 8 74 12 30 8 14 10", colour: "var(--hud-metal)", opacity: 0.9 },
      { width: 9, dash: "46 430", colour: "var(--hud-orange)", opacity: 0.95, glow: true },
    ],
  },
  { r: 164, duration: "60s", layers: [{ width: 3, dash: "2.5 8", colour: "var(--hud-orange)", opacity: 0.5 }] },
  {
    r: 152,
    duration: "34s",
    layers: [
      { width: 13, dash: "96 214 58 150", colour: "var(--hud-orange)", opacity: 1, glow: true },
      { width: 13, dash: "3 15", colour: "#120a05", opacity: 0.55 },
    ],
  },
  { r: 138, duration: "80s", layers: [{ width: 1, dash: "1.5 4", colour: "var(--hud-metal)", opacity: 0.9 }] },
  { r: 128, duration: "70s", reverse: true, layers: [{ width: 8, dash: "22 12 46 10 18 14 36 10", colour: "var(--hud-metal)", opacity: 0.95 }] },
  { r: 118, duration: "48s", layers: [{ width: 2, dash: "2 7", colour: "var(--hud-orange)", opacity: 0.4 }] },
  {
    r: 108,
    duration: "26s",
    reverse: true,
    layers: [
      { width: 11, dash: "124 160 44 180", colour: "var(--hud-orange)", opacity: 1, glow: true },
      { width: 11, dash: "3 13", colour: "#120a05", opacity: 0.5 },
    ],
  },
];

interface FridayCoreProps {
  /** Turns the motion and the brightness up while a turn is in progress. */
  live?: boolean;
  className?: string;
}

/**
 * The centrepiece: concentric instrumentation around a dark face with the
 * name in it.
 *
 * Drawn in a fixed 400-unit viewBox and scaled by CSS, so the same component
 * is the hero on a desktop and still legible on a phone.
 */
export function FridayCore({ live, className }: FridayCoreProps) {
  const spin = (ring: Ring): CSSProperties =>
    ({
      "--ring-duration": ring.duration,
      "--ring-direction": ring.reverse ? "reverse" : "normal",
    }) as CSSProperties;

  return (
    <div className={cn("relative aspect-square w-full", className)}>
      <svg viewBox={`0 0 ${VB} ${VB}`} className="h-full w-full overflow-visible">
        <defs>
          <filter id="core-bloom" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <radialGradient id="core-face">
            <stop offset="70%" stopColor="#040202" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--hud-orange)" stopOpacity="0.1" />
          </radialGradient>
          <linearGradient id="core-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--hud-orange)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--hud-orange-bright)" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* One rotating group per ring.
            Everything on a ring — the lit segment, its bloom, the notches
            cut across it — turns inside a single transform. Animating them
            separately meant three animations to keep in step, a blur
            re-rasterised every frame, and a glow free to drift off the arc
            it belongs to. */}
        {RINGS.map((ring) => (
          <g key={ring.r} className="ring-rotate" style={spin(ring)}>
            {ring.layers.map((layer, index) => (
              <g key={index}>
                {layer.glow && (
                  <circle
                    cx={C} cy={C} r={ring.r}
                    fill="none" stroke={layer.colour} strokeWidth={layer.width + 6}
                    strokeDasharray={layer.dash} filter="url(#core-bloom)"
                    opacity={live ? 0.5 : 0.28}
                    className="transition-opacity duration-700 ease-out"
                  />
                )}
                <circle
                  cx={C} cy={C} r={ring.r}
                  fill="none" stroke={layer.colour} strokeWidth={layer.width}
                  strokeDasharray={layer.dash} opacity={layer.opacity}
                />
              </g>
            ))}
          </g>
        ))}

        {/* Fixed calipers at the cardinals, so everything else is visibly
            turning against something that is not. */}
        <g stroke="var(--hud-orange)" strokeWidth={1.6} opacity={0.65} fill="none">
          {[0, 90, 180, 270].map((deg) => (
            <path
              key={deg}
              d={`M ${C - 16} 206 L ${C - 16} 194 L ${C + 16} 194 L ${C + 16} 206`}
              transform={`rotate(${deg} ${C} ${C})`}
            />
          ))}
        </g>

        {/* Readouts flickering on their own schedules. */}
        {[
          { deg: 28, delay: "0s" },
          { deg: 112, delay: "1.4s" },
          { deg: 203, delay: "2.3s" },
          { deg: 316, delay: "0.8s" },
        ].map(({ deg, delay }) => (
          <rect
            key={deg}
            x={C - 6} y={156} width={12} height={5}
            fill="var(--hud-orange-bright)"
            transform={`rotate(${deg} ${C} ${C})`}
            className="ring-blink"
            style={{ "--ring-duration": "3.4s", "--ring-delay": delay } as CSSProperties}
          />
        ))}

        <circle cx={C} cy={C} r={98} fill="#050302" />
        <circle cx={C} cy={C} r={98} fill="url(#core-face)" />

        {/* One constant rate. Changing the duration to show a turn in
            progress restarted the animation and jumped the sweep back to
            the top; brightness says the same thing without the jolt. */}
        <g className="ring-rotate" style={{ "--ring-duration": "6s" } as CSSProperties}>
          <path
            d={`M ${C} ${C} L ${C + 94} ${C - 30} A 98 98 0 0 1 ${C + 94} ${C + 30} Z`}
            fill="url(#core-sweep)"
            opacity={live ? 0.42 : 0.2}
            className="transition-opacity duration-700 ease-out"
          />
        </g>

        {/* The rim: one hot hairline where the glass meets the instrument. */}
        <circle cx={C} cy={C} r={98} fill="none" stroke="var(--hud-orange)" strokeWidth={4} opacity={0.35} filter="url(#core-bloom)" />
        <circle cx={C} cy={C} r={98} fill="none" stroke="var(--hud-orange-bright)" strokeWidth={1.5} opacity={0.9} />
        <circle
          cx={C} cy={C} r={90}
          fill="none" stroke="var(--hud-orange)" strokeWidth={1} strokeDasharray="2 10" opacity={0.5}
          className="ring-rotate" style={{ "--ring-duration": "40s", "--ring-direction": "reverse" } as CSSProperties}
        />
      </svg>

      {/* The name, set in HTML rather than SVG text so it hyphenates, scales
          and tracks like the rest of the interface. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span className="font-[family-name:var(--font-hud)] text-[7px] tracking-[0.42em] text-[var(--hud-orange)] sm:text-[9px]">
          AI ASSISTANT
        </span>
        <span
          className={cn(
            "font-[family-name:var(--font-hud)] text-[17px] font-bold leading-none tracking-[0.05em] text-white transition-all sm:text-[34px]",
            live
              ? "[text-shadow:0_0_26px_rgba(255,150,60,0.95)]"
              : "[text-shadow:0_0_18px_rgba(255,122,26,0.7)]"
          )}
        >
          F.R.I.D.A.Y.
        </span>
        <span className="font-[family-name:var(--font-hud)] text-[6px] tracking-[0.3em] text-[var(--hud-text-dim)] sm:text-[8px]">
          FOR A BETTER TOMORROW
        </span>
      </div>
    </div>
  );
}
