import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, EASE_ENTER, FONT, ramp, s } from '../theme';
import { Paper } from '../components/primitives';

interface Pillar {
  number: string;
  headline: string;
  subtext: string;
  accent: string;
}

const PILLARS: Pillar[] = [
  {
    number: '01',
    headline: 'Models interpret.',
    subtext: 'Visual understanding for text, schedules, and symbols.',
    accent: C.supply,
  },
  {
    number: '02',
    headline: 'Vectors measure.',
    subtext: 'Deterministic geometry on true coordinate paths.',
    accent: C.ink,
  },
  {
    number: '03',
    headline: 'Engineers approve.',
    subtext: 'Every quantity stays in human review until accepted.',
    accent: C.plumbing,
  },
];

export const Shot3Thesis: React.FC = () => {
  const f = useCurrentFrame();

  // 3 beats: [0..s(5)], [s(5)..s(10)], [s(10)..s(16)]
  const beatIndex = f < s(5.2) ? 0 : f < s(10.4) ? 1 : 2;
  const currentPillar = PILLARS[beatIndex];

  // Local frame within current beat
  const beatStart = beatIndex === 0 ? 0 : beatIndex === 1 ? s(5.2) : s(10.4);
  const localF = f - beatStart;

  // Entrance
  const enter = ramp(localF, [0, 36], [0, 1], EASE_ENTER);
  const lift = (1 - enter) * 16;

  return (
    <Paper>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 200px',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            width: '100%',
            opacity: enter,
            transform: `translateY(${lift}px)`,
          }}
        >
          {/* Index header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              fontFamily: FONT.mono,
              fontSize: 18,
              letterSpacing: '0.12em',
              color: C.muted,
              marginBottom: 40,
            }}
          >
            <span style={{ color: currentPillar.accent, fontWeight: 700 }}>
              {currentPillar.number}
            </span>
            <span style={{ opacity: 0.4 }}>/</span>
            <span>THREE ARCHITECTURAL PRINCIPLES</span>
          </div>

          {/* Main Statement */}
          <div
            style={{
              fontFamily: FONT.display,
              fontSize: 118,
              fontWeight: 500,
              lineHeight: 1.02,
              letterSpacing: '-0.025em',
              color: C.ink,
              marginBottom: 32,
            }}
          >
            {currentPillar.headline}
          </div>

          {/* Subtext description */}
          <div
            style={{
              fontFamily: FONT.ui,
              fontSize: 28,
              color: C.muted,
              fontWeight: 400,
              letterSpacing: '-0.01em',
              maxWidth: 800,
              lineHeight: 1.45,
            }}
          >
            {currentPillar.subtext}
          </div>
        </div>
      </AbsoluteFill>
    </Paper>
  );
};
