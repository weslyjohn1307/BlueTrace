import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/stix-two-text';
import '@fontsource/libre-franklin';
import '@fontsource/inconsolata';
import '../../styles/index.css';
import { ShowcasePage } from './ShowcasePage';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Showcase root element was not found.');

createRoot(rootElement).render(
  <StrictMode>
    <ShowcasePage />
  </StrictMode>,
);
