import React from 'react';
import {
  CheckCircle2,
  Clock,
  Edit3,
  XCircle,
  HelpCircle,
  ShieldAlert,
  Wind,
  Flame,
  Zap,
  Droplet,
} from 'lucide-react';

export type StatusBadgeType =
  | 'SUGGESTED'
  | 'ACCEPTED'
  | 'CORRECTED'
  | 'REJECTED'
  | 'CANNOT_DETERMINE'
  | 'supply'
  | 'return'
  | 'exhaust'
  | 'fire_life_safety'
  | 'plumbing'
  | 'electrical'
  | 'VERIFIED'
  | 'REVIEW';

export interface StatusBadgeProps {
  status: StatusBadgeType | string;
  label?: string;
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

interface BadgeConfig {
  label: string;
  className: string;
  icon: React.ReactNode;
}

function getBadgeConfig(status: string, size: 'sm' | 'md'): BadgeConfig {
  const iconClass = size === 'sm' ? 'w-2.5 h-2.5 shrink-0' : 'w-3.5 h-3.5 shrink-0';
  const normalized = status.toLowerCase();

  if (normalized === 'suggested') {
    return {
      label: 'Suggested',
      className: 'text-amber-300 bg-amber-950/80 border-amber-500/40',
      icon: <Clock className={iconClass} />,
    };
  }
  if (normalized === 'accepted') {
    return {
      label: 'Accepted',
      className: 'text-emerald-300 bg-emerald-950/80 border-emerald-500/40',
      icon: <CheckCircle2 className={iconClass} />,
    };
  }
  if (normalized === 'corrected') {
    return {
      label: 'Corrected',
      className: 'text-cyan-300 bg-cyan-950/80 border-cyan-500/40',
      icon: <Edit3 className={iconClass} />,
    };
  }
  if (normalized === 'rejected') {
    return {
      label: 'Rejected',
      className: 'text-rose-300 bg-rose-950/80 border-rose-500/40',
      icon: <XCircle className={iconClass} />,
    };
  }
  if (normalized === 'cannot_determine') {
    return {
      label: 'Uncertain',
      className: 'text-slate-300 bg-slate-900 border-slate-700',
      icon: <HelpCircle className={iconClass} />,
    };
  }

  // MEP System Trades
  if (normalized.includes('supply') || normalized === 's') {
    return {
      label: 'Supply Air',
      className: 'text-sky-300 bg-sky-950/80 border-sky-500/40',
      icon: <Wind className={iconClass} />,
    };
  }
  if (normalized.includes('return') || normalized === 'r') {
    return {
      label: 'Return Air',
      className: 'text-emerald-300 bg-emerald-950/80 border-emerald-500/40',
      icon: <Wind className={iconClass} />,
    };
  }
  if (normalized.includes('exhaust') || normalized === 'e') {
    return {
      label: 'Exhaust Air',
      className: 'text-amber-300 bg-amber-950/80 border-amber-500/40',
      icon: <Wind className={iconClass} />,
    };
  }
  if (normalized.includes('fire') || normalized === 'fls') {
    return {
      label: 'Fire Life Safety',
      className: 'text-rose-300 bg-rose-950/80 border-rose-500/40',
      icon: <Flame className={iconClass} />,
    };
  }
  if (normalized.includes('plumb')) {
    return {
      label: 'Plumbing',
      className: 'text-sky-300 bg-sky-950/80 border-sky-500/40',
      icon: <Droplet className={iconClass} />,
    };
  }
  if (normalized.includes('elec')) {
    return {
      label: 'Electrical',
      className: 'text-yellow-300 bg-yellow-950/80 border-yellow-500/40',
      icon: <Zap className={iconClass} />,
    };
  }

  // Scale Verification States
  if (normalized === 'verified' || normalized === 'calibrated') {
    return {
      label: 'Calibrated',
      className: 'text-emerald-300 bg-emerald-950/80 border-emerald-500/40',
      icon: <CheckCircle2 className={iconClass} />,
    };
  }
  if (normalized === 'review' || normalized === 'review_required') {
    return {
      label: 'Review Required',
      className: 'text-amber-300 bg-amber-950/80 border-amber-500/40',
      icon: <ShieldAlert className={iconClass} />,
    };
  }

  return {
    label: status,
    className: 'text-slate-300 bg-slate-900 border-slate-700',
    icon: <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />,
  };
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  icon,
  size = 'sm',
  className = '',
}) => {
  const config = getBadgeConfig(status, size);
  const sizeClasses =
    size === 'sm'
      ? 'px-1.5 py-0.5 text-[10px] gap-1 rounded'
      : 'px-2 py-1 text-xs gap-1.5 rounded-md';

  return (
    <span
      className={`inline-flex items-center font-mono font-medium border leading-none select-none ${config.className} ${sizeClasses} ${className}`}
    >
      {icon ?? config.icon}
      <span>{label ?? config.label}</span>
    </span>
  );
};
