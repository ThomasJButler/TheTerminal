import { USE_NOW, USE_NOW_ALSO } from '@/content/site';
import { BLOCK, BLOCK_BRIGHT, BRIGHT, DIM, INVERSE, type GameFactory, type TextScreen } from './engine';

/**
 * TRACE. You steer a line that grows. The letters it eats spell out the tools Tom builds
 * with, one word at a time, so the list is taken from the same place the stack page reads.
 */

export const TRACE_WORDS = [...USE_NOW, ...USE_NOW_ALSO].map((w) => w.toUpperCase()).filter((w) => /^[A-Z]{3,12}$/.test(w));

interface Cell {
  x: number;
  y: number;
}

const DIRS: Record<string, Cell> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
};

export const trace: GameFactory = (cols, rows, api) => {
  // Row 0 is the status line. The field sits in a box below it, and each cell of the
  // field is two columns wide, which on a terminal is what makes a cell roughly square.
  // Capped, so a wide monitor does not turn every letter into a long walk.
  const width = Math.min(40, Math.max(6, Math.floor((cols - 2) / 2)));
  const height = Math.min(24, Math.max(6, rows - 3));
  const left = Math.floor((cols - (width * 2 + 2)) / 2);

  let body: Cell[] = [];
  let dir = DIRS.right;
  let queue: Cell[] = [];
  let food: Cell = { x: 0, y: 0 };
  let words = 0;
  let word = TRACE_WORDS[0];
  let at = 0;
  let speed = 7;
  let clock = 0;
  let score = 0;
  let over = false;
  let cheer = '';
  let cheerFor = 0;

  const free = (cell: Cell) => !body.some((b) => b.x === cell.x && b.y === cell.y);
  const place = () => {
    do food = { x: Math.floor(Math.random() * width), y: Math.floor(Math.random() * height) };
    while (!free(food));
  };

  const mid = Math.floor(height / 2);
  body = [3, 2, 1].map((x) => ({ x: Math.min(x, width - 1), y: mid }));
  place();

  const step = () => {
    const turn = queue.shift();
    if (turn) dir = turn;
    const head = { x: body[0].x + dir.x, y: body[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= width || head.y >= height || !free(head)) {
      over = true;
      api.sfx('crash');
      return;
    }
    body.unshift(head);
    if (head.x !== food.x || head.y !== food.y) {
      body.pop();
      return;
    }
    score += 10;
    at += 1;
    if (at < word.length) api.sfx('eat');
    else {
      // A whole word: worth more, and the trace speeds up.
      score += 50;
      cheer = `${word} +50`;
      cheerFor = 1.6;
      words += 1;
      word = TRACE_WORDS[words % TRACE_WORDS.length];
      at = 0;
      speed = Math.min(16, speed + 0.6);
      api.sfx('word');
    }
    place();
  };

  return {
    get score() {
      return score;
    },
    get over() {
      return over;
    },
    key(key) {
      const want = DIRS[key];
      if (!want || queue.length >= 2) return;
      const facing = queue[queue.length - 1] ?? dir;
      // No doubling back on yourself, and no queueing the direction you are already going.
      if (want.x === -facing.x && want.y === -facing.y) return;
      if (want.x === facing.x && want.y === facing.y) return;
      queue.push(want);
    },
    tick(seconds) {
      cheerFor = Math.max(0, cheerFor - seconds);
      clock += seconds * speed;
      while (clock >= 1 && !over) {
        clock -= 1;
        step();
      }
    },
    draw(screen: TextScreen) {
      screen.clear();
      screen.text(left, 0, 'TRACE', BRIGHT);
      screen.text(left + 7, 0, `SCORE ${String(score).padStart(4, '0')}`);
      const spelling = `SPELL ${word.slice(0, at)}${'_'.repeat(word.length - at)}`;
      screen.text(left + width * 2 + 2 - spelling.length, 0, cheerFor > 0 && spelling.length + cheer.length + 30 > cols ? ' '.repeat(spelling.length) : spelling, DIM);
      if (cheerFor > 0) screen.centre(0, cheer, INVERSE);
      screen.box(left, 1, width * 2 + 2, height + 2);

      const cell = (c: Cell, attr: number, text = '  ') => {
        screen.put(left + 1 + c.x * 2, 2 + c.y, text[0], attr);
        screen.put(left + 2 + c.x * 2, 2 + c.y, text[1], attr);
      };
      cell(food, INVERSE, `${word[at]} `);
      body.forEach((segment, i) => cell(segment, i === 0 ? BLOCK_BRIGHT : BLOCK));
      if (over) screen.panel(['END OF THE LINE', `SCORE ${score}`, `${words} ${words === 1 ? 'WORD' : 'WORDS'} SPELLED`, '', 'ENTER TO GO AGAIN']);
    },
  };
};
