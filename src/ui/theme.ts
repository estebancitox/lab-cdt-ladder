export type Theme = 'light' | 'dark'

// Must match --ground in src/styles/main.css and the metas in index.html.
const GROUND: Record<Theme, string> = { light: '#F3F5F6', dark: '#14171B' }

export function effectiveTheme(): Theme {
  const explicit = document.documentElement.dataset.theme
  if (explicit === 'dark' || explicit === 'light') return explicit
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem('theme', theme)
  } catch {
    // localStorage unavailable (private mode) — the choice just won't persist.
  }
  syncMetaThemeColor(theme)
}

/**
 * On load, the media-scoped metas already track the system scheme; they only
 * need overriding when a stored explicit choice diverges from it.
 */
export function initThemeMeta(): void {
  const explicit = document.documentElement.dataset.theme
  if (explicit === 'dark' || explicit === 'light') syncMetaThemeColor(explicit)
}

/**
 * Derived from the token map, not getComputedStyle: the body background is
 * mid-transition at toggle time and would report the previous theme's color.
 */
function syncMetaThemeColor(theme: Theme): void {
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute('content', GROUND[theme]))
}
