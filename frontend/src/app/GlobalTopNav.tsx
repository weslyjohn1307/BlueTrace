import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { FileUp, FlaskConical, MoreHorizontal, Moon, RotateCcw, Settings, Sun } from 'lucide-react';
import { BrandIcon, BrandLockup } from '../components/brand/BrandAssets';
import { AiStatusPill, resolveAiAvailability } from '../components/AiStatusPill';
import { Tooltip } from '../components/Tooltip';
import { useTheme } from './ThemeContext';

export interface GlobalTopNavProps {
  /** Local backend reachable. `null` while the first health check is in flight. */
  backendOnline?: boolean | null;
  aiConfigured?: boolean;
  /** Set false while a package is being read, so the same file is not started twice. */
  fileActionsDisabled?: boolean;
  onLoadSample?: () => void;
  onNewAnalysis?: () => void;
  onFileSelect?: (file: File) => void;
}

const NAV_LINK =
  'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bt-surface';

export const GlobalTopNav: React.FC<GlobalTopNavProps> = ({
  backendOnline = null,
  aiConfigured = false,
  fileActionsDisabled = false,
  onLoadSample,
  onNewAnalysis,
  onFileSelect,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsTooltipDismissed, setSettingsTooltipDismissed] = useState(false);
  const [moreTooltipDismissed, setMoreTooltipDismissed] = useState(false);
  const isWorkspaceActive = path === '/' || path === '/new' || path === '/workspace' || path === '/settings';
  const isShowcaseActive = path === '/showcase';
  const availability = resolveAiAvailability(backendOnline, aiConfigured);
  const { theme, setPreference } = useTheme();

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header
      role="banner"
      className="flex h-14 shrink-0 select-none items-center justify-between border-b border-bt-border-subtle bg-bt-surface px-3"
    >
      <div className="flex min-w-0 items-center gap-5">
        <Link
          to="/"
          aria-label="BlueTrace workspace"
          className="flex items-center rounded-md text-bt-text-primary no-underline"
        >
          <BrandLockup theme={theme} size="sm" showDescriptor={false} />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-0.5 sm:flex">
          <Link
            to="/"
            aria-current={isWorkspaceActive ? 'page' : undefined}
            className={`${NAV_LINK} ${
              isWorkspaceActive
                ? 'bg-bt-panel text-bt-text-primary'
                : 'text-bt-text-secondary hover:bg-bt-panel/60 hover:text-bt-text-primary'
            }`}
          >
            <BrandIcon name="measure" size={14} />
            <span>Workspace</span>
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-1.5">
        <AiStatusPill availability={availability} onOpenSettings={() => navigate('/settings')} />

        <button type="button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={() => setPreference(theme === 'dark' ? 'light' : 'dark')} className="inline-flex h-10 w-10 items-center justify-center rounded-md text-bt-text-secondary transition-colors hover:bg-bt-panel hover:text-bt-text-primary">
          {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
        </button>

        <span
          className="group relative inline-flex"
          onMouseEnter={() => setSettingsTooltipDismissed(false)}
          onMouseLeave={() => setSettingsTooltipDismissed(false)}
          onFocusCapture={() => setSettingsTooltipDismissed(false)}
          onKeyDown={(event) => { if (event.key === 'Escape') setSettingsTooltipDismissed(true); }}
        >
          <Link
            to="/settings"
            aria-label="Open settings"
            aria-describedby="topnav-settings-tooltip"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-bt-text-secondary no-underline transition-colors hover:bg-bt-panel hover:text-bt-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bt-surface"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Tooltip id="topnav-settings-tooltip" visible={!settingsTooltipDismissed}>Settings</Tooltip>
        </span>

        {onFileSelect && (
          <>
            <button
              id="topnav-choose-pdf-btn"
              type="button"
              disabled={fileActionsDisabled}
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-bt-brand-solid px-3 text-sm font-medium text-bt-on-brand transition-colors hover:bg-bt-brand-solid-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bt-surface"
              title="Open a PDF drawing package"
            >
              <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Open PDF</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file && onFileSelect) onFileSelect(file);
                event.target.value = '';
              }}
            />
          </>
        )}

        <div
          className="group relative"
          ref={menuRef}
          onMouseEnter={() => setMoreTooltipDismissed(false)}
          onMouseLeave={() => setMoreTooltipDismissed(false)}
          onFocusCapture={() => setMoreTooltipDismissed(false)}
          onKeyDown={(event) => { if (event.key === 'Escape') setMoreTooltipDismissed(true); }}
        >
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More actions"
            aria-describedby={!menuOpen ? 'topnav-more-tooltip' : undefined}
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-bt-text-secondary transition-colors hover:bg-bt-panel hover:text-bt-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bt-surface"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
          {!menuOpen ? <Tooltip id="topnav-more-tooltip" align="end" visible={!moreTooltipDismissed}>More actions</Tooltip> : null}
          {menuOpen && (
            <div
              role="menu"
              aria-label="More actions"
              className="absolute right-0 top-9 z-50 w-52 rounded-lg border border-bt-border-strong bg-bt-surface-raised p-1 shadow-xl"
            >
              {onNewAnalysis && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onNewAnalysis();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-bt-text-primary transition-colors hover:bg-bt-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-bt-text-secondary" aria-hidden="true" />
                  New analysis
                </button>
              )}
              {onLoadSample && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={fileActionsDisabled}
                  onClick={() => {
                    setMenuOpen(false);
                    onLoadSample();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-bt-text-primary transition-colors hover:bg-bt-panel disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus"
                >
                  <FlaskConical className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                  Load sample sheet
                </button>
              )}
              <Link
                to="/showcase"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                aria-current={isShowcaseActive ? 'page' : undefined}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-bt-text-primary no-underline transition-colors hover:bg-bt-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus"
              >
                <BrandIcon name="layers" size={14} />
                Showcase
              </Link>
              <Link
                to="/settings"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-bt-text-primary no-underline transition-colors hover:bg-bt-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus"
              >
                <Settings className="h-3.5 w-3.5 text-bt-text-secondary" aria-hidden="true" />
                Settings
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
