import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/stix-two-text';
import '@fontsource/libre-franklin';
import '@fontsource/inconsolata';
import './styles/index.css';
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
