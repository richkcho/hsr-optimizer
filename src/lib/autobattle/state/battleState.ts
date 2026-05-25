import { resolveCharacterData } from 'lib/autobattle/characterData/characterDataRegistry'
import { buildPreBuiltActionsForSlot } from 'lib/autobattle/damage/actionBuilder'
import {
  buildSlotResolvers,
  type SlotResolverState,
} from 'lib/autobattle/damage/contextBuilder'
import { avFromSpd, createClock } from 'lib/autobattle/scheduler/avQueue'
import { createEnemyState } from 'lib/autobattle/state/enemy'
import { createLedger } from 'lib/autobattle/state/ledger'
import { createResourceState } from 'lib/autobattle/state/resources'
import { resolveTendency } from 'lib/autobattle/tendencies/tendencyRegistry'
import {
  type ActorClock,
  type ActorId,
  type AutobattleInput,
  type BattleState,
  type SlotIndex,
  type TeamMember,
} from 'lib/autobattle/types'

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
      tendency,
      characterData,
      actors,
    }
    members[inputMember.slot] = member

    // Primary clock at baseSpd. Memo clocks per characterData.memo.spdSource.
    clocks.push(createClock(actors[0], inputMember.baseSpd))
    if (characterData.memo && actors[1]) {
      const memoSpd = computeMemoSpd(member)
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
    }
  }

  const state: BattleState = {
    enemy: createEnemyState(input.enemyCount, input.enemySpd, input.enemyMaxToughness ?? 100),
    totalAv: input.totalAv,
    elapsedAv: 0,
    mainDpsSlot: input.mainDpsSlot,
    members,
    clocks,
    resources: createResourceState(members),
    activeBuffs: [],
    ledger: createLedger(),
    log: [],
    contexts,
    preBuiltActions,
  }

  return { state, slotResolvers }
}

// Memo SPD resolution for Phase B uses only the characterData.memo.spdSource field. The
// 'entityDefinition' case (e.g. Aglaea/Castorice) requires reading the character's
// EntityDefinition memoBase fields, which depends on Phase C's OptimizerContext — for Phase B
// it falls back to the parent's baseSpd. The { fromOwnerSpd } variant works fully now.
function computeMemoSpd(member: TeamMember): number {
  const source = member.characterData.memo?.spdSource
  if (!source) return member.baseSpd
  if (source === 'entityDefinition') return member.baseSpd
  return member.baseSpd * source.fromOwnerSpd
}

export { avFromSpd }
