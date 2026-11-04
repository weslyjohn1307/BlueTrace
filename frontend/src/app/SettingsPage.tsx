import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowLeft,
  Check,
  CloudOff,
  Cpu,
  KeyRound,
  LoaderCircle,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Monitor,
  Moon,
  Sun,
} from 'lucide-react';
import { apiClient, ApiError } from '../api/client';
import type { HealthResponse } from '../api/contracts';
import { BrandLockup } from '../components/brand/BrandAssets';
import { resolveAiAvailability, AiStatusPill } from '../components/AiStatusPill';
import { useTheme, type ThemePreference } from './ThemeContext';

type HealthState = 'checking' | 'online' | 'offline';

const LOCAL_CAPABILITIES = [
  'PDF page rendering and sheet navigation',
  'Vector linework extraction and centerline tracing',
  'Scale math, two-point calibration and fail-closed review',
  'Takeoff ledger, corrections, QA review and export',
];

const META_CAPABILITIES = [
  'Sheet audit: title block, discipline and sheet identity',
  'Hover OCR for duct and equipment dimensions',
  'Legend and symbol reading on plan sheets',
  'Equipment schedule parsing',
  'Grounded copilot answers about the open package',
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-bt-border-subtle py-6 first:border-t-0 first:pt-0">
      <h2 className="text-sm font-semibold text-bt-text-primary">{title}</h2>
      {description ? (
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-bt-text-secondary">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export const SettingsPage: React.FC = () => {
  const { preference, theme, setPreference } = useTheme();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthState, setHealthState] = useState<HealthState>('checking');
  const [healthError, setHealthError] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keySaved, setKeySaved] = useState(false);

  const refreshHealth = useCallback(async () => {
    setHealthState('checking');
    setHealthError(null);
    try {
      const result = await apiClient.getHealth();
      setHealth(result);
      setHealthState(result.status === 'online' ? 'online' : 'offline');
    } catch (err: unknown) {
      setHealth(null);
      setHealthState('offline');
      setHealthError(
        err instanceof ApiError
          ? err.message
          : 'The local backend did not respond. Start the BlueTrace server and retry.'
      );
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  const configured = Boolean(health?.meta_model_api_configured);
  const availability = resolveAiAvailability(
    healthState === 'checking' ? null : healthState === 'online',
    configured
  );

  const saveKey = async () => {
    if (busy || !keyInput.trim()) return;
    setBusy(true);
    setKeyError(null);
    setKeySaved(false);
    try {
      const response = await apiClient.configureByok(keyInput.trim());
      setMaskedKey(response.masked_key ?? null);
      setKeyInput('');
      setKeySaved(true);
      await refreshHealth();
    } catch (err: unknown) {
      setKeyError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'The key could not be configured.'
      );
    } finally {
      setBusy(false);
    }
  };

  const clearKey = async () => {
    if (busy) return;
    setBusy(true);
    setKeyError(null);
    setKeySaved(false);
    try {
      await apiClient.clearByok();
      setMaskedKey(null);
      await refreshHealth();
    } catch (err: unknown) {
      setKeyError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'The key could not be cleared.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bt-app settings-page min-h-screen bg-bt-canvas text-bt-text-primary">
      <header className="sticky top-0 z-20 border-b border-bt-border-subtle bg-bt-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <BrandLockup theme={theme} size="sm" showDescriptor={false} />
            <span className="text-xs text-bt-text-tertiary">Settings</span>
          </div>
          <div className="flex items-center gap-2">
            <AiStatusPill availability={availability} />
            <Link
              to="/"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-bt-border-strong px-2.5 text-xs text-bt-text-primary no-underline transition-colors hover:bg-bt-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to workspace
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-xl font-semibold tracking-tight text-bt-text-primary">Settings</h1>
        <p className="mt-1 text-[13px] text-bt-text-secondary">
          Connection, key lifetime and what runs on this machine.
        </p>

        <div className="mt-8">
          <Section title="Appearance" description="Choose how BlueTrace looks on this device.">
            <div role="radiogroup" aria-label="Color theme" className="grid max-w-xl grid-cols-3 gap-2">
              {([
                ['system', 'System', Monitor],
                ['light', 'Light', Sun],
                ['dark', 'Dark', Moon],
              ] as const).map(([value, label, Icon]) => (
                <button key={value} type="button" role="radio" aria-checked={preference === value}
                  onClick={() => setPreference(value as ThemePreference)}
                  className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm transition-colors ${preference === value ? 'border-bt-brand bg-bt-brand-soft text-bt-brand' : 'border-bt-border-subtle bg-bt-surface text-bt-text-secondary hover:bg-bt-panel'}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />{label}
                </button>
              ))}
            </div>
          </Section>

          <Section
            title="AI connection"
            description="Meta models handle visual interpretation, OCR, table reading and copilot reasoning. The key you add here lives in server memory for this session only."
          >
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-bt-border-subtle bg-bt-surface/60 px-3 py-2.5">
              {healthState === 'checking' ? (
                <LoaderCircle className="h-4 w-4 animate-spin text-bt-text-secondary" aria-hidden="true" />
              ) : healthState === 'online' ? (
                <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              ) : (
                <CloudOff className="h-4 w-4 text-amber-400" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-bt-text-primary">
                  {healthState === 'checking'
                    ? 'Checking the local backend'
                    : healthState === 'online'
                      ? 'Local backend connected'
                      : 'Local backend unavailable'}
                </p>
                <p className="text-xs text-bt-text-secondary">
                  {healthState === 'online'
                    ? configured
                      ? 'AI features are available for this session.'
                      : 'AI features are off. Local extraction and review still work.'
                    : healthError ?? 'Start the BlueTrace server to enable analysis.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshHealth()}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-bt-border-strong px-2.5 text-xs text-bt-text-primary transition-colors hover:bg-bt-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-bt-border-subtle bg-bt-surface/40 p-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-bt-brand" aria-hidden="true" />
                <h3 className="text-[13px] font-medium text-bt-text-primary">Meta API key</h3>
                {configured ? (
                  <span className="rounded border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-bt-success">
                    Configured{maskedKey ? ` (${maskedKey})` : ''}
                  </span>
                ) : (
                  <span className="rounded border border-bt-border-strong px-1.5 py-0.5 text-[11px] text-bt-text-secondary">
                    Not configured
                  </span>
                )}
              </div>

              {configured ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void clearKey()}
                    disabled={busy}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 text-xs text-rose-200 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Clear key for this session
                  </button>
                  <span className="text-xs text-bt-text-tertiary">
                    The key is discarded when the server process stops.
                  </span>
                </div>
              ) : (
                <div className="mt-3">
                  <label htmlFor="meta-api-key" className="text-xs font-medium text-bt-text-secondary">
                    Paste a key to enable vision, sheet reading and copilot
                  </label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <input
                      id="meta-api-key"
                      type="password"
                      value={keyInput}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => {
                        setKeyInput(event.target.value);
                        if (keyError) setKeyError(null);
                        if (keySaved) setKeySaved(false);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void saveKey();
                      }}
                      aria-invalid={keyError !== null}
                      aria-describedby={keyError ? 'meta-key-error' : 'meta-key-help'}
                      placeholder="API key"
                      className="h-9 min-w-56 flex-1 rounded-md border border-bt-border-strong bg-bt-inset px-2.5 font-mono text-xs text-bt-text-primary outline-none placeholder:text-bt-text-tertiary focus:border-[#37C6FF]"
                    />
                    <button
                      type="button"
                      onClick={() => void saveKey()}
                      disabled={busy || keyInput.trim() === ''}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#005BFF] px-3 text-xs font-medium text-bt-on-brand transition-colors hover:bg-[#0049CC] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus"
                    >
                      {busy ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Save for this session
                    </button>
                  </div>
                  <p id="meta-key-help" className="mt-2 flex items-start gap-1.5 text-xs text-bt-text-tertiary">
                    <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    Stored in server memory only. Never written to browser storage, logs or source.
                  </p>
                  {keySaved ? (
                    <p className="mt-2 text-xs text-bt-success" role="status">
                      Key configured for this session.
                    </p>
                  ) : null}
                  {keyError ? (
                    <p id="meta-key-error" role="alert" className="mt-2 text-xs text-rose-300">
                      {keyError}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </Section>

          <Section
            title="What runs where"
            description="Meta interprets imagery and text. Local code owns geometry and physical measurement, so a drawing never depends on a model for a length."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-bt-border-subtle bg-bt-surface/40 p-4">
                <div className="flex items-center gap-2 text-[13px] font-medium text-bt-text-primary">
                  <Cpu className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  On this machine
                </div>
                <ul className="mt-2 space-y-1.5 text-xs text-bt-text-secondary">
                  {LOCAL_CAPABILITIES.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-bt-border-subtle bg-bt-surface/40 p-4">
                <div className="flex items-center gap-2 text-[13px] font-medium text-bt-text-primary">
                  <CloudOff className="h-4 w-4 text-bt-brand" aria-hidden="true" />
                  Meta services
                </div>
                <ul className="mt-2 space-y-1.5 text-xs text-bt-text-secondary">
                  {META_CAPABILITIES.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#37C6FF]" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>

          <Section title="Drawings and privacy">
            <ul className="space-y-2 text-[13px] leading-relaxed text-bt-text-secondary">
              <li>
                Full drawing files stay in the local BlueTrace data directory. The app does not upload the
                complete PDF to Meta.
              </li>
              <li>
                When you run a Meta-backed action, the page image, crop or extracted text required for that
                action is sent to the Meta Model API.
              </li>
              <li>
                No API key or drawing content is written to browser storage. The active project reference is
                the only value kept locally.
              </li>
            </ul>
          </Section>

          <Section title="About">
            <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-[160px_minmax(0,1fr)]">
              <dt className="text-bt-text-tertiary">Backend</dt>
              <dd className="text-bt-text-primary">{health?.version ?? 'Unavailable'}</dd>
              <dt className="text-bt-text-tertiary">Service</dt>
              <dd className="text-bt-text-primary">{health?.service ?? 'BlueTraceAI API'}</dd>
              <dt className="text-bt-text-tertiary">Models</dt>
              <dd className="text-bt-text-primary">
                {health?.models && Object.keys(health.models).length > 0 ? (
                  <ul className="space-y-0.5 font-mono text-xs">
                    {Object.entries(health.models).map(([role, model]) => (
                      <li key={role}>
                        <span className="text-bt-text-tertiary">{role}: </span>
                        {model}
                      </li>
                    ))}
                  </ul>
                ) : (
                  'Reported by the backend when connected'
                )}
              </dd>
            </dl>
          </Section>
        </div>
      </main>
    </div>
  );
};
