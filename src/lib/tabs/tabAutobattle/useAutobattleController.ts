import type {
  AutobattleInput,
  SlotIndex,
  TeamMemberInput,
} from 'lib/autobattle/types'
import { SLOT_INDEXES } from 'lib/autobattle/types'
import { runAutobattleViaWorker } from 'lib/autobattle/worker/autobattleWorkerRunner'
import { useAutobattleStore } from 'lib/stores/autobattle/autobattleStore'
import { getGameMetadata } from 'lib/state/gameMetadata'
import { useCallback } from 'react'
import type { CharacterId } from 'types/character'

interface CharacterMetaForSim {
  baseSpd: number
  maxEnergy: number
  path: TeamMemberInput['path']
}

function readCharacterMeta(characterId: CharacterId): CharacterMetaForSim | null {
  const metadata = getGameMetadata()
  const character = metadata.characters?.[characterId]
  if (!character) return null
  return {
    baseSpd: character.stats?.SPD ?? 100,
    maxEnergy: character.max_sp ?? 100,
    path: character.path,
  }
}

export function useAutobattleController() {
  const runSimulation = useCallback(async () => {
    const state = useAutobattleStore.getState()
    const teamInputs: TeamMemberInput[] = []
    for (const slot of SLOT_INDEXES) {
      const characterId = state.team[slot]
      if (!characterId) continue
      const meta = readCharacterMeta(characterId)
      if (!meta) {
        useAutobattleStore.getState().setError(`Missing metadata for ${characterId}`)
        return
      }
      teamInputs.push({
        slot,
        characterId,
        eidolon: 0,
        lightConeId: '' as TeamMemberInput['lightConeId'],
        lightConeSuperimposition: 1,
        equippedRelicIds: {},
        baseSpd: meta.baseSpd,
        maxEnergy: meta.maxEnergy,
        path: meta.path,
      })
    }
    if (teamInputs.length === 0) {
      useAutobattleStore.getState().setError('Pick at least one character')
      return
    }

    const input: AutobattleInput = {
      team: teamInputs,
      mainDpsSlot: state.mainDpsSlot,
      enemyCount: state.enemyCount,
      enemySpd: state.enemySpd,
      totalAv: state.totalAv,
    }

    useAutobattleStore.getState().setLoading(true)
    useAutobattleStore.getState().setError(null)
    try {
      const result = await runAutobattleViaWorker(input)
      useAutobattleStore.getState().setResult(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      useAutobattleStore.getState().setError(message)
    }
  }, [])

  const loadDefaultTestTeam = useCallback((slotCharacterIds: Partial<Record<SlotIndex, CharacterId>>) => {
    const { setSlot } = useAutobattleStore.getState()
    for (const slot of SLOT_INDEXES) {
      setSlot(slot, slotCharacterIds[slot])
    }
  }, [])

  return { runSimulation, loadDefaultTestTeam }
}
