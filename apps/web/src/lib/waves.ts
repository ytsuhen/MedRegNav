// Hexagon waves (DECISIONS U12): fields of small hexagons whose brightness follows ripples of smooth value noise under
// slower drifting gusts, as in the author's First Visit and CQL demos. Two kinds of water:
// - the sea under everything below the masthead: calm, light and shallow in the light scheme, deep in the dark one. It
//   turns only right round the device in the middle of the map, in a slow whirlpool, and the lines from the device to
//   the branches, and on, fainter, from the open branch to its requirements, twinkle softly where they lie: here and
//   there a few hexagons along a line take a pigeon's colours, a magenta violet or a green, and fade, nothing running
//   along. The water scrolls with the page;
// - the river behind the masthead: slow ripples drawn out along a current that carries them left to right, sprinkled
//   here and there, away from the text, with a pigeon hexagon whose colour shifts very slowly.
// An action casts a short light on the field around where it happened, as a decision lights the hexagons round itself
// in the CQL demo's chat. Lights, the lines' twinkle and sprinkles are feedback and ornament: they carry no meaning.
// Drawn on the graphics card (WebGL2, one instanced draw call a frame). Without a real graphics card the river goes on
// a 2D canvas whose frame rate backs off to a tenth of the page's time, and the sea is drawn once and stands still.
// Idle while off screen or in a hidden tab; one static frame and no light when reduced motion is requested.
// Adapted from ytsuhen/Pub-demos (first-visit), same author. The light after ytsuhen/cql-demo-yevenko (web/index.html,
// the chat's waves), same author.

/** Hexagon radius in CSS pixels; the grid steps of a pointy-top hexagon tiling. */
const R = 7;
const STEP_X = Math.sqrt(3) * R;
const STEP_Y = 1.5 * R;
/** The most lights a frame draws: the bursts of actions and the river's sprinkles (the lines' twinkle has its map). */
const MAX_LIGHTS = 16;
/** How long a light cast by an action lasts (ms). */
const BURST_MS = 1500;
/** The whirlpool turns once in 45 s and fades out over a ring this wide beyond the device's corners (px). */
const WHIRL_SPEED = (2 * Math.PI) / 45;
const WHIRL_EDGE = 80;
/**
 * The lines' twinkle: about this far either side of a line (px); a hexagon's spark, a noise this fine (per px) changing
 * this fast (per s), lit where it passes these levels. A lit hexagon takes the pigeon's own colour; how soft the
 * twinkle is lies in how rare its sparks are and how opaque: at most this far toward the pigeon's opacity. A line to
 * requirements has this strength: toward that much of the opacity, its sparks beginning higher by the rest of it
 * times TWINKLE_RARER, so fewer.
 */
const WAVE_HALF = 15;
const TWINKLE_SCALE = 0.09;
const TWINKLE_RATE = 0.25;
const TWINKLE_LEVELS = [0.6, 0.86] as const;
const TWINKLE_STRENGTH = 0.6;
const TWINKLE_RARER = 0.25;
const WAVE_ONWARD = 0.8;
/** The most lines that twinkle (six to the branches, the rest on to requirements) and the cell of their map (px). */
const MAX_LINES = 32;
const WAVE_CELL = 4;
/** How far along a line the wave map keeps (px): four to a step of its green channel. */
const WAVE_REACH = 1020;
/** A pigeon sprinkle on the river: a new one every 1.6–2.8 s, each shifting its colour for 10–14 s (ms). */
const SPRINKLE_EVERY = [1600, 2800] as const;
const SPRINKLE_LIFE = [10000, 14000] as const;

type RGB = readonly [number, number, number];

/** Colours of a field: the water's wave and crest, its brightness, the sheen's pair and the pigeon's. */
export interface Palette {
  base: RGB;
  crest: RGB;
  /**
   * Kept below First Visit's so that what is drawn over the water keeps its contrast: a field alone reaches at most
   * 0.52 × dim opacity; a light, which lasts a moment, reaches lightAlpha.
   */
  dim: number;
  lightAlpha: number;
  /** The lights of actions turn from violet to teal, as the sheen on what was pressed does. */
  violet: RGB;
  teal: RGB;
  /**
   * A pigeon's neck for the lines' twinkle and sprinkles: a magenta violet and a green, and how opaque the twinkle gets
   * (soft; a sprinkle, which keeps off the text, goes nearly opaque).
   */
  pigeon: readonly [RGB, RGB];
  pigeonAlpha: number;
  /** Which water it is, for tests (the canvas's `data-water`). */
  name: string;
}

