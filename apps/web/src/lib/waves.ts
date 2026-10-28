// Hexagon waves (DECISIONS U12): fields of small hexagons whose brightness follows ripples of smooth value noise under
// slower drifting gusts, as in the author's First Visit and CQL demos. Two kinds of water:
// - the sea under everything below the masthead: calm, light and shallow in the light scheme, deep in the dark one. On
//   the map it turns into a slow whirlpool round the device and a quiet flow along the map's lines, out from the centre
//   and a little livelier than the whirlpool; the water scrolls with the page;
// - the river behind the masthead: ripples drawn out along a current that carries them left to right, and now and then
//   a pigeon wave (violet shimmering into teal) runs along it.
// An action casts a short light on the field around where it happened, as a decision lights the hexagons round itself
// in the CQL demo's chat. Lights and waves are feedback and ornament: they carry no meaning.
// Drawn on the graphics card (WebGL2, one instanced draw call a frame). Without a real graphics card the river goes on
// a 2D canvas whose frame rate backs off to a tenth of the page's time, and the sea is drawn once and stands still.
// Idle while off screen or in a hidden tab; one static frame and no light when reduced motion is requested.
// Adapted from ytsuhen/Pub-demos (first-visit), same author. The light after ytsuhen/cql-demo-yevenko (web/index.html,
// the chat's waves), same author.

/** Hexagon radius in CSS pixels; the grid steps of a pointy-top hexagon tiling. */
const R = 7;
const STEP_X = Math.sqrt(3) * R;
const STEP_Y = 1.5 * R;
const MAX_LIGHTS = 8;
/** How long a light cast by an action lasts, and a pigeon wave's run across the river (ms). */
const BURST_MS = 1500;
const WAVE_MS = 4500;
/** The whirlpool turns once in 40 s; the flow along the lines runs at 26 px/s (both in the calm sea). */
const WHIRL_SPEED = (2 * Math.PI) / 40;
const FLOW_SPEED = 26;
const FLOW_PERIOD = 2.5;
/** The flow's reach either side of a line (px) and the cell of its map. */
const FLOW_SIGMA = 16;
const FLOW_CELL = 10;

type RGB = readonly [number, number, number];

/** Colours of a field: the water's wave and crest, its brightness, and the iris pair of the lights. */
export interface Palette {
  base: RGB;
  crest: RGB;
  /**
   * Kept below First Visit's so that what is drawn over the water keeps its contrast: a field alone reaches at most
   * 0.52 × dim opacity; a light, which lasts a moment, reaches lightAlpha.
   */
  dim: number;
  lightAlpha: number;
  violet: RGB;
  teal: RGB;
}

/** The deep sea (the CQL demo's): the masthead's river in both schemes, the page's sea in the dark one. */
export const DEEP: Palette = {
  base: [7, 89, 74],
  crest: [63, 181, 154],
  dim: 0.62,
  lightAlpha: 0.62,
  violet: [177, 140, 255],
  teal: [79, 227, 193],
};

/** Shallow water on the light page: pale teal hexagons over the paper. */
export const SHALLOW: Palette = {
  base: [207, 226, 220],
  crest: [134, 196, 178],
  dim: 0.95,
  lightAlpha: 0.55,
  violet: [124, 58, 237],
  teal: [14, 159, 132],
};

/**
 * How a kind of water moves. Two octaves of noise (`one`, `two`: scale across x and y, drift along x per second, change
 * per second) under slow gusts; `mix` weighs the octaves, `glint` is where the brightest ripples begin, `sway` moves
 * each hexagon with the water around it (x, y), `tilt` turns it.
 */
interface Motion {
  one: { sx: number; sy: number; drift: number; change: number };
  two: { sx: number; sy: number; drift: number; change: number };
  gust: { sx: number; sy: number; drift: number; change: number };
  mix: number;
  glint: number;
  sway: [number, number];
  tilt: number;
}

export type WaterKind = "sea" | "river";

