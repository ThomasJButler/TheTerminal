import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FORTUNES, MENU } from '@/content/site';
import { p } from '@/fs/md';
import { nodeForUrl, urlFor } from '@/fs/tree';
import type { Block } from '@/fs/types';
import { NEW_GAME, adventureIntro, type AdventureState } from '@/programs/adventure';
import type { SceneHandle } from '@/scene/SceneLayer';
import type { TtyApi } from '@/terminal/Blocks';
import type { ZoomState } from '@/terminal/Overlays';
import { complete, progress } from '@/terminal/commands';
import { clean, commandForUrl, gameIn, interpret, metaFor, notFoundBlocks, sessionFor, viewFor } from '@/terminal/interpret';
import type { Ctx, Entry, Program } from '@/terminal/types';
import { DEFAULT_SETTINGS, load, loadSettings, save, saveSettings, type Settings } from './settings';
import { PATCHES, measure, sound, tunePatch, type Patch } from './sound';
import { canListen, canSpeak, explain, listen, speak, stopSpeaking } from './speech';

/**
 * The machine: everything that is state. The session on the screen, which program has the
 * prompt, what this device remembers, whether anyone is sitting at it, and the parts that
 * make noise. The components that draw it hold nothing of their own.
 */

export interface LiveEntry extends Entry {
  /** Changes each time the entry should print itself down the screen again. */
  fresh?: number;
  /** Held back, invisible, until the lines before it have printed. */
  wait?: boolean;
}

const FOUND_KEY = 'tjb100.found';
const SEEN_KEY = 'tjb100.seen';
const ADVENTURE_KEY = 'tjb100.adventure';
const CALLS_KEY = 'tjb100.calls';
const CALLED_KEY = 'tjb100.called';

/** What the tour types. The highlights, in the order a stranger would want them. */
const TOUR = ['cat now.txt', 'ls projects', 'cat projects/sanctuary.md', 'cat work/fuelius.txt', 'ask what do you build', 'cat contact.txt'];

