import { ALL_FILES, ROOT, getNode, parentOf, resolve, urlFor } from '@/fs/tree';
import { blockLines, inl, p } from '@/fs/md';
import type { Block, DirNode, FsNode, Listing } from '@/fs/types';
import { LINKS, LOCATION, MACHINE, ROLE } from '@/content/site';

/**
 * The command interpreter. Pure: a line and a context in, blocks and a list of effects out.
 * It touches no DOM, no storage and no router, which is what lets the prerender run the
 * same code to produce each page and lets the tests drive it without a browser.
 */

export interface Settings {
  phosphor: 'green' | 'amber' | 'white';
  cols: 80 | 132;
  rain: boolean;
  scanlines: boolean;
}

export const DEFAULT_SETTINGS: Settings = { phosphor: 'green', cols: 80, rain: true, scanlines: true };

export type Effect =
  | { e: 'clear' }
  | { e: 'exit' }
  | { e: 'reboot' }
  | { e: 'set'; patch: Partial<Settings> }
  | { e: 'palette' }
  | { e: 'mail' }
  | { e: 'href'; href: string }
  | { e: 'burst' }
  | { e: 'forget' };

export interface Ctx {
  cwd: string;
  settings: Settings;
  /** Paths of files already read. */
  found: ReadonlySet<string>;
  history: readonly string[];
}

export interface Result {
  out: Block[];
  cwd?: string;
  /** The node this command landed on: drives the URL and the found counter. */
  visit?: FsNode;
  effects: Effect[];
}

const err = (text: string): Block => ({ k: 'err', text });

/**
 * Relative to where you are, and failing that, from home. A real shell would refuse
 * `cat blog/post` from inside ~/work; here that is more likely a visitor who knows what
 * they want than one who wants a lesson in working directories.
 */
function lookup(cwd: string, input: string): FsNode | undefined {
  return resolve(cwd, input) ?? resolve('~', input);
}
const done = (out: Block[], extra: Partial<Result> = {}): Result => ({ out, effects: [], ...extra });

export function listing(node: FsNode): Listing {
  return {
    name: node.kind === 'dir' ? `${node.name}/` : node.name,
    path: node.path,
    dir: node.kind === 'dir',
    hidden: node.hidden,
    note: node.note,
    count: node.kind === 'dir' ? node.children.length : undefined,
  };
}

function ls(dir: DirNode, all: boolean, long: boolean): Block[] {
  const entries = dir.children.filter((c) => all || !c.hidden).map(listing);
  const out: Block[] = [{ k: 'ls', entries, long }];
  const hiddenCount = dir.children.filter((c) => c.hidden).length;
  if (!all && hiddenCount && dir.path !== '~') out.push(p(`${hiddenCount} hidden`, true));
  return out;
}

function tree(dir: DirNode, all: boolean): Block {
  const rows: { prefix: string; entry: Listing }[] = [];
  const visit = (node: DirNode, indent: string) => {
    const kids = node.children.filter((c) => all || !c.hidden);
    kids.forEach((child, i) => {
      const last = i === kids.length - 1;
      rows.push({ prefix: `${indent}${last ? '└─ ' : '├─ '}`, entry: listing(child) });
      if (child.kind === 'dir') visit(child, `${indent}${last ? '   ' : '│  '}`);
    });
  };
  visit(dir, '');
  return { k: 'tree', rows };
}

function open(node: FsNode): Result {
  if (node.kind === 'dir') {
    return done(ls(node, false, true), { cwd: node.path, visit: node });
  }
  return done(node.blocks(), { cwd: parentOf(node.path), visit: node });
}

function grep(term: string): Block[] {
  const needle = term.toLowerCase();
  const out: Block[] = [];
  let files = 0;
  for (const f of ALL_FILES) {
    const hits = blockLines(f.blocks()).filter((line) => line.toLowerCase().includes(needle));
    if (!hits.length) continue;
    files += 1;
    if (files > 14) continue;
    const snippets = hits.slice(0, 2).map((line) => {
      const at = line.toLowerCase().indexOf(needle);
      const from = Math.max(0, at - 50);
      const cut = line.slice(from, at + needle.length + 70);
      return `${from > 0 ? '…' : ''}${cut}${from + cut.length < line.length ? '…' : ''}`;
    });
    out.push({
      k: 'kv',
      rows: [
        { key: `${hits.length}×`, inl: [{ t: 'path', path: f.path, text: f.path }] },
        ...snippets.map((s) => ({ key: '', inl: [{ t: 'text' as const, text: s }] })),
      ],
    });
  }
  if (!files) return [p(`grep: nothing on this machine mentions "${term}"`, true)];
  out.unshift(p(`"${term}" in ${files} ${files === 1 ? 'file' : 'files'}${files > 14 ? ', first 14 shown' : ''}`, true));
  return out;
}

