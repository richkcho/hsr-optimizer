import type { ActorId, BattleState } from 'lib/autobattle/types'
import type { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

export interface AbilityResolution {
  totalDmg: number
  perHit: number[]
  // Damage attributed to a different slot (DoT applier) or via a different ability kind.
  // Used so we can credit Numby's hits to Topaz slot, Lightning Lord to JingYuan, etc.
  // Phase C populates this from sourceEntity + ability tags. Phase B leaves empty.
  attributions?: { actor: ActorId; kind: AbilityKind; dmg: number }[]
}

export interface DamageResolver {
  resolve(state: BattleState, actor: ActorId, kind: AbilityKind): AbilityResolution
}

// Phase B's mock resolver: every ability deals a fixed amount. Used by tests and by the
// initial UI run so we can validate scheduling without depending on the full damage pipeline.
// The exact numbers are arbitrary but distinct so tests can assert per-source attribution.
export function createMockDamageResolver(perKind?: Partial<Record<AbilityKind, number>>): DamageResolver {
  const defaults: Partial<Record<AbilityKind, number>> = {
    BASIC: 100,
    SKILL: 250,
    ULT: 1000,
    FUA: 150,
  } as unknown as Partial<Record<AbilityKind, number>>
  const map = { ...defaults, ...perKind }
  return {
    resolve(_state, _actor, kind) {
      const dmg = map[kind] ?? 0
      return { totalDmg: dmg, perHit: [dmg] }
    },
  }
}
