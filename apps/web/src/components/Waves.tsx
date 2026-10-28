// A field of hexagon waves behind a dark band (lib/waves.ts): the calm sea behind the description of the software, the
// river behind the masthead; and their answer to actions (lib/sheen.ts). An action inside a band lights its hexagons
// round the element; the sea also answers what happens below it (the map, the checklist, the card) with a light along
// its bottom edge, above where it happened, as a wave coming up from the page. WebGL2 first; if the graphics card is
// missing or software-only, a fresh canvas (key) takes the 2D painter, because a canvas once asked for WebGL cannot draw
// in 2D. `window.__wavesAnyGL = true` (as in the other demos) lets a test use a software WebGL.
import { useEffect, useRef, useState } from "react";
import { addLightSink } from "../lib/sheen.ts";
import { type Renderer, startWaves, type WaterKind } from "../lib/waves.ts";

/** Marks a band that has its own waves (`data-waves="river"`, `"sea"`), so the sea leaves the band's actions to them. */
const WAVES_BAND = "data-waves";

export function HexWaves({ water, below = false }: { water: WaterKind; below?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Renderer | null>("webgl2");
  useEffect(() => {
    const el = canvas.current;
    const host = el?.parentElement;
    if (!el || !host || !mode) return;
    const anyGl = (window as { __wavesAnyGL?: unknown }).__wavesAnyGL === true;
    // Two fields share the page: without a graphics card each takes at most half a tenth of its time.
    const waves = startWaves(el, host, mode, { water, anyGl, share: 0.05 });
    if (!waves) {
      setMode(mode === "webgl2" ? "2d" : null);
      return;
    }
    const remove = addLightSink((target, rect) => {
      const box = el.getBoundingClientRect();
      if (host.contains(target)) {
        const reach = Math.max(rect.width, rect.height) * 0.6 + 50;
        waves.light(rect.left + rect.width / 2 - box.left, rect.top + rect.height / 2 - box.top, reach);
      } else if (below && !target.closest(`[${WAVES_BAND}]`) && rect.top >= box.bottom) {
        const x = Math.min(box.width, Math.max(0, rect.left + rect.width / 2 - box.left));
        waves.light(x, box.height + 18, 130);
      }
    });
    return () => {
      remove();
      waves.stop();
    };
  }, [mode, water, below]);
  return mode ? (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas without tabindex is not focusable; the waves are decoration
    <canvas key={mode} ref={canvas} className="hexwaves" aria-hidden="true" data-testid={`waves-${water}`} />
  ) : null;
}
