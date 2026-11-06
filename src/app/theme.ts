export type Theme = 'system' | 'light' | 'dark'

const KEY = 'kiln-theme'

export function readTheme(): Theme {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

/** "system" removes data-theme so the CSS follows prefers-color-scheme. */
export function applyTheme(theme: Theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}

export function saveTheme(theme: Theme) {
  localStorage.setItem(KEY, theme)
  applyTheme(theme)
}