/** The deep sea (the CQL demo's): the masthead's river in both schemes; as DEEP_SEA, the page's sea in the dark one. */
export const DEEP: Palette = {
  base: [7, 89, 74],
  crest: [63, 181, 154],
  dim: 0.62,
  lightAlpha: 0.62,
  violet: [177, 140, 255],
  teal: [79, 227, 193],
  pigeon: [
    [205, 118, 255],
    [96, 232, 146],
  ],
  pigeonAlpha: 0.4,
  name: "deep",
};

/**
 * The page's sea in the dark scheme: the deep water, its lines twinkling in a violet with more red in it than the
 * river's sprinkles, since the dark teal page under a faint violet pulls it towards blue.
 */
export const DEEP_SEA: Palette = { ...DEEP, pigeon: [[226, 104, 255], DEEP.pigeon[1]] };

/** Shallow water on the light page: pale teal hexagons over the paper, quieter than the deep sea. */
export const SHALLOW: Palette = {
  base: [207, 226, 220],
  crest: [146, 202, 186],
  dim: 0.85,
  lightAlpha: 0.55,
  violet: [124, 58, 237],
  teal: [14, 159, 132],
  pigeon: [
    [136, 44, 214],
    [8, 128, 66],
  ],
  pigeonAlpha: 0.45,
  name: "shallow",
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
  // A calm lake: irregular ripples that slowly appear and melt away (First Visit, the CQL chat), calmer still.
  sea: {
    one: { sx: 0.045, sy: 0.045, drift: 0, change: 0.11 },
    two: { sx: 0.11, sy: 0.11, drift: 0, change: 0.18 },
    gust: { sx: 0.007, sy: 0.007, drift: 0, change: 0.03 },
    mix: 0.65,
    glint: 0.72,
    sway: [1.4, 1.4],
    tilt: 0.12,
  },
  // A slow river: ripples drawn out along a current that carries them left to right (about 12–14 px a second).
  river: {
    one: { sx: 0.03, sy: 0.08, drift: 0.36, change: 0.12 },
    two: { sx: 0.08, sy: 0.15, drift: 1.1, change: 0.22 },
    gust: { sx: 0.006, sy: 0.02, drift: 0.04, change: 0.03 },
    mix: 0.55,
    glint: 0.66,
    sway: [1.8, 0.8],
    tilt: 0.14,
  },
};

/** The map seen from the water, in page coordinates. */
export interface Geometry {
  /** The device the whirlpool turns round: its centre and half-diagonal. */
  whirl: { x: number; y: number; r: number } | null;
  /**
   * The lines that twinkle, as x, y pairs outwards: first those from the device, then those that carry one of
   * them on (`from`: its index), from a branch to its requirements.
   */
  lines: { points: number[]; from?: number }[];
}

export type Renderer = "webgl2" | "2d";

export interface Waves {
  renderer: Renderer;
  /** Light the field around a point of the canvas (CSS px); `reach` is the light's radius. */
  light(x: number, y: number, reach: number): void;
  stop(): void;
}

interface Light {
  /** A burst answers an action; a sprinkle is a pigeon hexagon on the river. */
  kind: "burst" | "sprinkle";
  x: number;
  y: number;
  reach: number;
  born: number;
  life: number;
}

/** A light as one frame draws it: where, how far, how strong (0..1), its ring's radius, its colour and opacity. */
interface Glow {
  x: number;
  y: number;
  reach: number;
  power: number;
  ring: number;
  rgb: RGB;
  alpha: number;
}

