// The hexagon waves (lib/waves.ts) and their answer to actions (lib/sheen.ts):
// - the river behind the masthead, with a pigeon wave now and then; a control pressed in the masthead lights it;
// - the sea under the work area, behind everything below the masthead: a canvas the height of the window that stays in
//   view while the page scrolls, its water fixed to the page. It reads the map from the page now and then — the device
//   it whirls round (`data-whirl`) and the lines it flows along (`path[data-flow]`) — so it follows the automatic
//   layout. A press anywhere in the work area lights the water round it.
// WebGL2 first; if the graphics card is missing or software-only, a fresh canvas (key) takes the 2D painter, because a
// canvas once asked for WebGL cannot draw in 2D. `window.__wavesAnyGL = true` (as in the other demos) lets a test use a
// software WebGL.
import { useEffect, useRef, useState } from "react";
import { addLightSink } from "../lib/sheen.ts";
import { DEEP, type Geometry, type Renderer, SHALLOW, startWaves, type WaterKind } from "../lib/waves.ts";

/** The map seen from the water, in page coordinates. */
function mapGeometry(): Geometry {
  const [sx, sy] = [window.scrollX, window.scrollY];
  const device = document.querySelector<HTMLElement>("[data-whirl]")?.getBoundingClientRect();
  const whirl =
    device && device.width > 0
      ? {
          x: device.left + device.width / 2 + sx,
          y: device.top + device.height / 2 + sy,
          r: Math.max(device.width, device.height) * 0.85,
        }
      : null;
  const segments: number[] = [];
  for (const path of document.querySelectorAll<SVGPathElement>("path[data-flow]")) {
    const m = path.getScreenCTM?.();
    let length = 0;
    try {
      length = path.getTotalLength();
    } catch {
      continue;
    }
    if (!m || !length) continue;
    const n = Math.max(2, Math.min(12, Math.ceil(length / 40)));
    let [px, py] = [0, 0];
    for (let i = 0; i <= n; i++) {
      const p = path.getPointAtLength((length * i) / n);
      const x = m.a * p.x + m.c * p.y + m.e + sx;
      const y = m.b * p.x + m.d * p.y + m.f + sy;
      if (i > 0) segments.push(px, py, x, y);
      [px, py] = [x, y];
    }
  }
  return { whirl, segments };
}

export function HexWaves({ water }: { water: WaterKind }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Renderer | null>("webgl2");
  useEffect(() => {
    const el = canvas.current;
    if (!el || !mode) return;
    const sea = water === "sea";
    // The river fills the masthead; the sea's canvas is its own size (the window's height).
    const host = sea ? el : el.parentElement;
    const band = sea ? el.closest<HTMLElement>(".workspace") : el.parentElement;
    if (!host || !band) return;
    const anyGl = (window as { __wavesAnyGL?: unknown }).__wavesAnyGL === true;
    // The sea follows the colour scheme as the page does: shallow and light, or deep.
    const dark = window.matchMedia?.("(prefers-color-scheme: dark)");
    const waves = startWaves(
      el,
      host,
      mode,
      sea
        ? {
            water,
            anyGl,
            palette: () => (dark?.matches ? DEEP : SHALLOW),
            origin: () => {
              const box = el.getBoundingClientRect();
              return { x: box.left + window.scrollX, y: box.top + window.scrollY };
            },
            geometry: mapGeometry,
            animate2d: false,
          }
        : { water, anyGl, wander: true, share: 0.1 },
    );
    if (!waves) {
      setMode(mode === "webgl2" ? "2d" : null);
      return;
    }
    const remove = addLightSink((target, rect) => {
      if (!band.contains(target)) return;
      const box = el.getBoundingClientRect();
      const reach = Math.max(rect.width, rect.height) * 0.6 + 50;
      waves.light(rect.left + rect.width / 2 - box.left, rect.top + rect.height / 2 - box.top, reach);
    });
    return () => {
      remove();
      waves.stop();
    };
  }, [mode, water]);
  if (!mode) return null;
  const testId = `waves-${water}`;
  return water === "sea" ? (
    <div className="page-sea" aria-hidden="true">
      <canvas key={mode} ref={canvas} className="page-sea-canvas" data-testid={testId} />
    </div>
  ) : (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas without tabindex is not focusable; the waves are decoration
    <canvas key={mode} ref={canvas} className="hexwaves" aria-hidden="true" data-testid={testId} />
  );
}
