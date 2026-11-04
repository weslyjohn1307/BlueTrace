import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, EASE_ENTER, EASE_MOVE, FONT, ramp, s } from '../theme';
import { ConceptTag, Paper, Statement } from '../components/primitives';
import { ArchLayer, ElecLayer, MechLayer, PlumbLayer, SHEET_H, SHEET_W } from '../components/Sheet';

export const Shot2Layers: React.FC = () => {
  const f = useCurrentFrame();

  // Separation progress: lifts smoothly from 0 to 1 between seconds 1.5 and 5.0
  const liftProgress = ramp(f, [s(1.5), s(5.5)], [0, 1], EASE_MOVE);

  // Parallax shifts for each trade layer
  const plumbShift = {
    x: liftProgress * -70,
    y: liftProgress * -30,
    shadow: liftProgress * 24,
  };
  const elecShift = {
    x: liftProgress * 20,
    y: liftProgress * -70,
    shadow: liftProgress * 32,
  };
  const mechShift = {
    x: liftProgress * 80,
    y: liftProgress * -115,
    shadow: liftProgress * 44,
  };

  // Layer labels entrance
  const labelEnter = ramp(f, [s(4.0), s(5.5)], [0, 1], EASE_ENTER);

  // Statement entrance
  const stmtEnter = s(6.5);

  return (
    <Paper>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            position: 'relative',
            width: SHEET_W,
            height: SHEET_H,
            transform: 'scale(0.72) translate(80px, -110px)',
            transformOrigin: 'center center',
          }}
        >
          {/* Layer 1: Architectural Base */}
          <div style={{ position: 'absolute', inset: 0 }}>
            <svg width={SHEET_W} height={SHEET_H} viewBox={`0 0 ${SHEET_W} ${SHEET_H}`}>
              <rect width={SHEET_W} height={SHEET_H} fill={C.paperLight} />
              <ArchLayer draw={1} tone="ghost" />
            </svg>
          </div>

          {/* Layer 2: Plumbing */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              transform: `translate(${plumbShift.x}px, ${plumbShift.y}px)`,
              filter: `drop-shadow(0 ${plumbShift.shadow}px ${plumbShift.shadow * 1.5}px rgba(23,37,43,0.06))`,
            }}
          >
            <svg width={SHEET_W} height={SHEET_H} viewBox={`0 0 ${SHEET_W} ${SHEET_H}`}>
              <PlumbLayer draw={1} tone="color" />
            </svg>
          </div>

          {/* Layer 3: Electrical */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              transform: `translate(${elecShift.x}px, ${elecShift.y}px)`,
              filter: `drop-shadow(0 ${elecShift.shadow}px ${elecShift.shadow * 1.5}px rgba(23,37,43,0.08))`,
            }}
          >
            <svg width={SHEET_W} height={SHEET_H} viewBox={`0 0 ${SHEET_W} ${SHEET_H}`}>
              <ElecLayer draw={1} tone="color" />
            </svg>
          </div>

          {/* Layer 4: Mechanical (Hero Layer) */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              transform: `translate(${mechShift.x}px, ${mechShift.y}px)`,
              filter: `drop-shadow(0 ${mechShift.shadow}px ${mechShift.shadow * 1.8}px rgba(23,37,43,0.12))`,
            }}
          >
            <svg width={SHEET_W} height={SHEET_H} viewBox={`0 0 ${SHEET_W} ${SHEET_H}`}>
              <MechLayer draw={1} tone="color" highlightMain={true} />
            </svg>
          </div>

          {/* Minimalist mono trade callouts */}
          <div
            style={{
              position: 'absolute',
              right: -180,
              top: 60,
              display: 'flex',
              flexDirection: 'column',
              gap: 22,
              fontFamily: FONT.mono,
              fontSize: 14,
              letterSpacing: '0.1em',
              opacity: labelEnter,
            }}
          >
            <div style={{ color: C.supply, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, backgroundColor: C.supply, borderRadius: 1 }} />
              <span>04 MECHANICAL · SUPPLY & RETURN</span>
            </div>
            <div style={{ color: C.electrical, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, backgroundColor: C.electrical, borderRadius: 1 }} />
              <span>03 ELECTRICAL · FEEDERS & CIRCUITS</span>
            </div>
            <div style={{ color: C.plumbing, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, backgroundColor: C.plumbing, borderRadius: 1 }} />
              <span>02 PLUMBING · CHILLED WATER</span>
            </div>
            <div style={{ color: C.muted, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, backgroundColor: C.linework, borderRadius: 1 }} />
              <span>01 ARCHITECTURAL · 72 PT/IN</span>
            </div>
          </div>
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
          lines={['BlueTraceAI reads them apart.']}
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
          Models interpret drawing content. Local geometry keeps measurement grounded.
        </div>
      </div>

      <ConceptTag />
    </Paper>
  );
};
