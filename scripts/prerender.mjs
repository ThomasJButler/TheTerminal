/**
 * Renders every file and directory on the machine to real HTML.
 *
 * The site is a terminal, which is exactly the kind of thing that ships an empty <div> to
 * anyone not running JavaScript. This is what stops that: crawlers, link previews and
 * language models fetch HTML and do not execute scripts, so each page's words are written
 * into its own file at build time, and the browser hydrates on top.
 *
 * The build fails if any page comes out with too little text. A component that silently
 * renders nothing on the server is otherwise invisible until someone notices the site has
 * vanished from search.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SITE = (process.env.SITE_URL ?? 'https://thomasjbutler.github.io').replace(/\/$/, '');
const BASE = (process.env.BASE_PATH ?? '/').replace(/\/$/, '');
const MIN_TEXT = 200;

const { render, routes, notFound } = await import(pathToFileURL(join(process.cwd(), '.ssr/entry-server.js')).href);
const template = readFileSync('dist/index.html', 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function page(html, title, description, path) {
  const url = `${SITE}${BASE}${path === '/' ? '/' : path}`;
  const head = [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:image" content="${SITE}${BASE}/og-image.png" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join('\n    ');
  return template
    .replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace('<!--head-->', head)
    .replace('<!--app-->', html);
}

const all = routes();
const thin = [];
for (const route of all) {
  const html = render(route.path);
  const length = textOf(html).length;
  if (length < MIN_TEXT) thin.push(`${route.path} (${length} chars)`);
  const file = route.path === '/' ? 'dist/index.html' : `dist${route.path}/index.html`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, page(html, route.title, route.description, route.path));
}
if (thin.length) {
  console.error(`prerender: these pages rendered under ${MIN_TEXT} characters of text:\n  ${thin.join('\n  ')}`);
  process.exit(1);
}

const missing = notFound();
writeFileSync('dist/404.html', page(missing.html, missing.title, 'No such file on this machine.', '/404'));

writeFileSync(
  'dist/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${all
    // Dotfiles are for people who go looking, not for search results.
    .filter((r) => !r.path.includes('/.'))
    .map((r) => `  <url><loc>${SITE}${BASE}${r.path === '/' ? '/' : r.path}</loc></url>`)
    .join('\n')}\n</urlset>\n`,
);
writeFileSync('dist/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}${BASE}/sitemap.xml\n`);

rmSync('.ssr', { recursive: true, force: true });
console.log(`prerender: ${all.length} pages, 404, sitemap`);
