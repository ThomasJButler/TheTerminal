import { p } from '@/fs/md';
import type { Block } from '@/fs/types';
import type { Effect } from '@/terminal/types';

/**
 * STANDING START: how Tom got here, as a text adventure in ten rooms.
 *
 * Every fact a room states comes from his own copy (the profile README, the About page and
 * the commercial site): the cricket in Melbourne, the diving, the desks, the DWP caseload,
 * the first line of code in early 2022, the bootcamp, the agency, the redundancy, the solo
 * years, Levocell. The furniture around those facts is invented, and is meant to read that
 * way. THE PROSE IS A DRAFT: it wants rewriting in his own voice before it is trusted.
 *
 * Pure, like the shell: a state and a line in, a state and some blocks out. There are no
 * dead ends. Nothing can be dropped, every room can be walked back to, and HINT always
 * knows the next step.
 */

type Dir = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
type RoomId = 'bedroom' | 'ground' | 'water' | 'desk' | 'jobcentre' | 'bootcamp' | 'agency' | 'legacy' | 'room' | 'now';

export interface AdventureState {
  room: RoomId;
  /** Where each thing you can carry is: a room, 'inv', or 'gone'. */
  where: Record<string, string>;
  flags: Record<string, boolean>;
  moves: number;
  visited: RoomId[];
  done: boolean;
}

export const NEW_GAME: AdventureState = {
  room: 'bedroom',
  where: { notebook: 'bedroom', ball: 'ground', torch: 'water', certificate: 'bootcamp', semicolon: 'legacy' },
  flags: {},
  moves: 0,
  visited: ['bedroom'],
  done: false,
};

type S = AdventureState;
const has = (s: S, id: string) => s.where[id] === 'inv';
const here = (s: S, id: string) => s.where[id] === s.room;

interface Thing {
  names: string[];
  desc: (s: S) => string;
  /** Set for things that live in one room. Things you can carry have none. */
  room?: RoomId;
  taken?: string;
  noTake?: string;
}

