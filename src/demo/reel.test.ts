import { describe, expect, it } from 'vitest';
import { BUILD, HERO } from '@/content/site';
import { getNode } from '@/fs/tree';
import { exec } from '@/terminal/commands';
import { SERVER_CTX } from '@/terminal/interpret';
import { REEL, REEL_SECONDS } from './reel';

describe('the demo reel', () => {
  it('opens on the greeting and closes on a way to get in touch', () => {
    expect(REEL[0].title).toBe(HERO.join(' '));
    const last = REEL[REEL.length - 1];
    expect(last.seconds).toBe(0);
    expect(last.actions?.map((a) => a.cmd)).toContain('mail');
  });

  it('says all eight things he builds, in the words build.txt uses', () => {
    const build = REEL.find((shot) => shot.id === 'build');
    expect(build?.lines).toEqual(BUILD.map((b) => b.title));
  });

  it('runs for about three minutes, and only the last shot waits', () => {
    // The menu says "three minutes". If the reel grows, change one or the other.
    expect(REEL_SECONDS).toBeGreaterThan(150);
    expect(REEL_SECONDS).toBeLessThan(200);
    expect(REEL.filter((shot) => shot.seconds === 0).map((shot) => shot.id)).toEqual(['end']);
  });

  it('gives every shot time to be read', () => {
    for (const shot of REEL.filter((s) => s.seconds)) {
      const words = [shot.title, ...shot.lines].join(' ').split(/\s+/).length;
      // Nothing faster than four words a second, which is brisk reading out loud.
      expect(words / shot.seconds, shot.id).toBeLessThan(4);
    }
  });

  it('has something to say in every shot, with no dashes and no markdown left in', () => {
    for (const shot of REEL) {
      expect(shot.lines.length, shot.id).toBeGreaterThan(0);
      for (const text of [shot.kicker, shot.title, ...shot.lines]) {
        expect(text, shot.id).not.toMatch(/[–—]|\*\*|`/);
        expect(text.trim().length, shot.id).toBeGreaterThan(2);
      }
    }
  });

  it('only offers buttons that do something', () => {
    const ctx = { ...SERVER_CTX, program: 'shell' as const, cwd: '~' };
    for (const action of REEL.flatMap((shot) => shot.actions ?? [])) {
      const result = exec(action.cmd, ctx);
      expect(result.unknown, action.cmd).toBeUndefined();
      expect(result.out.some((b) => b.k === 'err'), action.cmd).toBe(false);
    }
    // Each project shot points at a file that exists.
    for (const shot of REEL.filter((s) => s.id.startsWith('made-'))) {
      expect(getNode(`~/projects/${shot.id.slice(5)}.md`), shot.id).toBeDefined();
    }
  });
});
