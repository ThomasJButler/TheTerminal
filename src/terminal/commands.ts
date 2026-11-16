import { ALL_FILES, ROOT, getNode, parentOf, resolve } from '@/fs/tree';
import { blockLines, inl, p } from '@/fs/md';
import type { Block, DirNode, FsNode, Listing } from '@/fs/types';
import { FORTUNES, LINKS, LOCATION, MACHINE, NOW, ROLE, SITE_NAME } from '@/content/site';
import { projects } from '@/content/projects';
import type { Settings } from '@/machine/settings';
import type { Ctx, Result } from './types';

/**
 * The shell. Pure: a line and a context in, blocks and a list of effects out. It touches no
 * DOM, no storage and no router, which is what lets the prerender run the same code to
 * produce each page and lets the tests drive it without a browser.
 */

const err = (text: string): Block => ({ k: 'err', text });
const done = (out: Block[], extra: Partial<Result> = {}): Result => ({ out, effects: [], ...extra });

/**
 * Relative to where you are, and failing that, from home. A real shell would refuse
 * `cat blog/post` from inside ~/work; here that is more likely a visitor who knows what
 * they want than one who wants a lesson in working directories.
 */
function lookup(cwd: string, input: string): FsNode | undefined {
  return resolve(cwd, input) ?? resolve('~', input);
}

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

export function open(node: FsNode): Result {
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
      { key: 'ask <question>', inl: inl('put a question to the operator without leaving the shell') },
      { key: 'mail', inl: inl('write to me') },
      { key: 'setup', inl: inl('phosphor, columns, sound, voice') },
      { key: 'progress', inl: inl('how much you have found') },
      { key: 'man <command>', inl: inl('the long version of any of these') },
      { key: 'menu', inl: inl('back to the main menu') },
    ],
  },
  p('Other programs run from here too: [operator](<cmd:operator>), [adventure](<cmd:adventure>), [arcade](<cmd:arcade>), [demo](<cmd:demo>), [tour](<cmd:tour>).'),
  p('Tab completes. Up and down walk your history. Anything underlined can be clicked. This manual does not list everything.', true),
];

const MAN: Record<string, { use: string; text: string }> = {
  ls: { use: 'ls [-a] [-l] [dir]', text: 'Lists a directory. -l adds what each thing is. -a includes the files whose names start with a dot, which a plain ls leaves out.' },
  cd: { use: 'cd [dir]', text: 'Changes directory. With no argument it goes home. Paths are relative to where you are and, failing that, to home.' },
  cat: { use: 'cat <file>', text: 'Prints a file. The extension is optional, and so is the command: typing a file name on its own does the same thing.' },
  grep: { use: 'grep <word>', text: 'Searches the text of every file on the machine, hidden ones included, and shows where the word turns up.' },
  tree: { use: 'tree [-a] [dir]', text: 'Draws the filesystem from here down. -a includes hidden files.' },
  ask: { use: 'ask <question>', text: 'Puts one question to the operator and prints the answer here. The operator answers only from the files and shows its working. For a conversation, run operator.' },
  operator: { use: 'operator', text: 'Starts the operator: an agent that answers questions about Tom from the files on this machine, runs commands for you, and can listen and talk. There is no language model in it.' },
  adventure: { use: 'adventure', text: 'Starts STANDING START, a text adventure in ten rooms about how Tom got here. Your place is saved on this device.' },
  arcade: { use: 'arcade | play <game>', text: 'Opens the arcade. Two games written for this screen, trace and decode, and the twelve in The Matrix Arcade: play matrix.' },
  demo: { use: 'demo', text: 'Runs the demo: three minutes of film about who Tom is, what he builds and how he got here, drawn in three.js. The arrow keys skip, space pauses, Esc stops it.' },
  tour: { use: 'tour', text: 'The machine types for about a minute and shows the highlights. Any key gives you the keyboard back.' },
  mail: { use: 'mail', text: `Opens a message to ${LINKS.email}.` },
  setup: { use: 'setup', text: 'Shows the settings: phosphor, columns, rain, scanlines, sound, keyclick and voice. Each is changed with set.' },
  set: { use: 'set <setting> <value>', text: 'Changes a setting. set phosphor green|amber|white, set cols 80|132, and on|off for rain, scanlines, sound, keyclick and voice. Settings are kept on this device only.' },
  progress: { use: 'progress', text: 'Shows how many of the files on the machine you have read. Some are not listed by a plain ls.' },
  history: { use: 'history', text: 'Lists the commands you have typed this visit. Up and down walk through them.' },
  clear: { use: 'clear', text: 'Wipes the screen. Ctrl+L does the same.' },
  menu: { use: 'menu', text: 'Goes back to the main menu. So does exit.' },
  man: { use: 'man <command>', text: 'Prints the manual page for a command. You have found it.' },
  fortune: { use: 'fortune', text: 'Prints one line Tom wrote, picked at random.' },
  finger: { use: 'finger [tom]', text: 'Who is on this machine, and what they are up to.' },
  selftest: { use: 'selftest', text: 'The machine checks its own parts, the way a VT100 did when you switched it on: the display, the sound, the voice, the storage. It reports what works in this browser and what does not.' },
};

