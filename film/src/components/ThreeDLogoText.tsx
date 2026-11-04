import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, EASE_ENTER, EASE_MOVE, FONT, ramp } from '../theme';

interface ThreeDLogoTextProps {
  headline?: string;
  subtitle?: string;
}

export const ThreeDLogoText: React.FC<ThreeDLogoTextProps> = ({
  headline = 'BlueTrace',
  subtitle = 'From drawing to reviewable takeoff.',
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring for the entire 3D lockup
  const lockupSpring = spring({
    frame: Math.max(0, f - 2),
    fps,
    config: { damping: 14, mass: 0.6, stiffness: 100 },
  });

  // 3D Monolith Blocks Spring Assembly
  const block1Spring = spring({
    frame: Math.max(0, f - 6),
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 120 },
  });
  const block2Spring = spring({
    frame: Math.max(0, f - 11),
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 120 },
  });
  const block3Spring = spring({
    frame: Math.max(0, f - 16),
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 120 },
  });

  // Physical Specular Glint sweep across the 3D logo & typography (f: 28 - 85)
  const glintProgress = ramp(f, [28, 85], [-120, 220], EASE_MOVE);
  const glintOpacity = ramp(f, [28, 40], [0, 1], EASE_ENTER) * ramp(f, [75, 85], [1, 0], EASE_ENTER);

  // Subtle 3D perspective camera breathing
  const rotX = interpolate(f, [0, 300], [8, 4], { extrapolateRight: 'clamp' });
  const rotY = interpolate(f, [0, 300], [-5, -2], { extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        perspective: '1400px',
        transformStyle: 'preserve-3d',
        opacity: lockupSpring,
        transform: `translateY(${(1 - lockupSpring) * 30}px)`,
        userSelect: 'none',
      }}
    >
      {/* ------------------------------------------------------------- */}
      {/* 3D LOGO MONOLITHS (Architectural Trade Blocks)                  */}
      {/* ------------------------------------------------------------- */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 10,
          height: 60,
          marginBottom: 18,
          transform: `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
          transformStyle: 'preserve-3d',
          position: 'relative',
        }}
      >
        {/* Monolith 1: Supply Blue (H: 36, W: 10) */}
        <div
          style={{
            position: 'relative',
            width: 10,
            height: 36 * block1Spring,
            backgroundColor: C.supply,
            borderRadius: 2,
            boxShadow: '0 4px 10px rgba(40, 111, 159, 0.25)',
          }}
        />

        {/* Monolith 2: Slate Ink Center Pillar (H: 52, W: 10) */}
        <div
          style={{
            position: 'relative',
            width: 10,
            height: 52 * block2Spring,
            backgroundColor: C.ink,
            borderRadius: 2,
            boxShadow: '0 6px 14px rgba(23, 37, 43, 0.35)',
          }}
        />

        {/* Monolith 3: Plumbing Sage (H: 26, W: 10) */}
        <div
          style={{
            position: 'relative',
            width: 10,
            height: 26 * block3Spring,
            backgroundColor: C.plumbing,
            borderRadius: 2,
            boxShadow: '0 4px 10px rgba(50, 123, 107, 0.25)',
          }}
        />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3D PRACTICAL EXTRUDED TEXT LOCKUP                             */}
      {/* ------------------------------------------------------------- */}
      <div
        style={{
          position: 'relative',
          display: 'inline-block',
          fontFamily: FONT.display,
          fontSize: 96,
          fontWeight: 500,
          lineHeight: 1.0,
          letterSpacing: '-0.03em',
          color: C.ink,
          marginBottom: 16,
          transform: `perspective(1000px) rotateX(${rotX * 0.6}deg)`,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Real 3D Extruded Depth Bevels (Ink Depth Stacking) */}
        <span
          style={{
            position: 'absolute',
            inset: 0,
            color: '#28373e',
            textShadow: `
              0 1px 0 #28373e,
              0 2px 0 #202c32,
              0 3px 0 #182227,
              0 4px 1px rgba(23, 37, 43, 0.25),
              0 10px 22px rgba(23, 37, 43, 0.15)
            `,
            zIndex: 1,
          }}
        >
          {headline}
          <span style={{ fontStyle: 'italic', fontWeight: 400 }}>AI</span>
        </span>

        {/* Front Face */}
        <span style={{ position: 'relative', zIndex: 2 }}>
          {headline}
          <span style={{ fontStyle: 'italic', fontWeight: 400 }}>AI</span>
        </span>

        {/* Specular Light Flare sweeping across letters */}
        {glintOpacity > 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 3,
              backgroundImage: `linear-gradient(115deg, transparent ${glintProgress - 25}%, rgba(255,255,255,0.92) ${glintProgress}%, rgba(40,111,159,0.5) ${glintProgress + 4}%, transparent ${glintProgress + 25}%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              pointerEvents: 'none',
              opacity: glintOpacity * 0.95,
            }}
          >
            {headline}
            <span style={{ fontStyle: 'italic', fontWeight: 400 }}>AI</span>
          </div>
        )}
      </div>

      {/* Subtitle: High-Contrast Editorial Display Subtitle */}
      <div
        style={{
          fontFamily: FONT.display,
          fontStyle: 'italic',
          fontSize: 28,
          color: C.muted,
          letterSpacing: '-0.01em',
          maxWidth: 780,
          lineHeight: 1.25,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
};
