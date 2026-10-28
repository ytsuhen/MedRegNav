// The sheen (DECISIONS U12): when the user presses something, answers a question or moves the guided run to a step,
// the element shimmers for a moment, violet with a teal-green glint like a pigeon's neck, and the hexagons of the
// waves answer with a wave of the same colours. Feedback on an action, never a state: it carries no meaning and leaves
// nothing behind. With reduced motion there is none (the focus ring stays as it is).
// The flash is a separate layer over the element (absolutely placed, pointer-events none), so it never touches the
// element's own styles: the highlighter, the red pen and the focus ring stay as they are underneath.

/** What a field of waves does with an action on this element, at this place on the page (viewport coordinates). */
export type LightSink = (target: Element, rect: DOMRect) => void;

const sinks = new Set<LightSink>();

/** A field of waves registers here; the returned function unregisters it. */
export function addLightSink(sink: LightSink): () => void {
  sinks.add(sink);
  return () => {
    sinks.delete(sink);
  };
}

const SHEEN_MS = 800;

/** Things a person presses: the delegated listener flashes the nearest one of them. */
export const PRESSABLE =
  'button, [role="button"], [role="switch"], label, summary, select, a[href], input[type="range"]';

export function reducedMotion(): boolean {
  return typeof window === "undefined" || (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true);
}

/** Flashes one element (and lights the waves where it is). */
export function sheen(el: Element): void {
  if (reducedMotion()) return;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;
  const style = getComputedStyle(el);
  const layer = document.createElement("div");
  layer.className = "sheen";
  layer.setAttribute("aria-hidden", "true");
  layer.dataset.testid = "sheen";
  layer.style.borderRadius = style.borderRadius === "0px" ? "6px" : style.borderRadius;
  // The iris pair as the element sees it: the dark bands (the masthead, the description) re-point it.
  for (const name of ["--color-iris-violet", "--color-iris-teal"]) {
    const value = style.getPropertyValue(name).trim();
    if (value) layer.style.setProperty(name, value);
  }
  // The layer follows the element while it shimmers: a map node may move as the map lays itself out again.
  const place = (r: DOMRect) =>
    Object.assign(layer.style, {
      left: `${r.left + window.scrollX}px`,
      top: `${r.top + window.scrollY}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  place(rect);
  const follow = () => {
    if (!layer.isConnected) return;
    if (el.isConnected) place(el.getBoundingClientRect());
    requestAnimationFrame(follow);
  };
  document.body.append(layer);
  requestAnimationFrame(follow);
  const remove = () => layer.remove();
  layer.addEventListener("animationend", remove, { once: true });
  window.setTimeout(remove, SHEEN_MS + 400);
  for (const sink of sinks) sink(el, rect);
}

/** Flashes every element marked `data-flash` with one of these keys ("chip:<attr>", "branch:<id>", "rule:<id>"). */
export function sheenKeys(keys: readonly string[]): void {
  if (keys.length === 0 || reducedMotion()) return;
  const wanted = new Set(keys);
  for (const el of document.querySelectorAll<HTMLElement>("[data-flash]"))
    if (wanted.has(el.dataset.flash ?? "")) sheen(el);
}

/** Flashes whatever is pressed anywhere on the page; returns the uninstaller. */
export function installSheen(doc: Document): () => void {
  let last: { el: Element; at: number } | null = null;
  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest(PRESSABLE) : null;
    if (!target) return;
    const now = performance.now();
    // A label's click is followed by its input's: one flash.
    if (last && now - last.at < 300 && (last.el.contains(target) || target.contains(last.el))) return;
    last = { el: target, at: now };
    sheen(target);
  };
  doc.addEventListener("click", onClick, true);
  return () => doc.removeEventListener("click", onClick, true);
}
