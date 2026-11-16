import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// Latin subsets only. The bare entry points pull every script the family covers.
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/vt323/latin-400.css';
import './styles/globals.css';
import { App } from './App';

const root = document.getElementById('root')!;
const tree = (
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// Prerendered pages hydrate. createRoot would throw the server's markup away and rebuild it.
if (root.hasChildNodes()) hydrateRoot(root, tree);
else createRoot(root).render(tree);