const session = {
  get(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch {
      /* Storage is off. The intro just plays again next time. */
    }
  },
};

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms: number) => new Promise<void>((done) => window.setTimeout(done, ms));

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function useMachine() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = clean(location.pathname);
  const view = viewFor(path);
  const game = gameIn(path);

  // The session an address opens on. Computed once: after that the terminal owns its own
  // state and the address follows it, not the other way round.
  const initial = useMemo(() => sessionFor(path), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [entries, setEntries] = useState<LiveEntry[]>(initial.entries);
  const [cwd, setCwd] = useState(initial.cwd);
  const [program, setProgram] = useState<Program>(initial.program);
  const [adventure, setAdventure] = useState<AdventureState>(NEW_GAME);
  const [input, setInput] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [menuAt, setMenuAt] = useState(0);

  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [found, setFound] = useState<ReadonlySet<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const [calls, setCalls] = useState(0);
  const [motd, setMotd] = useState(FORTUNES[0]);
  const [clock, setClock] = useState('');
  const [caps, setCaps] = useState({ speak: false, listen: false, scene: true });
  const [cols, setCols] = useState(80);

  const [outside, setOutside] = useState<'no' | 'yes' | 'entering'>('no');
  const [sceneWanted, setSceneWanted] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const [touring, setTouring] = useState(false);
  const [listening, setListening] = useState(false);

  const sceneRef = useRef<SceneHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const history = useRef<string[]>([]);
  const historyAt = useRef(-1);
  const nextId = useRef(initial.entries.length);
  const nonce = useRef(0);
  /** The terminal's own address: where to come back to after the arcade or the demo. */
  const lastUrl = useRef(view === 'terminal' ? path : '/');
  const outsideRef = useRef<'no' | 'yes' | 'entering'>('no');
  const connected = useRef(false);
  const wantsStepBack = useRef(false);
  const focusNext = useRef(false);
  const tourToken = useRef(0);
  const touringRef = useRef(false);
  const handsFree = useRef(false);
  const listeningRef = useRef(false);
  const stopListening = useRef<(() => void) | null>(null);

  // What the callbacks read, so none of them goes stale and none needs re-creating.
  const live = useRef({ cwd, program, settings, found, adventure, caps, path, view, dialog: false });
  live.current = { cwd, program, settings, found, adventure, caps, path, view, dialog: paletteOpen || mailOpen || zoom !== null };

  const append = useCallback((out: Block[], as: Program = 'shell', screen = false) => {
    const entry: LiveEntry = { id: nextId.current++, cwd: live.current.cwd, program: as, links: as, cmd: null, out, screen, fresh: ++nonce.current };
    setEntries((prev) => [...prev, entry]);
  }, []);

  /* ─── Settings ─── */

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => ({ ...prev, ...patch }));
    live.current = { ...live.current, settings: { ...live.current.settings, ...patch } };
    if (patch.sound !== undefined) {
      sound.enable(patch.sound);
      if (patch.sound) sound.play('bell');
    }
    if (patch.voice === false) {
      handsFree.current = false;
      stopSpeaking();
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    root.dataset.phosphor = settings.phosphor;
    root.dataset.cols = String(settings.cols);
    root.dataset.scanlines = settings.scanlines ? 'on' : 'off';
    saveSettings(settings);
  }, [settings, hydrated]);

  useEffect(() => {
    if (hydrated) save(FOUND_KEY, [...found]);
  }, [found, hydrated]);

  /* ─── Voice ─── */

  const startListening = useCallback(() => {
    if (listeningRef.current || live.current.program !== 'operator') return;
    listeningRef.current = true;
    handsFree.current = true;
    setListening(true);
    stopListening.current = listen({
      onText: (text) => runRef.current(text, { program: 'operator' }),
      onError: (code) => {
        handsFree.current = false;
        const why = explain(code);
        if (why) append([{ k: 'err', text: why }], 'operator');
      },
      onEnd: () => {
        listeningRef.current = false;
        setListening(false);
      },
    });
  }, [append]);

  const stopVoice = useCallback(() => {
    handsFree.current = false;
    stopListening.current?.();
    stopSpeaking();
  }, []);

  // After it has answered out loud it listens again, which is what makes it a conversation.
  const say = useCallback(
    (text: string) => speak(text, () => handsFree.current && startListening()),
    [startListening],
  );

  /* ─── The machine: sitting down at it and stepping back ─── */

  const connect = useCallback(() => {
    if (connected.current) return;
    connected.current = true;
    sound.play('modem');
    // The first line prints, then everything after it, the way a slow line would deliver it.
    setEntries((prev) => prev.map((entry, i) => (i === 0 ? { ...entry, fresh: ++nonce.current } : { ...entry, wait: true })));
    window.setTimeout(() => {
      setEntries((prev) => prev.map((entry) => (entry.wait ? { ...entry, wait: false, fresh: ++nonce.current } : entry)));
    }, 650);
  }, []);

  const sitDown = useCallback(
    (withSound?: boolean) => {
      if (outsideRef.current !== 'yes') return;
      outsideRef.current = 'entering';
      setOutside('entering');
      if (withSound !== undefined) setSettings({ sound: withSound });
      let revealed = false;
      const reveal = () => {
        if (revealed) return;
        revealed = true;
        delete document.documentElement.dataset.boot;
        connect();
      };
      const finish = () => {
        reveal();
        outsideRef.current = 'no';
        setOutside('no');
        session.set(SEEN_KEY, '1');
        focusNext.current = true;
      };
      (sceneRef.current?.enter(reveal) ?? Promise.resolve()).then(finish, finish);
    },
    [connect, setSettings],
  );

  const stepBack = useCallback(() => {
    if (!sceneRef.current) {
      // Nobody has needed the scene yet. Start it, and step back when it is ready.
      wantsStepBack.current = true;
      setSceneWanted(true);
      return;
    }
    document.documentElement.dataset.boot = 'intro';
    outsideRef.current = 'yes';
    setOutside('yes');
    void sceneRef.current.exit();
  }, []);

  const wantScene = useCallback(() => setSceneWanted(true), []);

  const sceneIsReady = useCallback(() => {
    setSceneReady(true);
    if (wantsStepBack.current) {
      wantsStepBack.current = false;
      stepBack();
    }
  }, [stepBack]);

  // If the scene cannot start there is no machine to look at: stay at the terminal.
  const sceneUnavailable = useCallback(() => {
    delete document.documentElement.dataset.boot;
    wantsStepBack.current = false;
    outsideRef.current = 'no';
    setSceneWanted(false);
    setOutside('no');
    setCaps((prev) => ({ ...prev, scene: false }));
  }, []);

  /* ─── The tour ─── */

  const stopTour = useCallback(() => {
    if (!touringRef.current) return;
    tourToken.current += 1;
    touringRef.current = false;
    setTouring(false);
    setInput('');
    append([p('You have the keyboard.', true)]);
  }, [append]);

  const startTour = useCallback(() => {
    const token = ++tourToken.current;
    const alive = () => tourToken.current === token;
    touringRef.current = true;
    setTouring(true);
    if (live.current.program !== 'shell') {
      live.current = { ...live.current, program: 'shell' };
      setProgram('shell');
    }
    const still = reducedMotion();
    void (async () => {
      await sleep(900);
      for (const cmd of TOUR) {
        if (!alive()) return;
        if (still) setInput(cmd);
        else {
          for (const ch of cmd) {
            if (!alive()) return;
            setInput((prev) => prev + ch);
            if (live.current.settings.keyclick) sound.play('click');
            await sleep(38 + Math.random() * 60);
          }
        }
        await sleep(420);
        if (!alive()) return;
        setInput('');
        runRef.current(cmd, { program: 'shell', silent: true });
        await sleep(2600);
        if (!alive()) return;
        // A long file: drift down a screen so more than the top of it is seen.
        const shown = document.getElementById(`e${nextId.current - 1}`);
        if (shown && shown.offsetHeight > window.innerHeight * 0.9) {
          window.scrollBy({ top: window.innerHeight * 0.6, behavior: still ? 'auto' : 'smooth' });
          await sleep(2400);
        }
      }
      if (!alive()) return;
      touringRef.current = false;
      setTouring(false);
      append([p("That was the short version. The keyboard's yours: [help](<cmd:help>), [ls](<cmd:ls>), or [menu](<cmd:menu>).")]);
    })();
  }, [append]);

  /* ─── The self-test ─── */

  const selfTest = useCallback(async () => {
    const rows: { key: string; inl: { t: 'b' | 'text'; text: string }[] }[] = [];
    const row = (key: string, ok: boolean | null, text: string) =>
      rows.push({ key, inl: [{ t: 'b', text: ok === null ? 'NOTE' : ok ? 'PASS' : 'FAIL' }, { t: 'text', text: `  ${text}` }] });
    const { caps: can, settings: now } = live.current;

    row('DISPLAY', can.scene, can.scene ? 'WebGL is here, so the machine and the demo can be drawn' : 'no WebGL: the machine and the demo cannot be drawn');
    const fonts = document.fonts?.check('16px "IBM Plex Mono"') && document.fonts?.check('16px VT323');
    row('TYPE', Boolean(fonts), fonts ? 'IBM Plex Mono and VT323 are loaded' : 'a typeface has not loaded, so a system one is standing in');

    let stored = false;
    try {
      localStorage.setItem('tjb100.test', '1');
      stored = localStorage.getItem('tjb100.test') === '1';
      localStorage.removeItem('tjb100.test');
    } catch {
      /* stays false */
    }
    row('STORAGE', stored, stored ? 'settings, the found list and the saved game will keep' : 'storage is off, so nothing will be remembered');

    // Each patch is rendered offline and measured. Silence means it scheduled nothing.
    const patches: [string, Patch][] = [
      ['keyclick', PATCHES.click], ['bell', PATCHES.bell], ['modem', PATCHES.modem], ['tune', tunePatch],
    ];
    const heard: string[] = [];
    let audible = true;
    for (const [name, patch] of patches) {
      const result = await measure(patch).catch(() => null);
      if (!result) {
        audible = false;
        heard.push(`${name} could not be rendered`);
      } else {
        if (result.peak < 0.01) audible = false;
        heard.push(`${name} ${result.seconds.toFixed(2)}s peak ${result.peak.toFixed(2)}`);
      }
    }
    row('SOUND', audible, `${heard.join(' · ')}. Sound is ${now.sound ? 'on' : 'off'}`);

    const voices = can.speak ? window.speechSynthesis.getVoices().length : 0;
    row('VOICE OUT', can.speak, can.speak ? `speech synthesis is here${voices ? `, with ${voices} voices` : ''}` : 'no speech synthesis in this browser');
    row('VOICE IN', can.listen, can.listen ? 'speech recognition is here' : 'no speech recognition in this browser. Chrome, Edge and Safari have it');
    row('MOTION', null, reducedMotion() ? 'reduced motion is asked for, so the rain stays off unless you ask' : 'no reduced-motion preference');

    append([{ k: 'banner', text: 'SELF-TEST' }, { k: 'kv', rows }]);
    sound.play(rows.some((r) => r.inl[0].text === 'FAIL') ? 'error' : 'success');
  }, [append]);

  /* ─── Running a line ─── */

  const run = useCallback(
    (line: string, opts: { program?: Program; silent?: boolean } = {}) => {
      const st = live.current;
      const reading = opts.program ?? st.program;
      const ctx: Ctx = {
        program: reading, cwd: st.cwd, settings: st.settings, found: st.found,
        history: history.current, adventure: st.adventure, caps: st.caps,
      };
      const result = interpret(line, ctx);
      const typed = line.trim();
      if (typed && !opts.silent) history.current = [...history.current.filter((h) => h !== typed), typed].slice(-100);
      historyAt.current = -1;
      setOptions([]);

      // A link from the menu to somewhere else leaves the menu. From any other program,
      // running something on the side (a file opened from an answer) leaves you where you are.
      let next: Program = reading !== st.program && st.program === 'menu' ? reading : st.program;
      let owner: Program = reading;
      let cleared = false;
      let spoke = false;
      let away = false;

      for (const effect of result.effects) {
        switch (effect.e) {
          case 'clear':
            cleared = true;
            break;
          case 'set':
            setSettings(effect.patch);
            break;
          case 'palette':
            setPaletteOpen(true);
            break;
          case 'mail':
            setMailOpen(true);
            break;
          case 'href':
            window.open(effect.href, '_blank', 'noopener');
            break;
          case 'burst':
            sceneRef.current?.burst();
            break;
          case 'forget':
            setFound(new Set());
            break;
          case 'bell':
            sound.play('bell');
            break;
          case 'reboot':
            session.set(SEEN_KEY, null);
            window.location.assign(import.meta.env.BASE_URL);
            return;
          case 'stepBack':
            stepBack();
            break;
          case 'program':
            next = effect.program;
            owner = effect.program;
            break;
          case 'go':
            away = true;
            navigate(effect.to === 'demo' ? '/demo' : `/arcade${effect.game ? `/${effect.game}` : ''}`);
            break;
          case 'tour':
            startTour();
            next = 'shell';
            break;
          case 'selftest':
            void selfTest();
            break;
          case 'say':
            spoke = true;
            say(effect.text);
            break;
          case 'listen':
            window.setTimeout(startListening, 0);
            break;
        }
      }

      const entry: LiveEntry = {
        id: nextId.current++, cwd: st.cwd, program: reading, links: owner, cmd: line,
        out: result.out, screen: result.screen, fresh: ++nonce.current,
      };
      setEntries((prev) => (cleared ? [] : [...prev, entry]));
      if (result.cwd) setCwd(result.cwd);
      if (result.adventure) {
        setAdventure(result.adventure);
        save(ADVENTURE_KEY, result.adventure);
      }
      if (next !== st.program) {
        setProgram(next);
        setMenuAt(0);
        if (st.program === 'operator') stopVoice();
      }
      live.current = { ...live.current, cwd: result.cwd ?? st.cwd, program: next, adventure: result.adventure ?? st.adventure };

      const visited = result.visit;
      if (visited?.kind === 'file') setFound((prev) => new Set(prev).add(visited.path));
      const url = result.url ?? (visited ? urlFor(visited) : null);
      if (url && !away) {
        lastUrl.current = url;
        if (url !== live.current.path) navigate(url);
      }

      if (result.out.some((b) => b.k === 'err')) sound.play('error');
      else if (result.screen) sound.play('launch');
      else if (result.out.some((b) => b.k === 'trace')) sound.play('blip');

      // Spoken to, and the answer was not read out: keep the conversation open anyway.
      if (handsFree.current && !spoke && next === 'operator' && reading === 'operator') window.setTimeout(startListening, 700);
    },
    [navigate, say, selfTest, setSettings, startListening, startTour, stepBack, stopVoice],
  );

  const runRef = useRef(run);
  runRef.current = run;

  /* ─── After hydration: what this device remembers ─── */

  useEffect(() => {
    const loaded = loadSettings();
    setSettingsState(loaded);
    sound.enable(loaded.sound);

    const stored = new Set(load<string[]>(FOUND_KEY, []));
    const first = view === 'terminal' ? nodeForUrl(path) : undefined;
    if (first?.kind === 'file') stored.add(first.path);
    setFound(stored);

    const saved = load<AdventureState | null>(ADVENTURE_KEY, null);
    if (saved && typeof saved.room === 'string' && saved.where && saved.moves > 0) {
      setAdventure(saved);
      // The page was rendered at the first room. If there is a saved game, show where it is.
      if (initial.program === 'adventure') append(adventureIntro(saved), 'adventure', true);
    }

    let count = load<number>(CALLS_KEY, 0);
    if (!session.get(CALLED_KEY)) {
      count += 1;
      save(CALLS_KEY, count);
      session.set(CALLED_KEY, '1');
    }
    setCalls(count);
    const today = new Date();
    setMotd(FORTUNES[(today.getDate() + today.getMonth()) % FORTUNES.length]);

    const gl = hasWebGL();
    setCaps({ speak: canSpeak(), listen: canListen(), scene: gl });
    setHydrated(true);
    (window as unknown as { __tjbMounted?: boolean }).__tjbMounted = true;

    if (document.documentElement.dataset.boot === 'intro') {
      outsideRef.current = 'yes';
      setOutside('yes');
      setSceneWanted(true);
    } else if (gl && (!reducedMotion() || view === 'demo')) {
      // Not needed for first paint: bring the rain in once the page has settled.
      const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 600));
      idle(() => setSceneWanted(true));
    }
    if (path === '/tour') window.setTimeout(() => startTour(), 600);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hydrated) return;
    const tick = () => setClock(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const timer = window.setInterval(tick, 15000);
    return () => window.clearInterval(timer);
  }, [hydrated]);

  // The status line reports the columns that actually fit, which on a phone is not 80.
  useEffect(() => {
    const measureCols = () => {
      const el = document.querySelector('.tty-main .tty-col, .app-main .tty-col');
      if (!el) return;
      const style = getComputedStyle(el);
      const width = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const ch = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.6;
      setCols(Math.min(settings.cols, Math.floor(width / ch)));
    };
    measureCols();
    window.addEventListener('resize', measureCols);
    return () => window.removeEventListener('resize', measureCols);
  }, [settings.cols, hydrated, view]);

  /* ─── The address ─── */

  const firstAddress = useRef(true);
  useEffect(() => {
    document.title = metaFor(path).title;
    if (firstAddress.current) {
      firstAddress.current = false;
      return;
    }
    if (view !== 'terminal' || path === lastUrl.current) return;
    // The address moved without the terminal asking: back, forward, or a link.
    lastUrl.current = path;
    const cmd = commandForUrl(path);
    if (cmd) runRef.current(cmd, { program: 'shell', silent: true });
    else append(notFoundBlocks());
  }, [path, view, append]);

  // Bring the newest entry to the top of the screen, so its output reads from the start.
  // Before paint, or the entry shows for a frame where it landed and then jumps.
  const lastId = entries.length ? entries[entries.length - 1].id : -1;
  useLayoutEffect(() => {
    if (view !== 'terminal' || lastId < initial.entries.length) return;
    document.getElementById(`e${lastId}`)?.scrollIntoView({ block: 'start' });
  }, [lastId, view, initial.entries.length]);

  // The terminal is inert until the view has actually changed, so focus has to wait for it.
  useEffect(() => {
    if (outside === 'no' && view === 'terminal' && focusNext.current) {
      focusNext.current = false;
      if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus({ preventScroll: true });
    }
  }, [outside, view]);

  const leaveApp = useCallback(() => {
    focusNext.current = true;
    navigate(lastUrl.current);
  }, [navigate]);

  /* ─── Keys that belong to the machine rather than to the prompt ─── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      sound.unlock();
      const modifier = e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta';
      if (touringRef.current && !modifier && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        stopTour();
        return;
      }
      if (e.metaKey || e.altKey) {
        if (e.metaKey && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          setPaletteOpen(true);
        }
        return;
      }
      if (outsideRef.current === 'yes') {
        if (modifier || e.key === 'Tab') return;
        e.preventDefault();
        const key = e.key.toLowerCase();
        sitDown(key === 'y' ? true : key === 'n' ? false : undefined);
        return;
      }
      const st = live.current;
      if (st.dialog || outsideRef.current !== 'no' || st.view !== 'terminal') return;
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (e.key === 'Escape') {
        stopVoice();
        return;
      }
      if (e.key === 'F1' || e.key === 'F2' || e.key === 'F3' || e.key === 'F4') {
        e.preventDefault();
        if (e.key === 'F1') runRef.current('help');
        else if (e.key === 'F2') runRef.current('ls -l', { program: 'shell' });
        else if (e.key === 'F3') setPaletteOpen(true);
        else runRef.current(st.program === 'adventure' ? 'quit' : 'exit');
        return;
      }
      // Typing anywhere lands in the prompt, unless something else has a claim on the keys.
      const target = e.target as HTMLElement;
      const busy = target.closest('input, textarea, select, [role="dialog"], video');
      if (!busy && !e.ctrlKey && (e.key.length === 1 || e.key === 'Backspace') && e.key !== ' ') {
        inputRef.current?.focus({ preventScroll: true });
      }
    };
    const onPointer = () => {
      sound.unlock();
      if (touringRef.current) stopTour();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [sitDown, stopTour, stopVoice]);

  /* ─── The prompt ─── */

  const liveMenu = useMemo(() => {
    if (program !== 'menu') return null;
    for (let i = entries.length - 1; i >= 0; i--) if (entries[i].out.some((b) => b.k === 'menu')) return entries[i].id;
    return null;
  }, [program, entries]);

  const submit = useCallback(() => {
    const line = input;
    setInput('');
    if (!line.trim() && live.current.program === 'menu' && liveMenu !== null) run(MENU[menuAt].key);
    else run(line);
  }, [input, liveMenu, menuAt, run]);

  const onPromptKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const st = live.current;
      if (st.settings.keyclick && !e.metaKey && !e.ctrlKey && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter')) {
        sound.play('click');
      }
      if (handsFree.current && e.key.length === 1) stopVoice();

      if (e.key === 'Tab') {
        e.preventDefault();
        if (!input.trim() || (st.program !== 'shell' && st.program !== 'menu')) return;
        const completed = complete(input, st.cwd);
        setInput(completed.line);
        setOptions(completed.options);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const up = e.key === 'ArrowUp';
        if (st.program === 'menu' && !input && liveMenu !== null) {
          e.preventDefault();
          setMenuAt((at) => (at + (up ? MENU.length - 1 : 1)) % MENU.length);
          sound.play('select');
          return;
        }
        const list = history.current;
        if (!list.length) return;
        e.preventDefault();
        const at = historyAt.current;
        const next = up ? (at < 0 ? list.length - 1 : Math.max(0, at - 1)) : at < 0 ? -1 : at + 1;
        historyAt.current = next >= list.length ? -1 : next;
        setInput(historyAt.current < 0 ? '' : list[historyAt.current]);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        run('clear', { program: 'shell', silent: true });
      } else if (e.ctrlKey && e.key.toLowerCase() === 'g') {
        // Control-G is BEL. It always was.
        e.preventDefault();
        run('bell', { program: 'shell', silent: true });
      } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        setInput('');
        setOptions([]);
      }
    },
    [input, liveMenu, run, stopVoice],
  );

  const api = useMemo<TtyApi>(() => {
    const { have, total } = progress(found);
    return {
      run,
      found,
      zoom: (images, index) => setZoom({ images, index }),
      liveMenu,
      menuAt,
      setMenuAt,
      caller: hydrated ? { calls, have, total, motd } : null,
    };
  }, [run, found, liveMenu, menuAt, hydrated, calls, motd]);

  return {
    // Where we are
    path, view, game, program, cwd, entries, outside,
    // The prompt
    input, setInput, options, setOptions, inputRef, submit, onPromptKey, touring, listening,
    // The device
    settings, setSettings, found, hydrated, cols, clock, caps,
    // Doing things
    run, api, sitDown, stepBack, leaveApp, startListening, stopVoice, navigate,
    // The scene
    sceneRef, sceneWanted, sceneReady, sceneIsReady, sceneUnavailable, wantScene,
    // Dialogs
    paletteOpen, setPaletteOpen, mailOpen, setMailOpen, zoom, setZoom,
  };
}

export type Machine = ReturnType<typeof useMachine>;
