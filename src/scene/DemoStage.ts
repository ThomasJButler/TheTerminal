import * as THREE from 'three';

/** What the demo is showing: open country, the core, the city road with gates, or the machine. */
export type DemoVisual = 'land' | 'solids' | 'road' | 'machine';

/**
 * Everything the demo flies through. It is still one colour, with no model files and no
 * lights: the ground is a grid lifted into mountains in the vertex shader, the city is one
 * box drawn a couple of hundred times, and the sun is a quad with its stripes worked out per
 * pixel. What makes it read as solid is a black copy of each surface drawn first, so the
 * lines behind a hill or a tower are hidden the way they would be on a vector display that
 * could do hidden-line removal.
 *
 * Each shot asks for a visual, and the stage eases between them: the valley widens for the
 * city, the towers rise out of the floor, the core unfolds. Nothing cuts.
 */

const GROUND = { cell: 2, half: 70, near: 8, far: -150 };
const CITY_SPAN = 168;
const FAR = -150;

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
`;

/**
 * The grid slides one cell towards the camera and snaps back, while the heights are sampled
 * from where each point would be if it had kept going, so the ground never ends. The middle
 * is left flat, as a valley floor, and how wide that floor is depends on the shot.
 */
const TERRAIN_VERT = /* glsl */ `
  uniform float uTravel;
  uniform float uCell;
  uniform float uValley;
  uniform float uDrop;
  varying float vFog;
  varying float vHeight;
  varying float vDist;
  ${NOISE}

  float height(vec2 p) {
    float rise = smoothstep(uValley, uValley + 30.0, abs(p.x));
    float rolling = vnoise(p * 0.05) + vnoise(p * 0.13) * 0.45 + vnoise(p * 0.31) * 0.14;
    float ridge = 1.0 - abs(2.0 * vnoise(p * 0.04 + 7.3) - 1.0);
    return rise * (rolling * 9.0 + ridge * ridge * 9.0);
  }

  void main() {
    vec3 pos = position;
    pos.z += mod(uTravel, uCell);
    pos.y = height(vec2(pos.x, pos.z - uTravel)) - uDrop;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vDist = -mv.z;
    vFog = smoothstep(150.0, 18.0, vDist);
    vHeight = pos.y;
    gl_Position = projectionMatrix * mv;
  }
`;

const TERRAIN_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPulse;
  varying float vFog;
  varying float vHeight;
  varying float vDist;
  void main() {
    // The peaks are brighter than the floor, and every beat sends a ring out across it.
    float glow = 0.2 + 0.5 * smoothstep(1.0, 15.0, vHeight);
    float ring = exp(-pow((vDist - 6.0 - uPulse * 110.0) * 0.14, 2.0)) * (1.0 - uPulse);
    gl_FragColor = vec4(uColor * vFog * (glow + ring * 0.75), 1.0);
  }
`;

/** The black copy under the lines. A trace of the colour stops it being a hole in the sky. */
const SOLID_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vFog;
  void main() {
    gl_FragColor = vec4(uColor * 0.012 * vFog, 1.0);
  }
`;

const SUN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** A disc with bands cut out of its lower half, wider towards the bottom, sliding down. */
const SUN_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uKick;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float y = p.y / 0.6;
    float disc = smoothstep(0.604, 0.596, r);
    float low = clamp((0.25 - y) / 1.25, 0.0, 1.0);
    float band = fract(y * 9.0 + uTime * 0.15);
    float cut = step(y, 0.25) * step(band, mix(0.1, 0.82, low));
    // Brightest at the top and never full strength: the glow pass adds to it, and a sun
    // that clips stops being the phosphor's colour.
    float body = disc * (1.0 - cut) * mix(0.16, 0.5, (y + 1.0) * 0.5);
    // The halo has to reach nothing before the edge of the quad, or the quad shows.
    float halo = (1.0 - disc) * pow(clamp(1.0 - (r - 0.6) / 0.4, 0.0, 1.0), 3.0) * 0.09;
    gl_FragColor = vec4(uColor * (body + halo) * (1.0 + uKick * 0.12), 1.0);
  }
`;

const STAR_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uScale;
  varying float vBright;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed * 2.4) + aSeed * 40.0);
    vBright = twinkle * (0.2 + 0.8 * fract(aSeed * 7.13));
    gl_PointSize = uScale * (1.0 + 2.4 * fract(aSeed * 3.7));
  }
