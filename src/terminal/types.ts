import type { Block, FsNode } from '@/fs/types';
import type { Settings } from '@/machine/settings';
import type { AdventureState } from '@/programs/adventure';

/**
 * What is reading the prompt. The menu is the front door; the shell, the operator and the
 * adventure are each a different interpreter behind the same screen.
 */
export type Program = 'menu' | 'shell' | 'operator' | 'adventure';

export type Effect =
  | { e: 'clear' }
  | { e: 'reboot' }
  | { e: 'set'; patch: Partial<Settings> }
  | { e: 'palette' }
  | { e: 'mail' }
  | { e: 'href'; href: string }
  | { e: 'burst' }
  | { e: 'forget' }
  | { e: 'bell' }
  /** Out to the 3D view of the machine. */
  | { e: 'stepBack' }
  /** Hand the prompt to another program. `quiet` skips that program's opening screen. */
  | { e: 'program'; program: Program; quiet?: boolean }
  /** Full-screen programs that are not a prompt at all. */
  | { e: 'go'; to: 'arcade' | 'demo'; game?: string }
  | { e: 'tour' }
  /** The machine checks its own parts and reports. A VT100 did this at power-on. */
  | { e: 'selftest' }
  /** Read this aloud, if the visitor has asked for voice. */
  | { e: 'say'; text: string }
  | { e: 'listen' };

export interface Ctx {
  program: Program;
  cwd: string;
  settings: Settings;
  /** Paths of files already read. */
  found: ReadonlySet<string>;
  history: readonly string[];
  adventure: AdventureState;
  /** What this browser can do, so a program can say so instead of failing quietly. */
  caps: { speak: boolean; listen: boolean; scene: boolean };
}

export interface Result {
  out: Block[];
  cwd?: string;
  /** The node this command landed on: drives the URL and the found counter. */
  visit?: FsNode;
  /** An address to show that is not a file's: a program's front page. */
  url?: string;
  effects: Effect[];
  adventure?: AdventureState;
  /** Start on a clean screen, the way a BBS cleared before drawing a menu. */
  screen?: boolean;
  /** The shell did not recognise the line at all. The menu uses this to answer in its own words. */
  unknown?: boolean;
}

export interface Entry {
  id: number;
  cwd: string;
  /** The program whose prompt read the command. */
  program: Program;
  /** The program the output belongs to, which is the one its links should run in. */
  links: Program;
  /** null for output that no command produced: the boot line. */
  cmd: string | null;
  out: Block[];
  screen?: boolean;
}

export const PROGRAM_URL: Record<Program, string> = {
  menu: '/',
  shell: '/terminal',
  operator: '/operator',
  adventure: '/adventure',
};
