# TJB-100

Tom Butler's site, as a terminal. Version 6: the personal site and the commercial site merged
into one machine, and the machine turned into a demonstration of what he builds.

It opens on a 3D terminal in the dark with rain falling behind it, and asks the one question
a bulletin board always asked first: SOUND? (Y/N). Answer, and you sit down at it. A modem
connects, and the main menu prints down the screen.

Everything after that happens in the terminal. The menu is a prompt: type a number, a name,
or any command.

| | Program | What it demonstrates |
| --- | --- | --- |
| 1 | **TERMINAL** | The shell. Every project, client, skill and blog post is a file. `ls`, `cd`, `cat`, `grep`, and some of it only shows up with `ls -a`. |
| 2 | **OPERATOR** | An agent that answers questions about Tom from the files, shows its working, runs commands for you, and can listen and talk. There is no language model in it. |
| 3 | **ARCADE** | Two games drawn in characters: TRACE and DECODE. |
| 4 | **ADVENTURE** | STANDING START, a text adventure in ten rooms about how he got here. |
| 5 | **DEMO** | Three.js, one colour, no models, with a tune. |
| 6 | **TOUR** | The machine types for a minute and shows the highlights. |
| 7 | **WHAT I BUILD** | Eight kinds of thing, each with something to check. |

The reference is the DEC VT100 of 1978 (80 columns, a detachable keyboard, a 132 column
mode, a SET-UP key, a keyclick, a bell, a power-on self-test), wearing the Matrix theme the
site has had since version 2.

## Run it

```bash
bun install
```

```bash
bun run dev
```

```bash
bun run build
```

```bash
bun run test
```

```bash
python3 scripts/serve-pages.py
```

`bun run build` does three things: the client build, a server build, then
`scripts/prerender.mjs`, which writes one real HTML file per program, file and directory.
`bun run typecheck` is separate on purpose, so a stray type error cannot take a live URL
down.

Check a build with `scripts/serve-pages.py`, not `vite preview`. Preview answers every
missing path with `index.html`, which hides exactly the 404s worth checking. The script
serves `dist/` the way GitHub Pages does.

## How it fits together

| Path | What it is |
| --- | --- |
| `src/content/` | The words. `site.ts` is the hand-written copy, the menu and `build.txt`. `projects.ts`, `assets.ts`, `timeline.ts` and `blog/` came from the personal site unchanged; `versions.ts` came from Version TimeTravel. |
| `src/fs/` | The virtual filesystem. `tree.ts` builds it from the content, `md.ts` turns markdown into blocks, `types.ts` is the block model everything prints. |
| `src/terminal/commands.ts` | The shell. Pure: a line and a context in, blocks and effects out. |
| `src/terminal/interpret.ts` | One prompt, four interpreters: the menu, the shell, the operator and the adventure. Also which address opens on which screen. |
| `src/programs/operator.ts` | The agent: a router, a BM25 index over the files, and a confidence check. `operator.test.ts` is its eval set. |
| `src/programs/adventure.ts` | The adventure: rooms, things and a parser, as a pure state machine. |
| `src/arcade/` | A character-cell screen (`engine.ts`) and the two games written on it. |
| `src/scene/Scene.ts` | The three.js layer: the machine, the rain and the demo. Loaded as its own chunk. |
| `src/machine/` | `useMachine.ts` is all the state. `sound.ts` synthesises every sound. `speech.ts` wraps the browser's speech APIs. |
| `src/terminal/Terminal.tsx`, `Blocks.tsx`, `Overlays.tsx` | What draws it. The overlays are the shadcn dialogs: FIND, MAIL and the plate viewer. |
| `scripts/prerender.mjs` | Every page to HTML, plus `404.html`, `sitemap.xml` and `robots.txt`. |

## Adding things

- **A project:** add it to `src/content/projects.ts`. It becomes `~/projects/<id>.md`, a
  URL, a prerendered page, a FIND result, something the operator can answer about and a
  `grep` target, with no other change.
- **A blog post:** drop a markdown file in `src/content/blog/` and add its title and date to
  `BLOG_META` in `src/content/site.ts`.
- **A command:** add a `case` in `exec()` in `src/terminal/commands.ts`. Put it in `HELP`
  if people should be told about it, and leave it out if they should find it.
- **A question the operator should get right:** add it to the eval in
  `src/programs/operator.test.ts` first, with the file a good answer has to come from, and
  then make it pass.
- **A game:** write a `GameFactory` in `src/arcade/`, list it in `games.ts`.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on a push to `main`. It
asks Pages where the site will live and passes that as `BASE_PATH`, so the same build works
at a domain root and under `/<repo>/`. To build for a sub-path by hand:

```bash
BASE_PATH=/tjb-vt100/ SITE_URL=https://thomasjbutler.github.io bun run build
```

## Things that are deliberate

- **The terminal is text, not a canvas.** Screen readers, find-in-page, copy and paste, and
  crawlers all work. The 3D scene is decoration behind it and the page never depends on it:
  no WebGL, or a reduced-motion preference, and you get the terminal straight away.
- **Every program and every file has a URL.** `cat projects/sanctuary.md` puts you at
  `/projects/sanctuary`, and that URL opens on that file for the next person.
- **The intro only plays on a cold visit to `/`.** A deep link from a CV goes straight to
  the file it names.
- **Sound is off until someone says yes.** There are no audio files: the keyclick, the bell,
  the modem and the tune are oscillators, so sound costs nothing when it is off.
- **The operator has no model in it.** It can only quote the files, so it cannot invent
  anything, and when the evidence is thin it says so. Speech recognition is the browser's:
  in Chrome and Safari that can mean audio goes to Google or Apple, and it says that before
  it listens.
- **Hidden files stay out of the sitemap and out of FIND** until you have read them.
- **The adventure's prose is a draft.** Every fact in it is from Tom's own copy; the
  furniture around the facts is invented and wants rewriting in his voice.