const MOTIONS: Record<WaterKind, Motion> = {
  // A lake in a light breeze: irregular ripples that slowly appear and melt away (First Visit, the CQL chat).
  sea: {
    one: { sx: 0.045, sy: 0.045, drift: 0, change: 0.2 },
    two: { sx: 0.11, sy: 0.11, drift: 0, change: 0.33 },
    gust: { sx: 0.007, sy: 0.007, drift: 0, change: 0.04 },
    mix: 0.65,
    glint: 0.7,
    sway: [1.4, 1.4],
    tilt: 0.12,
  },
  // A river: ripples drawn out along a current that carries them left to right (about 25–30 px a second).
  river: {
    one: { sx: 0.026, sy: 0.085, drift: 0.63, change: 0.2 },
    two: { sx: 0.075, sy: 0.16, drift: 2.16, change: 0.4 },
    gust: { sx: 0.006, sy: 0.02, drift: 0.07, change: 0.045 },
    mix: 0.55,
    glint: 0.66,
    sway: [2.2, 0.8],
    tilt: 0.16,
  },
};

/** The map seen from the water, in page coordinates: the device the whirlpool turns round, and the lines' segments. */
export interface Geometry {
  whirl: { x: number; y: number; r: number } | null;
  /** x1, y1, x2, y2 for each segment, from the centre outwards. */
  segments: number[];
}

export type Renderer = "webgl2" | "2d";

export interface Waves {
  renderer: Renderer;
  /** Light the field around a point of the canvas (CSS px); `reach` is the light's radius. */
  light(x: number, y: number, reach: number): void;
  stop(): void;
}

interface Light {
  x: number;
  y: number;
  reach: number;
  born: number;
  life: number;
  /** A pigeon wave runs along the river (px/s); a burst stays where it was cast. */
  vx: number;
}

const mixRgb = (a: RGB, b: RGB, k: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

/**
 * A light at time `now`: where it is, its strength (0..1), the radius of its ring and its colour. A burst flares and
 * turns from violet to teal as its ring spreads; a pigeon wave swells and fades as it runs, shimmering between the two.
 */
function lightAt(l: Light, now: number, p: Palette) {
  const age = Math.min(1, (now - l.born) / l.life);
  const x = l.x + (l.vx * (now - l.born)) / 1000;
  if (l.vx === 0) {
    const power = age < 0.12 ? age / 0.12 : (1 - (age - 0.12) / 0.88) ** 1.6;
    const k = Math.min(1, Math.max(0, (age - 0.1) / 0.7));
    return { x, power, ring: l.reach * (0.15 + 1.25 * age), rgb: mixRgb(p.violet, p.teal, k * k * (3 - 2 * k)) };
  }
  const power = Math.sin(Math.PI * age) ** 1.3 * 0.85;
  return { x, power, ring: l.reach * 0.55, rgb: mixRgb(p.violet, p.teal, 0.5 - 0.5 * Math.cos(age * Math.PI * 3)) };
}

// Smooth 3D value noise on a seeded permutation: a continuous but irregular field, so the ripples never repeat.
const PERM = new Uint8Array(256);
const VALUES = new Float32Array(256);
{
  let seed = 20261001;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 256; i++) {
    PERM[i] = i;
    VALUES[i] = random() * 2 - 1;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [PERM[i], PERM[j]] = [PERM[j] ?? 0, PERM[i] ?? 0];
  }
}

