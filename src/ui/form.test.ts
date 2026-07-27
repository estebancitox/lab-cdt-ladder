import { describe, expect, it } from 'vitest'
import {
  buildScenario,
  entitySoftIssues,
  fieldForPath,
  formatCapitalInput,
  initialForm,
} from './form'
import type { FormState } from './form'

function form(over: Partial<FormState>): FormState {
  return {
    capital: '50.000.000',
    rungCount: '4',
    spacingDays: '90',
    ea: '10',
    dayCountBase: '360',
    retencion: '4',
    ceiling: '50.000.000',
    startDate: '2026-07-26',
    entities: [{ id: 'e1', name: 'Entidad A' }],
    allocation: [],
    nextEntitySeq: 2,
    rolloverMode: 'off',
    rolloverCycles: '4',
    rolloverHorizon: '2028-07-26',
    ...over,
  }
}

function codes(f: FormState): string[] {
  return buildScenario(f).issues.map((i) => i.code)
}

describe('formatCapitalInput', () => {
  it('groups digits with es-CO dots and strips everything else', () => {
    expect(formatCapitalInput('50000000')).toBe('50.000.000')
    expect(formatCapitalInput('50.000.000')).toBe('50.000.000')
    expect(formatCapitalInput('abc12x34')).toBe('1.234')
    expect(formatCapitalInput('')).toBe('')
  })

  it('caps input at 12 digits so engine output stays peso-exact', () => {
    expect(formatCapitalInput('9'.repeat(20))).toBe('999.999.999.999')
  })
})

describe('buildScenario — percent parsing', () => {
  it('accepts decimal comma, decimal point, and % suffix as the same rate', () => {
    for (const ea of ['13,5', '13.5', '13,5 %', '13.5%']) {
      const { input, issues } = buildScenario(form({ ea }))
      expect(issues).toEqual([])
      expect(input.rungs[0].ea).toBeCloseTo(0.135, 12)
    }
  })

  it('converts retención to a fraction', () => {
    const { input } = buildScenario(form({ retencion: '4' }))
    expect(input.fiscal.retencionRate).toBeCloseTo(0.04, 12)
  })

  it('accepts E.A. 100 but rejects beyond, negatives, and garbage', () => {
    expect(codes(form({ ea: '100' }))).toEqual([])
    expect(codes(form({ ea: '100,1' }))).toContain('ea_invalid')
    expect(codes(form({ ea: '-1' }))).toContain('ea_invalid')
    expect(codes(form({ ea: 'diez' }))).toContain('ea_invalid')
    expect(codes(form({ ea: '' }))).toContain('ea_invalid')
  })

  it('rejects retención of exactly 100 (exclusive bound)', () => {
    expect(codes(form({ retencion: '100' }))).toContain('retencion_invalid')
    expect(codes(form({ retencion: '0' }))).toEqual([])
  })
})

describe('buildScenario — ladder shape', () => {
  it('splits capital exactly and terms are n × spacing', () => {
    const { input, issues } = buildScenario(form({ capital: '50.000.000', rungCount: '3' }))
    expect(issues).toEqual([])
    expect(input.rungs.map((r) => r.principal)).toEqual([16_666_667, 16_666_667, 16_666_666])
    expect(input.rungs.map((r) => r.days)).toEqual([90, 180, 270])
    expect(input.rungs.reduce((a, r) => a + r.principal, 0)).toBe(50_000_000)
  })

  it('enforces the 10-year cap on the last maturity: 3650 passes, 3651 fails', () => {
    expect(codes(form({ rungCount: '1', spacingDays: '3650' }))).toEqual([])
    expect(codes(form({ rungCount: '1', spacingDays: '3651' }))).toContain('spacing_too_long')
    expect(codes(form({ rungCount: '10', spacingDays: '365' }))).toEqual([])
    expect(codes(form({ rungCount: '10', spacingDays: '366' }))).toContain('spacing_too_long')
  })

  it('does not blame the spacing field when only the count is invalid', () => {
    const c = codes(form({ rungCount: '15', spacingDays: '300' }))
    expect(c).toContain('count_invalid')
    expect(c).not.toContain('spacing_too_long')
  })

  it('rejects empty or zero capital and out-of-range counts', () => {
    expect(codes(form({ capital: '' }))).toContain('capital_invalid')
    expect(codes(form({ capital: '0' }))).toContain('capital_invalid')
    expect(codes(form({ rungCount: '0' }))).toContain('count_invalid')
    expect(codes(form({ rungCount: '13' }))).toContain('count_invalid')
    expect(codes(form({ rungCount: '2,5' }))).toContain('count_invalid')
  })

  it('rejects invalid start dates', () => {
    expect(codes(form({ startDate: '2026-02-30' }))).toContain('start_date_invalid')
  })

  it('defaults to base 360 comercial and passes 365 through', () => {
    expect(buildScenario(form({})).input.dayCountBase).toBe(360)
    expect(buildScenario(form({ dayCountBase: '365' })).input.dayCountBase).toBe(365)
    expect(codes(form({ dayCountBase: '364' }))).toContain('base_invalid')
  })
})