export function progress(found: ReadonlySet<string>): { have: number; total: number } {
  return { have: ALL_FILES.filter((f) => found.has(f.path)).length, total: ALL_FILES.length };
}

const HELP: Block[] = [
  { k: 'h', level: 2, text: 'The short manual' },
  {
    k: 'kv',
    rows: [
      { key: 'ls', inl: inl('list this directory. `ls -l` says what things are') },
      { key: 'cd <dir>', inl: inl('go somewhere. `cd ..` goes back, `cd` goes home') },
      { key: 'cat <file>', inl: inl('read a file. The extension is optional') },
      { key: 'grep <word>', inl: inl('search every file on the machine') },
      { key: 'tree', inl: inl('draw the whole filesystem') },
      { key: 'mail', inl: inl('write to me') },
      { key: 'setup', inl: inl('phosphor, columns, rain') },
      { key: 'progress', inl: inl('how much you have found') },
      { key: 'clear', inl: inl('wipe the screen') },
      { key: 'exit', inl: inl('step back from the screen') },
    ],
  },
  p('Tab completes. Up and down walk your history. Anything green and underlined can be clicked. This manual does not list everything.', true),
];

function setup(s: Settings): Block[] {
  return [
    { k: 'banner', text: 'SET-UP' },
    {
      k: 'kv',
      rows: [
        { key: 'PHOSPHOR', inl: inl(`**${s.phosphor.toUpperCase()}** : [green](<cmd:set phosphor green>) · [amber](<cmd:set phosphor amber>) · [white](<cmd:set phosphor white>)`) },
        { key: 'COLUMNS', inl: inl(`**${s.cols}** : [80](<cmd:set cols 80>) · [132](<cmd:set cols 132>)`) },
        { key: 'RAIN', inl: inl(`**${s.rain ? 'ON' : 'OFF'}** : [on](<cmd:set rain on>) · [off](<cmd:set rain off>)`) },
        { key: 'SCANLINES', inl: inl(`**${s.scanlines ? 'ON' : 'OFF'}** : [on](<cmd:set scanlines on>) · [off](<cmd:set scanlines off>)`) },
      ],
    },
    p('Settings are kept on this device only.', true),
  ];
}

function set(args: string[], s: Settings): Result {
  const [key, value] = args.map((a) => a.toLowerCase());
  const on = value === 'on' || value === 'true' || value === '1';
  const off = value === 'off' || value === 'false' || value === '0';
  let patch: Partial<Settings> | null = null;
  if (key === 'phosphor' && (value === 'green' || value === 'amber' || value === 'white')) patch = { phosphor: value };
  else if ((key === 'cols' || key === 'columns') && (value === '80' || value === '132')) patch = { cols: value === '80' ? 80 : 132 };
  else if (key === 'rain' && (on || off)) patch = { rain: on };
  else if (key === 'scanlines' && (on || off)) patch = { scanlines: on };
  if (!patch) return done([err('usage: set phosphor green|amber|white · set cols 80|132 · set rain on|off · set scanlines on|off')]);
  return { out: setup({ ...s, ...patch }), effects: [{ e: 'set', patch }] };
}

/** Commands the manual leaves out. Each returns a Result or null to fall through. */
function egg(line: string, cmd: string, args: string[], ctx: Ctx): Result | null {
  const lower = line.toLowerCase();
  if (cmd === 'sudo') {
    return done([p(`${args.length ? 'Nice try.' : 'usage: sudo <something you should not>'} This incident will be reported to nobody: there is only me here.`)]);
  }
  if (cmd === 'rm') return done([p('rm: every version of this site still runs. Deleting things is not how we do it here.')]);
  if (cmd === 'vim' || cmd === 'vi' || cmd === 'nano' || cmd === 'emacs') {
    return done([p(`${cmd}: read-only filesystem. On the bright side, you will not need to work out how to quit.`)]);
  }
  if (lower === 'ollama ps' || lower === 'ollama list') {
    return done([{ k: 'pre', text: 'NAME     STATUS\nqwen3    running on my own machine\n         personal use, over a year now' }]);
  }
  if (cmd === 'matrix' || cmd === 'rain') return { out: [p('Look behind the glass.', true)], effects: [{ e: 'set', patch: { rain: true } }, { e: 'burst' }] };
  if (lower === 'wake up' || cmd === 'neo' || lower === 'wake up neo') {
    return { out: [p('The site has you.'), p('Follow the white rabbit: [ls -a](<cmd:ls -a ~>)', true)], effects: [{ e: 'burst' }] };
  }
  if (lower.includes('rabbit')) return open(getNode('~/.rabbit')!);
  if (lower === 'red pill') return { out: [p('You stay in Wonderland.')], effects: [{ e: 'set', patch: { phosphor: 'amber' } }] };
  if (lower === 'blue pill') return { out: [p('You wake up in your bed and believe whatever you want to believe.')], effects: [{ e: 'set', patch: { phosphor: 'green' } }] };
  if (cmd === 'hello' || cmd === 'hi' || cmd === 'hey') return done([p("Hello. I'm a website, but Tom is real: [mail](<cmd:mail>) reaches him.")]);
  if (cmd === 'uname') return done([p(`${MACHINE} 6.0 react-19 three.js phosphor/${ctx.settings.phosphor} ${ctx.settings.cols}col`)]);
  if (cmd === 'xyzzy') return done([p('Nothing happens.')]);
  if (cmd === 'forget') return { out: [p('Found list wiped. As far as this machine knows, you have never been here.', true)], effects: [{ e: 'forget' }] };
  return null;
}

