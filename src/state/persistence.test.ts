import { beforeEach, describe, expect, it } from 'vitest'
import { clearSavedForm, initialFormState, saveForm } from './persistence'
import { encodeForm } from './urlCodec'
import { initialForm } from '../ui/form'
import type { FormState } from '../ui/form'

// Minimal browser globals: the module only reads them inside its functions.
const store = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
})

function stubSearch(search: string): void {
  Object.assign(globalThis, { location: { search, pathname: '/lab-cdt-ladder/' } })
}

function saved(): FormState {
  return { ...initialForm(), capital: '777.000.000', rungCount: '3' }
}

function shared(): FormState {
  return { ...initialForm(), capital: '111.000.000', rungCount: '2' }
}

describe('initialFormState — precedence and reported source', () => {
  beforeEach(() => {
    store.clear()
    stubSearch('')
  })

  it('falls back to defaults when nothing is saved and no link is present', () => {
    const s = initialFormState()
    expect(s.source).toBe('defaults')
    expect(s.urlWasBad).toBe(false)
    expect(s.form.capital).toBe(initialForm().capital)
  })

  it('restores the saved scenario when there is no link', () => {
    saveForm(saved())
    const s = initialFormState()
    expect(s.source).toBe('storage')
    expect(s.form.capital).toBe('777.000.000')
  })

  it('a valid link outranks the saved scenario', () => {
    saveForm(saved())
    stubSearch(`?s=${encodeForm(shared())}`)
    const s = initialFormState()
    expect(s.source).toBe('url')
    expect(s.urlWasBad).toBe(false)
    expect(s.form.capital).toBe('111.000.000')
  })

  it('an unreadable link never clobbers the saved scenario', () => {
    saveForm(saved())
    stubSearch('?s=not-a-real-payload')
    const s = initialFormState()
    expect(s.source).toBe('storage')
    expect(s.urlWasBad).toBe(true)
    expect(s.form.capital).toBe('777.000.000')
  })

  it('reports defaults — not storage — when an unreadable link meets an empty store', () => {
    stubSearch('?s=not-a-real-payload')
    const s = initialFormState()
    expect(s.source).toBe('defaults')
    expect(s.urlWasBad).toBe(true)
  })

  it('clearSavedForm removes the stored scenario', () => {
    saveForm(saved())
    clearSavedForm()
    expect(initialFormState().source).toBe('defaults')
  })

  it('corrupt stored JSON degrades to defaults instead of throwing', () => {
    store.set('cdt-ladder:v1', '{not json')
    expect(initialFormState().source).toBe('defaults')
  })
})
