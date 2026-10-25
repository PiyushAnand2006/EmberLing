// Emberling brand kit — logo mark, wordmark/lockup, Orby the mascot (with
// moods), the Dotlings bot family, and the working-state loader.
//
// Brand idea: "one bright dot in orbit" — the agent is a dot, the ring is its
// reach, satellites are subagents/triggers (always brand orange). Geometry is
// shared with assets/brand/*.svg; monoline stroke weight matches Icons.tsx.
import React, { useId } from "react";
import type { BotFace } from "../types";

export const BRAND_ORANGE = "#f54e00";
export const BRAND_ORANGE_SOFT = "#ff6a24";
export const INK = "#141414";
export const PAPER = "#f0f0f0";

// Injected once per animated component instance; duplicate rules are harmless.
const BrandStyle = () => (
  <style>{`@keyframes em-orbit-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
);

function DotGradient({ id }: { id: string }) {
  return (
    <radialGradient id={id} cx="0.35" cy="0.28" r="0.9">
      <stop offset="0" stopColor="#ff8a4d" />
      <stop offset="0.55" stopColor={BRAND_ORANGE} />
      <stop offset="1" stopColor="#cf4100" />
    </radialGradient>
  );
}

export type MarkVariant = "color" | "mono" | "ink" | "brand";

/** The logo mark: a bright dot with an orbit ring and a satellite bead. 64-grid. */
export function LogoMark({ size = 24, variant = "color" }: { size?: number; variant?: MarkVariant }) {
  const gid = useId();
  const ringColor = variant === "ink" ? INK : PAPER;
  const ringOpacity = variant === "color" || variant === "mono" ? 0.92 : 1;
  const satelliteColor = variant === "brand" ? BRAND_ORANGE : variant === "ink" ? INK : variant === "mono" ? PAPER : BRAND_ORANGE_SOFT;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {variant === "color" && <DotGradient id={gid} />}
      <ellipse cx="32" cy="32.5" rx="28.5" ry="10.5" transform="rotate(-16 32 32.5)" stroke={ringColor} strokeOpacity={ringOpacity} strokeWidth="4.5" />
      <circle cx="32" cy="35" r="13.5" fill={variant === "color" ? `url(#${gid})` : variant === "brand" ? BRAND_ORANGE : variant === "ink" ? INK : PAPER} />
      <path d="M59.4 24.65 A28.5 10.5 -16 0 1 4.6 40.35" stroke={ringColor} strokeOpacity={ringOpacity} strokeWidth="4.5" />
      <circle cx="52.8" cy="20.3" r="3.4" fill={satelliteColor} />
    </svg>
  );
}

// ——— Wordmark: custom geometric monoline letterforms, cap 100, stroke 13 ———
// Advances for E M B E R L I N G.
const LETTER_ADVANCE = [0, 59.5, 133, 205.5, 265, 331.5, 394, 421.5, 495];

function Letters({ ink }: { ink: string }) {
  return (
    <>
      <g stroke={ink}>
        <path d="M45 6.5 H13 V93.5 H45 M13 50 H38" />
        <path transform={`translate(${LETTER_ADVANCE[1]} 0)`} d="M13 93.5 V6.5 L36 55 L59 6.5 V93.5" />
        <path transform={`translate(${LETTER_ADVANCE[2]} 0)`} d="M13 6.5 V93.5 M13 6.5 H32 A20.25 20.25 0 0 1 32 47 H13 M13 47 H34 A23.25 23.25 0 0 1 34 93.5 H13" />
        <path transform={`translate(${LETTER_ADVANCE[3]} 0)`} d="M45 6.5 H13 V93.5 H45 M13 50 H38" />
        <path transform={`translate(${LETTER_ADVANCE[4]} 0)`} d="M13 6.5 V93.5 M13 6.5 H30 A21.75 21.75 0 0 1 30 50 H13 M30 50 L52 93.5" />
      </g>
      <g stroke={BRAND_ORANGE}>
        <path transform={`translate(${LETTER_ADVANCE[5]} 0)`} d="M13 6.5 V93.5 H48" />
        <path transform={`translate(${LETTER_ADVANCE[6]} 0)`} d="M13 6.5 V93.5" />
        <path transform={`translate(${LETTER_ADVANCE[7]} 0)`} d="M13 93.5 V6.5 L59 93.5 V6.5" />
        <path transform={`translate(${LETTER_ADVANCE[8]} 0)`} d="M52 31 A27 27 0 1 0 52 69 L52 52 H40" />
      </g>
    </>
  );
}

/** "EMBERLING" wordmark. variant "dark" = for dark surfaces, "light" = ink for light surfaces. */
export function Wordmark({ height = 24, variant = "dark" }: { height?: number; variant?: "dark" | "light" }) {
  const ink = variant === "light" ? INK : PAPER;
  return (
    <svg width={height * 5.6} height={height} viewBox="0 0 560 100" fill="none" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" aria-label="Emberling">
      <Letters ink={ink} />
    </svg>
  );
}

/** Horizontal lockup: mark + wordmark. */
export function LogoLockup({ height = 28, variant = "dark" }: { height?: number; variant?: "dark" | "light" }) {
  const gid = useId();
  const ink = variant === "light" ? INK : PAPER;
  return (
    <svg width={height * 7.83} height={height} viewBox="0 0 783 100" fill="none" aria-label="Emberling">
      {variant === "dark" && <DotGradient id={gid} />}
      <g transform="translate(-0.4 -47.1) scale(2.97)">
        <ellipse cx="32" cy="32.5" rx="28.5" ry="10.5" transform="rotate(-16 32 32.5)" stroke={ink} strokeOpacity={variant === "dark" ? 0.92 : 1} strokeWidth="4.5" />
        <circle cx="32" cy="35" r="13.5" fill={variant === "dark" ? `url(#${gid})` : INK} />
        <path d="M59.4 24.65 A28.5 10.5 -16 0 1 4.6 40.35" stroke={ink} strokeOpacity={variant === "dark" ? 0.92 : 1} strokeWidth="4.5" />
        <circle cx="52.8" cy="20.3" r="3.4" fill={variant === "dark" ? BRAND_ORANGE_SOFT : INK} />
      </g>
      <g transform="translate(223 0)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round">
        <Letters ink={ink} />
      </g>
    </svg>
  );
}

// ——— Orby, the mascot ———
export type OrbyMood = "idle" | "joy" | "think" | "oops";

function OrbyFace({ mood }: { mood: OrbyMood }) {
  if (mood === "joy")
    return (
      <>
        <path d="M34.5 46.5 Q38.5 42.5 42.5 46.5" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
        <path d="M53.5 46.5 Q57.5 42.5 61.5 46.5" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
        <ellipse cx="34" cy="55" rx="4.2" ry="2.6" fill="#e0566f" opacity="0.35" />
        <ellipse cx="62" cy="55" rx="4.2" ry="2.6" fill="#e0566f" opacity="0.35" />
        <path d="M43.5 57.5 Q48 62.5 52.5 57.5" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      </>
    );
  if (mood === "think")
    return (
      <>
        <circle cx="37.8" cy="44" r="2.7" fill={INK} />
        <circle cx="56.8" cy="44" r="2.7" fill={INK} />
        <circle cx="36.9" cy="43.1" r="0.9" fill="#fff" opacity="0.85" />
        <circle cx="55.9" cy="43.1" r="0.9" fill="#fff" opacity="0.85" />
        <ellipse cx="34" cy="55" rx="4.2" ry="2.6" fill="#e0566f" opacity="0.35" />
        <ellipse cx="62" cy="55" rx="4.2" ry="2.6" fill="#e0566f" opacity="0.35" />
        <circle cx="48" cy="60" r="2.4" fill={INK} />
      </>
    );
  if (mood === "oops")
    return (
      <>
        <ellipse cx="38.5" cy="46" rx="3.2" ry="4.3" fill={INK} />
        <ellipse cx="57.5" cy="46" rx="3.2" ry="4.3" fill={INK} />
        <circle cx="37.5" cy="44.4" r="1.1" fill="#fff" opacity="0.85" />
        <circle cx="56.5" cy="44.4" r="1.1" fill="#fff" opacity="0.85" />
        <ellipse cx="34" cy="55.5" rx="4.2" ry="2.6" fill="#e0566f" opacity="0.3" />
        <ellipse cx="62" cy="55.5" rx="4.2" ry="2.6" fill="#e0566f" opacity="0.3" />
        <path d="M44 60.5 H52" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M71.5 26.5 Q75 31 71.5 33.5 Q68 31 71.5 26.5 Z" fill="#599ce7" opacity="0.85" />
      </>
    );
  return (
    <>
      <ellipse cx="38.5" cy="46" rx="2.8" ry="3.8" fill={INK} />
      <ellipse cx="57.5" cy="46" rx="2.8" ry="3.8" fill={INK} />
      <circle cx="37.6" cy="44.6" r="1" fill="#fff" opacity="0.85" />
      <circle cx="56.6" cy="44.6" r="1" fill="#fff" opacity="0.85" />
      <ellipse cx="34" cy="55" rx="4.2" ry="2.6" fill="#e0566f" opacity="0.35" />
      <ellipse cx="62" cy="55" rx="4.2" ry="2.6" fill="#e0566f" opacity="0.35" />
      <path d="M44 58 Q48 61.5 52 58" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
    </>
  );
}

/** Orby — face of Emberling. mood "think" slowly spins the orbit ring. */
export function Orby({ size = 96, mood = "idle" }: { size?: number; mood?: OrbyMood }) {
  const gid = useId();
  const spin = mood === "think";
  const ringAnim = { transformOrigin: "48px 50px", animation: spin ? "em-orbit-spin 6s linear infinite" : undefined };
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-label="Orby">
      {spin && <BrandStyle />}
      <defs>
        <radialGradient id={gid} cx="0.33" cy="0.28" r="0.95">
          <stop offset="0" stopColor="#ff8a4d" />
          <stop offset="0.55" stopColor={BRAND_ORANGE} />
          <stop offset="1" stopColor="#c93e00" />
        </radialGradient>
      </defs>
      <ellipse cx="48" cy="88" rx="20" ry="4.5" fill="#000" opacity="0.28" />
      <g style={ringAnim}>
        <ellipse cx="48" cy="50" rx="41" ry="13.5" transform="rotate(-14 48 50)" stroke={PAPER} strokeOpacity="0.92" strokeWidth="4.5" />
      </g>
      <circle cx="48" cy="52" r="30" fill={`url(#${gid})`} />
      <g style={ringAnim}>
        <path d="M87.77 40.08 A41 13.5 -14 0 1 8.23 59.92" stroke={PAPER} strokeOpacity="0.92" strokeWidth="4.5" />
        <circle cx="78.71" cy="34.36" r="3.6" fill={BRAND_ORANGE_SOFT} />
      </g>
      <OrbyFace mood={mood} />
    </svg>
  );
}

