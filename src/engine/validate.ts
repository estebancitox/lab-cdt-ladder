import { parseISODate } from './dates'
import type { ScenarioInput, ValidationIssue } from './types'

/**
 * Returns issues instead of throwing: the UI shows them next to the fields.
 * Rates are fractions here — the UI converts from % at its own boundary, and
 * anything > 1 is rejected to catch percent-passed-as-fraction mistakes.
 */
export function validateScenario(input: ScenarioInput): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  try {
    parseISODate(input.startDate)
  } catch {
    issues.push({
      code: 'start_date_invalid',
      path: 'startDate',
      message: 'La fecha de inicio no es válida.',
    })
  }

  if (input.rungs.length === 0) {
    issues.push({
      code: 'rungs_empty',
      path: 'rungs',
      message: 'Agrega al menos un peldaño.',
    })
  }

  input.rungs.forEach((r, i) => {
    const at = `rungs[${i}]`
    if (!Number.isSafeInteger(r.principal) || r.principal <= 0) {
      issues.push({
        code: 'principal_invalid',
        path: `${at}.principal`,
        message: 'El monto debe ser un entero en pesos, mayor que cero.',
      })
    }
    if (!Number.isInteger(r.days) || r.days <= 0) {
      issues.push({
        code: 'days_invalid',
        path: `${at}.days`,
        message: 'El plazo debe ser un número entero de días, mayor que cero.',
      })
    }
    if (!Number.isFinite(r.ea) || r.ea < 0 || r.ea > 1) {
      issues.push({
        code: 'ea_out_of_range',
        path: `${at}.ea`,
        message: 'La tasa E.A. debe estar entre 0 % y 100 %.',
      })
    }
    if (!r.entityId) {
      issues.push({
        code: 'entity_missing',
        path: `${at}.entityId`,
        message: 'Cada peldaño necesita una entidad.',
      })
    }
  })

  if (input.dayCountBase !== 360 && input.dayCountBase !== 365) {
    issues.push({
      code: 'day_count_base_invalid',
      path: 'dayCountBase',
      message: 'La base de liquidación debe ser 360 o 365.',
    })
  }

  const f = input.fiscal
  if (!Number.isFinite(f.retencionRate) || f.retencionRate < 0 || f.retencionRate >= 1) {
    issues.push({
      code: 'retencion_out_of_range',
      path: 'fiscal.retencionRate',
      message: 'La retención debe ser de 0 % o más y menor que 100 %.',
    })
  }
  if (!Number.isSafeInteger(f.insuranceCeiling) || f.insuranceCeiling < 0) {
    issues.push({
      code: 'ceiling_invalid',
      path: 'fiscal.insuranceCeiling',
      message: 'El tope del seguro debe ser un entero en pesos, cero o mayor.',
    })
  }

  return issues
}