`;

const DOT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vBright;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(uColor * vBright * smoothstep(0.5, 0.0, d), 1.0);
  }
`;

/**
 * One tower: a unit box, placed and sized by its attributes. The row it stands in scrolls
 * towards the camera and wraps to the far end, and its height is scaled by how far the
 * city has risen, each tower a little out of step with the next.
 */
const CITY_VERT = /* glsl */ `
  attribute vec4 aBox;   // x, z along the row, seed, unused
  attribute vec3 aSize;
  uniform float uTravel;
  uniform float uSpan;
  uniform float uShow;
  varying float vBright;
  void main() {
    float z = 8.0 - uSpan + mod(aBox.y + uTravel, uSpan);
    float risen = smoothstep(0.0, 1.0, uShow * 1.5 - aBox.z * 0.5);
    vec3 pos = vec3(aBox.x + position.x * aSize.x, position.y * aSize.y * risen, z + position.z * aSize.z);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float fog = smoothstep(uSpan - 14.0, 22.0, -mv.z);
    vBright = fog * risen * (0.4 + 0.45 * fract(aBox.z * 5.3));
    gl_Position = projectionMatrix * mv;
  }
`;

/** Lit windows. Same placing as the tower they are on, and now and then one goes out. */
const WINDOW_VERT = /* glsl */ `
  attribute vec4 aBox;   // x, z along the row, the tower's seed, this window's own
  attribute vec3 aSize;
  uniform float uTravel;
  uniform float uSpan;
  uniform float uShow;
  uniform float uTime;
  uniform float uScale;
  varying float vBright;
  void main() {
    float z = 8.0 - uSpan + mod(aBox.y + uTravel, uSpan);
    float risen = smoothstep(0.0, 1.0, uShow * 1.5 - aBox.z * 0.5);
    vec3 pos = vec3(aBox.x + position.x * aSize.x, position.y * aSize.y * risen, z + position.z * aSize.z);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float fog = smoothstep(uSpan - 14.0, 22.0, -mv.z);
    float on = step(0.12, fract(aBox.w * 17.0 + floor(uTime * 0.4 + aBox.w * 9.0) * 0.37));
    vBright = fog * smoothstep(0.85, 1.0, risen) * on * (0.5 + 0.5 * aBox.w);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uScale * 44.0 / -mv.z, 1.5, uScale * 4.0);
  }
`;

/**
 * The aurora: a curtain of upright lines hung along a curve that drifts. Each line is
 * brightest at its foot and gone by its top, and a shimmer runs along the curtain.
 */
const AURORA_VERT = /* glsl */ `
  attribute vec2 aAlong;  // where along the curtain, and which curtain
  uniform float uTime;
  uniform float uAurora;
  varying float vBright;
  void main() {
    float a = aAlong.x;
    float t = uTime + aAlong.y * 40.0;
    float base = 33.0 + aAlong.y * 13.0 + sin(a * 9.0 + t * 0.21) * 6.0 + sin(a * 23.0 - t * 0.37) * 2.4 + sin(a * 3.1 + 1.0) * 9.0;
    float tall = 15.0 + 9.0 * sin(a * 17.0 + t * 0.5);
    vec3 pos = vec3((a - 0.5) * 380.0, base + position.y * tall, -158.0 - aAlong.y * 6.0 + sin(a * 5.0 + t * 0.1) * 4.0);
    float shimmer = 0.5 + 0.5 * sin(a * 46.0 + t * 1.6);
    float ends = smoothstep(0.0, 0.1, a) * smoothstep(1.0, 0.9, a);
    // It comes and goes in patches along its length, or it reads as a fence.
    float lit = smoothstep(0.15, 0.7, 0.5 + 0.5 * sin(a * 11.0 + t * 0.13) * sin(a * 4.3 - t * 0.07 + 2.0));
    float foot = (1.0 - position.y) * (1.0 - position.y);
    vBright = uAurora * ends * lit * foot * (0.14 + 0.42 * shimmer);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

/** A line whose brightness is given per vertex: a meteor's head is lit and its tail is not. */
const FADE_VERT = /* glsl */ `
  attribute float aFade;
  varying float vBright;
  void main() {
    vBright = aFade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FLAT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vBright;
  void main() {
    gl_FragColor = vec4(uColor * vBright, 1.0);
  }
`;

const BLACK_FRAG = /* glsl */ `
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  }
`;

/** Traffic: streaks of light in lanes above the road. The head is bright and the tail is not. */
const TRAFFIC_VERT = /* glsl */ `
  attribute vec4 aLane;  // x, y, where along the road, speed
  uniform float uTime;
  uniform float uSpan;
  uniform float uShow;
  varying float vBright;
  void main() {
    float z = 8.0 - uSpan + mod(aLane.z + uTime * aLane.w, uSpan);
    float tail = sign(aLane.w) * (4.0 + abs(aLane.w) * 0.2) * position.z;
    vec4 mv = modelViewMatrix * vec4(aLane.x, aLane.y, z - tail, 1.0);
    float fog = smoothstep(uSpan - 14.0, 22.0, -mv.z);
    vBright = fog * uShow * (1.0 - position.z);
    gl_Position = projectionMatrix * mv;
  }
