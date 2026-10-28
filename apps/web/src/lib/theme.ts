// The colour scheme: the system's until the reader picks light or dark with the masthead's switch, then theirs,
// remembered in this browser (not in the link: it is how the reader likes to look at the page, not what they described).
// The choice sits on the root as `data-theme`, where the stylesheet's light-dark() tokens and the sea's water read it.
import { useEffect, useState } from "react";

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