function setup(s: Settings): Block[] {
  const onoff = (key: string, value: boolean) =>
    inl(`**${value ? 'ON' : 'OFF'}** : [on](<cmd:set ${key} on>) · [off](<cmd:set ${key} off>)`);
  return [
    { k: 'banner', text: 'SET-UP' },
    {
      k: 'kv',
      rows: [
        { key: 'PHOSPHOR', inl: inl(`**${s.phosphor.toUpperCase()}** : [green](<cmd:set phosphor green>) · [amber](<cmd:set phosphor amber>) · [white](<cmd:set phosphor white>)`) },
        { key: 'COLUMNS', inl: inl(`**${s.cols}** : [80](<cmd:set cols 80>) · [132](<cmd:set cols 132>)`) },
        { key: 'RAIN', inl: onoff('rain', s.rain) },
        { key: 'SCANLINES', inl: onoff('scanlines', s.scanlines) },
        { key: 'SOUND', inl: onoff('sound', s.sound) },
        { key: 'KEYCLICK', inl: onoff('keyclick', s.keyclick) },
        { key: 'VOICE', inl: onoff('voice', s.voice) },
      ],
    },
    p('Settings are kept on this device only.', true),
  ];
}

const TOGGLES = ['rain', 'scanlines', 'sound', 'keyclick', 'voice'] as const;

function set(args: string[], ctx: Ctx): Result {
  const [key, value] = args.map((a) => a.toLowerCase());
  const on = value === 'on' || value === 'true' || value === '1';
  const off = value === 'off' || value === 'false' || value === '0';
  let patch: Partial<Settings> | null = null;
  if (key === 'phosphor' && (value === 'green' || value === 'amber' || value === 'white')) patch = { phosphor: value };
  else if ((key === 'cols' || key === 'columns') && (value === '80' || value === '132')) patch = { cols: value === '80' ? 80 : 132 };
  else if ((on || off) && (TOGGLES as readonly string[]).includes(key)) patch = { [key]: on };
  if (!patch) {
    return done([err('usage: set phosphor green|amber|white · set cols 80|132 · set rain|scanlines|sound|keyclick|voice on|off')]);
  }
  if (patch.voice && !ctx.caps.speak) return done([err('This browser has no speech synthesis, so there is no voice to turn on.')]);
  return { out: setup({ ...ctx.settings, ...patch }), effects: [{ e: 'set', patch }] };
}

