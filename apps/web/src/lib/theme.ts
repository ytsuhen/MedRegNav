// How the page looks, as the reader likes it, remembered in this browser (not in the link: it is not what they
// described): the colour scheme — the system's until they pick light or dark with the masthead's switch — and the
// hexagon waves, on unless they pick the plain look. The choices sit on the root as `data-theme` and `data-waves`,
// where the stylesheet's light-dark() tokens, the sea's water and the waves read them.
import { useEffect, useState, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const KEY = "mrn.theme";
const DARK = "(prefers-color-scheme: dark)";

/** The reader's choice, if they made one. */
export function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

const system = (): Theme => (window.matchMedia?.(DARK).matches ? "dark" : "light");

/** Is the page dark now: by the reader's choice on the root, else by the system's scheme. */
export function isDark(): boolean {
  const chosen = document.documentElement.dataset.theme;
  return chosen === "light" || chosen === "dark" ? chosen === "dark" : system() === "dark";
}

/**
 * Puts the stored choice on the root (index.html does the same in its head, before the first paint, so the page does
 * not flash the other scheme while the bundle loads).
 */
export function applyStoredTheme(): void {
  const theme = storedTheme();
  if (theme) document.documentElement.dataset.theme = theme;
  if (storedWaves() === false) document.documentElement.dataset.waves = "off";
}

const WAVES = "mrn.waves";

/** The reader's choice of the waves, if they made one. */
export function storedWaves(): boolean | null {
  try {
    const value = window.localStorage.getItem(WAVES);
    return value === "on" ? true : value === "off" ? false : null;
  } catch {
    return null;
  }
}

/** Are the waves on: off only by the reader's choice of the plain look. */
export function wavesOn(): boolean {
  return document.documentElement.dataset.waves !== "off";
}

const watchWaves = (change: () => void) => {
  const watch = new MutationObserver(change);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-waves"] });
  return () => watch.disconnect();
};

/** Whether the waves are on, and a way to turn them on or off (remembered); every user of it follows the root. */
export function useWaves(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(watchWaves, wavesOn, () => true);
  const choose = (next: boolean) => {
    document.documentElement.dataset.waves = next ? "on" : "off";
    try {
      window.localStorage.setItem(WAVES, next ? "on" : "off");
    } catch {
      // private mode: the choice lasts until the page is closed
    }
  };
  return [on, choose];
}

/** The scheme the page shows, and a way to choose one (remembered). Until a choice, it follows the system. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? system());
  useEffect(() => {
    const media = window.matchMedia?.(DARK);
    const follow = () => {
      if (!storedTheme()) setTheme(system());
    };
    media?.addEventListener?.("change", follow);
    return () => media?.removeEventListener?.("change", follow);
  }, []);
  const choose = (next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // private mode: the choice lasts until the page is closed
    }
    setTheme(next);
  };
  return [theme, choose];
}
