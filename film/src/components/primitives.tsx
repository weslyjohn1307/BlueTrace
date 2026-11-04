import React from 'react';
import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame } from 'remotion';
import { C, EASE_ENTER, FONT, ramp } from '../theme';

/** Vellum ground with drafting dot grid and quiet paper tooth. */
export function Paper({
  children,
  withDotGrid = true,
}: {
  children?: React.ReactNode;
  withDotGrid?: boolean;
}) {
  return (
    <AbsoluteFill style={{ backgroundColor: '#f5efeb' }}>
      {withDotGrid && (
        <AbsoluteFill style={{ pointerEvents: 'none', opacity: 0.65 }}>
          <svg width="100%" height="100%">
            <defs>
              <pattern
                id="drafting-dots"
                width="28"
                height="28"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="2" cy="2" r="1.15" fill="#c7c0b0" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#drafting-dots)" />
          </svg>
        </AbsoluteFill>
      )}
      {children}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          mixBlendMode: 'multiply',
          opacity: 0.04,
        }}
      >
        <svg width="100%" height="100%">
          <filter id="tooth">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves={2}
              seed={7}
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#tooth)" />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** One statement. Enters by rising a few pixels out of transparency — never from nothing, never bouncing. */
export function Statement({
  lines,
  enterAt = 0,
  exitAt,
  size = 96,
  align = 'left',
  color = C.ink,
  weight = 500,
  style,
}: {
  lines: string[];
  enterAt?: number;
  exitAt?: number;
  size?: number;
  align?: 'left' | 'center';
  color?: string;
  weight?: number;
  style?: React.CSSProperties;
}) {
  const f = useCurrentFrame();
  const enter = ramp(f, [enterAt, enterAt + 42], [0, 1], EASE_ENTER);
  const exit = exitAt === undefined ? 1 : ramp(f, [exitAt, exitAt + 24], [1, 0]);
  return (
    <div style={{ fontFamily: FONT.display, fontWeight: weight, fontSize: size, lineHeight: 1.06, letterSpacing: '-0.018em', color, textAlign: align, ...style }}>
      {lines.map((line, i) => {
        const li = ramp(f, [enterAt + i * 8, enterAt + i * 8 + 42], [0, 1], EASE_ENTER);
        return (
          <div key={line} style={{ opacity: Math.min(li, enter) * exit, transform: `translateY(${(1 - li) * 18}px)` }}>{line}</div>
        );
      })}
    </div>
  );
}

/** Mandatory label on illustrative sequences (.agents/rules/05 §5). */
export function ConceptTag({
  onDark = false,
  style,
}: {
  onDark?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        position: style?.position ?? 'absolute',
        left: style?.position === 'relative' || style?.position === 'static' ? undefined : (style?.left ?? 140),
        bottom: style?.position === 'relative' || style?.position === 'static' ? undefined : (style?.bottom ?? 44),
        fontFamily: FONT.mono,
        fontSize: 12,
        letterSpacing: '0.12em',
        color: onDark ? '#64748b' : C.muted,
        ...style,
      }}
    >
      CONCEPT — NOT THE SHIPPED UI · SYNTHETIC DRAWING
    </div>
  );
}

export const WINDOW = { w: 1440, h: 810, radius: 14 };

/**
 * Floating product window. Shows real footage when `src` is set; otherwise an explicit
 * placeholder naming exactly what must be recorded. Never simulated product UI.
 */
export function FootageWindow({
  src,
  label,
  brief,
  scale = 1,
  origin = '50% 50%',
  opacity = 1,
  lift = 0,
  yOffset = -62,
}: {
  src: string | null;
  label: string;
  brief: string[];
  scale?: number;
  origin?: string;
  opacity?: number;
  lift?: number;
  yOffset?: number;
}) {
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: WINDOW.w,
          height: WINDOW.h,
          borderRadius: WINDOW.radius,
          overflow: 'hidden',
          opacity,
          transform: `translateY(${yOffset + lift}px)`,
          boxShadow: '0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)',
          backgroundColor: '#0b1317',
        }}
      >
        <div style={{ width: '100%', height: '100%', transform: `scale(${scale})`, transformOrigin: origin }}>
          {src ? (
            <OffthreadVideo src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
          ) : (
            <div style={{ position: 'absolute', inset: 26, border: '1.5px dashed #34474d', borderRadius: 8, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 80px', fontFamily: FONT.mono, color: '#8b9a9b' }}>
              <div style={{ fontSize: 20, letterSpacing: '0.14em', color: '#c9d3d2', marginBottom: 24 }}>{label} · REAL PRODUCT FOOTAGE GOES HERE</div>
              {brief.map((b) => <div key={b} style={{ fontSize: 18, lineHeight: 1.75 }}>— {b}</div>)}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
}
