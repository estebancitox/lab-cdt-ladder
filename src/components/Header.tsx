import type { Theme } from '../ui/theme'

interface Props {
  theme: Theme
  onToggle: () => void
}

export function Header({ theme, onToggle }: Props) {
  const next = theme === 'dark' ? 'claro' : 'oscuro'
  return (
    <header className="site-head">
      <a className="wordmark" href="https://estebancitox.github.io/">
        lab <span className="slash" aria-hidden="true">/</span> cdt-ladder
      </a>
      <button
        type="button"
        className="theme-toggle"
        onClick={onToggle}
        aria-label={`Cambiar a tema ${next}`}
      >
        {next}
      </button>
    </header>
  )
}
