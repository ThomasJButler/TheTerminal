import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { App } from './App';
import { ALL_NODES, urlFor } from './fs/tree';
import { MODE_ROUTES, metaFor } from './terminal/interpret';

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

/** Every page there is: one per program, one per file and one per directory. */
export function routes(): { path: string; title: string; description: string }[] {
  const paths = [...new Set([...MODE_ROUTES, ...ALL_NODES.map(urlFor)])];
  return paths.map((path) => ({ path, ...metaFor(path) }));
}

export function notFound(): { html: string; title: string } {
  return { html: render('/__not-found__'), title: metaFor('/__not-found__').title };
}
