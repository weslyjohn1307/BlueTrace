import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, EASE_ENTER, EASE_MOVE, FONT, ramp, s } from '../theme';
import { ConceptTag, Paper } from '../components/primitives';
import { WorkstationWindow } from '../components/WorkstationWindow';
import { Cursor } from '../components/Cursor';
import { ArchLayer, MechLayer, PlumbLayer, SHEET_H, SHEET_W } from '../components/Sheet';
import '@zakisheriff/liquid-glass/styles.css';

export const Shot1Open: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  // -------------------------------------------------------------
  // BRAND REVEAL ENTRANCE (0:00 - 0:05.5 | f: 0 - 330)
  // Official BlueTrace Folded Ribbon Monogram + 3D Extruded Title + Liquid Glass Pill
  // -------------------------------------------------------------

  // Master entrance spring
  const masterSpring = spring({
    frame: Math.max(0, f - 4),
    fps,
    config: { damping: 14, mass: 0.7, stiffness: 90 },
  });

  // Physical 3D Folding Assembly of the 2-Plane Monogram
  const upperPlaneSpring = spring({
    frame: Math.max(0, f - 6),
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 120 },
  });
  const lowerPlaneSpring = spring({
    frame: Math.max(0, f - 14),
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 120 },
  });

  // 3D Perspective breathing
  const rotX = interpolate(f, [0, 600], [10, 4], { extrapolateRight: 'clamp' });
  const rotY = interpolate(f, [0, 600], [-6, -2], { extrapolateRight: 'clamp' });

  // Specular light sweep across brand mark & letters (f: 40 - 120)
  const glintProgress = ramp(f, [35, 110], [-80, 200], EASE_MOVE);
  const glintOpacity = ramp(f, [35, 50], [0, 1], EASE_ENTER) * ramp(f, [100, 110], [1, 0], EASE_ENTER);

  // Liquid Glass Pill Badge Entrance & Laser Sweep (f: 60 - 150)
  const badgeSpring = spring({
    frame: Math.max(0, f - 32),
    fps,
    config: { damping: 14, mass: 0.6, stiffness: 110 },
  });
  const badgeLaser = ramp(f, [55, 140], [-100, 240], EASE_MOVE);

  // Subtitle Entrance
  const subtitleEnter = ramp(f, [40, 85], [0, 1], EASE_ENTER);

  // -------------------------------------------------------------
  // HERO SWOOP & WORKSTATION LANDING (0:05.5 - 0:10.0 | f: 330 - 600)
  // Brand lockup glides up smoothly into top header; CAD Workstation lands
  // -------------------------------------------------------------
  const headerProgress = ramp(f, [330, 400], [0, 1], EASE_ENTER);
  const brandCenterY = (1 - headerProgress) * 0 + headerProgress * -415;
  const brandScale = 1 - headerProgress * 0.28;

  const wsEnter = headerProgress;
  const wsY = (1 - wsEnter) * 140;

  // Cursor Interaction in Act 2
  const curX = interpolate(f, [440, 505], [920, 560], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const curY = interpolate(f, [440, 505], [520, 310], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const clickF = 500;
  const isAfterClick = f >= clickF;
  const dimDraw = ramp(f, [clickF, clickF + 25], [0, 1], EASE_ENTER);

  // Smooth camera push into sheet at end of Shot 1 (0:09.4 - 0:10.0)
  const pushProgress = ramp(f, [s(9.2), s(10.0)], [0, 1], EASE_MOVE);
  const pushScale = 1 + pushProgress * 0.08;
  const shotFadeOut = ramp(f, [s(9.6), s(10.0)], [1, 0.96]);

  return (
    <Paper>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          opacity: shotFadeOut,
          transform: `scale(${pushScale})`,
          transformOrigin: 'center 460px',
        }}
      >
        {/* ========================================================= */}
        {/* BRAND HERO REVEAL: Dead-Center 0-5.5s, Glides to Top 5.5-10s */}
        {/* ========================================================= */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) translateY(${brandCenterY}px) scale(${brandScale})`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            opacity: masterSpring,
            zIndex: 30,
            pointerEvents: 'none',
            perspective: '1200px',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* ------------------------------------------------------- */}
          {/* 3D FOLDED RIBBON MONOGRAM (Official Brand Pack Emblem) */}
          {/* ------------------------------------------------------- */}
          <div
            style={{
              position: 'relative',
              width: 110,
              height: 120,
              marginBottom: 16,
              transform: `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
              transformStyle: 'preserve-3d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Soft Ambient Contact Shadow on Vellum Ground */}
            <div
              style={{
                position: 'absolute',
                bottom: -10,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 120,
                height: 22,
                borderRadius: '50%',
                backgroundColor: 'rgba(23, 37, 43, 0.16)',
                filter: 'blur(10px)',
                opacity: masterSpring,
              }}
            />

            {/* 3D Isometric Assembling Monogram */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width={100}
              height={125}
              viewBox="0 0 124 198"
              style={{
                overflow: 'visible',
                filter: 'drop-shadow(0 12px 24px rgba(0, 91, 255, 0.22))',
              }}
            >
              {/* Lower Folded Plane (Deep Navy / Signal Cyan) with 3D Spring */}
              <g
                style={{
                  transformOrigin: '58px 120px',
                  transform: `scale(${lowerPlaneSpring}) translateY(${(1 - lowerPlaneSpring) * 20}px)`,
                  transition: 'transform 0.1s',
                }}
              >
                <path
                  d="M 6 103 L 34 119 L 34 160 L 118 112 L 118 145 L 34 193 L 6 177 Z"
                  fill="#123A78"
                />
                {/* Lower Chamfer Highlight Edge */}
                <path
                  d="M 6 103 L 34 119 L 118 112"
                  fill="none"
                  stroke="#37C6FF"
                  strokeWidth={2}
                  opacity={0.65}
                />
              </g>

              {/* Upper Folded Plane (BlueTrace Electric Blue #005BFF) with 3D Spring */}
              <g
                style={{
                  transformOrigin: '58px 50px',
                  transform: `scale(${upperPlaneSpring}) translateY(${(1 - upperPlaneSpring) * -25}px)`,
                  transition: 'transform 0.1s',
                }}
              >
                <path
                  d="M 6 35 L 58 5 L 118 40 L 118 105 L 91 121 L 91 76 L 58 57 L 6 88 Z"
                  fill="#005BFF"
                />
                {/* Upper Ridge Specular Crest */}
                <path
                  d="M 6 35 L 58 5 L 118 40"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={2.5}
                  opacity={0.7}
                />
              </g>
            </svg>

            {/* Specular Light Flare sweeping across logo */}
            {glintOpacity > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: -8,
                  left: `${glintProgress - 60}%`,
                  width: 90,
                  height: 120,
                  background:
                    'radial-gradient(ellipse at center, rgba(255,255,255,0.95) 0%, rgba(55,198,255,0.65) 45%, transparent 70%)',
                  pointerEvents: 'none',
                  mixBlendMode: 'screen',
                  opacity: glintOpacity,
                  filter: 'blur(3px)',
                }}
              />
            )}
          </div>

          {/* ------------------------------------------------------- */}
          {/* 3D EXTRUDED BRAND TITLE (STIX Two Text Serif)           */}
          {/* ------------------------------------------------------- */}
          <div
            style={{
              position: 'relative',
              fontFamily: FONT.display,
              fontSize: 110,
              fontWeight: 500,
              lineHeight: 1.0,
              letterSpacing: '-0.03em',
              color: C.ink,
              marginBottom: 18,
              transform: `perspective(1000px) rotateX(${rotX * 0.5}deg)`,
              transformStyle: 'preserve-3d',
            }}
          >
            {/* 3D Depth Shadow Layers */}
            <span
              style={{
                position: 'absolute',
                inset: 0,
                color: '#28373e',
                textShadow: `
                  0 1px 0 #28373e,
                  0 2px 0 #202c32,
                  0 3px 0 #182227,
                  0 4px 1px rgba(23, 37, 43, 0.25),
                  0 12px 24px rgba(23, 37, 43, 0.16)
                `,
                zIndex: 1,
              }}
            >
              BlueTrace<span style={{ fontStyle: 'italic', fontWeight: 400 }}>AI</span>
            </span>

            {/* Front Face */}
            <span style={{ position: 'relative', zIndex: 2 }}>
              BlueTrace<span style={{ fontStyle: 'italic', fontWeight: 400 }}>AI</span>
            </span>

            {/* Specular Light Sweep across letters */}
            {glintOpacity > 0 && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 3,
                  backgroundImage: `linear-gradient(115deg, transparent ${glintProgress - 25}%, rgba(255,255,255,0.95) ${glintProgress}%, rgba(0,91,255,0.5) ${glintProgress + 4}%, transparent ${glintProgress + 25}%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  pointerEvents: 'none',
                  opacity: glintOpacity * 0.95,
                }}
              >
                BlueTrace<span style={{ fontStyle: 'italic', fontWeight: 400 }}>AI</span>
              </div>
            )}
          </div>

          {/* ------------------------------------------------------- */}
          {/* LIQUID GLASS PILL BADGE (@zakisheriff/liquid-glass)     */}
          {/* ------------------------------------------------------- */}
          <div
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 24px',
              borderRadius: 24,
              backgroundColor: 'rgba(255, 255, 255, 0.88)',
              border: '1px solid rgba(0, 91, 255, 0.28)',
              boxShadow:
                '0 10px 30px rgba(0, 91, 255, 0.12), 0 2px 8px rgba(23, 37, 43, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(16px)',
              overflow: 'hidden',
              opacity: badgeSpring * (1 - headerProgress),
              transform: `scale(${badgeSpring})`,
              marginBottom: 18,
            }}
          >
            {/* Laser light sweep across pill */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${badgeLaser}%`,
                width: 70,
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(0, 91, 255, 0.22) 50%, transparent 100%)',
                transform: 'skewX(-20deg)',
                pointerEvents: 'none',
              }}
            />

            <span style={{ color: '#005BFF', fontSize: 14 }}>✦</span>
            <span
              style={{
                fontFamily: FONT.mono,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: C.ink,
              }}
            >
              AI-POWERED TAKEOFF WORKSTATION
            </span>
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontFamily: FONT.display,
              fontStyle: 'italic',
              fontSize: 28,
              color: C.muted,
              letterSpacing: '-0.01em',
              opacity: subtitleEnter * (1 - headerProgress),
            }}
          >
            From drawing to reviewable takeoff.
          </div>
        </div>

        {/* ========================================================= */}
        {/* CAD WORKSTATION WINDOW SWOOP-IN (f >= 330)               */}
        {/* ========================================================= */}
        {f >= 325 && (
          <div
            style={{
              position: 'absolute',
              top: 210,
              opacity: wsEnter,
              transform: `translateY(${wsY}px)`,
              zIndex: 20,
            }}
          >
            <WorkstationWindow
              width={1460}
              height={740}
              rotateX={3.5}
              rotateY={-2.0}
              activeSheetId="M-201"
              scaleBadgeText={'1/4" = 1\'-0"'}
              scaleBadgeTone="verified"
            >
              {/* Real Vector Sheet Content */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  transform: 'scale(0.85) translate(40px, -30px)',
                  transformOrigin: 'center center',
                }}
              >
                <svg width={SHEET_W} height={SHEET_H} viewBox={`0 0 ${SHEET_W} ${SHEET_H}`}>
                  {/* Architectural base ghost */}
                  <ArchLayer draw={1} tone="ghost" />
                  {/* Plumbing */}
                  <PlumbLayer draw={1} />
                  {/* Supply duct highlighted */}
                  <MechLayer draw={1} highlightMain={isAfterClick} />
                </svg>

                {/* Dimension tag on the supply duct clicked */}
                {dimDraw > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 580,
                      top: 290,
                      padding: '4px 10px',
                      backgroundColor: '#091014',
                      border: '1px solid #ef4444',
                      borderRadius: 4,
                      fontFamily: FONT.mono,
                      fontSize: 12,
                      color: '#ffffff',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                      opacity: dimDraw,
                      transform: `scale(${dimDraw})`,
                      transformOrigin: 'left center',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ color: '#ef4444', fontWeight: 700 }}>28.7&apos;</span> · 30&quot;×16&quot; SA-A
                  </div>
                )}
              </div>

              {/* Animated Cursor */}
              <Cursor
                x={curX}
                y={curY}
                clickFrame={clickF}
                currentFrame={f}
                visible={f >= 440}
              />
            </WorkstationWindow>
          </div>
        )}
      </AbsoluteFill>

      {/* Permanent honest demo watermark */}
      <ConceptTag onDark={false} />
    </Paper>
  );
};
