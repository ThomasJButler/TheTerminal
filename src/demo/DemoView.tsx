import { useEffect, useState } from 'react';
import { sound } from '@/machine/sound';
import type { Machine } from '@/machine/useMachine';

const SCROLLER =
  'TJB-100 DEMO ... THREE.JS, ONE COLOUR, NO MODELS, NO TEXTURES, NO LIGHTS ... THE LANDSCAPE IS A GRID AND THREE SINE WAVES ... ' +
  'THE SUN IS TWENTY LINES ... THE TUNE IS FOUR BARS OF SQUARE WAVE, WRITTEN IN AN ARRAY ... EVERYTHING ELSE ON THIS MACHINE IS A FILE: ' +
  'PRESS A KEY AND GO LOOKING ... GREETINGS TO EVERYONE WHO EVER LEFT VIEW SOURCE OPEN ... ';

/**
 * The demo: the scene takes the whole screen and this lays the words over it. It is nothing
 * but motion, so if the visitor has asked for less of that, it waits to be told.
 */
export function DemoView({ m, onRunning }: { m: Machine; onRunning: (running: boolean) => void }) {
  const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [running, setRunning] = useState(false);
  const { settings, setSettings, leaveApp, caps } = m;

  // Decided after mount, so the server and the first paint agree.
  useEffect(() => setRunning(!still), [still]);

  useEffect(() => {
    onRunning(running);
    return () => onRunning(false);
  }, [running, onRunning]);

  useEffect(() => {
    if (running && settings.sound) sound.startMusic();
    return () => sound.stopMusic();
  }, [running, settings.sound]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Shift') return;
      e.preventDefault();
      if (e.key.toLowerCase() === 's') setSettings({ sound: !m.settings.sound });
      else if (!running && e.key === 'Enter') setRunning(true);
      else leaveApp();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, leaveApp, setSettings, m.settings.sound]);

  return (
    <main className="app-main demo" id="main" data-running={running ? '' : undefined}>
      <div className="demo__top">
        <h1 className="tty-banner">DEMO</h1>
        <p className="tty-dim">A landscape, a sun and a tune. Three.js, one colour, no models.</p>
      </div>

      {!caps.scene && <p className="tty-err demo__note" role="alert">This is drawn with WebGL, and this browser has not got it.</p>}
      {caps.scene && !running && (
        <p className="demo__note">
          This is nothing but motion, and you have asked your device for less of it.{' '}
          <button type="button" className="tty-link" onClick={() => setRunning(true)}>Run it anyway</button>, or{' '}
          <button type="button" className="tty-link" onClick={leaveApp}>go back</button>.
        </p>
      )}

      <div className="demo__foot">
        {running && (
          <p className="demo__scroller" aria-hidden="true">
            <span>{SCROLLER}{SCROLLER}</span>
          </p>
        )}
        <p className="demo__keys">
          <button type="button" className="tty-link" onClick={leaveApp}>ANY KEY TO STOP</button>
          <span> · </span>
          <button type="button" className="tty-link" onClick={() => setSettings({ sound: !settings.sound })}>
            S FOR SOUND: {settings.sound ? 'ON' : 'OFF'}
          </button>
        </p>
      </div>
    </main>
  );
}
