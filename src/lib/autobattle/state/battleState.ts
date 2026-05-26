import { resolveCharacterData } from 'lib/autobattle/characterData/characterDataRegistry'
import { buildPreBuiltActionsForSlot } from 'lib/autobattle/damage/actionBuilder'
import {
  buildSlotResolvers,
  type SlotResolverState,
} from 'lib/autobattle/damage/contextBuilder'
import { avFromSpd, createClock } from 'lib/autobattle/scheduler/avQueue'
import { createEnemyState } from 'lib/autobattle/state/enemy'
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

  for (const inputMember of input.team) {
    const characterData = resolveCharacterData(inputMember.characterId)
    const tendency = resolveTendency(inputMember.characterId, inputMember.path)
    const actors: ActorId[] = [{ slot: inputMember.slot, kind: 'primary' }]
    if (characterData.memo) {
      actors.push({ slot: inputMember.slot, kind: 'memo', entityName: characterData.memo.entityName })
    }

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
      // Filled in below once the slot's resolver state is primed (buildResolvers=true).
      // Mock-resolver tests leave this at 0; they don't exercise ERR-accurate timing.
      errPercent: 0,
      tendency,
      characterData,
      actors,
    }
    members[inputMember.slot] = member

    // Primary clock at baseSpd. Memo clocks per characterData.memo.spdSource.
    const primaryClock = createClock(actors[0], inputMember.baseSpd)
    // Battle-start AV advance traces (e.g. Robin's Coloratura Cadenza, +25%). Applied before
    // any tick; clamps at 0 for >=100% advance (the unit acts on the first scheduler loop).
    if (characterData.battleStartAvAdvance) {
      const delta = characterData.battleStartAvAdvance * primaryClock.remainingAv
      primaryClock.remainingAv = Math.max(0, primaryClock.remainingAv - delta)
    }
    clocks.push(primaryClock)
    if (characterData.memo && actors[1]) {
      const memoSpd = computeMemoSpd(member)
      member.memoSpd = memoSpd
      clocks.push(createClock(actors[1], memoSpd))
    }
  }

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

      // Snapshot ERR once per slot. Runs the stat-only portion of the resolver pipeline
      // against the slot's BASIC action (any action would do — ERR is action-level, same
      // value across abilities of the same character). Mirrors damageRunner.runActionPipeline
      // minus the hit-damage compute step.
      const member = members[slot]
      if (member) {
        member.errPercent = snapshotErr(slotState, preBuiltActions, slot)
      }
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
  }

  // Battle-start bonus energy (technique-style grants). Applied via changeEnergy so ERR
  // scaling matches in-combat gains.
  for (const slot of (Object.keys(members) as unknown as SlotIndex[])) {
    const member = members[slot]
    if (!member) continue
    const bonus = member.characterData.battleStartBonusEnergy
    if (bonus) changeEnergy(state.resources, member, bonus)
  }

  return { state, slotResolvers }
}

// Runs the stats-only portion of the damage pipeline on this slot's BASIC action so the
// action-level ERR stat (relics + light cone + traces + always-on conditionals) populates
// x.a. Returns ERR as a decimal (e.g. 0.30 for 30%). Returns 0 if no BASIC action exists.
function snapshotErr(
  slotState: SlotResolverState,
  preBuiltActions: BattleState['preBuiltActions'],
  slot: SlotIndex,
): number {
  const primaryKey = serializeActorId({ slot, kind: 'primary' })
  const action = preBuiltActions[primaryKey]?.[AbilityKind.BASIC]
  if (!action) return 0

  const { x, context } = slotState
  x.clearRegisters()
  x.setConfig(action.config)
  x.setPrecompute(action.precomputedStats.a)
  calculateBasicEffects(x, action, context)
  calculateComputedStats(x, action, context)
  return x.getSelfValue(StatKey.ERR)
}

// Memo SPD resolution: prefer explicit characterData.memo.entitySpd (e.g. Numby=80,
// Netherwing=165) over the older 'entityDefinition' fallback. When entitySpd is unset and
// the source is 'entityDefinition', we fall back to the owner's baseSpd as a coarse
// approximation — slated to be replaced with a real EntityDefinition.memoBaseSpd{Flat,Scaling}
// read once that data is plumbed through the OptimizerContext at scheduler-init time.
// The { fromOwnerSpd } variant (Hyacine/Ica) works directly off member.baseSpd.
function computeMemoSpd(member: TeamMember): number {
  const memo = member.characterData.memo
  if (!memo) return member.baseSpd
  if (memo.entitySpd !== undefined) return memo.entitySpd
  if (memo.spdSource === 'entityDefinition') return member.baseSpd
  return member.baseSpd * memo.spdSource.fromOwnerSpd
}

export { avFromSpd }
