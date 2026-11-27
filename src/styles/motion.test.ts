import { describe, expect, it } from 'vitest'
import { CUE_WINDOW_MS } from '../ui/explanation'

/**
 * The stylesheet's rule for motion, checked as text: every animation and
 * transition is declared in `@layer motion`, and that layer closes with the
 * block that turns both off under `prefers-reduced-motion: reduce`. A test in
 * node cannot evaluate a media query; what it can hold is the structure that
 * makes the reduced-motion block cover everything.
 *
 * The file is read from disk because vitest answers every `.css` import,
 * `?raw` included, with an empty string unless `test.css` is set in the
 * config. The project carries no Node typings, so the built-in module is
 * imported through a variable, which TypeScript does not resolve, and typed
 * here for the one call used.
 */
interface NodeFs {
  readFileSync(path: URL, encoding: 'utf8'): string
}
const nodeFs: string = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as NodeFs
const source = readFileSync(new URL('./main.css', import.meta.url), 'utf8')

const css = source.replace(/\/\*[\s\S]*?\*\//g, '')

/** The text of `@layer <name> { … }`, braces matched. */
function layer(name: string): { body: string; outside: string } {
  const start = css.indexOf(`@layer ${name} {`)
  if (start < 0) throw new Error(`no @layer ${name}`)
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}' && --depth === 0) {
      return { body: css.slice(start, i + 1), outside: css.slice(0, start) + css.slice(i + 1) }
    }
  }
  throw new Error(`@layer ${name} is not closed`)
}

const motion = layer('motion')
const squash = (text: string) => text.replace(/\s+/g, ' ').trim()

describe('main.css — motion', () => {
  it('declares every animation, transition and keyframes rule in the motion layer', () => {
    expect(motion.outside).not.toMatch(/(?:^|[\s;{])(?:animation|transition)(?:-[a-z]+)*\s*:/)
    expect(motion.outside).not.toContain('@keyframes')
    expect(motion.body).toMatch(/animation\s*:/)
  })

  it('closes the layer with the block that turns both off for every element with motion reduced', () => {
    expect(squash(motion.body)).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{ \*, \*::before, \*::after \{ transition: none !important; animation: none !important; \} \} \}$/,
    )
  })

  it('names in every animation a keyframes rule that exists, and leaves none unused', () => {
    const used = new Set([...motion.body.matchAll(/animation:\s*([a-z-]+)/g)].map((m) => m[1]))
    used.delete('none')
    const defined = new Set([...motion.body.matchAll(/@keyframes\s+([a-z-]+)/g)].map((m) => m[1]))
    expect([...used].sort()).toEqual([...defined].sort())
    expect(used.size).toBeGreaterThan(0)
  })

  it('lets only the wait run without end, and the idle cue three times', () => {
    const rules = [...motion.body.matchAll(/([^{}]+)\{([^{}]*animation:[^{}]*)\}/g)].map((m) => ({
      selector: squash(m[1]),
      declarations: squash(m[2]),
    }))
    const endless = rules.filter((rule) => rule.declarations.includes('infinite'))
    expect(endless.map((rule) => rule.selector)).toEqual([
      ".explanation[data-state='pending']::before, .explanation[data-state='pending']::after",
    ])
    const cue = rules.filter((rule) => rule.selector.includes('[data-cue]'))
    expect(cue.map((rule) => rule.declarations)).toEqual([
      'animation: cue-close-in 12s ease-in-out 1s 3;',
      'animation: cue-close-out 12s ease-in-out 1s 3;',
    ])
  })

  it("gives the cue's rule the length of the window App keeps it for", () => {
    const m = /animation: cue-close-in (\d+)s ease-in-out (\d+)s (\d+);/.exec(squash(motion.body))
    if (m === null) throw new Error('the cue rule is not in the form this test reads')
    const [duration, delay, turns] = [Number(m[1]), Number(m[2]), Number(m[3])]
    expect((delay + duration * turns) * 1000).toBe(CUE_WINDOW_MS)
  })
})
