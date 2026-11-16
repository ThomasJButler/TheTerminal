import { ALL_FILES, getNode } from '@/fs/tree';
import { blockLines, inl, p } from '@/fs/md';
import type { Block, FileNode } from '@/fs/types';
import { LINKS, MACHINE } from '@/content/site';
import type { Ctx, Effect, Result } from '@/terminal/types';

/**
 * The operator: an agent with the model taken out.
 *
 * A router decides what kind of question this is, a BM25 index over the files on this
 * machine finds the passages that bear on it, and a confidence check decides whether what
 * came back is good enough to show. It only ever quotes the files, so it cannot invent
 * anything, and when the evidence is thin it says so instead of answering anyway.
 *
 * That is the argument of the ISQ Agent case study, run in a browser: the hard part of a
 * RAG agent is the retrieval, the grounding, the scoring and the audit trail, and none of
 * those care which model you plug in. Here, none is plugged in at all.
 */

/* ─── Text ─── */

const STOP = new Set(
  `a an and are as at be been but by can could did do does doing for from had has have he her him his how i if in
   is it its me my of on or our she so than that the their them then there these they this to was we were what when
   where which who whom why will with would you your yours tom toms butler thomas about tell know any some please much
   many more most really just also into out up over got get give show there's thing things kind sort`.split(/\s+/),
);

/**
 * Words that carry a question along without being what it is about: "what is your
 * experience with RAG" is a question about RAG. Dropped from questions only, never from the
 * files, so a file that says "work" can still be found by a synonym for it.
 */
const FILLER = new Set(
  `experience experienced familiar work worked working think thought opinion feel make made making use like good ever
   currently current main mainly day days`.split(/\s+/),
);

const IRREGULAR: Record<string, string> = {
  used: 'use', using: 'use', uses: 'use', built: 'build', made: 'make', wrote: 'write', written: 'write',
  ran: 'run', running: 'run', left: 'leav', taught: 'teach', paid: 'pay', went: 'go', gone: 'go',
};

const SUFFIXES = ['ments', 'ment', 'ships', 'ship', 'ings', 'ing', 'ers', 'er', 'ies', 'ied', 'ed', 'es', 's', 'ly'];

export function stem(word: string): string {
  if (IRREGULAR[word]) return IRREGULAR[word];
  let w = word;
  for (let pass = 0; pass < 3; pass++) {
    const before = w;
    for (const suffix of SUFFIXES) {
      if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
        w = w.slice(0, -suffix.length) + (suffix === 'ies' || suffix === 'ied' ? 'y' : '');
        break;
      }
    }
    if (w === before) break;
  }
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

