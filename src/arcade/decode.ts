import { projects } from '@/content/projects';
import { BRIGHT, DIM, INVERSE, type GameFactory, type TextScreen } from './engine';
import { TRACE_WORDS } from './trace';

/**
 * DECODE. Words come down like the rain behind the glass, and typing one clears it. The
 * words are the stack and the names of the projects, so the list keeps up with the files.
 */

const NAMES = projects.map((x) => x.name.toUpperCase()).filter((name) => /^[A-Z]{4,10}$/.test(name));
export const DECODE_WORDS = [...new Set([...TRACE_WORDS.filter((w) => w.length <= 10), ...NAMES])];

const STATIC = '01<>=+*:;/\\|';

interface Falling {
  text: string;
  x: number;
  y: number;
  typed: number;
  seed: number;
}

export const decode: GameFactory = (screenCols, rows, api) => {
  // Capped and centred: on a wide monitor the words would otherwise be a head-turn apart.
  const cols = Math.min(screenCols, 90);
  const left = Math.floor((screenCols - cols) / 2);
  const floor = rows - 1;
  let falling: Falling[] = [];
  let target: Falling | null = null;
  let spawnIn = 0.4;
  let every = 2.4;
  let fall = 1.3;
  let cleared = 0;
  let level = 1;
  let lives = 3;
  let score = 0;
  let over = false;
  let clock = 0;
  let hurt = 0;

  const spawn = () => {
    const taken = new Set(falling.map((f) => f.text[0]));
    // Two words starting with the same letter would make the first keystroke ambiguous.
    const pool = DECODE_WORDS.filter((w) => !taken.has(w[0]) && w.length < cols - 2);
    if (!pool.length) return;
    const text = pool[Math.floor(Math.random() * pool.length)];
    falling.push({ text, x: 1 + Math.floor(Math.random() * Math.max(1, cols - text.length - 2)), y: 1, typed: 0, seed: Math.random() * 100 });
  };

  return {
    get score() {
      return score;
    },
    get over() {
      return over;
    },
    key(key) {
      if (over) return;
      if (key === 'back') {
        if (target) target.typed = 0;
        target = null;
        return;
      }
      if (!/^[a-z]$/.test(key)) return;
      const ch = key.toUpperCase();
      if (!target) {
        // Lock on to the lowest word that starts with this letter.
        target = falling.filter((f) => f.text[0] === ch).sort((a, b) => b.y - a.y)[0] ?? null;
        if (!target) {
          api.sfx('error');
          return;
        }
        target.typed = 1;
      } else if (target.text[target.typed] === ch) target.typed += 1;
      else {
        api.sfx('error');
        return;
      }
      if (target.typed < target.text.length) {
        api.sfx('hit');
        return;
      }
      score += target.text.length * 10;
      cleared += 1;
      falling = falling.filter((f) => f !== target);
      target = null;
      if (cleared % 6 === 0) {
        level += 1;
        fall *= 1.12;
        every = Math.max(0.9, every * 0.9);
        api.sfx('level');
      } else api.sfx('word');
    },
    tick(seconds) {
      clock += seconds;
      hurt = Math.max(0, hurt - seconds);
      spawnIn -= seconds;
      if (spawnIn <= 0) {
        spawn();
        spawnIn = every;
      }
      for (const word of falling) word.y += fall * seconds;
      const landed = falling.filter((f) => f.y >= floor);
      if (!landed.length) return;
      falling = falling.filter((f) => f.y < floor);
      if (target && landed.includes(target)) target = null;
      lives -= landed.length;
      hurt = 0.35;
      if (lives > 0) api.sfx('miss');
      else {
        lives = 0;
        over = true;
        api.sfx('crash');
      }
    },
    draw(screen: TextScreen) {
      screen.clear();
      screen.text(left + 1, 0, 'DECODE', BRIGHT);
      screen.text(left + 9, 0, `SCORE ${String(score).padStart(4, '0')}`);
      const right = `LEVEL ${level}  LIVES ${'*'.repeat(lives)}${'.'.repeat(3 - lives)}`;
      screen.text(left + cols - right.length - 1, 0, right, hurt > 0 ? INVERSE : DIM);
      screen.text(left, floor, '='.repeat(cols), hurt > 0 ? BRIGHT : DIM);

      const tick = Math.floor(clock * 9);
      for (const word of falling) {
        const y = Math.floor(word.y);
        // A few characters of static above each word, so it reads as a stream coming down.
        for (let i = 1; i <= 3; i++) {
          if (y - i < 1) break;
          const n = Math.floor(word.seed + i * 7 + tick * (i + 1));
          screen.put(left + word.x + (n % word.text.length), y - i, STATIC[n % STATIC.length], DIM);
        }
        for (let i = 0; i < word.text.length; i++) {
          const attr = i < word.typed ? INVERSE : word === target ? BRIGHT : 0;
          screen.put(left + word.x + i, y, word.text[i], attr);
        }
      }
      if (over) screen.panel(['SIGNAL LOST', `SCORE ${score}`, `${cleared} ${cleared === 1 ? 'WORD' : 'WORDS'} DECODED`, '', 'ENTER TO GO AGAIN']);
    },
  };
};
