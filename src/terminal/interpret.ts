import { HERO, HERO_SUB, LOCATION, MACHINE, MENU, ROLE, SITE_NAME } from '@/content/site';
import { getNode, nodeForUrl, urlFor } from '@/fs/tree';
import { p } from '@/fs/md';
import type { Block } from '@/fs/types';
import { GAMES, gameFor } from '@/arcade/games';
import { ADVENTURE_NOTE, NEW_GAME, adventure, adventureIntro, type AdventureState } from '@/programs/adventure';
import { OPERATOR_NOTE, operate, operatorIntro } from '@/programs/operator';
import { bootBlocks, commandFor, exec, open } from './commands';
import { PROGRAM_URL, type Ctx, type Effect, type Entry, type Program, type Result } from './types';

/**
 * One prompt, four interpreters. This hands a line to whichever program is reading the
 * prompt, and when a program hands over to another it prints that program's opening screen.
 */

export function menuBlocks(): Block[] {
  return [
    { k: 'banner', text: `${MACHINE} · MAIN MENU` },
    { k: 'h', level: 1, text: HERO.join(' ') },
    p(HERO_SUB),
    p(`${ROLE} · ${LOCATION}`, true),
    { k: 'menu', items: MENU },
    { k: 'caller' },
  ];
}

const MENU_ALIAS: Record<string, string> = {
  'set-up': 'setup', 'step back': 'stepback', back: 'stepback', 'what i build': 'cat ~/build.txt',
  exit: 'stepback', quit: 'stepback', logout: 'stepback',
};

/** Effects that mean "something else took over", so the menu should stay the menu. */
const STAYS = new Set<Effect['e']>(['program', 'go', 'stepBack', 'mail', 'palette', 'tour', 'set', 'bell', 'burst', 'clear']);

function menu(line: string, ctx: Ctx): Result {
  const typed = line.trim();
  const q = typed.toLowerCase();
  if (!q) return { out: [], effects: [] };
  if (q === '?' || q === 'help') {
    return {
      out: [
        p('Type a number, or the name of anything on the menu. The arrow keys and Enter work too.'),
        p('Anything else goes to the shell: `ls`, `grep cricket`, `cat about`. That is the same as choosing TERMINAL first.', true),
      ],
      effects: [],
    };
  }
  const item = MENU.find((i) => i.key === q || i.name.toLowerCase() === q);
  const result = exec(item?.cmd ?? MENU_ALIAS[q] ?? typed, ctx);
  if (result.unknown) {
    return { out: [{ k: 'err', text: `"${typed}" is not on the menu, and it is not a command either. Type a number, or help.` }], effects: [] };
  }
  // Plain shell output means they are using the shell, so that is where the prompt goes.
  if (!result.effects.some((e) => STAYS.has(e.e))) result.effects.push({ e: 'program', program: 'shell', quiet: true });
  return result;
}

function opening(program: Program, state: AdventureState): Pick<Result, 'out' | 'cwd' | 'visit'> {
  switch (program) {
    case 'menu':
      return { out: menuBlocks() };
    case 'shell':
      return open(getNode('~/README.txt')!);
    case 'operator':
      return { out: operatorIntro() };
    case 'adventure':
      return { out: adventureIntro(state) };
  }
}

export function interpret(line: string, ctx: Ctx): Result {
  const shell = (cmd: string) => exec(cmd, ctx);
  let result: Result;
  switch (ctx.program) {
    case 'menu':
      result = menu(line, ctx);
      break;
    case 'operator':
      result = operate(line, ctx, shell);
      break;
    case 'adventure': {
      const step = adventure(line, ctx.adventure);
      result = { out: step.out, effects: step.effects, adventure: step.state };
      break;
    }
    default: {
      const ask = line.trim().match(/^ask(?:\s+(.+))?$/i);
      if (!ask) result = exec(line, ctx);
      else if (!ask[1]) result = { out: [{ k: 'err', text: 'usage: ask <question>. For a conversation, run operator.' }], effects: [] };
      else result = operate(ask[1], ctx, shell);
    }
  }

  const handover = result.effects.find((e) => e.e === 'program');
  if (!handover || handover.e !== 'program' || handover.quiet) return result;
  const next = opening(handover.program, result.adventure ?? ctx.adventure);
  return {
    ...result,
    out: [...result.out, ...next.out],
    cwd: next.cwd ?? result.cwd,
    visit: next.visit ?? result.visit,
    url: PROGRAM_URL[handover.program],
    screen: true,
  };
}

/* ─── Addresses ─── */

export type View = 'terminal' | 'arcade' | 'demo';

export const clean = (pathname: string) => decodeURIComponent(pathname).replace(/\/+$/, '').replace(/\.html$/, '') || '/';