const THINGS: Record<string, Thing> = {
  notebook: {
    names: ['notebook', 'book', 'ideas', 'plans'],
    desc: (s) => (s.flags.built ? 'Half of it is crossed off now.' : 'App ideas. Pages of them, and no way to build a single one.'),
    taken: "Taken. You're always the one with the ideas.",
  },
  ball: {
    names: ['ball', 'cricket ball'],
    desc: () => "Red, scuffed down one side. Somebody's been working on it.",
    taken: 'Taken. It fits your hand in a way a mouse never will.',
  },
  torch: {
    names: ['torch', 'light', 'dive torch'],
    desc: () => 'A dive torch. Heavy, yellow and built to be dropped.',
    taken: 'Unclipped. Yours now.',
  },
  certificate: {
    names: ['certificate', 'cert', 'paper'],
    desc: () => "Cloud Engineering and Data Science. They've spelled your name right.",
    taken: 'Taken.',
  },
  semicolon: {
    names: ['semicolon', 'semi colon', 'semi'],
    desc: () => 'Small, curved and extremely important.',
    taken: 'Taken. Carefully.',
  },

  ipod: {
    room: 'bedroom', names: ['ipod', 'ipod touch', 'touch'],
    desc: () => 'Jailbroken. Nobody said you could, which was most of the appeal.',
    noTake: "It stays on the desk. You've already had what you wanted out of it.",
  },
  telly: {
    room: 'bedroom', names: ['telly', 'tv', 'television', 'matrix', 'screen', 'code', 'film'],
    desc: () => "You've seen it more times than you'd admit. You don't know it yet, but you'll be putting that rain on websites for years.",
  },
  sun: { room: 'ground', names: ['sun', 'sky'], desc: () => "It's Melbourne. It does this." },
  grass: { room: 'ground', names: ['grass', 'outfield', 'pitch', 'ground', 'wicket'], desc: () => 'Hard, pale and fast.' },
  helmet: { room: 'water', names: ['helmet'], desc: () => "It's on your head. That's the right place for it." },
  line: { room: 'water', names: ['line', 'rope'], desc: () => 'It goes up. So should you, eventually.' },
  water: { room: 'water', names: ['water', 'sea'], desc: () => 'Cold, dark and not interested in you.' },
  stapler: {
    room: 'desk', names: ['stapler'],
    desc: () => "It works. It's the most reliable thing in the building.",
    noTake: 'It belongs to the office. Most things here do.',
  },
  paperwork: {
    room: 'desk', names: ['paperwork', 'papers', 'paper', 'pile', 'files'],
    desc: () => "Other people's houses and other people's pensions. Careful work, and somebody has to do it.",
  },
  window: { room: 'desk', names: ['window'], desc: () => "Outside, people are making things. You notice that you've noticed." },
  folders: {
    room: 'jobcentre', names: ['folders', 'folder', 'stack', 'caseload', 'people', 'person', 'someone', 'somebody', 'them', 'appointment'],
    desc: () => 'A hundred and fifty of them. You can only ever help one at a time.',
  },
  laptop: {
    room: 'jobcentre', names: ['laptop', 'bag', 'computer'],
    desc: (s) => (s.flags.coded ? "Open. There's a file on the screen with your name at the top." : "Closed. It's early 2022 and you've never written a line of code."),
    noTake: "It's already in your bag.",
  },
  whiteboard: {
    room: 'bootcamp', names: ['whiteboard', 'board', 'cloud'],
    desc: () => "AWS. AZURE. PYTHON. Somebody has drawn a cloud. It isn't to scale.",
  },
  ticket: {
    room: 'agency', names: ['ticket', 'tickets', 'jira'],
    desc: (s) => (s.flags.fixed ? 'Closed. Somebody has already opened another one.' : "'Client site broken since Friday. Nobody knows why. Suspect something in LEGACY.' It's assigned to you. Of course it is."),
    noTake: "It's already yours. That's the problem.",
  },
  templates: {
    room: 'legacy', names: ['templates', 'template', 'code', 'file', 'files'],
    desc: () => "You change nothing. You've learned that much already.",
  },
  workbench: {
    room: 'room', names: ['workbench', 'bench', 'things', 'projects'],
    desc: () => "ModelViz. Morpheus. SQL Ball. The Kicker. An entity-resolution engine with its error bars showing. They're all on the real machine, under projects.",
  },
  phone: {
    room: 'room', names: ['phone', 'sanctuary', 'app', 'iphone'],
    desc: () => "Sanctuary. Everything it knows about you stays on the phone. That isn't a feature. It's the whole design.",
    noTake: "It's a test device. It lives on the desk.",
  },
  terminal: {
    room: 'now', names: ['terminal', 'computer', 'machine', 'tjb', 'tube', 'screen'],
    desc: () => 'A terminal, the old kind. The nameplate says TJB-100.',
    noTake: 'It weighs about as much as you do.',
  },
  keyboard: {
    room: 'now', names: ['keyboard', 'keys'],
    desc: (s) => (s.flags.plugged ? 'Plugged in. It clicks when you press it, the way they used to.' : "Detachable, like the old ones were. It isn't plugged in."),
    noTake: 'It only reaches as far as the cable.',
  },
  badge: { room: 'now', names: ['badge'], desc: () => "JUNIOR AI AGENT DEVELOPER. It's a good badge." },
};

type Exit = { to: RoomId; via?: string } | { no: string };

interface Room {
  title: string;
  desc: (s: S) => string;
  exits: (s: S) => Partial<Record<Dir, Exit>>;
}

