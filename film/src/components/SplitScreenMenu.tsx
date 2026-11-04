import React from 'react';
import { FONT } from '../theme';

interface MenuItem {
  title: string;
  subtitle?: string;
  active?: boolean;
}

interface SplitScreenMenuProps {
  category: string;
  items: MenuItem[];
  style?: React.CSSProperties;
}

export const SplitScreenMenu: React.FC<SplitScreenMenuProps> = ({
  category,
  items,
  style,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: 100,
        top: 140,
        width: 340,
        fontFamily: FONT.ui,
        userSelect: 'none',
        ...style,
      }}
    >
      {/* Category Headline */}
      <div
        style={{
          fontSize: 46,
          fontWeight: 700,
          color: '#17252b',
          letterSpacing: '-0.025em',
          lineHeight: 1.1,
          marginBottom: 36,
        }}
      >
        {category}
      </div>

      {/* Vertical Feature List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {items.map((item) => {
          const isActive = !!item.active;
          return (
            <div
              key={item.title}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                opacity: isActive ? 1 : 0.65,
                transition: 'opacity 0.2s ease',
              }}
            >
              <div
                style={{
                  fontSize: 19,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#17252b' : '#8c8273',
                  letterSpacing: '-0.015em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                {isActive && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: '#0284c7',
                    }}
                  />
                )}
                <span>{item.title}</span>
              </div>
              {item.subtitle && (
                <div
                  style={{
                    fontSize: 15,
                    color: isActive ? '#55656d' : '#a89f91',
                    paddingLeft: isActive ? 16 : 0,
                    lineHeight: 1.35,
                  }}
                >
                  {item.subtitle}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