// ——— The Dotlings (bot-family characters) ———
type DotlingProps = { size?: number };

function DotlingBase({ size, gid, from, mid, to, children }: DotlingProps & { gid: string; from: string; mid: string; to: string; children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id={gid} cx="0.33" cy="0.28" r="0.95">
          <stop offset="0" stopColor={from} />
          <stop offset="0.55" stopColor={mid} />
          <stop offset="1" stopColor={to} />
        </radialGradient>
      </defs>
      <ellipse cx="48" cy="88" rx="20" ry="4.5" fill="#000" opacity="0.28" />
      <circle cx="48" cy="52" r="30" fill={`url(#${gid})`} />
      {children}
    </svg>
  );
}

const Eyes = () => (
  <>
    <ellipse cx="38.5" cy="46" rx="2.8" ry="3.8" fill={INK} />
    <ellipse cx="57.5" cy="46" rx="2.8" ry="3.8" fill={INK} />
    <circle cx="37.6" cy="44.6" r="1" fill="#fff" opacity="0.85" />
    <circle cx="56.6" cy="44.6" r="1" fill="#fff" opacity="0.85" />
  </>
);
const Blush = () => (
  <>
    <ellipse cx="34" cy="55" rx="4.2" ry="2.6" fill="#e0566f" opacity="0.35" />
    <ellipse cx="62" cy="55" rx="4.2" ry="2.6" fill="#e0566f" opacity="0.35" />
  </>
);

