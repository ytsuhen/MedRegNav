// Hexagon waves behind the masthead (DECISIONS U12): a field of small hexagons whose brightness follows slow, irregular
// ripples (two octaves of smooth value noise under slower drifting gusts), as in the header of the author's First Visit
// demo. An action casts a short light on the field: the hexagons around where it happened answer with a wave that turns
// from violet to teal, as a decision lights the hexagons around itself in the CQL demo's chat. Feedback only: the light
// carries no meaning.
// Drawn on the graphics card (WebGL2, one instanced draw call a frame), so the page stays free for the map. Without a
// real graphics card the same field goes on a 2D canvas at CSS resolution, and its frame rate backs off so that it
// takes about a tenth of the page's time. Idle while the masthead is off screen or the tab is hidden; one static frame
// and no light when reduced motion is requested.
// Adapted from ytsuhen/Pub-demos (first-visit), same author. The light after ytsuhen/cql-demo-yevenko (web/index.html,
// the chat's waves), same author.

/** Hexagon radius in CSS pixels; the grid steps of a pointy-top hexagon tiling. */
const R = 7;
const STEP_X = Math.sqrt(3) * R;
const STEP_Y = 1.5 * R;
const MAX_LIGHTS = 8;
/** How long one light lasts (ms). */
const LIGHT_MS = 1500;
/** The sea's wave and crest, and the iris pair of the sheen (styles.css: the dark scheme's values). */
const BASE = [7, 89, 74] as const;
const CREST = [63, 181, 154] as const;
const VIOLET = [177, 140, 255] as const;
const TEAL = [79, 227, 193] as const;
/**
 * Brightness of the field. Kept below First Visit's so that the masthead's text stays at contrast AA over the brightest
 * hexagon (the field alone reaches at most 0.52 × DIM opacity); a light, which lasts a moment, reaches LIGHT_ALPHA.
 */
const DIM = 0.62;
const LIGHT_ALPHA = 0.62;

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
}

