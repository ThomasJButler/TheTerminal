import {
  BEFORE, BUILD, FUELIUS, HERO, INDEPENDENT, LINKS, LOCATION, MACHINE, NOW, ROLE,
} from '@/content/site';
import { projects } from '@/content/projects';
import { ALL_FILES } from '@/fs/tree';

/**
 * The demo, as a list of shots. It is the way in for anyone who would rather not type: who
 * Tom is, what he builds, how he got here and what he has made, in about two minutes.
 *
 * Nothing here is written for the demo. Every line is read from the same content the files
 * are built from, so the reel cannot say something the rest of the machine does not.
 */

/** What the scene behind the words is doing. */
export type Visual = 'land' | 'solids' | 'road' | 'machine';

export interface Shot {
  id: string;
  visual: Visual;
  /** How long it holds before moving on. 0 holds until the visitor moves on. */
  seconds: number;
  kicker: string;
  title: string;
  lines: string[];
  /** Lines arrive one at a time, this far apart. */
  step: number;
  image?: { src: string; alt: string };
  /** Shown as buttons. Each runs a command, the way typing it would. */
  actions?: { label: string; cmd: string }[];
}

const plain = (text: string) => text.replace(/\*\*|`/g, '');

/** Long enough to read at an easy pace, and never rushed. */
const reading = (...text: string[]) => Math.max(6, Math.round(text.join(' ').split(/\s+/).length / 3.3 + 2.5));

const ROAD: { era: string; title: string; text: string }[] = [
  ...BEFORE,
  { era: '2023-24', title: 'An agency in Chester', text: FUELIUS.body[0] },
  { era: '2024-26', title: 'On my own', text: INDEPENDENT.body[0] },
  { era: 'Now', title: 'Levocell', text: plain(NOW[0]) },
];

/** The ones worth a shot each, in the order they are shown. */
const FEATURED = ['sanctuary', 'offshore-property-map', 'isq-agent', 'morpheus', 'the-kicker', 'matrix-arcade', 'modelviz'];
const MADE = FEATURED.map((id) => projects.find((x) => x.id === id)).filter((x) => x !== undefined);

export const REEL: Shot[] = [
  {
    id: 'hello',
    visual: 'land',
    seconds: 8,
    kicker: `${MACHINE} · DEMO`,
    title: HERO.join(' '),
    lines: [`${ROLE} · ${LOCATION}`, 'A few minutes, and nothing to type. The arrow keys skip, the space bar pauses.'],
    step: 1.2,
  },
  {
    id: 'build',
    visual: 'solids',
    seconds: 12,
    kicker: 'WHAT I BUILD',
    title: 'Eight kinds of thing.',
    lines: BUILD.map((b) => b.title),
    step: 1,
  },
  ...ROAD.map((stop, i): Shot => ({
    id: `road-${i + 1}`,
    visual: 'road',
    seconds: reading(stop.text),
    kicker: `THE ROAD HERE · ${stop.era.toUpperCase()}`,
    title: stop.title,
    lines: [stop.text],
    step: 0.6,
  })),
  ...MADE.map((project, i): Shot => ({
    id: `made-${project.id}`,
    visual: 'solids',
    seconds: reading(project.description) + 1,
    kicker: `THINGS I'VE MADE · ${i + 1} OF ${MADE.length}`,
    title: project.name,
    lines: [project.description, project.topics.join(' · ')],
    step: 0.9,
    image: project.images?.cover ? { src: project.images.cover, alt: `${project.name}, a screenshot` } : undefined,
    actions: [{ label: 'READ THE FILE', cmd: `cat ~/projects/${project.id}.md` }],
  })),
  {
    id: 'machine',
    visual: 'machine',
    seconds: 14,
    kicker: 'THIS MACHINE',
    title: 'Everything else is in here.',
    lines: [
      'An agent you can question, out loud if you like.',
      'Two games made of text, and twelve more in the cabinet.',
      'A text adventure about how I got here.',
      `And a shell with ${ALL_FILES.length} files in it, for anyone who would rather go looking.`,
    ],
    step: 1.8,
  },
  {
    id: 'end',
    visual: 'land',
    seconds: 0,
    kicker: "THAT'S THE DEMO",
    title: 'Tell me about the role, the idea, or just say hello.',
    lines: [LINKS.email],
    step: 0.8,
    actions: [
      { label: 'WRITE TO ME', cmd: 'mail' },
      { label: 'ASK THE OPERATOR', cmd: 'operator' },
      { label: 'PLAY SOMETHING', cmd: 'arcade' },
      { label: 'MAIN MENU', cmd: 'menu' },
    ],
  },
];

/** How long the whole thing runs if nobody skips. A test keeps it near three minutes. */
export const REEL_SECONDS = REEL.reduce((total, shot) => total + shot.seconds, 0);
