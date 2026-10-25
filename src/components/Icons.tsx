// SVG icon set (stroke style, 24px grid) — substitutes for the original's
// cursor-icons font, matching the same visual density.
import React from "react";

const S = ({ children, size = 16 }: { children: React.ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IconPencil = (p: { size?: number }) => (
  <S {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </S>
);
export const IconSearch = (p: { size?: number }) => (
  <S {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </S>
);
export const IconPlus = (p: { size?: number }) => (
  <S {...p}>
    <path d="M12 5v14M5 12h14" />
  </S>
);
export const IconSend = (p: { size?: number }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 4c-4.4 0-8 2.9-8 6.5 0 2 1.1 3.8 2.9 5v3.2c0 .5.6.8 1 .5l2.6-2c.5.1 1 .1 1.5.1 4.4 0 8-2.9 8-6.8S16.4 4 12 4Z" />
  </svg>
);
export const IconStop = (p: { size?: number }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
  </svg>
);
export const IconMic = (p: { size?: number }) => (
  <S {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </S>
);
export const IconPaperclip = (p: { size?: number }) => (
  <S {...p}>
    <path d="M21 11.5 12.5 20a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6L15 7" />
  </S>
);
export const IconSettings = (p: { size?: number }) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </S>
);
export const IconBot = (p: { size?: number }) => (
  <S {...p}>
    <rect x="4" y="8" width="16" height="12" rx="3" />
    <path d="M12 8V4M9 14h.01M15 14h.01" />
  </S>
);
export const IconBrain = (p: { size?: number }) => (
  <S {...p}>
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44A2.5 2.5 0 0 1 4.5 17.5a2.5 2.5 0 0 1-1.98-4A2.5 2.5 0 0 1 3 8.9a2.5 2.5 0 0 1 2-4A2.5 2.5 0 0 1 9.5 2Z" />
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.54-2.44 2.5 2.5 0 0 0 1.98-4A2.5 2.5 0 0 0 21 8.9a2.5 2.5 0 0 0-2-4A2.5 2.5 0 0 0 14.5 2Z" />
  </S>
);
export const IconClock = (p: { size?: number }) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </S>
);
export const IconPlug = (p: { size?: number }) => (
  <S {...p}>
    <path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0Z" />
    <path d="M12 17v5" />
  </S>
);
export const IconTrash = (p: { size?: number }) => (
  <S {...p}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </S>
);
export const IconPin = (p: { size?: number }) => (
  <S {...p}>
    <path d="M12 17v5M9 3h6l1 7 3 2H5l3-2Z" />
  </S>
);
export const IconBellOff = (p: { size?: number }) => (
  <S {...p}>
    <path d="M8.7 3A6 6 0 0 1 18 8c0 4 1 5 2 6H8M6 8c0 4-1 5-2 6h4" />
    <path d="M3 3l18 18M10.5 21a2 2 0 0 0 3 0" />
  </S>
);
export const IconBell = (p: { size?: number }) => (
  <S {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 4 1 5 2 6H4c1-1 2-2 2-6Z" />
    <path d="M10.5 21a2 2 0 0 0 3 0" />
  </S>
);
export const IconCopy = (p: { size?: number }) => (
  <S {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </S>
);
export const IconRefresh = (p: { size?: number }) => (
  <S {...p}>
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </S>
);
export const IconSmile = (p: { size?: number }) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
  </S>
);
export const IconChevronDown = (p: { size?: number }) => (
  <S {...p}>
    <path d="m6 9 6 6 6-6" />
  </S>
);
export const IconChevronRight = (p: { size?: number }) => (
  <S {...p}>
    <path d="m9 6 6 6-6 6" />
  </S>
);
export const IconCheck = (p: { size?: number }) => (
  <S {...p}>
    <path d="m4 12 5 5L20 6" />
  </S>
);
export const IconX = (p: { size?: number }) => (
  <S {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </S>
);
export const IconGlobe = (p: { size?: number }) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" />
  </S>
);
export const IconTerminal = (p: { size?: number }) => (
  <S {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="m7 9 3 3-3 3M13 15h4" />
  </S>
);
export const IconFile = (p: { size?: number }) => (
  <S {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
  </S>
);
export const IconImage = (p: { size?: number }) => (
  <S {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-5-5L5 21" />
  </S>
);
export const IconPlay = (p: { size?: number }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13l11-6.5Z" />
  </svg>
);
export const IconPause = (p: { size?: number }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="7" y="5" width="3.5" height="14" rx="1" />
    <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
  </svg>
);
export const IconMinimize = (p: { size?: number }) => (
  <svg width={p.size ?? 12} height={p.size ?? 12} viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
    <path d="M2 6h8" />
  </svg>
);
export const IconMaximize = (p: { size?: number }) => (
  <svg width={p.size ?? 12} height={p.size ?? 12} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
    <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
  </svg>
);
export const IconKey = (p: { size?: number }) => (
  <S {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="m10.8 12.2 8-8M16 3l3 3M14 5l3 3" />
  </S>
);
export const IconShield = (p: { size?: number }) => (
  <S {...p}>
    <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5Z" />
    <path d="m9 12 2 2 4-4" />
  </S>
);
export const IconSparkles = (p: { size?: number }) => (
  <S {...p}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />
    <path d="M19 15l.9 2.6L22.5 18l-2.6.9L19 21.5l-.9-2.6L15.5 18l2.6-.9Z" />
  </S>
);
export const IconInfo = (p: { size?: number }) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </S>
);
