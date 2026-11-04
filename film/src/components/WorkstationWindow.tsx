import React from 'react';
import { C, FONT } from '../theme';

interface WorkstationWindowProps {
  children: React.ReactNode;
  width?: number;
  height?: number;
  rotateX?: number;
  rotateY?: number;
  scale?: number;
  scaleBadgeText?: string;
  scaleBadgeTone?: 'normal' | 'amber' | 'verified';
  activeSheetId?: string;
  onCopilotActive?: boolean;
  rightPanel?: React.ReactNode;
  lift?: number;
}

export const WorkstationWindow: React.FC<WorkstationWindowProps> = ({
  children,
  width = 1440,
  height = 810,
  rotateX = 0,
  rotateY = 0,
  scale = 1,
  scaleBadgeText = '1/4" = 1\'-0"',
  scaleBadgeTone = 'normal',
  activeSheetId = 'M-201',
  onCopilotActive = false,
  rightPanel,
  lift = 0,
}) => {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#0c1418',
        boxShadow:
          '0 50px 140px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        transform: `perspective(1400px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale}) translateY(${lift}px)`,
        transformStyle: 'preserve-3d',
        fontFamily: FONT.ui,
      }}
    >
      {/* Workstation Top Bar */}
      <div
        style={{
          height: 48,
          backgroundColor: '#0f1a20',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          userSelect: 'none',
        }}
      >
        {/* Left: Window Dots & Project Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', gap: 7 }}>
            <span
              style={{
                width: 11,
                height: 11,
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                opacity: 0.8,
              }}
            />
            <span
              style={{
                width: 11,
                height: 11,
                borderRadius: '50%',
                backgroundColor: '#f59e0b',
                opacity: 0.8,
              }}
            />
            <span
              style={{
                width: 11,
                height: 11,
                borderRadius: '50%',
                backgroundColor: '#10b981',
                opacity: 0.8,
              }}
            />
          </div>

          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 13,
              letterSpacing: '0.08em',
              color: '#8b9a9b',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ color: '#e5e7eb', fontWeight: 600 }}>BLUETRACE</span>
            <span>/</span>
            <span>T3 EXPANSION</span>
          </div>

          {/* Active Sheet Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: '#162329',
              padding: '4px 12px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.06)',
              fontFamily: FONT.mono,
              fontSize: 12,
              color: '#cbd5e1',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: C.supply,
              }}
            />
            <span style={{ fontWeight: 600 }}>{activeSheetId}</span>
            <span style={{ color: '#64748b' }}>·</span>
            <span style={{ color: '#94a3b8' }}>LEVEL 02 MEP PLAN</span>
          </div>
        </div>

        {/* Center: Segmented 2D/3D Mode */}
        <div
          style={{
            display: 'flex',
            backgroundColor: '#0a1013',
            borderRadius: 6,
            padding: 3,
            border: '1px solid rgba(255,255,255,0.05)',
            fontFamily: FONT.mono,
            fontSize: 11,
            letterSpacing: '0.06em',
          }}
        >
          <div
            style={{
              backgroundColor: '#1e2f37',
              color: '#38bdf8',
              padding: '3px 10px',
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            2D VECTOR
          </div>
          <div style={{ color: '#64748b', padding: '3px 10px' }}>3D BIM</div>
          <div style={{ color: '#64748b', padding: '3px 10px' }}>SCHEDULE</div>
        </div>

        {/* Right: Scale Pill, Agent Activity & Copilot Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Scale Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '4px 12px',
              borderRadius: 6,
              fontFamily: FONT.mono,
              fontSize: 11,
              letterSpacing: '0.04em',
              fontWeight: 600,
              backgroundColor:
                scaleBadgeTone === 'amber'
                  ? 'rgba(245, 158, 11, 0.15)'
                  : scaleBadgeTone === 'verified'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : '#162329',
              color:
                scaleBadgeTone === 'amber'
                  ? '#fbbf24'
                  : scaleBadgeTone === 'verified'
                  ? '#34d399'
                  : '#94a3b8',
              border: `1px solid ${
                scaleBadgeTone === 'amber'
                  ? 'rgba(245, 158, 11, 0.4)'
                  : scaleBadgeTone === 'verified'
                  ? 'rgba(16, 185, 129, 0.3)'
                  : 'rgba(255,255,255,0.06)'
              }`,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor:
                  scaleBadgeTone === 'amber'
                    ? '#fbbf24'
                    : scaleBadgeTone === 'verified'
                    ? '#34d399'
                    : '#64748b',
              }}
            />
            <span>{scaleBadgeText}</span>
          </div>

          {/* Tracer Agent Status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: FONT.mono,
              fontSize: 11,
              color: '#38bdf8',
              backgroundColor: 'rgba(56, 189, 248, 0.08)',
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid rgba(56, 189, 248, 0.2)',
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                backgroundColor: '#38bdf8',
              }}
            />
            <span>L2 TRACER</span>
          </div>

          {/* Copilot Button */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              borderRadius: 6,
              fontFamily: FONT.mono,
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: onCopilotActive
                ? '#0284c7'
                : 'rgba(255,255,255,0.05)',
              color: onCopilotActive ? '#ffffff' : '#e2e8f0',
              border: `1px solid ${
                onCopilotActive ? '#38bdf8' : 'rgba(255,255,255,0.1)'
              }`,
              boxShadow: onCopilotActive
                ? '0 0 16px rgba(56, 189, 248, 0.4)'
                : 'none',
            }}
          >
            <span>✦</span>
            <span>COPILOT</span>
          </div>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {/* Left Sheet Navigator Sidebar */}
        <div
          style={{
            width: 220,
            backgroundColor: '#0a1215',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            padding: '14px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 11,
              color: '#64748b',
              letterSpacing: '0.08em',
              paddingLeft: 4,
            }}
          >
            SHEETS · LEVEL 02
          </div>

          {/* Sheet Thumbnails */}
          {[
            { id: 'M-201', name: 'HVAC Ductwork', trade: 'Mech', color: C.supply },
            { id: 'M-202', name: 'Rooftop Units', trade: 'Mech', color: C.supply },
            { id: 'E-101', name: 'Lighting & Feeder', trade: 'Elec', color: C.electrical },
            { id: 'P-301', name: 'Chilled Water Loop', trade: 'Plumb', color: C.plumbing },
          ].map((item) => {
            const isSelected = item.id === activeSheetId;
            return (
              <div
                key={item.id}
                style={{
                  padding: '9px 10px',
                  borderRadius: 6,
                  backgroundColor: isSelected
                    ? 'rgba(40, 111, 159, 0.18)'
                    : 'transparent',
                  border: `1px solid ${
                    isSelected ? 'rgba(56, 189, 248, 0.4)' : 'transparent'
                  }`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 4,
                    backgroundColor: '#142127',
                    border: `1px solid ${
                      isSelected ? item.color : 'rgba(255,255,255,0.08)'
                    }`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: FONT.mono,
                    fontSize: 10,
                    fontWeight: 700,
                    color: item.color,
                  }}
                >
                  {item.trade[0]}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span
                    style={{
                      fontFamily: FONT.mono,
                      fontSize: 12,
                      fontWeight: 600,
                      color: isSelected ? '#ffffff' : '#94a3b8',
                    }}
                  >
                    {item.id}
                  </span>
                  <span
                    style={{
                      fontFamily: FONT.ui,
                      fontSize: 11,
                      color: '#64748b',
                    }}
                  >
                    {item.name}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Quick Stats Footer */}
          <div
            style={{
              marginTop: 'auto',
              padding: '10px 8px',
              backgroundColor: '#070d10',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.04)',
              fontFamily: FONT.mono,
              fontSize: 10,
              color: '#64748b',
              lineHeight: 1.5,
            }}
          >
            <div>ENGINE: PYMUPDF + NETWORKX</div>
            <div style={{ color: '#38bdf8' }}>GRID CAD: 72 PT/IN VALIDATED</div>
          </div>
        </div>

        {/* Viewport Canvas (Center) */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            backgroundColor: '#080e12',
            overflow: 'hidden',
          }}
        >
          {children}
        </div>

        {/* Optional Right Panel (Copilot or Ledger) */}
        {rightPanel}
      </div>
    </div>
  );
};
