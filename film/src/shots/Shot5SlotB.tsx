import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { EASE_ENTER, EASE_MOVE, FONT, ramp, s } from '../theme';
import { ConceptTag } from '../components/primitives';
import { Cursor } from '../components/Cursor';
import { WorkstationWindow } from '../components/WorkstationWindow';
import { Sheet, SHEET_H, SHEET_W } from '../components/Sheet';

export const Shot5SlotB: React.FC = () => {
  const f = useCurrentFrame();

  // 2.5D Camera choreography
  const zoom = ramp(f, [0, s(21)], [1.02, 1.07], EASE_MOVE);
  const rotX = ramp(f, [0, s(12)], [4.0, 2.0], EASE_MOVE);
  const rotY = ramp(f, [0, s(12)], [2.5, -0.5], EASE_MOVE);

  // Hover card entrance at second 3.8
  const hoverCardEnter = ramp(f, [s(3.8), s(4.6)], [0, 1], EASE_ENTER);

  // Accepted state triggered at click at second 9.2
  const isAccepted = f >= s(9.2);
  const acceptPop = ramp(f, [s(9.2), s(9.8)], [1.2, 1.0], EASE_ENTER);

  // Ledger table slides up at second 11.0
  const ledgerEnter = ramp(f, [s(11.0), s(12.2)], [0, 1], EASE_ENTER);

  // Cursor coordinates & click
  let cursorX = 720;
  let cursorY = 500;
  let clickFrame: number | undefined;

  if (f < s(3.5)) {
    // Glide from lower area to supply duct centerline (x: 620, y: 280)
    const t = ramp(f, [s(0.5), s(3.2)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 720 + t * 620;
    cursorY = (1 - t) * 500 + t * 280;
  } else if (f < s(9.6)) {
    // Moves from duct centerline to the "ACCEPT TO TAKEOFF" button on hover card (x: 770, y: 395)
    const t = ramp(f, [s(7.2), s(9.0)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 620 + t * 770;
    cursorY = (1 - t) * 280 + t * 395;
    if (f >= s(9.0) && f < s(9.6)) {
      clickFrame = s(9.0);
    }
  } else {
    // Idles over the accepted evidence area
    const t = ramp(f, [s(10.5), s(13.5)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 770 + t * 840;
    cursorY = (1 - t) * 395 + t * 470;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#070c0f' }}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 45% 45%, rgba(30,55,66,0.3) 0%, rgba(7,12,15,1) 75%)',
          pointerEvents: 'none',
        }}
      />

      {/* Floating 2.5D Workstation */}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', transform: 'translateY(-58px)' }}>
          <WorkstationWindow
            width={1440}
            height={810}
            scale={zoom}
            rotateX={rotX}
            rotateY={rotY}
            activeSheetId="M-201"
            scaleBadgeText={
              isAccepted ? '1/4" = 1\'-0" · VERIFIED' : '1/4" = 1\'-0"'
            }
            scaleBadgeTone={isAccepted ? 'verified' : 'normal'}
          >
            {/* Viewport Interior with Focal Zoom on Duct */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                backgroundColor: '#0a1013',
                overflow: 'hidden',
              }}
            >
              {/* Sheet Canvas Zoomed onto Corridor */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-42%, -48%) scale(0.92)',
                  transformOrigin: 'center center',
                  width: SHEET_W,
                  height: SHEET_H,
                }}
              >
                <Sheet
                  draws={{ arch: 1, mech: 1, plumb: 1, elec: 1 }}
                  tone="ghost"
                  highlightMain={true}
                />
              </div>

              {/* Vector Snap Crosshair on Supply Duct */}
              {f >= s(2.5) && (
                <div
                  style={{
                    position: 'absolute',
                    left: 615,
                    top: 275,
                    pointerEvents: 'none',
                  }}
                >
                  {/* Glowing center indicator */}
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      border: `2px solid ${isAccepted ? '#10b981' : '#38bdf8'}`,
                      transform: 'translate(-50%, -50%)',
                      boxShadow: `0 0 16px ${isAccepted ? '#10b981' : '#38bdf8'}`,
                    }}
                  />
                  {/* Dimension coordinate tag */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 14,
                      top: -18,
                      fontFamily: FONT.mono,
                      fontSize: 10,
                      color: isAccepted ? '#34d399' : '#38bdf8',
                      backgroundColor: 'rgba(7,12,15,0.85)',
                      padding: '2px 6px',
                      borderRadius: 3,
                      border: `1px solid ${isAccepted ? 'rgba(16,185,129,0.3)' : 'rgba(56,189,248,0.3)'}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    CENTERLINE: (X: 428.4, Y: 294.1)
                  </div>
                </div>
              )}

              {/* QuickDraw Hover Evidence Card */}
              {hoverCardEnter > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: 650,
                    top: 210,
                    width: 330,
                    backgroundColor: 'rgba(13, 23, 28, 0.96)',
                    backdropFilter: 'blur(16px)',
                    border: `1.5px solid ${isAccepted ? '#10b981' : '#38bdf8'}`,
                    borderRadius: 10,
                    padding: '16px 18px',
                    fontFamily: FONT.ui,
                    boxShadow: '0 24px 50px rgba(0,0,0,0.65)',
                    opacity: hoverCardEnter,
                    transform: `translateY(${(1 - hoverCardEnter) * 12}px) scale(${isAccepted ? acceptPop : 1})`,
                    zIndex: 20,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: FONT.mono,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        color: isAccepted ? '#34d399' : '#38bdf8',
                      }}
                    >
                      {isAccepted
                        ? '✓ ACCEPTED TO TAKEOFF'
                        : 'DETECTED VECTOR CANDIDATE'}
                    </span>
                    <span
                      style={{
                        fontFamily: FONT.mono,
                        fontSize: 10,
                        color: '#64748b',
                      }}
                    >
                      D-04
                    </span>
                  </div>

                  <div
                    style={{
                      fontFamily: FONT.ui,
                      fontSize: 15,
                      fontWeight: 600,
                      color: '#ffffff',
                      marginBottom: 4,
                    }}
                  >
                    16×10 Rect. Supply Duct
                  </div>

                  <div
                    style={{
                      fontFamily: FONT.mono,
                      fontSize: 11,
                      color: '#94a3b8',
                      lineHeight: 1.6,
                      marginBottom: 12,
                    }}
                  >
                    <div>• Spec: 24ga Galvanized Steel (SMACNA 2")</div>
                    <div>• Physical Run: 34.2 LF (3 Segments)</div>
                  </div>

                  {!isAccepted ? (
                    <div
                      style={{
                        backgroundColor: '#0284c7',
                        color: '#ffffff',
                        fontFamily: FONT.mono,
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '8px 14px',
                        borderRadius: 6,
                        textAlign: 'center',
                        letterSpacing: '0.06em',
                        boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
                      }}
                    >
                      ACCEPT TO TAKEOFF ↵
                    </div>
                  ) : (
                    <div
                      style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        color: '#34d399',
                        fontFamily: FONT.mono,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '6px 12px',
                        borderRadius: 6,
                        textAlign: 'center',
                      }}
                    >
                      COMMITTED TO ESTIMATE LEDGER
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Takeoff Ledger Table */}
              {ledgerEnter > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: 20,
                    right: 20,
                    bottom: 16,
                    backgroundColor: 'rgba(11, 19, 24, 0.95)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    padding: '12px 18px',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.7)',
                    opacity: ledgerEnter,
                    transform: `translateY(${(1 - ledgerEnter) * 16}px)`,
                    zIndex: 30,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      paddingBottom: 8,
                      marginBottom: 8,
                      fontFamily: FONT.mono,
                      fontSize: 10,
                      color: '#64748b',
                      letterSpacing: '0.08em',
                    }}
                  >
                    <span>TAKEOFF LEDGER (LEVEL 02)</span>
                    <span style={{ color: '#34d399' }}>1 ITEM COMMITTED</span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontFamily: FONT.mono,
                      fontSize: 12,
                      color: '#e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          color: '#34d399',
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          padding: '2px 6px',
                          borderRadius: 3,
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        ✓ VERIFIED
                      </span>
                      <span style={{ fontWeight: 600 }}>16×10 Rect. Supply Duct</span>
                      <span style={{ color: '#64748b' }}>· Galvanized 24ga</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                      <span style={{ color: '#94a3b8' }}>Grid B-2 / D-2</span>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                          color: '#38bdf8',
                        }}
                      >
                        34.2 LF
                      </span>
                    </div>
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
            Suggestions stay connected to the sheet.
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
            Spatial takeoff review · Estimator judgment governs every committed quantity
          </div>
        </div>

        <ConceptTag onDark={true} style={{ position: 'relative', textAlign: 'right' }} />
      </div>
    </AbsoluteFill>
  );
};
