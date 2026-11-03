import React, { useRef } from 'react';

export interface SegmentedControlOption<T extends string = string> {
  id: T;
  label: React.ReactNode;
  badge?: React.ReactNode;
  ariaLabel?: string;
}

export interface SegmentedControlProps<T extends string = string> {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
  ariaLabel = 'Navigation tabs',
}: SegmentedControlProps<T>): React.ReactElement {
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % options.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + options.length) % options.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = options.length - 1;
    }

    if (nextIndex >= 0) {
      e.preventDefault();
      const nextOption = options[nextIndex];
      onChange(nextOption.id);
      // Move focus to the new tab button
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons?.[nextIndex]?.focus();
    }
  };

  const sizeStyles = size === 'sm' ? 'text-[11px] py-1 px-2' : 'text-xs py-1.5 px-3';

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex items-center bg-slate-950/80 p-0.5 rounded-lg border border-slate-800 select-none ${className}`}
    >
      {options.map((opt, index) => {
        const isSelected = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-label={opt.ariaLabel}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(opt.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`relative flex items-center justify-center font-mono font-medium rounded-md transition-all duration-[180ms] ease-out outline-none cursor-pointer ${sizeStyles} ${
              isSelected
                ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/80'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <span>{opt.label}</span>
            {opt.badge != null && (
              <span className="ml-1.5 flex items-center justify-center">{opt.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
