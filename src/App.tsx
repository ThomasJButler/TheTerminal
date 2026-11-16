import { useEffect, useState } from 'react';
import { ArcadeView } from '@/arcade/ArcadeView';
import { MACHINE } from '@/content/site';
import { DemoView } from '@/demo/DemoView';
import { sound } from '@/machine/sound';
import { useMachine, type Machine } from '@/machine/useMachine';
import { SceneLayer } from '@/scene/SceneLayer';
import { TtyContext, hrefTo } from '@/terminal/Blocks';
import { Lightbox, Mail, Palette } from '@/terminal/Overlays';
import { Terminal } from '@/terminal/Terminal';
import { progress } from '@/terminal/commands';

const pad = (n: number) => String(n).padStart(2, '0');

/** The line across the top: which machine, where you are on it, and what it remembers. */
function StatusBar({ m }: { m: Machine }) {
  const { view, game, program, cwd, settings, hydrated } = m;
  const { have, total } = progress(m.found);
  const where =
    view === 'arcade' ? (game ? `ARCADE · ${game.title}` : 'ARCADE')
    : view === 'demo' ? 'DEMO'
    : program === 'menu' ? 'MAIN MENU'
    : program === 'operator' ? 'OPERATOR'
    : program === 'adventure' ? 'STANDING START'
    : cwd;
  return (
    <header className="tty-status">
      <div className="tty-col tty-status__row">
        <a
          className="tty-status__name"
          href={hrefTo('/')}
          onClick={(e) => {
            e.preventDefault();
            if (view === 'terminal') m.run('menu', { program: 'shell' });
            else m.navigate('/');
          }}
        >
          {MACHINE}
        </a>
        <span className="tty-status__cwd">{where}</span>
        <span className="tty-status__meta">{m.cols} COL</span>
        <span className="tty-status__found" title="Files read">
          {hydrated ? `${pad(have)}/${pad(total)}` : `--/${pad(total)}`}
        </span>
        <button
          type="button"
          className="tty-status__sound"
          aria-pressed={settings.sound}
          onClick={() => m.setSettings({ sound: !settings.sound })}
        >
          ♪ {settings.sound ? 'ON' : 'OFF'}
        </button>
        <span className="tty-status__clock">{m.clock}</span>
      </div>
    </header>
  );
}

/** Over the machine, before anyone has sat down: the one question a BBS always asked first. */
function Intro({ m }: { m: Machine }) {
  return (
    <div className="intro" data-leaving={m.outside === 'entering' ? '' : undefined} onClick={() => m.sitDown()}>
      <p className="intro__ask" id="intro-ask">SOUND?</p>
      <div className="intro__keys" role="group" aria-labelledby="intro-ask">
        <button type="button" onClick={(e) => { e.stopPropagation(); m.sitDown(true); }}><b>Y</b>ES</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); m.sitDown(false); }}><b>N</b>O</button>
      </div>
      <p className="intro__hint">{m.sceneReady ? 'Any other key connects without changing it.' : 'warming up the tube'}</p>
    </div>
  );
}

export function App() {
  const m = useMachine();
  const [demoOn, setDemoOn] = useState(false);
  const { view, outside, settings, caps } = m;

  // The demo is the scene. If nothing has needed the scene yet, it does now.
  const { sceneWanted, wantScene } = m;
  useEffect(() => {
    if (view === 'demo' && demoOn && caps.scene && !sceneWanted) wantScene();
  }, [view, demoOn, caps.scene, sceneWanted, wantScene]);

  return (
    <TtyContext.Provider value={m.api}>
      {sceneWanted && (
        <SceneLayer
          ref={m.sceneRef}
          initialMode={outside === 'no' ? 'inside' : 'attract'}
          phosphor={settings.phosphor}
          rain={settings.rain}
          demo={view === 'demo' && demoOn}
          beat={sound.beat}
          onReady={m.sceneIsReady}
          onUnavailable={m.sceneUnavailable}
        />
      )}

      {outside !== 'no' && <Intro m={m} />}

      <div className="screen" data-view={view} inert={outside !== 'no'}>
        <StatusBar m={m} />
        {view === 'terminal' && <Terminal m={m} />}
        {view === 'arcade' && <ArcadeView m={m} />}
        {view === 'demo' && <DemoView m={m} onRunning={setDemoOn} />}
      </div>

      <div className="crt" aria-hidden="true" />
      <Palette open={m.paletteOpen} onOpenChange={m.setPaletteOpen} found={m.found} run={(line) => m.run(line, { program: 'shell' })} />
      <Mail open={m.mailOpen} onOpenChange={m.setMailOpen} />
      <Lightbox zoom={m.zoom} onChange={m.setZoom} />
    </TtyContext.Provider>
  );
}