const ROOMS: Record<RoomId, Room> = {
  bedroom: {
    title: 'A BEDROOM, SOME TIME IN THE 2000s',
    desc: (s) => `The Matrix is on the telly again, green code running down the screen. On the desk there's an IPOD TOUCH${here(s, 'notebook') ? ' and a NOTEBOOK' : ''}. The door is EAST.`,
    exits: (s) => ({
      east: has(s, 'notebook')
        ? { to: 'ground', via: 'You step out of the bedroom and, the way memory does it, straight onto grass.' }
        : { no: "You get as far as the door and go back. You're not leaving the NOTEBOOK behind." },
    }),
  },
  ground: {
    title: 'A CRICKET GROUND IN MELBOURNE',
    desc: (s) => `Victorian Premier League, and this is your job. Two seasons of it. The sun is doing its thing and the outfield is as hard as a car park${here(s, 'ball') ? ". There's a BALL in the grass" : ''}. The bedroom is back WEST. To the EAST the grass runs out.`,
    exits: () => ({
      west: { to: 'bedroom' },
      east: { to: 'water', via: "The grass gives way to water, and you're under it before you've thought about it." },
    }),
  },
  water: {
    title: 'UNDER THE SURFACE',
    desc: (s) => `Commercial diving. Of everything you've done, this is the one nobody could call a safe choice. It's cold, it's loud inside the helmet, and you can see about a metre${here(s, 'torch') ? '. A TORCH is clipped to the line' : ''}. The only sensible direction is UP.`,
    exits: () => ({
      up: { to: 'desk', via: 'You come up through the surface and into strip lighting.' },
      west: { to: 'ground', via: 'You wade back out onto the grass.' },
      down: { no: "That's quite deep enough." },
    }),
  },
  desk: {
    title: 'A DESK. THEN ANOTHER DESK',
    desc: () => "Paraplanning in financial services, then a conveyancing desk in Southport. The safe choices. There's a STAPLER, a pile of other people's PAPERWORK, and a WINDOW. Not a line of code in any of it. The way on is EAST.",
    exits: () => ({ east: { to: 'jobcentre' }, down: { to: 'water', via: 'Back under. It was simpler down here.' } }),
  },
  jobcentre: {
    title: 'A JOBCENTRE',
    desc: (s) => `You're a Work Coach now. Twenty appointments a day and a hundred and fifty people on your caseload, most of them young, all of them after a career they'd actually want. A stack of FOLDERS covers the desk, and your LAPTOP is in your bag. ${s.flags.coded ? "To the EAST there's a door that wasn't there before." : "There's nothing to the EAST. Not yet."}`,
    exits: (s) => ({
      west: { to: 'desk' },
      east: s.flags.coded ? { to: 'bootcamp' } : { no: "There's nothing east of here yet. You'd have to make it." },
    }),
  },
  bootcamp: {
    title: 'A BOOTCAMP, EARLY 2023',
    desc: (s) => `Cloud engineering and data science, with The Growth Company. The WHITEBOARD says AWS, AZURE and PYTHON, each underlined twice${here(s, 'certificate') ? ". There's a CERTIFICATE on the table, still warm from the printer" : ''}. The jobcentre is back WEST. To the EAST, somebody is hiring apprentices.`,
    exits: () => ({ west: { to: 'jobcentre' }, east: { to: 'agency', via: 'August 2023. You take the job.' } }),
  },
  agency: {
    title: 'AN AGENCY IN CHESTER',
    desc: (s) => `You're an apprentice developer at a HubSpot agency: Umbraco, HubL, SCSS, and JIRA tickets with your name on them. In time, twelve client sites, an NHS trust among them. This is where you learn the fundamentals, and to question everything. A door marked LEGACY is to the NORTH. ${s.flags.fixed ? 'The way EAST is open.' : 'The way EAST is blocked by a TICKET that nobody wants.'}`,
    exits: (s) => ({
      north: { to: 'legacy' },
      west: { to: 'bootcamp' },
      east: s.flags.fixed ? { to: 'room' } : { no: "The TICKET is still open. You don't walk past an open ticket." },
    }),
  },
  legacy: {
    title: 'LEGACY',
    desc: (s) =>
      has(s, 'torch')
        ? `By torchlight: years of somebody else's TEMPLATES, stacked to the ceiling, every one of them load-bearing${here(s, 'semicolon') ? '. In the middle of it all, a single SEMICOLON has fallen out of a file' : ''}. The agency is back SOUTH.`
        : "It's dark in here, and none of it is documented. You can't see a thing. The agency is back SOUTH.",
    exits: () => ({ south: { to: 'agency' } }),
  },
  room: {
    title: 'A ROOM OF YOUR OWN',
    desc: (s) => `A desk, and nobody else. No clients, no boss, no salary. You build anyway, around whatever work keeps the lights on: RAG pipelines, agent tooling, a matcher for two government registers that share no key. A WORKBENCH is covered in half-finished things, and a PHONE on the desk is running an app called Sanctuary. ${s.flags.built ? 'To the EAST, a door is open.' : "Something is missing, and you've been carrying it since the bedroom."}`,
    exits: (s) => ({
      west: { to: 'agency' },
      east: s.flags.built ? { to: 'now', via: 'September 2026.' } : { no: "Not yet. You came here to build something, and you're still holding the plans." },
    }),
  },
  now: {
    title: 'NOW',
    desc: (s) => `By day it's Levocell, a sustainable AI smart energy company in Buckinghamshire, and the BADGE says Junior AI Agent Developer. By night it's this desk. There's a TERMINAL on it, switched off, and a KEYBOARD on the floor, ${s.flags.plugged ? 'plugged in' : 'not plugged in'}.`,
    exits: () => ({ west: { to: 'room' } }),
  },
};

