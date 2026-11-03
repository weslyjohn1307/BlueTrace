import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/stix-two-text';
import '@fontsource/libre-franklin';
import '@fontsource/inconsolata';
import './styles/index.css';

const root = createRoot(document.getElementById('root')!);
const githubPagesBuild = import.meta.env.VITE_GITHUB_PAGES === 'true';

root.render(
  <StrictMode>
    <main role="status" style={{ padding: 24, fontFamily: 'sans-serif' }}>
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
    <main role="alert" style={{ padding: 24, fontFamily: 'sans-serif' }}>
      BlueTraceAI could not load. Please refresh the page and try again.
    </main>,
  );
});
