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
import { StatKey } from 'lib/optimization/engine/config/keys'
import { OutputTag } from 'lib/optimization/engine/config/tag'
import { getDamageFunction } from 'lib/optimization/engine/damage/damageCalculator'
import type { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import type { Hit } from 'types/hitConditionalTypes'
import type { OptimizerAction } from 'types/optimizer'

export interface AbilityResolution {
  totalDmg: number
  perHit: number[]
  // Sum of hit.toughnessDmg across the action's recorded hits. Fed into the scheduler's
  // break detection — only the breaking attack is credited with break damage.
  toughnessDmg: number
  // Damage attributed to a different slot (DoT applier) or via a different ability kind.
  // Phase C leaves empty — Phase D+ may split memo-entity damage into a separate ledger entry.
  attributions?: { actor: ActorId; kind: AbilityKind; dmg: number }[]
}

export interface DamageResolver {
  resolve(state: BattleState, actor: ActorId, kind: AbilityKind): AbilityResolution
  // Runs a single hit by hit-template reference (used by DoT ticks against an applier's
  // already-built action).
  resolveHit?(state: BattleState, applierSlot: SlotIndex, kind: AbilityKind, hitIndex: number): number
  // Computes break damage credited to the breaking attacker. Caller must ensure
  // `resolve()` (or `resolveHit()`) was just invoked for this slot/kind so the slot's
  // ComputedStatsContainer is primed with the right action's hit-level values.
  // Optional because mock resolvers in tests may not implement it.
  resolveBreak?(state: BattleState, applierSlot: SlotIndex): number
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
      if (!slotState) return { totalDmg: 0, perHit: [], toughnessDmg: 0 }

      const action = state.preBuiltActions[serializeActorId({ slot, kind: 'primary' })]?.[kind]
      if (!action || !action.hits) return { totalDmg: 0, perHit: [], toughnessDmg: 0 }

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
    resolveBreak(_state, applierSlot) {
      const slotState = opts.slotStates[applierSlot]
      if (!slotState) return 0
      return computeBreakDamage(slotState)
    },
  }
}

// Inline break-damage formula. Mirrors `BreakDamageFunction.apply` in
// optimization/engine/damage/damageCalculator.ts:315 so we keep a single canonical
// reference, with two v1 simplifications:
//   - Hit-level dmg_boost is treated as 1 (no contribution from break-tagged
//     DMG_BOOST buffs like NeverForgetHerFlame). Action-level stats are picked up
//     via hitIndex=0; they're identical across hits within an action.
//   - specialScaling and trueDmgModifier default to 1/0 (no character-specific
//     break multipliers). Bosses with break-amped abilities will read slightly
//     low here until we wire per-hit break overrides.
// Caller must have just invoked `resolve()` for this slot so x is primed.
function computeBreakDamage(slotState: SlotResolverState): number {
  const { x, context } = slotState
  const hitIndex = 0

  const defPen = x.getValue(StatKey.DEF_PEN, hitIndex)
  const resPen = x.getValue(StatKey.RES_PEN, hitIndex)
  const vuln = x.getValue(StatKey.VULNERABILITY, hitIndex)
  const finalDmgBoost = x.getValue(StatKey.FINAL_DMG_BOOST, hitIndex)
  const be = x.getValue(StatKey.BE, hitIndex)
  const trueDmgMod = x.getValue(StatKey.TRUE_DMG_MODIFIER, hitIndex)

  const baseUniversalMulti = 0.9    // attacker breaks the enemy — break dmg lands before broken state takes hold
  const defMulti = 100 / ((context.enemyLevel + 20) * (1 - defPen) + 100)
  const resMulti = 1 - (context.enemyDamageResistance - resPen)
  const vulnMulti = 1 + vuln
  const finalDmgMulti = 1 + finalDmgBoost
  const breakBaseMulti = 3767.5533 * context.elementalBreakScaling
    * (0.5 + context.enemyMaxToughness / 120)
  const beMulti = 1 + be
  const trueDmgMulti = 1 + trueDmgMod

  return baseUniversalMulti * defMulti * resMulti * vulnMulti * finalDmgMulti
    * breakBaseMulti * beMulti * trueDmgMulti
}

// Re-export mock for tests that need it (e.g. avQueue/scheduler unit tests).
export function createMockDamageResolver(
  perKind?: Partial<Record<AbilityKind, number>>,
  options?: { toughnessDmgPerHit?: Partial<Record<AbilityKind, number>>; breakDmg?: number },
): DamageResolver {
  const defaults: Partial<Record<AbilityKind, number>> = {
    BASIC: 100,
    SKILL: 250,
    ULT: 1000,
    FUA: 150,
  } as unknown as Partial<Record<AbilityKind, number>>
  const map = { ...defaults, ...perKind }
  const toughnessMap = options?.toughnessDmgPerHit ?? {}
  const breakDmg = options?.breakDmg ?? 0
  return {
    resolve(_state, _actor, kind) {
      const dmg = map[kind] ?? 0
      const toughnessDmg = toughnessMap[kind] ?? 0
      return { totalDmg: dmg, perHit: [dmg], toughnessDmg }
    },
    resolveBreak(_state, _applierSlot) {
      return breakDmg
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
  let toughnessDmg = 0

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]
    const dmg = getDamageFunction(hit.damageFunctionType).apply(x, action, i, context)
    x.setHitRegisterValue(hit.registerIndex, dmg)
    perHit.push(dmg)
    if (hit.recorded !== false && hit.outputTag === OutputTag.DAMAGE) {
      totalDmg += dmg
    }
    if (typeof hit.toughnessDmg === 'number') {
      toughnessDmg += hit.toughnessDmg
    }
  }

  return { totalDmg, perHit, toughnessDmg }
}
