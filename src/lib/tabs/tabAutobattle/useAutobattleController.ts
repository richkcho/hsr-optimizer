import type {
  AutobattleInput,
  SlotIndex,
  TeamMemberInput,
} from 'lib/autobattle/types'
import { SLOT_INDEXES } from 'lib/autobattle/types'
import { runAutobattleViaWorker } from 'lib/autobattle/worker/autobattleWorkerRunner'
import { Parts } from 'lib/constants/constants'
import { BasicStatToKey } from 'lib/optimization/basicStatsArray'
import type { SimulationRelic } from 'lib/simulations/statSimulationTypes'
import { useAutobattleStore } from 'lib/stores/autobattle/autobattleStore'
import {
  getCharacterById,
} from 'lib/stores/character/characterStore'
import { getRelicById } from 'lib/stores/relic/relicStore'
import { getGameMetadata } from 'lib/state/gameMetadata'
import { isFlat } from 'lib/utils/statUtils'
import { precisionRound } from 'lib/utils/mathUtils'
import { useCallback } from 'react'
import type { CharacterId } from 'types/character'
import type { Relic } from 'types/relic'
import type { StatsValues } from 'lib/constants/constants'

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

function relicToSimulationRelic(relic: Relic): SimulationRelic {
  const condensedStats: [number, number][] = []
  for (const substat of relic.substats) {
    const key = BasicStatToKey[substat.stat]
    const scale = isFlat(substat.stat) ? 1 : 0.01
    condensedStats.push([key, precisionRound(substat.value * scale)])
  }
  if (relic.augmentedStats) {
    condensedStats.push([
      BasicStatToKey[relic.augmentedStats.mainStat as StatsValues],
      relic.augmentedStats.mainValue,
    ])
  }
  return { set: relic.set, condensedStats }
}

function resolveEquippedRelics(characterId: CharacterId): Partial<Record<Parts, SimulationRelic>> {
  const character = getCharacterById(characterId)
  const equipped = character?.equipped
  if (!equipped) return {}
  const result: Partial<Record<Parts, SimulationRelic>> = {}
  for (const part of Object.values(Parts)) {
    const relicId = equipped[part]
    if (!relicId) continue
    const relic = getRelicById(relicId)
    if (!relic) continue
    result[part] = relicToSimulationRelic(relic)
  }
  return result
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
      const character = getCharacterById(characterId)
      const form = character?.form
      teamInputs.push({
        slot,
        characterId,
        eidolon: (form?.characterEidolon ?? 0) as TeamMemberInput['eidolon'],
        lightConeId: (form?.lightCone ?? '') as TeamMemberInput['lightConeId'],
        lightConeSuperimposition: form?.lightConeSuperimposition ?? 1,
        equippedRelics: resolveEquippedRelics(characterId),
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