/** Scout — web & search bot (accent blue, antenna + magnifier). */
export function Scout({ size = 96 }: DotlingProps) {
  const gid = useId();
  return (
    <DotlingBase size={size} gid={gid} from="#8cc0f2" mid="#599ce7" to="#3d7cc0">
      <path d="M48 22 V12" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="48" cy="9.5" r="4" fill={BRAND_ORANGE_SOFT} />
      <path d="M54.5 4.5 A8.5 8.5 0 0 1 57.5 11" stroke="#599ce7" strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
      <circle cx="70" cy="68" r="7" fill={INK} fillOpacity="0.12" stroke={INK} strokeWidth="3" />
      <path d="M75 73 L81.5 79.5" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <Eyes />
      <Blush />
      <path d="M44 58 Q48 61.5 52 58" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
    </DotlingBase>
  );
}

/** Forge — terminal & code bot (green, prompt visor). */
export function Forge({ size = 96 }: DotlingProps) {
  const gid = useId();
  return (
    <DotlingBase size={size} gid={gid} from="#6fc48f" mid="#3fa266" to="#2c7f4c">
      <rect x="26" y="38" width="44" height="17" rx="8.5" fill="#0e1f16" stroke={INK} strokeWidth="1.5" />
      <path d="M34 43 L40 46.5 L34 50" stroke="#8fe6b0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M45 51 H52" stroke="#8fe6b0" strokeWidth="2.6" strokeLinecap="round" />
      <Blush />
      <path d="M44 62 Q48 65 52 62" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
    </DotlingBase>
  );
}

