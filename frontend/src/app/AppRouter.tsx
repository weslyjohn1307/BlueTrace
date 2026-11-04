import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AlertOctagon } from 'lucide-react';
import { DemoApp } from '../modes/demo/DemoApp';
import { TakeoffWorkspace } from '../workspace/TakeoffWorkspace';
import { SettingsPage } from './SettingsPage';

const ShowcasePage = lazy(() => import('../modes/showcase/ShowcasePage').then((module) => ({ default: module.ShowcasePage })));

const NotFoundScreen: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] text-[#0F172A] p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center mb-4">
        <AlertOctagon className="w-8 h-8 text-rose-600" aria-hidden="true" />
      </div>
      <h1 className="font-heading text-2xl font-bold text-bt-text-primary mb-2">404 — Page Not Found</h1>
      <p className="text-sm text-slate-600 max-w-md mb-6 leading-relaxed">
        The requested BlueTraceAI route does not exist. Please return to the drawing workspace.
      </p>
    </div>
  );
};

export const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Single honest flow: upload → scan → ledger → copilot */}
        <Route path="/" element={<TakeoffWorkspace />} />
        <Route path="/new" element={<Navigate to="/" replace />} />
        <Route path="/workspace" element={<Navigate to="/" replace />} />
        <Route path="/live" element={<Navigate to="/" replace />} />
        <Route path="/settings" element={<SettingsPage />} />

        {/* Keep historic explainer URLs pointing to the current public story. */}
        <Route path="/story" element={<Navigate to="/showcase" replace />} />
        <Route path="/showcase" element={
          <Suspense fallback={<div className="min-h-screen bg-bt-canvas p-8 font-sans text-sm text-bt-text-secondary" role="status">Loading showcase…</div>}>
            <ShowcasePage />
          </Suspense>
        } />
        <Route path="/explorable" element={<Navigate to="/showcase" replace />} />
        <Route path="/how-it-works" element={<Navigate to="/showcase" replace />} />

        {/* Diagnostic / Demo */}
        <Route path="/demo" element={<DemoApp />} />
        <Route path="*" element={<NotFoundScreen />} />
      </Routes>
    </BrowserRouter>
  );
};
