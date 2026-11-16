/**
 * What the arcade lists. Kept apart from the engine so the menu, the manual and the
 * prerendered pages can describe the games without loading a line of game code.
 */
export interface GameInfo {
  id: 'trace' | 'decode';
  title: string;
  blurb: string;
  keys: string;
  /** Whether the game is played by typing words, which on a phone means the soft keyboard. */
  typed: boolean;
}

export const GAMES: GameInfo[] = [
  {
    id: 'trace',
    title: 'TRACE',
    blurb: "Steer the trace. Eat the letters as they appear and you spell out what I build with, one tool at a time. Don't hit the wall, and don't hit yourself.",
    keys: 'Arrow keys or WASD to steer. Swipe on a phone. P pauses, Q quits.',
    typed: false,
  },
  {
    id: 'decode',
    title: 'DECODE',
    blurb: "Words fall like rain. Type each one before it reaches the bottom. Let three through and it's over.",
    keys: 'Just type. On a phone, tap the screen to bring up the keyboard. Esc quits.',
    typed: true,
  },
];

export const gameFor = (id: string | undefined) => GAMES.find((g) => g.id === id);