/** A light at time `now`: its strength (0..1), the radius its ring has travelled, and its colour (violet → teal). */
function lightAt(l: Light, now: number): { power: number; ring: number; rgb: [number, number, number] } {
  const age = Math.min(1, (now - l.born) / LIGHT_MS);
  const power = age < 0.12 ? age / 0.12 : (1 - (age - 0.12) / 0.88) ** 1.6;
  const k = Math.min(1, Math.max(0, (age - 0.1) / 0.7));
  const s = k * k * (3 - 2 * k);
  const rgb: [number, number, number] = [0, 1, 2].map(
    (i) => (VIOLET[i] ?? 0) + ((TEAL[i] ?? 0) - (VIOLET[i] ?? 0)) * s,
  ) as [number, number, number];
  return { power, ring: l.reach * (0.15 + 1.25 * age), rgb };
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

interface Painter {
  dpr(): number;
  /** The least time between frames (ms); the 2D painter raises it when drawing gets slow. */
  frameMs: number;
  resized(cells: Float32Array): void;
  draw(t: number, now: number, cells: Float32Array, width: number, height: number, lights: Light[]): void;
}

const VS = `#version 300 es
precision highp float;
precision highp int;
in vec2 aCorner;
in vec2 aCell;
uniform vec2 uView;
uniform float uT;
uniform int uNL;
uniform vec4 uL[${MAX_LIGHTS}];
uniform vec4 uLC[${MAX_LIGHTS}];
uniform ivec4 uPerm[64];
uniform vec4 uVal[64];
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
  float x0 = aCell.x, y0 = aCell.y;
  float n1 = noise(vec3(x0 * 0.045, y0 * 0.045, uT * 0.2));
  float n2 = noise(vec3(x0 * 0.11 + 31.7, y0 * 0.11 - 12.3, uT * 0.33));
  float gust = 0.5 + 0.5 * noise(vec3(x0 * 0.007 + 5.1, y0 * 0.007 + 9.7, uT * 0.04));
  float lift = 0.5 + 0.5 * (0.65 * n1 + 0.35 * n2);
  float li = lift * (0.4 + 0.6 * gust);
  float g = lift < 0.7 ? 0.0 : (lift - 0.7) / 0.3;
  float glint = g * g * gust;
  float m = min(1.0, 0.1 + 0.42 * li + 0.4 * glint);
  vec2 c = vec2(x0 + 1.4 * n2, y0 + 1.4 * n1);
  vec3 rgb = vec3(${BASE.join(".0, ")}.0) + (vec3(${CREST.join(".0, ")}.0) - vec3(${BASE.join(".0, ")}.0)) * m;
  float a = (0.1 + 0.2 * li + 0.22 * glint) * ${DIM};
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uNL) break;
    vec4 L = uL[i];
    float d = distance(c, L.xy);
    float q = d / L.z;
    float r = (d - uLC[i].w) / (0.35 * L.z);
    float k = min(1.0, L.w * (0.45 * exp(-q * q * 1.3) + 0.55 * exp(-r * r)));
    rgb += (uLC[i].rgb - rgb) * k;
    a += (${LIGHT_ALPHA} - a) * k;
  }
  float size = 0.8 + 0.16 * li, tilt = 0.12 * n2;
  float cs = cos(tilt) * size, sn = sin(tilt) * size;
  vec2 pos = c + vec2(cs * aCorner.x - sn * aCorner.y, sn * aCorner.x + cs * aCorner.y);
  gl_Position = vec4(pos.x / uView.x * 2.0 - 1.0, 1.0 - pos.y / uView.y * 2.0, 0.0, 1.0);
  vColor = vec4(floor(rgb) / 255.0, clamp(a, 0.0, 1.0));
}`;

const FS = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 outColor;
void main() { outColor = vec4(vColor.rgb * vColor.a, vColor.a); }`;

/** The WebGL2 painter, or null without a real graphics card (a software WebGL would be slower than the 2D canvas). */
function webgl(canvas: HTMLCanvasElement, anyGl: boolean): Painter | null {
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
  let uniforms: Record<string, WebGLUniformLocation | null> = {};
  let cellBuffer: WebGLBuffer | null = null;
  let lost = false;
  let cellsNow: Float32Array = new Float32Array(0);
  const LA = new Float32Array(MAX_LIGHTS * 4);
  const LC = new Float32Array(MAX_LIGHTS * 4);
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
    uniforms = {};
    for (const n of ["uView", "uT", "uNL", "uL", "uLC", "uPerm", "uVal"])
      uniforms[n] = g.getUniformLocation(program, n);
    g.uniform4iv(uniforms.uPerm ?? null, Int32Array.from(PERM));
    g.uniform4fv(uniforms.uVal ?? null, VALUES);
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
    draw(t, now, cells, width, height, lights) {
      if (lost) return;
      g.viewport(0, 0, canvas.width, canvas.height);
      g.clear(g.COLOR_BUFFER_BIT);
      g.uniform2f(uniforms.uView ?? null, width, height);
      g.uniform1f(uniforms.uT ?? null, t);
      const n = Math.min(MAX_LIGHTS, lights.length);
      for (let i = 0; i < n; i++) {
        const l = lights[i] as Light;
        const { power, ring, rgb } = lightAt(l, now);
        LA.set([l.x, l.y, l.reach, power], 4 * i);
        LC.set([rgb[0], rgb[1], rgb[2], ring], 4 * i);
      }
      g.uniform1i(uniforms.uNL ?? null, n);
      if (n > 0) {
        g.uniform4fv(uniforms.uL ?? null, LA);
        g.uniform4fv(uniforms.uLC ?? null, LC);
      }
      g.drawArraysInstanced(g.TRIANGLE_FAN, 0, 6, cells.length / 2);
    },
  };
}

/** The same field on a 2D canvas, at CSS resolution. */
function canvas2d(canvas: HTMLCanvasElement): Painter | null {
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
    resized() {},
    draw(t, now, cells, _width, _height, lights) {
      const t0 = performance.now();
      const lit = lights.map((l) => ({ l, ...lightAt(l, now) }));
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < cells.length; i += 2) {
        const x0 = cells[i] ?? 0;
        const y0 = cells[i + 1] ?? 0;
        const n1 = noise(x0 * 0.045, y0 * 0.045, t * 0.2);
        const n2 = noise(x0 * 0.11 + 31.7, y0 * 0.11 - 12.3, t * 0.33);
        const gust = 0.5 + 0.5 * noise(x0 * 0.007 + 5.1, y0 * 0.007 + 9.7, t * 0.04);
        const lift = 0.5 + 0.5 * (0.65 * n1 + 0.35 * n2);
        const li = lift * (0.4 + 0.6 * gust);
        const glint = (lift < 0.7 ? 0 : ((lift - 0.7) / 0.3) ** 2) * gust;
        const m = Math.min(1, 0.1 + 0.42 * li + 0.4 * glint);
        const x = x0 + 1.4 * n2;
        const y = y0 + 1.4 * n1;
        let r = BASE[0] + (CREST[0] - BASE[0]) * m;
        let g = BASE[1] + (CREST[1] - BASE[1]) * m;
        let b = BASE[2] + (CREST[2] - BASE[2]) * m;
        let a = (0.1 + 0.2 * li + 0.22 * glint) * DIM;
        for (const { l, power, ring, rgb } of lit) {
          const d = Math.hypot(x - l.x, y - l.y);
          const q = d / l.reach;
          const w = (d - ring) / (0.35 * l.reach);
          const k = Math.min(1, power * (0.45 * Math.exp(-q * q * 1.3) + 0.55 * Math.exp(-w * w)));
          if (k < 0.004) continue;
          r += (rgb[0] - r) * k;
          g += (rgb[1] - g) * k;
          b += (rgb[2] - b) * k;
          a += (LIGHT_ALPHA - a) * k;
        }
        const size = 0.8 + 0.16 * li;
        const tilt = 0.12 * n2;
        const cos = Math.cos(tilt) * size;
        const sin = Math.sin(tilt) * size;
        c.setTransform(cos, sin, -sin, cos, x, y);
        c.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a.toFixed(3)})`;
        c.fill(hex);
      }
      // Painting is most of the cost: keep the waves near a tenth of the page's time.
      this.frameMs = Math.min(400, Math.max(50, (performance.now() - t0) * 10));
    },
  };
}