const dark = (s: S) => s.room === 'legacy' && !has(s, 'torch');

/* ─── Parsing ─── */

const DIRS: Record<string, Dir> = {
  n: 'north', north: 'north', s: 'south', south: 'south', e: 'east', east: 'east', w: 'west', west: 'west',
  u: 'up', up: 'up', d: 'down', down: 'down', surface: 'up',
};

const MULTI: [string, string][] = [
  ['pick up', 'take'], ['look at', 'examine'], ['look around', 'look'], ['turn on', 'use'], ['switch on', 'use'],
  ['power on', 'use'], ['plug in', 'use'], ['put down', 'drop'], ['type on', 'use'], ['log in', 'use'], ['go to', 'go'],
];

const VERB: Record<string, string> = {
  l: 'look', look: 'look', i: 'inventory', inv: 'inventory', inventory: 'inventory',
  x: 'examine', examine: 'examine', inspect: 'examine', read: 'examine', check: 'examine', search: 'examine',
  take: 'take', get: 'take', grab: 'take', collect: 'take', steal: 'take',
  drop: 'drop', leave: 'drop', throw: 'drop',
  use: 'use', open: 'use', boot: 'use', start: 'use', fix: 'use', close: 'use', repair: 'use', solve: 'use',
  plug: 'use', connect: 'use', press: 'use', push: 'use', type: 'use', write: 'use', code: 'use', turn: 'use',
  switch: 'use', power: 'use', help: 'help',
  go: 'go', walk: 'go', run: 'go', head: 'go', climb: 'go', swim: 'go', enter: 'go',
  hint: 'hint', hints: 'hint', stuck: 'hint', score: 'score', save: 'save', restart: 'restart', reset: 'restart',
  wait: 'wait', z: 'wait', talk: 'talk', ask: 'talk', say: 'talk', shout: 'talk', xyzzy: 'xyzzy', plugh: 'xyzzy',
};

function parse(input: string): { verb: string; noun: string; target: string } {
  let s = input.toLowerCase().replace(/[^a-z0-9 ?]+/g, ' ').replace(/\b(the|a|an|my|some|that|this|one)\b/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [from, to] of MULTI) {
    if (s === from || s.startsWith(`${from} `)) {
      s = to + s.slice(from.length);
      break;
    }
  }
  const [word = '', ...rest] = s.split(' ');
  if (DIRS[word] && !rest.length) return { verb: 'go', noun: DIRS[word], target: '' };
  if (word === '?') return { verb: 'help', noun: '', target: '' };
  const remainder = rest.join(' ');
  const split = remainder.match(/^(.*?) (?:on|with|in|into|to|at) (.+)$/);
  return { verb: VERB[word] ?? word, noun: (split ? split[1] : remainder).trim(), target: split ? split[2].trim() : '' };
}