const perm = (i: number) => PERM[i & 255] ?? 0;
const hash = (x: number, y: number, z: number) => VALUES[perm(perm(perm(x) + y) + z)] ?? 0;
const smooth = (v: number) => v * v * (3 - 2 * v);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Value noise in -1..1. */
function noise(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const w = smooth(z - zi);
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

/** The water at a point of the page and a time (no whirlpool or flow: the 2D painter's). */
function waterAt(m: Motion, px: number, py: number, t: number) {
  const n1 = noise(px * m.one.sx - t * m.one.drift, py * m.one.sy, t * m.one.change);
  const n2 = noise(px * m.two.sx - t * m.two.drift + 31.7, py * m.two.sy - 12.3, t * m.two.change);
  const gust = 0.5 + 0.5 * noise(px * m.gust.sx - t * m.gust.drift + 5.1, py * m.gust.sy + 9.7, t * m.gust.change);
  const lift = 0.5 + 0.5 * (m.mix * n1 + (1 - m.mix) * n2);
  const li = lift * (0.4 + 0.6 * gust);
  const glint = (lift < m.glint ? 0 : ((lift - m.glint) / (1 - m.glint)) ** 2) * gust;
  return { n1, n2, li, glint };
}

/**
 * The flow along the map's lines as a small RGBA map over their bounding box: per cell the nearest segment's direction
 * (red, green: −1..1 as 0..255) and how close it is (blue: 1 on the line, fading over FLOW_SIGMA).
 */
function flowMap(
  segments: readonly number[],
): { rect: [number, number, number, number]; cols: number; rows: number; data: Uint8Array } | null {
  if (segments.length < 4) return null;
  let [x0, y0, x1, y1] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, -Infinity, -Infinity];
  for (let i = 0; i < segments.length; i += 2) {
    const x = segments[i] ?? 0;
    const y = segments[i + 1] ?? 0;
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  }
  const margin = FLOW_SIGMA * 3;
  [x0, y0, x1, y1] = [x0 - margin, y0 - margin, x1 + margin, y1 + margin];
  const cell = Math.max(FLOW_CELL, (x1 - x0) / 256, (y1 - y0) / 256);
  const cols = Math.max(2, Math.ceil((x1 - x0) / cell));
  const rows = Math.max(2, Math.ceil((y1 - y0) / cell));
  const data = new Uint8Array(cols * rows * 4);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const px = x0 + (c + 0.5) * cell;
      const py = y0 + (r + 0.5) * cell;
      let best = Number.POSITIVE_INFINITY;
      let dx = 0;
      let dy = 0;
      for (let i = 0; i + 3 < segments.length; i += 4) {
        const ax = segments[i] ?? 0;
        const ay = segments[i + 1] ?? 0;
        const vx = (segments[i + 2] ?? 0) - ax;
        const vy = (segments[i + 3] ?? 0) - ay;
        const len2 = vx * vx + vy * vy || 1;
        const k = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
        const d2 = (px - ax - k * vx) ** 2 + (py - ay - k * vy) ** 2;
        if (d2 < best) {
          best = d2;
          const len = Math.sqrt(len2);
          [dx, dy] = [vx / len, vy / len];
        }
      }
      const w = Math.exp(-best / (FLOW_SIGMA * FLOW_SIGMA));
      const o = (r * cols + c) * 4;
      data[o] = Math.round((dx * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round((dy * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round(w * 255);
      data[o + 3] = 255;
    }
  return { rect: [x0, y0, cols * cell, rows * cell], cols, rows, data };
}

interface Frame {
  t: number;
  now: number;
  cells: Float32Array;
  width: number;
  height: number;
  lights: Light[];
  palette: Palette;
  /** The canvas's top-left corner in page coordinates. */
  origin: { x: number; y: number };
}

interface Painter {
  dpr(): number;
  /** The least time between frames (ms); the 2D painter raises it when drawing gets slow. */
  frameMs: number;
  resized(cells: Float32Array): void;
  draw(frame: Frame): void;
  /** The map's geometry changed (the sea in WebGL2 only). */
  geometry?(g: Geometry): void;
}

/** A number as a GLSL float literal. */
const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/** The vertex shader: the water of `waterAt` (with the whirlpool and the flow when `map` is set), the lights. */
function vertexShader(m: Motion, map: boolean): string {
  const octave = (o: Motion["one"], at: string, dx: string, dy: string) =>
    `vec3(${at}.x * ${f(o.sx)} - uT * ${f(o.drift)}${dx}, ${at}.y * ${f(o.sy)}${dy}, uT * ${f(o.change)})`;
  return `#version 300 es
precision highp float;
precision highp int;
in vec2 aCorner;
in vec2 aCell;
uniform vec2 uView;
uniform vec2 uOrigin;
uniform float uT;
uniform vec3 uBase;
uniform vec3 uCrest;
uniform float uDim;
uniform float uLightA;
uniform int uNL;
uniform vec4 uL[${MAX_LIGHTS}];
uniform vec4 uLC[${MAX_LIGHTS}];
uniform ivec4 uPerm[64];
uniform vec4 uVal[64];
${map ? "uniform vec4 uWhirl;\nuniform vec4 uFlowRect;\nuniform float uFlowOn;\nuniform sampler2D uFlow;" : ""}
out vec4 vColor;
int perm(int i) { i = i & 255; return uPerm[i >> 2][i & 3]; }
float hash(int x, int y, int z) { int k = perm(perm(perm(x) + y) + z); return uVal[k >> 2][k & 3]; }
float noise(vec3 p) {
  vec3 f = floor(p);
  ivec3 i = ivec3(f);
  vec3 u = p - f;
  u = u * u * (3.0 - 2.0 * u);
  return mix(
    mix(mix(hash(i.x, i.y, i.z), hash(i.x + 1, i.y, i.z), u.x), mix(hash(i.x, i.y + 1, i.z), hash(i.x + 1, i.y + 1, i.z), u.x), u.y),
    mix(mix(hash(i.x, i.y, i.z + 1), hash(i.x + 1, i.y, i.z + 1), u.x), mix(hash(i.x, i.y + 1, i.z + 1), hash(i.x + 1, i.y + 1, i.z + 1), u.x), u.y),
    u.z);
}
void main() {
  // The grid moves with the page: each hexagon keeps its place on the page as it scrolls.
  vec2 cell = aCell - mod(uOrigin, vec2(${f(STEP_X)}, ${f(2 * STEP_Y)}));
  vec2 P = cell + uOrigin;
  float n1 = noise(${octave(m.one, "P", "", "")});
  float spiral = 0.0;
${
  map
    ? `  // A quiet flow along the lines, out from the centre: the first octave is carried along each line's direction, in
  // two layers half a period apart that fade into each other, so the water never stretches.
  vec4 F = texture(uFlow, (P - uFlowRect.xy) / uFlowRect.zw);
  float w = F.b * uFlowOn;
  if (w > 0.002) {
    vec2 dir = F.rg * 2.0 - 1.0;
    float ph = fract(uT / ${f(FLOW_PERIOD)});
    float pb = fract(ph + 0.5);
    vec2 A = P - dir * (w * ${f(FLOW_SPEED * FLOW_PERIOD)} * ph);
    vec2 B = P - dir * (w * ${f(FLOW_SPEED * FLOW_PERIOD)} * pb);
    n1 = mix(noise(${octave(m.one, "B", "", "")}), noise(${octave(m.one, "A", "", "")}), 1.0 - abs(2.0 * ph - 1.0));
  }
  // A slow whirlpool round the device: the water near it turns as one, fading into the still sea further out.
  vec2 d = P - uWhirl.xy;
  float r = length(d);
  float s = uWhirl.w * exp(-(r * r) / (uWhirl.z * uWhirl.z));
  if (s > 0.002) {
    float ang = uT * ${f(WHIRL_SPEED)};
    vec2 Q = uWhirl.xy + vec2(cos(ang) * d.x - sin(ang) * d.y, sin(ang) * d.x + cos(ang) * d.y);
    n1 = mix(n1, noise(${octave(m.one, "Q", "", "")}), s);
    spiral = 0.1 * s * cos(2.0 * atan(d.y, d.x) - 2.2 * log(1.0 + r / 24.0) + 1.5 * ang);
  }`
    : ""
}
  float n2 = noise(${octave(m.two, "P", " + 31.7", " - 12.3")});
  float gust = 0.5 + 0.5 * noise(${octave(m.gust, "P", " + 5.1", " + 9.7")});
  float lift = 0.5 + 0.5 * (${f(m.mix)} * n1 + ${f(1 - m.mix)} * n2) + spiral;
  float li = lift * (0.4 + 0.6 * gust);
  float g = lift < ${f(m.glint)} ? 0.0 : (lift - ${f(m.glint)}) / ${f(1 - m.glint)};
  float glint = g * g * gust;
  float mx = min(1.0, 0.1 + 0.42 * li + 0.4 * glint);
  vec2 c = vec2(cell.x + ${f(m.sway[0])} * n2, cell.y + ${f(m.sway[1])} * n1);
  vec3 rgb = uBase + (uCrest - uBase) * mx;
  float a = (0.1 + 0.2 * li + 0.22 * glint) * uDim;
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uNL) break;
    vec4 L = uL[i];
    float dl = distance(c, L.xy);
    float q = dl / L.z;
    float rr = (dl - uLC[i].w) / (0.35 * L.z);
    float k = min(1.0, L.w * (0.45 * exp(-q * q * 1.3) + 0.55 * exp(-rr * rr)));
    rgb += (uLC[i].rgb - rgb) * k;
    a += (uLightA - a) * k;
  }
  float size = 0.8 + 0.16 * li, tilt = ${f(m.tilt)} * n2;
  float cs = cos(tilt) * size, sn = sin(tilt) * size;
  vec2 pos = c + vec2(cs * aCorner.x - sn * aCorner.y, sn * aCorner.x + cs * aCorner.y);
  gl_Position = vec4(pos.x / uView.x * 2.0 - 1.0, 1.0 - pos.y / uView.y * 2.0, 0.0, 1.0);
  vColor = vec4(floor(rgb) / 255.0, clamp(a, 0.0, 1.0));
}`;
}

const FS = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 outColor;
void main() { outColor = vec4(vColor.rgb * vColor.a, vColor.a); }`;

const UNIFORMS = [
  "uView",
  "uOrigin",
  "uT",
  "uBase",
  "uCrest",
  "uDim",
  "uLightA",
  "uNL",
  "uL",
  "uLC",
  "uPerm",
  "uVal",
  "uWhirl",
  "uFlowRect",
  "uFlowOn",
  "uFlow",
] as const;

/** The WebGL2 painter, or null without a real graphics card (a software WebGL would be slower than the 2D canvas). */
function webgl(canvas: HTMLCanvasElement, motion: Motion, map: boolean, anyGl: boolean): Painter | null {
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      failIfMajorPerformanceCaveat: !anyGl,
    });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const g = gl;
  let name = String(g.getParameter(g.RENDERER) ?? "");
  if (/^webkit webgl$/i.test(name)) {
    const info = g.getExtension("WEBGL_debug_renderer_info");
    if (info) name = String(g.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? name);
  }
  if (!anyGl && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)) return null;
  const VS = vertexShader(motion, map);
  const u: Partial<Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>> = {};
  let cellBuffer: WebGLBuffer | null = null;
  let flowTexture: WebGLTexture | null = null;
  let flow: ReturnType<typeof flowMap> = null;
  let whirl: Geometry["whirl"] = null;
  let lost = false;
  let cellsNow: Float32Array = new Float32Array(0);
  const LA = new Float32Array(MAX_LIGHTS * 4);
  const LC = new Float32Array(MAX_LIGHTS * 4);
  const uploadFlow = () => {
    if (!map) return;
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, flowTexture);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    const empty = new Uint8Array([128, 128, 0, 255]);
    g.texImage2D(
      g.TEXTURE_2D,
      0,
      g.RGBA,
      flow?.cols ?? 1,
      flow?.rows ?? 1,
      0,
      g.RGBA,
      g.UNSIGNED_BYTE,
      flow?.data ?? empty,
    );
  };
  const setup = () => {
    const shader = (type: number, source: string) => {
      const s = g.createShader(type);
      if (!s) throw new Error("shader");
      g.shaderSource(s, source);
      g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const program = g.createProgram();
    g.attachShader(program, shader(g.VERTEX_SHADER, VS));
    g.attachShader(program, shader(g.FRAGMENT_SHADER, FS));
    g.linkProgram(program);
    if (!g.getProgramParameter(program, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(program) ?? "link");
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook
    g.useProgram(program);
    for (const n of UNIFORMS) u[n] = g.getUniformLocation(program, n);
    g.uniform4iv(u.uPerm ?? null, Int32Array.from(PERM));
    g.uniform4fv(u.uVal ?? null, VALUES);
    g.bindVertexArray(g.createVertexArray());
    const corners = new Float32Array(12);
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      corners[2 * i] = Math.cos(a) * R * 0.82;
      corners[2 * i + 1] = Math.sin(a) * R * 0.82;
    }
    g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
    g.bufferData(g.ARRAY_BUFFER, corners, g.STATIC_DRAW);
    const aCorner = g.getAttribLocation(program, "aCorner");
    g.enableVertexAttribArray(aCorner);
    g.vertexAttribPointer(aCorner, 2, g.FLOAT, false, 0, 0);
    cellBuffer = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, cellBuffer);
    g.bufferData(g.ARRAY_BUFFER, cellsNow, g.STATIC_DRAW);
    const aCell = g.getAttribLocation(program, "aCell");
    g.enableVertexAttribArray(aCell);
    g.vertexAttribPointer(aCell, 2, g.FLOAT, false, 0, 0);
    g.vertexAttribDivisor(aCell, 1);
    if (map) {
      flowTexture = g.createTexture();
      g.bindTexture(g.TEXTURE_2D, flowTexture);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      g.uniform1i(u.uFlow ?? null, 0);
      uploadFlow();
    }
    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    g.clearColor(0, 0, 0, 0);
  };
  try {
    setup();
  } catch {
    return null;
  }
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    try {
      setup();
      lost = false;
    } catch {
      // the page works without its waves
    }
  });
  return {
    dpr: () => Math.min(window.devicePixelRatio || 1, 2),
    frameMs: 33,
    resized(cells) {
      cellsNow = cells;
      if (lost) return;
      g.bindBuffer(g.ARRAY_BUFFER, cellBuffer);
      g.bufferData(g.ARRAY_BUFFER, cells, g.STATIC_DRAW);
    },
    geometry(next) {
      whirl = next.whirl;
      flow = flowMap(next.segments);
      if (!lost) uploadFlow();
    },
    draw({ t, now, cells, width, height, lights, palette, origin }) {
      if (lost) return;
      g.viewport(0, 0, canvas.width, canvas.height);
      g.clear(g.COLOR_BUFFER_BIT);
      g.uniform2f(u.uView ?? null, width, height);
      g.uniform2f(u.uOrigin ?? null, origin.x, origin.y);
      g.uniform1f(u.uT ?? null, t);
      g.uniform3f(u.uBase ?? null, ...palette.base);
      g.uniform3f(u.uCrest ?? null, ...palette.crest);
      g.uniform1f(u.uDim ?? null, palette.dim);
      g.uniform1f(u.uLightA ?? null, palette.lightAlpha);
      if (map) {
        g.uniform4f(u.uWhirl ?? null, whirl?.x ?? 0, whirl?.y ?? 0, Math.max(1, whirl?.r ?? 1), whirl ? 1 : 0);
        const rect = flow?.rect ?? [0, 0, 1, 1];
        g.uniform4f(u.uFlowRect ?? null, rect[0], rect[1], rect[2], rect[3]);
        g.uniform1f(u.uFlowOn ?? null, flow ? 1 : 0);
        g.activeTexture(g.TEXTURE0);
        g.bindTexture(g.TEXTURE_2D, flowTexture);
      }
      const n = Math.min(MAX_LIGHTS, lights.length);
      for (let i = 0; i < n; i++) {
        const l = lights[i] as Light;
        const { x, power, ring, rgb } = lightAt(l, now, palette);
        LA.set([x, l.y, l.reach, power], 4 * i);
        LC.set([rgb[0], rgb[1], rgb[2], ring], 4 * i);
      }
      g.uniform1i(u.uNL ?? null, n);
      if (n > 0) {
        g.uniform4fv(u.uL ?? null, LA);
        g.uniform4fv(u.uLC ?? null, LC);
      }
      g.drawArraysInstanced(g.TRIANGLE_FAN, 0, 6, cells.length / 2);
    },
  };
}

/** The same water on a 2D canvas, at CSS resolution; `share` is the part of the page's time it may take. */
function canvas2d(canvas: HTMLCanvasElement, motion: Motion, share: number): Painter | null {
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext("2d");
  } catch {
    ctx = null;
  }
  if (!ctx || typeof Path2D === "undefined") return null;
  const c = ctx;
  const hex = new Path2D();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const x = Math.cos(a) * R * 0.82;
    const y = Math.sin(a) * R * 0.82;
    if (i) hex.lineTo(x, y);
    else hex.moveTo(x, y);
  }
  hex.closePath();
  return {
    dpr: () => 1,
    frameMs: 50,
    resized() {
      // nothing to upload: the 2D painter reads the cells each frame
    },
    draw({ t, now, cells, lights, palette, origin }) {
      const t0 = performance.now();
      const lit = lights.map((l) => ({ l, ...lightAt(l, now, palette) }));
      const shiftX = origin.x % STEP_X;
      const shiftY = origin.y % (2 * STEP_Y);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < cells.length; i += 2) {
        const cx = (cells[i] ?? 0) - shiftX;
        const cy = (cells[i + 1] ?? 0) - shiftY;
        const { n1, n2, li, glint } = waterAt(motion, cx + origin.x, cy + origin.y, t);
        const m = Math.min(1, 0.1 + 0.42 * li + 0.4 * glint);
        const x = cx + motion.sway[0] * n2;
        const y = cy + motion.sway[1] * n1;
        let [r, g, b] = mixRgb(palette.base, palette.crest, m);
        let a = (0.1 + 0.2 * li + 0.22 * glint) * palette.dim;
        for (const { l, x: lx, power, ring, rgb } of lit) {
          const d = Math.hypot(x - lx, y - l.y);
          const q = d / l.reach;
          const w = (d - ring) / (0.35 * l.reach);
          const k = Math.min(1, power * (0.45 * Math.exp(-q * q * 1.3) + 0.55 * Math.exp(-w * w)));
          if (k < 0.004) continue;
          r += (rgb[0] - r) * k;
          g += (rgb[1] - g) * k;
          b += (rgb[2] - b) * k;
          a += (palette.lightAlpha - a) * k;
        }
        const size = 0.8 + 0.16 * li;
        const tilt = motion.tilt * n2;
        const cos = Math.cos(tilt) * size;
        const sin = Math.sin(tilt) * size;
        c.setTransform(cos, sin, -sin, cos, x, y);
        c.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a.toFixed(3)})`;
        c.fill(hex);
      }
      // Painting is most of the cost: keep the field within its share of the page's time.
      this.frameMs = Math.min(400, Math.max(50, (performance.now() - t0) / share));
    },
  };
}

