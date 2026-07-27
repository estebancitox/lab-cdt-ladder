import { deserializeForm, serializeForm } from './serialize'
import { decodeForm, SHARE_PARAM } from './urlCodec'
import { initialForm } from '../ui/form'
import type { FormState } from '../ui/form'

const KEY = 'cdt-ladder:v1'

export function saveForm(form: FormState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(serializeForm(form)))
  } catch {
    // Storage unavailable or full — persistence is best-effort.
  }
}

export function clearSavedForm(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

function loadStoredForm(): FormState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return null
    return deserializeForm(JSON.parse(raw))
  } catch {
    return null
  }
}

export interface InitialState {
  form: FormState
  /** Which source actually supplied the form — the notice copy depends on it. */
  source: 'url' | 'storage' | 'defaults'
  /** True when a share param was present but could not be decoded. */
  urlWasBad: boolean
}

/** Precedence: shared URL > saved scenario > defaults. */
export function initialFormState(): InitialState {
  const encoded = new URLSearchParams(location.search).get(SHARE_PARAM)
  const urlWasBad = encoded !== null && decodeForm(encoded) === null
  if (encoded !== null && !urlWasBad) {
    return { form: decodeForm(encoded)!, source: 'url', urlWasBad: false }
  }
  const stored = loadStoredForm()
  return stored
    ? { form: stored, source: 'storage', urlWasBad }
    : { form: initialForm(), source: 'defaults', urlWasBad }
}
