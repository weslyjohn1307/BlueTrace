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
    'bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-500/60 shadow-sm focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
  secondary:
    'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
  ghost:
    'bg-transparent hover:bg-slate-800/70 text-slate-300 hover:text-white border border-transparent focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
  danger:
    'bg-rose-600 hover:bg-rose-500 text-white border border-rose-500/60 shadow-sm focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
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
          <kbd className="ml-1 px-1 py-0.5 text-[9px] font-mono rounded bg-slate-950/60 border border-slate-700/80 text-slate-400 leading-none">
            {shortcut}
          </kbd>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
