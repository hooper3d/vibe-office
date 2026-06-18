export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "vibe-office.theme";

export function loadThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";

  try {
    return window.localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function saveThemeMode(themeMode: ThemeMode) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, themeMode);
  } catch {
    // Theme is recoverable; storage failures should not interrupt the active workspace.
  }
}