/** Echo — memories & voice bot (magenta, headphones). */
export function Echo({ size = 96 }: DotlingProps) {
  const gid = useId();
  return (
    <DotlingBase size={size} gid={gid} from="#d0b2cd" mid="#b48ead" to="#8f6a88">
      <path d="M20 46 A28 28 0 0 1 76 46" stroke="#3f2c3a" strokeWidth="4.5" strokeLinecap="round" />
      <rect x="13" y="42" width="11.5" height="19" rx="5.75" fill="#3f2c3a" />
      <rect x="71.5" y="42" width="11.5" height="19" rx="5.75" fill="#3f2c3a" />
      <circle cx="18.75" cy="51.5" r="2.2" fill={BRAND_ORANGE_SOFT} />
      <circle cx="77.25" cy="51.5" r="2.2" fill={BRAND_ORANGE_SOFT} />
      <path d="M34.5 46 Q38.5 42 42.5 46" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M53.5 46 Q57.5 42 61.5 46" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
      <Blush />
      <path d="M44.5 57 Q48 60.5 51.5 57" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
    </DotlingBase>
  );
}

/** Tempo — schedules & automations bot (yellow, alarm bells + clock badge). */
export function Tempo({ size = 96 }: DotlingProps) {
  const gid = useId();
  return (
    <DotlingBase size={size} gid={gid} from="#f8d194" mid="#f1b467" to="#d19041">
      <circle cx="35" cy="16.5" r="5.5" fill="#c98a3f" />
      <circle cx="61" cy="16.5" r="5.5" fill="#c98a3f" />
      <path d="M36.5 21 L38 24" stroke="#c98a3f" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M59.5 21 L58 24" stroke="#c98a3f" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="66" cy="28" r="6.5" fill={INK} />
      <path d="M66 28 V24.8 M66 28 L68.6 29.6" stroke="#f1b467" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="38.5" cy="46" rx="2.8" ry="3.8" fill={INK} />
      <circle cx="37.6" cy="44.6" r="1" fill="#fff" opacity="0.85" />
      <path d="M53.5 46.5 Q57.5 49.5 61.5 46.5" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
      <Blush />
      <path d="M43 56.5 Q48 62 53 56.5" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
    </DotlingBase>
  );
}

