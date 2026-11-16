# TJB-100

Tom Butler's site, as a terminal. Version 6: the personal site and the commercial site merged
into one machine.

It opens on a 3D terminal in the dark with rain falling behind it. Press a key and you sit
down at it. From there everything is a file: every project, the agency work and its clients,
the skills, the certificates, the year-by-year log, the blog, the nine earlier versions of
the site. Nothing is laid out for you. You `ls`, you `cd`, you `cat`, you `grep`, and some
of it only shows up with `ls -a`.

The reference is the DEC VT100 of 1978 (80 columns, a detachable keyboard, a 132 column
mode, a SET-UP key), wearing the Matrix theme the site has had since version 2.

## Run it

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

```bash
npm test
```

`npm run build` does three things: the client build, a server build, then
`scripts/prerender.mjs`, which writes one real HTML file per file and directory on the
machine. `npm run typecheck` is separate on purpose, so a stray type error cannot take a
live URL down.

## How it fits together

| Path | What it is |
| --- | --- |
| `src/content/` | The words. `site.ts` is the hand-written copy; `projects.ts`, `assets.ts`, `timeline.ts` and `blog/` came from the personal site unchanged; `versions.ts` came from Version TimeTravel. |
| `src/fs/` | The virtual filesystem. `tree.ts` builds it from the content, `md.ts` turns markdown into blocks, `types.ts` is the block model everything prints. |
| `src/terminal/commands.ts` | The interpreter. Pure: a line and a context in, blocks and effects out. Tested in `commands.test.ts`. |
| `src/terminal/Blocks.tsx` | Renders blocks as real DOM text. |
| `src/terminal/Overlays.tsx` | The shadcn dialogs: FIND (the palette), MAIL, and the plate viewer. |
| `src/scene/Scene.ts` | The three.js layer. One instanced, shader-driven draw call for the rain; edge lines for the case. Loaded as its own chunk. |
| `src/App.tsx` | The machine: session state, the prompt, the PF keys, the intro. |
| `scripts/prerender.mjs` | Every page to HTML, plus `404.html`, `sitemap.xml` and `robots.txt`. |

## Adding things

- **A project:** add it to `src/content/projects.ts`. It becomes `~/projects/<id>.md`, a
  URL, a prerendered page, a FIND result and a `grep` target with no other change.
- **A blog post:** drop a markdown file in `src/content/blog/` and add its title and date to
  `BLOG_META` in `src/content/site.ts`.
- **A command:** add a `case` in `exec()` in `src/terminal/commands.ts`. Put it in `HELP`
  if people should be told about it, and leave it out if they should find it.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on a push to `main`. It
asks Pages where the site will live and passes that as `BASE_PATH`, so the same build works
at a domain root and under `/<repo>/`. To build for a sub-path by hand:

```bash
BASE_PATH=/tjb-vt100/ SITE_URL=https://thomasjbutler.github.io npm run build
```

## Things that are deliberate

- **The terminal is text, not a canvas.** Screen readers, find-in-page, copy and paste, and
  crawlers all work. The 3D scene is decoration behind it and the page never depends on it:
  no WebGL, or a reduced-motion preference, and you get the terminal straight away.
- **Every file has a URL.** `cat projects/sanctuary.md` puts you at `/projects/sanctuary`,
  and that URL opens on that file for the next person.
- **The intro only plays on a cold visit to `/`.** A deep link from a CV goes straight to
  the file it names.
- **Hidden files stay out of the sitemap and out of FIND** until you have read them.
