import { buildEquippedRelics } from 'lib/autobattle/relicConversion'
import type { CharacterBuild } from 'lib/autobattle/tests/integration/fixtures/buildFixtures'
import { buildRelicsForCharacter } from 'lib/autobattle/tests/integration/fixtures/buildFixtures'
import type { Parts } from 'lib/constants/constants'
import type { SimulationRelic } from 'lib/simulations/statSimulationTypes'
import type { CharacterId } from 'types/character'

// Materializes a per-character `equippedRelics` map (the shape AutobattleInput.team[]
// expects) from a build fixture. Routes through `RelicAugmenter.augment` and the production
// `relicToSimulationRelic` so the relic pipeline under test matches what the live UI uses.
export function loadEquippedRelics(build: CharacterBuild): Partial<Record<Parts, SimulationRelic>> {
  const augmentedByPart = buildRelicsForCharacter(build)
  return buildEquippedRelics(augmentedByPart)
}

// Index a list of character builds by characterId for cross-referencing with golden team
// data. Each golden team entry names a characterId; the build fixture provides the relics
// that character is wearing in the simulated scenario.
export function indexBuildsByCharacter(builds: CharacterBuild[]): Map<CharacterId, CharacterBuild> {
  const map = new Map<CharacterId, CharacterBuild>()
  for (const b of builds) map.set(b.characterId as CharacterId, b)
  return map
}