/** Sentry — approvals, vault & security bot (purple, shield badge). */
export function Sentry({ size = 96 }: DotlingProps) {
  const gid = useId();
  return (
    <DotlingBase size={size} gid={gid} from="#b4abf7" mid="#9386f2" to="#6f60d8">
      <path d="M29 56.5 L38.5 60.5 V67.5 C38.5 73.5 34.5 77.5 29 79.5 C23.5 77.5 19.5 73.5 19.5 67.5 V60.5 Z" fill={INK} />
      <path d="M24.5 67.5 L27.8 70.7 L34 63.8" stroke="#b9aef8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <Eyes />
      <Blush />
      <path d="M44.5 58.5 Q48 60.5 51.5 58.5" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
    </DotlingBase>
  );
}

// ——— Working-state loader: the mark, orbiting ———
/** Small loader: brand dot in a tilted ring with a satellite sweeping past. */
export function AgentDots({ size = 18 }: { size?: number }) {
  const gid = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="Working">
      <defs>
        <radialGradient id={gid} cx="0.35" cy="0.28" r="0.9">
          <stop offset="0" stopColor="#ff8a4d" />
          <stop offset="0.55" stopColor={BRAND_ORANGE} />
          <stop offset="1" stopColor="#cf4100" />
        </radialGradient>
      </defs>
      <ellipse cx="16" cy="15.5" rx="13.5" ry="5" transform="rotate(-16 16 15.5)" stroke={PAPER} strokeOpacity="0.25" strokeWidth="1.8" />
      <circle cx="16" cy="17" r="6" fill={`url(#${gid})`} />
      <circle r="1.8" fill={BRAND_ORANGE_SOFT}>
        <animateMotion dur="1.8s" repeatCount="indefinite" path="M28.98 11.78 A13.5 5 -16 1 1 3.02 19.22 A13.5 5 -16 1 1 28.98 11.78 Z" />
      </circle>
    </svg>
  );
}

// ——— Bot-face picker helpers ———
export const DOTLING_FACES: { id: BotFace; name: string; role: string }[] = [
  { id: "orby", name: "Orby", role: "The agent" },
  { id: "scout", name: "Scout", role: "Web & search" },
  { id: "forge", name: "Forge", role: "Code & terminal" },
  { id: "echo", name: "Echo", role: "Memory & voice" },
  { id: "tempo", name: "Tempo", role: "Automations" },
  { id: "sentry", name: "Sentry", role: "Security" },
];

/** Renders a Dotling by face id; falls back to Orby. */
export function DotlingFace({ face, size = 36, mood = "idle" }: { face: BotFace; size?: number; mood?: OrbyMood }) {
  switch (face) {
    case "scout":
      return <Scout size={size} />;
    case "forge":
      return <Forge size={size} />;
    case "echo":
      return <Echo size={size} />;
    case "tempo":
      return <Tempo size={size} />;
    case "sentry":
      return <Sentry size={size} />;
    default:
      return <Orby size={size} mood={mood} />;
  }
}
