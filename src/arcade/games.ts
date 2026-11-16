/**
 * What the arcade lists. Kept apart from the engine so the menu, the manual and the
 * prerendered pages can describe the games without loading a line of game code.
 */
export interface GameInfo {
  id: 'trace' | 'decode' | 'matrix';
  title: string;
  blurb: string;
  keys: string;
  /** Whether the game is played by typing words, which on a phone means the soft keyboard. */
  typed: boolean;
  /** Set for a game that is not drawn here at all, but runs at its own address in a frame. */
  embed?: string;
}

export const MATRIX_ARCADE_URL = 'https://the-matrix-arcade.vercel.app/';

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
  {
    id: 'matrix',
    title: 'THE MATRIX ARCADE',
    blurb: 'Twelve more games behind one cabinet, built with React, TypeScript and Phaser 3. It runs at its own address and is wired in here.',
    keys: 'Each game says how it is played. The button under the screen brings you back.',
    typed: false,
    embed: MATRIX_ARCADE_URL,
  },
];

/**
 * The twelve games in the Matrix Arcade, in its own order. Titles and one-liners are from
 * that project's gameRegistry.ts, which it calls its single source of truth.
 */
export const ROSTER: { title: string; kind: string; note: string }[] = [
  { title: 'CTRL-S | The World', kind: 'Story', note: 'A hilarious text adventure about saving the digital world across 5 chapters.' },
  { title: 'Matrix Snake', kind: 'Arcade', note: 'Slither through the cascade: devour data fragments, dodge walls, grow longer.' },
  { title: 'Vortex Pong', kind: 'Classic', note: 'Battle a ruthless AI opponent in a hypnotic arena with power-ups.' },
  { title: 'Matrix Bird', kind: 'Arcade', note: 'Flap between pipes in the code cascade. One missed beat and gravity wins.' },
  { title: 'Matrix Invaders', kind: 'Shooter', note: 'Defend against waves of code invaders with bullet time and combo chains.' },
  { title: 'Metris', kind: 'Puzzle', note: 'Stack falling code blocks, clear lines, and activate bullet time mode.' },
  { title: 'Matrix Frogger', kind: 'Arcade', note: 'Cross dangerous lanes packed with Agents and Sentinels to reach safety.' },
  { title: 'Neo Jump', kind: 'Classic', note: 'Jump through simulation layers, collect power-ups, and reach The Source.' },
  { title: 'Agent Chase', kind: 'Classic', note: 'Navigate a maze collecting data pills while evading the relentless Agent Smith.' },
  { title: 'Rhythm Hacker', kind: 'Rhythm', note: 'Hack through streams of falling code by hitting keys in time with the beat.' },
  { title: 'Cloud Jumper', kind: 'Arcade', note: 'Leap between clouds in the digital sky, collecting fragments and avoiding the void.' },
  { title: 'Code Breaker', kind: 'Arcade', note: 'Smash through firewalls of encrypted code to escape the simulation.' },
];

export const gameFor = (id: string | undefined) => GAMES.find((g) => g.id === id);