const mixRgb = (a: RGB, b: RGB, k: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

const smoothstep = (e0: number, e1: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
};

/**
 * A light at time `now`. A burst flares and turns from violet to teal as its ring spreads. A sprinkle is one hexagon that
 * swells and fades over many seconds: magenta violet, then for a while at its brightest green, then violet again.
 */
function glowOf(l: Light, now: number, p: Palette): Glow {
  const age = Math.min(1, (now - l.born) / l.life);
  if (l.kind === "sprinkle") {
    const green = smoothstep(0.3, 0.45, age) - smoothstep(0.55, 0.7, age);
    // Full strength for most of its life, nearly opaque: a jewel of a hexagon (it keeps off the text).
    return {
      x: l.x,
      y: l.y,
      reach: l.reach,
      power: Math.min(1, Math.sin(Math.PI * age) ** 0.6 * 1.3),
      ring: 0,
      rgb: mixRgb(p.pigeon[0], p.pigeon[1], green),
      alpha: Math.min(1, p.pigeonAlpha + 0.55),
    };
  }
  const power = age < 0.12 ? age / 0.12 : (1 - (age - 0.12) / 0.88) ** 1.6;
  const k = smoothstep(0.1, 0.8, age);
  return {
    x: l.x,
    y: l.y,
    reach: l.reach,
    power,
    ring: l.reach * (0.15 + 1.25 * age),
    rgb: mixRgb(p.violet, p.teal, k),
    alpha: p.lightAlpha,
  };
}

/** The lines that twinkle, as a small RGBA map over their bounding box, and per line its length and strength. */
interface WaveMap {
  rect: [number, number, number, number];
  cols: number;
  rows: number;
  data: Uint8Array;
  lines: { length: number; strength: number }[];
}

/**
 * Per cell: how near the nearest line is (red: 1 on it, fading over WAVE_HALF), how far along that line (green: px / 4,
 * up to WAVE_REACH) and which line (blue: its index × 8). Per line: its length (the twinkle fades in from its start and
 * out before its end) and strength: full on a line from the device, fainter on one that carries another on, from a
 * branch to its requirements.
 */
export function waveMap(lines: Geometry["lines"]): WaveMap | null {
  const kept = lines.slice(0, MAX_LINES);
  const shown = kept.map((l) => (l.points.length >= 4 ? l.points : []));
  if (!shown.some((p) => p.length > 0)) return null;
  const along = shown.map((pts) => {
    const out = [0];
    for (let i = 2; i + 1 < pts.length; i += 2)
      out.push(
        (out[out.length - 1] ?? 0) +
          Math.hypot((pts[i] ?? 0) - (pts[i - 2] ?? 0), (pts[i + 1] ?? 0) - (pts[i - 1] ?? 0)),
      );
    return out;
  });
  const info = kept.map((l, i) => {
    const steps = along[i] ?? [0];
    const onward = l.from !== undefined && l.from < i;
    return { length: steps[steps.length - 1] ?? 0, strength: onward ? WAVE_ONWARD : 1 };
  });
  const reach = 2 * WAVE_HALF;
  const boxes = shown.map((pts) => {
    if (pts.length === 0) return [0, 0, -1, -1];
    const xs = pts.filter((_, i) => i % 2 === 0);
    const ys = pts.filter((_, i) => i % 2 === 1);
    return [Math.min(...xs) - reach, Math.min(...ys) - reach, Math.max(...xs) + reach, Math.max(...ys) + reach];
  });
  const real = boxes.filter((b) => (b[2] ?? 0) >= (b[0] ?? 0));
  const x0 = Math.min(...real.map((b) => b[0] ?? 0));
  const y0 = Math.min(...real.map((b) => b[1] ?? 0));
  const x1 = Math.max(...real.map((b) => b[2] ?? 0));
  const y1 = Math.max(...real.map((b) => b[3] ?? 0));
  const cell = Math.max(WAVE_CELL, (x1 - x0) / 512, (y1 - y0) / 512);
  const cols = Math.max(2, Math.ceil((x1 - x0) / cell));
  const rows = Math.max(2, Math.ceil((y1 - y0) / cell));
  const data = new Uint8Array(cols * rows * 4);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const px = x0 + (c + 0.5) * cell;
      const py = y0 + (r + 0.5) * cell;
      let best = reach * reach;
      let s = 0;
      let which = -1;
      shown.forEach((pts, li) => {
        const b = boxes[li] ?? [0, 0, 0, 0];
        if (px < (b[0] ?? 0) || px > (b[2] ?? 0) || py < (b[1] ?? 0) || py > (b[3] ?? 0)) return;
        for (let i = 2; i + 1 < pts.length; i += 2) {
          const [ax, ay] = [pts[i - 2] ?? 0, pts[i - 1] ?? 0];
          const [vx, vy] = [(pts[i] ?? 0) - ax, (pts[i + 1] ?? 0) - ay];
          const len2 = vx * vx + vy * vy || 1;
          const k = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
          const d2 = (px - ax - k * vx) ** 2 + (py - ay - k * vy) ** 2;
          if (d2 < best) {
            best = d2;
            s = (along[li]?.[i / 2 - 1] ?? 0) + k * Math.sqrt(len2);
            which = li;
          }
        }
      });
      if (which < 0) continue;
      const o = (r * cols + c) * 4;
      data[o] = Math.round(Math.exp(-best / (WAVE_HALF * WAVE_HALF)) * 255);
      data[o + 1] = Math.min(255, Math.round(s / 4));
      data[o + 2] = which * 8;
      data[o + 3] = 255;
    }
  return { rect: [x0, y0, cols * cell, rows * cell], cols, rows, data, lines: info };
}