export interface WavesOptions {
  water?: WaterKind;
  /** The colours, read at each frame (the sea follows the colour scheme). */
  palette?: () => Palette;
  /** The canvas's top-left corner in page coordinates, so the water scrolls with the page (default: it does not). */
  origin?: () => { x: number; y: number };
  /** The map seen from the water (the sea): read now and then; a whirlpool round the device, a flow along the lines. */
  geometry?: () => Geometry;
  /** Pigeon waves now and then (the river). */
  wander?: boolean;
  /** Without a graphics card: animate (the river) or draw once and stand still (the sea). */
  animate2d?: boolean;
  /** Allow a software WebGL (tests). */
  anyGl?: boolean;
  /** Without a graphics card, the part of the page's time the field may take. */
  share?: number;
}

/**
 * Starts the waves on `canvas`, sized to `host`. `mode` "webgl2" may fail (null): a canvas once asked for WebGL cannot
 * draw in 2D, so the caller then starts "2d" on a fresh canvas.
 */
export function startWaves(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  mode: Renderer,
  options: WavesOptions = {},
): Waves | null {
  const motion = MOTIONS[options.water ?? "sea"];
  const map = mode === "webgl2" && options.geometry !== undefined;
  const painter =
    mode === "webgl2"
      ? webgl(canvas, motion, map, options.anyGl ?? false)
      : canvas2d(canvas, motion, options.share ?? 0.1);
  if (!painter) return null;
  const palette = options.palette ?? (() => DEEP);
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
  const animated = mode === "webgl2" || (options.animate2d ?? true);
  const still = () => !animated || (reduced?.matches ?? false);
  const origin = options.origin ?? (() => ({ x: 0, y: 0 }));
  let width = 0;
  let height = 0;
  let cells = new Float32Array(0);
  let lights: Light[] = [];
  let onScreen = true;
  let frame = 0;
  let last = 0;
  let stopped = false;
  let scrolling = 0;
  let nextWave = performance.now() + 4000 + Math.random() * 3000;
  let geometryAt = 0;
  let geometryKey = "";

  const readGeometry = (now: number) => {
    if (!map || !options.geometry || now - geometryAt < 400) return;
    geometryAt = now;
    const g = options.geometry();
    const key = [...(g.whirl ? [g.whirl.x, g.whirl.y, g.whirl.r] : [-1]), ...g.segments].map(Math.round).join();
    if (key === geometryKey) return;
    geometryKey = key;
    painter.geometry?.(g);
    canvas.dataset.whirl = g.whirl ? "on" : "off";
    canvas.dataset.flow = String(g.segments.length / 4);
  };
  const draw = (now: number) => {
    if (!width || !height) return;
    lights = lights.filter((l) => now - l.born < l.life);
    readGeometry(now);
    painter.draw({
      t: still() ? 0 : now / 1000,
      now,
      cells,
      width,
      height,
      lights,
      palette: palette(),
      origin: origin(),
    });
  };
  const resize = () => {
    const box = host.getBoundingClientRect();
    const dpr = painter.dpr();
    width = box.width;
    height = box.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const list: number[] = [];
    // A margin of a grid period and more round the edges, so the moving grid and the swaying hexagons leave no gaps.
    for (let y = -4 * R, row = 0; y < height + 4 * R; y += STEP_Y, row++)
      for (let x = -3 * R + ((row % 2) * STEP_X) / 2; x < width + 3 * R; x += STEP_X) list.push(x, y);
    cells = Float32Array.from(list);
    painter.resized(cells);
    geometryAt = 0;
    draw(performance.now());
  };
  const tick = (now: number) => {
    if (stopped) return;
    frame = requestAnimationFrame(tick);
    if (still() || !onScreen || document.hidden) return;
    if (options.wander && now >= nextWave) {
      nextWave = now + 10000 + Math.random() * 5000;
      const reach = Math.max(90, height * 0.6);
      const y = height * (0.3 + 0.45 * Math.random());
      lights = [
        ...lights,
        { x: -reach, y, reach, born: now, life: WAVE_MS, vx: (width + 2 * reach) / (WAVE_MS / 1000) },
      ];
    }
    // While the page scrolls, every frame, so the water keeps to the page.
    const gap = now < scrolling ? 0 : lights.length > 0 ? Math.min(painter.frameMs, 33) : painter.frameMs;
    if (now - last < gap) return;
    last = now;
    draw(now);
  };
  const intersection =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver((entries) => {
          onScreen = entries[entries.length - 1]?.isIntersecting ?? true;
        });
  intersection?.observe(host);
  const sizing = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
  if (sizing) sizing.observe(host);
  else window.addEventListener("resize", resize);
  const onScroll = () => {
    scrolling = performance.now() + 250;
  };
  if (options.origin) window.addEventListener("scroll", onScroll, { passive: true });
  const scheme = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
  const redraw = () => draw(performance.now());
  reduced?.addEventListener?.("change", redraw);
  scheme?.addEventListener?.("change", redraw);
  resize();
  frame = requestAnimationFrame(tick);
  canvas.dataset.renderer = mode;

  return {
    renderer: mode,
    light(x, y, reach) {
      if (still() || stopped) return;
      lights = [...lights, { x, y, reach, born: performance.now(), life: BURST_MS, vx: 0 }].slice(-MAX_LIGHTS);
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      intersection?.disconnect();
      sizing?.disconnect();
      if (!sizing) window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      reduced?.removeEventListener?.("change", redraw);
      scheme?.removeEventListener?.("change", redraw);
    },
  };
}
