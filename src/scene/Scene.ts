import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { DemoStage, type DemoVisual } from './DemoStage';

/**
 * The 3D layer: a terminal sitting in the dark with rain falling behind it.
 *
 * Two modes. 'attract' shows the machine from outside. 'inside' is what you see once you
 * have sat down at it: the camera has gone through the glass, the case is gone, and the
 * rain is a dim backdrop behind the DOM terminal.
 *
 * Kept deliberately small: no model files, no lights, and no post-processing outside the
 * demo (see buildStage). The case is a
 * handful of extruded shapes drawn as edge lines, and the rain is one instanced draw call
 * whose motion lives entirely in the vertex shader, so a frame costs no per-glyph
 * JavaScript at all.
 */

export type Phosphor = 'green' | 'amber' | 'white';

export type { DemoVisual };

const PHOSPHOR: Record<Phosphor, string> = { green: '#35ff6e', amber: '#ffb000', white: '#dce6f2' };

const SCREEN = { x: -0.42, y: 1.42, z: 1.33, w: 2.5, h: 1.875 };
const ATTRACT_POS = new THREE.Vector3(3.4, 2.5, 9.6);
const ATTRACT_LOOK = new THREE.Vector3(0, 0.7, 0.9);
const INSIDE_POS = new THREE.Vector3(0, 0, 8);
const INSIDE_LOOK = new THREE.Vector3(0, 0, -10);

const COLUMNS = 300;
const PER_COLUMN = 26;
const GLYPH = 0.42;
/** Where the keyboard's back edge sits: clear of the case, because it was detachable. */
const KB = 2.35;

const RAIN_VERT = /* glsl */ `
  attribute vec3 aCol;   // x, z, seed
  attribute float aIdx;  // 0 is the head of the stream
  uniform float uTime;
  uniform float uSize;
  uniform float uTop;
  uniform float uSpan;
  varying vec2 vUv;
  varying float vBright;
  varying float vHead;

  float hash(float n) { return fract(sin(n) * 43758.5453123); }

  void main() {
    float seed = aCol.z;
    float speed = mix(2.2, 7.5, hash(seed));
    float len = floor(mix(9.0, 26.0, hash(seed + 1.7)));
    float travel = uSpan + len * uSize;
    float headY = uTop - mod(uTime * speed + hash(seed + 3.1) * travel, travel);
    float y = headY + aIdx * uSize;

    float alive = step(aIdx, len - 0.5);
    float fade = 1.0 - aIdx / len;

    // Each cell holds a glyph for a while, then swaps. The head swaps fastest.
    float rate = mix(0.6, 5.0, hash(seed + aIdx * 0.37));
    float g = floor(hash(seed * 31.0 + aIdx * 7.0 + floor(uTime * rate)) * 64.0);
    vec2 cell = vec2(mod(g, 8.0), floor(g / 8.0));
    vUv = (uv + cell) / 8.0;

    vec4 mv = modelViewMatrix * vec4(aCol.x, y, aCol.y, 1.0);
    mv.xy += position.xy * uSize * 0.92 * alive;
    gl_Position = projectionMatrix * mv;

    float depth = smoothstep(46.0, 6.0, -mv.z);
    vBright = fade * fade * depth * alive;
    vHead = step(aIdx, 0.5);
  }
`;

const RAIN_FRAG = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uColor;
  uniform float uDim;
  varying vec2 vUv;
  varying float vBright;
  varying float vHead;

  void main() {
    float a = texture2D(uAtlas, vUv).r;
    vec3 color = mix(uColor, vec3(1.0), vHead * 0.75);
    float strength = a * (vBright + vHead * 0.5) * uDim;
    if (strength < 0.01) discard;
    gl_FragColor = vec4(color * strength, 1.0);
  }