function calendar(now: Date): string {
  const year = now.getFullYear();
  const month = now.getMonth();
  const title = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(lead).fill('  '), ...Array.from({ length: days }, (_, i) => String(i + 1).padStart(2))];
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7).join(' '));
  return [title.padStart(10 + Math.ceil(title.length / 2)), 'Mo Tu We Th Fr Sa Su', ...rows].join('\n');
}

function top(): string {
  const running = projects.filter((x) => x.status === 'in-progress' || x.status === 'coming-soon');
  const rows = [
    '  PID  STATE        COMMAND',
    `    1  RUNNING      levocell --role "${ROLE.toLowerCase()}"`,
    ...running.map((x, i) => `${String(i + 2).padStart(5)}  ${(x.status === 'in-progress' ? 'IN PROGRESS' : 'COMING SOON').padEnd(11)}  ${x.id}`),
  ];
  return rows.join('\n');
}

/** Commands the manual leaves out. Each returns a Result, or null to fall through. */
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
  if (cmd === 'hello' || cmd === 'hi' || cmd === 'hey') return done([p("Hello. I'm a website, but Tom is real: [mail](<cmd:mail>) reaches him. Or try the [operator](<cmd:operator>).")]);
  if (cmd === 'uname' || cmd === 'version' || cmd === 'ver') {
    return done([p(`${MACHINE} 6.0 react-19 three.js phosphor/${ctx.settings.phosphor} ${ctx.settings.cols}col`)]);
  }
  if (cmd === 'xyzzy') return done([p('Nothing happens.')]);
  if (cmd === 'forget') return { out: [p('Found list wiped. As far as this machine knows, you have never been here.', true)], effects: [{ e: 'forget' }] };
  if (cmd === 'fortune') return done([{ k: 'quote', inl: [{ t: 'text', text: FORTUNES[Math.floor(Math.random() * FORTUNES.length)] }] }]);
  if (cmd === 'finger' || cmd === 'whois') {
    return done([{
      k: 'kv',
      rows: [
        { key: 'LOGIN', inl: inl('tom') },
        { key: 'NAME', inl: inl(SITE_NAME) },
        { key: 'ROLE', inl: inl(ROLE) },
        { key: 'WHERE', inl: inl(LOCATION) },
        { key: 'ON SINCE', inl: inl('early 2022') },
        { key: 'PLAN', inl: inl(NOW[0]) },
      ],
    }]);
  }
  if (cmd === 'banner') return done(args.length ? [{ k: 'h', level: 1, text: args.join(' ') }] : [err('usage: banner <text>')]);
  if (cmd === 'top' || cmd === 'ps') return done([{ k: 'pre', text: top() }, p('The files are in `projects/`.', true)]);
  if (cmd === 'uptime') {
    const years = new Date().getFullYear() - 2022;
    return done([p(`up ${years} years, from a standing start in early 2022. Load average: one job, and more side projects than is sensible.`)]);
  }
  if (cmd === 'cal') return done([{ k: 'pre', text: calendar(new Date()) }]);
  if (cmd === 'bell' || cmd === 'beep') return { out: [p('^G', true)], effects: [{ e: 'bell' }] };
  if (cmd === 'ping') return done([p('ping: he is a person, not a host. [mail](<cmd:mail>) reaches him.')]);
  if (cmd === 'ssh' || cmd === 'telnet' || cmd === 'ftp') return done([p(`${cmd}: you are already in.`)]);
  if (cmd === 'make') return done([p('make: nothing to be done. Everything on this machine is already built.')]);
  return null;
}

