import React from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';

export type ConnectionState = 'connected' | 'checking' | 'unavailable';

export interface ConnectionStatusProps {
  state: ConnectionState;
  version?: string;
  errorMessage?: string;
  onRetry?: () => void;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  state,
  version,
  errorMessage,
  onRetry,
}) => {
  if (state === 'checking') {
    return (
      <div 
        role="status" 
        aria-live="polite"
        className="inline-flex items-center space-x-1.5 text-xs text-slate-600 font-mono"
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" aria-hidden="true" />
        <span>Checking connection</span>
      </div>
    );
  }

  if (state === 'connected') {
    return (
      <div 
        role="status" 
        aria-live="polite"
        className="inline-flex items-center space-x-1.5 text-xs text-emerald-700 font-mono"
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
        <span className="font-medium">Connected</span>
        {version && <span className="text-slate-400 font-normal">({version})</span>}
      </div>
    );
  }

  return (
    <div 
      role="alert" 
      aria-live="assertive"
      className="inline-flex items-center space-x-2 text-xs text-rose-700 font-mono"
    >
      <AlertCircle className="w-3.5 h-3.5 text-rose-600" aria-hidden="true" />
      <span className="font-medium">Backend unavailable</span>
      {errorMessage && (
        <span className="text-slate-500 max-w-[200px] truncate" title={errorMessage}>
          ({errorMessage})
        </span>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          type="button"
          aria-label="Retry connecting to backend"
          className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 transition-colors cursor-pointer text-[11px]"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
};
