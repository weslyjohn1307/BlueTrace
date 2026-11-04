import React from 'react';
import { useCurrentFrame } from 'remotion';
import { EASE_ENTER, EASE_MOVE, FONT, ramp, s } from '../theme';
import { Paper } from '../components/primitives';
import { Cursor } from '../components/Cursor';
import { SplitScreenMenu } from '../components/SplitScreenMenu';
import { Sheet, SHEET_H, SHEET_W } from '../components/Sheet';

export const Shot5SlotB: React.FC = () => {
  const f = useCurrentFrame();

  const enter = ramp(f, [0, s(0.8)], [0, 1], EASE_ENTER);
  const windowShift = (1 - enter) * 24;

  // Click action at second 4.5
  const isApproved = f >= s(4.5);
  const approvePop = ramp(f, [s(4.5), s(5.0)], [1.15, 1.0], EASE_ENTER);

  // Cursor choreography
  let cursorX = 780;
  let cursorY = 400;
  let clickFrame: number | undefined;

  if (f < s(4.8)) {
    // Glide to [ Approve (Y) ] button inside the review modal (x: 1060, y: 585)
    const t = ramp(f, [s(1.2), s(4.3)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 780 + t * 1060;
    cursorY = (1 - t) * 400 + t * 585;
    if (f >= s(4.3) && f < s(4.8)) {
      clickFrame = s(4.3);
    }
  } else {
    // Moves to the next pending item in right drawer (x: 1280, y: 340)
    const t = ramp(f, [s(5.5), s(8.5)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 1060 + t * 1280;
    cursorY = (1 - t) * 585 + t * 340;
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
          },
          {
            title: 'Symbol Recon',
            subtitle: 'scheduled object detection',
            active: true,
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
              BLUETRACE <span style={{ color: '#64748b', fontWeight: 400 }}>· SYMBOL RECON</span>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: FONT.mono,
              fontSize: 12,
              color: '#0284c7',
              backgroundColor: '#e0f2fe',
              padding: '4px 12px',
              borderRadius: 6,
              fontWeight: 600,
            }}
          >
            <span>✦</span>
            <span>MUSE-SPARK-1.3 · LEGEND CORROBORATION ACTIVE</span>
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
            M-201 · LEVEL 02
          </div>
        </div>

        {/* Viewport Interior with Plan & Split Right Drawer */}
        <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
          {/* Main Plan Area */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#ffffff' }}>
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-38%, -42%) scale(1.15)',
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

            {/* Red Bounding Box around Active Diffuser Target */}
            <div
              style={{
                position: 'absolute',
                left: 380,
                top: 290,
                width: 110,
                height: 48,
                border: `2.5px solid ${isApproved ? '#16a34a' : '#ef4444'}`,
                backgroundColor: isApproved ? 'rgba(22, 163, 74, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                borderRadius: 4,
                boxShadow: `0 0 16px ${isApproved ? 'rgba(22, 163, 74, 0.4)' : 'rgba(239, 68, 68, 0.3)'}`,
                transition: 'all 0.3s ease',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 4,
                  top: -20,
                  fontFamily: FONT.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  color: isApproved ? '#16a34a' : '#ef4444',
                  backgroundColor: '#ffffff',
                  padding: '1px 6px',
                  borderRadius: 3,
                  border: `1px solid ${isApproved ? '#bbf7d0' : '#fecaca'}`,
                }}
              >
                {isApproved ? '✓ APPROVED' : 'C · 300 CFM'}
              </span>
            </div>

            {/* Other Detected Symbols on Plan */}
            {[
              { x: 210, y: 190, label: 'Diffuser A' },
              { x: 580, y: 190, label: 'Grille B' },
              { x: 230, y: 490, label: 'VAV-02' },
            ].map((sItem) => (
              <div
                key={sItem.label}
                style={{
                  position: 'absolute',
                  left: sItem.x,
                  top: sItem.y,
                  width: 60,
                  height: 38,
                  border: '1.5px solid #ef4444',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  borderRadius: 3,
                }}
              />
            ))}

            {/* Focused Symbol Review Modal (HITL Triage Pattern) */}
            <div
              style={{
                position: 'absolute',
                left: 340,
                top: 360,
                width: 330,
                backgroundColor: '#ffffff',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                boxShadow: '0 20px 45px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.04)',
                padding: '16px 18px',
                fontFamily: FONT.ui,
                zIndex: 40,
                transform: `scale(${isApproved ? approvePop : 1})`,
              }}
            >
              {/* Modal Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 14,
                  borderBottom: '1px solid #f1f5f9',
                  paddingBottom: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#0284c7', fontSize: 13 }}>✦</span>
                  <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                    Symbol Recon Review
                  </span>
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: 11, color: '#64748b' }}>
                  {isApproved ? '2 of 124' : '1 of 124'}
                </div>
              </div>

              {/* Classification Selector */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: FONT.mono, fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                  SAVE AS:
                </div>
                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: '7px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#0f172a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>C Linear Slot Diffuser</span>
                  <span style={{ fontSize: 10, color: '#0284c7', fontWeight: 700 }}>★ Recommended</span>
                </div>
              </div>

              {/* Group / Schedule Match */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: FONT.mono, fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                  SCHEDULE VERIFICATION:
                </div>
                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    padding: '7px 10px',
                    fontSize: 11,
                    color: '#475569',
                    fontFamily: FONT.mono,
                  }}
                >
                  Schedule M-601 · 300 CFM · 4-Slot
                </div>
              </div>

              {/* Reject / Approve Rapid Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div
                  style={{
                    flex: 1,
                    backgroundColor: '#fee2e2',
                    color: '#dc2626',
                    border: '1px solid #fecaca',
                    padding: '9px 12px',
                    borderRadius: 6,
                    textAlign: 'center',
                    fontFamily: FONT.mono,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Reject (N)
                </div>
                <div
                  style={{
                    flex: 1.3,
                    backgroundColor: isApproved ? '#15803d' : '#16a34a',
                    color: '#ffffff',
                    border: '1px solid #15803d',
                    padding: '9px 12px',
                    borderRadius: 6,
                    textAlign: 'center',
                    fontFamily: FONT.mono,
                    fontSize: 12,
                    fontWeight: 700,
                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.35)',
                  }}
                >
                  {isApproved ? '✓ Approved' : 'Approve (Y)'}
                </div>
              </div>
            </div>
          </div>

          {/* Right Rail: Symbol Overview List (Inspection Drawer) */}
          <div
            style={{
              width: 320,
              backgroundColor: '#f8fafc',
              borderLeft: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: FONT.ui,
            }}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#0284c7' }}>✦</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  Symbol Overview
                </span>
              </div>
              <span
                style={{
                  fontFamily: FONT.mono,
                  fontSize: 11,
                  color: isApproved ? '#059669' : '#0284c7',
                  backgroundColor: isApproved ? '#d1fae5' : '#e0f2fe',
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontWeight: 600,
                }}
              >
                {isApproved ? '123 pending' : '124 pending'}
              </span>
            </div>

            {/* Symbol Triage Item Rows */}
            <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'A Diffuser', status: 'approved' },
                { label: 'C Linear Slot Diffuser', status: isApproved ? 'approved' : 'active' },
                { label: 'C Linear Slot Diffuser', status: 'pending' },
                { label: 'B Grille', status: 'pending' },
                { label: 'C Linear Slot Diffuser', status: 'pending' },
                { label: 'A Diffuser', status: 'pending' },
                { label: 'B Grille', status: 'pending' },
                { label: 'A Diffuser', status: 'pending' },
              ].map((row, i) => {
                const isCurActive = row.status === 'active';
                const isCurApproved = row.status === 'approved';
                return (
                  <div
                    key={`${row.label}-${i}`}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      backgroundColor: isCurActive ? '#e2e8f0' : isCurApproved ? '#ecfdf5' : '#ffffff',
                      border: `1px solid ${isCurActive ? '#94a3b8' : isCurApproved ? '#a7f3d0' : '#e2e8f0'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      fontFamily: FONT.mono,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          backgroundColor: isCurApproved ? '#16a34a' : isCurActive ? '#0284c7' : '#cbd5e1',
                        }}
                      />
                      <span style={{ color: isCurApproved ? '#065f46' : '#1e293b', fontWeight: isCurActive ? 700 : 500 }}>
                        {row.label}
                      </span>
                    </div>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>
                      {isCurApproved ? '✓' : `0${i + 1}`}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Bottom Drawer Footer */}
            <div
              style={{
                padding: '12px 16px',
                borderTop: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: FONT.mono,
                fontSize: 11,
              }}
            >
              <span style={{ color: '#64748b' }}>HITL REVIEW GATE</span>
              <span style={{ color: '#0284c7', fontWeight: 700 }}>Approve all →</span>
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
