import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { EASE_ENTER, EASE_MOVE, FONT, ramp, s } from '../theme';
import { ConceptTag } from '../components/primitives';
import { Cursor } from '../components/Cursor';
import { WorkstationWindow } from '../components/WorkstationWindow';
import { Sheet, SHEET_H, SHEET_W } from '../components/Sheet';

export const Shot4SlotA: React.FC = () => {
  const f = useCurrentFrame();

  // 2.5D Camera choreography
  const enter = ramp(f, [0, s(1.2)], [0, 1], EASE_ENTER);
  const zoom = ramp(f, [0, s(19)], [0.98, 1.05], EASE_MOVE);
  const rotX = ramp(f, [0, s(12)], [6.5, 3.0], EASE_MOVE);
  const rotY = ramp(f, [0, s(12)], [-4.0, -1.0], EASE_MOVE);

  // Sheet drawing reveal after selection
  const sheetDraw = ramp(f, [s(3.0), s(8.0)], [0, 1], EASE_MOVE);

  // Laser scan line progress (top to bottom across drawing)
  const scanProgress = ramp(f, [s(3.5), s(9.0)], [0, 1], EASE_MOVE);
  const scanY = scanProgress * 700;

  // Title block recon popover entrance
  const reconEnter = ramp(f, [s(8.2), s(9.4)], [0, 1], EASE_ENTER);

  // Scale badge state transition: switches from normal to amber at second 10.2
  const isScaleAmber = f >= s(10.2);

  // Popover tooltip on hover over scale pill
  const tooltipEnter = ramp(f, [s(13.8), s(14.6)], [0, 1], EASE_ENTER);

  // Cursor coordinates
  let cursorX = 700;
  let cursorY = 440;
  let clickFrame: number | undefined;

  if (f < s(3.2)) {
    // Glide to M-201 thumbnail on left sidebar
    const t = ramp(f, [s(0.8), s(2.8)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 700 + t * 90;
    cursorY = (1 - t) * 440 + t * 115;
    if (f >= s(2.8) && f < s(3.2)) {
      clickFrame = s(2.8);
    }
  } else if (f < s(11.2)) {
    // Idles over canvas observing the scan
    const t = ramp(f, [s(3.5), s(6.5)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 90 + t * 580;
    cursorY = (1 - t) * 115 + t * 380;
  } else {
    // Glides up to the amber scale pill in header
    const t = ramp(f, [s(11.2), s(13.5)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 580 + t * 1140;
    cursorY = (1 - t) * 380 + t * 24;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#070c0f' }}>
      {/* Background radial atmosphere */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(30,55,66,0.35) 0%, rgba(7,12,15,1) 75%)',
          pointerEvents: 'none',
        }}
      />

      {/* Floating 2.5D Workstation */}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', transform: 'translateY(-58px)' }}>
          <WorkstationWindow
            width={1440}
            height={810}
            scale={zoom * enter}
            rotateX={rotX}
            rotateY={rotY}
            activeSheetId="M-201"
            scaleBadgeText={
              isScaleAmber
                ? 'REVIEW REQUIRED · 0.0 (LOCKED)'
                : 'ANALYZING SCALE...'
            }
            scaleBadgeTone={isScaleAmber ? 'amber' : 'normal'}
            lift={(1 - enter) * 20}
          >
            {/* Viewport Interior */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                backgroundColor: '#0a1013',
                overflow: 'hidden',
              }}
            >
              {/* CAD Vector Sheet Container */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%) scale(0.68)',
                  transformOrigin: 'center center',
                  width: SHEET_W,
                  height: SHEET_H,
                  opacity: Math.max(0.1, sheetDraw),
                }}
              >
                <Sheet
                  draws={{
                    arch: sheetDraw,
                    mech: sheetDraw,
                    plumb: sheetDraw,
                    elec: sheetDraw,
                  }}
                  tone="ghost"
                  highlightMain={true}
                />
              </div>

              {/* Laser Scan Sweep Bar */}
              {f >= s(3.2) && f < s(9.6) && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: scanY,
                    height: 2,
                    backgroundColor: '#38bdf8',
                    boxShadow:
                      '0 0 16px #38bdf8, 0 0 32px rgba(56, 189, 248, 0.6)',
                  }}
                >
                  {/* Upward luminous gradient tail */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 2,
                      height: 90,
                      background:
                        'linear-gradient(to top, rgba(56, 189, 248, 0.22), transparent)',
                    }}
                  />
                  {/* Scan Badge */}
                  <div
                    style={{
                      position: 'absolute',
                      right: 28,
                      top: -14,
                      backgroundColor: 'rgba(56, 189, 248, 0.95)',
                      color: '#070c0f',
                      fontFamily: FONT.mono,
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 3,
                      letterSpacing: '0.08em',
                    }}
                  >
                    MUSE-SPARK-1.3 · RECON SCAN
                  </div>
                </div>
              )}

              {/* Reconnaissance Card (Bottom Right Corner) */}
              {reconEnter > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    right: 24,
                    bottom: 24,
                    width: 320,
                    backgroundColor: 'rgba(15, 26, 32, 0.94)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    borderRadius: 8,
                    padding: '14px 16px',
                    fontFamily: FONT.mono,
                    boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                    opacity: reconEnter,
                    transform: `translateY(${(1 - reconEnter) * 14}px)`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: '#fbbf24',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>⚠</span>
                    <span>SCALE AMBIGUITY DETECTED</span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#cbd5e1',
                      lineHeight: 1.6,
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      paddingBottom: 8,
                      marginBottom: 8,
                    }}
                  >
                    <div>• Title Block: 1/4" = 1'-0"</div>
                    <div>• Graphic Detail: 1/2" = 1'-0"</div>
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: '#f87171',
                      fontWeight: 600,
                    }}
                  >
                    STATUS: FAIL-CLOSED · RATIO 0.0
                  </div>
                </div>
              )}

              {/* Tooltip on hovering Scale Pill */}
              {tooltipEnter > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    right: 180,
                    top: 16,
                    width: 290,
                    backgroundColor: '#131e24',
                    border: '1px solid rgba(245, 158, 11, 0.5)',
                    borderRadius: 8,
                    padding: '12px 14px',
                    fontFamily: FONT.mono,
                    fontSize: 11,
                    color: '#e2e8f0',
                    lineHeight: 1.5,
                    boxShadow: '0 16px 36px rgba(0,0,0,0.6)',
                    opacity: tooltipEnter,
                    transform: `translateY(${(1 - tooltipEnter) * 8}px)`,
                  }}
                >
                  <div style={{ color: '#fbbf24', fontWeight: 700, marginBottom: 4 }}>
                    RULE 01: FAIL-CLOSED SCALE
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 10 }}>
                    Unverified scales cannot generate quantities. Measurements halted until engineer review.
                  </div>
                </div>
              )}
            </div>
          </WorkstationWindow>

          {/* Animated Cursor */}
          <Cursor
            x={cursorX}
            y={cursorY}
            clickFrame={clickFrame}
            currentFrame={f}
          />
        </div>
      </AbsoluteFill>

      {/* Statement at the bottom */}
      <div
        style={{
          position: 'absolute',
          left: 140,
          bottom: 46,
          right: 140,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: FONT.display,
              fontSize: 44,
              fontWeight: 500,
              color: '#f0ecdf',
              lineHeight: 1.1,
              letterSpacing: '-0.015em',
            }}
          >
            A visual guess is not a measurement.
          </div>
          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 15,
              color: '#8b9a9b',
              marginTop: 8,
              letterSpacing: '0.04em',
            }}
          >
            Fail-closed scale validation · Unverified quantities halt before entering the ledger
          </div>
        </div>

        <ConceptTag onDark={true} style={{ position: 'relative', textAlign: 'right' }} />
      </div>
    </AbsoluteFill>
  );
};
