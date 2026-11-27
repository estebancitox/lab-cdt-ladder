import { describe, expect, it } from 'vitest'
import { deserializeForm, serializeForm } from './serialize'
import { decodeForm, encodeForm } from './urlCodec'
import { buildScenario, initialForm } from '../ui/form'
import type { FormState } from '../ui/form'

function sample(): FormState {
  return {
    ...initialForm(),
    capital: '120,000,000',
    rungCount: '6',
    spacingDays: '60',
    ea: '13,5',
    dayCountBase: '365',
    retencion: '4',
    ceiling: '50,000,000',
    startDate: '2026-08-01',
    entities: [
      { id: 'e1', name: 'Banco Andino' },
      { id: 'e3', name: 'Cooperativa Ñame & Café' },
    ],
    allocation: ['e1', 'e3', 'e1'],
    nextEntitySeq: 4,
    rolloverMode: 'horizon',
    rolloverCycles: '4',
    rolloverHorizon: '2028-08-01',
  }
}

describe('serializeForm / deserializeForm', () => {
  it('round-trips every field, deriving nextEntitySeq from the ids', () => {
    const out = deserializeForm(JSON.parse(JSON.stringify(serializeForm(sample()))))
    expect(out).not.toBeNull()
    const { nextEntitySeq, ...rest } = out!
    const { nextEntitySeq: expectedSeq, ...expected } = sample()
    expect(rest).toEqual(expected)
    expect(nextEntitySeq).toBe(expectedSeq)
  })

  it('rejects malformed shapes instead of throwing', () => {
    for (const bad of [
      null,
      42,
      'string',
      {},
      { v: 2 },
      { ...serializeForm(sample()), startDate: 'no-date' },
      { ...serializeForm(sample()), rolloverMode: 'weird' },
      { ...serializeForm(sample()), entities: [] },
      { ...serializeForm(sample()), entities: [['x!', 'name']] },
      { ...serializeForm(sample()), entities: [['e1', 'a'], ['e1', 'b']] },
      { ...serializeForm(sample()), entities: Array.from({ length: 7 }, (_, i) => [`e${i + 1}`, 'x']) },
      { ...serializeForm(sample()), allocation: Array.from({ length: 13 }, () => 'e1') },
      { ...serializeForm(sample()), capital: 'x'.repeat(21) },
    ]) {
      expect(deserializeForm(bad)).toBeNull()
    }
  })

  it('keeps storage version 1: a bump would make every saved scenario and link unreadable', () => {
    expect(serializeForm(sample()).v).toBe(1)
  })
})

describe('amounts saved before the UI moved to English (es-CO dots)', () => {
  it('load with en-US commas and the same numbers', () => {
    const legacy = { ...serializeForm(sample()), capital: '120.000.000', ceiling: '50.000.000' }
    const out = deserializeForm(JSON.parse(JSON.stringify(legacy)))
    expect(out).not.toBeNull()
    expect(out!.capital).toBe('120,000,000')
    expect(out!.ceiling).toBe('50,000,000')
    const { input, issues } = buildScenario(out!)
    expect(issues).toEqual([])
    expect(input.rungs.reduce((a, r) => a + r.principal, 0)).toBe(120_000_000)
    expect(input.fiscal.insuranceCeiling).toBe(50_000_000)
  })

  it('a saved default scenario equals the defaults again, so nothing reads as changed', () => {
    const legacy = { ...serializeForm(initialForm()), capital: '40.000.000', ceiling: '50.000.000' }
    const out = deserializeForm(JSON.parse(JSON.stringify(legacy)))
    expect(out).not.toBeNull()
    expect(out!.capital).toBe(initialForm().capital)
    expect(out!.ceiling).toBe(initialForm().ceiling)
  })

  it('a link shared with dots decodes the same way', () => {
    const out = decodeForm(encodeForm({ ...sample(), capital: '120.000.000', ceiling: '50.000.000' }))
    expect(out).not.toBeNull()
    expect(out!.capital).toBe('120,000,000')
    expect(out!.ceiling).toBe('50,000,000')
  })

  it('an amount of more than 12 digits, which only a hand-edited link can hold, is left as it came', () => {
    for (const amount of ['1000000000000', '1.000.000.000.000', '0000000000040000000']) {
      const out = deserializeForm({ ...serializeForm(sample()), capital: amount, ceiling: amount })
      expect(out).not.toBeNull()
      expect(out!.capital).toBe(amount)
      expect(out!.ceiling).toBe(amount)
    }
  })

  it('12 digits regroup, leading zeros included, and keep their number', () => {
    const out = deserializeForm({
      ...serializeForm(sample()),
      capital: '999.999.999.999',
      ceiling: '040.000.000',
    })
    expect(out).not.toBeNull()
    expect(out!.capital).toBe('999,999,999,999')
    expect(out!.ceiling).toBe('40,000,000')
  })

  it('an empty amount stays empty, and the name a user saved is not rewritten', () => {
    const legacy = { ...serializeForm(sample()), capital: '', entities: [['e1', 'Entidad A']] }
    const out = deserializeForm(JSON.parse(JSON.stringify(legacy)))
    expect(out).not.toBeNull()
    expect(out!.capital).toBe('')
    expect(out!.entities).toEqual([{ id: 'e1', name: 'Entidad A' }])
  })
})

describe('entity-name length — serializer and deserializer agree', () => {
  it('truncates over-long names so a saved scenario always loads back', () => {
    // Real cooperative names run past 60 chars; before the cap they serialized
    // fine and then failed to decode, silently destroying the saved scenario.
    const long = 'Cooperativa de Ahorro y Crédito de Santander Ltda. Financiera Comultrasan'
    const f = { ...sample(), entities: [{ id: 'e1', name: long }] }
    const out = deserializeForm(JSON.parse(JSON.stringify(serializeForm(f))))
    expect(out).not.toBeNull()
    expect(out!.entities[0].name).toBe(long.slice(0, 60))
    expect(decodeForm(encodeForm(f))).not.toBeNull()
  })

  it('emoji names (two UTF-16 units each) survive the same way', () => {
    const f = { ...sample(), entities: [{ id: 'e1', name: '🏦'.repeat(40) }] }
    expect(decodeForm(encodeForm(f))).not.toBeNull()
  })

  it('accepts entity ids beyond four digits, matching the id generator', () => {
    const f = { ...sample(), entities: [{ id: 'e10000', name: 'Entidad' }], allocation: [] }
    const out = decodeForm(encodeForm(f))
    expect(out).not.toBeNull()
    expect(out!.nextEntitySeq).toBe(10001)
  })
})

describe('URL codec', () => {
  it('encode → decode round-trips, including Spanish characters', () => {
    const encoded = encodeForm(sample())
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    const out = decodeForm(encoded)
    expect(out).not.toBeNull()
    expect(out!.entities[1].name).toBe('Cooperativa Ñame & Café')
    expect(out!.rolloverMode).toBe('horizon')
  })

  it('returns null on garbage instead of throwing', () => {
    for (const bad of ['', '!!!', 'AAAA', btoa('{"v":9}'), 'ñ']) {
      expect(decodeForm(bad)).toBeNull()
    }
  })
})
