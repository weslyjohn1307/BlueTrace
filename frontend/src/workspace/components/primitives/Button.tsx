import React, { forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shortcut?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-cyan-600 hover:bg-cyan-500 text-bt-on-brand border border-cyan-500/60 shadow-sm focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bt-inset',
  secondary:
    'bg-bt-panel hover:bg-bt-panel text-bt-text-primary border border-bt-border-strong shadow-sm focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bt-inset',
  ghost:
    'bg-transparent hover:bg-bt-panel/70 text-bt-text-secondary hover:text-bt-on-brand border border-transparent focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bt-inset',
  danger:
    'bg-rose-600 hover:bg-rose-500 text-bt-on-brand border border-rose-500/60 shadow-sm focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bt-inset',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs rounded-md gap-1.5',
  md: 'h-9 px-3.5 text-sm rounded-lg gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      shortcut,
      icon,
      disabled,
      className = '',
      children,
      type = 'button',
      ...rest
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={`inline-flex items-center justify-center font-mono font-medium outline-none select-none cursor-pointer transition-all duration-100 ease-out active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none disabled:active:scale-100 ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${className}`}
        {...rest}
      >
        {icon && <span className="shrink-0 flex items-center justify-center">{icon}</span>}
        {children && <span>{children}</span>}
        {shortcut && (
          <kbd className="ml-1 px-1 py-0.5 text-[9px] font-mono rounded bg-bt-inset/60 border border-bt-border-strong/80 text-bt-text-secondary leading-none">
            {shortcut}
          </kbd>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