/**
 * Starts the waves on `canvas`, sized to `host`. `mode` "webgl2" may fail (null): a canvas once asked for WebGL cannot
 * draw in 2D, so the caller then starts "2d" on a fresh canvas.
 */
export function startWaves(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  mode: Renderer,
  options: { anyGl?: boolean } = {},
): Waves | null {
  const painter = mode === "webgl2" ? webgl(canvas, options.anyGl ?? false) : canvas2d(canvas);
  if (!painter) return null;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
  const still = () => reduced?.matches ?? false;
  let width = 0;
  let height = 0;
  let cells = new Float32Array(0);
  let lights: Light[] = [];
  let onScreen = true;
  let frame = 0;
  let last = 0;
  let stopped = false;

  const draw = (now: number) => {
    if (!width || !height) return;
    lights = lights.filter((l) => now - l.born < LIGHT_MS);
    painter.draw(still() ? 0 : now / 1000, now, cells, width, height, lights);
  };
  const resize = () => {
    const box = host.getBoundingClientRect();
    const dpr = painter.dpr();
    width = box.width;
    height = box.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const list: number[] = [];
    // A margin round the edges, so swaying hexagons never leave gaps there.
    for (let y = -2 * R, row = 0; y < height + 2 * R; y += STEP_Y, row++)
      for (let x = -2 * R + ((row % 2) * STEP_X) / 2; x < width + 2 * R; x += STEP_X) list.push(x, y);
    cells = Float32Array.from(list);
    painter.resized(cells);
    draw(performance.now());
  };
  const tick = (now: number) => {
    if (stopped) return;
    frame = requestAnimationFrame(tick);
    if (still() || !onScreen || document.hidden) return;
    if (now - last < (lights.length > 0 ? Math.min(painter.frameMs, 33) : painter.frameMs)) return;
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
  const onReduced = () => draw(performance.now());
  reduced?.addEventListener?.("change", onReduced);
  resize();
  frame = requestAnimationFrame(tick);
  canvas.dataset.renderer = mode;

  return {
    renderer: mode,
    light(x, y, reach) {
      if (still() || stopped) return;
      lights = [...lights, { x, y, reach, born: performance.now() }].slice(-MAX_LIGHTS);
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      intersection?.disconnect();
      sizing?.disconnect();
      if (!sizing) window.removeEventListener("resize", resize);
      reduced?.removeEventListener?.("change", onReduced);
    },
  };
}
