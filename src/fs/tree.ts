import { projects, categoryLabel, type Project } from '@/content/projects';
import { timelineData } from '@/content/timeline';
import { versions } from '@/content/versions';
import { CASE_STUDY } from '@/content/case-study';
import {
  BEFORE, BIO, BLOG_META, BUILD, CERTS, CLIENTS, FUELIUS, INDEPENDENT, INTERESTS, LINKS, LOCATION,
  MACHINE, NOW, ROLE, SKILL_DEPTH, USE_NOW, USE_NOW_ALSO, WHY, WORKED_WITH,
} from '@/content/site';
import { inl, mdBlocks, p } from './md';
import type { Block, DirNode, FileNode, FsNode, Inline } from './types';

/**
 * The filesystem. Built once at module load from the content modules, so adding a project
 * or a blog post adds a file here with no further wiring: the route, the prerendered page,
 * the palette entry, tab completion and `grep` all derive from this tree.
 */

const posts = import.meta.glob<string>('../content/blog/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const h1 = (text: string): Block => ({ k: 'h', level: 1, text });
const h2 = (text: string): Block => ({ k: 'h', level: 2, text });
const text = (s: string): Inline[] => [{ t: 'text', text: s }];
const ext = (href: string, label?: string): Inline[] => [
  { t: 'link', href, text: label ?? href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') },
];

function file(
  dir: string,
  name: string,
  title: string,
  note: string,
  blocks: () => Block[],
  hidden = false,
): FileNode {
  return { kind: 'file', name, path: `${dir}/${name}`, title, note, hidden, blocks };
}

function dir(parent: string, name: string, title: string, note: string, hidden = false) {
  const path = `${parent}/${name}`;
  const node: DirNode = { kind: 'dir', name, path, title, note, hidden, children: [] };
  return { path, node };
}

/* ─── ~/projects ─── */

const STATUS: Record<NonNullable<Project['status']>, string> = {
  completed: 'SHIPPED',
  'in-progress': 'IN PROGRESS',
  'coming-soon': 'COMING SOON',
};

function projectBlocks(project: Project): Block[] {
  const out: Block[] = [h1(project.name), p(project.description)];

  const rows: { key: string; inl: Inline[] }[] = [
    { key: 'STATUS', inl: text(project.status ? STATUS[project.status] : 'SHIPPED') },
    { key: 'KIND', inl: text(categoryLabel[project.category]) },
    { key: 'STACK', inl: text(project.topics.join(' · ')) },
  ];
  const { demo, github, video, waitlist, company } = project.links;
  if (demo) rows.push({ key: 'LIVE', inl: ext(demo) });
  if (github) rows.push({ key: 'SOURCE', inl: ext(github) });
  if (video) rows.push({ key: 'VIDEO', inl: ext(video) });
  if (waitlist) rows.push({ key: 'WAITLIST', inl: ext(waitlist) });
  if (company) rows.push({ key: 'COMPANY', inl: ext(company) });
  out.push({ k: 'kv', rows });

  if (project.longDescription) out.push(p(project.longDescription));
  if (project.highlights?.length) {
    out.push(h2('Highlights'), { k: 'list', items: project.highlights.map(text) });
  }

  const shots = [project.images?.cover, ...(project.images?.gallery ?? [])].filter(
    (src): src is string => Boolean(src),
  );
  if (shots.length) {
    out.push(h2('Plates'), {
      k: 'img',
      images: shots.map((src, i) => ({ src, alt: `${project.name}, screenshot ${i + 1} of ${shots.length}` })),
    });
  }

  for (const clip of project.videos ?? []) {
    const src = typeof clip === 'string' ? clip : clip.src;
    const poster = typeof clip === 'string' ? undefined : clip.poster;
    out.push({ k: 'video', src, poster, caption: `${project.name} in motion` });
  }

  const hood = project.underTheHood;
  if (hood) {
    out.push(h2('Under the hood'));
    if (hood.loop) out.push({ k: 'video', src: hood.loop.src, poster: hood.loop.poster, caption: hood.loop.caption });
    for (const part of [hood.diagram, hood.wireframe]) {
      if (!part) continue;
      out.push({ k: 'img', images: [{ src: part.src, alt: part.caption }] }, p(part.caption, true));
    }
  }

  if (project.games?.length) {
    out.push(h2('The games'), {
      k: 'img',
      images: project.games.map((game) => ({ src: game.src, alt: game.title })),
    });
  }

  if (project.id === CASE_STUDY.projectId) {
    out.push(
      { k: 'rule' },
      h2(`Case study: ${CASE_STUDY.title}`),
      p(CASE_STUDY.subtitle),
      h2('The problem'),
      ...CASE_STUDY.problem.map((s) => p(s)),
      h2('The approach'),
      ...CASE_STUDY.approach.map((s) => p(s)),
      h2('Architecture'),
      { k: 'kv', rows: CASE_STUDY.architecture.map((a) => ({ key: a.step.toUpperCase(), inl: text(a.detail) })) },
      h2('What it proves'),
      { k: 'list', items: CASE_STUDY.proves.map(text) },
      h2('Provenance'),
      p(CASE_STUDY.provenance),
    );
  }
  return out;
}

/* ─── ~/journey ─── */

function journeyFiles(parent: string): FileNode[] {
  const years = [...new Set(timelineData.map((e) => e.year))].sort((a, b) => a - b);
  const before = file(parent, 'before.log', 'Before the first line of code', 'cricket, diving, the DWP', () => [
    h1('Before the first line of code'),
    ...BEFORE.flatMap((b) => [h2(`${b.era} · ${b.title}`), p(b.text)]),
  ]);
  return [
    before,
    ...years.map((year) => {
      const entries = timelineData
        .filter((e) => e.year === year)
        .sort((a, b) => a.month - b.month || a.id - b.id);
      return file(parent, `${year}.log`, `${year}: the log`, `${entries.length} entries`, () => [
        h1(`${year}`),
        ...entries.flatMap((e): Block[] => [
          h2(`${e.date} · ${e.title}`),
          p(e.institution, true),
          p(e.description),
          ...(e.achievements.length ? [{ k: 'list', items: e.achievements.map(text) } as Block] : []),
          ...(e.links?.length
            ? [{ k: 'kv', rows: e.links.map((l) => ({ key: 'LINK', inl: ext(l.href, l.label) })) } as Block]
            : []),
        ]),
      ]);
    }),
  ];
}

/* ─── The tree ─── */

function build(): DirNode {
  const root: DirNode = { kind: 'dir', name: '~', path: '~', title: 'Home', note: 'home', hidden: false, children: [] };

  const projectsDir = dir('~', 'projects', 'Projects', 'everything built, one file each');
  projectsDir.node.children = projects.map((project) =>
    file(projectsDir.path, `${project.id}.md`, project.name, project.description, () => projectBlocks(project)),
  );

  const workDir = dir('~', 'work', 'Work', 'the paid side: agency, clients, now');
  workDir.node.children = [
    file(workDir.path, 'levocell.txt', 'Levocell', 'where I work now', () => [
      h1('Levocell'),
      { k: 'kv', rows: [
        { key: 'ROLE', inl: text(ROLE) },
        { key: 'SINCE', inl: text('September 2026') },
        { key: 'WHERE', inl: text('Buckinghamshire') },
      ] },
      p(NOW[0]),
    ]),
    file(workDir.path, 'independent.txt', 'Independent work', 'December 2024 to August 2026, solo', () => [
      h1('Independent work'),
      { k: 'kv', rows: [{ key: 'DATES', inl: text(INDEPENDENT.dates) }] },
      ...INDEPENDENT.body.map((s) => p(s)),
      p('The projects are in `projects/`. Start with `projects/offshore-property-map.md` or `projects/sanctuary.md`.'),
    ]),
    file(workDir.path, 'fuelius.txt', 'Fuelius', 'the agency years, 2023-24', () => [
      h1('Fuelius'),
      { k: 'kv', rows: [
        { key: 'ROLE', inl: text(FUELIUS.role) },
        { key: 'WHERE', inl: text(FUELIUS.where) },
        { key: 'DATES', inl: text(FUELIUS.dates) },
        { key: 'STACK', inl: text(FUELIUS.stack.join(' · ')) },
      ] },
      ...FUELIUS.body.map((s) => p(s)),
      p('Who the work was for: `work/clients.txt`.'),
    ]),
    file(workDir.path, 'clients.txt', 'Clients', 'twelve named clients', () => [
      h1('Clients'),
      p(`All of this was done at Fuelius, ${FUELIUS.dates}. Website development for each.`),
      { k: 'list', items: CLIENTS.map(text) },
      { k: 'kv', rows: [{ key: 'WRITE-UP', inl: ext(LINKS.agencyShowcase, 'Web Agency Showcase (Notion)') }] },
    ]),
  ];

  const skillsDir = dir('~', 'skills', 'Skills', 'what I use, and how deep it goes');
  skillsDir.node.children = [
    file(skillsDir.path, 'stack.txt', 'Stack', 'what I reach for daily', () => [
      h1('Stack'),
      h2('What I use now'),
      p(USE_NOW.join(' · ')),
      p(`Also daily: ${USE_NOW_ALSO.join(', ')}.`, true),
      h2('Also worked with'),
      p(WORKED_WITH.join(' · ')),
      p("Solid and happy to be asked about. I just don't reach for them day to day.", true),
    ]),
    file(skillsDir.path, 'depth.txt', 'Depth', 'what I would be happy to be interviewed on', () => [
      h1('Depth'),
      p("What I'd be happy to be interviewed on, and roughly how deep it goes."),
      ...SKILL_DEPTH.flatMap((s): Block[] => [h2(s.title), p(s.level.toUpperCase(), true), p(s.text)]),
    ]),
    file(skillsDir.path, 'certificates.txt', 'Certificates', `${CERTS.length} courses and qualifications`, () => [
      h1('Certificates'),
      ...CERTS.flatMap((c): Block[] => [h2(c.title), p(`${c.by} · ${c.when}`, true), p(c.text)]),
    ]),
  ];

  const journeyDir = dir('~', 'journey', 'Journey', 'the log, year by year');
  journeyDir.node.children = journeyFiles(journeyDir.path);

  const blogDir = dir('~', 'blog', 'Blog', 'writing on AI and human-first tech');
  blogDir.node.children = Object.entries(posts)
    .map(([key, raw]) => {
      const slug = key.split('/').pop()!.replace(/\.md$/, '');
      const meta = BLOG_META[slug] ?? { title: slug, excerpt: '', date: '', tags: [] };
      return { slug, meta, raw };
    })
    .sort((a, b) => b.meta.date.localeCompare(a.meta.date))
    .map(({ slug, meta, raw }) =>
      file(blogDir.path, `${slug}.md`, meta.title, meta.excerpt, () => [
        h1(meta.title),
        p(`${meta.date} · ${meta.tags.join(' · ')}`, true),
        ...mdBlocks(raw),
      ]),
    );

  const shown = versions.filter((v) => !v.hidden);
  const versionsDir = dir('~', 'versions', 'Versions', 'every earlier site, all still running');
  versionsDir.node.children = [
    file(versionsDir.path, 'history.txt', 'Version history', `${shown.length} earlier versions of this site`, () => [
      h1('Version history'),
      p(`This machine is version 6. The ${shown.length} before it are kept in a working archive, and every one can still be opened and used as it shipped.`),
      { k: 'kv', rows: [{ key: 'ARCHIVE', inl: ext(LINKS.timetravel, 'Version TimeTravel') }] },
      ...shown.flatMap((v): Block[] => [
        h2(`${v.number} · ${v.title}`),
        p(`${v.date} · ${v.techStack.join(' · ')}`, true),
        p(v.description),
        { k: 'kv', rows: [{
          key: 'OPEN',
          inl: ext(v.externalUrl ?? `${LINKS.timetravel}v/${v.id}`, v.externalUrl ? undefined : `open ${v.number} in the archive`),
        }] },
      ]),
    ]),
  ];

  const all = [projectsDir, workDir, skillsDir, journeyDir, blogDir, versionsDir];
  const fileCount = () => walk(root).filter((n) => n.kind === 'file').length;

  root.children = [
    file('~', 'README.txt', 'Terminal', 'the shell: how to get around', () => [
      h1('The shell'),
      p(`${ROLE}. ${LOCATION}.`),
      p(`This is the shell on the ${MACHINE}. It holds ${fileCount()} files: every project, the paid work, the whole road here, and some things that are not listed. Nothing is laid out for you. You have to go looking.`),
      { k: 'list', items: [
        inl('[ls](<cmd:ls>) lists what is here. [cd projects](<cmd:cd projects>) goes somewhere.'),
        inl('[cat about.txt](<cmd:cat about.txt>) reads a file. So does clicking one.'),
        inl('[help](<cmd:help>) is the short manual. It does not list everything.'),
        inl('[menu](<cmd:menu>) goes back to the main menu.'),
      ] },
    ]),
    file('~', 'build.txt', 'What I build', 'eight kinds of thing, and where to check each', () => [
      h1('What I build'),
      p('Apps, games, websites, experiences, design, AI agents, voice agents and custom tooling. Eight kinds of thing, and for each one there is something you can open and check, on this machine or out in the world.'),
      ...BUILD.flatMap((b): Block[] => [h2(b.title), p(b.body)]),
      p('If you want one of them built, in a job or as a piece of work: [mail](<cmd:mail>).'),
    ]),
    file('~', 'about.txt', 'About', 'who, and how I got here', () => [
      h1('About'),
      ...BIO.map((s) => p(s)),
      p('Thanks for your time reading this.'),
      p('Tom'),
      p('The longer version is in `journey/`. What I am doing right now is in `now.txt`.', true),
    ]),
    file('~', 'now.txt', 'Now', 'what I am doing at the moment', () => [
      h1('Now'),
      ...NOW.map((s) => p(s)),
      h2('What I use now'),
      p(USE_NOW.join(' · ')),
    ]),
    file('~', 'contact.txt', 'Contact', 'how to reach me', () => [
      h1('Contact'),
      p('Tell me about the role, the idea, or just say hello.'),
      { k: 'kv', rows: [
        { key: 'EMAIL', inl: [{ t: 'link', href: `mailto:${LINKS.email}`, text: LINKS.email }] },
        { key: 'LINKEDIN', inl: ext(LINKS.linkedin) },
        { key: 'GITHUB', inl: ext(LINKS.github) },
        { key: 'CODEPEN', inl: ext(LINKS.codepen) },
        { key: 'AI WORK', inl: ext(LINKS.aiPortfolio) },
        { key: 'CV', inl: [{ t: 'link', href: `mailto:${LINKS.email}?subject=CV%20request`, text: 'available by request' }] },
      ] },
      p('Or write to me from here: [mail](<cmd:mail>) opens a message form.'),
    ]),
    ...all.map((d) => d.node),

    /* Hidden. `ls -a` shows them; nothing else mentions them. */
    file('~', '.why', 'Why does this site exist?', 'the question I ask most days', () => [
      h1('Why does this site exist?'),
      ...WHY.map((s) => p(s)),
    ], true),
    file('~', '.interests', 'Interests', 'what I do away from the keyboard', () => [
      h1('Away from the keyboard'),
      { k: 'kv', rows: INTERESTS.map((i) => ({ key: i.title.toUpperCase(), inl: text(i.text) })) },
      { k: 'kv', rows: [{ key: 'COFFEE', inl: ext(LINKS.coffee, 'buy me one') }] },
    ], true),
    file('~', '.colophon', 'Colophon', 'how this machine is built', () => [
      h1('Colophon'),
      p(`The ${MACHINE} is a nod to the DEC VT100 of 1978: an 80 by 24 character screen, a detachable keyboard, a 132 column mode, and a SET-UP key. It is not a replica. The case is drawn from a few boxes.`),
      { k: 'kv', rows: [
        { key: 'SCENE', inl: text('three.js. One shader for the rain, edge lines for the case.') },
        { key: 'SOUND', inl: text('Web Audio, synthesised. The keyclick, the bell, the modem and the tune are all oscillators: there is not an audio file on the machine.') },
        { key: 'VOICE', inl: text("The browser's own speech synthesis and recognition. No service, no key.") },
        { key: 'TERMINAL', inl: text('React 19 and TypeScript. The text is real text, not a canvas.') },
        { key: 'PARTS', inl: text('shadcn components on Base UI, Tailwind 4.') },
        { key: 'TYPE', inl: text('IBM Plex Mono for reading, VT323 for the double-height lines.') },
        { key: 'BUILD', inl: text('Vite. Every file is prerendered to HTML, so crawlers and screen readers get words.') },
      ] },
      p('Things a VT100 could do that this can too: [set cols 132](<cmd:set cols 132>), [setup](<cmd:setup>), [selftest](<cmd:selftest>), [bell](<cmd:bell>).'),
    ], true),
    file('~', '.rabbit', 'The white rabbit', 'you followed it', () => [
      h1('Knock, knock.'),
      p('You looked where nobody told you to. That is most of the job.'),
      p('There are commands the manual leaves out. A few to try: [matrix](<cmd:matrix>), [whoami](<cmd:whoami>), [ollama ps](<cmd:ollama ps>), [grep cricket](<cmd:grep cricket>), [sudo make me a sandwich](<cmd:sudo make me a sandwich>).'),
    ], true),
  ];
  return root;
}

export function walk(node: FsNode, out: FsNode[] = []): FsNode[] {
  out.push(node);
  if (node.kind === 'dir') for (const child of node.children) walk(child, out);
  return out;
}

export const ROOT = build();
export const ALL_NODES = walk(ROOT);
export const ALL_FILES = ALL_NODES.filter((n): n is FileNode => n.kind === 'file');

const byPath = new Map(ALL_NODES.map((n) => [n.path, n]));

export function getNode(path: string): FsNode | undefined {
  return byPath.get(path);
}

export function parentOf(path: string): string {
  return path === '~' ? '~' : path.slice(0, path.lastIndexOf('/')) || '~';
}

/**
 * Resolve what someone typed against a working directory. Accepts '~', '/', '..', '.',
 * relative and absolute paths, and forgives a missing extension: `cat about` finds
 * about.txt, because nobody should lose a file to a suffix.
 */
export function resolve(cwd: string, input: string): FsNode | undefined {
  let raw = input.trim();
  if (raw === '' || raw === '~' || raw === '/') return ROOT;
  let parts: string[];
  if (raw.startsWith('~/')) {
    parts = [];
    raw = raw.slice(2);
  } else if (raw.startsWith('/')) {
    parts = [];
    raw = raw.slice(1);
  } else {
    parts = cwd === '~' ? [] : cwd.slice(2).split('/');
  }
  for (const seg of raw.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  const path = parts.length ? `~/${parts.join('/')}` : '~';
  const exact = byPath.get(path);
  if (exact) return exact;
  const lower = path.toLowerCase();
  return ALL_NODES.find((n) => {
    const candidate = n.path.toLowerCase();
    return candidate === lower || candidate.replace(/\.(txt|md|log)$/, '') === lower;
  });
}

/* ─── URLs ───
 * '~/projects/sanctuary.md' is served at '/projects/sanctuary'. Dotfiles keep their dot.
 * '/' is the main menu, so home and its README live at '/terminal'. */

export const SHELL_URL = '/terminal';

export function urlFor(node: FsNode): string {
  if (node.path === '~' || node.path === '~/README.txt') return SHELL_URL;
  return node.path.slice(1).replace(/\.(txt|md|log)$/, '');
}

export function nodeForUrl(pathname: string): FsNode | undefined {
  const clean = decodeURIComponent(pathname).replace(/\/+$/, '').replace(/\.html$/, '');
  if (clean === SHELL_URL || clean === '/readme') return getNode('~/README.txt');
  if (clean === '') return undefined;
  return resolve('~', clean);
}