`;

/** The swarm round the core: each mote circles at its own rate and is thrown out on the beat. */
const SWARM_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uKick;
  uniform float uScale;
  varying float vBright;
  void main() {
    float a = uTime * (0.12 + aSeed * 0.5);
    float c = cos(a);
    float s = sin(a);
    vec3 dir = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c);
    float r = 4.4 + 3.0 * fract(aSeed * 9.7) + uKick * 0.8 + 0.4 * sin(uTime * 1.3 + aSeed * 30.0);
    vec4 mv = modelViewMatrix * vec4(dir * r, 1.0);
    gl_Position = projectionMatrix * mv;
    vBright = 0.35 + 0.65 * fract(aSeed * 4.9);
    gl_PointSize = uScale * (1.0 + 2.0 * fract(aSeed * 5.1)) * 24.0 / -mv.z;
  }
`;

interface Look {
  /** How fast the ground goes by. */
  pace: number;
  /** Half the width of the flat floor between the mountains. */
  valley: number;
  city: number;
  core: number;
  /** How high the sun stands. It sets behind the core, which needs a dark sky. */
  sun: number;
  /** How much of the aurora shows. */
  aurora: number;
}

const LOOKS: Record<DemoVisual, Look> = {
  land: { pace: 9, valley: 5, city: 0, core: 0, sun: 13, aurora: 1 },
  solids: { pace: 6, valley: 11, city: 0, core: 1, sun: -13, aurora: 0.7 },
  road: { pace: 21, valley: 40, city: 1, core: 0, sun: 12, aurora: 0.3 },
  machine: { pace: 4, valley: 13, city: 0, core: 0, sun: 4, aurora: 0 },
};

function circle(radius: number, segments: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const b = ((i + 1) / segments) * Math.PI * 2;
    points.push(Math.cos(a) * radius, 0, Math.sin(a) * radius, Math.cos(b) * radius, 0, Math.sin(b) * radius);
  }
  return points;
}

export class DemoStage {
  readonly group = new THREE.Group();

  private shared: {
    uColor: { value: THREE.Color };
    uTime: { value: number };
    uTravel: { value: number };
    uKick: { value: number };
    uPulse: { value: number };
    uScale: { value: number };
  };
  private valley = { value: LOOKS.land.valley };
  private cityShow = { value: 0 };
  private aurora = { value: 1 };
  private meteors: { at: THREE.Vector3; speed: THREE.Vector3; life: number }[] = [];
  private meteorLines: THREE.BufferGeometry | null = null;
  private nextMeteor = 2;
  private scan: THREE.LineLoop | null = null;
  private scanMaterial: THREE.LineBasicMaterial | null = null;
  /** How hard the last beat is still landing, from 1 down to nothing. */
  kick = 0;
  private dim: THREE.LineBasicMaterial;
  private bright: THREE.LineBasicMaterial;
  private sun: THREE.Object3D | null = null;
  private disposables: { dispose: () => void }[] = [];

