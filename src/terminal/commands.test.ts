import { describe, expect, it } from 'vitest';
import { FORTUNES, MENU } from '@/content/site';
import { ALL_FILES, nodeForUrl, resolve, urlFor } from '@/fs/tree';
import { blockLines } from '@/fs/md';
import { complete, exec } from './commands';
import { MODE_ROUTES, SERVER_CTX, commandForUrl, interpret, metaFor, sessionFor, viewFor } from './interpret';
import type { Ctx, Program } from './types';

const ctx = (cwd = '~', program: Program = 'shell'): Ctx => ({ ...SERVER_CTX, cwd, program });
const text = (out: ReturnType<typeof exec>['out']) => blockLines(out).join(' ');

describe('filesystem', () => {
  it('every file renders text and round-trips through its URL', () => {
    expect(ALL_FILES.length).toBeGreaterThan(40);
    for (const f of ALL_FILES) {
      expect(blockLines(f.blocks()).join(' ').length, f.path).toBeGreaterThan(40);
      expect(nodeForUrl(urlFor(f))?.path, f.path).toBe(f.path);
    }
  });

  it('no two files share a URL, and none collides with a program', () => {
    const urls = ALL_FILES.map(urlFor);
    expect(new Set(urls).size).toBe(urls.length);
    for (const route of MODE_ROUTES) expect(urls, route).not.toContain(route);
  });

  it('forgives a missing extension and resolves relative paths', () => {
    expect(resolve('~', 'about')?.path).toBe('~/about.txt');
    expect(resolve('~/projects', '../now')?.path).toBe('~/now.txt');
    expect(resolve('~/projects', 'sanctuary')?.path).toBe('~/projects/sanctuary.md');
    expect(resolve('~', 'nope')).toBeUndefined();
  });

  it('every fortune is something the files actually say', () => {
    const everything = ALL_FILES.flatMap((f) => blockLines(f.blocks())).join('\n');
    for (const line of FORTUNES) expect(everything, line).toContain(line);
  });
});

describe('shell', () => {
  it('ls hides dotfiles until asked', () => {
    expect(text(exec('ls', ctx()).out)).not.toContain('.rabbit');
    expect(text(exec('ls -a', ctx()).out)).toContain('.rabbit');
  });

  it('cd moves, cat reads and reports the node visited', () => {
    expect(exec('cd projects', ctx()).cwd).toBe('~/projects');
    expect(exec('cat sanctuary', ctx('~/projects')).visit?.path).toBe('~/projects/sanctuary.md');
    expect(exec('cd ..', ctx('~/projects')).cwd).toBe('~');
    // From the wrong directory, a path from home still works.
    expect(exec('cat blog/context-engineering-101', ctx('~/work')).visit?.path).toBe('~/blog/context-engineering-101.md');
  });

  it('a bare path opens it, and nonsense says so', () => {
    expect(exec('about.txt', ctx()).visit?.path).toBe('~/about.txt');
    expect(exec('flibble', ctx())).toMatchObject({ unknown: true });
  });

  it('grep searches hidden files too', () => {
    expect(text(exec('grep skiing', ctx()).out)).toContain('.interests');
  });

  it('set validates and emits an effect', () => {
    expect(exec('set cols 132', ctx()).effects).toEqual([{ e: 'set', patch: { cols: 132 } }]);
    expect(exec('set sound on', ctx()).effects).toEqual([{ e: 'set', patch: { sound: true } }]);
    expect(exec('set cols 90', ctx()).effects).toEqual([]);
    // The server context has no speech synthesis, so voice cannot be switched on there.
    expect(exec('set voice on', ctx()).effects).toEqual([]);
  });

  it('has a manual page for everything in the short manual', () => {
    for (const cmd of ['ls', 'cd', 'cat', 'grep', 'tree', 'ask', 'mail', 'setup', 'progress', 'man', 'menu']) {
      expect(text(exec(`man ${cmd}`, ctx()).out), cmd).toContain('SYNOPSIS');
    }
  });

  it('completes commands and paths', () => {
    expect(complete('gr', '~').line).toBe('grep ');
    expect(complete('cat ab', '~').line).toBe('cat about.txt');
    expect(complete('cd pro', '~').line).toBe('cd projects/');
    expect(complete('cat projects/sanc', '~').line).toBe('cat projects/sanctuary.md');
  });
});

describe('programs', () => {
  it('every menu item does something, by number and by name', () => {
    for (const item of MENU) {
      for (const typed of [item.key, item.name.toLowerCase()]) {
        const result = interpret(typed, ctx('~', 'menu'));
        expect(result.out.some((b) => b.k === 'err'), `${typed}: ${text(result.out)}`).toBe(false);
        expect(result.effects.length, typed).toBeGreaterThan(0);
      }
    }
  });

  it('the menu hands anything else to the shell, and says so when it is nonsense', () => {
    const listed = interpret('ls', ctx('~', 'menu'));
    expect(text(listed.out)).toContain('about.txt');
    expect(listed.effects).toContainEqual({ e: 'program', program: 'shell', quiet: true });
    expect(text(interpret('flibble', ctx('~', 'menu')).out)).toContain('not on the menu');
  });

  it('handing over prints the next program and gives it an address', () => {
    const toOperator = interpret('operator', ctx());
    expect(toOperator).toMatchObject({ url: '/operator', screen: true });
    expect(text(toOperator.out)).toContain('OPERATOR');
    expect(interpret('exit', ctx())).toMatchObject({ url: '/' });
    expect(interpret('exit', ctx('~', 'operator'))).toMatchObject({ url: '/' });
    expect(interpret('quit', ctx('~', 'adventure'))).toMatchObject({ url: '/' });
  });

  it('ask answers inline without leaving the shell', () => {
    const result = interpret('ask where do you work', ctx());
    expect(text(result.out)).toContain('Levocell');
    expect(result.effects.some((e) => e.e === 'program')).toBe(false);
  });
});

describe('addresses', () => {
  it('opens each address on the right screen', () => {
    expect(sessionFor('/')).toMatchObject({ program: 'menu' });
    expect(sessionFor('/terminal')).toMatchObject({ program: 'shell', cwd: '~' });
    expect(sessionFor('/operator')).toMatchObject({ program: 'operator' });
    expect(sessionFor('/adventure')).toMatchObject({ program: 'adventure' });
    expect(sessionFor('/projects/sanctuary')).toMatchObject({ program: 'shell', cwd: '~/projects' });
    expect(sessionFor('/projects/sanctuary').entries[1].cmd).toBe('cat projects/sanctuary.md');
    expect(text(sessionFor('/nope').entries[1].out)).toContain('404');
    // The arcade and the demo are full-screen; the menu is what is underneath.
    expect(sessionFor('/arcade/trace')).toMatchObject({ program: 'menu' });
    expect(viewFor('/arcade/trace')).toBe('arcade');
    expect(viewFor('/demo/')).toBe('demo');
  });

  it('every program page has a title, a description and a way back to it', () => {
    for (const route of MODE_ROUTES) {
      const meta = metaFor(route);
      expect(meta.title, route).not.toContain('Not found');
      expect(meta.description.length, route).toBeGreaterThan(30);
    }
    expect(commandForUrl('/')).toBe('menu');
    expect(commandForUrl('/terminal')).toBe('shell');
    expect(commandForUrl('/work/fuelius')).toBe('cat work/fuelius.txt');
    expect(commandForUrl('/nope')).toBeNull();
  });
});
