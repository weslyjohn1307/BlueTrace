import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/lora/400.css';
import '@fontsource/lora/500.css';
import '@fontsource/lora/600.css';
import '@fontsource/lora/700.css';
import '@fontsource/inconsolata/400.css';
import '@fontsource/inconsolata/500.css';
import '@fontsource/inconsolata/600.css';
import './styles/index.css';

try {
  const storedTheme = localStorage.getItem('bluetrace-theme');
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  document.documentElement.dataset.theme = storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : systemDark ? 'dark' : 'light';
} catch {
  document.documentElement.dataset.theme = 'light';
}

const root = createRoot(document.getElementById('root')!);
const githubPagesBuild = import.meta.env.VITE_GITHUB_PAGES === 'true';

root.render(
  <StrictMode>
    <main role="status" className="min-h-screen bg-bt-canvas p-6 font-sans text-bt-text-primary">
      Preparing BlueTraceAI…
    </main>
  </StrictMode>,
);

const mount = async () => {
  if (githubPagesBuild) {
    const { ShowcasePage } = await import('./modes/showcase/ShowcasePage');
    root.render(<StrictMode><ShowcasePage /></StrictMode>);
    return;
  }

  const { App } = await import('./app/App');
  root.render(<StrictMode><App /></StrictMode>);
};

void mount().catch((error: unknown) => {
  console.error('Unable to load BlueTraceAI.', error);
  root.render(
    <main role="alert" className="min-h-screen bg-bt-canvas p-6 font-sans text-bt-text-primary">
      BlueTraceAI could not load. Please refresh the page and try again.
    </main>,
  );
});
