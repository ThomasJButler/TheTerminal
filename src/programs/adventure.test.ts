import { describe, expect, it } from 'vitest';
import { blockLines } from '@/fs/md';
import { NEW_GAME, adventure, hint, type AdventureState } from './adventure';

function play(lines: string[], from: AdventureState = NEW_GAME) {
  let state = from;
  let said = '';
  for (const line of lines) {
    const step = adventure(line, state);
    state = step.state;
    said = blockLines(step.out).join(' ');
  }
  return { state, said };
}

const WALKTHROUGH = [
  'take notebook', 'e', 'take ball', 'east', 'get torch', 'up', 'e', 'open laptop', 'e', 'take certificate', 'go east',
  'n', 'take semicolon', 's', 'use semicolon on ticket', 'e', 'use notebook', 'e', 'plug in keyboard', 'turn on terminal',
];

describe('STANDING START', () => {
  it('can be finished', () => {
    const { state, said } = play(WALKTHROUGH);
    expect(state.done).toBe(true);
    expect(said).toContain('TJB-100');
    expect(said).toContain('a notebook of ideas, a cricket ball, a dive torch and a certificate');
  });

  it('can be finished by following HINT and nothing else', () => {
    // Every hint names the thing to type, in capitals. If one stops doing that, this fails.
    const moveIn = (advice: string) =>
      /\b(TAKE|USE|PLUG IN|TURN ON) the \w+/.exec(advice)?.[0] ?? (/OPEN it/.test(advice) ? 'OPEN laptop' : /\b(NORTH|SOUTH|EAST|WEST|UP)\b/.exec(advice)?.[0]);
    let state = NEW_GAME;
    for (let i = 0; i < 60 && !state.done; i++) {
      const advice = hint(state);
      const move = moveIn(advice);
      expect(move, `no move in hint: ${advice}`).toBeTruthy();
      state = adventure(move!, state).state;
    }
    expect(state.done).toBe(true);
  });

  it('will not let you leave the ideas behind', () => {
    expect(play(['east']).state.room).toBe('bedroom');
    expect(play(['east']).said).toContain('NOTEBOOK');
  });

  it('is dark where it should be, and a torch fixes that', () => {
    const noTorch = ['take notebook', 'e', 'e', 'up', 'e', 'open laptop', 'e', 'e', 'n'];
    expect(play(noTorch).said).toContain("can't see a thing");
    expect(play([...noTorch, 'take semicolon']).said).toContain("can't see well enough");
    const withTorch = ['take notebook', 'e', 'e', 'take torch', 'up', 'e', 'open laptop', 'e', 'e', 'n'];
    expect(play(withTorch).said).toContain('SEMICOLON');
  });

  it('has no dead ends: you can always walk back for what you missed', () => {
    const { state } = play(['take notebook', 'e', 'e', 'up', 'e', 'open laptop', 'e', 'e', 'w', 'w', 'w', 'down', 'take torch']);
    expect(state.where.torch).toBe('inv');
  });

  it('understands the things people actually type', () => {
    expect(play(['look at ipod']).said).toContain('Jailbroken');
    expect(play(['x the telly']).said).toContain('rain');
    expect(play(['pick up the notebook', 'i']).said).toContain('notebook');
    expect(play(['dance']).said).toContain("don't know how");
    expect(play(['take notebook', 'e', 'e', 'up', 'e', 'help someone']).said).toContain('whole appointment');
    expect(play(['take notebook', 'e', 'e', 'up', 'e', 'write some code']).state.flags.coded).toBe(true);
  });

  it('does not count a turn for asking for help', () => {
    expect(play(['help', 'hint', 'score']).state.moves).toBe(0);
    expect(play(['look']).state.moves).toBe(1);
  });
});