/** How far every point of `next` moved from the same point of `before`, if all moved alike (a drag of the map). */
export function movedBy(before: Geometry["lines"], next: Geometry["lines"]): [number, number] | null {
  if (before.length !== next.length || before.length === 0) return null;
  const [dx, dy] = [
    (next[0]?.points[0] ?? 0) - (before[0]?.points[0] ?? 0),
    (next[0]?.points[1] ?? 0) - (before[0]?.points[1] ?? 0),
  ];
  for (let l = 0; l < next.length; l++) {
    const [a, b] = [before[l], next[l]];
    if (!a || !b || a.from !== b.from || a.points.length !== b.points.length) return null;
    for (let i = 0; i + 1 < b.points.length; i += 2)
      if (
        Math.abs((b.points[i] ?? 0) - (a.points[i] ?? 0) - dx) > 0.5 ||
        Math.abs((b.points[i + 1] ?? 0) - (a.points[i + 1] ?? 0) - dy) > 0.5
      )
        return null;
  }
  return [dx, dy];
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

/** The water at a point of the page and a time (without the whirlpool and the lines' twinkle: the 2D painter's). */
function waterAt(m: Motion, px: number, py: number, t: number) {
  const n1 = noise(px * m.one.sx - t * m.one.drift, py * m.one.sy, t * m.one.change);
  const n2 = noise(px * m.two.sx - t * m.two.drift + 31.7, py * m.two.sy - 12.3, t * m.two.change);
  const gust = 0.5 + 0.5 * noise(px * m.gust.sx - t * m.gust.drift + 5.1, py * m.gust.sy + 9.7, t * m.gust.change);
  const lift = 0.5 + 0.5 * (m.mix * n1 + (1 - m.mix) * n2);
  const li = lift * (0.4 + 0.6 * gust);
  const glint = (lift < m.glint ? 0 : ((lift - m.glint) / (1 - m.glint)) ** 2) * gust;
  return { n1, n2, li, glint };
}

interface Frame {
  t: number;
  cells: Float32Array;
  width: number;
  height: number;
  glows: readonly Glow[];
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
  /** The map moved (the sea in WebGL2 only). */
  geometry?(g: Geometry): void;
}

/** A number as a GLSL float literal. */
const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/** Uniform vectors the vertex shader needs, with room to spare: lights (3 each), noise tables, wave lines, the rest. */
const UNIFORM_VECTORS = 3 * MAX_LIGHTS + 128 + MAX_LINES + 24;

/** The vertex shader: the water of `waterAt` (with the whirlpool and the lines' twinkle for a map), the lights. */
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
uniform int uNL;
uniform vec4 uL[${MAX_LIGHTS}];
uniform vec4 uLC[${MAX_LIGHTS}];
uniform float uLA[${MAX_LIGHTS}];
uniform ivec4 uPerm[64];
uniform vec4 uVal[64];
${
  map
    ? `uniform vec4 uWhirl;
uniform vec4 uWaveRect;
uniform float uWaveOn;
uniform vec2 uWaveLine[${MAX_LINES}];
uniform sampler2D uWave;
uniform vec3 uPigeonA;
uniform vec3 uPigeonB;
uniform float uPigeonAlpha;`
    : ""
}
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
  float n2 = noise(${octave(m.two, "P", " + 31.7", " - 12.3")});
  float spiral = 0.0;
${
  map
    ? `  // The map's lines, from their map: how near, how far along the path from the device, which line.
  float near = 0.0;
  float own = 0.0;
  int line = 0;
  vec2 uv = (P - uWaveRect.xy) / uWaveRect.zw;
  if (uWaveOn > 0.5 && uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0) {
    vec4 W = texture(uWave, uv);
    near = W.r;
    own = W.g * ${f(WAVE_REACH)};
    line = clamp(int(W.b * 255.0 / 8.0 + 0.5), 0, ${MAX_LINES - 1});
  }
  // A calm whirlpool right round the device and nowhere else: the water there turns as one, fading out over a ring
  // ${WHIRL_EDGE} px wide beyond the device's corners into the still sea, and quieter by the lines, where they twinkle.
  vec2 d = P - uWhirl.xy;
  float r = length(d);
  float s = uWhirl.w * (1.0 - smoothstep(uWhirl.z, uWhirl.z + ${f(WHIRL_EDGE)}, r)) * (1.0 - 0.7 * near);
  if (s > 0.002) {
    float ang = uT * ${f(WHIRL_SPEED)};
    vec2 Q = uWhirl.xy + vec2(cos(ang) * d.x - sin(ang) * d.y, sin(ang) * d.x + cos(ang) * d.y);
    n1 = mix(n1, noise(${octave(m.one, "Q", "", "")}), s);
    n2 = mix(n2, noise(${octave(m.two, "Q", " + 31.7", " - 12.3")}), s);
    spiral = 0.08 * s * cos(2.0 * atan(d.y, d.x) - 2.2 * log(1.0 + r / 24.0) + 1.5 * ang);
  }`
    : ""
}
  float gust = 0.5 + 0.5 * noise(${octave(m.gust, "P", " + 5.1", " + 9.7")});
  float lift = 0.5 + 0.5 * (${f(m.mix)} * n1 + ${f(1 - m.mix)} * n2) + spiral;
  float li = lift * (0.4 + 0.6 * gust);
  float g = lift < ${f(m.glint)} ? 0.0 : (lift - ${f(m.glint)}) / ${f(1 - m.glint)};
  float glint = g * g * gust;
  float mx = min(1.0, 0.1 + 0.42 * li + 0.4 * glint);
  vec2 c = vec2(cell.x + ${f(m.sway[0])} * n2, cell.y + ${f(m.sway[1])} * n1);
  vec3 rgb = uBase + (uCrest - uBase) * mx;
  float a = (0.1 + 0.2 * li + 0.22 * glint) * uDim;
${
  map
    ? `  // The lines twinkle where they lie, all along them and nothing running: a hexagon by a line now and then
  // takes the pigeon's violet or green and fades over a few seconds. The pigeon's own colours as soon as it is lit;
  // soft in how rare the sparks are and how opaque, softer still on the lines to requirements: a glimmer, not a flash.
  if (near > 0.02) {
    vec2 Ln = uWaveLine[line];
    float spark = 0.5 + 0.5 * noise(vec3(P.x * ${f(TWINKLE_SCALE)} + float(line) * 7.3, P.y * ${f(TWINKLE_SCALE)}, uT * ${f(TWINKLE_RATE)}));
    // In from the line's start, out before its end; the map keeps the way along a line up to ${WAVE_REACH} px.
    float ends = smoothstep(0.0, 12.0, own) * (1.0 - smoothstep(Ln.x - 16.0, Ln.x, own));
    float lit = smoothstep(${f(TWINKLE_LEVELS[0])} + ${f(TWINKLE_RARER)} * (1.0 - Ln.y), ${f(TWINKLE_LEVELS[1])}, spark) * ends * step(own, ${f(WAVE_REACH - 6)}) * smoothstep(0.1, 0.7, near);
    // Violet or green, one or the other: halfway between the two is a muddy blue-grey (the noise mostly sits near 0).
    float hue = smoothstep(-0.06, 0.06, noise(vec3(P.x * 0.05 + 11.0, P.y * 0.05, uT * 0.12)));
    rgb += (mix(uPigeonA, uPigeonB, hue) - rgb) * smoothstep(0.0, 0.3, lit);
    a += max(0.0, uPigeonAlpha * Ln.y - a) * ${f(TWINKLE_STRENGTH)} * lit;
  }`
    : ""
}
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uNL) break;
    vec4 L = uL[i];
    float dl = distance(c, L.xy);
    float q = dl / L.z;
    float rr = (dl - uLC[i].w) / (0.35 * L.z);
    float k = min(1.0, L.w * (0.45 * exp(-q * q * 1.3) + 0.55 * exp(-rr * rr)));
    rgb += (uLC[i].rgb - rgb) * k;
    a += (uLA[i] - a) * k;
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
  "uNL",
  "uL",
  "uLC",
  "uLA",
  "uPerm",
  "uVal",
  "uWhirl",
  "uWaveRect",
  "uWaveOn",
  "uWaveLine",
  "uWave",
  "uPigeonA",
  "uPigeonB",
  "uPigeonAlpha",
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
  // WebGL2 promises 256 vertex uniform vectors; fewer, and the 2D painter takes over.
  if (Number(g.getParameter(g.MAX_VERTEX_UNIFORM_VECTORS)) < UNIFORM_VECTORS) return null;
  const VS = vertexShader(motion, map);
  const u: Partial<Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>> = {};
  let cellBuffer: WebGLBuffer | null = null;
  let waveTexture: WebGLTexture | null = null;
  let waves: WaveMap | null = null;
  let drawn: Geometry["lines"] = [];
  let whirl: Geometry["whirl"] = null;
  let lost = false;
  let cellsNow: Float32Array = new Float32Array(0);
  const LA = new Float32Array(MAX_LIGHTS * 4);
  const LC = new Float32Array(MAX_LIGHTS * 4);
  const LO = new Float32Array(MAX_LIGHTS);
  const waveLines = new Float32Array(MAX_LINES * 2);
  const uploadWaves = () => {
    if (!map) return;
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, waveTexture);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    const empty = new Uint8Array([0, 0, 0, 255]);
    g.texImage2D(
      g.TEXTURE_2D,
      0,
      g.RGBA,
      waves?.cols ?? 1,
      waves?.rows ?? 1,
      0,
      g.RGBA,
      g.UNSIGNED_BYTE,
      waves?.data ?? empty,
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
      waveTexture = g.createTexture();
      g.bindTexture(g.TEXTURE_2D, waveTexture);
      // Nearest: a cell's line index must not blend with its neighbour's.
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      g.uniform1i(u.uWave ?? null, 0);
      uploadWaves();
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
      // Dragged as a whole (every point moved alike): the map of the lines moves with it, nothing to build again.
      const shift = waves ? movedBy(drawn, next.lines) : null;
      drawn = next.lines;
      if (waves && shift) {
        waves.rect[0] += shift[0];
        waves.rect[1] += shift[1];
        return;
      }
      waves = waveMap(next.lines);
      waveLines.fill(0);
      waves?.lines.forEach((l, i) => {
        waveLines.set([l.length, l.strength], 2 * i);
      });
      if (!lost) uploadWaves();
    },
    draw({ t, cells, width, height, glows, palette, origin }) {
      if (lost) return;
      g.viewport(0, 0, canvas.width, canvas.height);
      g.clear(g.COLOR_BUFFER_BIT);
      g.uniform2f(u.uView ?? null, width, height);
      g.uniform2f(u.uOrigin ?? null, origin.x, origin.y);
      g.uniform1f(u.uT ?? null, t);
      g.uniform3f(u.uBase ?? null, ...palette.base);
      g.uniform3f(u.uCrest ?? null, ...palette.crest);
      g.uniform1f(u.uDim ?? null, palette.dim);
      if (map) {
        g.uniform4f(u.uWhirl ?? null, whirl?.x ?? 0, whirl?.y ?? 0, Math.max(1, whirl?.r ?? 1), whirl ? 1 : 0);
        const rect = waves?.rect ?? [0, 0, 1, 1];
        g.uniform4f(u.uWaveRect ?? null, rect[0], rect[1], rect[2], rect[3]);
        // Still water does not twinkle (reduced motion, or the first frame before the clock runs).
        g.uniform1f(u.uWaveOn ?? null, waves && t > 0 ? 1 : 0);
        g.uniform2fv(u.uWaveLine ?? null, waveLines);
        g.uniform3f(u.uPigeonA ?? null, ...palette.pigeon[0]);
        g.uniform3f(u.uPigeonB ?? null, ...palette.pigeon[1]);
        g.uniform1f(u.uPigeonAlpha ?? null, palette.pigeonAlpha);
        g.activeTexture(g.TEXTURE0);
        g.bindTexture(g.TEXTURE_2D, waveTexture);
      }
      const n = Math.min(MAX_LIGHTS, glows.length);
      for (let i = 0; i < n; i++) {
        const l = glows[i] as Glow;
        LA.set([l.x, l.y, l.reach, l.power], 4 * i);
        LC.set([l.rgb[0], l.rgb[1], l.rgb[2], l.ring], 4 * i);
        LO[i] = l.alpha;
      }
      g.uniform1i(u.uNL ?? null, n);
      if (n > 0) {
        g.uniform4fv(u.uL ?? null, LA);
        g.uniform4fv(u.uLC ?? null, LC);
        g.uniform1fv(u.uLA ?? null, LO);
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
    draw({ t, cells, glows, palette, origin }) {
      const t0 = performance.now();
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
        for (const l of glows) {
          const d = Math.hypot(x - l.x, y - l.y);
          const q = d / l.reach;
          const w = (d - l.ring) / (0.35 * l.reach);
          const k = Math.min(1, l.power * (0.45 * Math.exp(-q * q * 1.3) + 0.55 * Math.exp(-w * w)));
          if (k < 0.004) continue;
          r += (l.rgb[0] - r) * k;
          g += (l.rgb[1] - g) * k;
          b += (l.rgb[2] - b) * k;
          a += (l.alpha - a) * k;
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

/** A rectangle of the canvas: left, top, right, bottom (CSS px). */
export type Box = readonly [number, number, number, number];

export interface WavesOptions {
  water?: WaterKind;
  /** The colours, read at each frame (the sea follows the colour scheme). */
  palette?: () => Palette;
  /** The canvas's top-left corner in page coordinates, so the water scrolls with the page (default: it does not). */
  origin?: () => { x: number; y: number };
  /** The map seen from the water (the sea): a whirlpool round the device, the twinkle along the map's lines. */
  geometry?: () => Geometry;
  /** A cheap mark of where the map is, read each frame: when it changes, the geometry is read again at once. */
  geometryKey?: () => string;
  /** Pigeon hexagons here and there, shifting their colour slowly (the river)… */
  sprinkles?: boolean;
  /** …but not under these parts of the canvas (its text). */
  avoid?: () => readonly Box[];
  /** Without a graphics card: animate (the river) or draw once and stand still (the sea). */
  animate2d?: boolean;
  /** Allow a software WebGL (tests). */
  anyGl?: boolean;
  /** Without a graphics card, the part of the page's time the field may take. */
  share?: number;
}

const between = ([low, high]: readonly [number, number]) => low + Math.random() * (high - low);

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
  let nextSprinkle = performance.now() + 800;
  let geometryAt = 0;
  let geometryMark = "";
  let geometryRead = "";

  const readGeometry = (now: number) => {
    if (!map || !options.geometry) return;
    // At once when the map has moved (dragged, zoomed, laid out again), else now and then.
    const mark = options.geometryKey?.() ?? "";
    if (mark === geometryMark && now - geometryAt < 400) return;
    geometryMark = mark;
    geometryAt = now;
    const g = options.geometry();
    const key = [
      ...(g.whirl ? [g.whirl.x, g.whirl.y, g.whirl.r] : [-1]),
      ...g.lines.flatMap((l) => [l.from ?? -1, ...l.points]),
    ]
      .map(Math.round)
      .join();
    if (key === geometryRead) return;
    geometryRead = key;
    painter.geometry?.(g);
    // For tests: where the whirlpool turns (page px: centre and radius) and how many lines twinkle.
    canvas.dataset.whirlpool = g.whirl ? [g.whirl.x, g.whirl.y, g.whirl.r].map(Math.round).join(" ") : "off";
    // …from the device, and on from the open branch.
    const kept = g.lines.slice(0, MAX_LINES);
    canvas.dataset.wavelines = `${kept.filter((l) => l.from === undefined).length} ${kept.filter((l) => l.from !== undefined).length}`;
  };
  const draw = (now: number) => {
    if (!width || !height) return;
    const moving = !still();
    // Still water keeps no light: a burst or a sprinkle would stay frozen on it.
    lights = moving ? lights.filter((l) => now - l.born < l.life) : [];
    readGeometry(now);
    const colours = palette();
    // The actions' bursts first, then the sprinkles: as many as a frame can draw.
    const glows = [
      ...lights.filter((l) => l.kind === "burst").map((l) => glowOf(l, now, colours)),
      ...lights.filter((l) => l.kind === "sprinkle").map((l) => glowOf(l, now, colours)),
    ].slice(0, MAX_LIGHTS);
    painter.draw({ t: moving ? now / 1000 : 0, cells, width, height, glows, palette: colours, origin: origin() });
    if (canvas.dataset.water !== colours.name) canvas.dataset.water = colours.name;
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
  const sprinkle = (now: number) => {
    nextSprinkle = now + between(SPRINKLE_EVERY);
    // Room for the bursts of actions within a frame's lights.
    if (lights.filter((l) => l.kind === "sprinkle").length >= MAX_LIGHTS - 9) return;
    const avoid = options.avoid?.() ?? [];
    // On a hexagon of the field, away from its edges and from the text; a few tries, else none this time.
    for (let attempt = 0; attempt < 6; attempt++) {
      const i = Math.floor(Math.random() * (cells.length / 2));
      const [x, y] = [cells[2 * i] ?? -1, cells[2 * i + 1] ?? -1];
      if (x < R || x > width - R || y < R || y > height - R) continue;
      if (avoid.some(([l, t, r, b]) => x > l - R && x < r + R && y > t - R && y < b + R)) continue;
      lights = [...lights, { kind: "sprinkle", x, y, reach: 8, born: now, life: between(SPRINKLE_LIFE) }];
      return;
    }
  };
  const tick = (now: number) => {
    if (stopped) return;
    frame = requestAnimationFrame(tick);
    if (still() || !onScreen || document.hidden) return;
    if (options.sprinkles && now >= nextSprinkle) sprinkle(now);
    // While the page scrolls, every frame, so the water keeps to the page; a burst, at full pace while it lasts.
    const burst = lights.some((l) => l.kind === "burst");
    const gap = now < scrolling ? 0 : burst ? Math.min(painter.frameMs, 33) : painter.frameMs;
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
  // The page's own light or dark switch (data-theme on the root) redraws the water as the system's does.
  const themed = typeof MutationObserver === "undefined" ? null : new MutationObserver(redraw);
  themed?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  resize();
  frame = requestAnimationFrame(tick);
  canvas.dataset.renderer = mode;

  return {
    renderer: mode,
    light(x, y, reach) {
      if (still() || stopped) return;
      const burst: Light = { kind: "burst", x, y, reach, born: performance.now(), life: BURST_MS };
      const bursts = [...lights.filter((l) => l.kind === "burst"), burst].slice(-8);
      lights = [...bursts, ...lights.filter((l) => l.kind === "sprinkle")];
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
      themed?.disconnect();
    },
  };
}
