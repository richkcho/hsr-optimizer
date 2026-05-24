import { resolveCharacterData } from 'lib/autobattle/characterData/characterDataRegistry'
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

export function createInitialBattleState(input: AutobattleInput): BattleState {
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
      equippedRelicIds: inputMember.equippedRelicIds,
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

  return {
    enemy: createEnemyState(input.enemyCount, input.enemySpd),
    totalAv: input.totalAv,
    elapsedAv: 0,
    mainDpsSlot: input.mainDpsSlot,
    members,
    clocks,
    resources: createResourceState(members),
    activeBuffs: [],
    ledger: createLedger(),
    log: [],
    contexts: {} as BattleState['contexts'],            // populated in Phase C
    preBuiltActions: {} as BattleState['preBuiltActions'], // populated in Phase C
  }
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
