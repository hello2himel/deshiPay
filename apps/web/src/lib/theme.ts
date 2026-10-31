/**
 * Theme handling.
 *
 * `index.html` sets `data-theme` before first paint (no flash); this module keeps
 * it in sync when the user toggles and tells every `<deshiqr-pay>` on the page to
 * follow the explicit theme instead of the OS preference.
 */
export type Theme = "light" | "dark";

export const THEME_KEY = "deshiqr.theme";

export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** The theme in effect right now. */
export function currentTheme(): Theme {
  const attribute = document.documentElement.dataset.theme;
  if (attribute === "light" || attribute === "dark") return attribute;
  return storedTheme() ?? systemTheme();
}

/** Apply a theme everywhere: root attribute, local storage, embedded panels. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // private browsing — the attribute still works for this session
  }
  for (const element of document.querySelectorAll<HTMLElement>("deshiqr-pay")) {
    element.setAttribute("theme", theme);
  }
}

/** Toggle light/dark and return the new theme. */
export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
