import React from 'react';

export type BrandIconName =
  | 'project'
  | 'layers'
  | 'detect'
  | 'measure'
  | 'review'
  | 'takeoff'
  | 'settings';

export interface BrandIconProps {
  name: BrandIconName;
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Official 7 custom product line icons from BlueTrace_Brand_Pack_v2 (24x24 grid, 1.7px stroke).
 */
export const BrandIcon: React.FC<BrandIconProps> = ({
  name,
  size = 16,
  className = '',
  title,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {name === 'project' && (
        <>
          <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H11l2 2h5.5A1.5 1.5 0 0 1 20 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" />
          <path d="M4 10h16" />
        </>
      )}
      {name === 'layers' && (
        <>
          <path d="m12 3 9 5-9 5-9-5z" />
          <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
        </>
      )}
      {name === 'detect' && (
        <>
          <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
          <path d="m14 17 2 2 4-5" />
        </>
      )}
      {name === 'measure' && (
        <>
          <path d="m4 16 12-12 4 4L8 20H4z" />
          <path d="m13 7 4 4M10 10l2 2M7 13l2 2" />
        </>
      )}
      {name === 'review' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m7.5 12 3 3 6-6" />
        </>
      )}
      {name === 'takeoff' && (
        <path d="M4 20V11h4v9zM10 20V5h4v15zM16 20V8h4v12z" />
      )}
      {name === 'settings' && (
        <>
          <path d="M4 6h16M4 12h16M4 18h16" />
          <circle cx="9" cy="6" r="2" fill="currentColor" />
          <circle cx="15" cy="12" r="2" fill="currentColor" />
          <circle cx="11" cy="18" r="2" fill="currentColor" />
        </>
      )}
    </svg>
  );
};

export interface BrandSymbolProps {
  size?: number;
  variant?: 'color' | 'reversed' | 'black' | 'dark-surface';
  className?: string;
}

/**
 * Official BlueTrace two-plane folded geometric monogram from BlueTrace_Brand_Pack_v2.
 */
export const BrandSymbol: React.FC<BrandSymbolProps> = ({
  size = 28,
  variant = 'color',
  className = '',
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

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 124 198"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M 6 35 L 58 5 L 118 40 L 118 105 L 91 121 L 91 76 L 58 57 L 6 88 Z"
        fill={upperFill}
      />
      <path
        d="M 6 103 L 34 119 L 34 160 L 118 112 L 118 145 L 34 193 L 6 177 Z"
        fill={lowerFill}
      />
    </svg>
  );
};

export interface BrandLockupProps {
  theme?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  showDescriptor?: boolean;
  descriptorText?: string;
  className?: string;
}

/**
 * Official BlueTrace Brand Lockup combining the folded-plane symbol, wordmark, and descriptor.
 */
export const BrandLockup: React.FC<BrandLockupProps> = ({
  theme = 'dark',
  size = 'md',
  showDescriptor = true,
  descriptorText = 'MEP DRAWING INTELLIGENCE',
  className = '',
}) => {
  const isDark = theme === 'dark';
  const boxClass =
    size === 'lg' ? 'w-10 h-10' : size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';
  const symbolSize = size === 'lg' ? 24 : size === 'sm' ? 16 : 20;
  const titleClass =
    size === 'lg' ? 'text-[18px]' : size === 'sm' ? 'text-[13px]' : 'text-[15px]';
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <div
        className={`${boxClass} rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
          isDark
            ? 'bg-[#0A0F1E] border-[#005BFF]/45 shadow-[0_0_14px_rgba(0,91,255,0.28)]'
            : 'bg-[#E9F4FF] border-[#005BFF]/25'
        }`}
      >
        <BrandSymbol size={symbolSize} variant={isDark ? 'dark-surface' : 'color'} />
      </div>
      <div className="flex flex-col leading-none">
        <span
          className={`font-bold ${titleClass} tracking-[-0.02em] ${
            isDark ? 'text-white' : 'text-[#0A0F1E]'
          }`}
          style={{ fontFamily: 'var(--bt-font-display, Inter, sans-serif)' }}
        >
          BlueTrace
        </span>
        {showDescriptor && (
          <span
            className={`text-[9px] font-mono tracking-[0.16em] uppercase mt-0.5 ${
              isDark ? 'text-bt-brand' : 'text-[#005BFF]'
            }`}
          >
            {descriptorText}
          </span>
        )}
      </div>
    </div>
  );
};
