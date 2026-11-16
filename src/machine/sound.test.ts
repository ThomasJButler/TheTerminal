import { describe, expect, it } from 'vitest';
import { SECTIONS } from './sound';

/** A natural minor, plus the G sharp the E major bar needs. */
const KEY = new Set([9, 11, 0, 2, 4, 5, 7, 8]);

describe('the demo score', () => {
  it('has four bars of chords and sixty-four steps of melody in every section', () => {
    for (const section of SECTIONS) {
      expect(section.chords).toHaveLength(4);
      for (const chord of section.chords) expect(chord).toHaveLength(3);
      expect(section.melody).toHaveLength(64);
    }
  });

  it('never plays a note outside the key', () => {
    for (const { chords, melody } of SECTIONS) {
      for (const note of [...chords.flat(), ...melody]) {
        if (note !== null) expect(KEY.has(note % 12), `MIDI ${note}`).toBe(true);
      }
    }
  });

  it('starts every bar of the melody on a note of that bar\'s chord', () => {
    for (const { chords, melody } of SECTIONS) {
      chords.forEach((chord, bar) => {
        const first = melody[bar * 16];
        expect(first, `bar ${bar + 1}`).not.toBeNull();
        expect(chord.map((n) => n % 12)).toContain(first! % 12);
      });
    }
  });
});
