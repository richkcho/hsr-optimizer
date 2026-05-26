import { Parts, type StatsValues } from 'lib/constants/constants'
import { BasicStatToKey } from 'lib/optimization/basicStatsArray'
import type { SimulationRelic } from 'lib/simulations/statSimulationTypes'
import { precisionRound } from 'lib/utils/mathUtils'
import { isFlat } from 'lib/utils/statUtils'
import type { Relic } from 'types/relic'

// Converts an importer-format Relic (with raw-percent substats and decimal augmentedStats)
// into the autobattle resolver's compact SimulationRelic.condensedStats shape (everything in
// decimal form, indexed by BasicStatToKey). Used both by the live useAutobattleController
// (relic store → autobattle input) and by integration tests that load Kel-Z fixtures.
export function relicToSimulationRelic(relic: Relic): SimulationRelic {
  const condensedStats: [number, number][] = []
  for (const substat of relic.substats) {
    const key = BasicStatToKey[substat.stat]
    // Relic.substats values are in raw percentage form (e.g. 4.32 for 4.32% ATK%);
    // augmentedStats already divides them, but condensedStats is built off substats here.
    const scale = isFlat(substat.stat) ? 1 : 0.01
    condensedStats.push([key, precisionRound(substat.value * scale)])
  }
  if (relic.augmentedStats) {
    // augmentedStats.mainValue is already in decimal form (e.g. 0.194 for 19.4% ERR rope).
    condensedStats.push([
      BasicStatToKey[relic.augmentedStats.mainStat as StatsValues],
      relic.augmentedStats.mainValue,
    ])
  }
  return { set: relic.set, condensedStats }
}

// Resolves a character's six equipped relics into the parts-keyed SimulationRelic map that
// AutobattleInput.team[].equippedRelics expects. `relicsByPart` is typically built by the
// caller from a Relic[] indexed via relic.equippedBy + relic.part.
export function buildEquippedRelics(
  relicsByPart: Partial<Record<Parts, Relic>>,
): Partial<Record<Parts, SimulationRelic>> {
  const out: Partial<Record<Parts, SimulationRelic>> = {}
  for (const part of Object.values(Parts)) {
    const relic = relicsByPart[part]
    if (relic) out[part] = relicToSimulationRelic(relic)
  }
  return out
}
