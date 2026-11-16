import { useLayoutEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { LiveEntry, Machine } from '@/machine/useMachine';
import { Blocks, EntryContext } from './Blocks';
import type { Program } from './types';

/** The prompt each program shows. The shell's says where you are; the others say who is listening. */
export function Prompt({ program, cwd }: { program: Program; cwd: string }) {
  if (program === 'shell') {
    return (
      <span className="tty-ps1">
        <span className="tty-ps1__host">visitor@tjb-100:</span>
        <b>{cwd}</b>$
      </span>
    );
  }
  return (
    <span className="tty-ps1">
      <b>{program === 'adventure' ? '' : program}</b>&gt;
    </span>
  );
}

const PLACEHOLDER: Record<Program, string> = {
  menu: 'Enter for the demo, or 0-9, or a command',
  shell: 'type help, or ls',
  operator: 'ask me something',
  adventure: 'what do you do?',
};

function EntryView({ entry }: { entry: LiveEntry }) {
  const ref = useRef<HTMLElement>(null);

  // Fresh output prints down the screen a line at a time, the way a 9600 baud line delivers
  // it. Measured after layout, because how many lines there are depends on the width.
  useLayoutEffect(() => {
    const out = ref.current?.querySelector<HTMLElement>('.tty-out');
    if (!out || !entry.fresh || entry.wait) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const line = parseFloat(getComputedStyle(out).lineHeight) || 24;
    const lines = Math.max(1, Math.round(out.scrollHeight / line));
    const ms = Math.min(1100, Math.max(140, lines * 26));
    out.style.animation = 'none';
    void out.offsetHeight;
    out.style.animation = `print ${ms}ms steps(${Math.min(lines, 60)}) backwards`;
  }, [entry.fresh, entry.wait]);

  return (
    <section
      ref={ref}
      id={`e${entry.id}`}
      className="tty-entry"
      data-screen={entry.screen ? '' : undefined}
      data-wait={entry.wait ? '' : undefined}
    >
      {entry.cmd !== null && (
        <p className="tty-cmd">
          <Prompt program={entry.program} cwd={entry.cwd} />
          <span>{entry.cmd}</span>
        </p>
      )}
      <EntryContext.Provider value={{ id: entry.id, links: entry.links }}>
        <Blocks blocks={entry.out} />
      </EntryContext.Provider>
    </section>
  );
}

function Keys({ m }: { m: Machine }) {
  const { program, run, settings, caps } = m;
  const key = (label: string, name: string, action: () => void) => (
    <Button key={label + name} variant="ghost" size="xs" onClick={action}>
      {label && <b>{label}</b>}
      {name}
    </Button>
  );
  const help = key('PF1', 'HELP', () => run('help'));
  const find = key('PF3', 'FIND', () => m.setPaletteOpen(true));

  if (program === 'menu') {
    return (
      <>
        {help}
        {find}
        {key('♪', settings.sound ? 'SOUND ON' : 'SOUND OFF', () => m.setSettings({ sound: !settings.sound }))}
        {key('PF4', 'STEP BACK', () => run('0'))}
      </>
    );
  }
  if (program === 'operator') {
    return (
      <>
        {help}
        {caps.listen && key('●', m.listening ? 'LISTENING' : 'TALK', () => (m.listening ? m.stopVoice() : run('talk')))}
        {caps.speak && key('♪', settings.voice ? 'VOICE ON' : 'VOICE OFF', () => run(settings.voice ? 'voice off' : 'voice on'))}
        {key('PF4', 'MENU', () => run('exit'))}
      </>
    );
  }
  if (program === 'adventure') {
    return (
      <>
        {key('', 'LOOK', () => run('look'))}
        {key('', 'INV', () => run('inventory'))}
        {(['N', 'E', 'S', 'W', 'UP'] as const).map((dir) => key('', dir, () => run(dir.toLowerCase())))}
        {key('', 'HINT', () => run('hint'))}
        {key('PF4', 'MENU', () => run('quit'))}
      </>
    );
  }
  return (
    <>
      {help}
      {key('PF2', 'LIST', () => run('ls -l'))}
      {find}
      {key('←', 'BACK', () => run('cd ..'))}
      {key('PF4', 'MENU', () => run('menu'))}
    </>
  );
}

export function Terminal({ m }: { m: Machine }) {
  const { entries, program, cwd, input, options } = m;

  // Coming back from the arcade or the demo, pick up at the last thing on the screen.
  useLayoutEffect(() => {
    const last = entries[entries.length - 1];
    if (last && last.id > 1) document.getElementById(`e${last.id}`)?.scrollIntoView({ block: 'start' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <main className="tty-main" id="main">
        <div className="tty-col" aria-live="polite" aria-relevant="additions">
          {entries.map((entry) => (
            <EntryView key={entry.id} entry={entry} />
          ))}
        </div>
      </main>

      <footer className="tty-foot">
        <div className="tty-col">
          {m.touring && <div className="tty-options tty-notice">TOUR · ANY KEY GIVES YOU THE KEYBOARD BACK</div>}
          {options.length > 0 && (
            <div className="tty-options">{options.map((o) => <span key={o}>{o}</span>)}</div>
          )}
          <form
            className="tty-prompt"
            onSubmit={(e) => {
              e.preventDefault();
              m.submit();
            }}
          >
            <label htmlFor="prompt"><Prompt program={program} cwd={cwd} /></label>
            <input
              id="prompt"
              ref={m.inputRef}
              className="tty-input"
              value={input}
              onChange={(e) => {
                m.setInput(e.target.value);
                m.setOptions([]);
              }}
              onKeyDown={m.onPromptKey}
              placeholder={m.listening ? 'listening…' : PLACEHOLDER[program]}
              aria-label={program === 'shell' ? 'Command' : program === 'menu' ? 'Menu choice or command' : program === 'operator' ? 'Question' : 'What you do next'}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
            />
          </form>
          <nav className="tty-pf" aria-label="Function keys">
            <Keys m={m} />
          </nav>
        </div>
      </footer>
    </>
  );
}
