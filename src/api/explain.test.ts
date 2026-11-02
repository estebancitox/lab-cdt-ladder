import { describe, expect, it } from 'vitest'
import {
  buildExplainRequest,
  ERROR_MESSAGE,
  explain,
  EXPLAIN_URL,
  LIMIT_MESSAGE,
  UPSTREAM_MESSAGE,
} from './explain'
import type { ScenarioInput } from '../engine'

/** Rollover on, so the builder's omission of it is what the shape tests check. */
function input(): ScenarioInput {
  return {
    startDate: '2027-01-04',
    rungs: [
      { id: 'r1', principal: 16666667, days: 90, ea: 0.135, entityId: 'e1' },
      { id: 'r2', principal: 16666667, days: 180, ea: 0.135, entityId: 'e2' },
      { id: 'r3', principal: 16666666, days: 270, ea: 0.135, entityId: 'e3' },
    ],
    entities: [
      { id: 'e1', name: 'Banco Andino' },
      { id: 'e2', name: 'Cooperativa Ñame & Café' },
      { id: 'e3', name: 'Entidad B' },
    ],
    fiscal: { retencionRate: 0.04, insuranceCeiling: 50000000 },
    dayCountBase: 365,
    rollover: { mode: 'cycles', cycles: 2 },
  }
}

interface Call {
  url: string
  init: RequestInit | undefined
}

/** A fetch that answers once with the given status, body and headers, and records the call. */
function replying(status: number, body: string | object, headers: Record<string, string> = {}) {
  const calls: Call[] = []
  const fetchFn: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    const text = typeof body === 'string' ? body : JSON.stringify(body)
    return new Response(text, { status, headers })
  }
  return { fetchFn, calls }
}

const PLATFORM_429 = {
  Reason: 'ReservedFunctionConcurrentInvocationLimitExceeded',
  Type: 'User',
  message: 'Rate Exceeded.',
}

describe('EXPLAIN_URL', () => {
  it('is a Lambda Function URL in us-east-2 over https', () => {
    expect(EXPLAIN_URL).toMatch(/^https:\/\/[a-z0-9]+\.lambda-url\.us-east-2\.on\.aws\/$/)
  })
})

describe('buildExplainRequest — SPEC §2.2 shape', () => {
  it('carries asOfDate and the ladder, and nothing else', () => {
    const req = buildExplainRequest(input(), '2027-01-04')
    expect(Object.keys(req)).toEqual(['asOfDate', 'ladder'])
    expect(req.asOfDate).toBe('2027-01-04')
  })

  it('omits rollover: the schema has additionalProperties false', () => {
    const req = buildExplainRequest(input(), '2027-01-04')
    expect(Object.keys(req.ladder).sort()).toEqual(
      ['dayCountBase', 'entities', 'fiscal', 'rungs', 'startDate'].sort(),
    )
    expect('rollover' in req.ladder).toBe(false)
    expect(JSON.stringify(req)).not.toContain('rollover')
  })

  it('copies every field of the input, with exactly the schema keys per item', () => {
    const src = input()
    const req = buildExplainRequest(src, '2027-01-04')
    expect(req.ladder.startDate).toBe('2027-01-04')
    expect(req.ladder.dayCountBase).toBe(365)
    expect(Object.keys(req.ladder.fiscal).sort()).toEqual(['insuranceCeiling', 'retencionRate'])
    expect(req.ladder.fiscal).toEqual({ retencionRate: 0.04, insuranceCeiling: 50000000 })
    expect(req.ladder.entities).toEqual(src.entities)
    for (const e of req.ladder.entities) expect(Object.keys(e).sort()).toEqual(['id', 'name'])
    expect(req.ladder.rungs).toEqual(src.rungs)
    for (const r of req.ladder.rungs) {
      expect(Object.keys(r).sort()).toEqual(['days', 'ea', 'entityId', 'id', 'principal'])
    }
  })
})

