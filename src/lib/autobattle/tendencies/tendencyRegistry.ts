import { archetypeRegistry } from 'lib/autobattle/tendencies/archetypes'
import { PATH_TO_ARCHETYPE } from 'lib/autobattle/tendencies/pathDefault'
import type { Tendency } from 'lib/autobattle/types'
import type { PathName } from 'lib/constants/constants'
import type { CharacterId } from 'types/character'

// Per-character overrides populated in Phase D+. Each one is a full Tendency value
// (typically composed from an archetype via spread).
const overrides: Partial<Record<CharacterId, Tendency>> = {}

export function registerTendency(id: CharacterId, tendency: Tendency): void {
  overrides[id] = tendency
}

export function resolveTendency(characterId: CharacterId, path: PathName): Tendency {
  const override = overrides[characterId]
  if (override) return override
  return archetypeRegistry[PATH_TO_ARCHETYPE[path]]
}
