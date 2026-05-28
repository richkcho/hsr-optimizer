import { resolveCharacterData } from 'lib/autobattle/characterData/characterDataRegistry'
import { buildPreBuiltActionsForSlot } from 'lib/autobattle/damage/actionBuilder'
import {
  buildSlotResolvers,
  type SlotResolverState,
} from 'lib/autobattle/damage/contextBuilder'
import { advancePercent, avFromSpd, createClock } from 'lib/autobattle/scheduler/avQueue'
import { createEnemyState } from 'lib/autobattle/state/enemy'
import { applyBuffGrant, resolveTargets } from 'lib/autobattle/state/grants'
import { createLedger } from 'lib/autobattle/state/ledger'
import { changeEnergy, createResourceState } from 'lib/autobattle/state/resources'
import { resolveTendency } from 'lib/autobattle/tendencies/tendencyRegistry'
import {
  type ActorClock,
  type ActorId,
  type AutobattleInput,
  type BattleState,
  type SlotIndex,
  type TeamMember,
} from 'lib/autobattle/types'
import { calculateBasicEffects, calculateComputedStats } from 'lib/optimization/calculateStats'
import { StatKey } from 'lib/optimization/engine/config/keys'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import { serializeActorId } from 'lib/autobattle/types'

export interface InitialBattleStateResult {
  state: BattleState
  // Per-slot c/x/teammate-assignment for the damage runner. Kept off BattleState because
  // ComputedStatsContainer + BasicStatsArray are large and not serializable.
  slotResolvers: Partial<Record<SlotIndex, SlotResolverState>>
}

export function createInitialBattleState(
  input: AutobattleInput,
  options?: { buildResolvers?: boolean },
): InitialBattleStateResult {
  const members = {} as Record<SlotIndex, TeamMember>
  const clocks: ActorClock[] = []

  // Resolver state requires Metadata.initialize() to have been called. Tests that exercise
  // only the scheduler (with the mock resolver) can opt out by passing buildResolvers: false.
  const buildResolvers = options?.buildResolvers ?? false
  const contexts = {} as BattleState['contexts']
  const preBuiltActions = {} as BattleState['preBuiltActions']
  let slotResolvers: Partial<Record<SlotIndex, SlotResolverState>> = {}
  if (buildResolvers) {
    const built = buildSlotResolvers(input)
    slotResolvers = built.states
    for (const slot of Object.keys(slotResolvers) as unknown as SlotIndex[]) {
      const slotState = slotResolvers[slot]
      if (!slotState) continue
      contexts[slot] = slotState.context
      Object.assign(preBuiltActions, buildPreBuiltActionsForSlot({ slot, kind: 'primary' }, slotState.context))
    }
  }

  for (const inputMember of input.team) {
    const characterData = resolveCharacterData(inputMember.characterId)
    const tendency = resolveTendency(inputMember.characterId, inputMember.path)
    const actors: ActorId[] = [{ slot: inputMember.slot, kind: 'primary' }]
    if (characterData.memo) {
      actors.push({
        slot: inputMember.slot,
        kind: characterData.memo.actorKind ?? 'memo',
        entityName: characterData.memo.entityName,
      })
    }

    // Snapshot stats from the resolver pipeline — captures relic main+sub + traces + LC +
    // always-on conditional bonuses. Mock-resolver tests (buildResolvers=false) fall back
    // to baseSpd and errPercent=0 since they don't exercise gear-accurate timing.
    const slotState = slotResolvers[inputMember.slot]
    const snap = slotState ? snapshotMemberStats(slotState, preBuiltActions, inputMember.slot) : null
    const errPercent = snap?.err ?? 0
    const effectiveSpd = snap?.spd ?? inputMember.baseSpd

    const member: TeamMember = {
      slot: inputMember.slot,
      characterId: inputMember.characterId,
      eidolon: inputMember.eidolon,
      lightConeId: inputMember.lightConeId,
      lightConeSuperimposition: inputMember.lightConeSuperimposition,
      equippedRelics: inputMember.equippedRelics,
      path: inputMember.path,
      maxEnergy: inputMember.maxEnergy,
      baseSpd: inputMember.baseSpd,
      errPercent,
      tendency,
      characterData,
      actors,
    }
    members[inputMember.slot] = member

    // Primary clock at effective SPD (snapshotted with all gear/buff bonuses). Memo clocks
    // per characterData.memo.spdSource — fromOwnerSpd variants ride on the same effective SPD.
    const primaryClock = createClock(actors[0], effectiveSpd)
    // Battle-start AV advance traces (e.g. Robin's Coloratura Cadenza, +25%). Applied before
    // any tick; clamps at 0 for >=100% advance (the unit acts on the first scheduler loop).
    if (characterData.battleStartAvAdvance) {
      const delta = characterData.battleStartAvAdvance * primaryClock.remainingAv
      primaryClock.remainingAv = Math.max(0, primaryClock.remainingAv - delta)
    }
    clocks.push(primaryClock)
    if (characterData.memo && actors[1]) {
      const memoSpd = computeMemoSpd(member, effectiveSpd)
      member.memoSpd = memoSpd
      clocks.push(createClock(actors[1], memoSpd))
    }
  }

  const state: BattleState = {
    enemy: createEnemyState(input.enemies, input.enemySpd),
    totalAv: input.totalAv,
    elapsedAv: 0,
    mainDpsSlot: input.mainDpsSlot,
    members,
    clocks,
    resources: createResourceState(members, input.startingEnergyPercent),
    activeBuffs: [],
    ledger: createLedger(),
    log: [],
    contexts,
    preBuiltActions,
    kitOverrideEnemyWeaknessBroken: snapshotKitEnemyWeaknessBroken(preBuiltActions),
  }

  // Battle-start bonus energy (technique-style grants). Applied via changeEnergy so ERR
  // scaling matches in-combat gains. Legacy self-only field — for team-wide / per-ally
  // wave-start energy see grantsEnergyOnBattleStart below.
  for (const slot of (Object.keys(members) as unknown as SlotIndex[])) {
    const member = members[slot]
    if (!member) continue
    const bonus = member.characterData.battleStartBonusEnergy
    if (bonus) changeEnergy(state.resources, member, bonus)
  }

  // Wave-start grants — analog of grantsXxxOnAction for the one-shot fire at sim-init.
  // Apply order: advance first (so subsequent buff queries see updated clocks), then energy,
  // then buffs. Stacks additively on top of the legacy battleStartAvAdvance trace above.
  for (const slot of (Object.keys(members) as unknown as SlotIndex[])) {
    const member = members[slot]
    if (!member) continue
    const advanceGrant = member.characterData.grantsAdvanceOnBattleStart
    if (advanceGrant) {
      for (const target of resolveTargets(state, member, advanceGrant.target)) {
        advancePercent(state, target.slot, target.baseSpd, advanceGrant.avPercent)
      }
    }
    const energyGrant = member.characterData.grantsEnergyOnBattleStart
    if (energyGrant) {
      for (const target of resolveTargets(state, member, energyGrant.target)) {
        changeEnergy(state.resources, target, energyGrant.amount)
      }
    }
    for (const buffGrant of member.characterData.grantsBuffsOnBattleStart ?? []) {
      applyBuffGrant(state, member, buffGrant)
    }
  }

  return { state, slotResolvers }
}

