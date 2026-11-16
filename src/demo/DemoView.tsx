import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { sound } from '@/machine/sound';
import type { Machine } from '@/machine/useMachine';
import { REEL, type Visual } from './reel';

/**
 * The demo: a film of who Tom is and what he builds, for anyone who would rather watch
 * than type. The scene behind it is the picture and this is the words.
 *
 * Until it is running, every shot is on the page at once, in order. That is what a crawler
 * reads, what shows without JavaScript, and what someone who has asked for less motion
 * gets: the same demo, as a page, with the film one button away.
 */
export function DemoView({ m, onVisual }: { m: Machine; onVisual: (visual: Visual | null) => void }) {
  const [running, setRunning] = useState(false);
  const [still, setStill] = useState(false);
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const { settings, setSettings, leaveApp, run, sceneRef } = m;
  const shot = REEL[at];
  const last = at === REEL.length - 1;

  const go = useCallback((to: number) => {
    elapsedRef.current = 0;
    setElapsed(0);
    setAt(Math.max(0, Math.min(REEL.length - 1, to)));
  }, []);

  // Decided after mount, so the server and the first paint agree.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setStill(reduced);
    setRunning(!reduced);
  }, []);

  useEffect(() => {
    onVisual(running ? shot.visual : null);
    return () => onVisual(null);
  }, [running, shot.visual, onVisual]);

  // Every change of shot is a cut the scene can feel.
  useEffect(() => {
    if (running) sceneRef.current?.cut(at);
  }, [running, at, sceneRef]);

  // Each stop on the road sends a gate down it.
  useEffect(() => {
    if (running && shot.visual === 'road') sceneRef.current?.gate();
  }, [running, at, shot.visual, sceneRef]);

  useEffect(() => {
    if (running && settings.sound) sound.startMusic();
    return () => sound.stopMusic();
  }, [running, settings.sound]);

  // The clock. A shot with no length (the last one) waits for the visitor.
  useEffect(() => {
    if (!running || paused || !shot.seconds) return;
    const started = performance.now() - elapsedRef.current * 1000;
    const timer = window.setInterval(() => {
      const now = (performance.now() - started) / 1000;
      if (now >= shot.seconds) go(at + 1);
      else {
        elapsedRef.current = now;
        setElapsed(now);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [running, paused, at, shot.seconds, go]);

  const dialogOpen = m.mailOpen || m.paletteOpen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (e.key === 'Escape' || key === 'q') leaveApp();
      else if (key === 's') setSettings({ sound: !m.settings.sound });
      else if (!running) {
        if (e.key === 'Enter') setRunning(true);
        else return;
      } else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === 'PageDown') go(at + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(at - 1);
      else if (e.key === ' ') setPaused((p) => !p);
      else if (e.key === 'Home') go(0);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, at, go, leaveApp, setSettings, m.settings.sound, dialogOpen]);

  return (
    <main className="app-main demo" id="main" data-running={running ? '' : undefined} data-paused={paused ? '' : undefined}>
      {!running && (
        <p className="demo__note tty-col">
          {still ? 'This plays as a film, and you have asked your device for less motion, so here it is as a page. ' : 'The demo, as a page. '}
          <button type="button" className="tty-link" onClick={() => setRunning(true)}>Play it as a film</button>, or read on.
        </p>
      )}

      <div className="reel" aria-live={running ? 'polite' : undefined}>
        {REEL.map((s, i) => {
          const Title = i === 0 ? 'h1' : 'h2';
          return (
            <section
              key={s.id}
              className="reel-shot"
              data-active={i === at ? '' : undefined}
              data-visual={s.visual}
              hidden={running && i !== at}
              style={{ '--step': `${s.step}s` } as CSSProperties}
            >
              <p className="reel-kicker">{s.kicker}</p>
              <Title className="reel-title">{s.title}</Title>
              {s.image && <img className="reel-image" src={s.image.src} alt={s.image.alt} loading="lazy" decoding="async" width={800} height={500} />}
              <ul className="reel-lines" data-many={s.lines.length > 4 ? '' : undefined}>
                {s.lines.map((line, j) => (
                  <li key={j} style={{ '--i': j } as CSSProperties}>{line}</li>
                ))}
              </ul>
              {s.actions && (
                <p className="reel-actions" style={{ '--i': s.lines.length } as CSSProperties}>
                  {s.actions.map((action) => (
                    <button key={action.cmd} type="button" className="tty-link" onClick={() => run(action.cmd, { program: 'shell' })}>
                      {action.label}
                    </button>
                  ))}
                </p>
              )}
            </section>
          );
        })}
      </div>

      {running && (
        <footer className="reel-bar">
          <ol className="reel-progress" aria-label="Where the demo is">
            {REEL.map((s, i) => (
              <li key={s.id} style={{ flexGrow: s.seconds || 6 }}>
                <button type="button" aria-label={`${s.kicker}: ${s.title}`} aria-current={i === at ? 'step' : undefined} onClick={() => go(i)}>
                  <span style={{ width: `${i < at ? 100 : i > at ? 0 : s.seconds ? (elapsed / s.seconds) * 100 : 100}%` }} />
                </button>
              </li>
            ))}
          </ol>
          <nav className="tty-pf tty-pf--only" aria-label="Demo controls">
            <Button variant="ghost" size="xs" onClick={() => go(at - 1)} disabled={at === 0}><b>←</b>BACK</Button>
            <Button variant="ghost" size="xs" onClick={() => setPaused((p) => !p)} disabled={last}><b>SPACE</b>{paused ? 'PLAY' : 'PAUSE'}</Button>
            <Button variant="ghost" size="xs" onClick={() => go(at + 1)} disabled={last}><b>→</b>NEXT</Button>
            <Button variant="ghost" size="xs" onClick={() => setSettings({ sound: !settings.sound })}><b>S</b>SOUND {settings.sound ? 'ON' : 'OFF'}</Button>
            <Button variant="ghost" size="xs" onClick={leaveApp}><b>ESC</b>MENU</Button>
            <span className="arcade__best reel-count">{at + 1}/{REEL.length}</span>
          </nav>
        </footer>
      )}
    </main>
  );
}
