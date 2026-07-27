import { deserializeForm, serializeForm } from './serialize'
import type { FormState } from '../ui/form'

/** Query parameter carrying the scenario. */
export const SHARE_PARAM = 's'

/** UTF-8 JSON → base64url (no padding). */
export function encodeForm(form: FormState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(serializeForm(form)))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Inverse of encodeForm; returns null on any malformed input. */
export function decodeForm(encoded: string): FormState | null {
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return deserializeForm(JSON.parse(json))
  } catch {
    return null
  }
}

export function shareURL(form: FormState): string {
  return `${location.origin}${location.pathname}?${SHARE_PARAM}=${encodeForm(form)}`
}