// Runs the stats-only portion of the damage pipeline on this slot's BASIC action so the
// action-level stats (relics + light cone + traces + always-on conditionals) populate x.a.
// Returns the {err, spd} snapshot — ERR as a decimal (0.30 = 30%), SPD as the effective
// post-gear value used to initialize the scheduler clock. Returns null if no BASIC action.
function snapshotMemberStats(
  slotState: SlotResolverState,
  preBuiltActions: BattleState['preBuiltActions'],
  slot: SlotIndex,
): { err: number; spd: number } | null {
  const primaryKey = serializeActorId({ slot, kind: 'primary' })
  const action = preBuiltActions[primaryKey]?.[AbilityKind.BASIC]
  if (!action) return null

  const { x, context } = slotState
  x.clearRegisters()
  x.setConfig(action.config)
  x.setPrecompute(action.precomputedStats.a)
  calculateBasicEffects(x, action, context)
  calculateComputedStats(x, action, context)
  return {
    err: x.getSelfValue(StatKey.ERR),
    spd: x.getSelfValue(StatKey.SPD),
  }
}

// Captures action.config.enemyWeaknessBroken as set by the character/light-cone
// initializeConfigurationsContainer hooks (e.g. Feixiao's `weaknessBrokenUlt` toggle
// pre-sets ULT to true, modeling that her ULT itself breaks the target). The scheduler
// reads this back at resolve time and ORs with the live broken state so kit-defined
// "always broken" assumptions persist regardless of whether the enemy is currently broken.
function snapshotKitEnemyWeaknessBroken(
  preBuiltActions: BattleState['preBuiltActions'],
): BattleState['kitOverrideEnemyWeaknessBroken'] {
  const snapshot: BattleState['kitOverrideEnemyWeaknessBroken'] = {}
  for (const key of Object.keys(preBuiltActions)) {
    const byKind = preBuiltActions[key]
    if (!byKind) continue
    const slotSnap: Partial<Record<AbilityKind, boolean>> = {}
    for (const kind of Object.keys(byKind) as AbilityKind[]) {
      const action = byKind[kind]
      if (action) slotSnap[kind] = action.config.enemyWeaknessBroken === true
    }
    snapshot[key] = slotSnap
  }
  return snapshot
}

// Memo SPD resolution: prefer explicit characterData.memo.entitySpd (Numby=80,
// Netherwing=165) for entities with a fixed SPD baseline. The { fromOwnerSpd } variant
// (Hyacine/Ica) inherits proportionally from the owner's effective SPD — passed in here
// so the inheritance picks up gear/trace/LC bonuses rather than intrinsic baseSpd. When
// entitySpd is unset and spdSource is 'entityDefinition', we fall back to the owner's
// effective SPD as a coarse approximation until EntityDefinition.memoBaseSpd{Flat,Scaling}
// is plumbed through OptimizerContext at scheduler-init time.
function computeMemoSpd(member: TeamMember, ownerEffectiveSpd: number): number {
  const memo = member.characterData.memo
  if (!memo) return ownerEffectiveSpd
  if (memo.entitySpd !== undefined) return memo.entitySpd
  if (memo.spdSource === 'entityDefinition') return ownerEffectiveSpd
  return ownerEffectiveSpd * memo.spdSource.fromOwnerSpd
}

export { avFromSpd }
