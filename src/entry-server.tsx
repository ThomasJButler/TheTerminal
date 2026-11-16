import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { App, titleFor } from './App';
import { ALL_NODES, nodeForUrl, urlFor } from './fs/tree';

/**
 * The prerender's entry. It must not import main.tsx, which carries CSS side-effect imports
 * that Node cannot parse.
 */
export function render(url: string): string {
  return renderToString(
    <StrictMode>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </StrictMode>,
  );
}

/** Every page there is: one per file and one per directory. */
export function routes(): { path: string; title: string; description: string }[] {
  const seen = new Set<string>();
  const out: { path: string; title: string; description: string }[] = [];
  for (const node of ALL_NODES) {
    const path = urlFor(node);
    if (seen.has(path)) continue;
    seen.add(path);
    const shown = nodeForUrl(path) ?? node;
    out.push({ path, title: titleFor(path), description: shown.note });
  }
  return out;
}

export function notFound(): { html: string; title: string } {
  return { html: render('/__not-found__'), title: titleFor('/__not-found__') };
}
