import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, EASE_ENTER, FONT, ramp, s } from '../theme';
import { Paper } from '../components/primitives';
import { BrandSymbol } from '../components/BrandSymbol';

export const Shot8End: React.FC = () => {
  const f = useCurrentFrame();

  const enter = ramp(f, [0, s(1.0)], [0, 1], EASE_ENTER);
  const lift = (1 - enter) * 16;

  return (
    <Paper>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          opacity: enter,
          transform: `translateY(${lift}px)`,
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 1000 }}>
          {/* Official BlueTrace Brand Pack Monogram */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 32,
            }}
          >
            <BrandSymbol size={64} variant="color" />
          </div>

          {/* Wordmark */}
          <div
            style={{
              fontFamily: FONT.display,
              fontSize: 124,
              fontWeight: 500,
              lineHeight: 1.0,
              letterSpacing: '-0.03em',
              color: C.ink,
              marginBottom: 20,
            }}
          >
            BlueTrace<span style={{ fontStyle: 'italic', fontWeight: 400 }}>AI</span>
          </div>

          {/* Tagline */}
          <div
            style={{
              fontFamily: FONT.display,
              fontStyle: 'italic',
              fontSize: 34,
              color: C.muted,
              marginBottom: 48,
              letterSpacing: '-0.01em',
            }}
          >
            From drawing to reviewable takeoff.
          </div>

          {/* Core thesis badge */}
          <div
            style={{
              display: 'inline-block',
              fontFamily: FONT.mono,
              fontSize: 16,
              letterSpacing: '0.14em',
              color: C.ink,
              padding: '12px 28px',
              border: `1px solid ${C.hairline}`,
              backgroundColor: 'rgba(255,255,255,0.4)',
            }}
          >
            VECTORS MEASURE · MODELS INTERPRET · ENGINEERS APPROVE
          </div>
        </div>

        {/* Minimalist Colophon */}
        <div
          style={{
            position: 'absolute',
            bottom: 64,
            fontFamily: FONT.mono,
            fontSize: 15,
            letterSpacing: '0.08em',
            color: C.muted,
          }}
        >
          BLUETRACE-AI / 2026 · META GLOBAL AI DEVELOPER HACKATHON
        </div>
      </AbsoluteFill>
    </Paper>
  );
};