function find(noun: string, s: S): string | undefined {
  if (!noun) return undefined;
  const words = noun.split(' ');
  return Object.keys(THINGS).find((id) => {
    const thing = THINGS[id];
    const visible = thing.room ? thing.room === s.room : here(s, id) || has(s, id);
    return visible && thing.names.some((name) => name === noun || words.includes(name));
  });
}

/* ─── Output ─── */

function roomBlocks(s: S): Block[] {
  return [{ k: 'h', level: 2, text: ROOMS[s.room].title }, p(ROOMS[s.room].desc(s))];
}

const DOOR = "It's a door. Doors are for going through: try a direction.";
const INTRO = "How I got here, in ten rooms. It's a text adventure, so you type what you want to do.";
const HOWTO = "LOOK. GO EAST, or just E. TAKE, EXAMINE (or X), USE, INVENTORY (or I). HINT if you're stuck, QUIT to leave. Your place is saved on this device.";

export function adventureIntro(s: S): Block[] {
  const resumed = s.moves > 0;
  return [
    { k: 'banner', text: 'STANDING START' },
    p(INTRO),
    p(resumed ? `Picking up where you left off, ${s.moves} moves in. RESTART starts again, HINT helps, QUIT leaves.` : HOWTO, true),
    ...(s.done ? [p('You have finished this one. RESTART plays it again.')] : roomBlocks(s)),
  ];
}

export function hint(s: S): string {
  switch (s.room) {
    case 'bedroom': return has(s, 'notebook') ? 'The door is EAST.' : 'TAKE the notebook.';
    case 'ground': return 'There is nothing you must do here. EAST goes on.';
    case 'water': return has(s, 'torch') ? 'UP.' : 'TAKE the torch. It gets dark later on.';
    case 'desk': return 'Nothing here needs you. EAST.';
    case 'jobcentre': return s.flags.coded ? 'EAST, through the door you made.' : 'There is a LAPTOP in your bag. OPEN it.';
    case 'bootcamp': return 'EAST, when you are ready.';
    case 'agency':
      if (s.flags.fixed) return 'EAST.';
      if (has(s, 'semicolon')) return 'USE the semicolon on the ticket.';
      return has(s, 'torch') ? 'The answer is in LEGACY, to the NORTH.' : 'LEGACY is dark. There was a TORCH under the water, a long way WEST.';
    case 'legacy':
      if (!has(s, 'torch')) return 'You need a light. There was a TORCH under the water.';
      return here(s, 'semicolon') ? 'TAKE the semicolon.' : 'Back SOUTH, and close that ticket.';
    case 'room': return s.flags.built ? 'EAST.' : 'USE the notebook.';
    case 'now': return s.flags.plugged ? 'TURN ON the terminal.' : 'PLUG IN the keyboard.';
  }
}

const SOUVENIRS: [string, string][] = [
  ['notebook', 'a notebook of ideas'], ['ball', 'a cricket ball'], ['torch', 'a dive torch'], ['certificate', 'a certificate'],
];

const joined = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

export interface AdventureResult {
  state: AdventureState;
  out: Block[];
  effects: Effect[];
}