`;

function glyphAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = '#fff';
  ctx.font = '48px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glyphs = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789:=*+<>¦Z';
  for (let i = 0; i < 64; i++) {
    // Row 0 of the atlas is the top of the canvas; flipY puts it at v = 1, which the
    // shader's cell arithmetic does not care about because any cell is as good as another.
    ctx.fillText(glyphs[i % glyphs.length], (i % 8) * 64 + 32, Math.floor(i / 8) * 64 + 34);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function radialTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.28)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

/** A side profile in (depth, height), extruded across the width. */
function extrudeProfile(points: [number, number][], width: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  // The shape's x becomes world z, and the extrusion runs along world x.
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(width / 2, 0, 0);
  return geometry;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Scene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 340);
  private machine = new THREE.Group();
  private lineMaterial: THREE.LineBasicMaterial;
  private glowMaterials: THREE.MeshBasicMaterial[] = [];
  private tubeGlow: THREE.Mesh | null = null;
  private rainMaterial: THREE.ShaderMaterial;
  private screenCanvas = document.createElement('canvas');
  private screenTexture: THREE.CanvasTexture;
  private disposables: { dispose: () => void }[] = [];

  private mode: 'attract' | 'inside';
  private phosphor: Phosphor;
  private rainOn = true;
  private raf = 0;
  private last = 0;
  private rainTime = Math.random() * 100;
  private rainRate = 1;
  private burstUntil = 0;
  private dimTarget = 1;
  private pointer = new THREE.Vector2();
  private drift = new THREE.Vector2();
  private look = new THREE.Vector3();
  private tween: { from: number; ms: number; step: (t: number) => void; done: () => void } | null = null;
  private cursorTimer = 0;
  private cursorOn = true;
  private disposed = false;

  private stage: DemoStage | null = null;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private demoOn = false;
  private demoVisual: DemoVisual = 'land';
  private beat: () => number | null = () => null;

  constructor(private canvas: HTMLCanvasElement, opts: { mode: 'attract' | 'inside'; phosphor: Phosphor }) {
    this.mode = opts.mode;
    this.phosphor = opts.phosphor;

    // Throws if WebGL is unavailable; the caller treats that as "no scene" and carries on.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
    this.renderer.setClearColor(0x020503, 1);

    const color = new THREE.Color(PHOSPHOR[this.phosphor]);
    this.lineMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 });

    this.screenCanvas.width = 640;
    this.screenCanvas.height = 480;
    this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;

    this.rainMaterial = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: GLYPH },
        uTop: { value: 17 },
        uSpan: { value: 34 },
        uAtlas: { value: glyphAtlas() },
        uColor: { value: color.clone() },
        uDim: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.disposables.push(this.rainMaterial, this.rainMaterial.uniforms.uAtlas.value, this.lineMaterial, this.screenTexture);

    this.buildRain();
    this.buildMachine();
    this.scene.add(this.machine);

    this.applyMode();
    this.drawScreen();
    // The display face may not have loaded when the first frame is drawn.
    document.fonts?.load('40px VT323').then(() => !this.disposed && this.drawScreen());
    this.cursorTimer = window.setInterval(() => {
      this.cursorOn = !this.cursorOn;
      if (this.mode === 'attract' || this.demoOn) this.drawScreen();
    }, 530);

    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);
    this.raf = requestAnimationFrame(this.frame);
  }

  /* ─── Construction ─── */

  private buildRain() {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position'));
    geometry.setAttribute('uv', quad.getAttribute('uv'));

    const count = COLUMNS * PER_COLUMN;
    const cols = new Float32Array(count * 3);
    const idx = new Float32Array(count);
    for (let c = 0; c < COLUMNS; c++) {
      // Snapped to the glyph grid so streams line up into columns rather than a blizzard.
      const x = Math.round(((Math.random() - 0.5) * 60) / GLYPH) * GLYPH;
      const z = -3.5 - Math.pow(Math.random(), 1.4) * 34;
      const seed = Math.random() * 1000;
      for (let i = 0; i < PER_COLUMN; i++) {
        const n = c * PER_COLUMN + i;
        cols.set([x, z, seed], n * 3);
        idx[n] = i;
      }
    }
    geometry.setAttribute('aCol', new THREE.InstancedBufferAttribute(cols, 3));
    geometry.setAttribute('aIdx', new THREE.InstancedBufferAttribute(idx, 1));
    geometry.instanceCount = count;

    const mesh = new THREE.Mesh(geometry, this.rainMaterial);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    this.disposables.push(geometry, quad);
  }

  private solid(geometry: THREE.BufferGeometry, edgeAngle = 25) {
    const face = new THREE.MeshBasicMaterial({
      color: 0x030705,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const edges = new THREE.EdgesGeometry(geometry, edgeAngle);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry, face), new THREE.LineSegments(edges, this.lineMaterial));
    this.disposables.push(geometry, face, edges);
    return group;
  }

  private outline(points: [number, number, number][], closed = true) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
    this.disposables.push(geometry);
    return closed ? new THREE.LineLoop(geometry, this.lineMaterial) : new THREE.Line(geometry, this.lineMaterial);
  }

  private glow(w: number, h: number, opacity: number) {
    const material = new THREE.MeshBasicMaterial({
      map: this.glowTexture,
      color: PHOSPHOR[this.phosphor],
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glowMaterials.push(material);
    const geometry = new THREE.PlaneGeometry(w, h);
    this.disposables.push(material, geometry);
    return new THREE.Mesh(geometry, material);
  }

  private glowTexture = radialTexture();

  private buildMachine() {
    const m = this.machine;

    // The case: a wedge that is deepest at the desk and slopes away behind the tube.
    m.add(
      this.solid(
        extrudeProfile(
          [
            [1.3, 0.28], [1.3, 2.62], [1.02, 2.76], [-1.55, 2.4], [-1.85, 0.7], [-1.45, 0.28],
          ],
          4.7,
        ),
      ),
    );
    // The plinth it sits on.
    const plinth = this.solid(new THREE.BoxGeometry(4.1, 0.28, 2.3));
    plinth.position.set(0, 0.14, -0.15);
    m.add(plinth);

    // Bezel and tube.
    const { x, y, z, w, h } = SCREEN;
    const bezel = 0.2;
    m.add(
      this.outline([
        [x - w / 2 - bezel, y - h / 2 - bezel, 1.301], [x + w / 2 + bezel, y - h / 2 - bezel, 1.301],
        [x + w / 2 + bezel, y + h / 2 + bezel, 1.301], [x - w / 2 - bezel, y + h / 2 + bezel, 1.301],
      ]),
    );
    const tubeGeometry = new THREE.PlaneGeometry(w, h, 16, 12);
    const positions = tubeGeometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const nx = positions.getX(i) / (w / 2);
      const ny = positions.getY(i) / (h / 2);
      positions.setZ(i, 0.07 * (1 - nx * nx) * (1 - ny * ny));
    }
    const tubeMaterial = new THREE.MeshBasicMaterial({ map: this.screenTexture });
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    tube.position.set(x, y, z - 0.02);
    m.add(tube);
    this.disposables.push(tubeGeometry, tubeMaterial);

    // The blank panel to the right of the tube, with a nameplate.
    const plateCanvas = document.createElement('canvas');
    plateCanvas.width = 256;
    plateCanvas.height = 64;
    const plateTexture = new THREE.CanvasTexture(plateCanvas);
    const plateMaterial = new THREE.MeshBasicMaterial({ map: plateTexture, transparent: true });
    const plateGeometry = new THREE.PlaneGeometry(0.62, 0.155);
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.set(1.72, 2.2, 1.305);
    m.add(plate);
    this.nameplate = { canvas: plateCanvas, texture: plateTexture };
    this.disposables.push(plateTexture, plateMaterial, plateGeometry);
    this.drawNameplate();

    // Keyboard: a low wedge in front, detached, the way the original's was.
    const keyboard = this.solid(extrudeProfile([[KB, 0], [KB + 1.6, 0], [KB + 1.6, 0.16], [KB, 0.46]], 4.5));
    m.add(keyboard);
    const keys: [number, number, number][] = [];
    const slope = (zz: number) => 0.46 - ((zz - KB) / 1.6) * 0.3 + 0.012;
    const key = (x0: number, x1: number, z0: number, z1: number) => {
      const a: [number, number, number] = [x0, slope(z0), z0];
      const b: [number, number, number] = [x1, slope(z0), z0];
      const c: [number, number, number] = [x1, slope(z1), z1];
      const d: [number, number, number] = [x0, slope(z1), z1];
      keys.push(a, b, b, c, c, d, d, a);
    };
    for (let row = 0; row < 5; row++) {
      const z0 = KB + 0.19 + row * 0.27;
      // Main block, then a numeric pad to the right.
      const inset = row === 4 ? 0.5 : (row % 2) * 0.09;
      if (row === 4) key(-1.5, 0.6, z0, z0 + 0.2);
      else for (let k = 0; k < 14; k++) key(-2.05 + inset + k * 0.236, -2.05 + inset + k * 0.236 + 0.19, z0, z0 + 0.2);
      for (let k = 0; k < 4; k++) key(1.32 + k * 0.236, 1.32 + k * 0.236 + 0.19, z0, z0 + 0.2);
    }
    const keyGeometry = new THREE.BufferGeometry().setFromPoints(keys.map((p) => new THREE.Vector3(...p)));
    m.add(new THREE.LineSegments(keyGeometry, this.lineMaterial));
    this.disposables.push(keyGeometry);

    // The cable back to the case.
    const cable = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.9, 0.2, KB), new THREE.Vector3(-2.7, 0.03, 1.7),
      new THREE.Vector3(-2.9, 0.03, 0.4), new THREE.Vector3(-2.3, 0.4, -0.4),
    ]);
    const cableGeometry = new THREE.BufferGeometry().setFromPoints(cable.getPoints(32));
    m.add(new THREE.Line(cableGeometry, this.lineMaterial));
    this.disposables.push(cableGeometry);

    // Light: the tube's bloom, and what it throws on the desk.
    const bloom = this.glow(5.6, 4.4, 0.22);
    bloom.position.set(x, y, z + 0.12);
    m.add(bloom);
    this.tubeGlow = bloom;
    const pool = this.glow(13, 9, 0.16);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.005, 2.4);
    m.add(pool);
    this.disposables.push(this.glowTexture);
  }

  private nameplate: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture } | null = null;

  private drawNameplate() {
    if (!this.nameplate) return;
    const ctx = this.nameplate.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = PHOSPHOR[this.phosphor];
    ctx.globalAlpha = 0.8;
    ctx.font = '44px VT323, ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('tjb|100', 8, 34);
    this.nameplate.texture.needsUpdate = true;
  }

  /** What the tube shows while nobody is sitting at it. */
  private drawScreen() {
    const ctx = this.screenCanvas.getContext('2d')!;
    const color = PHOSPHOR[this.phosphor];
    ctx.fillStyle = '#020d06';
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.textBaseline = 'top';
    ctx.font = '50px VT323, ui-monospace, monospace';
    const lines = this.demoOn
      ? ['TJB-100', '', '2 OPERATOR', '3 ARCADE', '4 ADVENTURE', '6 TERMINAL', '', `PICK ONE ${this.cursorOn ? '█' : ''}`]
      : ['TJB-100', '', 'Wake up...', '', 'Everything is in here.', 'You have to go looking.', '', `SOUND? (Y/N) ${this.cursorOn ? '█' : ''}`];
    lines.forEach((line, i) => ctx.fillText(line, 44, 40 + i * 50));
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let yy = 0; yy < 480; yy += 4) ctx.fillRect(0, yy, 640, 1.5);
    this.screenTexture.needsUpdate = true;
  }

  /* ─── Camera ─── */

  /** Where the camera has to stand for the tube to fill the viewport. */
  private glassPos(): THREE.Vector3 {
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const fitHeight = SCREEN.h / 2 / half;
    const fitWidth = SCREEN.w / 2 / (half * this.camera.aspect);
    return new THREE.Vector3(SCREEN.x, SCREEN.y, SCREEN.z + Math.min(fitHeight, fitWidth) * 0.82);
  }

  private attractPos(): THREE.Vector3 {
    // Narrow screens stand further back so the whole machine stays in frame.
    const pull = THREE.MathUtils.clamp(1.12 / this.camera.aspect, 1, 2.5);
    return new THREE.Vector3(ATTRACT_POS.x / pull, ATTRACT_POS.y, ATTRACT_POS.z * pull);
  }

  private applyMode() {
    const inside = this.mode === 'inside';
    this.machine.visible = this.demoOn ? this.demoVisual === 'machine' : !inside;
    if (this.stage) this.stage.group.visible = this.demoOn;
    // The painted-on glow over the tube would be blurred a second time by the real one.
    if (this.tubeGlow) this.tubeGlow.visible = !this.demoOn;
    // The rain belongs to the machine: in the demo it only falls in the shot that shows it.
    this.dimTarget = this.demoOn ? (this.demoVisual === 'machine' ? 0.3 : 0) : inside ? 0.34 : 1;
    if (!this.demoOn) {
      // The demo leans the camera and opens its lens. Put both back.
      this.camera.fov = 38;
      this.camera.updateProjectionMatrix();
      this.camera.up.set(0, 1, 0);
      this.camera.position.copy(inside ? INSIDE_POS : this.attractPos());
      this.look.copy(inside ? INSIDE_LOOK : ATTRACT_LOOK);
    }
    // Behind the terminal the rain is a dim backdrop, and half the pixels is plenty for it.
    const ratio = Math.min(window.devicePixelRatio, inside && !this.demoOn ? 1 : 2);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    this.composer?.setPixelRatio(ratio);
    this.composer?.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  /* ─── The demo ─── */

  /**
   * The stage and the glow are built the first time the demo is asked for. The glow is the
   * one place the scene is drawn twice: once to a buffer, then blurred back over itself, so
   * a line looks lit and not just drawn. It is only ever switched on for the demo. The
   * machine and the rain behind the terminal are still drawn straight to the screen.
   */
  private buildStage() {
    this.stage = new DemoStage(new THREE.Color(PHOSPHOR[this.phosphor]), this.lineMaterial);
    this.scene.add(this.stage.group);

    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    // Four samples a pixel, or thin lines crawl as they move.
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.55, 0.1);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.disposables.push(this.stage, this.composer, target);
  }

  /** Give the whole screen to the demo, showing this, or take it back. Built on first use. */
  setDemo(visual: DemoVisual | null) {
    const on = visual !== null;
    if (on === this.demoOn && (!on || visual === this.demoVisual)) return;
    const fresh = on && !this.demoOn;
    this.demoOn = on;
    if (visual) this.demoVisual = visual;
    if (on && !this.stage) this.buildStage();
    if (visual) this.stage?.show(visual, fresh);
    this.tween = null;
    this.applyMode();
    this.drawScreen();
  }

  /** Send a gate down the road towards the camera. */
  gate() {
    this.stage?.gate();
  }

  /** Tell the demo the film has moved on to this shot. */
  cut(index: number) {
    this.stage?.cut(index);
  }

  /** Where to read the music's beat from, so the demo can move to it. */
  setBeat(source: () => number | null) {
    this.beat = source;
  }

  private run(ms: number, step: (t: number) => void): Promise<void> {
    return new Promise((done) => {
      this.tween = { from: performance.now(), ms, step, done };
    });
  }

  /** Sit down: fly to the glass, then through it. `onGlass` fires as the tube fills the view. */
  async enter(onGlass: () => void): Promise<void> {
    if (this.mode === 'inside') {
      onGlass();
      return;
    }
    const fromPos = this.camera.position.clone();
    const fromLook = this.look.clone();
    const toPos = this.glassPos();
    const toLook = new THREE.Vector3(SCREEN.x, SCREEN.y, SCREEN.z);
    let fired = false;
    await this.run(1700, (t) => {
      const e = easeInOut(t);
      this.camera.position.lerpVectors(fromPos, toPos, e);
      this.look.lerpVectors(fromLook, toLook, Math.min(1, e * 1.25));
      if (t > 0.72 && !fired) {
        fired = true;
        onGlass();
      }
    });
    if (!fired) onGlass();
    this.mode = 'inside';
    this.applyMode();
  }

  /** Stand up again: back out to where the machine can be seen whole. */
  async exit(): Promise<void> {
    if (this.mode === 'attract') return;
    this.mode = 'attract';
    this.applyMode();
    const toPos = this.attractPos();
    const fromPos = this.glassPos();
    const fromLook = new THREE.Vector3(SCREEN.x, SCREEN.y, SCREEN.z);
    this.drawScreen();
    await this.run(1500, (t) => {
      const e = easeInOut(t);
      this.camera.position.lerpVectors(fromPos, toPos, e);
      this.look.lerpVectors(fromLook, ATTRACT_LOOK, e);
    });
  }

  /* ─── Controls ─── */

  setPhosphor(phosphor: Phosphor) {
    this.phosphor = phosphor;
    const color = new THREE.Color(PHOSPHOR[phosphor]);
    this.lineMaterial.color.copy(color);
    this.rainMaterial.uniforms.uColor.value.copy(color);
    for (const material of this.glowMaterials) material.color.copy(color);
    this.stage?.setColor(color);
    this.drawScreen();
    this.drawNameplate();
  }

  setRain(on: boolean) {
    this.rainOn = on;
  }

  /** A few seconds of downpour. */
  burst() {
    this.burstUntil = performance.now() + 2600;
  }

  /* ─── Loop ─── */

  private onPointer = (e: PointerEvent) => {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  };

  private onVisibility = () => {
    cancelAnimationFrame(this.raf);
    if (!document.hidden) {
      this.last = 0;
      this.raf = requestAnimationFrame(this.frame);
    }
  };

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    if (!this.tween && this.mode === 'attract') this.camera.position.copy(this.attractPos());
  };

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;

    const bursting = now < this.burstUntil;
    this.rainRate += ((bursting ? 3.2 : 1) - this.rainRate) * Math.min(1, dt * 3);
    this.rainTime += dt * this.rainRate;
    const uniforms = this.rainMaterial.uniforms;
    uniforms.uTime.value = this.rainTime;
    const dim = this.rainOn ? (bursting ? 1 : this.dimTarget) : 0;
    uniforms.uDim.value += (dim - uniforms.uDim.value) * Math.min(1, dt * 2.5);

    if (this.tween) {
      const t = Math.min(1, (now - this.tween.from) / this.tween.ms);
      this.tween.step(t);
      if (t >= 1) {
        const { done } = this.tween;
        this.tween = null;
        done();
      }
    }

    if (this.demoOn && this.stage) {
      const beat = this.beat();
      this.stage.update(dt, beat, this.camera, this.look);
      // With the score playing, the glow breathes with the kick. In silence it holds still:
      // a picture pulsing to a beat nobody can hear just looks like a fault.
      if (this.bloom) this.bloom.strength = 0.5 + (beat === null ? 0 : this.stage.kick * 0.14) + this.stage.flash * 0.5;
    }

    // A little parallax from the pointer, eased so it never jumps.
    this.drift.lerp(this.pointer, Math.min(1, dt * 2));
    const sway = this.mode === 'attract' && !this.tween ? 0.55 : 0.18;
    this.camera.lookAt(
      this.look.x + this.drift.x * sway,
      this.look.y - this.drift.y * sway * 0.6,
      this.look.z,
    );

    if (this.demoOn && this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.cursorTimer);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('pointermove', this.onPointer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const item of this.disposables) item.dispose();
    this.renderer.dispose();
  }
}
