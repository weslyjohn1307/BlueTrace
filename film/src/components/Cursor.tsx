import React from 'react';
import { interpolate } from 'remotion';
import { EASE_ENTER } from '../theme';

interface CursorProps {
  x: number;
  y: number;
  clickFrame?: number;
  currentFrame: number;
  visible?: boolean;
}

export const Cursor: React.FC<CursorProps> = ({
  x,
  y,
  clickFrame,
  currentFrame,
  visible = true,
}) => {
  if (!visible) return null;

  // Click animation: scale down slightly on click
  const isClicking =
    clickFrame !== undefined &&
    currentFrame >= clickFrame &&
    currentFrame <= clickFrame + 14;

  const clickScale = isClicking
    ? interpolate(currentFrame - clickFrame, [0, 4, 14], [1, 0.85, 1], {
        easing: EASE_ENTER,
      })
    : 1;

  // Expanding ripple ring
  const hasRipple =
    clickFrame !== undefined &&
    currentFrame >= clickFrame &&
    currentFrame <= clickFrame + 22;

  const rippleScale = hasRipple
    ? interpolate(currentFrame - clickFrame, [0, 22], [0.4, 2.6], {
        easing: EASE_ENTER,
      })
    : 0;

  const rippleOpacity = hasRipple
    ? interpolate(currentFrame - clickFrame, [0, 6, 22], [0.9, 0.6, 0])
    : 0;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        pointerEvents: 'none',
        zIndex: 9999,
        transform: `translate(-2px, -2px) scale(${clickScale})`,
        transformOrigin: '2px 2px',
        filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))',
      }}
    >
      {/* Ripple */}
      {hasRipple && (
        <div
          style={{
            position: 'absolute',
            left: 2,
            top: 2,
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '2px solid #38bdf8',
            transform: `translate(-50%, -50%) scale(${rippleScale})`,
            opacity: rippleOpacity,
          }}
        />
      )}

      {/* Apple-grade vector cursor */}
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M4.5 2.5L19.5 13.5L12.5 14.8L10 21.5L7.2 20.3L9.8 13.8L4.5 10.5V2.5Z"
          fill="#0c1418"
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
