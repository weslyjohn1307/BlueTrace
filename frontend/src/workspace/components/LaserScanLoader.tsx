import { LoaderCircle } from 'lucide-react';

export const LaserScanLoader: React.FC = () => {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-bt-canvas select-none"
      data-testid="sheet-preview-loading"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-sm text-bt-text-secondary">
        <LoaderCircle className="h-4 w-4 animate-spin text-bt-brand" aria-hidden="true" />
        <span>Loading drawing page…</span>
      </div>
    </div>
  );
};
