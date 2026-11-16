import { describe, expect, it } from 'vitest';
import { ALL_FILES, nodeForUrl, resolve, urlFor } from '@/fs/tree';
import { blockLines } from '@/fs/md';
import { DEFAULT_SETTINGS, complete, exec, sessionFor, type Ctx } from './commands';

const ctx = (cwd = '~'): Ctx => ({ cwd, settings: DEFAULT_SETTINGS, found: new Set(), history: [] });

describe('filesystem', () => {
  it('every file renders text and round-trips through its URL', () => {
    expect(ALL_FILES.length).toBeGreaterThan(40);
    for (const f of ALL_FILES) {
      expect(blockLines(f.blocks()).join(' ').length, f.path).toBeGreaterThan(40);
      expect(nodeForUrl(urlFor(f))?.path, f.path).toBe(f.path);
    }
  });

  it('no two nodes share a URL', () => {
    const urls = ALL_FILES.map(urlFor);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('forgives a missing extension and resolves relative paths', () => {
    expect(resolve('~', 'about')?.path).toBe('~/about.txt');
    expect(resolve('~/projects', '../now')?.path).toBe('~/now.txt');
    expect(resolve('~/projects', 'sanctuary')?.path).toBe('~/projects/sanctuary.md');
    expect(resolve('~', 'nope')).toBeUndefined();
  });
});

describe('exec', () => {
  it('ls hides dotfiles until asked', () => {
    const plain = blockLines(exec('ls', ctx()).out).join(' ');
    const all = blockLines(exec('ls -a', ctx()).out).join(' ');
    expect(plain).not.toContain('.rabbit');
    expect(all).toContain('.rabbit');
  });

  it('cd moves, cat reads and reports the node visited', () => {
    expect(exec('cd projects', ctx()).cwd).toBe('~/projects');
    const read = exec('cat sanctuary', ctx('~/projects'));
    expect(read.visit?.path).toBe('~/projects/sanctuary.md');
    expect(exec('cd ..', ctx('~/projects')).cwd).toBe('~');
    // From the wrong directory, a path from home still works.
    expect(exec('cat blog/context-engineering-101', ctx('~/work')).visit?.path).toBe('~/blog/context-engineering-101.md');
  });

  it('a bare path opens it, and nonsense says so', () => {
    expect(exec('about.txt', ctx()).visit?.path).toBe('~/about.txt');
    expect(exec('flibble', ctx()).out[0]).toMatchObject({ k: 'err' });
  });

  it('grep searches hidden files too', () => {
    expect(blockLines(exec('grep skiing', ctx()).out).join(' ')).toContain('.interests');
  });

  it('set validates and emits an effect', () => {
    expect(exec('set cols 132', ctx()).effects).toEqual([{ e: 'set', patch: { cols: 132 } }]);
    expect(exec('set cols 90', ctx()).effects).toEqual([]);
  });
});

describe('complete', () => {
  it('completes commands and paths', () => {
    expect(complete('gr', '~').line).toBe('grep ');
    expect(complete('cat ab', '~').line).toBe('cat about.txt');
    expect(complete('cd pro', '~').line).toBe('cd projects/');
    expect(complete('cat projects/sanc', '~').line).toBe('cat projects/sanctuary.md');
  });
});

describe('sessionFor', () => {
  it('opens a URL on its file, and an unknown URL on a 404', () => {
    const ok = sessionFor(nodeForUrl('/projects/sanctuary'));
    expect(ok.cwd).toBe('~/projects');
    expect(ok.entries[1].cmd).toBe('cat projects/sanctuary.md');
    const missing = sessionFor(nodeForUrl('/nope'));
    expect(blockLines(missing.entries[1].out).join(' ')).toContain('404');
  });
});
