import type { PatchName } from '@/machine/sound';

/**
 * A character-cell screen and the loop that drives a game on it. Games never touch the
 * canvas: they write characters into a grid, the way a program on a real terminal would,
 * and the renderer draws the grid. That is also why they fit any screen. A game is told
 * how many columns and rows there are and lays itself out in those.
 */

export const NORMAL = 0;
export const DIM = 1;
export const BRIGHT = 2;
/** Reverse video: the cell lit, the character dark. */
export const INVERSE = 3;
/** A solid cell, whatever character is in it. */
export const BLOCK = 4;
export const BLOCK_DIM = 5;
export const BLOCK_BRIGHT = 6;

export class TextScreen {
  readonly chars: string[];
  readonly attrs: Uint8Array;

  constructor(readonly cols: number, readonly rows: number) {
    this.chars = new Array<string>(cols * rows).fill(' ');
    this.attrs = new Uint8Array(cols * rows);
  }

  clear() {
    this.chars.fill(' ');
    this.attrs.fill(NORMAL);
  }

  put(x: number, y: number, ch: string, attr = NORMAL) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const i = y * this.cols + x;
    this.chars[i] = ch;
    this.attrs[i] = attr;
  }

  text(x: number, y: number, str: string, attr = NORMAL) {
    for (let i = 0; i < str.length; i++) this.put(x + i, y, str[i], attr);
  }

  centre(y: number, str: string, attr = NORMAL) {
    this.text(Math.floor((this.cols - str.length) / 2), y, str, attr);
  }

  /** A box in plain ASCII, the way a terminal without a line-drawing set would do it. */
  box(x: number, y: number, w: number, h: number, attr = DIM) {
    const bar = `+${'-'.repeat(Math.max(0, w - 2))}+`;
    this.text(x, y, bar, attr);
    this.text(x, y + h - 1, bar, attr);
    for (let row = y + 1; row < y + h - 1; row++) {
      this.put(x, row, '|', attr);
      this.put(x + w - 1, row, '|', attr);
    }
  }

  /** A filled panel with lines of text in it, centred on the screen. */
  panel(lines: string[], attr = BRIGHT) {
    const w = Math.min(this.cols, Math.max(...lines.map((l) => l.length)) + 6);
    const h = lines.length + 4;
    const x = Math.floor((this.cols - w) / 2);
    const y = Math.max(0, Math.floor((this.rows - h) / 2));
    for (let row = y; row < y + h; row++) this.text(x, row, ' '.repeat(w));
    this.box(x, y, w, h, attr);
    lines.forEach((line, i) => this.centre(y + 2 + i, line, i === 0 ? BRIGHT : NORMAL));
  }
}

export interface GameApi {
  sfx: (name: PatchName) => void;
}

export interface GameInstance {
  /** 'up', 'down', 'left', 'right', 'back', or a single lower-case character. */
  key(key: string): void;
  tick(seconds: number): void;
  draw(screen: TextScreen): void;
  readonly score: number;
  readonly over: boolean;
}

export type GameFactory = (cols: number, rows: number, api: GameApi) => GameInstance;

class Renderer {
  private ctx: CanvasRenderingContext2D;
  private size = 24;
  private advance = 12;
  private line = 24;
  private ox = 0;
  private oy = 0;
  private w = 0;
  private h = 0;
  private colours = { normal: '#9f9', dim: '#585', bright: '#6f6', back: '#020' };

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Fit a grid to the canvas, and say how big it came out. */
  layout(): { cols: number; rows: number } {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.size = this.w >= 900 ? 28 : this.w >= 560 ? 24 : 20;
    this.ctx.font = `${this.size}px VT323, ui-monospace, monospace`;
    this.advance = this.ctx.measureText('M').width;
    this.line = this.size;
    const cols = Math.max(1, Math.floor(this.w / this.advance));
    const rows = Math.max(1, Math.floor(this.h / this.line));
    this.ox = (this.w - cols * this.advance) / 2;
    this.oy = (this.h - rows * this.line) / 2;

    // The phosphor is a CSS variable. Let the browser resolve it to a colour a canvas takes.
    const probe = document.createElement('span');
    document.body.appendChild(probe);
    const resolve = (name: string) => {
      probe.style.color = `var(${name})`;
      return getComputedStyle(probe).color;
    };
    this.colours = { normal: resolve('--ink'), dim: resolve('--ink-dim'), bright: resolve('--ph'), back: resolve('--void') };
    probe.remove();
    return { cols, rows };
  }

  draw(screen: TextScreen) {
    const { ctx, advance, line, ox, oy, colours } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.font = `${this.size}px VT323, ui-monospace, monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (let y = 0; y < screen.rows; y++) {
      for (let x = 0; x < screen.cols; x++) {
        const i = y * screen.cols + x;
        const attr = screen.attrs[i];
        const ch = screen.chars[i];
        const px = ox + x * advance;
        const py = oy + y * line;
        if (attr >= BLOCK) {
          ctx.fillStyle = attr === BLOCK_DIM ? colours.dim : attr === BLOCK_BRIGHT ? colours.bright : colours.normal;
          ctx.fillRect(px, py + 1, advance + 0.5, line - 2);
        } else if (attr === INVERSE) {
          ctx.fillStyle = colours.bright;
          ctx.fillRect(px, py, advance + 0.5, line);
          ctx.fillStyle = colours.back;
          ctx.fillText(ch, px + advance / 2, py + line / 2 + 1);
        } else if (ch !== ' ') {
          ctx.fillStyle = attr === DIM ? colours.dim : attr === BRIGHT ? colours.bright : colours.normal;
          ctx.fillText(ch, px + advance / 2, py + line / 2 + 1);
        }
      }
    }
  }
}

export interface Running {
  key(key: string): void;
  restart(): void;
  pause(on: boolean): void;
  /** Call when the phosphor changes, so the colours are read again. */
  recolour(): void;
  stop(): void;
}

/** Start a game on a canvas. `onOver` fires once each time a game ends. */
export function runGame(canvas: HTMLCanvasElement, factory: GameFactory, api: GameApi, onOver: (score: number) => void): Running {
  const renderer = new Renderer(canvas);
  let screen = new TextScreen(1, 1);
  let game: GameInstance | null = null;
  let paused = false;
  let reported = false;
  let stopped = false;
  let raf = 0;
  let last = 0;

  const start = () => {
    const { cols, rows } = renderer.layout();
    screen = new TextScreen(cols, rows);
    game = factory(cols, rows, api);
    reported = false;
    paused = false;
  };

  const frame = (now: number) => {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    if (!game) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    if (!paused && !game.over) game.tick(dt);
    game.draw(screen);
    if (paused && !game.over) screen.panel(['PAUSED', 'P to carry on']);
    renderer.draw(screen);
    if (game.over && !reported) {
      reported = true;
      onOver(game.score);
    }
  };

  // The display face may still be on its way. Lay out once it has landed, or after a
  // moment if it never does, so a slow font cannot stop the game from starting.
  const ready = document.fonts?.load('24px VT323') ?? Promise.resolve();
  void Promise.race([ready, new Promise((done) => window.setTimeout(done, 1500))]).then(() => {
    if (stopped) return;
    start();
    raf = requestAnimationFrame(frame);
  });

  const onResize = () => game && start();
  const onHide = () => {
    if (document.hidden) paused = true;
  };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onHide);

  return {
    key: (key) => game && !paused && game.key(key),
    restart: () => game && start(),
    pause: (on) => {
      paused = on;
    },
    recolour: () => {
      if (game) renderer.layout();
    },
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onHide);
    },
  };
}
