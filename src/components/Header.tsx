import type { Theme } from '../ui/theme'

interface Props {
  theme: Theme
  onToggle: () => void
}

export function Header({ theme, onToggle }: Props) {
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <header className="site-head">
      <a className="wordmark" href="https://estebancitox.github.io/">
        lab <span className="slash" aria-hidden="true">/</span> cdt-ladder
      </a>
      <button
        type="button"
        className="theme-toggle"
        onClick={onToggle}
        aria-label={`Switch to the ${next} theme`}
      >
        {next}
      </button>
    </header>
  )
}