export function exec(line: string, ctx: Ctx): Result {
  const trimmed = line.trim().replace(/\s+/g, ' ');
  if (!trimmed) return done([]);
  const [rawCmd, ...args] = trimmed.split(' ');
  const cmd = rawCmd.toLowerCase();
  const flags = args.filter((a) => a.startsWith('-')).join('');
  const rest = args.filter((a) => !a.startsWith('-'));
  const cwdNode = (getNode(ctx.cwd) as DirNode | undefined) ?? ROOT;

  switch (cmd) {
    case 'help':
    case '?':
    case 'man':
      return done(HELP);

    case 'ls':
    case 'dir':
    case 'll': {
      const target = rest[0] ? lookup(ctx.cwd, rest[0]) : cwdNode;
      if (!target) return done([err(`ls: ${rest[0]}: no such file or directory`)]);
      if (target.kind === 'file') return done([{ k: 'ls', entries: [listing(target)], long: true }]);
      return done(ls(target, flags.includes('a'), cmd === 'll' || flags.includes('l')));
    }

    case 'cd': {
      const target = rest[0] ? lookup(ctx.cwd, rest[0]) : ROOT;
      if (!target) return done([err(`cd: ${rest[0]}: no such directory`)]);
      if (target.kind === 'file') return open(target);
      return done(ls(target, false, true), { cwd: target.path, visit: target });
    }

    case 'cat':
    case 'open':
    case 'less':
    case 'more':
    case 'read':
    case 'view':
    case 'type': {
      if (!rest[0]) return done([err(`usage: ${cmd} <file>`)]);
      const target = lookup(ctx.cwd, rest.join(' ')) ?? lookup(ctx.cwd, rest[0]);
      if (!target) return done([err(`${cmd}: ${rest[0]}: no such file. Try ls`)]);
      return open(target);
    }

    case 'pwd':
      return done([p(ctx.cwd)]);

    case 'tree': {
      const target = rest[0] ? lookup(ctx.cwd, rest[0]) : cwdNode;
      return done([tree(target?.kind === 'dir' ? target : cwdNode, flags.includes('a'))]);
    }

    case 'grep':
    case 'find':
    case 'search': {
      const term = rest.join(' ').replace(/^["']|["']$/g, '');
      if (!term) return { out: [], effects: [{ e: 'palette' }] };
      if (term.length < 2) return done([err('grep: give me at least two characters')]);
      return done(grep(term));
    }

    case 'whoami':
      return done([p(`visitor. But if you meant him: Tom Butler, ${ROLE}, ${LOCATION}. See \`about.txt\`.`)]);

    case 'date':
      return done([p(new Date().toUTCString())]);

    case 'echo':
      return done([p(args.join(' '))]);

    case 'history':
      return done(
        ctx.history.length
          ? [{ k: 'pre', text: ctx.history.map((h, i) => `${String(i + 1).padStart(3)}  ${h}`).join('\n') }]
          : [p('Nothing yet.', true)],
      );

    case 'clear':
    case 'cls':
      return { out: [], effects: [{ e: 'clear' }] };

    case 'exit':
    case 'logout':
    case 'quit':
      return { out: [p('Stepping back.', true)], effects: [{ e: 'exit' }] };

    case 'reboot':
      return { out: [], effects: [{ e: 'reboot' }] };

    case 'setup':
    case 'settings':
      return done(setup(ctx.settings));

    case 'set':
      return set(args, ctx.settings);

    case 'mail':
    case 'contact':
    case 'email':
      return { out: [p(`Opening a message to ${LINKS.email}.`, true)], effects: [{ e: 'mail' }] };

    case 'palette':
    case 'index':
      return { out: [], effects: [{ e: 'palette' }] };

    case 'progress':
    case 'found': {
      const { have, total } = progress(ctx.found);
      const bar = '█'.repeat(Math.round((have / total) * 30)).padEnd(30, '░');
      return done([
        { k: 'pre', text: `${bar}  ${have}/${total} files read` },
        p(have === total ? 'That is everything. Thank you for looking properly.' : 'Some files are not listed by a plain ls.', true),
      ]);
    }

    case 'timetravel':
    case 'versions':
      return open(getNode('~/versions/history.txt')!);

    default: {
      const hidden = egg(trimmed, cmd, args, ctx);
      if (hidden) return hidden;
      // A bare path is a request to open it: `projects`, `about.txt`, `./now`.
      const target = lookup(ctx.cwd, trimmed);
      if (target && target !== ROOT) return open(target);
      return done([err(`${rawCmd}: command not found. Try help, or ls`)]);
    }
  }
}

/* ─── Tab completion ─── */

export const COMMANDS = [
  'cat', 'cd', 'clear', 'exit', 'grep', 'help', 'history', 'ls', 'mail', 'progress', 'pwd',
  'setup', 'set', 'tree', 'whoami',
];

export function complete(line: string, cwd: string): { line: string; options: string[] } {
  const parts = line.split(' ');
  if (parts.length === 1) {
    const hits = COMMANDS.filter((c) => c.startsWith(parts[0].toLowerCase()));
    return hits.length === 1 ? { line: `${hits[0]} `, options: [] } : { line, options: hits };
  }
  const partial = parts[parts.length - 1];
  const slash = partial.lastIndexOf('/');
  const base = slash >= 0 ? partial.slice(0, slash + 1) : '';
  const stem = slash >= 0 ? partial.slice(slash + 1) : partial;
  const dir = base ? resolve(cwd, base) : getNode(cwd);
  if (!dir || dir.kind !== 'dir') return { line, options: [] };
  const hits = dir.children.filter(
    (c) => c.name.toLowerCase().startsWith(stem.toLowerCase()) && (!c.hidden || stem.startsWith('.')),
  );
  if (!hits.length) return { line, options: [] };
  const names = hits.map((h) => (h.kind === 'dir' ? `${h.name}/` : h.name));
  let common = names[0];
  for (const n of names) while (!n.toLowerCase().startsWith(common.toLowerCase())) common = common.slice(0, -1);
  const head = parts.slice(0, -1).join(' ');
  return { line: `${head} ${base}${common}`, options: hits.length > 1 ? names : [] };
}

/* ─── The session a URL opens on ─── */

export interface Entry {
  id: number;
  cwd: string;
  /** null for output that no command produced: the boot banner. */
  cmd: string | null;
  out: Block[];
}

export function bootBlocks(): Block[] {
  return [
    { k: 'banner', text: `${MACHINE} · ONLINE` },
    p(`${ALL_FILES.length} files · 80 columns · type [help](<cmd:help>) if you are lost`, true),
  ];
}

/** The command that shows a node, phrased the way a person would type it from home. */
export function commandFor(node: FsNode): string {
  const rel = node.path === '~' ? '~' : node.path.slice(2);
  return node.kind === 'dir' ? `cd ${rel}` : `cat ${rel}`;
}

/**
 * What the screen shows for a URL before anybody has typed anything. The server and the
 * browser both call this with the same pathname, so the prerendered HTML and the hydrating
 * render agree.
 */
export function sessionFor(node: FsNode | undefined): { entries: Entry[]; cwd: string } {
  const boot: Entry = { id: 0, cwd: '~', cmd: null, out: bootBlocks() };
  if (!node) {
    // No command line, and nothing taken from the address: 404.html is one prerendered file
    // served at every unknown URL, so its markup cannot depend on which URL that was.
    return {
      cwd: '~',
      entries: [boot, {
        id: 1, cwd: '~', cmd: null,
        out: [err('404: nothing at that address on this machine.'), p('It may have moved. [ls](<cmd:ls>) shows what is here, [grep](<cmd:grep>) searches it.')],
      }],
    };
  }
  const result = open(node);
  return { cwd: result.cwd ?? '~', entries: [boot, { id: 1, cwd: '~', cmd: commandFor(node), out: result.out }] };
}

export { urlFor };
