import React from 'react';
import { useCurrentFrame } from 'remotion';
import { EASE_ENTER, EASE_MOVE, FONT, ramp, s } from '../theme';
import { Paper } from '../components/primitives';
import { Cursor } from '../components/Cursor';

export const Shot7Return: React.FC = () => {
  const f = useCurrentFrame();

  const enter = ramp(f, [0, s(0.8)], [0, 1], EASE_ENTER);
  const lift = (1 - enter) * 20;

  // Export button clicked at second 6.5
  const isExported = f >= s(6.5);
  const exportPop = ramp(f, [s(6.5), s(7.0)], [1.1, 1.0], EASE_ENTER);

  // Cursor coordinates
  let cursorX = 800;
  let cursorY = 600;
  let clickFrame: number | undefined;

  if (f < s(6.8)) {
    // Moves to [ Export ] button (x: 1400, y: 285)
    const t = ramp(f, [s(3.5), s(6.5)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 800 + t * 1400;
    cursorY = (1 - t) * 600 + t * 285;
    if (f >= s(6.5) && f < s(6.8)) {
      clickFrame = s(6.5);
    }
  } else {
    // Idles over exported status
    const t = ramp(f, [s(7.2), s(9.5)], [0, 1], EASE_MOVE);
    cursorX = (1 - t) * 1400 + t * 1280;
    cursorY = (1 - t) * 285 + t * 360;
  }

  return (
    <Paper withDotGrid={true}>
      {/* Centered Top Headlines (Editorial Takeoff Report Layout) */}
      <div
        style={{
          position: 'absolute',
          top: 60,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: FONT.ui,
          opacity: enter,
          transform: `translateY(${lift}px)`,
        }}
      >
        <div
          style={{
            fontSize: 48,
            fontWeight: 800,
            color: '#17252b',
            letterSpacing: '-0.025em',
            marginBottom: 10,
          }}
        >
          Build verified reports
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 500,
            color: '#65747d',
            letterSpacing: '-0.01em',
          }}
        >
          Every breakdown you need, nothing you don't
        </div>
      </div>

      {/* Main Content Area: Floating Export Modal + Floating CSV Badge */}
      <div
        style={{
          position: 'absolute',
          left: 140,
          top: 200,
          width: 1300,
          borderRadius: 14,
          backgroundColor: '#ffffff',
          boxShadow: '0 30px 90px rgba(23, 37, 43, 0.12), 0 0 0 1px rgba(23, 37, 43, 0.08)',
          overflow: 'hidden',
          fontFamily: FONT.ui,
          opacity: enter,
          transform: `translateY(${lift}px)`,
        }}
      >
        {/* Modal Top Bar */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Export Takeoff — T3 EXPANSION (LEVEL 02)
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 12, color: '#64748b', marginTop: 2 }}>
              FILE: 2026-11-takeoff-hvac.csv · FORMAT: CSV
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontFamily: FONT.mono,
                fontSize: 12,
                color: '#475569',
              }}
            >
              Cancel
            </div>
            <div
              style={{
                padding: '9px 20px',
                borderRadius: 6,
                backgroundColor: isExported ? '#16a34a' : '#0f172a',
                color: '#ffffff',
                fontFamily: FONT.mono,
                fontSize: 12,
                fontWeight: 700,
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.25)',
                transform: `scale(${isExported ? exportPop : 1})`,
                transition: 'background-color 0.2s',
              }}
            >
              {isExported ? '✓ Exported' : 'Export ↵'}
            </div>
          </div>
        </div>

        {/* Suggested Blocks Header */}
        <div
          style={{
            padding: '12px 24px',
            backgroundColor: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontFamily: FONT.mono,
            fontSize: 11,
          }}
        >
          <span style={{ color: '#0284c7', fontWeight: 700 }}>✦ SUGGESTED BLOCKS:</span>
          <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>
            + Air Distribution (120 items)
          </span>
          <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>
            + Duct Fittings (15 items)
          </span>
          <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>
            + Equipment (4 items)
          </span>
        </div>

        {/* Populated Ductwork Bill of Materials Table (Matching Screenshot 16!) */}
        <div style={{ padding: '20px 24px' }}>
          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 12,
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: '0.08em',
              marginBottom: 12,
            }}
          >
            DUCTWORK (CSI DIVISION 23 · SMACNA STANDARD)
          </div>

          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: FONT.mono,
              fontSize: 12,
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1.5px solid #cbd5e1', color: '#64748b' }}>
                <th style={{ padding: '8px 10px' }}>SIZE</th>
                <th style={{ padding: '8px 10px' }}>MAT.</th>
                <th style={{ padding: '8px 10px' }}>GA.</th>
                <th style={{ padding: '8px 10px' }}>CONN. SETS</th>
                <th style={{ padding: '8px 10px' }}>REINF. SETS</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>LF</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>SQ. FT.</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>WT. (LBS)</th>
              </tr>
            </thead>
            <tbody>
              {[
                { size: '42"×16"', mat: 'Galv.', ga: '22', conn: 23, reinf: 43, lf: '92.02', sqft: '889.52', wt: '1,250.7' },
                { size: '30"×16"', mat: 'Galv.', ga: '22', conn: 8, reinf: 16, lf: '30.82', sqft: '236.28', wt: '332.2' },
                { size: '26"×16"', mat: 'Galv.', ga: '22', conn: 23, reinf: 30, lf: '92.72', sqft: '649.05', wt: '912.6' },
                { size: '20"×14"', mat: 'Galv.', ga: '22', conn: 7, reinf: 14, lf: '25.74', sqft: '145.84', wt: '205.1' },
                { size: '10"ø', mat: 'Galv.', ga: '24', conn: 12, reinf: '—', lf: '65.69', sqft: '171.98', wt: '184.3' },
              ].map((row, i) => (
                <tr
                  key={row.size}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    backgroundColor: i % 2 === 0 ? '#ffffff' : '#fafafa',
                  }}
                >
                  <td style={{ padding: '10px 10px', fontWeight: 700, color: '#0f172a' }}>{row.size}</td>
                  <td style={{ padding: '10px 10px', color: '#475569' }}>{row.mat}</td>
                  <td style={{ padding: '10px 10px', color: '#475569' }}>{row.ga}</td>
                  <td style={{ padding: '10px 10px', color: '#475569' }}>{row.conn}</td>
                  <td style={{ padding: '10px 10px', color: '#475569' }}>{row.reinf}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: '#0284c7' }}>{row.lf}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#475569' }}>{row.sqft}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{row.wt}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Table Summary Footer */}
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              backgroundColor: '#f1f5f9',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontFamily: FONT.mono,
              fontSize: 12,
            }}
          >
            <div style={{ color: '#475569' }}>
              PHYSICAL VECTOR TRACE: <strong>5 RUNS VERIFIED</strong>
            </div>
            <div style={{ display: 'flex', gap: 24 }}>
              <span>TOTAL LF: <strong style={{ color: '#0284c7' }}>307.0 LF</strong></span>
              <span>TOTAL WEIGHT: <strong style={{ color: '#0f172a' }}>2,884.9 LBS</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Floating CSV Badge (Matching Screenshot 16!) */}
      <div
        style={{
          position: 'absolute',
          right: 170,
          top: 360,
          width: 220,
          height: 220,
          borderRadius: 24,
          backgroundColor: '#ffffff',
          boxShadow: '0 25px 60px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: enter,
          transform: `translateY(${lift}px)`,
        }}
      >
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: '#f97316',
            fontFamily: FONT.ui,
            letterSpacing: '-0.02em',
          }}
        >
          CSV
        </div>
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 12,
            color: '#64748b',
            marginTop: 6,
          }}
        >
          EXPORT READY
        </div>
      </div>

      {/* Animated Cursor */}
      <Cursor
        x={cursorX}
        y={cursorY}
        clickFrame={clickFrame}
        currentFrame={f}
      />
    </Paper>
  );
};
