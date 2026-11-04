import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { EASE_ENTER, EASE_MOVE, FONT, ramp, s } from '../theme';
import { ConceptTag } from '../components/primitives';
import { Cursor } from '../components/Cursor';
import { WorkstationWindow } from '../components/WorkstationWindow';
import { Sheet, SHEET_H, SHEET_W } from '../components/Sheet';

export const Shot6SlotC: React.FC = () => {
  const f = useCurrentFrame();

  // 2.5D Camera choreography
  const zoom = ramp(f, [0, s(20)], [1.0, 1.05], EASE_MOVE);
  const rotX = ramp(f, [0, s(12)], [3.5, 2.0], EASE_MOVE);
  const rotY = ramp(f, [0, s(12)], [-3.0, -1.0], EASE_MOVE);

  // Copilot button clicked at second 2.0
  const isCopilotClicked = f >= s(2.0);
  const copilotDrawerEnter = ramp(f, [s(2.1), s(3.3)], [0, 1], EASE_ENTER);

  // Typewriter prompt: "Show unverified VAV boxes on M-201"
  const promptFullText = 'Show unverified VAV boxes on M-201';
  const typeProgress = ramp(f, [s(3.6), s(6.4)], [0, 1]);
  const charsTyped = Math.floor(typeProgress * promptFullText.length);
  const typedPrompt = promptFullText.slice(0, charsTyped);

  // Prompt submitted at second 6.8
  const isSubmitted = f >= s(6.8);

  // Response stream progress
  const responseEnter = ramp(f, [s(8.2), s(9.6)], [0, 1], EASE_ENTER);

  // Coordinate chip appearance
  const chipEnter = ramp(f, [s(10.2), s(11.0)], [0, 1], EASE_ENTER);

  // Click on coordinate chip at second 13.8
  const isChipClicked = f >= s(13.8);

  // Canvas pan & zoom to VAV-03 upon clicking receipt chip
  const jumpProgress = ramp(f, [s(14.0), s(16.0)], [0, 1], EASE_MOVE);
  const sheetScale = 0.68 + jumpProgress * 0.35;
  const sheetPanX = (1 - jumpProgress) * 0 - jumpProgress * 80;
  const sheetPanY = (1 - jumpProgress) * 0 - jumpProgress * 40;

  // Beacon pulse on VAV-03
  const beaconPulse = isChipClicked
    ? ramp(f, [s(14.2), s(18.0)], [0, 1], EASE_ENTER)
    : 0;

  // Cursor coordinates
  let cursorX = 720;
  let cursorY = 400;
  let clickFrame: number | undefined;

  if (f < s(2.4)) {
    // Moves up to [ ✦ COPILOT ] in top bar (x: 1370, y: 24)
    const t = ramp(f, [s(0.4), s(2.0)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 720 + t * 1370;
    cursorY = (1 - t) * 400 + t * 24;
    if (f >= s(2.0) && f < s(2.4)) {
      clickFrame = s(2.0);
    }
  } else if (f < s(7.2)) {
    // Moves to prompt submit button inside drawer (x: 1380, y: 760)
    const t = ramp(f, [s(4.0), s(6.8)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 1370 + t * 1380;
    cursorY = (1 - t) * 24 + t * 760;
    if (f >= s(6.8) && f < s(7.2)) {
      clickFrame = s(6.8);
    }
  } else if (f < s(14.4)) {
    // Glides to coordinate receipt chip in drawer (x: 1220, y: 310)
    const t = ramp(f, [s(11.2), s(13.8)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 1380 + t * 1220;
    cursorY = (1 - t) * 760 + t * 310;
    if (f >= s(13.8) && f < s(14.4)) {
      clickFrame = s(13.8);
    }
  } else {
    // Floats over the highlighted beacon in the canvas
    const t = ramp(f, [s(14.8), s(17.5)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 1220 + t * 560;
    cursorY = (1 - t) * 310 + t * 330;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#070c0f' }}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 60% 45%, rgba(30,55,66,0.3) 0%, rgba(7,12,15,1) 75%)',
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
            onCopilotActive={isCopilotClicked}
            scaleBadgeText="1/4&quot; = 1'-0&quot; · VERIFIED"
            scaleBadgeTone="verified"
          >
            {/* Viewport Interior */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                backgroundColor: '#0a1013',
                overflow: 'hidden',
                display: 'flex',
              }}
            >
              {/* Left Drawing Canvas (Pans/Zooms to VAV-03 when chip clicked) */}
              <div
                style={{
                  flex: 1,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(calc(-50% + ${sheetPanX}px), calc(-50% + ${sheetPanY}px)) scale(${sheetScale})`,
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

                {/* VAV-03 Beacon / Sonar Ping on Drawing */}
                {beaconPulse > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: '42%',
                      top: '40%',
                      pointerEvents: 'none',
                    }}
                  >
                    {/* Pulsing ring */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: 70,
                        height: 70,
                        borderRadius: '50%',
                        border: '2px solid #38bdf8',
                        transform: `translate(-50%, -50%) scale(${1 + (beaconPulse * 4) % 2})`,
                        opacity: 1 - ((beaconPulse * 2) % 1),
                        boxShadow: '0 0 20px #38bdf8',
                      }}
                    />
                    {/* Receipt Verification Flag */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 18,
                        top: -30,
                        backgroundColor: '#0369a1',
                        border: '1px solid #38bdf8',
                        color: '#ffffff',
                        fontFamily: FONT.mono,
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 4,
                        whiteSpace: 'nowrap',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                      }}
                    >
                      📍 TARGET: VAV-03 (COORDINATE RECEIPT)
                    </div>
                  </div>
                )}
              </div>

              {/* Right Sliding Copilot Drawer */}
              {copilotDrawerEnter > 0 && (
                <div
                  style={{
                    width: 440,
                    backgroundColor: 'rgba(10, 18, 23, 0.96)',
                    backdropFilter: 'blur(20px)',
                    borderLeft: '1px solid rgba(56, 189, 248, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    transform: `translateX(${(1 - copilotDrawerEnter) * 100}%)`,
                    boxShadow: '-20px 0 50px rgba(0,0,0,0.7)',
                    zIndex: 40,
                  }}
                >
                  {/* Drawer Header */}
                  <div
                    style={{
                      padding: '14px 18px',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontFamily: FONT.mono,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#38bdf8', fontSize: 13 }}>✦</span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#ffffff',
                          letterSpacing: '0.08em',
                        }}
                      >
                        COPILOT · GROUNDED REASONING
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        color: '#64748b',
                        border: '1px solid rgba(255,255,255,0.08)',
                        padding: '2px 6px',
                        borderRadius: 3,
                      }}
                    >
                      MUSE-WONDER-1.0
                    </span>
                  </div>

                  {/* Chat Content Body */}
                  <div
                    style={{
                      flex: 1,
                      padding: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                      fontFamily: FONT.ui,
                    }}
                  >
                    {/* User Message Bubble */}
                    {isSubmitted && (
                      <div
                        style={{
                          alignSelf: 'flex-end',
                          backgroundColor: '#162b35',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          borderRadius: 8,
                          padding: '10px 14px',
                          color: '#f0fdf4',
                          fontSize: 13,
                          maxWidth: '90%',
                          lineHeight: 1.45,
                        }}
                      >
                        {promptFullText}
                      </div>
                    )}

                    {/* Copilot Reasoning & Response */}
                    {responseEnter > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                          opacity: responseEnter,
                        }}
                      >
                        <div
                          style={{
                            fontFamily: FONT.mono,
                            fontSize: 10,
                            color: '#38bdf8',
                            letterSpacing: '0.08em',
                          }}
                        >
                          EVIDENCE MATCH (LOCAL VECTOR GRAPH)
                        </div>

                        <div
                          style={{
                            backgroundColor: '#0c161c',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 8,
                            padding: '12px 14px',
                            color: '#cbd5e1',
                            fontSize: 13,
                            lineHeight: 1.5,
                          }}
                        >
                          Found 2 VAV units. Unit <strong>VAV-03</strong> requires damper schedule review:
                        </div>

                        {/* Clickable Coordinate Receipt Chip */}
                        {chipEnter > 0 && (
                          <div
                            style={{
                              backgroundColor: isChipClicked
                                ? 'rgba(56, 189, 248, 0.2)'
                                : '#14252e',
                              border: `1.5px solid ${isChipClicked ? '#38bdf8' : 'rgba(56, 189, 248, 0.4)'}`,
                              borderRadius: 6,
                              padding: '10px 12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              boxShadow: isChipClicked
                                ? '0 0 16px rgba(56, 189, 248, 0.3)'
                                : 'none',
                              opacity: chipEnter,
                              transform: `translateY(${(1 - chipEnter) * 8}px)`,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 14 }}>📍</span>
                              <div style={{ fontFamily: FONT.mono }}>
                                <div
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: '#ffffff',
                                  }}
                                >
                                  VAV-03 · Grid D-2
                                </div>
                                <div style={{ fontSize: 10, color: '#64748b' }}>
                                  Sheet M-201 · (430, 310)
                                </div>
                              </div>
                            </div>
                            <div
                              style={{
                                fontFamily: FONT.mono,
                                fontSize: 10,
                                color: '#38bdf8',
                                fontWeight: 600,
                                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                                padding: '3px 8px',
                                borderRadius: 4,
                              }}
                            >
                              JUMP TO PLAN ↵
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Drawer Input Bar */}
                  <div
                    style={{
                      padding: '14px 16px',
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                      backgroundColor: '#070d10',
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: '#111e24',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 6,
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: FONT.ui,
                          fontSize: 12,
                          color: '#e2e8f0',
                        }}
                      >
                        {typedPrompt}
                        {f < s(6.8) && (
                          <span
                            style={{
                              color: '#38bdf8',
                              fontWeight: 700,
                              opacity: (f % 20 < 10) ? 1 : 0,
                            }}
                          >
                            |
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 4,
                          backgroundColor: '#0284c7',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        ↑
                      </div>
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
            Tied to evidence an engineer can inspect.
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
            Model reasoning with coordinate receipts · Every answer links to a physical location on the plan
          </div>
        </div>

        <ConceptTag onDark={true} style={{ position: 'relative', textAlign: 'right' }} />
      </div>
    </AbsoluteFill>
  );
};