describe('explain — the call', () => {
  it('POSTs JSON to EXPLAIN_URL with only the content-type header and a signal', async () => {
    const { fetchFn, calls } = replying(200, { text: 'x' })
    await explain(input(), '2027-01-04', { fetch: fetchFn })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(EXPLAIN_URL)
    const init = calls[0].init!
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
    expect(init.body).toBe(JSON.stringify(buildExplainRequest(input(), '2027-01-04')))
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('explain — outcomes', () => {
  it('200 with text → explanation', async () => {
    const { fetchFn } = replying(200, { text: 'Qué pasa y cuándo\n\nHola.\n\nRiesgos\n\nSin riesgos.' })
    expect(await explain(input(), '2027-01-04', { fetch: fetchFn })).toEqual({
      kind: 'explanation',
      text: 'Qué pasa y cuándo\n\nHola.\n\nRiesgos\n\nSin riesgos.',
    })
  })

  it('200 whose body is not JSON → unavailable with the fixed upstream text', async () => {
    const { fetchFn } = replying(200, '<html>not json</html>')
    expect(await explain(input(), '2027-01-04', { fetch: fetchFn })).toEqual({
      kind: 'unavailable',
      text: UPSTREAM_MESSAGE,
    })
  })

  it('200 whose JSON has no text → unavailable', async () => {
    const { fetchFn } = replying(200, { explanation: 'wrong key' })
    expect(await explain(input(), '2027-01-04', { fetch: fetchFn })).toEqual({
      kind: 'unavailable',
      text: UPSTREAM_MESSAGE,
    })
  })

  it('429 ip_limit_reached with retry-after → limit/ip with the seconds and the text', async () => {
    const { fetchFn } = replying(
      429,
      { text: LIMIT_MESSAGE, error: { code: 'ip_limit_reached', issues: [] } },
      { 'retry-after': '10034' },
    )
    expect(await explain(input(), '2027-01-04', { fetch: fetchFn })).toEqual({
      kind: 'limit',
      scope: 'ip',
      retryAfterSeconds: 10034,
      text: LIMIT_MESSAGE,
    })
  })

  it('429 daily_limit_reached → limit/daily', async () => {
    const { fetchFn } = replying(
      429,
      { text: LIMIT_MESSAGE, error: { code: 'daily_limit_reached', issues: [] } },
      { 'retry-after': '5' },
    )
    expect(await explain(input(), '2027-01-04', { fetch: fetchFn })).toMatchObject({
      kind: 'limit',
      scope: 'daily',
      retryAfterSeconds: 5,
    })
  })

  it("429 from the platform (no error.code, measured 2026-11-01) → throttled", async () => {
    const { fetchFn } = replying(429, PLATFORM_429)
    expect(await explain(input(), '2027-01-04', { fetch: fetchFn })).toEqual({ kind: 'throttled' })
  })

  it('429 with an unknown error.code → throttled', async () => {
    const { fetchFn } = replying(429, { text: 'x', error: { code: 'something_else', issues: [] } })
    expect(await explain(input(), '2027-01-04', { fetch: fetchFn })).toEqual({ kind: 'throttled' })
  })

  it('429 limit without retry-after, or with an unreadable one → retryAfterSeconds null', async () => {
    const body = { text: LIMIT_MESSAGE, error: { code: 'ip_limit_reached', issues: [] } }
    const missing = replying(429, body)
    expect(await explain(input(), '2027-01-04', { fetch: missing.fetchFn })).toMatchObject({
      kind: 'limit',
      retryAfterSeconds: null,
    })
    const unreadable = replying(429, body, { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' })
    expect(await explain(input(), '2027-01-04', { fetch: unreadable.fetchFn })).toMatchObject({
      kind: 'limit',
      retryAfterSeconds: null,
    })
  })

  it('400 with an engine issue → invalid with that message', async () => {
    const { fetchFn } = replying(400, {
      text: ERROR_MESSAGE,
      error: {
        code: 'invalid_input',
        issues: [
          {
            source: 'engine',
            code: 'principal_invalid',
            path: 'rungs[0].principal',
            message: 'El monto debe ser un entero en pesos, mayor que cero.',
          },
        ],
      },
    })
    expect(await explain(input(), '2027-01-04', { fetch: fetchFn })).toEqual({
      kind: 'invalid',
      message: 'El monto debe ser un entero en pesos, mayor que cero.',
    })
  })

  it('400 whose first issue is schema-shaped (no message) → the first issue with a message', async () => {
    const { fetchFn } = replying(400, {
      text: ERROR_MESSAGE,
      error: {
        code: 'invalid_input',
        issues: [
          { source: 'schema', keyword: 'required', path: '/ladder/rungs/0/ea' },
          { source: 'api', code: 'as_of_date_invalid', path: 'asOfDate', message: 'Fecha inválida.' },
        ],
      },
    })
    expect(await explain(input(), '2027-01-04', { fetch: fetchFn })).toEqual({
      kind: 'invalid',
      message: 'Fecha inválida.',
    })
  })

  it('400 with no issue message → invalid with the fixed error text', async () => {
    const { fetchFn } = replying(400, {
      text: ERROR_MESSAGE,
      error: { code: 'invalid_input', issues: [{ source: 'schema', keyword: 'type', path: '' }] },
    })
    expect(await explain(input(), '2027-01-04', { fetch: fetchFn })).toEqual({
      kind: 'invalid',
      message: ERROR_MESSAGE,
    })
  })

  it('413 → invalid with the fixed error text', async () => {
    const { fetchFn } = replying(413, {
      text: ERROR_MESSAGE,
      error: { code: 'payload_too_large', issues: [] },
    })
    expect(await explain(input(), '2027-01-04', { fetch: fetchFn })).toEqual({
      kind: 'invalid',
      message: ERROR_MESSAGE,
    })
  })

  it.each([
    [503, 'upstream_unavailable'],
    [503, 'upstream_truncated'],
    [502, 'verification_failed'],
    [500, 'internal_error'],
  ])("%i %s → unavailable with the API's text", async (status, code) => {
    const { fetchFn } = replying(status, { text: UPSTREAM_MESSAGE, error: { code, issues: [] } })
    expect(await explain(input(), '2027-01-04', { fetch: fetchFn })).toEqual({
      kind: 'unavailable',
      text: UPSTREAM_MESSAGE,
    })
  })

  it('an unknown status with a non-JSON body → unavailable with the fixed upstream text', async () => {
    const { fetchFn } = replying(403, '<html>Forbidden</html>')
    expect(await explain(input(), '2027-01-04', { fetch: fetchFn })).toEqual({
      kind: 'unavailable',
      text: UPSTREAM_MESSAGE,
    })
  })

  it('a fetch that throws (CORS, offline, DNS) → network', async () => {
    const fetchFn: typeof fetch = async () => {
      throw new TypeError('Failed to fetch')
    }
    expect(await explain(input(), '2027-01-04', { fetch: fetchFn })).toEqual({ kind: 'network' })
  })

  it('the client timeout aborts the call → network', async () => {
    let seen: AbortSignal | undefined
    const hanging: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        seen = init?.signal ?? undefined
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
      })
    const outcome = await explain(input(), '2027-01-04', { fetch: hanging, timeoutMs: 1 })
    expect(outcome).toEqual({ kind: 'network' })
    expect(seen?.aborted).toBe(true)
  })

  it('a body read that fails → network', async () => {
    const fetchFn: typeof fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('connection reset'))
          },
        }),
        { status: 200 },
      )
    expect(await explain(input(), '2027-01-04', { fetch: fetchFn })).toEqual({ kind: 'network' })
  })
})
