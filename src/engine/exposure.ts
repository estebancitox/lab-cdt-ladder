import type { Entity, EntityExposure, RungResult } from './types'

/**
 * Aggregate computed rungs per entity and compare against the insurance
 * ceiling. All inputs are already peso-rounded integers (cash-event policy),
 * so the comparison is integer-exact. The warning is strict (> ceiling):
 * exactly-at-ceiling is compliant. A ceiling of 0 means "no coverage" and
 * flags any positive exposure.
 */
export function entityExposures(
  entities: Entity[],
  rungs: RungResult[],
  ceiling: number,
): EntityExposure[] {
  const byEntity = new Map<string, { principal: number; grossInterest: number }>()
  for (const r of rungs) {
    const acc = byEntity.get(r.entityId) ?? { principal: 0, grossInterest: 0 }
    acc.principal += r.principal
    acc.grossInterest += r.grossInterest
    byEntity.set(r.entityId, acc)
  }
  return entities
    .filter((e) => byEntity.has(e.id))
    .map((e) => {
      const { principal, grossInterest } = byEntity.get(e.id)!
      const exposure = principal + grossInterest
      const excess = Math.max(0, exposure - ceiling)
      return {
        entityId: e.id,
        entityName: e.name,
        principal,
        grossInterest,
        exposure,
        ceiling,
        exceeded: exposure > ceiling,
        excess,
      }
    })
}
