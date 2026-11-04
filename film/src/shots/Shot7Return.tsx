import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, EASE_ENTER, EASE_MOVE, FONT, ramp, s } from '../theme';
import { ConceptTag, Paper, Statement } from '../components/primitives';
import { Sheet, SHEET_H, SHEET_W } from '../components/Sheet';

export const Shot7Return: React.FC = () => {
  const f = useCurrentFrame();

  // Gentle drift of the sheet
  const drift = ramp(f, [0, s(12)], [0, 1], EASE_MOVE);
  const scale = 0.72 + drift * 0.03;
  const ty = -110 + drift * -10;

  const stmtEnter = s(2.0);

  // Dissolve from dark product workspace into warm vellum
  const dissolveFromDark = ramp(f, [0, s(0.7)], [1, 0], EASE_MOVE);

  return (
    <Paper>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: SHEET_W,
            height: SHEET_H,
            transform: `translate(80px, ${ty}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          {/* Sheet in ghost tone with ONLY the verified hero supply duct route highlighted */}
          <Sheet
            draws={{ arch: 1, mech: 1, plumb: 1, elec: 1 }}
            tone="ghost"
            highlightMain={true}
          />
        </div>
      </AbsoluteFill>

      {/* Statement */}
      <div
        style={{
          position: 'absolute',
          left: 140,
          bottom: 90,
          maxWidth: 960,
        }}
      >
        <Statement
          lines={['Traceable by design.']}
          enterAt={stmtEnter}
          size={68}
          weight={500}
        />
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 20,
            color: C.muted,
            marginTop: 18,
            letterSpacing: '0.04em',
            opacity: ramp(f, [stmtEnter + s(0.8), stmtEnter + s(1.8)], [0, 1], EASE_ENTER),
          }}
        >
          Not replacing engineering judgment. Making every quantity reviewable and verified.
        </div>
      </div>

      <ConceptTag />

      {/* Cross-dissolve from the dark workstation */}
      <AbsoluteFill
        style={{
          backgroundColor: '#070c0f',
          opacity: dissolveFromDark,
          pointerEvents: 'none',
        }}
      />
    </Paper>
  );
};