describe('buildScenario — rollover config', () => {
  it("mode 'off' produces no config", () => {
    expect(buildScenario(form({})).input.rollover).toBeUndefined()
  })

  it('cycles mode parses and bounds 1..36', () => {
    expect(buildScenario(form({ rolloverMode: 'cycles', rolloverCycles: '6' })).input.rollover)
      .toEqual({ mode: 'cycles', cycles: 6 })
    for (const bad of ['0', '37', '2,5', '']) {
      expect(codes(form({ rolloverMode: 'cycles', rolloverCycles: bad }))).toContain(
        'rollover_cycles_invalid',
      )
    }
  })

  it('cycles mode enforces the same 20-year projection ceiling', () => {
    // 4 rungs × 90 d → longest term 360 d; 36 renewals ≈ 36 years.
    expect(codes(form({ rolloverMode: 'cycles', rolloverCycles: '36' }))).toContain(
      'rollover_cycles_too_far',
    )
    expect(codes(form({ rolloverMode: 'cycles', rolloverCycles: '19' }))).toEqual([])
  })

  it('horizon mode validates order, 20-year cap, and the cycle-count guard', () => {
    expect(
      buildScenario(form({ rolloverMode: 'horizon', rolloverHorizon: '2028-07-26' })).input
        .rollover,
    ).toEqual({ mode: 'horizon', horizonDate: '2028-07-26' })
    expect(codes(form({ rolloverMode: 'horizon', rolloverHorizon: '2026-07-26' }))).toContain(
      'rollover_horizon_before_start',
    )
    expect(codes(form({ rolloverMode: 'horizon', rolloverHorizon: '2047-01-01' }))).toContain(
      'rollover_horizon_too_far',
    )
    // spacing 5 over ~2 years → 146 renewals for the shortest rung: too many.
    expect(
      codes(form({ rolloverMode: 'horizon', rolloverHorizon: '2028-07-26', spacingDays: '5' })),
    ).toContain('rollover_too_many_cycles')
  })
})

describe('buildScenario — entities, allocation, ceiling', () => {
  const twoEntities = [
    { id: 'e1', name: 'Entidad A' },
    { id: 'e2', name: 'Entidad B' },
  ]

  it('parses the ceiling like capital and rejects an empty field', () => {
    expect(buildScenario(form({})).input.fiscal.insuranceCeiling).toBe(50_000_000)
    expect(buildScenario(form({ ceiling: '0' })).input.fiscal.insuranceCeiling).toBe(0)
    expect(codes(form({ ceiling: '' }))).toContain('ceiling_invalid')
  })

  it('assigns rungs to entities from the allocation, defaulting to the first', () => {
    const { input } = buildScenario(
      form({ entities: twoEntities, allocation: ['e1', 'e2'] }),
    )
    expect(input.rungs.map((r) => r.entityId)).toEqual(['e1', 'e2', 'e1', 'e1'])
  })

  it('stale allocation entries pointing at a removed entity fall back to the first', () => {
    const { input, issues } = buildScenario(
      form({ entities: twoEntities, allocation: ['gone', 'e2'] }),
    )
    expect(issues).toEqual([])
    expect(input.rungs[0].entityId).toBe('e1')
    expect(input.rungs[1].entityId).toBe('e2')
  })

  it('blank entity names never block the math — fallback name plus a soft issue', () => {
    const f = form({ entities: [{ id: 'e1', name: 'Entidad A' }, { id: 'e2', name: '   ' }] })
    const { input, issues } = buildScenario(f)
    expect(issues).toEqual([])
    expect(input.entities[1].name).toBe('Entidad 2')
    expect(entitySoftIssues(f)[1]?.code).toBe('entity_name_empty')
  })

  it('duplicate names (trimmed, case-folded) get a soft issue on later occurrences only', () => {
    const f = form({
      entities: [
        { id: 'e1', name: 'Banco X' },
        { id: 'e2', name: '  banco x ' },
      ],
    })
    const soft = entitySoftIssues(f)
    expect(soft[0]).toBeUndefined()
    expect(soft[1]?.code).toBe('entity_name_duplicate')
    // Soft: the scenario still computes.
    expect(buildScenario(f).issues).toEqual([])
  })
})

describe('fieldForPath', () => {
  it('maps engine paths back to form fields', () => {
    expect(fieldForPath('rungs[2].principal')).toBe('capital')
    expect(fieldForPath('rungs[0].days')).toBe('spacingDays')
    expect(fieldForPath('rungs[1].ea')).toBe('ea')
    expect(fieldForPath('fiscal.retencionRate')).toBe('retencion')
    expect(fieldForPath('startDate')).toBe('startDate')
    expect(fieldForPath('unknown.path')).toBeNull()
  })
})

describe('initialForm', () => {
  it('prefills the labeled example scenario with today as start date', () => {
    const f = initialForm()
    expect(f.capital).toBe('50.000.000')
    expect(f.retencion).toBe('4')
    expect(f.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