export function viewFor(pathname: string): View {
  const path = clean(pathname);
  if (path === '/arcade' || path.startsWith('/arcade/')) return 'arcade';
  return path === '/demo' ? 'demo' : 'terminal';
}

export const gameIn = (pathname: string) => gameFor(clean(pathname).split('/')[2]);

/** The pages that are programs rather than files. */
export const MODE_ROUTES = ['/', '/operator', '/adventure', '/tour', '/arcade', ...GAMES.map((g) => `/arcade/${g.id}`), '/demo'];

const MODE_META: Record<string, { title: string; description: string }> = {
  '/': {
    title: `${SITE_NAME} | ${MACHINE}`,
    description: 'Apps, games, websites, AI agents, voice agents and custom tooling. A terminal that is a demonstration of all of them at once.',
  },
  '/operator': { title: `Operator | ${SITE_NAME}`, description: OPERATOR_NOTE },
  '/adventure': { title: `Standing Start | ${SITE_NAME}`, description: ADVENTURE_NOTE },
  '/tour': { title: `Tour | ${SITE_NAME}`, description: 'A minute, hands off. The machine types its way through the highlights.' },
  '/arcade': { title: `Arcade | ${SITE_NAME}`, description: 'Fourteen games: Trace and Decode, written for a terminal screen, and the twelve in The Matrix Arcade.' },
  '/demo': { title: `Demo | ${SITE_NAME}`, description: 'Three minutes on who Tom Butler is and what he builds: the road into software, the projects, and the machine itself.' },
};

export function metaFor(pathname: string): { title: string; description: string } {
  const path = clean(pathname);
  if (MODE_META[path]) return MODE_META[path];
  const game = gameIn(path);
  if (viewFor(path) === 'arcade' && game) return { title: `${game.title} | Arcade | ${SITE_NAME}`, description: game.blurb };
  const node = nodeForUrl(path);
  return node ? { title: `${node.title} | ${SITE_NAME}`, description: node.note } : { title: `Not found | ${SITE_NAME}`, description: 'No such file on this machine.' };
}

/** What to type to arrive at an address. Used when the address moves on its own: back, forward. */
export function commandForUrl(pathname: string): string | null {
  const path = clean(pathname);
  if (path === '/') return 'menu';
  if (path === '/operator' || path === '/adventure' || path === '/tour') return path.slice(1);
  const node = nodeForUrl(path);
  return node ? (urlFor(node) === PROGRAM_URL.shell ? 'shell' : commandFor(node)) : null;
}

export function notFoundBlocks(): Block[] {
  return [
    { k: 'err', text: '404: nothing at that address on this machine.' },
    p('It may have moved. [ls](<cmd:ls>) shows what is here, [grep](<cmd:grep>) searches it, and [menu](<cmd:menu>) goes back to the start.'),
  ];
}

/** What the server knows about the visitor's browser, which is nothing. */
export const SERVER_CTX: Omit<Ctx, 'program' | 'cwd'> = {
  settings: { phosphor: 'green', cols: 80, rain: true, scanlines: true, sound: false, keyclick: true, voice: false },
  found: new Set(),
  history: [],
  adventure: NEW_GAME,
  caps: { speak: false, listen: false, scene: true },
};

/**
 * What the screen shows for an address before anybody has typed anything. The server and
 * the browser both call this with the same pathname, so the prerendered HTML and the
 * hydrating render agree.
 */
export function sessionFor(pathname: string): { entries: Entry[]; cwd: string; program: Program } {
  const path = clean(pathname);
  const boot: Entry = { id: 0, cwd: '~', program: 'shell', links: 'shell', cmd: null, out: bootBlocks() };
  const one = (entry: Omit<Entry, 'id' | 'cwd'>, cwd = '~', program: Program = entry.links) => ({
    entries: [boot, { id: 1, cwd: '~', ...entry }],
    cwd,
    program,
  });

  // The arcade and the demo take the whole screen. Underneath them, the menu is waiting.
  if (path === '/' || viewFor(path) !== 'terminal') {
    return one({ program: 'menu', links: 'menu', cmd: null, out: menuBlocks(), screen: true });
  }
  if (path === '/tour') {
    const typed = interpret('tour', { ...SERVER_CTX, program: 'shell', cwd: '~' });
    return one({ program: 'shell', links: 'shell', cmd: 'tour', out: typed.out });
  }
  const cmd = commandForUrl(path);
  if (!cmd) return one({ program: 'shell', links: 'shell', cmd: null, out: notFoundBlocks() });
  const result = interpret(cmd, { ...SERVER_CTX, program: 'shell', cwd: '~' });
  const handover = result.effects.find((e) => e.e === 'program');
  const program = handover?.e === 'program' ? handover.program : 'shell';
  return one({ program: 'shell', links: program, cmd, out: result.out, screen: result.screen }, result.cwd ?? '~', program);
}
