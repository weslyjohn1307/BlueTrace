import React from 'react';

export interface BrandSymbolProps {
  size?: number;
  variant?: 'color' | 'reversed' | 'black' | 'dark-surface';
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Official BlueTrace two-plane folded geometric monogram.
 */
export const BrandSymbol: React.FC<BrandSymbolProps> = ({
  size = 48,
  variant = 'color',
  style,
  className,
}) => {
  const upperFill =
    variant === 'reversed'
      ? '#FFFFFF'
      : variant === 'black'
        ? '#0A0F1E'
        : '#005BFF';
  const lowerFill =
    variant === 'reversed'
      ? '#37C6FF'
      : variant === 'black'
        ? '#0A0F1E'
        : variant === 'dark-surface'
          ? '#37C6FF'
          : '#123A78';

  const w = size * (124 / 198);
  const h = size;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={w}
      height={h}
      viewBox="0 0 124 198"
      style={style}
      className={className}
      aria-hidden="true"
    >
      {/* Upper Folded Plane (BlueTrace Blue) */}
      <path
        d="M 6 35 L 58 5 L 118 40 L 118 105 L 91 121 L 91 76 L 58 57 L 6 88 Z"
        fill={upperFill}
      />
      {/* Lower Folded Plane (Deep Navy / Signal Cyan) */}
      <path
        d="M 6 103 L 34 119 L 34 160 L 118 112 L 118 145 L 34 193 L 6 177 Z"
        fill={lowerFill}
      />
    </svg>
  );
};
