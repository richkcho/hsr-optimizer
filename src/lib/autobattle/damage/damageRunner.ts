import type { ActorId, BattleState, SlotIndex } from 'lib/autobattle/types'
import { serializeActorId } from 'lib/autobattle/types'
import { applyTeamBuffsForActor } from 'lib/autobattle/damage/teamBuffApplier'
import type { SlotResolverState } from 'lib/autobattle/damage/contextBuilder'
import { calculateBaseMultis } from 'lib/optimization/calculateDamage'
import {
  calculateBasicEffects,
  calculateComputedStats,
} from 'lib/optimization/calculateStats'
import { resetConditionalState } from 'lib/optimization/conditionalStateUtils'
import { OutputTag } from 'lib/optimization/engine/config/tag'
import { getDamageFunction } from 'lib/optimization/engine/damage/damageCalculator'
import type { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import type { Hit } from 'types/hitConditionalTypes'
import type { OptimizerAction } from 'types/optimizer'

export interface AbilityResolution {
  totalDmg: number
  perHit: number[]
  // Damage attributed to a different slot (DoT applier) or via a different ability kind.
  // Phase C leaves empty — Phase D+ may split memo-entity damage into a separate ledger entry.
  attributions?: { actor: ActorId; kind: AbilityKind; dmg: number }[]
}

export interface DamageResolver {
  resolve(state: BattleState, actor: ActorId, kind: AbilityKind): AbilityResolution
  // Runs a single hit by hit-template reference (used by DoT ticks against an applier's
  // already-built action).
  resolveHit?(state: BattleState, applierSlot: SlotIndex, kind: AbilityKind, hitIndex: number): number
}

export interface CreateRealResolverOptions {
  slotStates: Partial<Record<SlotIndex, SlotResolverState>>
}

// Real resolver wired to the optimizer's damage pipeline. Mirrors simulateBuild.ts:132-170.
// Each call: applyTeamBuffs → resetConditionalState → setPrecompute → calculateBasicEffects →
// calculateComputedStats → calculateBaseMultis → for each hit, getDamageFunction(...).apply(...).
export function createRealDamageResolver(opts: CreateRealResolverOptions): DamageResolver {
  return {
    resolve(state, actor, kind) {
      const slot = actor.slot
      const slotState = opts.slotStates[slot]
      if (!slotState) return { totalDmg: 0, perHit: [] }

      const action = state.preBuiltActions[serializeActorId({ slot, kind: 'primary' })]?.[kind]
      if (!action || !action.hits) return { totalDmg: 0, perHit: [] }

      runActionPipeline(state, actor, action, slotState)
      return collectActionDamage(action.hits, action, slotState)
    },
    resolveHit(state, applierSlot, kind, hitIndex) {
      const slotState = opts.slotStates[applierSlot]
      if (!slotState) return 0
      const action = state.preBuiltActions[serializeActorId({ slot: applierSlot, kind: 'primary' })]?.[kind]
      if (!action || !action.hits || hitIndex < 0 || hitIndex >= action.hits.length) return 0

      runActionPipeline(state, { slot: applierSlot, kind: 'primary' }, action, slotState)
      const hit = action.hits[hitIndex]
      return getDamageFunction(hit.damageFunctionType).apply(slotState.x, action, hitIndex, slotState.context)
    },
  }
}

// Re-export mock for tests that need it (e.g. avQueue/scheduler unit tests).
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

// ---------------------------------------------------------------------------
// Pipeline helpers
// ---------------------------------------------------------------------------

function runActionPipeline(
  state: BattleState,
  actor: ActorId,
  action: OptimizerAction,
  slotState: SlotResolverState,
): void {
  applyTeamBuffsForActor(state, actor, action, slotState.teammateSlotByBattleSlot)
  resetConditionalState(action)

  const { context, x } = slotState
  x.clearRegisters()
  x.setConfig(action.config)
  x.setPrecompute(action.precomputedStats.a)

  calculateBasicEffects(x, action, context)
  calculateComputedStats(x, action, context)
  calculateBaseMultis(x, action, context)
}

function collectActionDamage(
  hits: Hit[],
  action: OptimizerAction,
  slotState: SlotResolverState,
): AbilityResolution {
  const { context, x } = slotState
  const perHit: number[] = []
  let totalDmg = 0

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]
    const dmg = getDamageFunction(hit.damageFunctionType).apply(x, action, i, context)
    x.setHitRegisterValue(hit.registerIndex, dmg)
    perHit.push(dmg)
    if (hit.recorded !== false && hit.outputTag === OutputTag.DAMAGE) {
      totalDmg += dmg
    }
  }

  return { totalDmg, perHit }
}