export function adventure(line: string, state: AdventureState): AdventureResult {
  const raw = line.trim();
  if (!raw) return { state, out: [], effects: [] };
  const { verb, noun, target } = parse(raw);
  const say = (text: string, next: S = s): AdventureResult => ({ state: next, out: text.split('\n').map((t) => p(t)), effects: [] });

  if (verb === 'quit' || verb === 'exit' || verb === 'q' || verb === 'menu') {
    return { state, out: [p('Saved. It will be here when you come back.', true)], effects: [{ e: 'program', program: 'menu' }] };
  }
  if (verb === 'restart') {
    return { state: NEW_GAME, out: [p('From the top.', true), ...roomBlocks(NEW_GAME)], effects: [] };
  }

  const s: S = { ...state, moves: state.moves + 1 };

  if (verb === 'help') {
    // In the jobcentre, HELP SOMEONE is the right thing to type.
    if (noun && s.room === 'jobcentre') return use('folders');
    return { state, out: [p(HOWTO), p('Other things I understand: OPEN, TURN ON, PLUG IN, READ, SCORE, RESTART.', true)], effects: [] };
  }
  if (verb === 'hint') return { state, out: [p(s.done ? 'It is finished. RESTART, or QUIT.' : hint(state))], effects: [] };
  if (verb === 'score') {
    const kept = SOUVENIRS.filter(([id]) => has(state, id)).length;
    return { state, out: [p(`${state.moves} moves. ${state.visited.length} of ${Object.keys(ROOMS).length} rooms. ${kept} of ${SOUVENIRS.length} things worth keeping.`)], effects: [] };
  }
  if (verb === 'save') return { state, out: [p('It saves itself, every move.')], effects: [] };

  if (s.done) return { state, out: [p("The story's finished. RESTART plays it again, QUIT goes back to the main menu.")], effects: [] };

  switch (verb) {
    case 'look':
      if (noun) return examine();
      return { state: s, out: roomBlocks(s), effects: [] };

    case 'inventory': {
      const carried = Object.keys(s.where).filter((id) => has(s, id)).map((id) => THINGS[id].names[0]);
      return say(carried.length ? `You're carrying: ${joined(carried)}.` : "You're carrying nothing. Travelling light.");
    }

    case 'examine':
      return examine();

    case 'take': {
      if (dark(s)) return say("You can't see well enough to do that. It's dark, and you didn't bring a light.");
      if (noun === 'all' || noun === 'everything') {
        const ids = Object.keys(s.where).filter((id) => here(s, id));
        if (!ids.length) return say("There's nothing here to take.");
        const where = { ...s.where };
        for (const id of ids) where[id] = 'inv';
        return say(ids.map((id) => THINGS[id].taken ?? 'Taken.').join('\n'), { ...s, where });
      }
      const id = find(noun, s);
      if (!id) return say(noun ? `You can't see any "${noun}" here.` : 'Take what?');
      if (has(s, id)) return say("You've already got it.");
      if (THINGS[id].room) return say(THINGS[id].noTake ?? 'That stays where it is.');
      return say(THINGS[id].taken ?? 'Taken.', { ...s, where: { ...s.where, [id]: 'inv' } });
    }

    case 'drop':
      return say("You hang on to it. You'll want it later.");

    case 'use': {
      if (dark(s)) return say("You can't see well enough to do that.");
      const id = find(noun, s) ?? find(target, s);
      // WRITE CODE is a fair thing to type in the room where that first happens.
      if (!id && s.room === 'jobcentre' && /\b(code|type|write|program)\b/.test(raw.toLowerCase())) return use('laptop');
      if (!id && /\bdoor\b/.test(noun)) return say(DOOR);
      if (!id) return say(noun ? `You can't see any "${noun}" here.` : 'Use what?');
      return use(id);
    }

    case 'go': {
      const dir = DIRS[noun];
      if (!dir) return say(noun ? "That isn't a direction I know. Try NORTH, SOUTH, EAST, WEST, UP or DOWN." : 'Go where?');
      const exit = ROOMS[s.room].exits(s)[dir];
      if (!exit) return say("You can't go that way.");
      if ('no' in exit) return say(exit.no);
      const moved: S = { ...s, room: exit.to, visited: s.visited.includes(exit.to) ? s.visited : [...s.visited, exit.to] };
      return { state: moved, out: [...(exit.via ? [p(exit.via, true)] : []), ...roomBlocks(moved)], effects: [] };
    }

    case 'wait':
      return say('Time passes. It was going to anyway.');
    case 'talk':
      return say("Nobody answers. They're busy, or they're a memory.");
    case 'xyzzy':
      return say('Nothing happens. Wrong machine.');
    default:
      return { state, out: [p(`I don't know how to "${raw.split(' ')[0].toLowerCase()}". HELP lists what I do know, and HINT says what to try.`)], effects: [] };
  }

  function examine(): AdventureResult {
    if (dark(s)) return say("You can't see well enough to do that. It's dark, and you didn't bring a light.");
    const id = find(noun, s);
    if (!id && /\bdoor\b/.test(noun)) return say(DOOR);
    if (!id) return say(noun ? `You can't see any "${noun}" here.` : 'Examine what?');
    return say(THINGS[id].desc(s));
  }

  function use(id: string): AdventureResult {
    const flag = (name: string): S => ({ ...s, flags: { ...s.flags, [name]: true } });
    switch (id) {
      case 'folders':
        return s.flags.helped
          ? say('You take the next one. It takes the whole appointment too.')
          : say("You take the top folder and do it properly. It takes the whole appointment. A hundred and forty-nine to go.\nThat's the whole reason you move into software.", flag('helped'));
      case 'laptop':
        return s.flags.coded
          ? say("It's open. You're past the first line now.")
          : say('Early 2022. Evenings, around the day job, from a standing start. You type your first line of code, purely for fun. Then a second.\nA door appears to the EAST.', flag('coded'));
      case 'notebook':
        if (s.room === 'room' && !s.flags.built) {
          return say('You open the notebook from the bedroom. Every idea in it is something you now know how to build. You pick one and start.\nA door opens to the EAST.', flag('built'));
        }
        return say(s.flags.built ? 'Half of it is crossed off now.' : "App ideas. You still can't build them. Not yet.");
      case 'semicolon':
      case 'ticket':
        if (s.room !== 'agency') return say("There's nothing here that needs one.");
        if (s.flags.fixed) return say("It's closed. Leave it closed.");
        if (!has(s, 'semicolon')) return say("You read it again. It's still broken, and the answer is still somewhere in LEGACY.");
        return say(
          "You put the semicolon back where it goes. The build goes green, the ticket closes, and for a moment the whole agency is quiet.\nThen it's December 2024, and the letter says redundancy. The way EAST is open, whether you're ready or not.",
          { ...flag('fixed'), where: { ...s.where, semicolon: 'gone' } },
        );
      case 'torch':
        return say("It's on. It's always on. That's the only setting.");
      case 'keyboard':
        return s.flags.plugged ? say("It's plugged in. Go on, then.") : say('You plug the keyboard in. It clicks, the way keyboards used to.', flag('plugged'));
      case 'terminal': {
        if (!s.flags.plugged) return say('The tube warms up, and then waits. It wants a keyboard.');
        const kept = SOUVENIRS.filter(([thing]) => has(s, thing)).map(([, label]) => label);
        return {
          state: { ...s, done: true },
          effects: [{ e: 'bell' }],
          out: [
            p('The tube warms up. Green text walks across the screen:'),
            { k: 'banner', text: 'TJB-100 · ONLINE' },
            p("You've seen this screen before. You're looking at it now."),
            { k: 'rule' },
            p(`You finished STANDING START in ${s.moves} moves, carrying ${joined(kept)}. None of it was wasted.`),
            p('[restart](<cmd:restart>) plays it again, and [quit](<cmd:quit>) goes back to the main menu. The real projects are in the shell, under `projects/`.', true),
          ],
        };
      }
      case 'phone':
        return say('Sanctuary opens. A slow circle, breathing. Nothing asks you for anything.');
      case 'ball':
        return say('You toss it up and catch it. Still got it.');
      case 'ipod':
        return say("It does what you've made it do, which isn't useful yet.");
      case 'stapler':
        return say("Stapled. To what, it doesn't matter.");
      case 'certificate':
        return say("You hold it up. Nobody's checking.");
      default:
        return say('Nothing happens.');
    }
  }
}

export const ADVENTURE_NOTE = 'How Tom got here, as a text adventure in ten rooms.';