const GAMES = ['trace', 'decode', 'matrix'];

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
      return done(HELP);

    case 'man': {
      if (!rest[0]) return done(HELP);
      const page = MAN[rest[0].toLowerCase()];
      if (!page) return done([err(`No manual entry for ${rest[0]}.`)]);
      return done([{ k: 'kv', rows: [{ key: 'NAME', inl: inl(rest[0].toLowerCase()) }, { key: 'SYNOPSIS', inl: [{ t: 'code', text: page.use }] }, { key: 'DESCRIPTION', inl: inl(page.text) }] }]);
    }

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

    case 'reboot':
      return { out: [], effects: [{ e: 'reboot' }] };

    case 'setup':
    case 'settings':
      return done(setup(ctx.settings));

    case 'set':
      return set(args, ctx);

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

    /* Programs: everything that is not this shell */

    case 'menu':
    case 'home':
    case 'exit':
    case 'logout':
    case 'quit':
      return { out: [], effects: [{ e: 'program', program: 'menu' }] };

    case 'shell':
    case 'terminal':
    case 'sh':
      return { out: [], effects: [{ e: 'program', program: 'shell' }] };

    case 'operator':
    case 'agent':
    case 'chat':
    case 'talk':
      return { out: [], effects: [{ e: 'program', program: 'operator' }] };

    case 'adventure':
    case 'adv':
      return { out: [], effects: [{ e: 'program', program: 'adventure' }] };

    case 'arcade':
    case 'games':
      return { out: [p('Opening the arcade.', true)], effects: [{ e: 'go', to: 'arcade' }] };

    case 'trace':
    case 'decode':
      return { out: [p(`Loading ${cmd.toUpperCase()}.`, true)], effects: [{ e: 'go', to: 'arcade', game: cmd }] };

    case 'play': {
      const what = rest[0]?.toLowerCase();
      if (what === 'adventure') return { out: [], effects: [{ e: 'program', program: 'adventure' }] };
      if (what && GAMES.includes(what)) return { out: [p(`Loading ${what.toUpperCase()}.`, true)], effects: [{ e: 'go', to: 'arcade', game: what }] };
      if (!what) return { out: [p('Opening the arcade.', true)], effects: [{ e: 'go', to: 'arcade' }] };
      return done([err(`play: no game called ${what}. There is trace, decode, matrix and adventure.`)]);
    }

    case 'demo':
      return { out: [p('Lights off.', true)], effects: [{ e: 'go', to: 'demo' }] };

    case 'tour':
      return { out: [p('Sit back. The machine does the typing from here, and any key gives you the keyboard back.', true)], effects: [{ e: 'tour' }] };

    case 'selftest':
    case 'diag':
    case 'test':
      return { out: [p('Running the self-test.', true)], effects: [{ e: 'selftest' }] };

    case 'stepback':
    case 'outside':
      if (!ctx.caps.scene) return done([err('There is no outside to step back to: this browser cannot draw the machine.')]);
      return { out: [p('Stepping back.', true)], effects: [{ e: 'stepBack' }] };

    default: {
      const hidden = egg(trimmed, cmd, args, ctx);
      if (hidden) return hidden;
      // A bare path is a request to open it: `projects`, `about.txt`, `./now`.
      const target = lookup(ctx.cwd, trimmed);
      if (target && target !== ROOT) return open(target);
      return { out: [err(`${rawCmd}: command not found. Try help, or ls`)], effects: [], unknown: true };
    }
  }
}

/* ─── Tab completion ─── */

export const COMMANDS = [
  'adventure', 'arcade', 'ask', 'cat', 'cd', 'clear', 'demo', 'exit', 'grep', 'help', 'history', 'ls', 'mail', 'man',
  'menu', 'operator', 'play', 'progress', 'pwd', 'set', 'setup', 'tour', 'tree', 'whoami',
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

/** The line every session opens on: the modem's side of the conversation. */
export function bootBlocks(): Block[] {
  return [p(`ATDT ${MACHINE} · CONNECT 9600 · ${ALL_FILES.length} FILES ON LINE`, true)];
}

/** The command that shows a node, phrased the way a person would type it from home. */
export function commandFor(node: FsNode): string {
  const rel = node.path === '~' ? '~' : node.path.slice(2);
  return node.kind === 'dir' ? `cd ${rel}` : `cat ${rel}`;
}
