import { useContext, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { load, save } from '@/machine/settings';
import { sound } from '@/machine/sound';
import type { Machine } from '@/machine/useMachine';
import { TtyContext, hrefTo } from '@/terminal/Blocks';
import type { Running } from './engine';
import { projects } from '@/content/projects';
import { GAMES, ROSTER, type GameInfo } from './games';

const bestKey = (id: string) => `tjb100.best.${id}`;

const ARROWS: Record<string, string> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/** The list of games. Real text and real links, so it is a page before any script runs. */
function Cabinet({ m }: { m: Machine }) {
  const { run, zoom } = useContext(TtyContext);
  const [best, setBest] = useState<Record<string, number>>({});
  // One screenshot per game, from the project's own file, matched by title.
  const shots = (projects.find((x) => x.id === 'matrix-arcade')?.games ?? []).map((g) => ({ src: g.src, alt: g.title }));

  useEffect(() => {
    setBest(Object.fromEntries(GAMES.map((g) => [g.id, load<number>(bestKey(g.id), 0)])));
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const picked = GAMES[Number(e.key) - 1];
      if (picked) m.navigate(`/arcade/${picked.id}`);
      else if (e.key === 'Escape' || e.key.toLowerCase() === 'q' || e.key === '0') m.leaveApp();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [m]);

  return (
    <>
      <main className="app-main" id="main">
        <div className="tty-col tty-out">
          <p><span className="tty-banner">ARCADE</span></p>
          <h1 className="tty-h1">Fourteen games. Two of them are made of text.</h1>
          <p className="tty-p tty-dim">TRACE and DECODE were written for this screen: nothing but characters in a grid, the way a terminal draws anything. The other twelve are The Matrix Arcade, wired in.</p>
          <ol className="tty-menu" aria-label="Games">
            {GAMES.map((g, i) => (
              <li key={g.id}>
                <a
                  href={hrefTo(`/arcade/${g.id}`)}
                  onClick={(e) => {
                    e.preventDefault();
                    sound.play('launch');
                    m.navigate(`/arcade/${g.id}`);
                  }}
                >
                  <span className="tty-menu__key">{i + 1}</span>
                  <span className="tty-menu__name">{g.title}</span>
                  <span className="tty-menu__note">
                    {g.blurb}
                    {best[g.id] ? ` Best: ${best[g.id]}.` : ''}
                  </span>
                </a>
              </li>
            ))}
          </ol>
          <h2 className="tty-h2">In the cabinet</h2>
          <ol className="tty-roster">
            {ROSTER.map((game, i) => {
              const at = shots.findIndex((shot) => shot.alt === game.title);
              return (
                <li key={game.title}>
                  {at >= 0 && (
                    <button type="button" className="tty-plate" onClick={() => zoom(shots, at)}>
                      <img src={shots[at].src} alt={`${game.title}, in play`} loading="lazy" decoding="async" width={800} height={500} />
                    </button>
                  )}
                  <span className="tty-roster__title">{String(i + 1).padStart(2, '0')} {game.title}</span>
                  <span className="tty-roster__kind">{game.kind}</span>
                  <span className="tty-roster__note">{game.note}</span>
                </li>
              );
            })}
          </ol>
          <p className="tty-p tty-dim">
            How it was built:{' '}
            <button type="button" className="tty-link" onClick={() => run('cat ~/projects/matrix-arcade.md', { program: 'shell' })}>
              projects/matrix-arcade.md
            </button>
            . And the longest game on this machine is not in here:{' '}
            <button type="button" className="tty-link" onClick={() => run('adventure', { program: 'shell' })}>adventure</button>.
          </p>
        </div>
      </main>
      <footer className="tty-foot">
        <div className="tty-col">
          <nav className="tty-pf tty-pf--only" aria-label="Function keys">
            {GAMES.map((g, i) => (
              <Button key={g.id} variant="ghost" size="xs" onClick={() => m.navigate(`/arcade/${g.id}`)}><b>{i + 1}</b>{g.title}</Button>
            ))}
            <Button variant="ghost" size="xs" onClick={m.leaveApp}><b>ESC</b>BACK</Button>
          </nav>
        </div>
      </footer>
    </>
  );
}

function Play({ m, game }: { m: Machine; game: GameInfo }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const typeRef = useRef<HTMLInputElement>(null);
  const running = useRef<Running | null>(null);
  const [over, setOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [best, setBest] = useState(0);
  const [failed, setFailed] = useState(false);
  const overRef = useRef(false);
  const pausedRef = useRef(false);

  const again = () => {
    overRef.current = false;
    setOver(false);
    running.current?.restart();
  };
  const back = () => m.navigate('/arcade');

  useEffect(() => {
    let cancelled = false;
    setBest(load<number>(bestKey(game.id), 0));
    // The engine and the games are their own chunk: nobody who is only reading pays for them.
    Promise.all([import('./engine'), game.id === 'trace' ? import('./trace') : import('./decode')])
      .then(([engine, module]) => {
        if (cancelled || !canvasRef.current) return;
        const factory = 'trace' in module ? module.trace : module.decode;
        running.current = engine.runGame(canvasRef.current, factory, { sfx: (name) => sound.play(name) }, (score) => {
          overRef.current = true;
          setOver(true);
          setBest((prev) => {
            if (score <= prev) return prev;
            save(bestKey(game.id), score);
            return score;
          });
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      running.current?.stop();
      running.current = null;
    };
  }, [game.id]);

  // The colours on the canvas are read from the page. If the phosphor changes, read again.
  useEffect(() => running.current?.recolour(), [m.settings.phosphor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (e.key === 'Escape') return back();
      if (e.key === 'Enter') {
        e.preventDefault();
        if (overRef.current) again();
        return;
      }
      if (ARROWS[e.key]) {
        e.preventDefault();
        running.current?.key(ARROWS[e.key]);
        return;
      }
      if (!game.typed) {
        if (key === 'q') return back();
        if (key === 'p') {
          pausedRef.current = !pausedRef.current;
          running.current?.pause(pausedRef.current);
          setPaused(pausedRef.current);
          return;
        }
      }
      // A typing game on a phone reads its letters from the field, not from here.
      if (e.target === typeRef.current) return;
      if (e.key === 'Backspace') running.current?.key('back');
      else if (key.length === 1) {
        if (key === ' ') e.preventDefault();
        running.current?.key(key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game.typed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Swipes steer. A swipe is a drag of more than a couple of cells in one direction.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
    if (game.typed) typeRef.current?.focus();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const from = swipe.current;
    swipe.current = null;
    if (!from || game.typed) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    running.current?.key(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  };

  const steer = (dir: string, label: string) => (
    <Button variant="ghost" size="xs" aria-label={dir} onPointerDown={(e) => { e.preventDefault(); running.current?.key(dir); }}>{label}</Button>
  );

  return (
    <>
      <main className="app-main arcade" id="main">
        <div className="tty-col arcade__head">
          <h1 className="tty-banner">{game.title}</h1>
          <p className="tty-dim">{game.blurb} {game.keys}</p>
        </div>
        <div className="arcade__screen">
          {failed ? (
            <p className="tty-err tty-col" role="alert">The game would not load. Check the connection and try again.</p>
          ) : (
            <canvas
              ref={canvasRef}
              className="arcade__canvas"
              role="img"
              aria-label={`${game.title}, a game drawn in characters. ${game.keys}`}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
            />
          )}
        </div>
      </main>
      <footer className="tty-foot">
        <div className="tty-col">
          {game.typed && (
            <input
              ref={typeRef}
              className="arcade__type"
              aria-label="Type the falling words here"
              placeholder="tap here to type"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => {
                for (const ch of e.target.value.toLowerCase()) running.current?.key(ch);
                e.target.value = '';
              }}
            />
          )}
          <nav className="tty-pf tty-pf--only" aria-label="Game controls">
            {!game.typed && (
              <span className="arcade__pad">
                {steer('left', '←')}
                {steer('up', '↑')}
                {steer('down', '↓')}
                {steer('right', '→')}
              </span>
            )}
            {over && <Button variant="ghost" size="xs" onClick={again}><b>ENTER</b>GO AGAIN</Button>}
            {!game.typed && !over && (
              <Button variant="ghost" size="xs" onClick={() => { pausedRef.current = !pausedRef.current; running.current?.pause(pausedRef.current); setPaused(pausedRef.current); }}>
                <b>P</b>{paused ? 'CARRY ON' : 'PAUSE'}
              </Button>
            )}
            <Button variant="ghost" size="xs" onClick={back}><b>ESC</b>ARCADE</Button>
            <span className="arcade__best" aria-live="polite">{best ? `BEST ${best}` : ''}</span>
          </nav>
        </div>
      </footer>
    </>
  );
}

/** A game that lives at its own address, shown in a frame with a way back underneath. */
function Wired({ m, game }: { m: Machine; game: GameInfo & { embed: string } }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const back = () => m.navigate('/arcade');
  const host = new URL(game.embed).host;

  useEffect(() => {
    // Keys only reach this page until the frame is clicked. After that, the button is the way out.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && back();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <main className="app-main arcade" id="main">
        <div className="tty-col arcade__head">
          <h1 className="tty-banner">{game.title}</h1>
          <p className="tty-dim">{game.blurb} {game.keys}</p>
        </div>
        <div className="arcade__screen">
          {!loaded && <p className="arcade__loading tty-dim" role="status">Dialling {host}…</p>}
          <iframe
            ref={frame}
            className="arcade__frame"
            src={game.embed}
            title="The Matrix Arcade: twelve games"
            allow="autoplay; fullscreen; gamepad"
            onLoad={() => setLoaded(true)}
          />
        </div>
      </main>
      <footer className="tty-foot">
        <div className="tty-col">
          <nav className="tty-pf tty-pf--only" aria-label="Cabinet controls">
            <Button variant="ghost" size="xs" onClick={back}><b>ESC</b>ARCADE</Button>
            <Button variant="ghost" size="xs" onClick={() => void frame.current?.requestFullscreen?.()}><b>⛶</b>FULL SCREEN</Button>
            <a className="tty-link arcade__out" data-ext href={game.embed} target="_blank" rel="noopener noreferrer">
              If the screen stays dark, open it at {host}
            </a>
          </nav>
        </div>
      </footer>
    </>
  );
}

export function ArcadeView({ m }: { m: Machine }) {
  const game = m.game;
  if (!game) return <Cabinet m={m} />;
  return game.embed ? <Wired m={m} game={{ ...game, embed: game.embed }} /> : <Play key={game.id} m={m} game={game} />;
}
