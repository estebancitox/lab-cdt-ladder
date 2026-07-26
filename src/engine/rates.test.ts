import { describe, expect, it } from 'vitest'
import { periodRate } from './rates'

describe('periodRate — ACT/365 fixed', () => {
  it('365-day term recovers the E.A. only approximately (float), same code path', () => {
    // Measured: Math.pow(1.12, 365/365) - 1 === 0.1200000000000001, not 0.12.
    for (const ea of [0, 0.01, 0.135, 0.5]) {
      expect(periodRate(ea, 365)).toBeCloseTo(ea, 12)
    }
  })

  it('360-day term compounds, it does not pro-rate linearly', () => {
    const r = periodRate(0.12, 360)
    expect(r).toBeCloseTo(0.1182626074812847, 12)
    const linear = (0.12 * 360) / 365
    expect(Math.abs(r - linear)).toBeGreaterThan(5e-5)
  })

  it('730-day term equals (1+EA)^2 − 1, not 2×EA', () => {
    const r = periodRate(0.12, 730)
    expect(r).toBeCloseTo(Math.pow(1.12, 2) - 1, 12)
    expect(r).toBeCloseTo(0.2544, 10)
    expect(Math.abs(r - 0.24)).toBeGreaterThan(0.01)
  })

  it('366-day term yields slightly more than the E.A. (365 denominator is fixed)', () => {
    expect(periodRate(0.12, 366)).toBeGreaterThan(0.12)
    expect(periodRate(0.12, 366)).toBeCloseTo(Math.pow(1.12, 366 / 365) - 1, 15)
  })

  it('E.A. of 0 % gives exactly zero for any term', () => {
    for (const days of [1, 90, 360, 365, 730]) {
      expect(periodRate(0, days)).toBe(0)
    }
  })
})
