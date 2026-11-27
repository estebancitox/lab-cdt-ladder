import type { ISODate, ScenarioInput } from '../engine'

/**
 * Client for lab-cdt-ladder-api (SPEC 2.0). This is the only module that
 * speaks HTTP: it builds the request from a ScenarioInput, performs one call
 * with an injected fetch, and maps every reply or failure onto ExplainOutcome.
 * It never throws, and it never retries: each call spends money on the API's
 * side and one of the caller's daily requests.
 */

/** Public by nature: it is in the page's JavaScript either way. */
export const EXPLAIN_URL = 'https://yi67pnlyvlrjfrwwx4lntygey40nmnjq.lambda-url.us-east-2.on.aws/'

/**
 * The handler's budget is 24 s and the Lambda timeout 25 s (SPEC §8), so a
 * reply that has not arrived by 30 s is not coming.
 */
export const DEFAULT_TIMEOUT_MS = 30_000

/**
 * SPEC §8.2: both counters reset at the next 00:00 UTC, so a conformant
 * `retry-after` is at most one day. A larger value is not the API's and is
 * treated as absent, which also keeps the hour label away from an Invalid
 * Date (Intl throws a RangeError on one).
 */
export const MAX_RETRY_AFTER_SECONDS = 86_400

/**
 * SPEC §7 fixed strings, byte-exact. Fallbacks only: an error reply always
 * carries its own `text`, and these stand in when a body has none (a platform
 * reply, an unparsable body, an unknown status).
 */
export const ERROR_MESSAGE = 'I cannot explain this ladder: the data received is not valid.'
export const UPSTREAM_MESSAGE =
  'I cannot explain this ladder right now: the service is unavailable.'
export const LIMIT_MESSAGE =
  'I cannot explain this ladder for now: the daily request limit has been reached.'

/** SPEC §2.2: the schema has `additionalProperties: false` at every level. */
export interface ExplainRequest {
  asOfDate: ISODate
  ladder: {
    startDate: ISODate
    dayCountBase: number
    fiscal: { retencionRate: number; insuranceCeiling: number }
    entities: Array<{ id: string; name: string }>
    rungs: Array<{ id: string; principal: number; days: number; ea: number; entityId: string }>
  }
}

export type ExplainOutcome =
  | { kind: 'explanation'; text: string }
  /** A §8.2 daily cap. `retryAfterSeconds` is null when the header is missing, unreadable or over a day. */
  | { kind: 'limit'; scope: 'ip' | 'daily'; retryAfterSeconds: number | null; text: string }
  /** The platform's own 429: a throttled URL or the owner's kill switch. No `error.code`. */
  | { kind: 'throttled' }
  /** 503, 502, 500, an unknown status, or a 200 whose body is not the contract's. */
  | { kind: 'unavailable'; text: string }
  /** 400 or 413: the first issue that carries a message, if any, and the API's fixed text. */
  | { kind: 'invalid'; issue: string | null; text: string }
  /** fetch threw (CORS, offline, DNS), the body read failed, or the client timeout fired. */
  | { kind: 'network' }

export interface ExplainOptions {
  fetch?: typeof fetch
  timeoutMs?: number
}

/**
 * Built field by field, never by spreading the input: `rollover` is not in the
 * schema, and neither is any field the engine may grow later.
 */
export function buildExplainRequest(input: ScenarioInput, asOfDate: ISODate): ExplainRequest {
  return {
    asOfDate,
    ladder: {
      startDate: input.startDate,
      dayCountBase: input.dayCountBase,
      fiscal: {
        retencionRate: input.fiscal.retencionRate,
        insuranceCeiling: input.fiscal.insuranceCeiling,
      },
      entities: input.entities.map((e) => ({ id: e.id, name: e.name })),
      rungs: input.rungs.map((r) => ({
        id: r.id,
        principal: r.principal,
        days: r.days,
        ea: r.ea,
        entityId: r.entityId,
      })),
    },
  }
}

const defaultFetch: typeof fetch = (url, init) => globalThis.fetch(url, init)

/** `AbortSignal.timeout` arrived in Safari 16; older engines get the same signal by hand. */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

export async function explain(
  input: ScenarioInput,
  asOfDate: ISODate,
  options: ExplainOptions = {},
): Promise<ExplainOutcome> {
  const doFetch = options.fetch ?? defaultFetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let status: number
  let retryAfter: string | null
  let raw: string
  try {
    const response = await doFetch(EXPLAIN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildExplainRequest(input, asOfDate)),
      signal: timeoutSignal(timeoutMs),
    })
    status = response.status
    retryAfter = response.headers.get('retry-after')
    raw = await response.text()
  } catch {
    return { kind: 'network' }
  }
  return classify(status, retryAfter, raw)
}

type Dict = Record<string, unknown>

function isDict(v: unknown): v is Dict {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseBody(raw: string): Dict | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    return isDict(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** SPEC §7: whole seconds, at most a day. Anything else is treated as absent. */
function parseRetryAfter(header: string | null): number | null {
  if (header === null) return null
  const t = header.trim()
  if (!/^\d+$/.test(t)) return null
  const seconds = Number(t)
  return seconds <= MAX_RETRY_AFTER_SECONDS ? seconds : null
}

/** SPEC §7.1–§7.3: schema issues carry no message; engine and API issues do. */
function firstIssueMessage(error: Dict | null): string | null {
  const issues = error?.issues
  if (!Array.isArray(issues)) return null
  for (const issue of issues) {
    if (isDict(issue) && typeof issue.message === 'string') return issue.message
  }
  return null
}

function classify(status: number, retryAfter: string | null, raw: string): ExplainOutcome {
  const body = parseBody(raw)
  const text = typeof body?.text === 'string' ? body.text : null
  const error = isDict(body?.error) ? body.error : null
  const code = typeof error?.code === 'string' ? error.code : null

  if (status === 200) {
    // SPEC §7.4: a blank reply is a 503 on the API's side, so a blank 200 is
    // not the contract's and is not shown as an explanation.
    return text !== null && text.trim() !== ''
      ? { kind: 'explanation', text }
      : { kind: 'unavailable', text: UPSTREAM_MESSAGE }
  }
  if (status === 429) {
    if (code === 'ip_limit_reached' || code === 'daily_limit_reached') {
      return {
        kind: 'limit',
        scope: code === 'ip_limit_reached' ? 'ip' : 'daily',
        retryAfterSeconds: parseRetryAfter(retryAfter),
        text: text ?? LIMIT_MESSAGE,
      }
    }
    return { kind: 'throttled' }
  }
  if (status === 400 || status === 413) {
    return { kind: 'invalid', issue: firstIssueMessage(error), text: text ?? ERROR_MESSAGE }
  }
  return { kind: 'unavailable', text: text ?? UPSTREAM_MESSAGE }
}