/** The words in a piece of text that are worth searching on, as written. */
export function words(text: string, question = false): string[] {
  const all = text.toLowerCase().replace(/[’']s\b/g, '').match(/[a-z0-9#+]+/g) ?? [];
  return all.filter((w) => w.length > 1 && !STOP.has(w) && !(question && FILLER.has(w)));
}

export const tokens = (text: string, question = false): string[] => words(text, question).map(stem);

/** Words a visitor might use that the files do not. Each maps to stems the files do use. */
const ALSO: Record<string, string[]> = {
  job: ['work', 'rol'], career: ['work', 'career'], employ: ['work', 'levocell'],
  hobby: ['interest', 'guitar'], email: ['contact', 'email'], phone: ['contact'], reach: ['contact'],
  hir: ['contact', 'work'], qualification: ['certificat', 'apprentic', 'diploma', 'bootcamp'],
  education: ['certificat', 'bootcamp', 'apprentic'], degree: ['certificat', 'degre'],
  cours: ['certificat', 'bootcamp', 'cours'], languag: ['python', 'typescript', 'swift'],
  framework: ['react', 'fastapi', 'langchain'], tech: ['stack'], technology: ['stack'],
  iphon: ['ios', 'swift'], llm: ['model', 'rag', 'ollama'], privacy: ['devic', 'privat', 'local'],
  sport: ['cricket'], music: ['guitar'], websit: ['sit', 'websit'], test: ['test', 'pytest', 'vitest'],
};

/* ─── The index ─── */

export interface Passage {
  path: string;
  title: string;
  section: string;
  text: string;
  /** Position within its file. The opening lines of a file are usually what it is about. */
  order: number;
  tf: Map<string, number>;
  head: Set<string>;
  len: number;
}

interface Index {
  passages: Passage[];
  byFile: Map<string, Passage[]>;
  df: Map<string, number>;
  avg: number;
}

let cached: Index | null = null;

/** Shorter than this and it is a label, a date or a sign-off, not something to answer with. */
const MIN_PASSAGE = 40;

function passagesOf(file: FileNode): Passage[] {
  const out: Passage[] = [];
  let section = '';
  const add = (text: string) => {
    if (text.trim().length < MIN_PASSAGE) return;
    const tf = new Map<string, number>();
    const body = tokens(text);
    for (const t of body) tf.set(t, (tf.get(t) ?? 0) + 1);
    const name = file.name.replace(/\.(txt|md|log)$/, '').replace(/[-.]/g, ' ');
    out.push({
      path: file.path, title: file.title, section, text, order: out.length, tf, len: body.length,
      head: new Set(tokens(`${file.title} ${name} ${section}`)),
    });
  };
  for (const block of file.blocks()) {
    if (block.k === 'h') {
      if (block.level > 1) section = block.text;
      continue;
    }
    if (block.k === 'img' || block.k === 'ls' || block.k === 'tree' || block.k === 'pre' || block.k === 'menu') continue;
    // A row that only holds a link says nothing a visitor asked about.
    const lines = blockLines([block]).filter((line) => !line.startsWith('LINK:'));
    const whole = lines.join(' · ');
    // A table of sentences is searched a row at a time. A table of labels reads better whole.
    const sentences = block.k === 'kv' && lines.every((line) => line.length >= 40);
    if ((block.k === 'list' || block.k === 'kv') && !sentences && whole.length <= 460) add(whole);
    else for (const line of lines) add(line);
  }
  return out;
}

function index(): Index {
  if (cached) return cached;
  const passages = ALL_FILES.flatMap(passagesOf);
  const df = new Map<string, number>();
  const byFile = new Map<string, Passage[]>();
  for (const passage of passages) {
    for (const t of new Set([...passage.tf.keys(), ...passage.head])) df.set(t, (df.get(t) ?? 0) + 1);
    byFile.set(passage.path, [...(byFile.get(passage.path) ?? []), passage]);
  }
  cached = { passages, byFile, df, avg: passages.reduce((n, x) => n + x.len, 0) / passages.length };
  return cached;
}

const idf = (ix: Index, term: string) => {
  const n = ix.df.get(term) ?? 0;
  return Math.log(1 + (ix.passages.length - n + 0.5) / (n + 0.5));
};

export interface Hit {
  passage: Passage;
  score: number;
  /** How much of the question this passage covers, weighted so rare words count for more. */
  coverage: number;
  /** The same, counting only words in the passage itself and not in the heading above it. */
  body: number;
}

export function retrieve(question: string, only?: string, ignore: string[] = []): { hits: Hit[]; terms: string[] } {
  const ix = index();
  const skip = new Set(ignore);
  const terms = [...new Set(tokens(question, true))].filter((t) => !skip.has(t));
  const groups = terms.map((t) => [t, ...(ALSO[t] ?? [])]);
  // A word that appears nowhere on the machine weighs as much as the rarest word that does:
  // not finding it is strong evidence that the question is about something else.
  const weights = groups.map((g) => Math.max(...g.map((t) => idf(ix, t))));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const pool = only ? (ix.byFile.get(only) ?? []) : ix.passages;

  const hits: Hit[] = [];
  for (const passage of pool) {
    let score = 0;
    let covered = 0;
    let body = 0;
    groups.forEach((group, i) => {
      let best = 0;
      let inBody = false;
      let inHead = false;
      for (const t of group) {
        const tf = passage.tf.get(t) ?? 0;
        let s = tf ? (idf(ix, t) * tf * 2.4) / (tf + 1.4 * (0.4 + (0.6 * passage.len) / ix.avg)) : 0;
        if (tf) inBody = true;
        if (passage.head.has(t)) {
          inHead = true;
          s += idf(ix, t);
        }
        best = Math.max(best, s);
      }
      // Sitting under a heading that has the word is weaker evidence than containing it.
      if (inBody) {
        covered += weights[i];
        body += weights[i];
      } else if (inHead) covered += weights[i] * 0.6;
      score += best;
    });
    if (score > 0) hits.push({ passage, score: score + 0.35 / (1 + passage.order), coverage: covered / total, body: body / total });
  }
  hits.sort((a, b) => b.score - a.score);
  return { hits, terms };
}

/* ─── Things with names ─── */

const GENERIC = new Set(
  `the and for app project projects portfolio code generator news map collection learning showcase analytics protocol
   league premier big bang canvas python react dotnet css sql ball job hunter property agent mastering commercial
   version gallery perspective arcade matrix independent clients agents timetravel`.split(/\s+/),
);

let named: { phrase: string; path: string }[] | null = null;

function entities() {
  if (named) return named;
  const out: { phrase: string; path: string }[] = [];
  const words = new Map<string, string[]>();
  for (const file of ALL_FILES) {
    const dir = file.path.split('/')[1];
    if (dir !== 'projects' && dir !== 'work' && dir !== 'blog') continue;
    const name = file.name.replace(/\.(txt|md|log)$/, '');
    const title = file.title.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    out.push({ phrase: name.replace(/-/g, ' '), path: file.path }, { phrase: title, path: file.path });
    if (title.startsWith('the ')) out.push({ phrase: title.slice(4), path: file.path });
    if (dir === 'blog') {
      // "Context Engineering 101" should answer to "context engineering".
      const plain = title.replace(/ \d+$/, '');
      if (plain !== title && plain.includes(' ')) out.push({ phrase: plain, path: file.path });
      continue;
    }
    for (const word of name.split('-')) {
      if (word.length >= 3 && !GENERIC.has(word)) words.set(word, [...(words.get(word) ?? []), file.path]);
    }
  }
  // A single word names a file only if no other file could mean it.
  for (const [word, paths] of words) if (paths.length === 1) out.push({ phrase: word, path: paths[0] });
  out.push(
    { phrase: 'agency', path: '~/work/fuelius.txt' },
    { phrase: 'clients', path: '~/work/clients.txt' },
    { phrase: 'client', path: '~/work/clients.txt' },
    { phrase: 'aitomatic', path: '~/work/independent.txt' },
    { phrase: 'time travel', path: '~/versions/history.txt' },
    { phrase: 'timetravel', path: '~/versions/history.txt' },
    { phrase: 'case study', path: '~/projects/isq-agent.md' },
  );
  named = out.sort((a, b) => b.phrase.length - a.phrase.length);
  return named;
}

function entityIn(question: string) {
  const padded = ` ${question} `;
  return entities().find((e) => padded.includes(` ${e.phrase} `));
}

/* ─── Output ─── */

type Confidence = 'high' | 'medium' | 'low';

/**
 * The share of a question a passage has to cover before it is shown at all. At 0.5,
 * "what is the meaning of life" was answered from a passage that merely contained "life".
 */
const ENOUGH = 0.6;

const SPOKEN = 300;

function spoken(text: string): string {
  if (text.length <= SPOKEN) return text;
  const cut = text.slice(0, SPOKEN);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '));
  return stop > 80 ? cut.slice(0, stop + 1) : `${cut}…`;
}

function answer(passages: Passage[], trace: { key: string; text: string }[], ctx: Ctx, extra: Block[] = []): Result {
  const out: Block[] = [{ k: 'trace', rows: trace }];
  let from = 0;
  passages.forEach((passage, i) => {
    const next = passages[i + 1];
    const last = !next || next.path !== passage.path;
    const group = passages.slice(from, i + 1 + (last ? 0 : 1));
    // Several passages from different parts of one file: say which part each came from.
    const labelled = passage.section && passages.some((x) => x.path === passage.path && x.section !== passage.section);
    out.push({
      k: 'p',
      inl: labelled
        ? [{ t: 'b', text: `${passage.section}.` }, { t: 'text', text: ` ${passage.text}` }]
        : [{ t: 'text', text: passage.text }],
    });
    if (!last) return;
    out.push({
      k: 'kv',
      rows: [{
        key: 'SOURCE',
        inl: [
          { t: 'path', path: passage.path, text: passage.path },
          ...(passage.section && !labelled && group.length ? [{ t: 'text' as const, text: ` · ${passage.section}` }] : []),
        ],
      }],
    });
    from = i + 1;
  });
  out.push(...extra);
  const effects: Effect[] = ctx.settings.voice && passages[0] ? [{ e: 'say', text: spoken(passages[0].text) }] : [];
  return { out, effects };
}

function say(ctx: Ctx, text: string, blocks: Block[] = [p(text)]): Result {
  return { out: blocks, effects: ctx.settings.voice ? [{ e: 'say', text }] : [] };
}

const first = (path: string, n = 1, section?: RegExp): Passage[] => {
  const all = index().byFile.get(path) ?? [];
  // Within a section, the one-line "who and when" under each heading is not the answer.
  return (section ? all.filter((x) => section.test(x.section) && x.text.length > 60) : all).slice(0, n);
};

/* ─── Routes: the questions this was built for ─── */

interface Route {
  name: string;
  test: RegExp;
  pick: () => Passage[];
  extra?: () => Block[];
}

const ROUTES: Route[] = [
  {
    name: 'what he builds',
    test: /what (do|can|does|could) (you|he|tom) (build|make|do for|offer)|what (you|he) builds?|services|what are you good at/,
    pick: () => first('~/build.txt', 1),
    extra: () => [p('The full list, with something to check for each line: `build.txt`.')],
  },
  {
    name: 'where he works',
    test: /(where|who) (do|does|are|is).*(work|working|employ)|current (job|role|work)|what (do|does) (you|he|tom) do\b|doing (now|these days)|\bnow\b.*\b(work|doing)|levocell/,
    pick: () => [...first('~/now.txt', 1), ...first('~/work/levocell.txt', 1)],
  },
  {
    name: 'where he is',
    test: /where.*\b(live|lives|based|located|from)\b|\blocation\b|which (city|town|country)/,
    pick: () => first('~/README.txt', 1),
  },
  {
    name: 'contact',
    test: /contact|e-?mail|reach|get in touch|linkedin|github|\bcv\b|resume|hire|available|availability|freelance/,
    pick: () => [...first('~/contact.txt', 2).slice(1), ...first('~/now.txt', 1)],
    extra: () => [p('Or write to him from here: [mail](<cmd:mail>).')],
  },
  {
    name: 'stack',
    test: /\bstack\b|tech(nolog(y|ies))?\b|what (languages?|tools|frameworks?)|programming languages?|what (do|does) (you|he) (use|code in|write in)|\bskills?\b|good at|strengths?/,
    pick: () => first('~/skills/stack.txt', 3),
    extra: () => [p('How deep each of those goes: `skills/depth.txt`.')],
  },
  {
    name: 'education',
    test: /qualif|educat|degree|universit|\bstud(y|ied|ying)\b|certificat|courses?\b|bootcamp|apprentice/,
    pick: () => first('~/skills/certificates.txt', 3, /Level 4|Front-End|Cloud Engineering/),
    extra: () => [p('All of them, with dates: `skills/certificates.txt`.')],
  },
  {
    name: 'work history',
    test: /work history|(work|professional) experience|\bexperience$|where (have|has) (you|he|tom) worked|worked (before|previously)|previous (job|role)s?|\bbackground\b|career so far|employment/,
    pick: () => [...first('~/work/levocell.txt', 1), ...first('~/work/independent.txt', 1), ...first('~/work/fuelius.txt', 1)],
  },
  {
    name: 'why software',
    test: /why.*(software|code|coding|develop|tech|chang|switch|career|mov)|career chang/,
    pick: () => [...first('~/journey/before.log', 1, /DWP/), ...first('~/about.txt', 1)],
  },
  {
    name: 'who he is',
    test: /who (is|are) (tom|he|thomas|you\b)|about (tom|him|yourself|you$)|introduce|in a nutshell|summary/,
    pick: () => [...first('~/README.txt', 1), ...first('~/about.txt', 1)],
  },
  {
    name: 'interests',
    test: /hobb|interests?\b|free time|spare time|for fun|outside (of )?work/,
    pick: () => first('~/.interests', 6),
  },
  {
    name: 'earlier versions',
    test: /versions?\b.*\b(site|website|portfolio)|how many versions|(earlier|older|old|previous) (sites?|versions?|websites?)/,
    pick: () => first('~/versions/history.txt', 2),
  },
  {
    name: 'this machine',
    test: /how (was|is|did|do) (this|it|you)\b.*\b(built|made|build|make|work)|what (is|was) this (site|website|machine|terminal|page)|this machine|three\.?js|vt-?100|colophon/,
    pick: () => first('~/.colophon', 3),
  },
];

/**
 * Things that are nobody's business, or that a search would only answer by accident. "How
 * old are you" matched a blog post about deprecating old patterns before this was here.
 */
const PRIVATE = /\b(how old|your age|\bage\b|birthday|born|salary|earn|paid|wage|income|money|married|wife|husband|girlfriend|boyfriend|partner|single|kids|children|religio|politic|vote|home address|phone number|mobile number)\b/;

/** The blog is essays, not facts about Tom. It only answers questions that ask for it. */
const ABOUT_HIM = /\b(you|your|yours|tom|he|his|him)\b/;
const WANTS_WRITING = /\b(blog|post|article|essay|write|wrote|written|writing|think|opinion|view|believe|manifesto|say about)\b/;

const SELF = /^(who|what) are you\b|are you (an? )?(ai|bot|robot|llm|model|human|real|person|chatgpt|gpt|claude|program)|how do you work|what model|which model|are you (alive|sentient)/;

const SAMPLES = [
  'What do you build?',
  'Where do you work now?',
  'What is Sanctuary?',
  'Why did you move into software?',
  'How do I reach you?',
];

export function operatorIntro(): Block[] {
  return [
    { k: 'banner', text: 'OPERATOR' },
    p("Ask me about Tom: what he builds, where he's worked, how to reach him. I answer from the files on this machine and nothing else, and I show my working."),
    { k: 'list', items: SAMPLES.map((q) => inl(`[${q}](<cmd:${q.toLowerCase().replace(/\?$/, '')}>)`)) },
    p('There is no language model in here and nothing you type leaves this page. [voice on](<cmd:voice on>) reads answers out, [talk](<cmd:talk>) listens, [help](<cmd:help>) lists what else I can do, [exit](<cmd:exit>) goes back to the menu.', true),
  ];
}

function help(): Block[] {
  return [
    { k: 'h', level: 2, text: 'What I can do' },
    {
      k: 'kv',
      rows: [
        { key: 'ask', inl: inl('anything about Tom. If it is not in the files I will say so') },
        { key: 'open …', inl: inl('"open the sanctuary project", "show me the clients"') },
        { key: 'do …', inl: inl('"play a game", "make it amber", "run the demo", "mail"') },
        { key: 'voice on', inl: inl('I read my answers out. `voice off` stops me') },
        { key: 'talk', inl: inl('I listen for one question, answer it, and listen again') },
        { key: 'ls, cat, grep', inl: inl('shell commands work here too') },
        { key: 'exit', inl: inl('back to the main menu') },
      ],
    },
  ];
}

/** Shell commands the operator hands straight to the shell, as a tool call. */
const SHELL = new Set(
  `ls ll dir cd cat open less more read view pwd tree grep find search history clear cls set setup settings mail
   menu home shell terminal arcade games play demo tour adventure progress found man fortune finger`.split(/\s+/),
);

export function operate(line: string, ctx: Ctx, shell: (line: string) => Result): Result {
  const raw = line.trim();
  if (!raw) return { out: [], effects: [] };
  const q = raw.toLowerCase().replace(/[^a-z0-9#+.' -]+/g, ' ').replace(/\s+/g, ' ').trim();
  const word = q.split(' ')[0];

  /* Housekeeping */
  if (/^(exit|quit|bye|goodbye|logout)$/.test(q)) {
    return { out: [p('Goodbye.', true)], effects: [{ e: 'program', program: 'menu' }] };
  }
  if (q === 'help' || q === '?') return { out: help(), effects: [] };
  if (/^(hi|hello|hey|hiya|morning|afternoon|evening)\b/.test(q) && q.split(' ').length <= 3) {
    return say(ctx, "Hello. I'm the operator. Ask me about Tom: what he builds, where he's worked, how to reach him.");
  }
  if (/^(thanks|thank you|cheers|ta)\b/.test(q)) return say(ctx, 'Any time.');

  /* Voice */
  const voice = q.match(/^voice (on|off)$/);
  if (voice) {
    if (voice[1] === 'on' && !ctx.caps.speak) return { out: [{ k: 'err', text: 'This browser has no speech synthesis, so I have no voice here.' }], effects: [] };
    const on = voice[1] === 'on';
    return {
      out: [p(on ? 'Voice on. I will read my answers out.' : 'Voice off.', true)],
      effects: [{ e: 'set', patch: { voice: on } }, ...(on ? [{ e: 'say' as const, text: 'Voice on.' }] : [])],
    };
  }
  if (/^(talk|listen|speak|voice)$/.test(q)) {
    if (!ctx.caps.listen) {
      return { out: [{ k: 'err', text: 'This browser has no speech recognition. Chrome, Edge and Safari do. You can still type.' }], effects: [] };
    }
    return {
      out: [
        p('Listening. Ask your question out loud.'),
        p('Your browser does the listening, not this site. In Chrome and Safari that can mean the audio is sent to Google or Apple to be turned into text. Nothing is sent here: there is no server to send it to.', true),
      ],
      effects: [{ e: 'set', patch: { voice: ctx.caps.speak } }, { e: 'listen' }],
    };
  }

  /* About itself */
  if (SELF.test(q)) {
    return say(
      ctx,
      "I'm the operator. A router, a search index and a confidence check, all running in your browser. There is no language model in here.",
      [
        p(`I'm the operator. Three parts, all running in your browser: a router that works out what kind of question this is, a search index over the ${ALL_FILES.length} files on this machine, and a confidence check. There is no language model in here and nothing you type leaves this page.`),
        p("I can only quote what is in the files, which is why I can't make things up, and why I'll tell you when I don't know."),
        p(`Tom builds the kind with a model in it. One of them is written up at \`projects/isq-agent.md\`. If you meant him and not me: [who is tom](<cmd:who is tom>).`, true),
      ],
    );
  }

  /* Tools: things it does rather than says */
  const tool = (cmd: string, why: string): Result => {
    const result = shell(cmd);
    const speak: Effect[] = ctx.settings.voice ? [{ e: 'say', text: why }] : [];
    return {
      ...result,
      out: [{ k: 'trace', rows: [{ key: 'ROUTE', text: 'a thing to do, not a question' }, { key: 'TOOL', text: `shell: ${cmd}` }] }, ...result.out],
      effects: [...speak, ...result.effects],
    };
  };

  const entity = entityIn(q);
  if (entity && /^(open|show|read|cat|display|pull up|bring up|take me to|go to)\b/.test(q)) {
    return tool(`cat ${entity.path}`, `Opening ${getNode(entity.path)?.title ?? 'it'}.`);
  }

  // A line that starts with a shell command and has no small words in it is a shell command.
  if (SHELL.has(word) && !/\b(the|me|my|your|please|some|a|an|is|are|you|it|him|his)\b/.test(q)) {
    const result = shell(raw);
    return { ...result, out: [{ k: 'trace', rows: [{ key: 'TOOL', text: `shell: ${raw}` }] }, ...result.out] };
  }

  const colour = q.match(/\b(amber|green|white)\b/);
  if (colour && /phosphor|colou?r|theme|screen|make it|turn it|go /.test(q)) return tool(`set phosphor ${colour[1]}`, `${colour[1]} it is.`);
  if (!entity) {
    if (/^(lets |let's )?(play|start|open|run|launch)\b.*\b(games?|arcade|trace|decode)\b|\bplay a game\b|^shall we play/.test(q)) return tool('arcade', 'Opening the arcade.');
    if (/\b(run|start|show|play|launch)\b.*\bdemo\b/.test(q)) return tool('demo', 'Running the demo.');
    if (/\b(start|play|run|launch)\b.*\badventure\b/.test(q)) return tool('adventure', 'Starting the adventure.');
  }
  if (/^(mail|message|write to|email) (him|tom|you)\b|^send (him |tom |you )?(a )?(message|mail|email)/.test(q)) return tool('mail', 'Opening a message.');
  if (/\b(list|show)\b.*\b(everything|all files|files)\b/.test(q)) return tool('tree ~', 'Here is everything.');
  if (/\b(list|show|what are|see)\b.*\bprojects\b/.test(q) || q === 'projects') return tool('cd ~/projects', 'Here are the projects.');

  /* A question about something with a name: answer from its own file */
  if (entity) {
    const file = getNode(entity.path);
    const ignore = [...tokens(entity.phrase), ...tokens(file?.title ?? ''), 'project', 'tell'];
    const { hits, terms } = retrieve(q, entity.path, ignore);
    const lede = first(entity.path, 2);
    const aspect = hits.filter((h) => h.coverage > 0).slice(0, 2).map((h) => h.passage);
    const passages = terms.length && aspect.length ? aspect : lede;
    return answer(
      passages,
      [
        { key: 'ROUTE', text: `it has a name: ${file?.title ?? entity.phrase}` },
        { key: 'READ', text: `${entity.path}${terms.length && aspect.length ? `, looking for: ${terms.join(', ')}` : ', from the top'}` },
        { key: 'CONFIDENCE', text: 'high: answered from its own file' },
      ],
      ctx,
      [p(`The whole file: \`${entity.path.slice(2)}\`.`, true)],
    );
  }

  /* A question it was built for */
  const route = ROUTES.find((r) => r.test.test(q));
  if (route) {
    const passages = route.pick();
    return answer(
      passages,
      [
        { key: 'ROUTE', text: `a question I was built for: ${route.name}` },
        { key: 'READ', text: [...new Set(passages.map((x) => x.path))].join(', ') },
        { key: 'CONFIDENCE', text: 'high: I know where this is kept' },
      ],
      ctx,
      route.extra?.(),
    );
  }

  /* Everything else: search, then decide whether the result is good enough to show */
  const found = retrieve(q);
  const terms = found.terms;
  const essays = !ABOUT_HIM.test(q) || WANTS_WRITING.test(q);
  const allowed = PRIVATE.test(q) ? [] : found.hits.filter((h) => essays || !h.passage.path.startsWith('~/blog/'));
  // If anything contains the words themselves, a passage that only sits under them is out.
  const hits = allowed.some((h) => h.body > 0) ? allowed.filter((h) => h.body > 0) : allowed;
  const ix = index();
  const top = hits[0];
  // Shown as the visitor wrote them. The index matches on stems, which read like typos.
  const asked = [...new Set(words(q, true))];
  const trace = [
    { key: 'PARSE', text: asked.length ? asked.join(', ') : 'nothing I can search on' },
    { key: 'SEARCH', text: `${ix.passages.length} passages in ${ALL_FILES.length} files` },
    { key: 'RANK', text: hits.slice(0, 3).map((h) => `${h.passage.path.slice(2)} ${h.score.toFixed(1)}`).join(' · ') || 'no matches' },
  ];
  // One word is not much of a question. Covering all of it earns "medium" at best.
  const confidence: Confidence = !top ? 'low' : top.coverage >= 0.75 && terms.length > 1 ? 'high' : top.coverage >= ENOUGH ? 'medium' : 'low';

  if (confidence === 'low') {
    const term = asked[0];
    const refusal = "I don't have that on file. I'd rather say so than make something up.";
    return {
      out: [
        { k: 'trace', rows: [...trace, { key: 'CONFIDENCE', text: PRIVATE.test(q) ? 'low: not something the files would hold' : top ? `low: the best match covers ${Math.round(top.coverage * 100)}% of the question` : 'low: nothing matched' }] },
        p(refusal),
        p(
          `${top ? `The nearest thing is \`${top.passage.path.slice(2)}\`, and it is not close. ` : ''}${term ? `You could try [grep ${term}](<cmd:grep ${term}>), or ` : 'You could '}ask him yourself: [mail](<cmd:mail>) goes to ${LINKS.email}.`,
          true,
        ),
      ],
      effects: ctx.settings.voice ? [{ e: 'say', text: refusal }] : [],
    };
  }

  // When the best matches all come from one essay, the question is about that essay, and
  // its opening says what it argues better than whichever sentence happened to score.
  const about = top.passage.path;
  if (about.startsWith('~/blog/') && hits.slice(0, 3).every((h) => h.passage.path === about)) {
    return answer(
      first(about, 2),
      [...trace, { key: 'CONFIDENCE', text: `${confidence}: the best matches are all in one essay, so I am reading it from the top` }],
      ctx,
      [p(`The whole essay: \`${about.slice(2)}\`.`, true)],
    );
  }

  // One passage per file, and nothing much weaker than the best one, in score or in how
  // much of the question it covers.
  const seen = new Set<string>();
  const chosen = hits
    .filter((h) => h.score >= top.score * 0.6 && h.coverage >= Math.max(ENOUGH, top.coverage - 0.15))
    .filter((h) => (seen.has(h.passage.path) ? false : (seen.add(h.passage.path), true)))
    .slice(0, 3)
    .map((h) => h.passage);
  return answer(
    chosen,
    [...trace, { key: 'CONFIDENCE', text: `${confidence}: the best match covers ${Math.round(top.coverage * 100)}% of the question` }],
    ctx,
  );
}

export const OPERATOR_NOTE = `An agent on the ${MACHINE} that answers questions about Tom from the files, and shows its working.`;
