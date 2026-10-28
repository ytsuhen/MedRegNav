// The hexagon waves behind the masthead (lib/waves.ts) and their answer to actions (lib/sheen.ts). WebGL2 first; if
// the graphics card is missing or software-only, a fresh canvas (key) takes the 2D painter, because a canvas once asked
// for WebGL cannot draw in 2D. `window.__wavesAnyGL = true` (as in the other demos) lets a test use a software WebGL.
import { useEffect, useRef, useState } from "react";
import { setLightSink } from "../lib/sheen.ts";
import { type Renderer, startWaves } from "../lib/waves.ts";

export function HexWaves() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Renderer | null>("webgl2");
  useEffect(() => {
    const el = canvas.current;
    const host = el?.parentElement;
    if (!el || !host || !mode) return;
    const anyGl = (window as { __wavesAnyGL?: unknown }).__wavesAnyGL === true;
    const waves = startWaves(el, host, mode, { anyGl });
    if (!waves) {
      setMode(mode === "webgl2" ? "2d" : null);
      return;
    }
    // An action inside the masthead lights the hexagons round it; one below lights them along the bottom edge, above
    // where it happened, as a wave coming up from the page.
    setLightSink((rect) => {
      const box = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2 - box.left;
      const inside = rect.top < box.bottom && rect.bottom > box.top;
      const y = inside ? rect.top + rect.height / 2 - box.top : box.height + 18;
      const reach = inside ? Math.max(rect.width, rect.height) * 0.6 + 50 : 130;
      waves.light(x, y, reach);
    });
    return () => {
      setLightSink(null);
      waves.stop();
    };
  }, [mode]);
  return mode ? (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas without tabindex is not focusable; the waves are decoration
    <canvas key={mode} ref={canvas} className="hexwaves" aria-hidden="true" data-testid="hexwaves" />
  ) : null;
}
