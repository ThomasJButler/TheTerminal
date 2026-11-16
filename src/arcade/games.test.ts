import { afterEach, describe, expect, it, vi } from 'vitest';
import { decode, DECODE_WORDS } from './decode';
import { TextScreen } from './engine';
import { GAMES } from './games';
import { trace, TRACE_WORDS } from './trace';

const sounds: string[] = [];
const api = { sfx: (name: string) => void sounds.push(name) };
const COLS = 60;
const ROWS = 22;

afterEach(() => {
  vi.restoreAllMocks();
  sounds.length = 0;
});

/** Everything on a row of the screen, as a string. */
function row(screen: TextScreen, y: number): string {
  return screen.chars.slice(y * screen.cols, (y + 1) * screen.cols).join('');
}

describe('the word lists', () => {
  it('are drawn from what the site says he uses and builds', () => {
    expect(TRACE_WORDS).toContain('PYTHON');
    expect(TRACE_WORDS).toContain('TYPESCRIPT');
    expect(DECODE_WORDS).toContain('SANCTUARY');
    // Every word has to be typeable and has to fit a narrow screen.
    for (const word of [...TRACE_WORDS, ...DECODE_WORDS]) expect(word).toMatch(/^[A-Z]{3,12}$/);
  });

  it('every listed game has somewhere to be played', () => {
    expect(GAMES.map((g) => g.id)).toEqual(['trace', 'decode']);
  });
});

describe('TRACE', () => {
  it('runs into the wall if nobody steers', () => {
    const game = trace(COLS, ROWS, api);
    for (let i = 0; i < 400 && !game.over; i++) game.tick(0.05);
    expect(game.over).toBe(true);
    expect(sounds).toContain('crash');
  });

  it('will not turn back on itself', () => {
    const game = trace(COLS, ROWS, api);
    game.key('left');
    for (let i = 0; i < 10; i++) game.tick(0.05);
    // Still heading right, so still alive after a few cells.
    expect(game.over).toBe(false);
  });

  it('eats the letter in front of it, scores, and spells the word', () => {
    // The first letter lands wherever Math.random says: zero, twice, is the top-left cell.
    // After that the real one is back, so the next letter can land somewhere free.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);
    const game = trace(COLS, ROWS, api);
    const screen = new TextScreen(COLS, ROWS);
    game.draw(screen);
    expect(row(screen, 0)).toContain(`SPELL ${'_'.repeat(TRACE_WORDS[0].length)}`);

    // It starts in the middle row, heading right, with its head in the fourth column.
    // One tick of this length is one cell: up to the top row, then left to the corner.
    const cell = 1 / 7 + 1e-9;
    const middle = Math.floor((ROWS - 3) / 2);
    game.key('up');
    for (let i = 0; i < middle; i++) game.tick(cell);
    game.key('left');
    for (let i = 0; i < 3; i++) game.tick(cell);

    expect(game.over).toBe(false);
    expect(game.score).toBe(10);
    expect(sounds).toContain('eat');
    game.draw(screen);
    expect(row(screen, 0)).toContain(`SPELL ${TRACE_WORDS[0][0]}`);
  });

  it('lays itself out in whatever screen it is given', () => {
    for (const [cols, rows] of [[48, 30], [120, 28], [30, 12]]) {
      const game = trace(cols, rows, api);
      const screen = new TextScreen(cols, rows);
      game.tick(0.05);
      expect(() => game.draw(screen)).not.toThrow();
      expect(row(screen, 0)).toContain('TRACE');
    }
  });
});

describe('DECODE', () => {
  /** Tick until a word is on screen, and say what it is. */
  function firstWord(game: ReturnType<typeof decode>, screen: TextScreen): string {
    for (let i = 0; i < 40; i++) {
      game.tick(0.05);
      game.draw(screen);
      for (let y = 1; y < ROWS - 1; y++) {
        const found = /[A-Z]{3,}/.exec(row(screen, y));
        if (found) return found[0];
      }
    }
    throw new Error('no word appeared');
  }

  it('clears a word when it is typed, and scores its length', () => {
    const game = decode(COLS, ROWS, api);
    const screen = new TextScreen(COLS, ROWS);
    const word = firstWord(game, screen);
    expect(DECODE_WORDS).toContain(word);
    for (const ch of word.toLowerCase()) game.key(ch);
    expect(game.score).toBe(word.length * 10);
    game.draw(screen);
    expect(screen.chars.join('')).not.toContain(word);
  });

  it('ignores a letter that starts nothing, and a wrong letter mid-word', () => {
    const game = decode(COLS, ROWS, api);
    const screen = new TextScreen(COLS, ROWS);
    const word = firstWord(game, screen);
    const wrong = 'abcdefghijklmnopqrstuvwxyz'.split('').find((ch) => ch.toUpperCase() !== word[0] && ch.toUpperCase() !== word[1])!;
    game.key(wrong);
    expect(sounds).toContain('error');
    game.key(word[0].toLowerCase());
    game.key(wrong);
    for (const ch of word.slice(1).toLowerCase()) game.key(ch);
    expect(game.score).toBe(word.length * 10);
  });

  it('ends after three words reach the bottom', () => {
    const game = decode(COLS, ROWS, api);
    for (let i = 0; i < 4000 && !game.over; i++) game.tick(0.05);
    expect(game.over).toBe(true);
    expect(sounds.filter((s) => s === 'miss').length).toBe(2);
    expect(sounds).toContain('crash');
  });

  it('never has two words on screen that start with the same letter', () => {
    const game = decode(COLS, ROWS, api);
    const screen = new TextScreen(COLS, ROWS);
    for (let i = 0; i < 300 && !game.over; i++) {
      game.tick(0.05);
      game.draw(screen);
      const initials: string[] = [];
      for (let y = 1; y < ROWS - 1; y++) for (const match of row(screen, y).matchAll(/[A-Z]{3,}/g)) initials.push(match[0][0]);
      expect(new Set(initials).size, initials.join('')).toBe(initials.length);
    }
  });
});
