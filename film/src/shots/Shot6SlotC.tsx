import React from 'react';
import { useCurrentFrame } from 'remotion';
import { EASE_ENTER, EASE_MOVE, FONT, ramp, s } from '../theme';
import { Paper } from '../components/primitives';
import { Cursor } from '../components/Cursor';
import { Sheet, SHEET_H, SHEET_W } from '../components/Sheet';

export const Shot6SlotC: React.FC = () => {
  const f = useCurrentFrame();

  const enter = ramp(f, [0, s(0.8)], [0, 1], EASE_ENTER);
  const windowShift = (1 - enter) * 24;

  // Typewriter prompt: "change duct material to stainless steel"
  const promptFullText = 'change duct material to stainless steel';
  const typeProgress = ramp(f, [s(1.0), s(3.6)], [0, 1]);
  const charsTyped = Math.floor(typeProgress * promptFullText.length);
  const typedPrompt = promptFullText.slice(0, charsTyped);

  // Send clicked at second 4.0
  const isSent = f >= s(4.0);

  // Assistant response card entrance at second 5.5
  const cardEnter = ramp(f, [s(5.5), s(6.5)], [0, 1], EASE_ENTER);

  // Apply edit clicked at second 9.2
  const isApplied = f >= s(9.2);
  const applyPop = ramp(f, [s(9.2), s(9.8)], [1.1, 1.0], EASE_ENTER);

  // Cursor coordinates
  let cursorX = 980;
  let cursorY = 740;
  let clickFrame: number | undefined;

  if (f < s(4.3)) {
    // Moves to Send button in prompt bar (x: 1080, y: 755)
    const t = ramp(f, [s(2.8), s(4.0)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 980 + t * 1080;
    cursorY = (1 - t) * 740 + t * 755;
    if (f >= s(4.0) && f < s(4.3)) {
      clickFrame = s(4.0);
    }
  } else if (f < s(9.6)) {
    // Glides up to [ Apply edit to 32 objects ] button on the tool card (x: 870, y: 470)
    const t = ramp(f, [s(6.8), s(9.2)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 1080 + t * 870;
    cursorY = (1 - t) * 755 + t * 470;
    if (f >= s(9.2) && f < s(9.6)) {
      clickFrame = s(9.2);
    }
  } else {
    // Idles over modified drawing items
    const t = ramp(f, [s(10.5), s(13.5)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 870 + t * 450;
    cursorY = (1 - t) * 470 + t * 380;
  }

  return (
    <Paper withDotGrid={true}>
      {/* Left-Side Application Window with Embedded Copilot (Flipped Split-Screen) */}
      <div
        style={{
          position: 'absolute',
          left: 70,
          top: 120,
          width: 1240,
          height: 840,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          boxShadow:
            '0 30px 90px rgba(23, 37, 43, 0.12), 0 0 0 1px rgba(23, 37, 43, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          opacity: enter,
          transform: `translateY(${windowShift}px)`,
        }}
      >
        {/* Workstation Top Bar */}
        <div
          style={{
            height: 48,
            backgroundColor: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 18px',
            fontFamily: FONT.ui,
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ef4444' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#f59e0b' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#10b981' }} />
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
              BLUETRACE <span style={{ color: '#64748b', fontWeight: 400 }}>· COPILOT-JUDGE</span>
            </div>
          </div>

          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 12,
              color: '#0284c7',
              backgroundColor: '#e0f2fe',
              padding: '4px 12px',
              borderRadius: 6,
              fontWeight: 600,
            }}
          >
            <span>✦ COPILOT ACTIVE</span>
          </div>

          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 12,
              color: '#475569',
              backgroundColor: '#f1f5f9',
              padding: '4px 10px',
              borderRadius: 4,
            }}
          >
            M-201 · HVAC PLAN
          </div>
        </div>

        {/* Viewport Interior with Drawing Canvas (Left) & Copilot Drawer (Right) */}
        <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
          {/* Drawing Canvas */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#ffffff' }}>
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-48%, -44%) scale(1.0)',
                transformOrigin: 'center center',
                width: SHEET_W,
                height: SHEET_H,
              }}
            >
              <Sheet
                draws={{ arch: 1, mech: 1, plumb: 1, elec: 1 }}
                tone="color"
                highlightMain={true}
              />
            </div>

            {/* Transformed Material Tags on Drawing */}
            {isApplied && (
              <div
                style={{
                  position: 'absolute',
                  left: 320,
                  top: 360,
                  backgroundColor: '#0f172a',
                  color: '#38bdf8',
                  fontFamily: FONT.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 4,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  border: '1px solid #38bdf8',
                }}
              >
                ✓ 304 STAINLESS STEEL (32 OBJECTS)
              </div>
            )}
          </div>

          {/* Embedded Copilot Assistant Drawer (Conversational Action Card) */}
          <div
            style={{
              width: 440,
              backgroundColor: '#ffffff',
              borderLeft: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: FONT.ui,
              boxShadow: '-8px 0 25px rgba(0,0,0,0.04)',
            }}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>✦</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                    Copilot-Judge
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Embedded Domain Assistant
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontFamily: FONT.mono,
                  fontSize: 10,
                  color: '#64748b',
                  backgroundColor: '#f1f5f9',
                  padding: '2px 6px',
                  borderRadius: 3,
                }}
              >
                MUSE-WONDER-1.0
              </span>
            </div>

            {/* Chat Body */}
            <div
              style={{
                flex: 1,
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                backgroundColor: '#fafafa',
              }}
            >
              {/* User Sent Message */}
              {isSent && (
                <div
                  style={{
                    alignSelf: 'flex-end',
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    borderRadius: '10px 10px 2px 10px',
                    padding: '10px 14px',
                    fontSize: 13,
                    maxWidth: '85%',
                    lineHeight: 1.4,
                  }}
                >
                  {promptFullText}
                </div>
              )}

              {/* Copilot Actionable Tool Card (Matching Screenshot 12!) */}
              {cardEnter > 0 && (
                <div
                  style={{
                    alignSelf: 'flex-start',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 10,
                    padding: '16px',
                    width: '100%',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                    opacity: cardEnter,
                    transform: `scale(${isApplied ? applyPop : 1})`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: FONT.mono,
                      fontSize: 11,
                      color: '#0284c7',
                      fontWeight: 700,
                      marginBottom: 8,
                      letterSpacing: '0.04em',
                    }}
                  >
                    ACTIONABLE TOOL PROPOSAL
                  </div>

                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#0f172a',
                      marginBottom: 14,
                      lineHeight: 1.4,
                    }}
                  >
                    Set material to stainless steel for 32 objects
                  </div>

                  {/* Explicit Action Buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        color: '#334155',
                        borderRadius: 6,
                        padding: '8px 12px',
                        fontSize: 12,
                        fontFamily: FONT.mono,
                        fontWeight: 600,
                        textAlign: 'center',
                      }}
                    >
                      Select 32 items
                    </div>

                    <div
                      style={{
                        backgroundColor: isApplied ? '#16a34a' : '#0f172a',
                        color: '#ffffff',
                        borderRadius: 6,
                        padding: '9px 12px',
                        fontSize: 12,
                        fontFamily: FONT.mono,
                        fontWeight: 700,
                        textAlign: 'center',
                        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      <span>{isApplied ? '✓ Applied to 32 objects' : 'Apply edit to 32 objects'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Prompt Input Bar (Bottom) */}
            <div
              style={{
                padding: '12px 14px',
                borderTop: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '8px 12px',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ fontSize: 13, color: isSent ? '#94a3b8' : '#0f172a', flex: 1 }}>
                  {isSent ? 'Ask anything...' : typedPrompt}
                  {!isSent && <span style={{ color: '#0284c7', fontWeight: 700 }}>|</span>}
                </div>
                <div
                  style={{
                    backgroundColor: isSent ? '#94a3b8' : '#0f172a',
                    color: '#ffffff',
                    fontFamily: FONT.mono,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 5,
                  }}
                >
                  Send
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Animated Mouse Cursor */}
        <Cursor
          x={cursorX}
          y={cursorY}
          clickFrame={clickFrame}
          currentFrame={f}
        />
      </div>

      {/* Right-Side Bold Copilot Branding (Hero Presentation) */}
      <div
        style={{
          position: 'absolute',
          right: 90,
          top: 300,
          width: 440,
          fontFamily: FONT.ui,
          opacity: enter,
          transform: `translateY(${windowShift}px)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              backgroundColor: '#0f172a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
              fontSize: 26,
              boxShadow: '0 10px 25px rgba(15, 23, 42, 0.2)',
            }}
          >
            ✦
          </div>
          <div
            style={{
              fontSize: 54,
              fontWeight: 800,
              color: '#17252b',
              letterSpacing: '-0.03em',
              lineHeight: 1.0,
            }}
          >
            Copilot
          </div>
        </div>

        <div
          style={{
            fontSize: 16,
            color: '#65747d',
            lineHeight: 1.6,
            fontFamily: FONT.ui,
          }}
        >
          Natural language plan queries, multi-object batch edits, and grounded coordinate receipts.
        </div>
      </div>
    </Paper>
  );
};
