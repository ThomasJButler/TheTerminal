import { describe, expect, it } from 'vitest';
import { blockLines } from '@/fs/md';
import { exec } from '@/terminal/commands';
import { SERVER_CTX } from '@/terminal/interpret';
import type { Ctx } from '@/terminal/types';
import { operate, stem } from './operator';

/**
 * The eval set. Each question names the file a good answer has to come from. It is small,
 * but it is the thing that says whether a change to the router or the index made the
 * operator better or worse, which is the only way to change either with a straight face.
 */

const ctx: Ctx = { ...SERVER_CTX, program: 'operator', cwd: '~' };
const ask = (q: string, c: Ctx = ctx) => operate(q, c, (cmd) => exec(cmd, c));
const sources = (q: string) =>
  ask(q).out.flatMap((b) => (b.k === 'kv' ? b.rows.filter((r) => r.key === 'SOURCE').flatMap((r) => r.inl.map((i) => i.text)) : []));
const said = (q: string) => blockLines(ask(q).out).join(' ');

const EVAL: [string, string[]][] = [
  ['who is tom', ['~/about.txt', '~/README.txt']],
  ['where does tom live', ['~/README.txt']],
  ['where are you based?', ['~/README.txt']],
  ['where do you work', ['~/now.txt', '~/work/levocell.txt']],
  ['what do you do', ['~/now.txt']],
  ['how can I contact you', ['~/contact.txt']],
  ["what's your email", ['~/contact.txt']],
  ['what do you build', ['~/build.txt']],
  ['what is sanctuary', ['~/projects/sanctuary.md']],
  ['what stack does morpheus use', ['~/projects/morpheus.md']],
  ['tell me about the isq agent', ['~/projects/isq-agent.md']],
  ['what is the kicker?', ['~/projects/the-kicker.md']],
  ['tell me about the case study', ['~/projects/isq-agent.md']],
  ['who were your clients', ['~/work/clients.txt']],
  ['what did you do at fuelius', ['~/work/fuelius.txt']],
  ['what is your tech stack', ['~/skills/stack.txt']],
  ['what qualifications do you have', ['~/skills/certificates.txt']],
  ['why did you move into software', ['~/journey/before.log', '~/about.txt']],
  ['what are your hobbies', ['~/.interests']],
  ['how was this site built', ['~/.colophon']],
  ['did you play cricket', ['~/.interests', '~/about.txt', '~/journey/before.log', '~/journey/2000.log']],
  ['were you a professional cricketer', ['~/journey/2000.log', '~/about.txt']],
  ['tell me about entity resolution', ['~/projects/offshore-property-map.md', '~/journey/2026.log', '~/skills/depth.txt']],
  ['what testing do you do', ['~/skills/depth.txt']],
  ['how many versions of this site are there', ['~/versions/history.txt', '~/projects/version-timetravel.md']],
  ['do you run local models', ['~/journey/2026.log', '~/skills/depth.txt', '~/projects/morpheus.md']],
  ['what do you think about burnout', ['~/blog/tech-burnout-crisis.md']],
  ['what is context engineering', ['~/blog/context-engineering-101.md']],
  ['what games have you made', ['~/projects/matrix-arcade.md', '~/journey/2025.log', '~/build.txt']],
  ['have you worked with hubspot', ['~/skills/certificates.txt', '~/work/fuelius.txt', '~/skills/stack.txt']],
  ['tell me about diving', ['~/about.txt', '~/journey/before.log', '~/journey/2000.log']],
  ['what is your experience with RAG', ['~/skills/depth.txt', '~/skills/stack.txt', '~/projects/isq-agent.md', '~/projects/morpheus.md', '~/now.txt', '~/build.txt']],
  ['what skills do you have', ['~/skills/stack.txt']],
  ['when did you start coding', ['~/journey/2022.log']],
];

describe('operator eval', () => {
  for (const [question, expected] of EVAL) {
    it(`${question} → ${expected[0]}`, () => {
      const found = sources(question);
      expect(found.length, `no source cited for "${question}": ${said(question)}`).toBeGreaterThan(0);
      expect(expected, `"${question}" cited ${found.join(', ')}`).toContain(found[0]);
    });
  }
});

describe('operator refusals', () => {
  for (const question of ['what is the capital of france', 'what is your favourite pizza topping', 'how old are you', 'what is your salary', 'who won the league', 'what is the meaning of life']) {
    it(`does not answer: ${question}`, () => {
      expect(sources(question), said(question)).toEqual([]);
      expect(said(question)).toContain("I don't have that on file");
    });
  }
});

describe('operator tools', () => {
  it('opens a named file when asked to', () => {
    expect(ask('open the sanctuary project').visit?.path).toBe('~/projects/sanctuary.md');
    expect(ask('show me the clients').visit?.path).toBe('~/work/clients.txt');
  });

  it('runs shell commands as they are', () => {
    expect(ask('ls projects').out.some((b) => b.k === 'ls')).toBe(true);
    expect(ask('grep cricket').out.length).toBeGreaterThan(2);
  });

  it('launches things and changes settings', () => {
    expect(ask('play a game').effects).toContainEqual({ e: 'go', to: 'arcade' });
    expect(ask('make it amber').effects).toContainEqual({ e: 'set', patch: { phosphor: 'amber' } });
    expect(ask('exit').effects).toContainEqual({ e: 'program', program: 'menu' });
  });

  it('does not mistake a question for a command', () => {
    expect(ask('do you play guitar').effects).toEqual([]);
    expect(ask('show me the live demo of morpheus').effects.some((e) => e.e === 'go')).toBe(false);
  });

  it('says what it is, and that it has no model', () => {
    expect(said('are you an AI')).toContain('no language model');
    expect(said('who are you')).toContain('operator');
  });

  it('speaks only when voice is on, and only where there is a voice', () => {
    expect(ask('where do you work').effects).toEqual([]);
    const voiced: Ctx = { ...ctx, settings: { ...ctx.settings, voice: true } };
    expect(ask('where do you work', voiced).effects[0]).toMatchObject({ e: 'say' });
    expect(blockLines(ask('voice on').out).join(' ')).toContain('no speech synthesis');
    expect(blockLines(ask('talk').out).join(' ')).toContain('no speech recognition');
  });
});

describe('stem', () => {
  it('brings related words together', () => {
    expect(stem('diving')).toBe(stem('diver'));
    expect(stem('cricketers')).toBe(stem('cricket'));
    expect(stem('engineering')).toBe(stem('engineer'));
    expect(stem('studied')).toBe(stem('study'));
    expect(stem('agencies')).toBe(stem('agency'));
  });
});
