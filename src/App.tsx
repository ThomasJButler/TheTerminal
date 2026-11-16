import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MACHINE, SITE_NAME } from '@/content/site';
import { nodeForUrl, urlFor } from '@/fs/tree';
import { SceneLayer, type SceneHandle } from '@/scene/SceneLayer';
import { Blocks, TtyContext, hrefFor, type TtyApi } from '@/terminal/Blocks';
import { Lightbox, Mail, Palette, type ZoomState } from '@/terminal/Overlays';
import {
  DEFAULT_SETTINGS, commandFor, complete, exec, progress, sessionFor,
  type Entry, type Settings,
} from '@/terminal/commands';
import { ROOT } from '@/fs/tree';

const SETTINGS_KEY = 'tjb100.settings';
const FOUND_KEY = 'tjb100.found';
const SEEN_KEY = 'tjb100.seen';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private mode, or storage disabled: settings just do not persist. */
  }
}

export function titleFor(pathname: string): string {
  const node = nodeForUrl(pathname);
  if (!node) return `Not found | ${SITE_NAME}`;
  return urlFor(node) === '/' ? `${SITE_NAME} | ${MACHINE}` : `${node.title} | ${SITE_NAME}`;
}

type View = 'terminal' | 'intro' | 'entering';

export function App() {
  const location = useLocation();
  const navigate = useNavigate();

  // The session a URL opens on. Computed once: after that the terminal owns its own state
  // and the URL follows it, not the other way round.
  const initial = useMemo(() => sessionFor(nodeForUrl(location.pathname)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [entries, setEntries] = useState<(Entry & { fresh?: boolean })[]>(initial.entries);
  const [cwd, setCwd] = useState(initial.cwd);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [found, setFound] = useState<ReadonlySet<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [view, setView] = useState<View>('terminal');
  const [sceneWanted, setSceneWanted] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const [cols, setCols] = useState(80);

  const inputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<SceneHandle>(null);
  const history = useRef<string[]>([]);
  const historyAt = useRef(-1);
  const nextId = useRef(initial.entries.length);
  const selfNav = useRef(location.pathname);
  const state = useRef({ cwd, settings, found });
  state.current = { cwd, settings, found };

  /* ─── After hydration: what this device remembers, and whether to show the machine ─── */

  useEffect(() => {
    setSettings({ ...DEFAULT_SETTINGS, ...load<Partial<Settings>>(SETTINGS_KEY, {}) });
    const first = initial.entries[1] && nodeForUrl(location.pathname);
    const stored = new Set(load<string[]>(FOUND_KEY, []));
    if (first && first.kind === 'file') stored.add(first.path);
    setFound(stored);
    setHydrated(true);
    (window as unknown as { __tjbMounted?: boolean }).__tjbMounted = true;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.documentElement.dataset.boot === 'intro') {
      setView('intro');
      setSceneWanted(true);
    } else if (!still) {
      // Not needed for first paint: bring the rain in once the page has settled.
      const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 600));
      idle(() => setSceneWanted(true));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    root.dataset.phosphor = settings.phosphor;
    root.dataset.cols = String(settings.cols);
    root.dataset.scanlines = settings.scanlines ? 'on' : 'off';
    save(SETTINGS_KEY, settings);
  }, [settings, hydrated]);

  useEffect(() => {
    if (hydrated) save(FOUND_KEY, [...found]);
  }, [found, hydrated]);

  // The status line reports the columns that actually fit, which on a phone is not 80.
  useEffect(() => {
    const measure = () => {
      const el = mainRef.current?.querySelector('.tty-col');
      if (!el) return;
      const style = getComputedStyle(el);
      const width = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const ch = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.6;
      setCols(Math.min(settings.cols, Math.floor(width / ch)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [settings.cols, hydrated]);

  /* ─── Running a command ─── */

  const run = useCallback(
    (line: string, opts: { silent?: boolean } = {}) => {
      const { cwd: before, settings: s, found: f } = state.current;
      const result = exec(line, { cwd: before, settings: s, found: f, history: history.current });
      if (line.trim() && !opts.silent) {
        history.current = [...history.current.filter((h) => h !== line.trim()), line.trim()].slice(-100);
      }
      historyAt.current = -1;
      setOptions([]);

      let cleared = false;
      for (const effect of result.effects) {
        switch (effect.e) {
          case 'clear':
            cleared = true;
            break;
          case 'set':
            setSettings((prev) => ({ ...prev, ...effect.patch }));
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
          case 'reboot':
            sessionStorage.removeItem(SEEN_KEY);
            window.location.assign(import.meta.env.BASE_URL);
            return;
          case 'exit':
            stepBack();
            break;
        }
      }

      const entry = { id: nextId.current++, cwd: before, cmd: line, out: result.out, fresh: true };
      setEntries((prev) => (cleared ? [] : [...prev, entry]));
      if (result.cwd) setCwd(result.cwd);

      if (result.visit) {
        const visited = result.visit;
        if (visited.kind === 'file') setFound((prev) => new Set(prev).add(visited.path));
        const url = urlFor(visited);
        if (url !== selfNav.current) {
          selfNav.current = url;
          navigate(url);
        }
      }
    },
    [navigate], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Back and forward: the URL moved without the terminal asking, so show what it points at.
  useEffect(() => {
    document.title = titleFor(location.pathname);
    if (location.pathname === selfNav.current) return;
    selfNav.current = location.pathname;
    const node = nodeForUrl(location.pathname);
    const session = sessionFor(node);
    const shown = session.entries[1];
    setEntries((prev) => [...prev, { ...shown, id: nextId.current++, cmd: node ? commandFor(node) : shown.cmd, fresh: true }]);
    setCwd(session.cwd);
    if (node?.kind === 'file') setFound((prev) => new Set(prev).add(node.path));
  }, [location.pathname]);

  // Bring the newest command to the top of the screen, so its output reads from the start.
  const lastId = entries.length ? entries[entries.length - 1].id : -1;
  useEffect(() => {
    if (lastId < initial.entries.length) return;
    document.getElementById(`e${lastId}`)?.scrollIntoView({ block: 'start' });
  }, [lastId, initial.entries.length]);

  /* ─── The machine: sitting down at it and stepping back ─── */

  const sitDown = useCallback(() => {
    setView((current) => {
      if (current !== 'intro') return current;
      const reveal = () => {
        delete document.documentElement.dataset.boot;
      };
      const finish = () => {
        reveal();
        setView('terminal');
        try {
          sessionStorage.setItem(SEEN_KEY, '1');
        } catch {
          /* ignored */
        }
        focusNext.current = true;
      };
      (sceneRef.current?.enter(reveal) ?? Promise.resolve()).then(finish, finish);
      return 'entering';
    });
  }, []);

  // The terminal is inert until the view has actually changed, so focus has to wait for it.
  const focusNext = useRef(false);
  useEffect(() => {
    if (view === 'terminal' && focusNext.current) {
      focusNext.current = false;
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [view]);

  const stepBack = useCallback(() => {
    if (!sceneRef.current) return;
    document.documentElement.dataset.boot = 'intro';
    setView('intro');
    void sceneRef.current.exit();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.altKey) {
        if (e.key.toLowerCase() === 'k' && e.metaKey) {
          e.preventDefault();
          setPaletteOpen(true);
        }
        return;
      }
      if (view === 'intro') {
        if (e.key === 'Tab' || e.key === 'Shift' || e.key === 'Control') return;
        e.preventDefault();
        sitDown();
        return;
      }
      if (view !== 'terminal') return;
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      const pf: Record<string, string> = { F1: 'help', F2: 'ls -l', F3: 'grep', F4: 'exit' };
      if (pf[e.key]) {
        e.preventDefault();
        run(pf[e.key]);
        return;
      }
      // Typing anywhere lands in the prompt, unless something else has a claim on the keys.
      const target = e.target as HTMLElement;
      const busy = target.closest('input, textarea, select, [role="dialog"], video');
      if (!busy && !e.ctrlKey && (e.key.length === 1 || e.key === 'Backspace') && e.key !== ' ') {
        inputRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, run, sitDown]);

  // If the scene cannot start, there is no machine to look at: go straight to the terminal.
  const sceneUnavailable = useCallback(() => {
    delete document.documentElement.dataset.boot;
    setSceneWanted(false);
    setView('terminal');
  }, []);

  /* ─── The prompt ─── */

  const onPromptKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!input.trim()) return;
      const done = complete(input, cwd);
      setInput(done.line);
      setOptions(done.options);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const list = history.current;
      if (!list.length) return;
      e.preventDefault();
      const at = historyAt.current;
      const next = e.key === 'ArrowUp' ? (at < 0 ? list.length - 1 : Math.max(0, at - 1)) : at < 0 ? -1 : at + 1;
      historyAt.current = next >= list.length ? -1 : next;
      setInput(historyAt.current < 0 ? '' : list[historyAt.current]);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      run('clear', { silent: true });
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      setInput('');
      setOptions([]);
    }
  };

  const api = useMemo<TtyApi>(
    () => ({ run, found, zoom: (images, index) => setZoom({ images, index }) }),
    [run, found],
  );
  const { have, total } = progress(found);
  const pad = (n: number) => String(n).padStart(2, '0');
  const where = cwd === '~' ? '~' : `~/${cwd.slice(2)}`;

  return (
    <TtyContext.Provider value={api}>
      {sceneWanted && (
        <SceneLayer
          ref={sceneRef}
          initialMode={view === 'terminal' ? 'inside' : 'attract'}
          phosphor={settings.phosphor}
          rain={settings.rain}
          onReady={() => setSceneReady(true)}
          onUnavailable={sceneUnavailable}
        />
      )}

      {view !== 'terminal' && (
        <div className="intro" data-leaving={view === 'entering' ? '' : undefined} onClick={sitDown}>
          <button type="button" className="intro__key">
            PRESS ANY KEY
          </button>
          <p className="intro__hint">{sceneReady ? 'any key, a click or a tap' : 'warming up the tube'}</p>
        </div>
      )}

      <div className="tty" inert={view !== 'terminal'}>
        <header className="tty-status">
          <div className="tty-col tty-status__row">
            <a className="tty-status__name" href={hrefFor(ROOT)} onClick={(e) => { e.preventDefault(); run('cd ~'); }}>
              {MACHINE}
            </a>
            <span className="tty-status__cwd">{where}</span>
            <span className="tty-status__meta">{cols} COL</span>
            <span className="tty-status__found" title="Files read">
              {hydrated ? `${pad(have)}/${pad(total)}` : `--/${pad(total)}`}
            </span>
          </div>
        </header>

        <main className="tty-main" ref={mainRef} id="main">
          <div className="tty-col" aria-live="polite" aria-relevant="additions">
            {entries.map((entry) => (
              <section key={entry.id} id={`e${entry.id}`} className="tty-entry" data-fresh={entry.fresh ? '' : undefined}>
                {entry.cmd !== null && (
                  <p className="tty-cmd">
                    <Ps1 cwd={entry.cwd} />
                    <span>{entry.cmd}</span>
                  </p>
                )}
                <Blocks blocks={entry.out} />
              </section>
            ))}
          </div>
        </main>

        <footer className="tty-foot">
          <div className="tty-col">
            {options.length > 0 && (
              <div className="tty-options">{options.map((o) => <span key={o}>{o}</span>)}</div>
            )}
            <form
              className="tty-prompt"
              onSubmit={(e) => {
                e.preventDefault();
                run(input);
                setInput('');
              }}
            >
              <label htmlFor="prompt"><Ps1 cwd={cwd} /></label>
              <input
                id="prompt"
                ref={inputRef}
                className="tty-input"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setOptions([]);
                }}
                onKeyDown={onPromptKey}
                placeholder="type help, or ls"
                aria-label="Command"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
              />
            </form>
            <nav className="tty-pf" aria-label="Function keys">
              <Button variant="ghost" size="xs" onClick={() => run('help')}><b>PF1</b>HELP</Button>
              <Button variant="ghost" size="xs" onClick={() => run('ls -l')}><b>PF2</b>LIST</Button>
              <Button variant="ghost" size="xs" onClick={() => setPaletteOpen(true)}><b>PF3</b>FIND</Button>
              <Button variant="ghost" size="xs" onClick={() => run('cd ..')}><b>←</b>BACK</Button>
              <Button variant="ghost" size="xs" onClick={() => run('exit')}><b>PF4</b>EXIT</Button>
            </nav>
          </div>
        </footer>
      </div>

      <div className="crt" aria-hidden="true" />
      <Palette open={paletteOpen} onOpenChange={setPaletteOpen} found={found} run={run} />
      <Mail open={mailOpen} onOpenChange={setMailOpen} />
      <Lightbox zoom={zoom} onChange={setZoom} />
    </TtyContext.Provider>
  );
}

function Ps1({ cwd }: { cwd: string }) {
  return (
    <span className="tty-ps1">
      <span className="tty-ps1__host">visitor@tjb-100:</span>
      <b>{cwd}</b>$
    </span>
  );
}
