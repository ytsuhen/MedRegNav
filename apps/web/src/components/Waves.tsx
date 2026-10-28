// The hexagon waves (lib/waves.ts) and their answer to actions (lib/sheen.ts):
// - the river behind the masthead, sprinkled with pigeon hexagons that shift their colour slowly, away from its text; a
//   control pressed in the masthead lights it;
// - the sea under the work area, behind everything below the masthead: a canvas the height of the window that stays in
//   view while the page scrolls, its water fixed to the page and its colours the page's scheme (lib/theme.ts). It reads
//   the map from the page now and then — the device it whirls round (`data-whirl`), the lines from it to the branches
//   and those from the open branch on to its requirements, along which its wavelets run (`path[data-wave]`, from and
//   `data-to`) — and at once when the map moves, so it follows the automatic layout and a drag or a zoom. A press
//   anywhere in the work area lights the water round it.
// WebGL2 first; if the graphics card is missing or software-only, a fresh canvas (key) takes the 2D painter, because a
// canvas once asked for WebGL cannot draw in 2D. `window.__wavesAnyGL = true` (as in the other demos) lets a test use a
// software WebGL.
import { useEffect, useRef, useState } from "react";
import { addLightSink } from "../lib/sheen.ts";
import { isDark } from "../lib/theme.ts";
import { type Box, DEEP, type Geometry, type Renderer, SHALLOW, startWaves, type WaterKind } from "../lib/waves.ts";

/** The map seen from the water, in page coordinates. */
function mapGeometry(): Geometry {
  const [sx, sy] = [window.scrollX, window.scrollY];
  // The device's node on the map (not the sea's own canvas, whose data attributes report on the water).
  const device = document.querySelector<HTMLElement>(".react-flow [data-whirl]")?.getBoundingClientRect();
  const whirl =
    device && device.width > 0
      ? {
          x: device.left + device.width / 2 + sx,
          y: device.top + device.height / 2 + sy,
          r: Math.hypot(device.width, device.height) / 2,
        }
      : null;
  // Each line as points in page coordinates, with the nodes it runs from and to.
  const sampled: { points: number[]; from: string; to: string }[] = [];
  for (const path of document.querySelectorAll<SVGPathElement>("path[data-wave]")) {
    const m = path.getScreenCTM?.();
    let length = 0;
    try {
      length = path.getTotalLength();
    } catch {
      continue;
    }
    if (!m || !length) continue;
    const n = Math.max(4, Math.min(24, Math.ceil(length / 20)));
    const points: number[] = [];
    for (let i = 0; i <= n; i++) {
      const p = path.getPointAtLength((length * i) / n);
      points.push(m.a * p.x + m.c * p.y + m.e + sx, m.b * p.x + m.d * p.y + m.f + sy);
    }
    sampled.push({ points, from: path.dataset.wave ?? "", to: path.dataset.to ?? "" });
  }
  // First the lines from the device, then those that carry one of them on (from the node it ran to).
  const deviceId = document.querySelector(".react-flow [data-whirl]")?.closest<HTMLElement>(".react-flow__node")
    ?.dataset.id;
  const roots = sampled.filter((l) => l.from === deviceId);
  const onward = sampled.flatMap((l) => {
    const from = roots.findIndex((r) => r.to === l.from);
    return from < 0 ? [] : [{ points: l.points, from }];
  });
  return { whirl, lines: [...roots.map((l) => ({ points: l.points })), ...onward] };
}

/** Where the map is, cheaply (read each frame): its viewport's transform and the device's box on the page. */
function mapMark(): string {
  const view = document.querySelector<HTMLElement>(".react-flow__viewport")?.style.transform ?? "";
  const d = document.querySelector<HTMLElement>(".react-flow [data-whirl]")?.getBoundingClientRect();
  return d ? `${view}|${[d.left + window.scrollX, d.top + window.scrollY, d.width, d.height].map(Math.round)}` : view;
}

/** The parts of `host` that hold text or a control, as boxes of `canvas`: the river keeps its sprinkles off them. */
function textBoxes(host: Element, canvas: HTMLCanvasElement): Box[] {
  const box = canvas.getBoundingClientRect();
  const texty = (e: Element) =>
    /^(INPUT|SELECT|BUTTON)$/.test(e.tagName) ||
    [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");
  return [...host.querySelectorAll("*")].filter(texty).map((e) => {
    const r = e.getBoundingClientRect();
    return [r.left - box.left, r.top - box.top, r.right - box.left, r.bottom - box.top] as const;
  });
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
    const waves = startWaves(
      el,
      host,
      mode,
      sea
        ? {
            water,
            anyGl,
            // The sea follows the page's scheme: shallow and light, or deep.
            palette: () => (isDark() ? DEEP : SHALLOW),
            origin: () => {
              const box = el.getBoundingClientRect();
              return { x: box.left + window.scrollX, y: box.top + window.scrollY };
            },
            geometry: mapGeometry,
            geometryKey: mapMark,
            animate2d: false,
          }
        : { water, anyGl, sprinkles: true, avoid: () => textBoxes(host, el), share: 0.1 },
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
