import React from 'react';
import { BrainCircuit, CircleAlert, Cpu } from 'lucide-react';

export type AiAvailability = 'checking' | 'available' | 'local' | 'offline';

/**
 * AI readiness is derived from two real signals and nothing else:
 * - backend reachability (`/api/health`)
 * - whether a Meta key is configured for this server session
 *
 * There is no separate "model ready" flag in the product contract, so we do
 * not invent one.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function resolveAiAvailability(
  backendOnline: boolean | null,
  aiConfigured: boolean
): AiAvailability {
  if (backendOnline === null) return 'checking';
  if (!backendOnline) return 'offline';
  return aiConfigured ? 'available' : 'local';
}

const TONE: Record<
  AiAvailability,
  { label: string; description: string; className: string; icon: React.ReactNode }
> = {
  checking: {
    label: 'Checking connection',
    description: 'Checking whether the local backend and the Meta connection are available.',
    className: 'border-bt-border-strong text-bt-text-secondary',
    icon: <BrainCircuit className="h-4 w-4 shrink-0" aria-hidden="true" />,
  },
  available: {
    label: 'Meta connected',
    description:
      'Meta models are configured for this session. Sheet reading, vision checks and copilot can use them.',
    className: 'border-bt-success-border bg-bt-success-bg text-bt-success',
    icon: <BrainCircuit className="h-4 w-4 shrink-0" aria-hidden="true" />,
  },
  local: {
    label: 'Local mode',
    description:
      'Vector extraction, PDF rendering, scale math, ledger review and export work offline. Add a Meta key in Settings to enable vision, sheet reading and copilot.',
    className: 'border-bt-info-border bg-bt-info-bg text-bt-info',
    icon: <Cpu className="h-4 w-4 shrink-0" aria-hidden="true" />,
  },
  offline: {
    label: 'Server offline',
    description:
      'The local backend is not responding. Start the BlueTrace server, then retry from Settings.',
    className: 'border-bt-offline-border bg-bt-offline-bg text-bt-offline',
    icon: <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
  },
};

export interface AiStatusPillProps {
  availability: AiAvailability;
  /** When provided the pill becomes a button that routes to Settings. */
  onOpenSettings?: () => void;
  /** Compact icon-only presentation for the narrowest headers. */
  compact?: boolean;
}

export const AiStatusPill: React.FC<AiStatusPillProps> = ({
  availability,
  onOpenSettings,
  compact = false,
}) => {
  const tone = TONE[availability];
  const base = `inline-flex min-h-10 items-center gap-2 rounded-md border px-2.5 text-xs font-medium ${tone.className}`;
  const content = (
    <>
      {tone.icon}
      <span className={compact ? 'sr-only' : 'hidden sm:inline'}>{tone.label}</span>
    </>
  );

  if (!onOpenSettings) {
    return (
      <span
        role="status"
        aria-label={`AI status: ${tone.label}. ${tone.description}`}
        title={`${tone.label}. ${tone.description}`}
        className={base}
      >
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenSettings}
      aria-label={`AI status: ${tone.label}. ${tone.description} Open settings.`}
      title={`${tone.label}. ${tone.description}`}
      className={`${base} transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bt-surface`}
    >
      {content}
    </button>
  );
};
