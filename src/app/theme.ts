export type Theme = 'system' | 'light' | 'dark'

// Keep the key and values in sync with the inline script in index.html, which applies the saved
// theme before first paint.
const KEY = 'kiln-theme'

/** Storage can throw (blocked cookies, private mode quirks); fall back to following the system. */
export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

/** "system" removes data-theme so the CSS follows prefers-color-scheme. */
export function applyTheme(theme: Theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}

/** Applies the theme even if it can't be saved, so the choice still holds for this visit. */
export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // not persisted; nothing else to do
  }
  applyTheme(theme)
}
