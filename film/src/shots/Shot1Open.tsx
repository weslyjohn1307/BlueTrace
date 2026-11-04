import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { EASE_MOVE, linear, ramp, s } from '../theme';
import { ConceptTag, Paper, Statement } from '../components/primitives';
import { Sheet, SHEET_H, SHEET_W } from '../components/Sheet';

export const Shot1Open: React.FC = () => {
  const f = useCurrentFrame();

  // Linework drawing progress: main duct traces first, branches and walls follow
  const ductDraw = linear(f, [0, s(3.5)]);
  const archDraw = linear(f, [s(1.2), s(6.5)]);
  const otherDraw = linear(f, [s(2.5), s(7.0)]);

  // Camera choreography: starts macro zoomed into the supply duct origin, then unhurried pull back
  // Origin of supply duct in sheet coordinates is roughly (240, 390)
  const pullBack = ramp(f, [s(1.5), s(8.0)], [0, 1], EASE_MOVE);

  const scale = 2.4 - pullBack * 1.68; // 2.4 -> 0.72
  // Shift origin from duct macro (approx x: 180, y: 120) to elevated breathing position (80, -120)
  const tx = (1 - pullBack) * 260 + pullBack * 80;
  const ty = (1 - pullBack) * 110 - pullBack * 120;

  // Fade out slightly at the very end to cut seamlessly into layers shot
  const fadeOut = ramp(f, [s(9.4), s(10.0)], [1, 0.95]);

  // Fade in from black at the opening: black resolves into the mechanical plan
  const fadeInFromBlack = ramp(f, [0, s(0.6)], [1, 0], EASE_MOVE);

  return (
    <Paper>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          opacity: fadeOut,
        }}
      >
        <div
          style={{
            width: SHEET_W,
            height: SHEET_H,
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          <Sheet
            draws={{
              mech: ductDraw,
              arch: archDraw,
              plumb: otherDraw,
              elec: otherDraw,
            }}
            highlightMain={true}
          />
        </div>
      </AbsoluteFill>

      {/* Statement emerges at second 6 after the density of the plan is revealed */}
      <div
        style={{
          position: 'absolute',
          left: 140,
          bottom: 90,
          maxWidth: 960,
        }}
      >
        <Statement
          lines={['A drawing is a set of instructions.', 'Written in lines, symbols, and scale.']}
          enterAt={s(5.8)}
          size={64}
          weight={500}
        />
      </div>

      <ConceptTag />

      {/* Opening black resolve */}
      <AbsoluteFill
        style={{
          backgroundColor: '#070c0f',
          opacity: fadeInFromBlack,
          pointerEvents: 'none',
        }}
      />
    </Paper>
  );
};