  private visual: DemoVisual = 'land';
  private time = 0;
  private pace = LOOKS.land.pace;
  private snap = true;
  private gates: THREE.Group[] = [];
  private city = new THREE.Group();
  private core = new THREE.Group();
  private coreShow = 0;
  private solids: THREE.Object3D[] = [];
  private rings: THREE.Object3D[] = [];
  private planet = new THREE.Group();
  private globe: THREE.Object3D | null = null;
  private wantPos = new THREE.Vector3();
  private wantLook = new THREE.Vector3();
  private roll = 0;

  constructor(color: THREE.Color, private line: THREE.LineBasicMaterial) {
    this.shared = {
      uColor: { value: color.clone() },
      uTime: { value: 0 },
      uTravel: { value: 0 },
      uKick: { value: 0 },
      uPulse: { value: 0 },
      uScale: { value: Math.min(window.devicePixelRatio, 2) * 1.5 },
    };
    this.dim = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.2 });
    this.bright = new THREE.LineBasicMaterial({ color });
    this.disposables.push(this.dim, this.bright);

    this.buildGround();
    this.buildSky();
    this.buildCity();
    this.buildGates();
    this.buildCore();
    this.buildScan();
  }

  private keep<T extends { dispose: () => void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private glow(vertexShader: string, fragmentShader: string, uniforms: Record<string, { value: unknown }> = {}) {
    return this.keep(new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { ...this.shared, ...uniforms },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
  }

  /** The black copy of a surface, pushed back a hair so its own lines win the depth test. */
  private solid(vertexShader: string, fragmentShader: string, uniforms: Record<string, { value: unknown }> = {}) {
    return this.keep(new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { ...this.shared, ...uniforms },
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 2,
    }));
  }

  private segments(points: number[], material: THREE.Material): THREE.LineSegments {
    const geometry = this.keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const mesh = new THREE.LineSegments(geometry, material);
    mesh.frustumCulled = false;
    return mesh;
  }

  private buildGround() {
    const { cell, half, near, far } = GROUND;
    const grid: number[] = [];
    for (let z = far; z <= near; z += cell) for (let x = -half; x < half; x += cell) grid.push(x, 0, z, x + cell, 0, z);
    for (let x = -half; x <= half; x += cell) for (let z = far; z < near; z += cell) grid.push(x, 0, z, x, 0, z + cell);
    const uniforms = { uCell: { value: cell }, uValley: this.valley };
    this.group.add(this.segments(grid, this.glow(TERRAIN_VERT, TERRAIN_FRAG, { ...uniforms, uDrop: { value: 0 } })));

    // The same lattice as a surface, so the two are lifted by the same heights.
    const depth = near - far;
    const surface = this.keep(new THREE.PlaneGeometry(half * 2, depth, half, depth / cell));
    surface.rotateX(-Math.PI / 2);
    surface.translate(0, 0, (near + far) / 2);
    const ground = new THREE.Mesh(surface, this.solid(TERRAIN_VERT, SOLID_FRAG, { ...uniforms, uDrop: { value: 0.04 } }));
    ground.frustumCulled = false;
    this.group.add(ground);
  }

  private buildSky() {
    const sunGeometry = this.keep(new THREE.PlaneGeometry(56, 56));
    const sun = new THREE.Mesh(sunGeometry, this.glow(SUN_VERT, SUN_FRAG));
    sun.position.set(0, 13, FAR + 1);
    this.sun = sun;
    this.group.add(sun);

    const count = 1500;
    const positions: number[] = [];
    const seeds: number[] = [];
    for (let i = 0; i < count; i++) {
      positions.push((Math.random() - 0.5) * 520, 4 + Math.random() ** 1.6 * 150, FAR - 8 - Math.random() * 60);
      seeds.push(Math.random());
    }
    const starGeometry = this.keep(new THREE.BufferGeometry());
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    starGeometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    const stars = new THREE.Points(starGeometry, this.glow(STAR_VERT, DOT_FRAG));
    stars.frustumCulled = false;
    this.group.add(stars);

    const hung: number[] = [];
    const along: number[] = [];
    for (let curtain = 0; curtain < 2; curtain++) {
      // Close enough together that the glow joins them into a sheet.
      for (let i = 0; i < 1400; i++) {
        hung.push(0, 0, 0, 0, 1, 0);
        along.push(i / 1399, curtain, i / 1399, curtain);
      }
    }
    const auroraGeometry = this.keep(new THREE.BufferGeometry());
    auroraGeometry.setAttribute('position', new THREE.Float32BufferAttribute(hung, 3));
    auroraGeometry.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 2));
    const aurora = new THREE.LineSegments(auroraGeometry, this.glow(AURORA_VERT, FLAT_FRAG, { uAurora: this.aurora }));
    aurora.frustumCulled = false;
    this.group.add(aurora);

    // Three meteors, reused. Their ends are moved each frame, so the buffer is rewritten.
    this.meteorLines = this.keep(new THREE.BufferGeometry());
    this.meteorLines.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
    this.meteorLines.setAttribute('aFade', new THREE.Float32BufferAttribute(new Float32Array(6), 1));
    for (let i = 0; i < 3; i++) this.meteors.push({ at: new THREE.Vector3(), speed: new THREE.Vector3(), life: 0 });
    const meteors = new THREE.LineSegments(this.meteorLines, this.glow(FADE_VERT, FLAT_FRAG));
    meteors.frustumCulled = false;
    this.group.add(meteors);

    // A ringed planet, as lines of latitude and longitude with a black ball inside it so
    // only the near side shows.
    const radius = 19;
    const lines: number[] = [];
    for (let i = 1; i < 10; i++) {
      const lat = (i / 10 - 0.5) * Math.PI;
      const ring = circle(Math.cos(lat) * radius, 48);
      for (let j = 1; j < ring.length; j += 3) ring[j] = Math.sin(lat) * radius;
      lines.push(...ring);
    }
    for (let i = 0; i < 12; i++) {
      const lon = (i / 12) * Math.PI;
      for (let j = 0; j < 32; j++) {
        const a = (j / 32) * Math.PI * 2;
        const b = ((j + 1) / 32) * Math.PI * 2;
        lines.push(
          Math.cos(a) * Math.cos(lon) * radius, Math.sin(a) * radius, Math.cos(a) * Math.sin(lon) * radius,
          Math.cos(b) * Math.cos(lon) * radius, Math.sin(b) * radius, Math.cos(b) * Math.sin(lon) * radius,
        );
      }
    }
    this.globe = this.segments(lines, this.dim);
    const ball = new THREE.Mesh(
      this.keep(new THREE.SphereGeometry(radius * 0.985, 40, 20)),
      this.keep(new THREE.MeshBasicMaterial({ color: 0x010201 })),
    );
    const belt = new THREE.Group();
    for (const r of [1.42, 1.5, 1.62, 1.7, 1.95, 2.02]) belt.add(this.segments(circle(radius * r, 96), this.dim));
    belt.rotation.set(0.32, 0, 0.42);
    this.planet.add(this.globe, ball, belt);
    this.planet.position.set(58, 50, FAR - 4);
    this.group.add(this.planet);
  }

  private buildCity() {
    // One box as twelve edges, with three bands round it for floors.
    const edges: number[] = [];
    const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    for (const y of [0, 1, 0.25, 0.5, 0.75]) {
      for (let i = 0; i < 4; i++) {
        const [ax, az] = corners[i];
        const [bx, bz] = corners[(i + 1) % 4];
        edges.push(ax, y, az, bx, y, bz);
      }
    }
    for (const [x, z] of corners) edges.push(x, 0, z, x, 1, z);
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const boxPositions = box.getAttribute('position').array as Float32Array;
    const boxIndex = Array.from(box.getIndex()!.array);

    const line = { position: [] as number[], box: [] as number[], size: [] as number[] };
    const mesh = { position: [] as number[], box: [] as number[], size: [] as number[], index: [] as number[] };
    const lit = { position: [] as number[], box: [] as number[], size: [] as number[] };
    const slot = 7;
    for (const side of [-1, 1]) {
      for (let column = 0; column < 4; column++) {
        for (let z = 0; z < CITY_SPAN; z += slot) {
          if (Math.random() < 0.14) continue;
          const seed = Math.random();
          const x = side * (11 + column * 7.5 + (Math.random() - 0.5) * 1.6);
          // Mostly blocks, taller the further they stand from the road, with the odd spire.
          const spire = column > 1 && Math.random() < 0.16;
          const size = spire
            ? [2, 44 + Math.random() * 30, 2]
            : [3 + Math.random() * 3, 5 + Math.random() ** 2 * (16 + column * 9), 3 + Math.random() * 3];
          const where = [x, z + Math.random() * 2, seed, 0];
          for (let i = 0; i < edges.length; i += 3) {
            line.position.push(edges[i], edges[i + 1], edges[i + 2]);
            line.box.push(...where);
            line.size.push(...size);
          }
          const base = mesh.position.length / 3;
          for (let i = 0; i < boxPositions.length; i += 3) {
            mesh.position.push(boxPositions[i], boxPositions[i + 1], boxPositions[i + 2]);
            mesh.box.push(...where);
            mesh.size.push(...size);
          }
          mesh.index.push(...boxIndex.map((n) => n + base));
          // Windows, on the face that looks at the road. Not every one has its light on.
          for (let y = 1.2; y < size[1] - 0.6; y += 1.5) {
            for (let d = -0.5 + 0.6 / size[2]; d < 0.5; d += 1.1 / size[2]) {
              if (Math.random() > 0.42) continue;
              lit.position.push(-side * 0.53, y / size[1], d);
              lit.box.push(x, where[1], seed, Math.random());
              lit.size.push(...size);
            }
          }
        }
      }
    }
    box.dispose();

    const uniforms = { uSpan: { value: CITY_SPAN }, uShow: this.cityShow };
    const build = (data: typeof line) => {
      const geometry = this.keep(new THREE.BufferGeometry());
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
      geometry.setAttribute('aBox', new THREE.Float32BufferAttribute(data.box, 4));
      geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(data.size, 3));
      return geometry;
    };
    const towers = new THREE.LineSegments(build(line), this.glow(CITY_VERT, FLAT_FRAG, uniforms));
    const solidGeometry = build(mesh);
    solidGeometry.setIndex(mesh.index);
    const blocks = new THREE.Mesh(solidGeometry, this.solid(CITY_VERT, BLACK_FRAG, uniforms));

    const lanes: number[] = [];
    const ends: number[] = [];
    for (let i = 0; i < 46; i++) {
      const speed = (14 + Math.random() * 30) * (Math.random() < 0.5 ? -1 : 1);
      const lane = [(Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 5.5), 4.5 + Math.random() * 13, Math.random() * CITY_SPAN, speed];
      lanes.push(...lane, ...lane);
      ends.push(0, 0, 0, 0, 0, 1);
    }
    const trafficGeometry = this.keep(new THREE.BufferGeometry());
    trafficGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ends, 3));
    trafficGeometry.setAttribute('aLane', new THREE.Float32BufferAttribute(lanes, 4));
    const traffic = new THREE.LineSegments(trafficGeometry, this.glow(TRAFFIC_VERT, FLAT_FRAG, uniforms));

    const windows = new THREE.Points(build(lit), this.glow(WINDOW_VERT, DOT_FRAG, uniforms));

    for (const part of [towers, blocks, traffic, windows]) part.frustumCulled = false;
    this.city.add(towers, blocks, traffic, windows);
    this.city.visible = false;
    this.group.add(this.city);
  }

  private buildGates() {
    const arch = (w: number, h: number) => this.keep(new THREE.BufferGeometry().setFromPoints(
      [[-w, 0], [-w, h], [w, h], [w, 0]].map(([x, y]) => new THREE.Vector3(x, y, 0)),
    ));
    const outer = arch(9, 12.5);
    const inner = arch(8.3, 11.8);
    for (let i = 0; i < 4; i++) {
      const gate = new THREE.Group();
      gate.add(new THREE.LineLoop(outer, this.line), new THREE.LineLoop(inner, this.line));
      gate.visible = false;
      this.gates.push(gate);
      this.group.add(gate);
    }
  }

  private buildCore() {
    const edges = (geometry: THREE.BufferGeometry) => {
      const made = this.keep(new THREE.EdgesGeometry(geometry));
      geometry.dispose();
      return new THREE.LineSegments(made, this.bright);
    };
    this.solids = [
      edges(new THREE.IcosahedronGeometry(2.7, 0)),
      edges(new THREE.DodecahedronGeometry(1.8, 0)),
      edges(new THREE.OctahedronGeometry(0.95, 0)),
    ];
    this.rings = [3.5, 3.9, 4.3].map((r) => this.segments(circle(r, 72), this.bright));

    const count = 900;
    const positions: number[] = [];
    const seeds: number[] = [];
    for (let i = 0; i < count; i++) {
      // Evenly over a sphere, squashed a little so the swarm reads as a disc of dust.
      const y = (Math.random() * 2 - 1) * 0.7;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      positions.push(Math.cos(a) * r, y, Math.sin(a) * r);
      seeds.push(Math.random());
    }
    const geometry = this.keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    const swarm = new THREE.Points(geometry, this.glow(SWARM_VERT, DOT_FRAG));
    swarm.frustumCulled = false;

    this.core.add(...this.solids, ...this.rings, swarm);
    this.core.position.set(0, 6.2, -22);
    this.core.visible = false;
    this.group.add(this.core);
  }

  /** A frame that climbs the machine and starts again, like something reading it. */
  private buildScan() {
    const frame = this.keep(new THREE.BufferGeometry().setFromPoints(
      [[-3, -2.4], [3, -2.4], [3, 4.5], [-3, 4.5]].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    ));
    this.scanMaterial = this.keep(new THREE.LineBasicMaterial({ color: this.shared.uColor.value, transparent: true, opacity: 0 }));
    this.scan = new THREE.LineLoop(frame, this.scanMaterial);
    this.scan.visible = false;
    this.group.add(this.scan);
  }

  private moveMeteors(dt: number) {
    if (!this.meteorLines) return;
    this.nextMeteor -= dt;
    const idle = this.meteors.find((m) => m.life <= 0);
    if (idle && this.nextMeteor <= 0) {
      const side = Math.random() < 0.5 ? -1 : 1;
      idle.at.set(side * (20 + Math.random() * 120), 62 + Math.random() * 40, FAR - 6);
      idle.speed.set(-side * (45 + Math.random() * 45), -(22 + Math.random() * 18), 0);
      idle.life = 1;
      this.nextMeteor = 1.5 + Math.random() * 4.5;
    }
    const position = this.meteorLines.getAttribute('position') as THREE.BufferAttribute;
    const fade = this.meteorLines.getAttribute('aFade') as THREE.BufferAttribute;
    this.meteors.forEach((meteor, i) => {
      if (meteor.life > 0) {
        meteor.life -= dt * 0.8;
        meteor.at.addScaledVector(meteor.speed, dt);
      }
      const lit = Math.max(0, meteor.life);
      position.setXYZ(i * 2, meteor.at.x, meteor.at.y, meteor.at.z);
      position.setXYZ(i * 2 + 1, meteor.at.x - meteor.speed.x * 0.16, meteor.at.y - meteor.speed.y * 0.16, meteor.at.z);
      fade.setX(i * 2, lit * 0.9);
      fade.setX(i * 2 + 1, 0);
    });
    position.needsUpdate = true;
    fade.needsUpdate = true;
  }

  /** Change what is being shown. The first time, and after the demo has been away, it cuts. */
  show(visual: DemoVisual, fresh: boolean) {
    this.visual = visual;
    if (fresh) this.snap = true;
    // Gates belong to the road. Off it, one still on its way would hang in the next shot.
    if (visual !== 'road') for (const gate of this.gates) gate.visible = false;
  }

  /** Send a gate down the road towards the camera. */
  gate() {
    const free = this.gates.find((g) => !g.visible);
    if (!free) return;
    free.position.z = -118;
    free.visible = true;
  }

  setColor(color: THREE.Color) {
    this.shared.uColor.value.copy(color);
    this.dim.color.copy(color);
    this.bright.color.copy(color);
    this.scanMaterial?.color.copy(color);
  }

  /** Move everything on by one frame, and put the camera where this shot wants it. */
  update(dt: number, beat: number | null, camera: THREE.PerspectiveCamera, look: THREE.Vector3) {
    this.time += dt;
    const t = this.time;
    const want = LOOKS[this.visual];
    const ease = (rate: number) => (this.snap ? 1 : Math.min(1, dt * rate));

    // With the score playing, everything moves to it. Without it, the stage keeps its own time.
    const beats = beat ?? t * 1.8;
    const phase = beats % 1;
    const kick = Math.exp(-5 * phase);
    this.shared.uTime.value = t;
    this.shared.uKick.value = kick;
    this.kick = kick;
    this.shared.uPulse.value = phase;

    this.pace += (want.pace - this.pace) * ease(1.6);
    this.shared.uTravel.value += dt * this.pace;
    this.valley.value += (want.valley - this.valley.value) * ease(1.1);
    this.cityShow.value += (want.city - this.cityShow.value) * ease(1.3);
    this.city.visible = this.cityShow.value > 0.004;
    this.coreShow += (want.core - this.coreShow) * ease(2.4);
    this.core.visible = this.coreShow > 0.004;
    if (this.sun) this.sun.position.y += (want.sun - this.sun.position.y) * ease(1.7);
    this.aurora.value += (want.aurora - this.aurora.value) * ease(0.8);
    this.moveMeteors(dt);

    if (this.scan && this.scanMaterial) {
      // One climb every two beats, fading in off the floor and out at the top.
      const climb = (beats / 2) % 1;
      this.scan.visible = this.visual === 'machine';
      this.scan.position.y = 0.05 + climb * 3.1;
      this.scanMaterial.opacity = Math.sin(climb * Math.PI) * 0.75;
    }

    for (const gate of this.gates) {
      if (!gate.visible) continue;
      gate.position.z += dt * this.pace;
      if (gate.position.z > 12) gate.visible = false;
    }

    if (this.core.visible) {
      const [outer, middle, inner] = this.solids;
      outer.rotation.set(t * 0.31, t * 0.47, 0);
      outer.scale.setScalar(1 + kick * 0.14);
      middle.rotation.set(-t * 0.52, t * 0.2, t * 0.37);
      inner.rotation.set(t * 1.1, -t * 0.8, t * 0.5);
      inner.scale.setScalar(1.2 - kick * 0.25);
      this.rings.forEach((ring, i) => ring.rotation.set(t * (0.5 + i * 0.17) + i * 2.1, t * (0.3 - i * 0.21), i * 1.3));
      this.core.scale.setScalar(Math.max(0.001, this.coreShow) * 1.45);
      this.core.position.y = 6.2 + Math.sin(t * 0.8) * 0.45;
    }

    if (this.globe) this.globe.rotation.y = t * 0.04;
    // The planet keeps to the top corner, however wide the screen is.
    this.planet.position.x = THREE.MathUtils.clamp(camera.aspect * 36, 16, 62);

    const wide = camera.aspect > 1;
    let roll = 0;
    if (this.visual === 'machine') {
      // Walk a slow arc in front of the machine. The words sit low on the left, so on a
      // wide screen the camera looks past it that way and the machine lands top right. A
      // tall screen has no room beside the words: there it stands further back, above them.
      const reach = wide ? 10 : 20;
      const angle = Math.sin(t * 0.3) * 0.6;
      this.wantPos.set(Math.sin(angle) * reach - 0.4, 2.7, Math.cos(angle) * reach + 1);
      this.wantLook.set(wide ? -3.4 : -0.3, wide ? -0.5 : -1.9, 1);
    } else if (this.visual === 'solids') {
      // Circle the core a little, keeping it clear of the words.
      this.wantPos.set(Math.sin(t * 0.21) * 5, 5 + Math.sin(t * 0.17) * 1.1, 9);
      this.wantLook.set(wide ? -5.5 : 0, wide ? 5.2 : 1.6, -22);
    } else if (this.visual === 'road') {
      const weave = Math.sin(t * 0.37);
      this.wantPos.set(weave * 2.6, 2.6 + Math.sin(t * 0.29) * 0.5, 9);
      this.wantLook.set(weave * 1.2, 5.2, -40);
      roll = -Math.cos(t * 0.37) * 0.07;
    } else {
      const weave = Math.sin(t * 0.23);
      this.wantPos.set(weave * 3.4, 3.4 + Math.sin(t * 0.31) * 0.7, 9);
      this.wantLook.set(0, 5.4, -30);
      roll = -Math.cos(t * 0.23) * 0.035;
    }
    camera.position.lerp(this.wantPos, ease(1.8));
    look.lerp(this.wantLook, ease(1.8));
    this.roll += (roll - this.roll) * ease(2);
    camera.up.set(Math.sin(this.roll), Math.cos(this.roll), 0);
    this.snap = false;
  }

  dispose() {
    for (const item of this.disposables) item.dispose();
  }
}
