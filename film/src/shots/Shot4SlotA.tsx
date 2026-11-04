import React from 'react';
import { useCurrentFrame } from 'remotion';
import { EASE_ENTER, EASE_MOVE, FONT, ramp, s } from '../theme';
import { Paper } from '../components/primitives';
import { Cursor } from '../components/Cursor';
import { SplitScreenMenu } from '../components/SplitScreenMenu';
import { Sheet, SHEET_H, SHEET_W } from '../components/Sheet';

export const Shot4SlotA: React.FC = () => {
  const f = useCurrentFrame();

  // Entrance of elements
  const enter = ramp(f, [0, s(0.8)], [0, 1], EASE_ENTER);
  const windowShift = (1 - enter) * 24;

  // Tracing progress (dragged from x: 420 to x: 740 across the main supply duct)
  const traceProgress = ramp(f, [s(3.5), s(7.5)], [0, 1], EASE_MOVE);

  // QuickDraw Toolbar Controls
  const liveLength = (traceProgress * 29.1).toFixed(1);

  // Cursor coordinates & click
  let cursorX = 760;
  let cursorY = 240;
  let clickFrame: number | undefined;

  if (f < s(3.5)) {
    // Glide from toolbar to duct start point (x: 820, y: 520)
    const t = ramp(f, [s(0.8), s(3.2)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 760 + t * 820;
    cursorY = (1 - t) * 240 + t * 520;
    if (f >= s(3.2) && f < s(3.5)) {
      clickFrame = s(3.2);
    }
  } else if (f < s(7.8)) {
    // Dragging along duct centerline to the right
    cursorX = 820 + traceProgress * 320;
    cursorY = 520;
    if (f >= s(7.4) && f < s(7.8)) {
      clickFrame = s(7.4);
    }
  } else {
    // Idles over the finished dimension readout
    const t = ramp(f, [s(8.5), s(11.0)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 1140 + t * 980;
    cursorY = (1 - t) * 520 + t * 490;
  }

  return (
    <Paper withDotGrid={true}>
      {/* Left-Side Category Navigation Menu */}
      <SplitScreenMenu
        category="Document Vision"
        items={[
          {
            title: 'QuickDraw',
            subtitle: 'one click dimension setting',
            active: true,
          },
          {
            title: 'Symbol Recon',
            subtitle: 'scheduled object detection',
          },
          {
            title: 'Revisions',
            subtitle: 'automatic diff detection',
          },
        ]}
        style={{
          opacity: enter,
          transform: `translateY(${windowShift}px)`,
        }}
      />

      {/* Right-Side Floating Application Window */}
      <div
        style={{
          position: 'absolute',
          right: 70,
          top: 120,
          width: 1360,
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
        {/* Workstation Header Bar */}
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
          {/* Window dots & Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ef4444' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#f59e0b' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#10b981' }} />
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
              BLUETRACE <span style={{ color: '#64748b', fontWeight: 400 }}>· QUICKDRAW</span>
            </div>
          </div>

          {/* QuickDraw Contextual Control Toolbar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              padding: '3px 12px',
              fontFamily: FONT.mono,
              fontSize: 11,
              color: '#334155',
            }}
          >
            <span style={{ fontWeight: 700, color: '#0284c7' }}>Linear</span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span>Elbow: Square 1.5x</span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span>Branch: Tap</span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span>Sys: Supply</span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span>Elev: 10'</span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span style={{ color: '#059669', fontWeight: 600 }}>Scale: 1/4"=1'0"</span>
          </div>

          {/* Sheet Indicator */}
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

        {/* Viewport Interior */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            backgroundColor: '#ffffff',
            overflow: 'hidden',
          }}
        >
          {/* CAD Sheet Viewport Zoomed into Main Duct Corridor */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-44%, -46%) scale(1.08)',
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

          {/* Live QuickDraw Centerline & Live Dimension Overlay */}
          {f >= s(3.5) && (
            <div
              style={{
                position: 'absolute',
                left: 450,
                top: 360,
                width: traceProgress * 420,
                height: 4,
                backgroundColor: '#ef4444',
                boxShadow: '0 0 12px rgba(239, 68, 68, 0.4)',
                pointerEvents: 'none',
              }}
            >
              {/* Left End Tick */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: -8,
                  width: 2,
                  height: 20,
                  backgroundColor: '#ef4444',
                }}
              />
              {/* Right End Tick */}
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: -8,
                  width: 2,
                  height: 20,
                  backgroundColor: '#ef4444',
                }}
              />

              {/* Red Live Dimension Text */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: -24,
                  transform: 'translateX(-50%)',
                  fontFamily: FONT.mono,
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#ef4444',
                  backgroundColor: '#ffffff',
                  padding: '1px 8px',
                  borderRadius: 3,
                  border: '1px solid #fecaca',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                  whiteSpace: 'nowrap',
                }}
              >
                {liveLength}'
              </div>

              {/* Dimension Text OCR Callout */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: -28,
                  transform: 'translateX(-50%)',
                  fontFamily: FONT.mono,
                  fontSize: 11,
                  color: '#475569',
                  backgroundColor: '#f8fafc',
                  padding: '2px 8px',
                  borderRadius: 3,
                  border: '1px solid #cbd5e1',
                  whiteSpace: 'nowrap',
                }}
              >
                30"×16" SA-A
              </div>
            </div>
          )}

          {/* Bottom Floating Mode Switcher (Duct | Pipe | Distribution | QuickDraw) */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 64,
              transform: 'translateX(-50%)',
              display: 'flex',
              backgroundColor: '#0f172a',
              borderRadius: 8,
              padding: '4px',
              gap: 4,
              boxShadow: '0 12px 30px rgba(0,0,0,0.2)',
              fontFamily: FONT.mono,
              fontSize: 12,
              color: '#94a3b8',
              zIndex: 30,
            }}
          >
            <div style={{ backgroundColor: '#1e293b', color: '#ffffff', padding: '6px 14px', borderRadius: 6, fontWeight: 700 }}>
              Duct
            </div>
            <div style={{ padding: '6px 14px' }}>Pipe</div>
            <div style={{ padding: '6px 14px' }}>Distribution</div>
            <div style={{ backgroundColor: '#0284c7', color: '#ffffff', padding: '6px 14px', borderRadius: 6, fontWeight: 700 }}>
              ✦ QuickDraw
            </div>
          </div>

          {/* Bottom Inspector Bar */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 44,
              backgroundColor: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 24px',
              fontFamily: FONT.mono,
              fontSize: 11,
              color: '#475569',
              zIndex: 20,
            }}
          >
            <div style={{ display: 'flex', gap: 28 }}>
              <span>TYPE: <strong style={{ color: '#0f172a' }}>DUCT</strong></span>
              <span>WIDTH: <strong style={{ color: '#0f172a' }}>30"</strong></span>
              <span>HEIGHT: <strong style={{ color: '#0f172a' }}>16"</strong></span>
              <span>LENGTH: <strong style={{ color: '#ef4444' }}>{liveLength} LF</strong></span>
              <span>ELEVATION: <strong style={{ color: '#0f172a' }}>10'-0"</strong></span>
            </div>
            <div style={{ color: '#0284c7', fontWeight: 600 }}>
              ✓ VECTOR CENTERLINE VALIDATED
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
    </Paper>
  );
};
